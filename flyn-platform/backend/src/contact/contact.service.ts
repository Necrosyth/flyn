import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { FirebaseService } from '../firebase/firebase.service';
import { MailService } from '../mail/mail.service';
import { SubmitContactDto } from './dto/submit-contact.dto';
import { StartChatDto } from './dto/start-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateContactFormDto } from './dto/update-contact-form.dto';
import {
  ContactLocation,
  LiveAgent,
  STATIC_LOCATIONS,
  STATIC_AGENTS,
} from './data/contact.seed';
import { RECA_SYSTEM_PROMPT } from './contact.knowledge-base';

export type { ContactLocation, LiveAgent };

export interface ChatMessage {
  id: string;
  chat_id: string;
  sender_type: 'visitor' | 'agent';
  message: string;
  created_at: string;
}

const DEPT_EMAILS: Record<string, string> = {
  general: 'hello@myflynai.com',
  support: 'support@myflynai.com',
  sales: 'sales@myflynai.com',
  careers: 'careers@myflynai.com',
  brand: 'brand@myflynai.com',
};

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly FORMS_COL = 'contact_forms';
  private readonly LOCATIONS_COL = 'contact_locations';
  private readonly AGENTS_COL = 'live_agents';
  private readonly CHATS_COL = 'live_chats';
  private readonly SUBSCRIBERS_COL = 'contact_subscribers';

  constructor(
    private readonly firebase: FirebaseService,
    private readonly mail: MailService,
  ) {}

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialised');
    return db;
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async getLocations(country?: string, department?: string): Promise<ContactLocation[]> {
    try {
      const snap = await this.db().collection(this.LOCATIONS_COL).get();
      const data: ContactLocation[] = snap.empty
        ? STATIC_LOCATIONS
        : snap.docs.map(d => ({ ...d.data(), id: d.id } as ContactLocation));
      return this.filterLocations(data, country, department);
    } catch {
      return this.filterLocations(STATIC_LOCATIONS, country, department);
    }
  }

  private filterLocations(locs: ContactLocation[], country?: string, department?: string): ContactLocation[] {
    return locs.filter(l => {
      if (country && l.country_code.toUpperCase() !== country.toUpperCase()) return false;
      if (department && department !== 'all' && l.department !== department) return false;
      return true;
    }).sort((a, b) => a.country.localeCompare(b.country));
  }

  async getCountries(): Promise<{ country: string; country_code: string }[]> {
    const locs = await this.getLocations();
    const seen = new Set<string>();
    const countries: { country: string; country_code: string }[] = [];
    for (const l of locs) {
      if (!seen.has(l.country_code)) {
        seen.add(l.country_code);
        countries.push({ country: l.country, country_code: l.country_code });
      }
    }
    return countries.sort((a, b) => a.country.localeCompare(b.country));
  }

  // ── Agents ─────────────────────────────────────────────────────────────────

  async getAgents(department?: string): Promise<LiveAgent[]> {
    try {
      const snap = await this.db().collection(this.AGENTS_COL).get();
      const data: LiveAgent[] = snap.empty
        ? STATIC_AGENTS
        : snap.docs.map(d => ({ ...d.data(), id: d.id } as LiveAgent));
      return department
        ? data.filter(a => a.department === department)
        : data;
    } catch {
      return department
        ? STATIC_AGENTS.filter(a => a.department === department)
        : STATIC_AGENTS;
    }
  }

  // ── Contact Form Submit ─────────────────────────────────────────────────────

  async submitContactForm(dto: SubmitContactDto): Promise<{ success: boolean; ticketId: string }> {
    const ticketId = `contact_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const record = {
      id: ticketId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      country: dto.country,
      subject: dto.subject,
      message: dto.message,
      department: dto.department,
      priority: dto.priority,
      status: 'new',
      created_at: now,
      updated_at: now,
    };

    try {
      await this.db().collection(this.FORMS_COL).doc(ticketId).set(record);
    } catch (err) {
      this.logger.error(`Failed to save contact form: ${(err as Error).message}`);
    }

    this.sendConfirmation(dto.email, dto.name, ticketId).catch(() => {});
    this.routeToTeam(record).catch(() => {});
    if (dto.priority === 'urgent') {
      this.notifyAdminUrgent(record).catch(() => {});
    }

    return { success: true, ticketId };
  }

  // ── Admin: List Contact Forms ──────────────────────────────────────────────

  async listContactForms(opts: { status?: string; department?: string; limit?: number } = {}): Promise<Record<string, unknown>[]> {
    try {
      let query: FirebaseFirestore.Query = this.db().collection(this.FORMS_COL).orderBy('created_at', 'desc');
      if (opts.status) query = query.where('status', '==', opts.status);
      if (opts.department) query = query.where('department', '==', opts.department);
      if (opts.limit) query = query.limit(opts.limit);
      const snap = await query.get();
      return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    } catch (err) {
      this.logger.error(`Failed to list contact forms: ${(err as Error).message}`);
      return [];
    }
  }

  // ── Admin: Update & Delete Contact Form ────────────────────────────────────

  async updateContactForm(id: string, dto: UpdateContactFormDto): Promise<void> {
    const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (dto.status !== undefined) update.status = dto.status;
    if (dto.response !== undefined) update.response = dto.response;
    if (dto.assigned_to !== undefined) update.assigned_to = dto.assigned_to;
    if (dto.status === 'resolved') update.resolved_at = new Date().toISOString();
    await this.db().collection(this.FORMS_COL).doc(id).update(update);
  }

  async deleteContactForm(id: string): Promise<void> {
    await this.db().collection(this.FORMS_COL).doc(id).delete();
  }

  // ── Reply to Submission (Brevo SMTP or env fallback) ──────────────────────

  async replyToSubmission(id: string, params: { message: string; staffName?: string }): Promise<void> {
    const doc = await this.db().collection(this.FORMS_COL).doc(id).get();
    if (!doc.exists) throw new Error(`Submission ${id} not found`);
    const sub = doc.data() as Record<string, any>;

    const staffName = params.staffName || 'Support Team';
    const ticketRef = id.substring(0, 8).toUpperCase();
    const subject = `Re: ${sub.subject || 'Your enquiry'} [Ticket #${ticketRef}]`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;color:#333;padding:20px;">
        <p>Hi ${sub.name || 'there'},</p>
        <div style="white-space:pre-wrap;margin:16px 0;padding:16px;background:#f5f5f5;border-radius:8px;border-left:4px solid #6366f1;">
          ${params.message.replace(/\n/g, '<br>')}
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
        <p style="font-size:12px;color:#666;">
          This is a reply to your enquiry: <em>"${sub.subject || ''}"</em><br/>
          Ticket ID: ${ticketRef}
        </p>
        <p style="font-size:12px;color:#999;margin-top:8px;">— ${staffName}</p>
      </div>`;

    // Try Brevo SMTP credentials from system settings
    const settingsDoc = await this.db().collection('platform_settings').doc('global').get();
    const brevo = (settingsDoc.data() as Record<string, any> | undefined)?.brevo as Record<string, string> | undefined;

    if (brevo?.smtpKey && brevo?.smtpUser) {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: { user: brevo.smtpUser, pass: brevo.smtpKey },
      });
      await transporter.sendMail({
        from: `"${brevo.fromName || staffName}" <${brevo.fromEmail || brevo.smtpUser}>`,
        to: sub.email,
        subject,
        html,
      });
      this.logger.log(`Brevo reply sent to ${sub.email} for submission ${id}`);
    } else {
      // Fall back to env-based MailService
      await this.mail.sendEmail({ to: sub.email, subject, html });
    }

    // Persist the reply and advance status
    await this.db().collection(this.FORMS_COL).doc(id).update({
      response: params.message,
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    });
  }

  // ── Live Chat ──────────────────────────────────────────────────────────────

  async startChat(dto: StartChatDto): Promise<{ chatId: string; agent: LiveAgent; messages: ChatMessage[] }> {
    const agents = await this.getAgents(dto.department);
    const available = agents
      .filter(a => a.is_available && a.current_chats < a.max_chats)
      .sort((a, b) => a.current_chats - b.current_chats);

    if (available.length === 0) {
      throw new Error('No agents available for this department');
    }

    const agent = available[0];
    const chatId = `chat_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const chatDoc = {
      id: chatId,
      visitor_name: dto.visitor_name,
      visitor_email: dto.visitor_email,
      agent_id: agent.id,
      department: dto.department,
      status: 'active',
      started_at: now,
      ended_at: null,
    };

    const welcomeMsg: ChatMessage = {
      id: `msg_${Date.now()}_${randomUUID().slice(0, 8)}`,
      chat_id: chatId,
      sender_type: 'agent',
      message: `Hi ${dto.visitor_name}! I'm ${agent.name} from the ${dto.department} team. How can I help you today?`,
      created_at: now,
    };

    try {
      await this.db().collection(this.CHATS_COL).doc(chatId).set(chatDoc);
      await this.db()
        .collection(this.CHATS_COL)
        .doc(chatId)
        .collection('messages')
        .doc(welcomeMsg.id)
        .set(welcomeMsg);
    } catch (err) {
      this.logger.error(`Failed to create chat session: ${(err as Error).message}`);
    }

    return { chatId, agent, messages: [welcomeMsg] };
  }

  async sendMessage(dto: SendMessageDto): Promise<{ messageId: string; aiReply?: ChatMessage }> {
    const messageId = `msg_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const msgDoc: ChatMessage = {
      id: messageId,
      chat_id: dto.chat_id,
      sender_type: dto.sender_type as 'visitor' | 'agent',
      message: dto.message,
      created_at: now,
    };

    try {
      await this.db()
        .collection(this.CHATS_COL)
        .doc(dto.chat_id)
        .collection('messages')
        .doc(messageId)
        .set(msgDoc);
    } catch (err) {
      this.logger.error(`Failed to save message: ${(err as Error).message}`);
    }

    let aiReply: ChatMessage | undefined;
    if (dto.sender_type === 'visitor') {
      aiReply = await this.generateAIReply(dto.chat_id);
    }

    return { messageId, ...(aiReply ? { aiReply } : {}) };
  }

  async getChatMessages(chatId: string): Promise<ChatMessage[]> {
    try {
      const snap = await this.db()
        .collection(this.CHATS_COL)
        .doc(chatId)
        .collection('messages')
        .get();
      return snap.docs
        .map(d => d.data() as ChatMessage)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    } catch (err) {
      this.logger.error(`Failed to get messages: ${(err as Error).message}`);
      return [];
    }
  }

  // ── Notifications Subscribe ────────────────────────────────────────────────

  async subscribeNotifications(email: string): Promise<{ success: boolean }> {
    const now = new Date().toISOString();
    // Use normalized email as document ID for upsert deduplication
    const docId = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    try {
      await this.db().collection(this.SUBSCRIBERS_COL).doc(docId).set(
        { id: docId, email: email.toLowerCase(), subscribed_at: now, created_at: now },
        { merge: true },
      );
    } catch (err) {
      this.logger.error(`Failed to subscribe: ${(err as Error).message}`);
    }
    return { success: true };
  }

  // ── Admin: Location CRUD ───────────────────────────────────────────────────

  async createLocation(data: Omit<ContactLocation, 'id'>): Promise<ContactLocation> {
    const id = `loc_${Date.now()}_${randomUUID().slice(0, 6)}`;
    const loc: ContactLocation = { ...data, id } as ContactLocation;
    await this.db().collection(this.LOCATIONS_COL).doc(id).set(loc);
    return loc;
  }

  async updateLocation(id: string, data: Partial<ContactLocation>): Promise<void> {
    await this.db().collection(this.LOCATIONS_COL).doc(id).update({ ...data, id });
  }

  async deleteLocation(id: string): Promise<void> {
    await this.db().collection(this.LOCATIONS_COL).doc(id).delete();
  }

  // ── Admin: Agent CRUD ──────────────────────────────────────────────────────

  async createAgent(data: Omit<LiveAgent, 'id'>): Promise<LiveAgent> {
    const id = `agent_${Date.now()}_${randomUUID().slice(0, 6)}`;
    const agent: LiveAgent = { ...data, id } as LiveAgent;
    await this.db().collection(this.AGENTS_COL).doc(id).set(agent);
    return agent;
  }

  async updateAgent(id: string, data: Partial<LiveAgent>): Promise<void> {
    await this.db().collection(this.AGENTS_COL).doc(id).update({ ...data, id });
  }

  async deleteAgent(id: string): Promise<void> {
    await this.db().collection(this.AGENTS_COL).doc(id).delete();
  }

  // ── Seed Data ──────────────────────────────────────────────────────────────

  async seedData(): Promise<{ locations: number; agents: number }> {
    const db = this.db();

    const locBatch = db.batch();
    for (const loc of STATIC_LOCATIONS) {
      locBatch.set(db.collection(this.LOCATIONS_COL).doc(loc.id), loc, { merge: true });
    }
    await locBatch.commit();

    const agentBatch = db.batch();
    for (const agent of STATIC_AGENTS) {
      agentBatch.set(db.collection(this.AGENTS_COL).doc(agent.id), agent, { merge: true });
    }
    await agentBatch.commit();

    this.logger.log(`Seeded ${STATIC_LOCATIONS.length} locations + ${STATIC_AGENTS.length} agents`);
    return { locations: STATIC_LOCATIONS.length, agents: STATIC_AGENTS.length };
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private async sendConfirmation(email: string, name: string, ticketId: string): Promise<void> {
    await this.mail.sendEmail({
      to: email,
      subject: `We've received your message — Ticket ${ticketId}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0a0a0b;border-radius:16px;color:#e5e7eb">
          <img src="https://myflynai.com/flyn_icon.png" width="44" height="44" alt="FLYN" style="margin-bottom:24px" />
          <h2 style="color:#fff;font-size:22px;margin:0 0 8px">Message received ✓</h2>
          <p style="color:#9ca3af;margin:0 0 24px">Hi ${name}, thanks for reaching out! Your request is in the queue.</p>
          <div style="background:#18181b;border-radius:12px;padding:20px;margin-bottom:24px">
            <p style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px">Ticket ID</p>
            <p style="color:#a78bfa;font-family:monospace;font-size:16px;font-weight:600;margin:0">${ticketId}</p>
          </div>
          <p style="color:#9ca3af;font-size:14px">We typically respond within <strong style="color:#e5e7eb">24 hours</strong>. Urgent requests are handled within 2 hours.</p>
          <hr style="border:none;border-top:1px solid #27272a;margin:24px 0" />
          <p style="color:#6b7280;font-size:13px;margin:0">— The FLYN AI Team · <a href="https://myflynai.com" style="color:#a78bfa;text-decoration:none">myflynai.com</a></p>
        </div>
      `,
    });
  }

  private async routeToTeam(record: Record<string, unknown>): Promise<void> {
    const toEmail = DEPT_EMAILS[record.department as string] ?? DEPT_EMAILS.general;
    await this.mail.sendEmail({
      to: toEmail,
      subject: `[${String(record.priority).toUpperCase()}] ${record.subject} · ${record.id}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0a0a0b;border-radius:16px;color:#e5e7eb">
          <h2 style="color:#fff;margin:0 0 20px">New Contact Form Submission</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#6b7280;padding:8px 0;font-size:14px;width:120px">From</td><td style="color:#e5e7eb;font-size:14px">${record.name} &lt;${record.email}&gt;</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0;font-size:14px">Phone</td><td style="color:#e5e7eb;font-size:14px">${record.phone || '—'}</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0;font-size:14px">Country</td><td style="color:#e5e7eb;font-size:14px">${record.country}</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0;font-size:14px">Department</td><td style="color:#e5e7eb;font-size:14px;text-transform:capitalize">${record.department}</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0;font-size:14px">Priority</td><td style="color:${record.priority === 'urgent' ? '#ef4444' : '#e5e7eb'};font-size:14px;font-weight:600;text-transform:uppercase">${record.priority}</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0;font-size:14px">Subject</td><td style="color:#e5e7eb;font-size:14px;font-weight:600">${record.subject}</td></tr>
          </table>
          <div style="background:#18181b;border-radius:12px;padding:20px;margin:20px 0">
            <p style="color:#e5e7eb;font-size:14px;line-height:1.7;white-space:pre-wrap;margin:0">${record.message}</p>
          </div>
          <p style="color:#6b7280;font-size:13px">Ticket: <code style="color:#a78bfa">${record.id}</code></p>
        </div>
      `,
    });
  }

  private async notifyAdminUrgent(record: Record<string, unknown>): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@myflynai.com';
    await this.mail.sendEmail({
      to: adminEmail,
      subject: `🚨 URGENT contact from ${record.name} — ${record.subject}`,
      html: `<p><strong>${record.name}</strong> (${record.email}) submitted an URGENT request:</p><p>${record.subject}</p><p>${record.message}</p><p>Ticket: ${record.id}</p>`,
    });
  }

  private async generateAIReply(chatId: string): Promise<ChatMessage | undefined> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return undefined;

    try {
      const snap = await this.db()
        .collection(this.CHATS_COL)
        .doc(chatId)
        .collection('messages')
        .get();

      const allMessages = snap.docs
        .map(d => d.data() as ChatMessage)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));

      // Build alternating user/assistant history (last 20 messages)
      const history = allMessages.slice(-20).map(m => ({
        role: (m.sender_type === 'visitor' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.message,
      }));

      // Claude requires conversation to start with a user turn
      while (history.length > 0 && history[0].role === 'assistant') {
        history.shift();
      }

      if (history.length === 0 || history[history.length - 1].role !== 'user') return undefined;

      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: RECA_SYSTEM_PROMPT,
          messages: history,
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          timeout: 15000,
        },
      );

      const replyText = (response.data?.content?.[0]?.text as string | undefined)?.trim();
      if (!replyText) return undefined;

      const replyId = `msg_${Date.now()}_${randomUUID().slice(0, 8)}`;
      const replyMsg: ChatMessage = {
        id: replyId,
        chat_id: chatId,
        sender_type: 'agent',
        message: replyText,
        created_at: new Date().toISOString(),
      };

      await this.db()
        .collection(this.CHATS_COL)
        .doc(chatId)
        .collection('messages')
        .doc(replyId)
        .set(replyMsg);

      return replyMsg;
    } catch (err) {
      this.logger.error(`RECA reply failed: ${(err as Error).message}`);
      return undefined;
    }
  }
}
