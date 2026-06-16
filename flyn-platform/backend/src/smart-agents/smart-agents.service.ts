/**
 * Smart Agent Addons — NestJS Service (Full Spec Implementation)
 * Spec: FLYN_AI_Smart_Agent_Addons_Spec.pdf
 */

import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AIProviderService } from '../orchestrator/ai-provider/ai-provider.service';
import { CalendarService } from '../calendar/calendar.service';
import { CrmService } from '../crm/crm.service';
import {
  AgentType, AgentConfig, AgentCompanyData, AgentActivity, AgentMetrics,
  LeadScoringRequest, LeadScore, DripStep, Campaign, ObjectionDetection, ABVariant,
  ContentCalendarEntry, ContentLibraryEntry, ContentType,
  SocialPost, SocialPlatform, SentimentResult, TrendAlert,
  BookingRequest, BookingRecord, FAQEntry, SupportCase, CaseType, EscalationPayload,
} from './smart-agents.types';

// ─── System Prompt Templates (spec §1-4) ──────────────────────────────────────

const SYSTEM_PROMPTS: Record<AgentType, string> = {
  marketing: `You are {{businessName}}'s AI Marketing Agent.
Industry: {{industry}}. Target audience: {{targetAudience}}.
Value proposition: {{uniqueValueProp}}. Products: {{mainProducts}}.
Price range: {{priceRange}}. Tone: {{tone}}. Language: {{language}}.
Your job: qualify leads, send drip sequences, and drive conversions.
Score leads 1–10 based on budget, timeline, and intent. Follow up warm leads (5–7) every 24h.
Convert hot leads (8–10) to booked appointments within 2 messages.`,

  content: `You are {{businessName}}'s AI Content Creator.
Industry: {{industry}} | Niche: {{niche}}.
Products/Services: {{mainProducts}}.
Target Audience: {{targetAudience}}.
Brand Tone: {{toneAdjectives}}.
Content Goals: {{contentGoals}}.
Signature Phrases: {{signaturePhrases}}.
Words/Phrases to Avoid: {{avoidPhrases}}.
Upcoming Promotions: {{upcomingPromotions}}.
Preferred Content Formats: {{contentFormats}}.
You produce ALL written content this company needs — in a consistent brand voice.`,

  social: `You are {{businessName}}'s AI Social Media Manager.
Industry: {{industry}}.
Connected Platforms: {{connectedPlatforms}}.
Posting Frequency: {{postingFrequency}} | Best Times: {{bestPostingTimes}}.
Brand Hashtag: {{brandHashtag}} | Industry Hashtags: {{industryHashtags}}.
Competitors to Monitor: {{competitors}}.
Community Reply Tone: {{communityTone}}.
Topics to Avoid: {{avoidTopics}}.
Escalation Contact: {{escalationWhatsapp}}.
You manage the company's full social media presence autonomously.`,

  frontdesk: `You are {{businessName}}'s AI Front Desk Agent.
Industry: {{industry}}. Services: {{services}}.
Website: {{website}}. WhatsApp: {{whatsappNumber}}. Tone: {{tone}}. Language: {{language}}.
Business Hours: {{businessHours}}.
Handle FAQs, book appointments, check order status, and escalate when needed (after 2 failed attempts).
After positive resolution, request a review: {{reviewLink}}.`,
};

function injectCompanyData(template: string, data: AgentCompanyData): string {
  const replacements: Record<string, string> = {
    '{{businessName}}': data.businessName || 'Your Business',
    '{{industry}}': data.industry || 'General',
    '{{niche}}': data.niche || '',
    '{{targetAudience}}': data.targetAudience || 'General audience',
    '{{uniqueValueProp}}': data.uniqueValueProp || '',
    '{{mainProducts}}': data.mainProducts || '',
    '{{priceRange}}': data.priceRange || '',
    '{{tone}}': data.tone || 'professional',
    '{{toneAdjectives}}': data.toneAdjectives || data.tone || 'professional',
    '{{language}}': data.language || 'English',
    '{{whatsappNumber}}': data.whatsappNumber || '',
    '{{website}}': data.website || '',
    '{{contentGoals}}': data.contentGoals || 'leads',
    '{{signaturePhrases}}': data.signaturePhrases || '',
    '{{avoidPhrases}}': data.avoidPhrases || '',
    '{{upcomingPromotions}}': data.upcomingPromotions || '',
    '{{contentFormats}}': data.contentFormats || 'WhatsApp, blog, short posts',
    '{{connectedPlatforms}}': data.connectedPlatforms || 'Instagram, LinkedIn, Facebook',
    '{{postingFrequency}}': data.postingFrequency || 'daily',
    '{{bestPostingTimes}}': data.bestPostingTimes || 'let the agent decide',
    '{{brandHashtag}}': data.brandHashtag || '',
    '{{industryHashtags}}': data.industryHashtags || '',
    '{{competitors}}': data.competitors || '',
    '{{communityTone}}': data.communityTone || 'casual',
    '{{avoidTopics}}': data.avoidTopics || '',
    '{{escalationWhatsapp}}': data.escalationWhatsapp || '',
    '{{businessHours}}': data.businessHours || 'Mon-Fri 9am-6pm',
    '{{services}}': data.services || data.mainProducts || '',
    '{{reviewLink}}': data.reviewLink || '',
  };
  return Object.entries(replacements).reduce(
    (tpl, [key, val]) => tpl.replaceAll(key, val), template
  );
}

// ─── In-memory fallback stores ────────────────────────────────────────────────

const memConfigs = new Map<string, AgentConfig>();
const memActivities: AgentActivity[] = [];
const memBookings = new Map<string, BookingRecord[]>();
const memFAQs = new Map<string, FAQEntry[]>();
const memCases = new Map<string, SupportCase[]>();
const memContent = new Map<string, ContentLibraryEntry[]>();
const memCampaigns = new Map<string, Campaign[]>();
const memPosts = new Map<string, SocialPost[]>();

