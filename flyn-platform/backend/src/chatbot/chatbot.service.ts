import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FirebaseService } from '../firebase/firebase.service';
import { MailService } from '../mail/mail.service';
import { AssetsService } from '../assets/assets.service';
import { AgentService } from '../agents/agent.service';
import { RECA_SYSTEM_PROMPT } from '../contact/contact.knowledge-base';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateSalesInquiryDto } from './dto/create-sales-inquiry.dto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatbotSession {
  id: string;
  tenantId: string;
  visitorName: string;
  visitorEmail: string;
  status: 'active' | 'closed';
  createdAt: string;
  updatedAt: string;
  agentId?: string;
}

export interface ChatbotMessage {
  id: string;
  role: 'visitor' | 'agent';
  content: string;
  createdAt: string;
  isSalesIntent?: boolean;
  isEscalation?: boolean;
}

export interface ChatbotTicket {
  id: string;
  tenantId: string;
  sessionId?: string;
  visitorName: string;
  visitorEmail: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotSalesInquiry {
  id: string;
  tenantId: string;
  sessionId?: string;
  visitorName: string;
  visitorEmail: string;
  company?: string;
  message?: string;
  inquiryType: string;
  status: string;
  aiSummary?: string;
  leadScore?: number;
  createdAt: string;
  updatedAt: string;
}

// ── Sales + Escalation Detection ─────────────────────────────────────────────

// High-intent only — general "pricing" questions should NOT trigger the sales form
const SALES_HIGH_INTENT = [
  'enterprise',
  'reseller',
  'white-label',
  'white label',
  'whitelabel',
  'custom plan',
  'custom pricing',
  'custom quote',
  'book a demo',
  'book a call',
  'schedule a call',
  'schedule a demo',
  'talk to sales',
  'speak to sales',
  'speak with sales',
  'contact sales',
  'bulk license',
  'volume discount',
  'on-premise',
  'on premise',
  'private cloud',
  'dedicated instance',
  'partner program',
  'reseller program',
];

const ESCALATION_PHRASES = [
  'speak to a human',
  'talk to a human',
  'speak to an agent',
  'talk to an agent',
  'human agent',
  'connect you with',
  'real person',
  'live agent',
  'billing dispute',
  'data loss',
  'security incident',
  'unauthorized charge',
  'refund request',
];

const CHECKOUT_JSON_RE = /\{"__checkout"\s*:\s*true[^}]*\}/;

function detectSalesIntent(visitorMsg: string, aiReply: string): boolean {
  const combined = (visitorMsg + ' ' + aiReply).toLowerCase();
  return SALES_HIGH_INTENT.some((kw) => combined.includes(kw));
}

function detectEscalation(replyText: string): boolean {
  const lower = replyText.toLowerCase();
  return ESCALATION_PHRASES.some((ph) => lower.includes(ph));
}

function parseCheckoutFromReply(reply: string): {
  cleanReply: string;
  isBillingIntent: boolean;
  billingPlanId: string | null;
  billingInterval: 'monthly' | 'yearly';
} {
  const match = reply.match(CHECKOUT_JSON_RE);
  if (!match) {
    return { cleanReply: reply, isBillingIntent: false, billingPlanId: null, billingInterval: 'monthly' };
  }
  try {
    const parsed = JSON.parse(match[0]) as { __checkout: boolean; plan: string; interval: string };
    const cleanReply = reply.replace(CHECKOUT_JSON_RE, '').trim();
    return {
      cleanReply,
      isBillingIntent: true,
      billingPlanId: parsed.plan ?? null,
      billingInterval: parsed.interval === 'yearly' ? 'yearly' : 'monthly',
    };
  } catch {
    return { cleanReply: reply, isBillingIntent: false, billingPlanId: null, billingInterval: 'monthly' };
  }
}

// ── Knowledge Base Types ──────────────────────────────────────────────────────

