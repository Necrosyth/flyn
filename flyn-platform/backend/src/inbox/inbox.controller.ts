import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { InboxService } from './inbox.service';
import { ChannelsService } from '../channels/channels.service';
import { buildReplyReferences, ensureRePrefix, parseAddressList } from '../channels/services/email.util';
import { AIProviderService } from '../orchestrator/ai-provider/ai-provider.service';
import { TranslationService } from '../translation/translation.service';
import { AssetsService } from '../assets/assets.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';

/** BCP-47 / ISO code → friendly name, so the LLM translates reliably. Falls back to the raw code. */
const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', hi: 'Hindi', ar: 'Arabic',
  pt: 'Portuguese', it: 'Italian', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  nl: 'Dutch', tr: 'Turkish', pl: 'Polish', id: 'Indonesian', th: 'Thai', vi: 'Vietnamese',
  ur: 'Urdu', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', gu: 'Gujarati',
};

@ApiTags('Inbox')
@Controller('inbox')
@UseGuards(ApiOrFirebaseAuthGuard)
export class InboxController {
  private readonly logger = new Logger(InboxController.name);

  constructor(
    private readonly inboxService: InboxService,
    private readonly channelsService: ChannelsService,
    private readonly aiProvider: AIProviderService,
    private readonly translation: TranslationService,
    private readonly assets: AssetsService,
    private readonly mailboxes: MailboxesService,
  ) {}