function mkId() { return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

// ─── Escalation keywords (spec §4) ───────────────────────────────────────────

const ESCALATION_KEYWORDS = ['legal', 'lawyer', 'sue', 'report', 'fraud', 'police', 'refund refused', 'chargeback', 'scam'];
const OBJECTION_KEYWORDS = ['price', 'expensive', 'cost', 'budget', 'later', 'not now', 'think about', 'trust', 'reviews'];

@Injectable()
export class SmartAgentsService {
  private readonly logger = new Logger(SmartAgentsService.name);
  private readonly CONFIGS_COL = 'agent_configs';
  private readonly ACTIVITY_COL = 'agent_activity_log';
  private readonly CONTENT_COL = 'agent_content_library';
  private readonly BOOKINGS_COL = 'agent_bookings';
  // FAQs are stored in the SHARED knowledge base so they (a) appear in the
  // Asset Hub Knowledge Base UI and (b) feed the live inbox/voice AI, which both
  // read `knowledge_base_articles`. Mapping: question↔title, answer↔content.
  private readonly FAQS_COL = 'knowledge_base_articles';
  private readonly CASES_COL = 'agent_support_cases';
  private readonly CAMPAIGNS_COL = 'agent_campaigns';
  private readonly POSTS_COL = 'agent_social_posts';

  constructor(
    private readonly firebase: FirebaseService,
    private readonly ai: AIProviderService,
    private readonly calendar: CalendarService,
    private readonly crm: CrmService,
  ) {}

  private fs() { return this.firebase.firestore(); }

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT CONFIG (shared)
  // ═══════════════════════════════════════════════════════════════════════════

  async getConfig(tenantId: string, agentType: AgentType): Promise<AgentConfig> {
    const key = `${tenantId}_${agentType}`;
    const db = this.fs();
    if (db) {
      try {
        const doc = await db.collection(this.CONFIGS_COL).doc(key).get();
        if (doc.exists) return doc.data() as AgentConfig;
      } catch (e) { this.logger.warn('Firestore read failed', e); }
    }
    if (memConfigs.has(key)) return memConfigs.get(key)!;
    return { tenantId, agentType, active: false, model: 'gemini', onboardingComplete: false, companyData: {}, updatedAt: new Date().toISOString() };
  }

  async saveConfig(config: AgentConfig): Promise<AgentConfig> {
    const key = `${config.tenantId}_${config.agentType}`;
    config.updatedAt = new Date().toISOString();
    const db = this.fs();
    if (db) {
      try { await db.collection(this.CONFIGS_COL).doc(key).set(config, { merge: true }); return config; }
      catch (e) { this.logger.warn('Firestore write failed', e); }
    }
    memConfigs.set(key, config);
    return config;
  }

  async getAllConfigs(tenantId: string): Promise<AgentConfig[]> {
    const types: AgentType[] = ['marketing', 'content', 'social', 'frontdesk'];
    return Promise.all(types.map(t => this.getConfig(tenantId, t)));
  }

  async toggleAgent(tenantId: string, agentType: AgentType, active: boolean): Promise<AgentConfig> {
    const config = await this.getConfig(tenantId, agentType);
    config.active = active;
    await this.logActivity(tenantId, agentType, active ? 'Agent activated' : 'Agent deactivated', '', 'success');
    return this.saveConfig(config);
  }

  async updateCompanyData(tenantId: string, agentType: AgentType, data: Partial<AgentCompanyData>): Promise<AgentConfig> {
    const config = await this.getConfig(tenantId, agentType);
    config.companyData = { ...config.companyData, ...data };
    config.onboardingComplete = true;
    return this.saveConfig(config);
  }

  async updateModel(tenantId: string, agentType: AgentType, model: string): Promise<AgentConfig> {
    const config = await this.getConfig(tenantId, agentType);
    config.model = model as any;
    return this.saveConfig(config);
  }

  async getSystemPrompt(tenantId: string, agentType: AgentType): Promise<string> {
    const config = await this.getConfig(tenantId, agentType);
    return injectCompanyData(SYSTEM_PROMPTS[agentType], config.companyData);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVITY LOG (shared)
  // ═══════════════════════════════════════════════════════════════════════════

  async logActivity(tenantId: string, agentType: AgentType, action: string, detail: string, outcome: 'success' | 'pending' | 'failed'): Promise<void> {
    const entry: AgentActivity = { id: mkId(), tenantId, agentType, action, detail, outcome, timestamp: new Date().toISOString() };
    const db = this.fs();
    if (db) {
      try { await db.collection(this.ACTIVITY_COL).doc(entry.id).set(entry); return; }
      catch { /* fall through */ }
    }
    memActivities.unshift(entry);
    if (memActivities.length > 200) memActivities.splice(200);
  }

  async getActivityLog(tenantId: string, agentType?: AgentType, limit = 50): Promise<AgentActivity[]> {
    const db = this.fs();
    if (db) {
      try {
        let q: FirebaseFirestore.Query = db.collection(this.ACTIVITY_COL).where('tenantId', '==', tenantId);
        if (agentType) q = q.where('agentType', '==', agentType);
        // No orderBy → avoids a composite index; sort in memory.
        const snap = await q.limit(500).get();
        return snap.docs.map(d => d.data() as AgentActivity)
          .sort((a: any, b: any) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0))
          .slice(0, limit);
      } catch { /* fall through */ }
    }
    return memActivities.filter(a => a.tenantId === tenantId && (!agentType || a.agentType === agentType)).slice(0, limit);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METRICS (shared — per agent)
  // ═══════════════════════════════════════════════════════════════════════════

  async getMetrics(tenantId: string): Promise<AgentMetrics[]> {
    const activities = await this.getActivityLog(tenantId, undefined, 500);
    const bookings = await this.getBookings(tenantId);
    const cases = await this.getCases(tenantId);
    const content = await this.getContentLibrary(tenantId);
    const posts = await this.getPosts(tenantId);

    const mkt: AgentMetrics = {
      agentType: 'marketing',
      leadsScored: activities.filter(a => a.agentType === 'marketing' && a.action.startsWith('Lead scored')).length,
      hotLeads: activities.filter(a => a.agentType === 'marketing' && a.detail.includes('hot')).length,
      conversions: activities.filter(a => a.agentType === 'marketing' && a.action.includes('Booking')).length,
      campaignsSent: (memCampaigns.get(tenantId) || []).filter(c => c.status === 'completed').length,
    };
    const cnt: AgentMetrics = {
      agentType: 'content',
      piecesCreated: content.length,
      calendarDays: content.filter(c => c.contentType === 'calendar').length,
      faqsWritten: (memFAQs.get(tenantId) || []).length,
    };
    const soc: AgentMetrics = {
      agentType: 'social',
      postsPublished: posts.filter(p => p.status === 'published').length,
      postsScheduled: posts.filter(p => p.status === 'scheduled').length,
      sentimentAlerts: activities.filter(a => a.agentType === 'social' && a.action.includes('Escalation')).length,
    };
    const fd: AgentMetrics = {
      agentType: 'frontdesk',
      casesResolved: cases.filter(c => c.status === 'resolved').length,
      casesEscalated: cases.filter(c => c.status === 'escalated').length,
      bookingsCreated: bookings.length,
    };
    return [mkt, cnt, soc, fd];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKETING AGENT (spec §1)
  // ═══════════════════════════════════════════════════════════════════════════

  async scoreLead(req: LeadScoringRequest): Promise<LeadScore> {
    const systemPrompt = await this.getSystemPrompt(req.tenantId, 'marketing');
    // Spec scoring: +3 budget confirmed, +2 timeline <30d, +2 decision maker,
    // +1 replied within 1h, +1 clicked link, +1 asked specific question
    const li = req.leadInfo;
    const userMsg = `Score this lead 1–10. Return JSON: { score, tier ("hot"|"warm"|"cold"), reasoning, nextAction }.
Lead: Name=${li.name}, Budget=${li.budget||'unknown'}, Timeline=${li.timeline||'unknown'},
Message="${li.message||''}", Source=${li.source||'unknown'},
IsDecisionMaker=${li.isDecisionMaker||false}, RepliedWithin1h=${li.repliedWithinHour||false},
ClickedLink=${li.clickedLink||false}, AskedSpecificQuestion=${li.askedSpecificQuestion||false}.`;

    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ]);
        const match = resp.content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          const score: LeadScore = { score: Number(parsed.score)||5, tier: parsed.tier||'warm', reasoning: parsed.reasoning||'', nextAction: parsed.nextAction||'Follow up in 24h' };
          await this.logActivity(req.tenantId, 'marketing', `Lead scored: ${li.name}`, `Score: ${score.score}/10 (${score.tier})`, 'success');
          await this.syncLeadToCrm(req.tenantId, li, score);
          return score;
        }
      } catch (e) { this.logger.warn('AI lead scoring failed', e); }
    }

    // Heuristic fallback — spec formula
    let score = 0;
    const budget = (li.budget || '').toLowerCase();
    const timeline = (li.timeline || '').toLowerCase();
    if (budget.includes('ready') || budget.includes('approved') || budget.includes('confirmed')) score += 3;
    if (timeline.includes('immediately') || timeline.includes('asap') || timeline.includes('urgent') || timeline.includes('this month')) score += 2;
    if (li.isDecisionMaker) score += 2;
    if (li.repliedWithinHour) score += 1;
    if (li.clickedLink) score += 1;
    if (li.askedSpecificQuestion) score += 1;
    score = Math.max(1, Math.min(10, score || 5));
    const tier: 'hot' | 'warm' | 'cold' = score >= 7 ? 'hot' : score >= 4 ? 'warm' : 'cold';
    await this.logActivity(req.tenantId, 'marketing', `Lead scored: ${li.name}`, `Score: ${score}/10 (${tier})`, 'success');
    const result: LeadScore = { score, tier, reasoning: `Score based on budget (${li.budget||'unknown'}), timeline (${li.timeline||'unknown'}), and engagement signals.`, nextAction: tier === 'hot' ? 'Book a call immediately' : tier === 'warm' ? 'Send follow-up in 24h' : 'Add to nurture sequence' };
    await this.syncLeadToCrm(req.tenantId, li, result);
    return result;
  }

  /**
   * Push a scored lead into the CRM as a contact (Marketing → CRM integration).
   * Idempotent-ish: updates an existing contact matched by phone, else creates one.
   * Tags the contact with its tier + `ai-scored`, and maps the 1–10 score to 0–100.
   * Fail-soft — never blocks lead scoring if the CRM write fails.
   */
  private async syncLeadToCrm(tenantId: string, li: LeadScoringRequest['leadInfo'], score: LeadScore): Promise<void> {
    try {
      const crmScore = Math.round(score.score * 10);
      const tags = [`tier:${score.tier}`, 'ai-scored'];
      const phone = li.phone;
      const email = li.email;
      const existing = phone ? await this.crm.findContactByPhone(phone, tenantId).catch(() => null) : null;
      if (existing?._id) {
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...tags]));
        await this.crm.updateContact(existing._id, {
          score: crmScore,
          tags: mergedTags,
          status: score.tier === 'hot' ? 'qualified' : 'lead',
        } as any, tenantId);
      } else {
        await this.crm.createContact({
          name: li.name || 'Unknown Lead',
          email: email || '',
          phone: phone || undefined,
          status: score.tier === 'hot' ? 'qualified' : 'lead',
          score: crmScore,
          tags,
          source: li.source || 'ai-marketing',
          notes: score.reasoning,
        } as any, tenantId).catch((e) => this.logger.warn(`syncLeadToCrm create skipped: ${e?.message || e}`));
      }
      await this.logActivity(tenantId, 'marketing', `Lead synced to CRM: ${li.name}`, `Score ${crmScore}/100, tier ${score.tier}`, 'success');
    } catch (e: any) {
      this.logger.warn(`syncLeadToCrm failed (non-fatal): ${e?.message || e}`);
    }
  }

  async generateDripSequence(tenantId: string, tier: 'hot' | 'warm' | 'cold'): Promise<DripStep[]> {
    const systemPrompt = await this.getSystemPrompt(tenantId, 'marketing');
    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate a ${tier} lead follow-up drip sequence (3 steps) as JSON array. Each: { step, delayHours, channel ("whatsapp"|"sms"|"email"), message }.` },
        ]);
        const match = resp.content.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
      } catch { /* fall through */ }
    }
    // Spec fallback drips
    if (tier === 'hot') return [
      { step: 1, delayHours: 0, channel: 'whatsapp', message: 'Hi {{name}}! Thanks for reaching out. I\'d love to book a quick 15-min call — are you free today or tomorrow?' },
      { step: 2, delayHours: 4, channel: 'whatsapp', message: 'Hey {{name}}, just following up! Here\'s our calendar link: [BOOKING_LINK]. Pick any slot that works.' },
      { step: 3, delayHours: 24, channel: 'sms', message: 'Hi {{name}}, last reminder — limited slots this week. Book here: [BOOKING_LINK]' },
    ];
    if (tier === 'warm') return [
      { step: 1, delayHours: 0, channel: 'whatsapp', message: 'Hi {{name}}! Great to connect. Here\'s a quick overview of what we offer: [LINK]. Any questions?' },
      { step: 2, delayHours: 24, channel: 'email', message: 'Subject: Thought this might help\n\nHi {{name}},\n\nHere\'s a case study from a similar business: [LINK]\n\nHappy to chat whenever you\'re ready.\n\nBest,\n[Team]' },
      { step: 3, delayHours: 72, channel: 'whatsapp', message: 'Hi {{name}}, just checking in! Ready to explore how we can help? Reply YES.' },
    ];
    return [
      { step: 1, delayHours: 0, channel: 'email', message: 'Hi {{name}}, we miss you! Here\'s what\'s new: [LINK]' },
      { step: 2, delayHours: 72, channel: 'whatsapp', message: 'Hi {{name}}! What\'s your #1 challenge right now?' },
      { step: 3, delayHours: 168, channel: 'email', message: 'Hi {{name}}, no pressure — we\'re here when you\'re ready. [OFFER] expires soon.' },
    ];
  }

  async detectObjection(text: string): Promise<ObjectionDetection> {
    const keyword = OBJECTION_KEYWORDS.find(k => text.toLowerCase().includes(k));
    if (!keyword) return { detected: false };
    const responses: Record<string, string> = {
      price: 'I understand cost is a factor. We offer flexible plans starting at a very accessible price point — and most clients see ROI within the first month. Would it help to see a quick comparison?',
      expensive: 'I hear you. Let me show you exactly what\'s included and how it compares to doing this manually. Many clients actually save money within 30 days.',
      budget: 'Totally understand. We have options at different price points, including a starter plan. What budget are you working with?',
      trust: 'That\'s fair — trust has to be earned. Would you like to see some case studies or speak with an existing customer?',
      reviews: 'Great question! Let me share some reviews and case studies so you can hear directly from our customers.',
    };
    return {
      detected: true,
      keyword,
      suggestedResponse: responses[keyword] || `I understand you're thinking about ${keyword}. Let me address that directly.`,
    };
  }

  async saveCampaign(tenantId: string, campaign: Omit<Campaign, 'id' | 'tenantId' | 'createdAt'>): Promise<Campaign> {
    const full: Campaign = { ...campaign, id: mkId(), tenantId, createdAt: new Date().toISOString() };
    const db = this.fs();
    if (db) {
      try { await db.collection(this.CAMPAIGNS_COL).doc(full.id).set(full); return full; }
      catch { /* fall through */ }
    }
    const list = memCampaigns.get(tenantId) || [];
    list.unshift(full);
    memCampaigns.set(tenantId, list);
    return full;
  }

  async getCampaigns(tenantId: string): Promise<Campaign[]> {
    const db = this.fs();
    if (db) {
      try {
        const snap = await db.collection(this.CAMPAIGNS_COL).where('tenantId', '==', tenantId).limit(200).get();
        return snap.docs.map(d => d.data() as Campaign)
          .sort((a: any, b: any) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0))
          .slice(0, 50);
      } catch { /* fall through */ }
    }
    return memCampaigns.get(tenantId) || [];
  }

  async generateWeeklyReport(tenantId: string): Promise<{ summary: string; metrics: Record<string, number> }> {
    const activities = await this.getActivityLog(tenantId, undefined, 100);
    const bookings = await this.getBookings(tenantId);
    const metrics = {
      totalActions: activities.length,
      successfulActions: activities.filter(a => a.outcome === 'success').length,
      bookingsThisWeek: bookings.filter(b => Date.now() - new Date(b.createdAt).getTime() < 7 * 86400000).length,
      marketingActions: activities.filter(a => a.agentType === 'marketing').length,
      contentPieces: activities.filter(a => a.agentType === 'content').length,
      socialPosts: activities.filter(a => a.agentType === 'social').length,
      supportCases: activities.filter(a => a.agentType === 'frontdesk').length,
    };
    const summary = `Weekly AI Agent Report (${new Date().toLocaleDateString()}):\n- ${metrics.totalActions} total actions (${metrics.successfulActions} successful)\n- ${metrics.bookingsThisWeek} new bookings this week\n- ${metrics.marketingActions} marketing actions\n- ${metrics.contentPieces} content pieces created\n- ${metrics.socialPosts} social posts generated\n- ${metrics.supportCases} support cases handled`;
    return { summary, metrics };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT AGENT (spec §2)
  // ═══════════════════════════════════════════════════════════════════════════

  async generate30DayCalendar(tenantId: string): Promise<ContentCalendarEntry[]> {
    const systemPrompt = await this.getSystemPrompt(tenantId, 'content');
    const today = new Date();

    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate a 30-day content calendar as JSON array (30 entries). Each: { day (1-30), date (YYYY-MM-DD), platform, contentType, topic, caption (max 200 chars), hashtags: string[], status: "planned" }. Mix platforms: Instagram, LinkedIn, Facebook. Mix types: Educational (35%), Promotional (40%), Engagement (25%).` },
        ]);
        const match = resp.content.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          await this.logActivity(tenantId, 'content', 'Generated 30-day content calendar', `${parsed.length} posts planned`, 'success');
          return parsed;
        }
      } catch { /* fall through */ }
    }

    // Fallback calendar
    const platforms = ['Instagram', 'LinkedIn', 'Facebook'];
    const contentTypes = ['Educational', 'Promotional', 'Story', 'FAQ', 'Poll', 'Testimonial', 'Behind-the-scenes'];
    const topics = ['5 tips to grow your business', 'Why automation saves time', 'Meet our team', 'Client success story', 'How we solve your problem', 'Industry trends in 2026', 'Poll: your biggest challenge?'];
    const calendar: ContentCalendarEntry[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date(today); date.setDate(today.getDate() + i);
      calendar.push({ day: i + 1, date: date.toISOString().split('T')[0], platform: platforms[i % platforms.length], contentType: contentTypes[i % contentTypes.length], topic: topics[i % topics.length], caption: `Check out our latest post! ${topics[i % topics.length]}`, hashtags: ['#Business', '#Growth', '#AI'], status: 'planned' });
    }
    await this.logActivity(tenantId, 'content', 'Generated 30-day content calendar (fallback)', '30 posts planned', 'success');
    return calendar;
  }

  async generateCaption(tenantId: string, platform: string, topic: string, tone?: string): Promise<string> {
    const systemPrompt = await this.getSystemPrompt(tenantId, 'content');
    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Write a ${platform} caption about: "${topic}". Tone: ${tone || 'engaging'}. Max 200 chars. Include relevant hashtags.` },
        ]);
        await this.logActivity(tenantId, 'content', `Caption generated for ${platform}`, topic.slice(0, 40), 'success');
        return resp.content;
      } catch { /* fall through */ }
    }
    return `🚀 ${topic}\n\nDiscover how we're changing the game for businesses like yours.\n\n#Growth #Business #Innovation`;
  }

  async generateBlogOutline(tenantId: string, topic: string): Promise<string> {
    const systemPrompt = await this.getSystemPrompt(tenantId, 'content');
    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Write a blog outline for: "${topic}". Include: H1 title, meta description (155 chars), 4-6 H2 sections with 2-sentence summaries each, and a CTA paragraph.` },
        ]);
        await this.logActivity(tenantId, 'content', 'Blog outline generated', topic.slice(0, 40), 'success');
        return resp.content;
      } catch { /* fall through */ }
    }
    return `# ${topic}\n\n**Meta Description:** Learn everything you need to know about ${topic.toLowerCase()} in this comprehensive guide.\n\n## Introduction\nWhy ${topic.toLowerCase()} matters for your business today.\n\n## Key Principle 1\nThe foundation you need to get started.\n\n## Key Principle 2\nAdvanced strategies that drive results.\n\n## Key Principle 3\nHow to measure and improve over time.\n\n## Common Mistakes to Avoid\nWhat most businesses get wrong.\n\n## Conclusion\n**Ready to get started?** [Contact us today →]`;
  }

  async generateABVariants(tenantId: string, topic: string, channel: string): Promise<ABVariant> {
    const systemPrompt = await this.getSystemPrompt(tenantId, 'content');
    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Create 2 A/B variants of a ${channel} message about: "${topic}". Return JSON: { versionA: string, versionB: string, topic: string }. Different hooks and CTAs.` },
        ]);
        const match = resp.content.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
      } catch { /* fall through */ }
    }
    return {
      topic,
      versionA: `🔥 ${topic}\n\nHere's what you need to know about this right now.\n\nReady to make a move? [Get Started →]`,
      versionB: `Did you know? Most people get ${topic.toLowerCase().slice(0, 30)} completely wrong.\n\nHere's the smarter approach our clients use.\n\n[Learn More →]`,
    };
  }

  async generateFAQContent(tenantId: string, question: string): Promise<string> {
    const systemPrompt = await this.getSystemPrompt(tenantId, 'content');
    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Write a helpful, concise FAQ answer for: "${question}". Max 3 sentences. Sound like the brand.` },
        ]);
        return resp.content;
      } catch { /* fall through */ }
    }
    return `Thank you for asking about ${question.slice(0, 40)}. Our team is here to help — please reach out via our support channel for a personalized answer.`;
  }

  async saveContent(tenantId: string, contentType: ContentType, title: string, body: string): Promise<ContentLibraryEntry> {
    const entry: ContentLibraryEntry = { id: mkId(), tenantId, contentType, title, body, status: 'draft', createdAt: new Date().toISOString() };
    const db = this.fs();
    if (db) {
      try { await db.collection(this.CONTENT_COL).doc(entry.id).set(entry); return entry; }
      catch { /* fall through */ }
    }
    const list = memContent.get(tenantId) || [];
    list.unshift(entry);
    memContent.set(tenantId, list);
    return entry;
  }

  async getContentLibrary(tenantId: string, contentType?: ContentType): Promise<ContentLibraryEntry[]> {
    const db = this.fs();
    if (db) {
      try {
        let q: FirebaseFirestore.Query = db.collection(this.CONTENT_COL).where('tenantId', '==', tenantId);
        if (contentType) q = q.where('contentType', '==', contentType);
        const snap = await q.limit(300).get();
        return snap.docs.map(d => d.data() as ContentLibraryEntry)
          .sort((a: any, b: any) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0))
          .slice(0, 100);
      } catch { /* fall through */ }
    }
    const list = memContent.get(tenantId) || [];
    return contentType ? list.filter(e => e.contentType === contentType) : list;
  }

  async approveContent(tenantId: string, contentId: string): Promise<ContentLibraryEntry | null> {
    const db = this.fs();
    if (db) {
      try {
        await db.collection(this.CONTENT_COL).doc(contentId).update({ status: 'approved' });
        const doc = await db.collection(this.CONTENT_COL).doc(contentId).get();
        return doc.data() as ContentLibraryEntry;
      } catch { /* fall through */ }
    }
    const list = memContent.get(tenantId) || [];
    const idx = list.findIndex(e => e.id === contentId);
    if (idx !== -1) { list[idx].status = 'approved'; return list[idx]; }
    return null;
  }

  /**
   * Sync a generated 30-day content calendar into the Calendar module so planned
   * posts show on the unified calendar (Content → Calendar integration).
   * Uses idempotent upserts keyed by day+date so re-syncing never duplicates.
   * Each post is scheduled at 09:00 local for its date with a 30-min window.
   */
  async syncContentCalendarToCalendar(tenantId: string, entries: ContentCalendarEntry[]): Promise<{ synced: number }> {
    if (!Array.isArray(entries) || entries.length === 0) return { synced: 0 };
    let synced = 0;
    for (const e of entries) {
      try {
        const start = `${e.date}T09:00:00`;
        const end = `${e.date}T09:30:00`;
        await this.calendar.upsertExternalEvent(tenantId, {
          source: 'content',
          externalId: `day${e.day}_${e.date}`,
          title: `📣 ${e.platform}: ${e.topic}`,
          start,
          end,
          description: `${e.contentType}\n\n${e.caption}\n\n${(e.hashtags || []).join(' ')}`.trim(),
        });
        synced++;
      } catch (err: any) {
        this.logger.warn(`syncContentCalendarToCalendar entry failed (day ${e.day}): ${err?.message || err}`);
      }
    }
    await this.logActivity(tenantId, 'content', 'Content calendar synced to Calendar module', `${synced} posts added to calendar`, 'success');
    return { synced };
  }

  /**
   * Push a content-library item into the Social scheduler as a draft post
   * (Content library → Social integration). Defaults to instagram if no platform.
   */
  /** Read one content-library entry by id (direct doc read, falls back to list). */
  private async getContentById(tenantId: string, contentId: string): Promise<ContentLibraryEntry | null> {
    const db = this.fs();
    if (db) {
      try {
        const doc = await db.collection(this.CONTENT_COL).doc(contentId).get();
        if (doc.exists) return doc.data() as ContentLibraryEntry;
      } catch { /* fall through */ }
    }
    return (await this.getContentLibrary(tenantId)).find(c => c.id === contentId) || null;
  }

  async pushContentToSocial(tenantId: string, contentId: string, platform?: string): Promise<SocialPost | null> {
    const entry = await this.getContentById(tenantId, contentId);
    if (!entry) return null;
    const hashtags = (entry.body.match(/#[\w]+/g) || []) as string[];
    const post = await this.schedulePost(tenantId, {
      platform: (platform as SocialPlatform) || 'instagram',
      caption: entry.body,
      hashtags,
      status: 'draft',
    });
    await this.logActivity(tenantId, 'content', `Content sent to Social: ${entry.title}`, `Draft post on ${post.platform}`, 'success');
    return post;
  }

  /**
   * Push a content-library item into the Campaign Manager as a draft campaign
   * (Content library → Campaign Manager integration).
   */
  async pushContentToCampaign(tenantId: string, contentId: string, channel?: Campaign['channel']): Promise<Campaign | null> {
    const entry = await this.getContentById(tenantId, contentId);
    if (!entry) return null;
    const campaign = await this.saveCampaign(tenantId, {
      name: entry.title,
      channel: channel || 'email',
      status: 'draft',
      audienceSegment: 'all',
      sentCount: 0,
      openRate: 0,
    });
    await this.logActivity(tenantId, 'content', `Content sent to Campaign Manager: ${entry.title}`, `Draft campaign (${campaign.channel})`, 'success');
    return campaign;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL AGENT (spec §3)
  // ═══════════════════════════════════════════════════════════════════════════

  async generateSocialPost(tenantId: string, platform: string, topic: string): Promise<SocialPost> {
    const systemPrompt = await this.getSystemPrompt(tenantId, 'social');
    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Write a native ${platform} post about: "${topic}". Platform rules: Instagram: visual storytelling, emojis, 5-10 hashtags. LinkedIn: professional insight, ≤3 hashtags. Facebook: conversational, community-driven. Return JSON: { platform, caption, hashtags: [] }` },
        ]);
        const match = resp.content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          await this.logActivity(tenantId, 'social', `Post generated for ${platform}`, topic.slice(0, 40), 'success');
          return { platform: platform as SocialPlatform, caption: parsed.caption || resp.content, hashtags: parsed.hashtags || [], status: 'draft' };
        }
        return { platform: platform as SocialPlatform, caption: resp.content, hashtags: [], status: 'draft' };
      } catch { /* fall through */ }
    }
    return { platform: platform as SocialPlatform, caption: `${topic} — Learn how we help businesses grow faster with AI. 🚀`, hashtags: ['#AI', '#BusinessGrowth', '#Automation'], status: 'draft' };
  }

  async analyzeSentiment(tenantId: string, text: string): Promise<SentimentResult> {
    const escalateKeywords = ['refund', 'lawsuit', 'fraud', 'scam', 'terrible', 'worst', 'legal', 'chargeback', 'complaint', 'fake', 'disappointed'];
    const detectedKeywords = escalateKeywords.filter(k => text.toLowerCase().includes(k));
    const shouldEscalate = detectedKeywords.length > 0;

    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'user', content: `Analyze sentiment of: "${text}". Return JSON: { sentiment: "positive"|"neutral"|"negative", score: 0-1, shouldEscalate: boolean }` },
        ]);
        const match = resp.content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          return { ...parsed, detectedKeywords };
        }
      } catch { /* fall through */ }
    }

    const negWords = ['bad', 'terrible', 'awful', 'hate', 'disappointed', 'refund', 'scam'];
    const posWords = ['great', 'amazing', 'love', 'excellent', 'perfect', 'thank'];
    const neg = negWords.filter(w => text.toLowerCase().includes(w)).length;
    const pos = posWords.filter(w => text.toLowerCase().includes(w)).length;
    const sentiment = neg > pos ? 'negative' : pos > 0 ? 'positive' : 'neutral';
    return { sentiment, score: sentiment === 'positive' ? 0.8 : sentiment === 'negative' ? 0.2 : 0.5, shouldEscalate: shouldEscalate || sentiment === 'negative', detectedKeywords };
  }

  async schedulePost(tenantId: string, post: Omit<SocialPost, 'id' | 'tenantId'>): Promise<SocialPost> {
    const full: SocialPost = { ...post, id: mkId(), tenantId, status: post.scheduledAt ? 'scheduled' : 'draft' };
    const db = this.fs();
    if (db) {
      try { await db.collection(this.POSTS_COL).doc(full.id!).set(full); return full; }
      catch { /* fall through */ }
    }
    const list = memPosts.get(tenantId) || [];
    list.unshift(full);
    memPosts.set(tenantId, list);
    await this.logActivity(tenantId, 'social', `Post scheduled on ${post.platform}`, post.caption.slice(0, 40), 'success');
    return full;
  }

  /**
   * Sync the tenant's scheduled social posts into the Calendar module (Social → Calendar),
   * mirroring the Content planner's sync. Idempotent upserts keyed by post id, so
   * re-syncing never duplicates and rescheduling moves the event.
   */
  async syncSocialPostsToCalendar(tenantId: string): Promise<{ synced: number }> {
    const posts = (await this.getPosts(tenantId)).filter(p => p.scheduledAt && p.status !== 'published');
    let synced = 0;
    for (const p of posts) {
      try {
        const start = p.scheduledAt!;
        const end = new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();
        await this.calendar.upsertExternalEvent(tenantId, {
          source: 'social',
          externalId: p.id || `${p.platform}_${start}`,
          title: `📱 ${p.platform}: ${(p.caption || '').slice(0, 60)}`,
          start,
          end,
          description: `${p.caption}\n\n${(p.hashtags || []).join(' ')}`.trim(),
        });
        synced++;
      } catch (err: any) {
        this.logger.warn(`syncSocialPostsToCalendar entry failed (${p.id}): ${err?.message || err}`);
      }
    }
    await this.logActivity(tenantId, 'social', 'Scheduled posts synced to Calendar module', `${synced} posts added to calendar`, 'success');
    return { synced };
  }

  async getPosts(tenantId: string): Promise<SocialPost[]> {
    const db = this.fs();
    if (db) {
      try {
        const snap = await db.collection(this.POSTS_COL).where('tenantId', '==', tenantId).limit(300).get();
        return snap.docs.map(d => d.data() as SocialPost)
          .sort((a: any, b: any) => (b.scheduledAt > a.scheduledAt ? 1 : b.scheduledAt < a.scheduledAt ? -1 : 0))
          .slice(0, 100);
      } catch { /* fall through */ }
    }
    return memPosts.get(tenantId) || [];
  }

  async generateTrendAlert(tenantId: string, industryTopic: string): Promise<TrendAlert> {
    const systemPrompt = await this.getSystemPrompt(tenantId, 'social');
    let draftPost = `🔥 ${industryTopic} is trending right now! Here's our take…\n\n[Your insight here]\n\n${Date.now() % 2 === 0 ? '#Trending' : '#IndustryNews'} #Business`;

    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Trend detected: "${industryTopic}". Score its relevance 1-10 for this business. Write a draft reactive post. Return JSON: { relevanceScore: number, draftPost: string }` },
        ]);
        const match = resp.content.match(/\{[\s\S]*\}/);
        if (match) { const parsed = JSON.parse(match[0]); return { topic: industryTopic, relevanceScore: parsed.relevanceScore, platform: 'all', draftPost: parsed.draftPost, detectedAt: new Date().toISOString() }; }
      } catch { /* fall through */ }
    }
    return { topic: industryTopic, relevanceScore: 7, platform: 'all', draftPost, detectedAt: new Date().toISOString() };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FRONT DESK AGENT (spec §4)
  // ═══════════════════════════════════════════════════════════════════════════

  async answerFAQ(tenantId: string, question: string): Promise<string> {
    const systemPrompt = await this.getSystemPrompt(tenantId, 'frontdesk');
    // Check stored FAQs first
    const faqs = await this.getFAQs(tenantId);
    const match = faqs.find(f => question.toLowerCase().includes(f.question.toLowerCase().slice(0, 10)));
    if (match) {
      await this.logActivity(tenantId, 'frontdesk', 'FAQ answered (knowledge base)', question.slice(0, 50), 'success');
      return match.answer;
    }

    if (this.ai.isAvailable()) {
      try {
        const resp = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Customer question: "${question}". Helpful, concise response (max 3 sentences). Offer a next step.` },
        ]);
        await this.logActivity(tenantId, 'frontdesk', 'FAQ answered (AI)', question.slice(0, 50), 'success');
        return resp.content;
      } catch { /* fall through */ }
    }
    return `Thank you for your question about "${question.slice(0, 40)}". Our team will get back to you shortly. You can also reach us via our website or WhatsApp.`;
  }

  async saveFAQ(tenantId: string, question: string, answer: string, category: string): Promise<FAQEntry> {
    const id = mkId();
    const createdAt = new Date().toISOString();
    const entry: FAQEntry = { id, tenantId, question, answer, category, createdAt };
    const db = this.fs();
    if (db) {
      try {
        // Write the canonical KB shape so the Knowledge Base UI + live AI pick it up,
        // while keeping question/answer for back-compat reads.
        await db.collection(this.FAQS_COL).doc(id).set({
          id, tenantId,
          title: question,
          content: answer,
          category,
          excerpt: answer.slice(0, 160),
          isPublished: true,
          source: 'frontdesk_faq',
          question, answer,
          createdAt, updatedAt: createdAt,
        });
        return entry;
      } catch { /* fall through */ }
    }
    const list = memFAQs.get(tenantId) || [];
    list.unshift(entry);
    memFAQs.set(tenantId, list);
    return entry;
  }

  /** Map a KB-article doc (or legacy FAQ doc) to a FAQEntry. */
  private kbDocToFAQ(d: any): FAQEntry {
    return {
      id: d.id,
      tenantId: d.tenantId,
      question: d.question ?? d.title ?? '',
      answer: d.answer ?? d.content ?? '',
      category: d.category ?? 'General',
      createdAt: d.createdAt ?? new Date().toISOString(),
    };
  }

  async getFAQs(tenantId: string): Promise<FAQEntry[]> {
    const db = this.fs();
    if (db) {
      try {
        // No orderBy — KB docs from other sources may lack createdAt; sort in memory.
        const snap = await db.collection(this.FAQS_COL).where('tenantId', '==', tenantId).limit(200).get();
        return snap.docs
          .map(d => this.kbDocToFAQ(d.data()))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      } catch { /* fall through */ }
    }
    return memFAQs.get(tenantId) || [];
  }

  async deleteFAQ(tenantId: string, faqId: string): Promise<void> {
    const db = this.fs();
    if (db) {
      try { await db.collection(this.FAQS_COL).doc(faqId).delete(); return; }
      catch { /* fall through */ }
    }
    const list = memFAQs.get(tenantId) || [];
    memFAQs.set(tenantId, list.filter(f => f.id !== faqId));
  }

  async createBooking(req: BookingRequest): Promise<BookingRecord> {
    const booking: BookingRecord = { id: mkId(), tenantId: req.tenantId, customerName: req.customerName, customerPhone: req.customerPhone, service: req.service, date: req.requestedDate, time: req.requestedTime, status: 'confirmed', notes: req.notes, reminderSent: false, createdAt: new Date().toISOString() };
    const db = this.fs();
    if (db) {
      try { await db.collection(this.BOOKINGS_COL).doc(booking.id).set(booking); }
      catch { memBookings.set(req.tenantId, [...(memBookings.get(req.tenantId) || []), booking]); }
    } else {
      memBookings.set(req.tenantId, [...(memBookings.get(req.tenantId) || []), booking]);
    }
    // Link to the Calendar module — push to the tenant's Google Calendar when
    // connected, otherwise a durable internal event. Booking keeps the event id.
    try {
      const startIso = new Date(`${req.requestedDate}T${(req.requestedTime || '09:00')}:00`).toISOString();
      const endIso = new Date(new Date(startIso).getTime() + 30 * 60 * 1000).toISOString();
      const ev = await this.calendar.createGoogleCalendarEvent(req.tenantId, {
        summary: `Booking: ${req.customerName}${req.service ? ` — ${req.service}` : ''}`,
        description: [req.notes, req.customerPhone].filter(Boolean).join('\n'),
        startDateTime: startIso,
        endDateTime: endIso,
      });
      if (ev?.id) {
        (booking as any).calendarEventId = ev.id;
        if (db) { try { await db.collection(this.BOOKINGS_COL).doc(booking.id).set(booking); } catch { /* non-fatal */ } }
      }
    } catch (e: any) {
      this.logger.warn(`[Booking] calendar link failed for ${req.tenantId}: ${e?.message ?? e}`);
    }

    await this.logActivity(req.tenantId, 'frontdesk', `Booking created: ${req.customerName}`, `${req.requestedDate} at ${req.requestedTime}`, 'success');
    return booking;
  }

  async getBookings(tenantId: string): Promise<BookingRecord[]> {
    const db = this.fs();
    if (db) {
      try {
        const snap = await db.collection(this.BOOKINGS_COL).where('tenantId', '==', tenantId).limit(300).get();
        return snap.docs.map(d => d.data() as BookingRecord)
          .sort((a: any, b: any) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
          .slice(0, 100);
      } catch { /* fall through */ }
    }
    return memBookings.get(tenantId) || [];
  }

  async updateBookingStatus(tenantId: string, bookingId: string, status: BookingRecord['status']): Promise<BookingRecord | null> {
    const db = this.fs();
    if (db) {
      try {
        await db.collection(this.BOOKINGS_COL).doc(bookingId).update({ status });
        const doc = await db.collection(this.BOOKINGS_COL).doc(bookingId).get();
        return doc.data() as BookingRecord;
      } catch { /* fall through */ }
    }
    const list = memBookings.get(tenantId) || [];
    const idx = list.findIndex(b => b.id === bookingId);
    if (idx !== -1) { list[idx].status = status; return list[idx]; }
    return null;
  }

  async createCase(tenantId: string, caseType: CaseType, summary: string, contactId?: string): Promise<SupportCase> {
    const sc: SupportCase = { id: mkId(), tenantId, contactId, caseType, status: 'open', attempts: 0, summary, createdAt: new Date().toISOString() };
    const db = this.fs();
    if (db) {
      try { await db.collection(this.CASES_COL).doc(sc.id).set(sc); }
      catch { /* fall through */ }
    }
    const list = memCases.get(tenantId) || [];
    list.unshift(sc);
    memCases.set(tenantId, list);
    await this.logActivity(tenantId, 'frontdesk', `Case created: ${caseType}`, summary.slice(0, 50), 'pending');
    return sc;
  }

  async getCases(tenantId: string): Promise<SupportCase[]> {
    const db = this.fs();
    if (db) {
      try {
        const snap = await db.collection(this.CASES_COL).where('tenantId', '==', tenantId).limit(300).get();
        return snap.docs.map(d => d.data() as SupportCase)
          .sort((a: any, b: any) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0))
          .slice(0, 100);
      } catch { /* fall through */ }
    }
    return memCases.get(tenantId) || [];
  }

  async escalateCase(tenantId: string, caseId: string): Promise<SupportCase | null> {
    const db = this.fs();
    if (db) {
      try {
        await db.collection(this.CASES_COL).doc(caseId).update({ status: 'escalated' });
        const doc = await db.collection(this.CASES_COL).doc(caseId).get();
        const sc = doc.data() as SupportCase;
        await this.logActivity(tenantId, 'frontdesk', `Case escalated: ${caseId}`, sc.summary.slice(0, 50), 'pending');
        return sc;
      } catch { /* fall through */ }
    }
    const list = memCases.get(tenantId) || [];
    const idx = list.findIndex(c => c.id === caseId);
    if (idx !== -1) { list[idx].status = 'escalated'; return list[idx]; }
    return null;
  }

  async resolveCase(tenantId: string, caseId: string): Promise<SupportCase | null> {
    const db = this.fs();
    const now = new Date().toISOString();
    if (db) {
      try {
        await db.collection(this.CASES_COL).doc(caseId).update({ status: 'resolved', resolvedAt: now });
        const doc = await db.collection(this.CASES_COL).doc(caseId).get();
        return doc.data() as SupportCase;
      } catch { /* fall through */ }
    }
    const list = memCases.get(tenantId) || [];
    const idx = list.findIndex(c => c.id === caseId);
    if (idx !== -1) { list[idx].status = 'resolved'; list[idx].resolvedAt = now; return list[idx]; }
    return null;
  }

  async checkEscalationTrigger(text: string): Promise<boolean> {
    return ESCALATION_KEYWORDS.some(k => text.toLowerCase().includes(k));
  }
}