export interface KBArticle {
  id: string;
  tenantId: string;
  title: string;
  category: string;
  content: string;
  excerpt: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly SESSIONS_COL = 'chatbot_sessions';
  private readonly TICKETS_COL = 'chatbot_tickets';
  private readonly SALES_COL = 'chatbot_sales_inquiries';
  private readonly KB_COL = 'knowledge_base_articles';

  private readonly genAI: GoogleGenerativeAI | null;
  private readonly geminiModel: ReturnType<
    GoogleGenerativeAI['getGenerativeModel']
  > | null;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly mail: MailService,
    private readonly assets: AssetsService,
    private readonly agentService: AgentService,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — chatbot AI replies disabled');
      this.genAI = null;
      this.geminiModel = null;
    } else {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // Default model uses RECA system prompt; per-agent prompt is applied dynamically in sendMessage
      this.geminiModel = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: RECA_SYSTEM_PROMPT,
      });
    }
  }

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialised');
    return db;
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  async createSession(
    dto: CreateSessionDto,
  ): Promise<{ sessionId: string; session: ChatbotSession; greeting: string; isResumed?: boolean; pastMessages?: ChatbotMessage[] }> {
    const db = this.db();
    const firstName = dto.visitorName.trim().split(' ')[0];

    // ── Try to resume a recent session (same visitor + tenant, < 24 h old) ──
    try {
      const recentSnap = await db
        .collection(this.SESSIONS_COL)
        .where('tenantId', '==', dto.tenantId)
        .where('visitorEmail', '==', dto.visitorEmail.toLowerCase().trim())
        .orderBy('updatedAt', 'desc')
        .limit(1)
        .get();

      if (!recentSnap.empty) {
        const recentSession = recentSnap.docs[0].data() as ChatbotSession;
        const ageHours = (Date.now() - new Date(recentSession.updatedAt).getTime()) / (1000 * 60 * 60);
        if (ageHours < 24) {
          const pastMessages = await this.getSessionMessages(recentSession.id);
          const greeting = `Welcome back, ${firstName}! 👋 I can see our previous conversation — feel free to continue from where we left off, or ask something new.`;
          return {
            sessionId: recentSession.id,
            session: recentSession,
            greeting,
            isResumed: true,
            pastMessages,
          };
        }
      }
    } catch (err) {
      this.logger.warn(`Session resume lookup failed: ${(err as Error).message}`);
    }

    // ── Create fresh session ──────────────────────────────────────────────────
    const sessionId = `cs_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // ── Resolve linked agent greeting ─────────────────────────────────────────
    let greeting = `Hi ${firstName}! 👋 I'm RECA, FLYN's AI assistant. I'm here to help with anything — pricing, features, integrations, or support. What can I help you with today?`;
    let resolvedAgentId: string | undefined;
    if (dto.agentId) {
      try {
        const agent = await this.agentService.getById(dto.agentId);
        // Replace {name} placeholder if present in the agent's firstMessage
        greeting = agent.firstMessage.replace(/\{name\}/gi, firstName);
        resolvedAgentId = agent.id;
      } catch {
        this.logger.warn(`Agent ${dto.agentId} not found — using default RECA greeting`);
      }
    }

    const session: ChatbotSession = {
      id: sessionId,
      tenantId: dto.tenantId,
      visitorName: dto.visitorName,
      visitorEmail: dto.visitorEmail.toLowerCase().trim(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      ...(resolvedAgentId ? { agentId: resolvedAgentId } : {}),
    };

    await db.collection(this.SESSIONS_COL).doc(sessionId).set(session);

    const greetingId = `msg_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db
      .collection(this.SESSIONS_COL)
      .doc(sessionId)
      .collection('messages')
      .doc(greetingId)
      .set({ id: greetingId, role: 'agent', content: greeting, createdAt: now });

    return { sessionId, session, greeting };
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async sendMessage(dto: SendMessageDto): Promise<{
    reply: string;
    sessionId: string;
    isSalesIntent: boolean;
    isEscalation: boolean;
    isBillingIntent: boolean;
    billingPlanId: string | null;
    billingInterval: 'monthly' | 'yearly';
  }> {
    const { sessionId, message } = dto;
    const db = this.db();

    // 1. Verify session
    const sessionRef = db.collection(this.SESSIONS_COL).doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists)
      throw new NotFoundException(`Session ${sessionId} not found`);

    // 2. Fetch existing messages BEFORE saving current (history for context)
    const msgsSnap = await db
      .collection(this.SESSIONS_COL)
      .doc(sessionId)
      .collection('messages')
      .get();

    const existingMessages = msgsSnap.docs
      .map((d) => d.data() as ChatbotMessage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-20);

    // 3. Load tenant knowledge base articles + custom training docs for context injection
    const sessionData = sessionSnap.data() as ChatbotSession;
    const [kbArticles, aiTrainingContext] = await Promise.all([
      this.getPublishedKBArticles(sessionData.tenantId),
      this.assets.getAITrainingDocsContext(sessionData.tenantId).catch(() => ''),
    ]);

    // 3b. Load recent cross-session history for this visitor (past sessions)
    let priorSessionContext = '';
    try {
      const pastSnap = await db
        .collection(this.SESSIONS_COL)
        .where('tenantId', '==', sessionData.tenantId)
        .where('visitorEmail', '==', sessionData.visitorEmail)
        .orderBy('updatedAt', 'desc')
        .limit(3)
        .get();

      const pastSessions = pastSnap.docs
        .map(d => d.data() as ChatbotSession)
        .filter(s => s.id !== sessionId);

      if (pastSessions.length > 0) {
        const priorLines: string[] = [];
        for (const past of pastSessions.slice(0, 2)) {
          const pastMsgsSnap = await db
            .collection(this.SESSIONS_COL)
            .doc(past.id)
            .collection('messages')
            .get();
          const pastMsgs = pastMsgsSnap.docs
            .map(d => d.data() as ChatbotMessage)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .slice(-8);
          if (pastMsgs.length > 0) {
            priorLines.push(`--- Session ${new Date(past.createdAt).toLocaleDateString()} ---`);
            pastMsgs.forEach(m => priorLines.push(`${m.role === 'visitor' ? 'Visitor' : 'RECA'}: ${m.content}`));
          }
        }
        if (priorLines.length > 0) {
          priorSessionContext = `[PRIOR CONVERSATION HISTORY — use this to personalise responses and continue naturally]\n${priorLines.join('\n')}\n[END PRIOR HISTORY]\n\n`;
        }
      }
    } catch (err) {
      this.logger.warn(`Cross-session history lookup failed: ${(err as Error).message}`);
    }

    // 4. Build Gemini history (visitor→user, agent→model)
    const history = this.buildGeminiHistory(existingMessages);

    // 5. Save visitor message to Firestore
    const visitorMsgId = `msg_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const visitorMsg: ChatbotMessage = {
      id: visitorMsgId,
      role: 'visitor',
      content: message,
      createdAt: new Date().toISOString(),
    };
    await db
      .collection(this.SESSIONS_COL)
      .doc(sessionId)
      .collection('messages')
      .doc(visitorMsgId)
      .set(visitorMsg);

    // 5. Call Gemini — inject KB articles as extra context if available
    //    If the session has a linked agent, use its systemPrompt dynamically.
    let reply = '';
    try {
      if (this.genAI) {
        // Resolve per-agent system prompt if session has an agentId
        let systemInstruction = RECA_SYSTEM_PROMPT;
        if (sessionData.agentId) {
          try {
            const linkedAgent = await this.agentService.getById(sessionData.agentId);
            if (linkedAgent.systemPrompt) {
              systemInstruction = linkedAgent.systemPrompt;
            }
          } catch {
            this.logger.warn(`Could not load agent ${sessionData.agentId} for prompt — using RECA default`);
          }
        }

        const activeModel = this.genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction,
        });

        let messageWithContext = message;
        const prefixParts: string[] = [];
        if (priorSessionContext) prefixParts.push(priorSessionContext);
        if (aiTrainingContext) prefixParts.push(aiTrainingContext);
        if (kbArticles.length > 0) {
          const kbContext = kbArticles.map(a => `### ${a.title}\n${a.content}`).join('\n\n');
          prefixParts.push(`[KNOWLEDGE BASE — use this to answer if relevant, cite the article title]\n${kbContext}`);
        }
        if (prefixParts.length > 0) {
          messageWithContext = `${prefixParts.join('\n\n')}\n\n[USER QUESTION]\n${message}`;
        }
        const chat = activeModel.startChat({ history });
        const result = await chat.sendMessage(messageWithContext);
        reply = result.response.text();
      } else {
        reply =
          "I'm having trouble connecting right now. Please try again in a moment or reach out to our support team directly.";
      }
    } catch (err) {
      this.logger.error(`Gemini error: ${(err as Error).message}`);
      reply =
        "I'm experiencing a technical issue. Please contact support@myflynai.com for immediate assistance.";
    }

    // 6. Detect intents — billing CTA is decided by Gemini, not keyword matching
    const { cleanReply, isBillingIntent, billingPlanId, billingInterval } = parseCheckoutFromReply(reply);
    reply = cleanReply;
    const isSalesIntent = detectSalesIntent(message, reply);
    const isEscalation = detectEscalation(reply);

    // 7. Save AI reply
    const agentMsgId = `msg_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const agentMsg: ChatbotMessage = {
      id: agentMsgId,
      role: 'agent',
      content: reply,
      createdAt: new Date().toISOString(),
      isSalesIntent,
      isEscalation,
    };
    await db
      .collection(this.SESSIONS_COL)
      .doc(sessionId)
      .collection('messages')
      .doc(agentMsgId)
      .set(agentMsg);

    // 8. Update session timestamp
    await sessionRef.update({ updatedAt: new Date().toISOString() });

    return { reply, sessionId, isSalesIntent, isEscalation, isBillingIntent, billingPlanId, billingInterval };
  }

  async getSessionMessages(sessionId: string): Promise<ChatbotMessage[]> {
    const snap = await this.db()
      .collection(this.SESSIONS_COL)
      .doc(sessionId)
      .collection('messages')
      .get();

    return snap.docs
      .map((d) => d.data() as ChatbotMessage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  async createTicket(dto: CreateTicketDto): Promise<{ ticketId: string }> {
    const ticketId = `ct_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const ticket: ChatbotTicket = {
      id: ticketId,
      tenantId: dto.tenantId,
      sessionId: dto.sessionId,
      visitorName: dto.visitorName,
      visitorEmail: dto.visitorEmail,
      subject: dto.subject,
      description: dto.description,
      status: 'open',
      priority: dto.priority ?? 'normal',
      createdAt: now,
      updatedAt: now,
    };

    await this.db().collection(this.TICKETS_COL).doc(ticketId).set(ticket);

    // Notify support team
    const adminEmail = process.env.ADMIN_EMAIL ?? 'support@myflynai.com';
    this.mail
      .sendEmail({
        to: adminEmail,
        subject: `[Chatbot Ticket] ${dto.subject}`,
        html: `<h3>New Support Ticket from Chatbot</h3>
        <p><strong>From:</strong> ${dto.visitorName} &lt;${dto.visitorEmail}&gt;</p>
        <p><strong>Priority:</strong> ${dto.priority ?? 'normal'}</p>
        <p><strong>Subject:</strong> ${dto.subject}</p>
        <p><strong>Description:</strong></p>
        <p>${dto.description.replace(/\n/g, '<br>')}</p>
        <p><strong>Ticket ID:</strong> ${ticketId}</p>`,
      })
      .catch((err: Error) => this.logger.error(`Ticket email failed: ${err.message}`));

    return { ticketId };
  }

  // ── Sales Inquiries ───────────────────────────────────────────────────────

  async createSalesInquiry(
    dto: CreateSalesInquiryDto,
  ): Promise<{ inquiryId: string }> {
    const inquiryId = `si_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    let aiSummary: string | undefined;
    let leadScore: number | undefined;

    // AI lead qualification via Gemini
    try {
      if (this.geminiModel) {
        const prompt = `Summarise this sales lead in 2-3 sentences for the FLYN sales team and give a lead score (1-100):
Name: ${dto.visitorName}
Email: ${dto.visitorEmail}
Company: ${dto.company ?? 'Not specified'}
Inquiry type: ${dto.inquiryType}
Message: ${dto.message ?? 'No message provided'}

Format your response as:
SUMMARY: [2-3 sentence summary]
SCORE: [number 1-100]`;

        const result = await this.geminiModel.generateContent(prompt);
        const text = result.response.text();
        aiSummary = text;
        const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
        if (scoreMatch) leadScore = parseInt(scoreMatch[1], 10);
      }
    } catch (err) {
      this.logger.error(`Lead qualification failed: ${(err as Error).message}`);
    }

    const inquiry: ChatbotSalesInquiry = {
      id: inquiryId,
      tenantId: dto.tenantId,
      sessionId: dto.sessionId,
      visitorName: dto.visitorName,
      visitorEmail: dto.visitorEmail,
      company: dto.company,
      message: dto.message,
      inquiryType: dto.inquiryType,
      status: 'new',
      aiSummary,
      leadScore,
      createdAt: now,
      updatedAt: now,
    };

    await this.db().collection(this.SALES_COL).doc(inquiryId).set(inquiry);

    // Notify sales team
    const salesEmail = process.env.ADMIN_EMAIL ?? 'sales@myflynai.com';
    this.mail
      .sendEmail({
        to: salesEmail,
        subject: `[Sales Lead] ${dto.inquiryType.toUpperCase()} inquiry from ${dto.visitorName}`,
        html: `<h3>New Sales Inquiry from Chatbot</h3>
        <p><strong>Name:</strong> ${dto.visitorName}</p>
        <p><strong>Email:</strong> ${dto.visitorEmail}</p>
        <p><strong>Company:</strong> ${dto.company ?? '—'}</p>
        <p><strong>Type:</strong> ${dto.inquiryType}</p>
        <p><strong>Message:</strong> ${dto.message ?? '—'}</p>
        ${leadScore ? `<p><strong>Lead Score:</strong> ${leadScore}/100</p>` : ''}
        ${aiSummary ? `<p><strong>AI Summary:</strong> ${aiSummary}</p>` : ''}
        <p><strong>Inquiry ID:</strong> ${inquiryId}</p>`,
      })
      .catch((err: Error) => this.logger.error(`Sales email failed: ${err.message}`));

    return { inquiryId };
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async getSessions(): Promise<ChatbotSession[]> {
    const snap = await this.db().collection(this.SESSIONS_COL).get();
    return snap.docs
      .map((d) => d.data() as ChatbotSession)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTickets(): Promise<ChatbotTicket[]> {
    const snap = await this.db().collection(this.TICKETS_COL).get();
    return snap.docs
      .map((d) => d.data() as ChatbotTicket)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getSalesInquiries(): Promise<ChatbotSalesInquiry[]> {
    const snap = await this.db().collection(this.SALES_COL).get();
    return snap.docs
      .map((d) => d.data() as ChatbotSalesInquiry)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getDashboardStats(): Promise<{
    sessionsToday: number;
    openTickets: number;
    salesLeads: number;
    escalations: number;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const [sessions, tickets, sales] = await Promise.all([
      this.db().collection(this.SESSIONS_COL).get(),
      this.db().collection(this.TICKETS_COL).get(),
      this.db().collection(this.SALES_COL).get(),
    ]);

    const sessionsToday = sessions.docs.filter((d) => {
      const data = d.data() as ChatbotSession;
      return data.createdAt >= todayIso;
    }).length;

    const openTickets = tickets.docs.filter((d) => {
      const data = d.data() as ChatbotTicket;
      return data.status === 'open' || data.status === 'in_progress';
    }).length;

    const salesLeads = sales.docs.length;

    // Escalations = tickets created via chatbot (proxy metric — avoids subcollection scan)
    const escalations = tickets.docs.filter((d) => {
      const data = d.data() as ChatbotTicket;
      return !!data.sessionId;
    }).length;

    return { sessionsToday, openTickets, salesLeads, escalations };
  }

  // ── Knowledge Base CRUD ──────────────────────────────────────────────────

  async getPublicConfig(tenantId: string): Promise<{ chatbotAgent: string | null; voiceProvider: string | null }> {
    const db = this.firebase.firestore();
    if (!db) return { chatbotAgent: null, voiceProvider: null };
    const snap = await db.collection('tenants').doc(tenantId).get().catch(() => null);
    if (!snap?.exists) return { chatbotAgent: null, voiceProvider: null };
    const data = snap.data() as any;
    return {
      chatbotAgent: data?.aiConfig?.chatbotAgent ?? null,
      voiceProvider: data?.aiConfig?.voiceProvider ?? null,
    };
  }

  async getKBArticles(tenantId?: string): Promise<KBArticle[]> {
    const col = this.db().collection(this.KB_COL);
    const snap = tenantId
      ? await col.where('tenantId', '==', tenantId).get()
      : await col.get();
    return snap.docs.map(d => d.data() as KBArticle)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getPublishedKBArticles(tenantId: string): Promise<KBArticle[]> {
    const snap = await this.db().collection(this.KB_COL)
      .where('tenantId', '==', tenantId)
      .where('isPublished', '==', true).get();
    return snap.docs.map(d => d.data() as KBArticle);
  }

  async createKBArticle(tenantId: string, data: { title: string; category: string; content: string; excerpt?: string }): Promise<KBArticle> {
    const id = `kb_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const article: KBArticle = {
      id, tenantId,
      title: data.title,
      category: data.category,
      content: data.content,
      excerpt: data.excerpt || data.content.slice(0, 160),
      isPublished: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.db().collection(this.KB_COL).doc(id).set(article);
    return article;
  }

  async updateKBArticle(tenantId: string, id: string, data: Partial<KBArticle>): Promise<KBArticle> {
    const ref = this.db().collection(this.KB_COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.tenantId !== tenantId) {
      throw new NotFoundException(`Article ${id} not found`);
    }
    const updated = { ...snap.data(), ...data, id, tenantId, updatedAt: new Date().toISOString() } as KBArticle;
    await ref.set(updated);
    return updated;
  }

  async deleteKBArticle(tenantId: string, id: string): Promise<void> {
    const ref = this.db().collection(this.KB_COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.tenantId !== tenantId) {
      throw new NotFoundException(`Article ${id} not found`);
    }
    await ref.delete();
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private buildGeminiHistory(messages: ChatbotMessage[]) {
    type GeminiContent = { role: 'user' | 'model'; parts: { text: string }[] };
    const history: GeminiContent[] = messages.map((m) => ({
      role: m.role === 'visitor' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    // Gemini requires history to start with 'user'
    while (history.length > 0 && history[0].role === 'model') {
      history.shift();
    }

    // Ensure strict alternation — deduplicate consecutive same-role turns
    const clean: GeminiContent[] = [];
    for (const msg of history) {
      if (clean.length === 0 || clean[clean.length - 1].role !== msg.role) {
        clean.push(msg);
      }
    }

    return clean;
  }
}