  private tenantId(req: AuthRequest): string {
    return (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
  }

  private authorName(req: AuthRequest): string {
    return (req.firebaseUser?.['name'] as string) || req.firebaseUser?.email || 'You';
  }

  /** Validate the conversation belongs to this tenant and return decoded id + parts. */
  private parseConversation(req: AuthRequest, conversationId: string): { tid: string; decoded: string; parts: string[] } {
    const tid = this.tenantId(req);
    const decoded = decodeURIComponent(conversationId);
    if (!decoded.startsWith(tid + ':')) throw new BadRequestException('Conversation not found');
    const parts = decoded.split(':');
    if (parts.length < 3) throw new BadRequestException('Invalid conversationId');
    return { tid, decoded, parts };
  }

  /**
   * MAILBOX PRIVACY GATE for a SINGLE conversation (the IDOR fix). scopeByMailboxAccess only filters
   * the LIST; every detail/action route must independently re-derive the conversation's mailboxId
   * from the store and re-check it against the caller's ACL — never trust a client-supplied id. If
   * the conversation is tagged to a mailbox this user can't access → 404 (never 403; don't leak
   * existence). Untagged conversations (all WhatsApp/Telegram + every pre-mailbox email thread) pass
   * through. MUST be called at the top of every route that reads or mutates one conversation by id.
   */
  private async assertMailboxAccess(tid: string, uid: string, decodedConversationId: string): Promise<void> {
    const mailboxId = await this.inboxService.getConversationMailboxId(tid, decodedConversationId);
    if (!mailboxId) return; // untagged → global to the tenant
    if (!(await this.mailboxes.canAccessMailbox(tid, uid, mailboxId))) {
      throw new NotFoundException('Conversation not found');
    }
  }

  @Get('conversations')
  async getConversations(
    @Req() req: AuthRequest,
    @Query('limit') limit?: string,
  ) {
    const tid = this.tenantId(req);
    const conversations = await this.inboxService.listConversations(tid, limit ? parseInt(limit) : 50);
    return this.scopeByMailboxAccess(tid, req.firebaseUser?.uid, conversations);
  }

  /**
   * MAILBOX PRIVACY GATE. A conversation tagged with a mailboxId is shown ONLY to members who can
   * access that mailbox (MailboxesService ACL — team match or hand-picked uid; owner/admin see all).
   * Untagged conversations (every existing conversation + all WhatsApp/Telegram) are returned
   * unchanged, so this is fully back-compatible. If the org has no mailboxes, it's a no-op.
   */
  private async scopeByMailboxAccess<T extends { mailboxId?: string }>(
    tenantId: string,
    uid: string | undefined,
    conversations: T[],
  ): Promise<T[]> {
    const tagged = conversations.some((c) => !!c.mailboxId);
    if (!tagged || !uid) return conversations; // nothing mailbox-scoped → return as-is
    const allowedIds = new Set((await this.mailboxes.getMailboxesForUser(tenantId, uid)).map((m) => m.id));
    return conversations.filter((c) => !c.mailboxId || allowedIds.has(c.mailboxId));
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Req() req: AuthRequest,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    // conversationId format: {tenantId}:{channel}:{phone} — verify tenantId matches
    const tid = this.tenantId(req);
    if (!conversationId.startsWith(tid + ':')) {
      throw new BadRequestException('Conversation not found');
    }
    await this.assertMailboxAccess(tid, req.firebaseUser.uid, decodeURIComponent(conversationId));
    const messages = await this.inboxService.getMessages(
      decodeURIComponent(conversationId),
      limit ? parseInt(limit) : 100,
    );
    return messages;
  }

  /**
   * Send an email FROM one of the tenant's mailboxes via Brevo. Server enforces the mailbox ACL +
   * active status (never trusts the client); the resulting conversation is mailbox-scoped by the
   * privacy gate. Parallel to the BYO-SMTP reply path — does not touch it.
   */
  @Post('send-as-mailbox')
  @HttpCode(200)
  async sendAsMailbox(
    @Req() req: AuthRequest,
    @Body()
    body: {
      mailboxId: string;
      to: { email: string; name?: string };
      subject: string;
      text: string;
      html?: string;
      inReplyTo?: string;
      references?: string[];
    },
  ) {
    if (!body?.mailboxId) throw new BadRequestException('mailboxId is required');
    if (!body?.to?.email) throw new BadRequestException('A recipient (to.email) is required');
    if (!body?.subject) throw new BadRequestException('A subject is required');
    return this.inboxService.sendAsMailbox({
      tenantId: this.tenantId(req),
      uid: req.firebaseUser.uid,
      mailboxId: body.mailboxId,
      to: body.to,
      subject: body.subject,
      text: body.text || '',
      html: body.html,
      inReplyTo: body.inReplyTo,
      references: body.references,
    });
  }

  /**
   * Presigned GET for an email attachment. Two-layer guard:
   *   1. Tenant isolation — the s3Key MUST be prefixed with the caller's tenantId (uploadBuffer keys
   *      files as `${tenantId}/email/...`), so a tenant can never fetch another tenant's file.
   *   2. Mailbox access — when the owning conversationId is supplied (the FE has it in scope), apply
   *      the same per-conversation gate as getMessages so a member can't presign an attachment on a
   *      mailbox thread they can't see. (Keys are `${tid}/email/${Date.now()}-${uuid8}.ext` — 32
   *      random bits + ms timestamp, and only ever reach the client via the already-gated messages
   *      payload — so this is defense-in-depth, not the sole barrier.)
   */
  @Get('attachment-url')
  async attachmentUrl(
    @Req() req: AuthRequest,
    @Query('key') key: string,
    @Query('conversationId') conversationId?: string,
  ) {
    const tid = this.tenantId(req);
    if (!key || !key.startsWith(`${tid}/`)) throw new BadRequestException('Invalid attachment key');
    if (conversationId) {
      const decoded = decodeURIComponent(conversationId);
      if (decoded.startsWith(tid + ':')) {
        await this.assertMailboxAccess(tid, req.firebaseUser.uid, decoded);
      }
    }
    const url = await this.assets.presignDownload(key, 600);
    return { url };
  }

  @Post('conversations/:conversationId/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Req() req: AuthRequest,
    @Param('conversationId') conversationId: string,
  ) {
    const tid = this.tenantId(req);
    await this.assertMailboxAccess(tid, req.firebaseUser.uid, decodeURIComponent(conversationId));
    await this.inboxService.markRead(tid, decodeURIComponent(conversationId));
    return { success: true };
  }

  @Post('conversations/:conversationId/reply')
  @HttpCode(HttpStatus.OK)
  async sendReply(
    @Req() req: AuthRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: { content: string; subject?: string; cc?: string | string[]; bcc?: string | string[] },
  ) {
    if (!body.content?.trim()) throw new BadRequestException('content is required');

    const tid = this.tenantId(req);
    const decoded = decodeURIComponent(conversationId);
    if (!decoded.startsWith(tid + ':')) throw new BadRequestException('Conversation not found');
    await this.assertMailboxAccess(tid, req.firebaseUser.uid, decoded);

    // Parse conversationId
    // 3-part (legacy): {tenantId}:{channel}:{phone or email}
    // 4-part (multi-account): {tenantId}:{channel}:{channelId}:{phone or email}
    const parts = decoded.split(':');
    if (parts.length < 3) throw new BadRequestException('Invalid conversationId');
    const channel = parts[1].toLowerCase(); // normalise — backend may store 'WHATSAPP' or 'whatsapp'

    let recipientKey: string;
    let targetChannelId: string | undefined;

    if (parts.length >= 4) {
      targetChannelId = parts[2];
      recipientKey = parts.slice(3).join(':');
    } else {
      recipientKey = parts.slice(2).join(':');
    }

    if (channel === 'whatsapp') {
      const contactName = await this.inboxService.resolveContactName(tid, recipientKey);

      const result = await this.channelsService.broadcastWhatsApp(
        tid,
        [{ phone: recipientKey, name: contactName }],
        body.content,
        targetChannelId,
      );

      if (result.sent === 0) {
        return { success: false, error: result.results[0]?.error || 'Failed to send' };
      }
      return { success: true };
    }

    if (channel === 'email') {
      // Thread the reply into the SAME Gmail thread (RFC 5322). Look up the latest real email on
      // this conversation — ANY direction — and reply In-Reply-To it with the full References
      // chain, AND inherit its subject ("Re: <thread subject>") so the thread reads as one
      // conversation. This is what makes one Flyn chat == one Gmail thread: a reply after our own
      // campaign now chains to the campaign instead of starting "Re: Your message" afresh.
      // Under P1b keying the conversationId is a thread token, not the address, so resolve the real
      // recipient from the conversation's stored contactPhone (falls back to the parsed key for
      // legacy address-keyed chats). Use the actual conversationId (decoded) for the thread lookup.
      const ctx = await this.inboxService.getEmailThreadContext(decoded);
      const storedContact = await this.inboxService.getConversationContactPhone(tid, decoded);
      const recipient = (storedContact || recipientKey).toLowerCase().trim();
      const subject =
        body.subject?.trim() || (ctx?.subject ? ensureRePrefix(ctx.subject) : 'Re: Your message');
      const threadHeaders = ctx?.messageId
        ? { inReplyTo: ctx.messageId, references: buildReplyReferences(ctx.references, ctx.messageId) }
        : undefined;
      // Cc/Bcc — parsed + validated; bcc stays hidden from to/cc recipients (connector handles it).
      const cc = parseAddressList(body.cc);
      const bcc = parseAddressList(body.bcc);

      const result = await this.channelsService.broadcastEmail(
        tid,
        [{ email: recipient, name: recipient }],
        body.content,
        subject,
        undefined,
        threadHeaders,
        undefined,
        (cc.length || bcc.length) ? { cc, bcc } : undefined,
      );

      if (result.sent === 0) {
        return { success: false, error: result.results[0]?.error || 'Failed to send email' };
      }

      // NOTE: broadcastEmail now records the outbound email to the inbox itself (single source —
      // also covers campaign sends), so we no longer save it separately here.
      return { success: true };
    }

    // Generic channel reply (Telegram, Facebook, Instagram, Twitter, TikTok, Snapchat, LinkedIn, etc.)
    let channelIdForSend = targetChannelId;
    if (!channelIdForSend) {
      // Legacy 3-part conversationId: find the single active channel of this type
      const tenantChannels = await this.channelsService.getTenantChannels(tid);
      const activeChannel = tenantChannels.find(
        (c: any) => c.type === channel && c.status === 'active',
      );
      if (!activeChannel) {
        return { success: false, error: `No active ${channel} channel connected` };
      }
      channelIdForSend = activeChannel.id;
    }

    const result = await this.channelsService.sendChannelMessage(
      tid, channelIdForSend, recipientKey, body.content,
    );

    if (!result.success) {
      return { success: false, error: result.error || `Failed to send ${channel} message` };
    }

    await this.inboxService.saveOutboundMessage({
      tenantId: tid,
      channel,
      recipientPhone: recipientKey,
      recipientName: recipientKey,
      content: body.content,
      channelId: channelIdForSend,
    });

    return { success: true };
  }

  /** Save an internal note (team-only, never sent to the customer). */
  @Post('conversations/:conversationId/note')
  @HttpCode(HttpStatus.OK)
  async addNote(
    @Req() req: AuthRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: { content: string },
  ) {
    if (!body?.content?.trim()) throw new BadRequestException('content is required');
    const { tid, decoded } = this.parseConversation(req, conversationId);
    await this.assertMailboxAccess(tid, req.firebaseUser.uid, decoded);
    const saved = await this.inboxService.saveNote({
      tenantId: tid,
      conversationId: decoded,
      content: body.content.trim(),
      authorName: this.authorName(req),
    });
    return { success: true, ...saved };
  }

  /**
   * Generate an AI-drafted reply from recent conversation context.
   * NOTE (deviation from the original spec, which placed this in inbox.service.ts): the draft
   * endpoint lives in the CONTROLLER in this codebase, so the fix is applied here.
   *
   * Three things were broken and are fixed:
   *  1. All-outbound threads → an all-`assistant` transcript with no `user` turn. Gemini then
   *     either 400s or free-associates ("I'm a helpful AI assistant…"). We now refuse to draft
   *     when there is no inbound customer message (waitingForCustomer), and we guarantee the
   *     transcript ends on a `user` turn so the system prompt is actually applied.
   *  2. Zero tenant grounding → generic drafts. We inject the tenant business name + the
   *     contact's CRM labels/notes so the draft is specific to this conversation.
   */
  @Post('conversations/:conversationId/ai-draft')
  @HttpCode(HttpStatus.OK)
  async aiDraft(
    @Req() req: AuthRequest,
    @Param('conversationId') conversationId: string,
  ) {
    const { tid, decoded, parts } = this.parseConversation(req, conversationId);
    await this.assertMailboxAccess(tid, req.firebaseUser.uid, decoded);
    const channel = parts[1];
    // Contact is the final segment — canonical 3-part (tid:channel:phone) or legacy 4-part.
    const phone = parts.length >= 4 ? parts.slice(3).join(':') : parts.slice(2).join(':');
    const history = await this.inboxService.getMessages(decoded, 20);

    // Guard: nothing to reply to yet. Surface a calm state, never a hallucinated draft.
    const hasInbound = history.some((m) => m.direction === 'inbound');
    if (!hasInbound) {
      return {
        success: false,
        waitingForCustomer: true,
        error: 'No customer message to reply to yet — waiting for the customer.',
      };
    }

    const transcript = history
      .filter((m) => m.direction === 'inbound' || m.direction === 'outbound')
      .map((m) => ({
        role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      }));
    // Gemini requires the final turn to be `user`, and our provider only injects the system
    // prompt onto user turns. If the thread ends on our own message, append a finalizer turn.
    if (transcript[transcript.length - 1]?.role !== 'user') {
      transcript.push({
        role: 'user',
        content: '[Draft the next reply to the customer based on the conversation above.]',
      });
    }

    const ctx = await this.inboxService.getDraftContext(tid, phone);
    const systemInstruction = [
      `You are a customer-support agent drafting the next reply on behalf of ${ctx.businessName}, on ${channel}.`,
      ctx.contactName ? `The customer's name is ${ctx.contactName}.` : '',
      ctx.tags.length ? `CRM labels for this customer: ${ctx.tags.join(', ')}.` : '',
      ctx.notes ? `Internal notes about this customer: ${ctx.notes}.` : '',
      `Write a SHORT, specific, helpful reply (2-4 sentences) that directly addresses the customer's last message.`,
      `Reply in the customer's language. Do NOT invent facts, prices, names, or availability.`,
      `Do NOT introduce yourself. Do NOT use placeholders like [Name] or [Product].`,
      `Output ONLY the reply text, ready to paste and send.`,
    ]
      .filter(Boolean)
      .join(' ');

    try {
      const res = await this.aiProvider.chat(
        [{ role: 'system', content: systemInstruction }, ...transcript],
        { tenantId: tid, maxTokens: 300 } as any,
      );
      const draft = (res.content || '').trim();
      if (!draft) return { success: false, error: 'The model returned an empty draft. Try again.' };
      return { success: true, draft };
    } catch (err: any) {
      this.logger.error(`AI draft failed: ${err.message}`);
      return { success: false, error: 'Could not generate a draft right now. Try again in a moment.' };
    }
  }

  /** Translate arbitrary text (e.g. an incoming message or a draft). */
  @Post('translate')
  @HttpCode(HttpStatus.OK)
  async translate(@Body() body: { text: string; targetLang?: string }, @Req() req: AuthRequest) {
    if (!body?.text?.trim()) throw new BadRequestException('text is required');
    const target = (body.targetLang || 'en').toLowerCase();
    const langName = LANG_NAMES[target] || target;
    try {
      // Translate via the configured AI provider (Gemini) — no separate Google Translate key needed.
      const res = await this.aiProvider.chat(
        [
          {
            role: 'system',
            content:
              `You are a translation engine. Translate the user's message into ${langName}. ` +
              `Auto-detect the source language. Output ONLY the translated text — no quotes, no notes, ` +
              `no preamble. If it is already in ${langName}, return it unchanged.`,
          },
          { role: 'user', content: body.text },
        ],
        { tenantId: this.tenantId(req), maxTokens: 1000 } as any,
      );
      const translated = (res.content || '').trim();
      if (!translated) return { success: false, error: 'Translation returned empty.' };
      return { success: true, translated, targetLang: target };
    } catch (err: any) {
      this.logger.error(`Translate failed: ${err.message}`);
      return { success: false, error: 'Translation failed.' };
    }
  }

  /** Send a media attachment (already uploaded to S3) to the conversation. */
  @Post('conversations/:conversationId/media')
  @HttpCode(HttpStatus.OK)
  async sendMedia(
    @Req() req: AuthRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: { fileUrl: string; fileName: string; fileType: string; caption?: string },
  ) {
    if (!body?.fileUrl) throw new BadRequestException('fileUrl is required');
    const { tid, parts } = this.parseConversation(req, conversationId);
    await this.assertMailboxAccess(tid, req.firebaseUser.uid, decodeURIComponent(conversationId));
    const channel = parts[1].toLowerCase();
    const targetChannelId = parts.length >= 4 ? parts[2] : undefined;
    const recipientKey = parts.length >= 4 ? parts.slice(3).join(':') : parts.slice(2).join(':');

    // Email: attach the file to a real, threaded email (nodemailer streams from a presigned S3
    // path). Reuses the reply threading so it lands in the same Gmail thread.
    if (channel === 'email') {
      const convId = decodeURIComponent(conversationId);
      const ctx = await this.inboxService.getEmailThreadContext(convId);
      const storedContact = await this.inboxService.getConversationContactPhone(tid, convId);
      const recipient = (storedContact || recipientKey).toLowerCase().trim();
      const subject = ctx?.subject ? ensureRePrefix(ctx.subject) : `Attachment: ${body.fileName}`;
      const threadHeaders = ctx?.messageId
        ? { inReplyTo: ctx.messageId, references: buildReplyReferences(ctx.references, ctx.messageId) }
        : undefined;
      const path = await this.assets.getFetchableUrl(body.fileUrl); // presigned GET for nodemailer
      let s3Key = '';
      try { s3Key = decodeURIComponent(new URL(body.fileUrl).pathname.replace(/^\//, '')); } catch { /* leave '' */ }
      const result = await this.channelsService.broadcastEmail(
        tid,
        [{ email: recipient, name: recipient }],
        body.caption?.trim() || `📎 ${body.fileName}`,
        subject,
        undefined,
        threadHeaders,
        [{ filename: body.fileName, path, contentType: body.fileType, fileUrl: body.fileUrl, s3Key }],
      );
      if (result.sent === 0) return { success: false, error: result.results[0]?.error || 'Failed to send attachment' };
      return { success: true };
    }

    if (channel !== 'whatsapp') {
      return { success: false, error: 'Attachments are supported on WhatsApp and Email only.' };
    }

    const isImage = (body.fileType || '').startsWith('image/');
    // The stored S3 URL is private — Baileys fetches the URL anonymously, so it must be a
    // signed GET URL (otherwise "Failed to fetch stream" / 403).
    const fetchableUrl = await this.assets.getFetchableUrl(body.fileUrl);
    const result = await this.channelsService.sendWhatsAppMedia(
      tid,
      recipientKey,
      {
        url: fetchableUrl,
        type: isImage ? 'image' : 'document',
        fileName: body.fileName,
        mimetype: body.fileType,
        caption: body.caption,
      },
      targetChannelId,
    );
    if (!result.success) return { success: false, error: result.error || 'Failed to send attachment' };

    await this.inboxService.saveOutboundMessage({
      tenantId: tid,
      channel: 'whatsapp',
      recipientPhone: recipientKey,
      recipientName: await this.inboxService.resolveContactName(tid, recipientKey),
      content: body.caption?.trim() || `📎 ${body.fileName}`,
      messageId: result.messageId,
      channelId: targetChannelId,
      mediaUrl: body.fileUrl, // persisted so conversation-delete can remove it from S3
    });
    return { success: true };
  }

  @Patch('conversations/:conversationId/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Req() req: AuthRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: { status: 'open' | 'pending' | 'resolved' },
  ) {
    const validStatuses = ['open', 'pending', 'resolved'];
    if (!validStatuses.includes(body.status)) {
      throw new BadRequestException(`status must be one of: ${validStatuses.join(', ')}`);
    }
    const tid = this.tenantId(req);
    const decoded = decodeURIComponent(conversationId);
    if (!decoded.startsWith(tid + ':')) throw new BadRequestException('Conversation not found');
    await this.assertMailboxAccess(tid, req.firebaseUser.uid, decoded);
    await this.inboxService.updateStatus(tid, decoded, body.status);
    return { success: true };
  }

  // Channels endpoint: return connected channels for this tenant
  @Get('channels')
  async getChannels(@Req() req: AuthRequest) {
    const tid = this.tenantId(req);
    const channels = await this.channelsService.getTenantChannels(tid);
    return channels;
  }

  /**
   * Email receive-capability: true when an active Email channel has IMAP creds (so inbound polls).
   * Lets the UI show a "Receiving not configured" banner for SMTP-only tenants instead of the
   * silent nothing the user hit live. Never returns the credentials themselves.
   */
  @Get('email/receive-status')
  async emailReceiveStatus(@Req() req: AuthRequest) {
    const tid = this.tenantId(req);
    return this.channelsService.getEmailReceiveStatus(tid);
  }

  // ═══ Conversation management — MIRROR-ONLY ops (never touch WhatsApp) ═══════

  /** Export all conversations as CSV. Declared before the :id routes so it isn't shadowed. */
  @Get('conversations/export')
  async exportConversations(@Req() req: AuthRequest, @Res() res: Response, @Query('format') format = 'csv') {
    const tid = this.tenantId(req);
    if (format !== 'csv') throw new BadRequestException('Only format=csv is supported');
    const csv = await this.inboxService.exportConversationsCsv(tid, req.firebaseUser.uid);
    const fname = `flyn-inbox-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${fname}"` });
    res.send(csv);
  }

  /** Mark ALL conversations read. */
  @Patch('conversations/read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@Req() req: AuthRequest) {
    // Scope to the caller's accessible + untagged convs — a member must not zero another mailbox's
    // unread (cross-mailbox mutation). Owner/admin see all, so they still mark everything.
    const result = await this.inboxService.markAllRead(this.tenantId(req), req.firebaseUser.uid);
    return { success: true, ...result };
  }

  /**
   * One-time merge of LID/phone split threads for THIS tenant (idempotent via a marker).
   * NOTE (deviation from spec): no reusable admin guard exists in this codebase, and inventing one
   * is forbidden — so this lives under the inbox's tenant guard. It is safe: tenant-scoped,
   * idempotent, and only merges unique exact-name matches within the caller's own data. It also
   * runs automatically on each WhatsApp (re)connect; this endpoint is a manual trigger.
   */
  @Post('conversations/merge-lid-threads')
  @HttpCode(HttpStatus.OK)
  async mergeLidThreads(@Req() req: AuthRequest) {
    const result = await this.inboxService.mergeLidThreads(this.tenantId(req));
    return { success: true, ...result };
  }

  /**
   * P1b — re-group address-keyed email conversations into thread-keyed ones (one chat == one Gmail
   * thread). Idempotent + marker-guarded; safe to call repeatedly (a second run is a no-op). Run
   * once after enabling EMAIL_THREAD_KEYING to migrate existing data.
   */
  @Post('conversations/migrate-email-threads')
  @HttpCode(HttpStatus.OK)
  async migrateEmailThreads(@Req() req: AuthRequest) {
    const result = await this.inboxService.migrateEmailThreadKeys(this.tenantId(req));
    return { success: true, ...result };
  }

  /** Start a new conversation (optionally sending a first message). */
  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  async startConversation(
    @Req() req: AuthRequest,
    @Body() body: { phoneNumber: string; message?: string; channel?: string },
  ) {
    const tid = this.tenantId(req);
    const channel = (body.channel || 'whatsapp').toLowerCase();
    if (channel !== 'whatsapp') throw new BadRequestException('Only WhatsApp is supported for now');
    if (!body.phoneNumber?.trim()) throw new BadRequestException('phoneNumber is required');
    const phone = this.channelsService.normalizeContactPhone(body.phoneNumber);
    if (!phone) throw new BadRequestException('Invalid phone number');

    const existing = await this.inboxService.findConversationByPhone(tid, channel, phone);
    const conversationId = `${tid}:${channel}:${phone}`;

    if (body.message?.trim()) {
      const contactName = await this.inboxService.resolveContactName(tid, phone);
      const result = await this.channelsService.broadcastWhatsApp(tid, [{ phone, name: contactName }], body.message.trim());
      if (result.sent === 0) {
        return { success: false, error: result.results[0]?.error || 'Failed to send first message' };
      }
      // broadcastWhatsApp's saveOutboundMessage created the row; clear any prior tombstone.
      await this.inboxService.removeTombstone(tid, conversationId);
    } else {
      await this.inboxService.createBareConversation(tid, channel, phone);
    }
    return { success: true, conversationId, isNew: !existing };
  }

  /** Delete ALL conversations for this tenant (mirror wipe). Requires confirmed:true. */
  @Delete('conversations')
  @HttpCode(HttpStatus.OK)
  async deleteAllConversations(@Req() req: AuthRequest, @Body() body: { confirmed?: boolean }) {
    if (body?.confirmed !== true) {
      throw new BadRequestException('Pass confirmed:true to delete all conversations. This cannot be undone.');
    }
    const result = await this.inboxService.deleteAllConversations(this.tenantId(req));
    return { success: true, ...result };
  }

  /** Delete ONE conversation (mirror wipe — Dynamo + Firestore + S3, then tombstone). */
  @Delete('conversations/:conversationId')
  @HttpCode(HttpStatus.OK)
  async deleteConversation(@Req() req: AuthRequest, @Param('conversationId') conversationId: string) {
    const { tid, decoded } = this.parseConversation(req, conversationId);
    await this.assertMailboxAccess(tid, req.firebaseUser.uid, decoded);
    const result = await this.inboxService.deleteConversation(tid, decoded);
    return { success: true, ...result };
  }
}
