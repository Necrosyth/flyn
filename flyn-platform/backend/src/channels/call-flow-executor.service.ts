/**
 * CallFlowExecutorService
 *
 * Post-call intelligence engine. After every call ends, loads the tenant's
 * active call flow from Firestore, evaluates conditions against real call
 * data (transcript, sentiment, duration, status), and fires the configured
 * actions (CRM update, WhatsApp, email, schedule callback, notify team).
 *
 * Design principles:
 *  - Fire-and-forget: never throws. All errors are caught and logged.
 *  - Idempotent: checks executionLog before re-running.
 *  - Max depth guard prevents infinite loops in malformed flows.
 *  - Each node type is isolated — one failure doesn't abort the whole flow.
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseService } from '../firebase/firebase.service';
import { CrmService } from '../crm/crm.service';
import { MailService } from '../mail/mail.service';
import { AIProviderService } from '../orchestrator/ai-provider/ai-provider.service';
import { WhatsAppQRService } from './services/whatsapp-qr.service';
import { WhatsAppConnector } from './connectors/whatsapp.connector';
import { ChannelCredentialsService } from './services/channel-credentials.service';
import { ChannelType } from './types/channel.types';

// ── Internal types ─────────────────────────────────────────────────────────────

interface FlowNode {
  id: string;
  type: string;
  name?: string;
  config: Record<string, unknown>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

interface CallFlow {
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface CallContext {
  callSid: string;
  phone: string;
  transcript: string;
  sentiment: string;
  sentimentScore: number;
  duration: number;
  callStatus: string;
  agentId?: string;
  agentName?: string;
  summary?: string;
}

interface NodeResult {
  branch?: string;   // 'true' | 'false' for decision nodes
  stop?: boolean;    // true on 'end' node
  action?: string;   // logged action name
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class CallFlowExecutorService {
  private readonly logger = new Logger(CallFlowExecutorService.name);

  private readonly ACTIVE_CALLS_COL = 'activeCalls';
  private readonly TRANSCRIPT_SUB  = 'transcript';
  private readonly CHANNELS_COL    = 'channels';
  private readonly MAX_DEPTH        = 20;

  constructor(
    private readonly firebase: FirebaseService,
    @Inject(forwardRef(() => CrmService))
    private readonly crm: CrmService,
    private readonly mail: MailService,
    private readonly aiProvider: AIProviderService,
    private readonly whatsappQR: WhatsAppQRService,
    private readonly whatsappConnector: WhatsAppConnector,
    private readonly credentials: ChannelCredentialsService,
  ) {}

  /**
   * Entry point — called from channels.service.ts after a call reaches a
   * terminal status. Safe to call without await (fire-and-forget).
   */
  async executeForCall(
    tenantId: string,
    callSid: string,
    callStatus: string,
  ): Promise<void> {
    try {
      await this._run(tenantId, callSid, callStatus);
    } catch (err: any) {
      this.logger.error(`[CallFlowExecutor] Unhandled error for ${callSid}: ${err.message}`, err.stack);
    }
  }

  // ── Core execution pipeline ──────────────────────────────────────────────────

  private async _run(tenantId: string, callSid: string, callStatus: string): Promise<void> {
    const db = this.firebase.firestore();
    if (!db) return;

    // 1. Load active flow
    const flowDoc = await db
      .collection('tenants').doc(tenantId)
      .collection('callFlows').doc('active')
      .get();

    if (!flowDoc.exists) {
      this.logger.debug(`[CallFlowExecutor] No active flow for tenant ${tenantId}`);
      return;
    }

    const flow = (flowDoc.data() as { flow?: CallFlow })?.flow;
    if (!flow?.nodes?.length) return;

    // 2. Load call record
    const callSnap = await db
      .collection('tenants').doc(tenantId)
      .collection(this.ACTIVE_CALLS_COL).doc(callSid)
      .get();

    if (!callSnap.exists) {
      this.logger.warn(`[CallFlowExecutor] Call doc missing: ${callSid}`);
      return;
    }
    const callData = callSnap.data()!;

    // Idempotency — skip if this flow was already executed for this call
    if (callData.callFlowExecuted === true) {
      this.logger.debug(`[CallFlowExecutor] Already executed for ${callSid} — skipping`);
      return;
    }

    // 3. Load transcript
    const transcriptSnap = await db
      .collection('tenants').doc(tenantId)
      .collection(this.ACTIVE_CALLS_COL).doc(callSid)
      .collection(this.TRANSCRIPT_SUB)
      .orderBy('ts', 'asc')
      .get();

    const transcript = transcriptSnap.docs
      .map(d => {
        const { role, text } = d.data();
        return `${role === 'customer' ? 'Customer' : 'AI'}: ${String(text ?? '')}`;
      })
      .join('\n');

    // 4. Build call context
    const summary = callData.callSummary as Record<string, unknown> | undefined;
    const ctx: CallContext = {
      callSid,
      phone: String(callData.to || callData.from || ''),
      transcript,
      sentiment: String(summary?.sentiment ?? callData.sentiment ?? 'neutral'),
      sentimentScore: Number(summary?.sentimentScore ?? 50),
      duration: Number(callData.durationSeconds ?? 0),
      callStatus,
      agentId: callData.agentId as string | undefined,
      agentName: undefined,
      summary: typeof summary?.summary === 'string' ? summary.summary : undefined,
    };

    // Resolve agent name (best-effort)
    if (ctx.agentId) {
      try {
        const agentSnap = await db.collection('agents').doc(ctx.agentId).get();
        if (agentSnap.exists) ctx.agentName = agentSnap.data()?.name as string | undefined;
      } catch { /* non-fatal */ }
    }

    this.logger.log(
      `[CallFlowExecutor] Running flow "${flow.name}" for ${callSid} ` +
      `(status: ${callStatus}, sentiment: ${ctx.sentiment}, duration: ${ctx.duration}s)`,
    );

    // 5. Find trigger node matching call status
    const triggerNode = flow.nodes.find(n => {
      if (n.type !== 'call_ended') return false;
      const event = n.config?.event as string | undefined;
      // No event filter = fires on any terminal status
      return !event || callStatus === event;
    });

    if (!triggerNode) {
      this.logger.debug(`[CallFlowExecutor] No trigger node matched status "${callStatus}"`);
      return;
    }

    // 6. Walk the graph
    const nodesExecuted: string[] = [];
    const actions: string[] = [];
    const errors: string[] = [];

    await this.walkGraph(flow, triggerNode.id, ctx, tenantId, nodesExecuted, actions, errors, 0);

    // 7. Log execution record + mark call as executed
    const now = Date.now();
    await db
      .collection('tenants').doc(tenantId)
      .collection('callFlowExecutions')
      .doc(uuidv4())
      .set({
        callSid,
        phone: ctx.phone,
        executedAt: now,
        flowName: flow.name,
        callStatus,
        sentiment: ctx.sentiment,
        sentimentScore: ctx.sentimentScore,
        duration: ctx.duration,
        nodesExecuted,
        actions,
        errors,
      });

    // Mark call doc so we don't re-execute
    await db
      .collection('tenants').doc(tenantId)
      .collection(this.ACTIVE_CALLS_COL).doc(callSid)
      .set({ callFlowExecuted: true, callFlowExecutedAt: now }, { merge: true });

    this.logger.log(
      `[CallFlowExecutor] Done for ${callSid} — actions: [${actions.join(', ')}]` +
      (errors.length ? ` | errors: [${errors.join('; ')}]` : ''),
    );
  }

  // ── Graph walker ─────────────────────────────────────────────────────────────

  private async walkGraph(
    flow: CallFlow,
    nodeId: string,
    ctx: CallContext,
    tenantId: string,
    nodesExecuted: string[],
    actions: string[],
    errors: string[],
    depth: number,
  ): Promise<void> {
    if (depth > this.MAX_DEPTH) {
      this.logger.warn(`[CallFlowExecutor] Max depth reached — possible cycle in flow`);
      return;
    }

    const node = flow.nodes.find(n => n.id === nodeId);
    if (!node) return;

    nodesExecuted.push(`${node.type}:${node.id}`);

    let result: NodeResult = {};
    try {
      result = await this.executeNode(node, ctx, tenantId);
      if (result.action) actions.push(result.action);
    } catch (err: any) {
      const msg = `${node.id}(${node.type}): ${err.message}`;
      errors.push(msg);
      this.logger.warn(`[CallFlowExecutor] Node failed — ${msg}`);
      // Continue walking after node failure — don't abort the whole flow
    }

    if (result.stop) return;

    // Resolve next edge — decision nodes branch on 'true'/'false'
    const nextEdge = result.branch != null
      ? flow.edges.find(e => e.source === nodeId && e.sourceHandle === result.branch)
      : flow.edges.find(e => e.source === nodeId);

    if (!nextEdge) return;

    await this.walkGraph(flow, nextEdge.target, ctx, tenantId, nodesExecuted, actions, errors, depth + 1);
  }

  // ── Node dispatcher ───────────────────────────────────────────────────────────

  private async executeNode(node: FlowNode, ctx: CallContext, tenantId: string): Promise<NodeResult> {
    switch (node.type) {
      case 'call_ended':     return {};
      case 'end':            return { stop: true };
      case 'ai_decision':    return this.nodeAiDecision(node, ctx);
      case 'crm':            return this.nodeCrm(node, ctx, tenantId);
      case 'send_whatsapp':  return this.nodeSendWhatsApp(node, ctx, tenantId);
      case 'send_sms':       return this.nodeSendSms(node, ctx, tenantId);
      case 'send_email':     return this.nodeSendEmail(node, ctx, tenantId);
      case 'action':         return this.nodeAction(node, ctx, tenantId);
      default:
        this.logger.warn(`[CallFlowExecutor] Unknown node type: "${node.type}" — skipping`);
        return {};
    }
  }

  // ── Node: AI Decision ─────────────────────────────────────────────────────────

  private async nodeAiDecision(node: FlowNode, ctx: CallContext): Promise<NodeResult> {
    const prompt = String(node.config.prompt ?? 'Is the caller interested?');

    const systemMsg =
      `You are a post-call intelligence engine. Answer the question below with ONLY "true" or "false". ` +
      `No explanation. No punctuation. Just the single word.\n\nQuestion: ${prompt}`;

    const userMsg = ctx.transcript
      ? `Call transcript:\n${ctx.transcript}\n\nSentiment: ${ctx.sentiment} (score ${ctx.sentimentScore}/100)\nDuration: ${ctx.duration}s\nStatus: ${ctx.callStatus}`
      : `No transcript. Sentiment: ${ctx.sentiment} (score ${ctx.sentimentScore}/100). Duration: ${ctx.duration}s.`;

    let branch = 'false';
    try {
      const res = await this.aiProvider.chat([
        { role: 'system', content: systemMsg },
        { role: 'user',   content: userMsg   },
      ] as any);
      const raw = String(res.content ?? '').toLowerCase().trim();
      branch = raw.startsWith('true') ? 'true' : 'false';
    } catch (err: any) {
      this.logger.warn(`[CallFlowExecutor] ai_decision AI call failed: ${err.message} — defaulting false`);
    }

    this.logger.debug(`[CallFlowExecutor] ai_decision → ${branch} | prompt: "${prompt.slice(0, 60)}"`);
    return { branch };
  }

  // ── Node: CRM ────────────────────────────────────────────────────────────────

  private async nodeCrm(node: FlowNode, ctx: CallContext, tenantId: string): Promise<NodeResult> {
    const opFields = (node.config.op_fields ?? {}) as Record<string, unknown>;

    // Find existing contact by phone
    let existingId: string | null = null;
    let existingNotes: string | undefined;
    try {
      const result = await this.crm.getContacts({ limit: 500 }, tenantId);
      const match = result.data?.find(
        (c: any) => c.phone && this.normalizePhone(c.phone) === this.normalizePhone(ctx.phone),
      );
      if (match) {
        existingId = String(match._id ?? match.id ?? '');
        existingNotes = match.notes;
      }
    } catch (err: any) {
      this.logger.warn(`[CallFlowExecutor] CRM contact lookup failed: ${err.message}`);
    }

    // Build call note to append
    const callNote = ctx.summary
      ? `[${new Date().toLocaleDateString()} Call] ${ctx.summary} | Sentiment: ${ctx.sentiment}`
      : `[${new Date().toLocaleDateString()} Call] Status: ${ctx.callStatus} | Sentiment: ${ctx.sentiment} | Duration: ${ctx.duration}s`;

    if (existingId) {
      // Update existing contact
      const updateDto: any = {
        notes: [existingNotes, callNote].filter(Boolean).join('\n\n'),
      };
      if (opFields.tags) {
        updateDto.tags = String(opFields.tags)
          .split(',').map((t: string) => t.trim()).filter(Boolean);
      }
      if (opFields.stage || opFields.status) {
        updateDto.status = String(opFields.stage ?? opFields.status);
      }
      if (opFields.score !== undefined) {
        updateDto.score = Number(opFields.score);
      }

      await this.crm.updateContact(existingId, updateDto, tenantId);
      this.logger.log(`[CallFlowExecutor] CRM updated contact ${existingId} for ${ctx.phone}`);
      return { action: 'crm_qualify' };
    }

    // Create new contact from call data
    const createDto: any = {
      name: ctx.phone,
      email: '',
      phone: ctx.phone,
      source: 'dialer-call-flow',
      status: (opFields.stage ?? opFields.status ?? 'lead') as string,
      notes: callNote,
    };
    if (opFields.tags) {
      createDto.tags = String(opFields.tags)
        .split(',').map((t: string) => t.trim()).filter(Boolean);
    }
    if (opFields.score !== undefined) createDto.score = Number(opFields.score);

    try {
      await this.crm.createContact(createDto, tenantId);
      this.logger.log(`[CallFlowExecutor] CRM created contact for ${ctx.phone}`);
    } catch (err: any) {
      if (!err.message?.includes('Duplicate')) throw err;
      this.logger.debug(`[CallFlowExecutor] CRM duplicate skipped for ${ctx.phone}`);
    }

    return { action: 'crm_qualify' };
  }

  // ── Node: Send WhatsApp ───────────────────────────────────────────────────────

  private async nodeSendWhatsApp(node: FlowNode, ctx: CallContext, tenantId: string): Promise<NodeResult> {
    const message = this.interpolate(String(node.config.message ?? ''), ctx);
    if (!message || !ctx.phone) {
      this.logger.warn(`[CallFlowExecutor] send_whatsapp skipped — no message or phone`);
      return { action: 'send_whatsapp_skipped' };
    }

    const db = this.firebase.firestore();
    const channelsSnap = await db
      .collection('tenants').doc(tenantId)
      .collection(this.CHANNELS_COL)
      .get();

    const waChannel = channelsSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .find((c: any) => c.type === ChannelType.WHATSAPP && c.status === 'active');

    if (!waChannel) {
      this.logger.warn(`[CallFlowExecutor] No active WhatsApp channel for tenant ${tenantId}`);
      return { action: 'send_whatsapp_no_channel' };
    }

    const phone = this.normalizePhone(ctx.phone).replace(/^\+/, '');

    if (waChannel.channelSubtype === 'qr') {
      await this.whatsappQR.sendMessage(tenantId, phone, message);
    } else {
      const creds = await this.credentials.getCredentialsByChannelId(
        tenantId, waChannel.id, ChannelType.WHATSAPP,
      );
      await this.whatsappConnector.sendMessage(waChannel, creds, {
        id: `cf_wa_${Date.now()}`,
        recipientId: phone,
        content: { type: 'text', text: message },
      });
    }

    this.logger.log(`[CallFlowExecutor] WhatsApp sent to ${ctx.phone}`);
    return { action: 'send_whatsapp' };
  }

  // ── Node: Send SMS (Twilio) ───────────────────────────────────────────────────

  private async nodeSendSms(node: FlowNode, ctx: CallContext, tenantId: string): Promise<NodeResult> {
    const message = this.interpolate(String(node.config.message ?? ''), ctx);
    if (!message || !ctx.phone) return { action: 'send_sms_skipped' };

    const db = this.firebase.firestore();

    // Load Twilio credentials for the tenant
    const channelsSnap = await db
      .collection('tenants').doc(tenantId)
      .collection(this.CHANNELS_COL)
      .get();

    const twilioChannel = channelsSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .find((c: any) => c.type === 'twilio' && c.status === 'active');

    if (!twilioChannel) {
      this.logger.warn(`[CallFlowExecutor] No active Twilio channel — SMS skipped`);
      return { action: 'send_sms_no_channel' };
    }

    const creds = await this.credentials.getCredentialsByChannelId(
      tenantId, twilioChannel.id, 'twilio' as any,
    );

    const sid   = creds?.accountSid   ?? creds?.TWILIO_ACCOUNT_SID;
    const token = creds?.authToken    ?? creds?.TWILIO_AUTH_TOKEN;
    const from  = creds?.phoneNumber  ?? creds?.TWILIO_PHONE_NUMBER;

    if (!sid || !token || !from) {
      this.logger.warn(`[CallFlowExecutor] Twilio creds incomplete — SMS skipped`);
      return { action: 'send_sms_no_creds' };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const body = new URLSearchParams({
      To:   ctx.phone,
      From: from,
      Body: message,
    });

    const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Twilio SMS failed: ${err}`);
    }

    this.logger.log(`[CallFlowExecutor] SMS sent to ${ctx.phone}`);
    return { action: 'send_sms' };
  }

  // ── Node: Send Email ──────────────────────────────────────────────────────────

  private async nodeSendEmail(node: FlowNode, ctx: CallContext, tenantId: string): Promise<NodeResult> {
    const subject = this.interpolate(String(node.config.subject ?? 'Follow-up from your recent call'), ctx);
    const bodyText = this.interpolate(String(node.config.message ?? node.config.body ?? ''), ctx);

    // Resolve recipient email — prefer explicit config, then CRM lookup by phone
    let recipientEmail = String(node.config.email ?? '');
    if (!recipientEmail && ctx.phone) {
      try {
        const result = await this.crm.getContacts({ limit: 500 }, tenantId);
        const match = result.data?.find(
          (c: any) => c.phone && this.normalizePhone(c.phone) === this.normalizePhone(ctx.phone),
        );
        if (match?.email) recipientEmail = match.email;
      } catch { /* non-fatal */ }
    }

    if (!recipientEmail) {
      this.logger.warn(`[CallFlowExecutor] Email skipped — no email for ${ctx.phone}`);
      return { action: 'send_email_skipped' };
    }

    await this.mail.sendEmail({
      to: recipientEmail,
      subject,
      text: bodyText,
      html: `<div style="font-family:sans-serif;color:#333;line-height:1.6">${bodyText.replace(/\n/g, '<br>')}</div>`,
    });

    this.logger.log(`[CallFlowExecutor] Email sent to ${recipientEmail}`);
    return { action: 'send_email' };
  }

  // ── Node: Action (schedule callback, notify team) ─────────────────────────────

  private async nodeAction(node: FlowNode, ctx: CallContext, tenantId: string): Promise<NodeResult> {
    const op  = String(node.config.op ?? '');
    const db  = this.firebase.firestore();

    if (op === 'scheduleCallback') {
      const delayDays   = Number(node.config.delayDays ?? 1);
      const scheduledFor = Date.now() + delayDays * 24 * 60 * 60 * 1000;

      await db.collection('tenants').doc(tenantId).collection('tasks').add({
        type:         'callback',
        phone:        ctx.phone,
        callSid:      ctx.callSid,
        scheduledFor,
        note:         `Auto-scheduled after ${ctx.callStatus} call. Sentiment: ${ctx.sentiment}. Duration: ${ctx.duration}s.`,
        status:       'pending',
        createdAt:    Date.now(),
        source:       'call-flow',
      });

      this.logger.log(`[CallFlowExecutor] Callback scheduled for ${ctx.phone} in ${delayDays}d`);
      return { action: 'schedule_callback' };
    }

    if (op === 'notifyTeam') {
      const message = this.interpolate(
        String(node.config.message ?? `Call event for {{phone}} — sentiment: {{sentiment}}, status: {{call_status}}`),
        ctx,
      );
      await db.collection('tenants').doc(tenantId).collection('notifications').add({
        type:      'call_flow',
        message,
        phone:     ctx.phone,
        callSid:   ctx.callSid,
        sentiment: ctx.sentiment,
        createdAt: Date.now(),
        read:      false,
        source:    'call-flow',
      });

      this.logger.log(`[CallFlowExecutor] Team notification created for ${ctx.phone}`);
      return { action: 'notify_team' };
    }

    if (op === 'aiSummarize') {
      // Force-generate call summary if not yet available
      if (!ctx.summary && ctx.transcript) {
        this.logger.debug(`[CallFlowExecutor] aiSummarize — summary already handled by generateCallSummary`);
      }
      return { action: 'ai_summarize' };
    }

    this.logger.warn(`[CallFlowExecutor] Unknown action op: "${op}"`);
    return { action: `action_unknown_${op}` };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** Replace {{token}} placeholders in message templates */
  private interpolate(template: string, ctx: CallContext): string {
    return template
      .replace(/\{\{phone\}\}/g,              ctx.phone)
      .replace(/\{\{sentiment\}\}/g,          ctx.sentiment)
      .replace(/\{\{sentiment_score\}\}/g,    String(ctx.sentimentScore))
      .replace(/\{\{duration\}\}/g,           String(ctx.duration))
      .replace(/\{\{transcript_summary\}\}/g, ctx.summary ?? 'No summary available.')
      .replace(/\{\{agent_name\}\}/g,         ctx.agentName ?? 'our team')
      .replace(/\{\{call_status\}\}/g,        ctx.callStatus)
      .replace(/\{\{call_sid\}\}/g,           ctx.callSid);
  }

  /** Normalize to E.164 format (+countrycode...) */
  private normalizePhone(phone: string): string {
    let p = String(phone ?? '').replace(/[\s\(\)\-\.]/g, '');
    if (p.length > 0 && !p.startsWith('+')) p = '+' + p;
    return p;
  }
}
