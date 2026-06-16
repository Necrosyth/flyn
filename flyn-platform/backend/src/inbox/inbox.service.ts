import { Injectable, Logger, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  GetItemCommand,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { FirebaseService } from '../firebase/firebase.service';
import { AssetsService } from '../assets/assets.service';
import { jlog } from '../common/structured-log';
import type { EmailAttachmentMeta } from '../channels/services/email.util';
import { emailThreadConversationToken, deriveEmailThreadKey, normalizeReferences, sanitizeEmailHtml } from '../channels/services/email.util';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { EmailBrandingService } from '../branding/email-branding.service';
import { applyEmailBranding } from '../branding/email-branding.util';
import { BrevoService } from '../brevo/brevo.service';

/** P1b dark-launch flag — when 'true', email conversations are keyed by thread (deriveEmailThreadKey
 *  → token) instead of by address, so one Flyn chat == one Gmail thread. Default OFF = address-keyed
 *  (unchanged, WhatsApp-safe). */
const EMAIL_THREAD_KEYING = process.env.EMAIL_THREAD_KEYING === 'true';

const CONVERSATIONS_TABLE = 'flyn-conversations';
const MESSAGES_TABLE = 'flyn-messages';
// Tombstones: a conversation deleted from Flyn's mirror. Blocks WhatsApp history re-sync from
// resurrecting it, while still allowing a genuinely NEW live message to start a fresh thread.
const DELETED_CONVERSATIONS_TABLE = process.env.DELETED_CONVERSATIONS_TABLE || 'flyn-deleted-conversations';
// One-time migration run markers (PK tenantId, SK migration). Guards idempotency.
const MIGRATION_MARKERS_TABLE = process.env.MIGRATION_MARKERS_TABLE || 'flyn-migration-markers';
const LID_MERGE_MIGRATION = 'lid-merge-v1';
const EMAIL_THREAD_MIGRATION = 'email-thread-key-v1';
// LIDs are long (~15+ digits); real E.164 phones are almost always ≤14. A conversation whose
// contact segment is ≥15 digits is treated as a LID candidate for the merge.
const LID_DIGIT_THRESHOLD = 15;
const GSI_NAME = 'tenantId-lastMsgAt-index';

// Dead-letter queue for inbound saves that fail on DynamoDB. Account id is non-secret (already
// throughout the repo). Overridable via env. The queue is created by infra (flyn-inbox-dlq).
const INBOX_DLQ_URL =
  process.env.INBOX_DLQ_URL ||
  `https://sqs.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/786150347998/flyn-inbox-dlq`;

export interface InboxMessage {
  id: string;
  conversationId: string;
  content: string;
  direction: 'inbound' | 'outbound';
  senderName: string;
  senderPhone?: string;
  channel: string;
  timestamp: number;
  status?: string;
  /** email-only — present so the thread can render like Gmail (P3). Undefined for WhatsApp. */
  subject?: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string[];
  emailThreadId?: string;
  attachments?: EmailAttachmentMeta[];
  cc?: string[];
  bcc?: string[];
}

export interface InboxConversation {
  conversationId: string;
  tenantId: string;
  contactPhone: string;
  contactName: string;
  channel: string;
  lastMsgAt: number;
  lastMessageText: string;
  unreadCount: number;
  status: 'open' | 'resolved';
  /** email-only: the org mailbox this conversation belongs to (set by mailbox receive-wiring).
   *  Absent on all existing conversations + WhatsApp → those stay visible to everyone (back-compat).
   *  When present, the user-facing inbox endpoint shows it ONLY to members who can access that
   *  mailbox (MailboxesService ACL). */
  mailboxId?: string;
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  private readonly dynamo: DynamoDBClient | null = (() => {
    const keyId = process.env.AWS_ACCESS_KEY_ID;
    const secret = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'us-east-1';

    if (keyId && secret) {
      return new DynamoDBClient({
        region,
        credentials: {
          accessKeyId: keyId,
          secretAccessKey: secret,
          ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
        },
      });
    }

    // Fallback to IAM roles / default provider if in production or explicitly enabled
    if (process.env.NODE_ENV === 'production' || process.env.AWS_EXECUTION_ENV || process.env.ENABLE_DYNAMODB === 'true') {
      return new DynamoDBClient({ region });
    }

    return null;
  })();

  // SQS client for the inbound dead-letter queue. Mirrors the DynamoDB credential resolution
  // (static keys in dev, IAM role in prod) so it's available exactly when Dynamo is.
  private readonly sqs: SQSClient | null = (() => {
    const region = process.env.AWS_REGION || 'us-east-1';
    const keyId = process.env.AWS_ACCESS_KEY_ID;
    const secret = process.env.AWS_SECRET_ACCESS_KEY;
    if (keyId && secret) {
      return new SQSClient({
        region,
        credentials: {
          accessKeyId: keyId,
          secretAccessKey: secret,
          ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
        },
      });
    }
    if (process.env.NODE_ENV === 'production' || process.env.AWS_EXECUTION_ENV || process.env.ENABLE_DYNAMODB === 'true') {
      return new SQSClient({ region });
    }
    return null;
  })();

  constructor(
    private readonly firebase: FirebaseService,
    private readonly assets: AssetsService,
    private readonly mailboxes: MailboxesService,
    private readonly emailBranding: EmailBrandingService,
    private readonly brevo: BrevoService,
  ) {
    if (this.dynamo) {
      this.logger.log(jlog({ event: 'inbox_store_init', store: 'dynamodb' }));
    } else {
      this.logger.warn(jlog({ event: 'inbox_store_init', store: 'firestore_fallback', reason: 'dynamo_not_configured' }));
    }
  }

  /**
   * Dead-letter a failed inbound save. Writes the raw payload to SQS (flyn-inbox-dlq) so a
   * message that DynamoDB rejected is never lost silently — a queue depth > 0 trips a
   * CloudWatch alarm. Best-effort: a DLQ failure is logged but never blocks the Firestore
   * fallback (we still want the message stored somewhere).
   */
  private async sendToDlq(
    payload: Record<string, unknown>,
    opName: string,
    reason: string,
    meta?: { tenantId?: string; conversationId?: string; direction?: string },
  ): Promise<void> {
    if (!this.sqs) {
      this.logger.warn(jlog({ event: 'dlq_skipped', op: opName, reason: 'sqs_not_configured', tenantId: meta?.tenantId, conversationId: meta?.conversationId }));
      return;
    }
    try {
      await this.sqs.send(new SendMessageCommand({
        QueueUrl: INBOX_DLQ_URL,
        MessageBody: JSON.stringify({ op: opName, reason, ts: Date.now(), ...meta, payload }),
      }));
      this.logger.warn(jlog({ event: 'inbound_dlq_enqueued', op: opName, tenantId: meta?.tenantId, conversationId: meta?.conversationId, direction: meta?.direction, reason }));
    } catch (e: any) {
      this.logger.error(jlog({ event: 'dlq_send_failed', op: opName, tenantId: meta?.tenantId, conversationId: meta?.conversationId, error: e.message }));
    }
  }

  private async executeWithFallback<T>(
    dynamoOp: () => Promise<T>,
    firestoreOp: () => Promise<T>,
    opName: string,
    meta?: {
      tenantId?: string;
      conversationId?: string;
      direction?: 'inbound' | 'outbound' | 'note';
      /** When set, the raw payload is dead-lettered to SQS before the Firestore fallback. */
      dlqPayload?: Record<string, unknown>;
    },
  ): Promise<T> {
    if (this.dynamo) {
      try {
        return await dynamoOp();
      } catch (err: any) {
        this.logger.error(jlog({
          event: 'dynamo_op_failed',
          op: opName,
          tenantId: meta?.tenantId,
          conversationId: meta?.conversationId,
          direction: meta?.direction,
          error: err.message,
          fallback: 'firestore',
        }));
        // Dead-letter the raw payload BEFORE falling back, so a failed inbound save is never
        // lost silently — this is exactly how the marshall bug stayed invisible. Best-effort.
        if (meta?.dlqPayload) {
          await this.sendToDlq(meta.dlqPayload, opName, err.message, meta);
        }
        // Continue to firestore fallback
      }
    }
    return await firestoreOp();
  }

  // ─── Contact name resolution ───────────────────────────────────────────────

  /** Look up a phone number in the tenant's phonebook and return the contact's name + id. */
  async resolveContact(tenantId: string, phone: string): Promise<{ name: string; contactId?: string }> {
    try {
      const normalized = phone.replace(/\D/g, '');
      const snap = await this.firebase.firestore()
        .collection('tenants').doc(tenantId)
        .collection('phonebookContacts')
        .where('phone', '>=', normalized.slice(-10)) // match last 10 digits
        .limit(5)
        .get();

      for (const doc of snap.docs) {
        const data = doc.data();
        const docPhone = (data.phone || '').replace(/\D/g, '');
        if (docPhone.endsWith(normalized.slice(-10))) {
          return { name: data.name || phone, contactId: doc.id };
        }
      }
    } catch (err: any) {
      this.logger.warn(jlog({ event: 'resolve_contact_failed', tenantId, phone, error: err.message }));
    }
    return { name: phone };
  }

  async resolveContactName(tenantId: string, phone: string): Promise<string> {
    const { name } = await this.resolveContact(tenantId, phone);
    return name;
  }

  /**
   * Idempotency check — has this provider message id already been stored on this
   * conversation? Used to drop Baileys reconnect redeliveries. Fails OPEN (returns false)
   * so a check error never costs us a real message.
   */
  private async inboundExists(conversationId: string, providerMsgId: string): Promise<boolean> {
    try {
      if (this.dynamo) {
        const res = await this.dynamo.send(new QueryCommand({
          TableName: MESSAGES_TABLE,
          KeyConditionExpression: 'conversationId = :cid',
          FilterExpression: 'id = :mid',
          ExpressionAttributeValues: marshall({ ':cid': conversationId, ':mid': providerMsgId }),
          ScanIndexForward: false, // newest first — a redelivery is always recent
          Limit: 50,
        }));
        return (res.Items?.length ?? 0) > 0;
      }
      const tid = conversationId.split(':')[0];
      const snap = await this.firebase.firestore()
        .collection('tenants').doc(tid)
        .collection('inboxConversations').doc(conversationId)
        .collection('messages').where('id', '==', providerMsgId).limit(1).get();
      return !snap.empty;
    } catch (err: any) {
      this.logger.warn(jlog({ event: 'inbound_dedup_check_failed', conversationId, providerMsgId, error: err.message, note: 'proceeding with save' }));
      return false; // never lose a message because the dedup check failed
    }
  }

  /**
   * Assemble grounding context for an AI-drafted reply: the tenant's business name and the
   * contact's CRM labels/notes (best-effort). NOTE: conversations carry no agentId and there
   * is no top-level `contacts` collection in this codebase — labels live on the phonebook
   * contact doc, so we read them from there. All reads fail-soft to sensible defaults.
   */
  async getDraftContext(
    tenantId: string,
    phone: string,
  ): Promise<{ businessName: string; contactName?: string; tags: string[]; notes?: string }> {
    const db = this.firebase.firestore();
    let businessName = 'our team';
    let contactName: string | undefined;
    let tags: string[] = [];
    let notes: string | undefined;

    try {
      const t = await db.collection('tenants').doc(tenantId).get();
      const td = (t.data() || {}) as Record<string, any>;
      businessName = td.businessName || td.companyName || td.name || businessName;
    } catch (err: any) {
      this.logger.warn(jlog({ event: 'draft_ctx_tenant_read_failed', tenantId, error: err.message }));
    }

    try {
      const { name, contactId } = await this.resolveContact(tenantId, phone);
      contactName = name && name !== phone ? name : undefined;
      if (contactId) {
        const c = await db.collection('tenants').doc(tenantId)
          .collection('phonebookContacts').doc(contactId).get();
        const cd = (c.data() || {}) as Record<string, any>;
        tags = Array.isArray(cd.tags) ? cd.tags : Array.isArray(cd.labels) ? cd.labels : [];
        notes = typeof cd.notes === 'string' && cd.notes.trim() ? cd.notes.trim().slice(0, 280) : undefined;
      }
    } catch (err: any) {
      this.logger.warn(jlog({ event: 'draft_ctx_contact_read_failed', tenantId, phone, error: err.message }));
    }

    return { businessName, contactName, tags, notes };
  }

  // ─── Save inbound message ──────────────────────────────────────────────────

  async saveInboundMessage(params: {
    tenantId: string;
    channel: string;
    senderPhone: string;
    senderName: string;
    content: string;
    externalMessageId?: string;
    subject?: string;
    contactId?: string;
    channelId?: string;
    /** true when this came from a WhatsApp HISTORY re-sync (not a live message). */
    isHistory?: boolean;
    /** the message's REAL time (ms). When set, used instead of Date.now() so history sorts right. */
    createdAtMs?: number;
    /** email-only: sanitized rich HTML body (renders like Gmail). Undefined for WhatsApp. */
    bodyHtml?: string;
    /** email-only: parent Message-ID this email replied to (In-Reply-To header). */
    inReplyTo?: string;
    /** email-only: full References chain of Message-IDs (for thread keying in P1). */
    references?: string[];
    /** email-only: derived stable thread key (set in P1). */
    emailThreadId?: string;
    /** email-only: S3-backed attachment metadata (served via presigned GET). */
    attachments?: EmailAttachmentMeta[];
    /** email-only: Cc addresses on the received email (shown so the user sees who else was on it). */
    cc?: string[];
    /** mailbox this email was received AT — tags the conversation so the inbox privacy gate scopes it. */
    mailboxId?: string;
  }): Promise<void> {
    const { tenantId, channel: rawChannel, senderPhone, senderName, content, externalMessageId, subject, contactId, channelId, isHistory, createdAtMs, bodyHtml, inReplyTo, references, emailThreadId, attachments, cc, mailboxId } = params;
    const channel = rawChannel.toLowerCase(); // always store lowercase
    // CANONICAL CONVERSATION KEY — (tenant, channel, contact) ONLY.
    // channelId is per-session transport identity (which WhatsApp line/QR session handled
    // the message) and is INTENTIONALLY EXCLUDED from the key. Including it split the same
    // human conversation across QR re-scans / redeploys, so inbound replies landed in a
    // different bucket than the outbound thread. channelId is still persisted as an
    // attribute below (message + conversation) for reply routing. See the
    // merge-split-conversations.ts backfill that collapses pre-existing 4-part keys.
    //
    // P1b (email only, flag-gated): key by THREAD token instead of address so two subjects from one
    // person are two chats and one thread across aliases is one chat. contactPhone still stores the
    // address (for reply + display). WhatsApp/default path is byte-identical.
    const emailThreadKeyed = EMAIL_THREAD_KEYING && channel === 'email' && !!emailThreadId;
    const contactKey = emailThreadKeyed ? emailThreadConversationToken(emailThreadId!) : senderPhone;
    const conversationId = `${tenantId}:${channel}:${contactKey}`;

    // Real message time (ms) when known — so a history message keeps its original timestamp and
    // sorts correctly within the thread (the `sk` is time-prefixed). Falls back to now() for live.
    const now = createdAtMs && createdAtMs > 0 ? createdAtMs : Date.now();
    const msgId = externalMessageId || `${now}-${Math.random().toString(36).slice(2, 8)}`;
    const sk = `${String(now).padStart(15, '0')}#${msgId}`;

    // Idempotency — Baileys redelivers recent messages on every socket reconnect. If this
    // provider message id was already stored on this conversation, skip (prevents dup rows).
    if (externalMessageId && (await this.inboundExists(conversationId, externalMessageId))) {
      this.logger.debug(`[Inbox] Duplicate inbound ${externalMessageId} skipped for ${conversationId}`);
      return;
    }

    // Tombstone guard — the conversation was deleted from Flyn's mirror.
    //  • HISTORY re-sync of a deleted chat → skip (do NOT resurrect it).
    //  • a genuinely NEW live message → lift the tombstone and start the chat fresh.
    if (await this.isTombstoned(tenantId, conversationId)) {
      if (isHistory) {
        this.logger.log(jlog({ event: 'wa_ingest_skipped_tombstone', tenantId, conversationId }));
        return;
      }
      await this.removeTombstone(tenantId, conversationId);
      this.logger.log(jlog({ event: 'wa_tombstone_pierced_by_live_message', tenantId, conversationId }));
    }

    return this.executeWithFallback(
      async () => {
        // Write message
        await this.dynamo!.send(new PutItemCommand({
          TableName: MESSAGES_TABLE,
          // removeUndefinedValues: WhatsApp messages have no `subject`, so it is undefined.
          // Without this flag marshall() THROWS, the whole inbound save fails over to Firestore,
          // and since reads come from DynamoDB the customer's reply becomes invisible. This was
          // THE reason inbound replies never showed in the inbox.
          Item: marshall({
            conversationId,
            sk,
            id: msgId,
            content,
            subject,
            direction: 'inbound',
            senderName,
            senderPhone,
            channel,
            timestamp: now,
            ...(contactId ? { contactId } : {}),
            ...(channelId ? { channelId } : {}),
            // email-only enrichments — absent on WhatsApp, so the row stays byte-identical there.
            ...(bodyHtml ? { bodyHtml } : {}),
            ...(inReplyTo ? { inReplyTo } : {}),
            ...(references?.length ? { references } : {}),
            ...(emailThreadId ? { emailThreadId } : {}),
            ...(attachments?.length ? { attachments } : {}),
            ...(cc?.length ? { cc } : {}),
            ...(mailboxId ? { mailboxId } : {}),
          }, { removeUndefinedValues: true }),
        }));

        // Upsert conversation.
        //  • LIVE  → advance the head (lastMsgAt/lastMessageText) + increment unread.
        //  • HISTORY → only ensure the conversation EXISTS (if_not_exists everything) — never
        //    inflate unread with old messages, never drag an active conversation's head backward.
        await this.dynamo!.send(new UpdateItemCommand(
          isHistory
            ? {
                TableName: CONVERSATIONS_TABLE,
                Key: marshall({ tenantId, sk: conversationId }),
                UpdateExpression: `SET conversationId = if_not_exists(conversationId, :cid),
                  contactPhone = if_not_exists(contactPhone, :phone), contactName = if_not_exists(contactName, :name),
                  #ch = if_not_exists(#ch, :ch), #st = if_not_exists(#st, :open),
                  lastMsgAt = if_not_exists(lastMsgAt, :t), lastMessageText = if_not_exists(lastMessageText, :txt),
                  unreadCount = if_not_exists(unreadCount, :zero)
                  ${contactId ? ', contactId = if_not_exists(contactId, :pbid)' : ''}
                  ${channelId ? ', channelId = if_not_exists(channelId, :chid)' : ''}
                  ${mailboxId ? ', mailboxId = if_not_exists(mailboxId, :mbid)' : ''}`,
                ExpressionAttributeNames: { '#ch': 'channel', '#st': 'status' },
                ExpressionAttributeValues: marshall({
                  ':cid': conversationId, ':phone': senderPhone, ':name': senderName, ':ch': channel,
                  ':open': 'open', ':t': now, ':txt': content.slice(0, 200), ':zero': 0,
                  ...(contactId ? { ':pbid': contactId } : {}),
                  ...(channelId ? { ':chid': channelId } : {}),
                  ...(mailboxId ? { ':mbid': mailboxId } : {}),
                }),
              }
            : {
                TableName: CONVERSATIONS_TABLE,
                Key: marshall({ tenantId, sk: conversationId }),
                UpdateExpression: `SET lastMsgAt = :t, lastMessageText = :txt, contactPhone = :phone,
                  contactName = :name, #ch = :ch, #st = if_not_exists(#st, :open),
                  conversationId = if_not_exists(conversationId, :cid)
                  ${contactId ? ', contactId = :pbid' : ''}
                  ${channelId ? ', channelId = :chid' : ''}
                  ${mailboxId ? ', mailboxId = if_not_exists(mailboxId, :mbid)' : ''}
                  ADD unreadCount :one`,
                ExpressionAttributeNames: { '#ch': 'channel', '#st': 'status' },
                ExpressionAttributeValues: marshall({
                  ':t': now, ':txt': content.slice(0, 200), ':phone': senderPhone, ':name': senderName,
                  ':ch': channel, ':open': 'open', ':one': 1, ':cid': conversationId,
                  ...(contactId ? { ':pbid': contactId } : {}),
                  ...(channelId ? { ':chid': channelId } : {}),
                  ...(mailboxId ? { ':mbid': mailboxId } : {}),
                }),
              },
        ));
      },
      async () => {
        this.logger.log(`InboxService: Saving inbound message to Firestore fallback for tenant ${tenantId} (sender: ${senderPhone})`);
        const db = this.firebase.firestore();
        const tenantRef = db.collection('tenants').doc(tenantId);
        
        // Store message
        await tenantRef.collection('inboxConversations').doc(conversationId)
          .collection('messages').doc(sk).set({
            id: msgId,
            conversationId,
            content,
            subject,
            direction: 'inbound',
            senderName,
            senderPhone,
            channel,
            timestamp: now,
            ...(contactId ? { contactId } : {}),
            ...(channelId ? { channelId } : {}),
            ...(bodyHtml ? { bodyHtml } : {}),
            ...(inReplyTo ? { inReplyTo } : {}),
            ...(references?.length ? { references } : {}),
            ...(emailThreadId ? { emailThreadId } : {}),
            ...(attachments?.length ? { attachments } : {}),
            ...(cc?.length ? { cc } : {}),
            ...(mailboxId ? { mailboxId } : {}),
          });

        // Update conversation
        await tenantRef.collection('inboxConversations').doc(conversationId).set({
          conversationId,
          tenantId,
          contactPhone: senderPhone,
          contactName: senderName,
          channel,
          lastMsgAt: now,
          lastMessageText: content.slice(0, 200),
          status: 'open',
          unreadCount: (admin.firestore?.FieldValue?.increment(1) as any) || 1,
          ...(contactId ? { contactId } : {}),
          ...(channelId ? { channelId } : {}),
          ...(mailboxId ? { mailboxId } : {}),
        }, { merge: true });

        this.logger.log(`InboxService: Successfully saved inbound message to Firestore for tenant ${tenantId}`);
      },
      'saveInboundMessage',
      {
        tenantId,
        conversationId,
        direction: 'inbound',
        // Raw inbound payload — dead-lettered to SQS if the DynamoDB write throws.
        dlqPayload: { ...params, conversationId, sk },
      },
    );
  }

  // ─── Save outbound message ─────────────────────────────────────────────────

  async saveOutboundMessage(params: {
    tenantId: string;
    channel: string;
    recipientPhone: string;
    recipientName: string;
    content: string;
    messageId?: string;
    channelId?: string;
    /** S3 URL of an attachment sent with this message — persisted so conversation-delete can remove it from S3. */
    mediaUrl?: string;
    /** the message's REAL time (ms) — set for our-own messages synced back from WhatsApp. */
    createdAtMs?: number;
    /** true when this is from a WhatsApp HISTORY re-sync of our own past messages. */
    isHistory?: boolean;
    /** email-only: subject of the sent mail (renders as the row's thread title in P3). */
    subject?: string;
    /** email-only: sanitized rich HTML body we sent. */
    bodyHtml?: string;
    /** email-only: parent Message-ID we replied to (In-Reply-To we set on the outbound mail). */
    inReplyTo?: string;
    /** email-only: References chain we set on the outbound mail. */
    references?: string[];
    /** email-only: derived stable thread key (set in P1). */
    emailThreadId?: string;
    /** delivery status of the send. Defaults to 'sent'; pass 'failed' to surface a failed send. */
    status?: string;
    /** email-only: S3-backed attachment metadata (served via presigned GET). */
    attachments?: EmailAttachmentMeta[];
    /** email-only: Cc addresses (shown on the sent row). */
    cc?: string[];
    /** email-only: Bcc addresses — the sender's PRIVATE record; never shown on inbound. */
    bcc?: string[];
    /** mailbox this was sent AS — tags the conversation so the inbox privacy gate scopes it. */
    mailboxId?: string;
  }): Promise<void> {
    const { tenantId, channel: rawChannel, recipientPhone, recipientName, content, messageId, channelId, mediaUrl, createdAtMs, isHistory, subject, bodyHtml, inReplyTo, references, emailThreadId, attachments, cc, bcc, mailboxId } = params;
    const sendStatus = params.status || 'sent';
    const channel = rawChannel.toLowerCase(); // always store lowercase
    // CANONICAL CONVERSATION KEY — must match saveInboundMessage exactly: (tenant, channel,
    // contact) only. channelId excluded from the key, stored as an attribute below. This is
    // what guarantees an outbound reply lands in the SAME thread as the customer's inbound.
    // P1b (email only, flag-gated): key by THREAD token; contactPhone keeps the address. See
    // saveInboundMessage for the rationale. Default/ WhatsApp path unchanged.
    const emailThreadKeyed = EMAIL_THREAD_KEYING && channel === 'email' && !!emailThreadId;
    const contactKey = emailThreadKeyed ? emailThreadConversationToken(emailThreadId!) : recipientPhone;
    const conversationId = `${tenantId}:${channel}:${contactKey}`;

    const now = createdAtMs && createdAtMs > 0 ? createdAtMs : Date.now();
    const msgId = messageId || `${now}-${Math.random().toString(36).slice(2, 8)}`;
    const sk = `${String(now).padStart(15, '0')}#${msgId}`;

    // Dedup our-own synced messages (WhatsApp redelivers on reconnect / history re-sync). App-sent
    // messages use a unique bc_ id and won't match. Reuses the by-id existence check.
    if (messageId && (await this.inboundExists(conversationId, messageId))) {
      this.logger.debug(`[Inbox] Duplicate outbound ${messageId} skipped for ${conversationId}`);
      return;
    }

    return this.executeWithFallback(
      async () => {
        await this.dynamo!.send(new PutItemCommand({
          TableName: MESSAGES_TABLE,
          Item: marshall({
            conversationId,
            sk,
            id: msgId,
            content,
            direction: 'outbound',
            senderName: 'You',
            senderPhone: '',
            channel,
            timestamp: now,
            status: sendStatus,
            ...(channelId ? { channelId } : {}),
            ...(mediaUrl ? { mediaUrl } : {}),
            // email-only enrichments — absent on WhatsApp, so the row stays byte-identical there.
            ...(subject ? { subject } : {}),
            ...(bodyHtml ? { bodyHtml } : {}),
            ...(inReplyTo ? { inReplyTo } : {}),
            ...(references?.length ? { references } : {}),
            ...(emailThreadId ? { emailThreadId } : {}),
            ...(attachments?.length ? { attachments } : {}),
            ...(cc?.length ? { cc } : {}),
            ...(bcc?.length ? { bcc } : {}),
            ...(mailboxId ? { mailboxId } : {}),
          }, { removeUndefinedValues: true }),
        }));

        // HISTORY (our own past messages) → only ensure the conversation exists; never drag an
        // active head backward. LIVE → advance the head as before.
        await this.dynamo!.send(new UpdateItemCommand(
          isHistory
            ? {
                TableName: CONVERSATIONS_TABLE,
                Key: marshall({ tenantId, sk: conversationId }),
                UpdateExpression: `SET conversationId = if_not_exists(conversationId, :cid),
                  contactPhone = if_not_exists(contactPhone, :phone), contactName = if_not_exists(contactName, :name),
                  #ch = if_not_exists(#ch, :ch), #st = if_not_exists(#st, :open),
                  lastMsgAt = if_not_exists(lastMsgAt, :t), lastMessageText = if_not_exists(lastMessageText, :txt),
                  unreadCount = if_not_exists(unreadCount, :zero)
                  ${channelId ? ', channelId = if_not_exists(channelId, :chid)' : ''}
                  ${mailboxId ? ', mailboxId = if_not_exists(mailboxId, :mbid)' : ''}`,
                ExpressionAttributeNames: { '#ch': 'channel', '#st': 'status' },
                ExpressionAttributeValues: marshall({
                  ':cid': conversationId, ':phone': recipientPhone, ':name': recipientName, ':ch': channel,
                  ':open': 'open', ':t': now, ':txt': `You: ${content.slice(0, 180)}`, ':zero': 0,
                  ...(channelId ? { ':chid': channelId } : {}),
                  ...(mailboxId ? { ':mbid': mailboxId } : {}),
                }),
              }
            : {
                TableName: CONVERSATIONS_TABLE,
                Key: marshall({ tenantId, sk: conversationId }),
                UpdateExpression: `SET lastMsgAt = :t, lastMessageText = :txt, contactPhone = :phone,
                  contactName = :name, #ch = :ch, #st = if_not_exists(#st, :open),
                  conversationId = if_not_exists(conversationId, :cid), unreadCount = if_not_exists(unreadCount, :zero)
                  ${channelId ? ', channelId = :chid' : ''}
                  ${mailboxId ? ', mailboxId = if_not_exists(mailboxId, :mbid)' : ''}`,
                ExpressionAttributeNames: { '#ch': 'channel', '#st': 'status' },
                ExpressionAttributeValues: marshall({
                  ':t': now, ':txt': `You: ${content.slice(0, 180)}`, ':phone': recipientPhone,
                  ':name': recipientName, ':ch': channel, ':open': 'open', ':cid': conversationId, ':zero': 0,
                  ...(channelId ? { ':chid': channelId } : {}),
                  ...(mailboxId ? { ':mbid': mailboxId } : {}),
                }),
              },
        ));
      },
      async () => {
        this.logger.log(`InboxService: Saving outbound message to Firestore fallback for tenant ${tenantId} (recipient: ${recipientPhone})`);
        const db = this.firebase.firestore();
        const tenantRef = db.collection('tenants').doc(tenantId);

        await tenantRef.collection('inboxConversations').doc(conversationId)
          .collection('messages').doc(sk).set({
            id: msgId,
            conversationId,
            content,
            direction: 'outbound',
            senderName: 'You',
            senderPhone: '',
            channel,
            timestamp: now,
            status: sendStatus,
            ...(mediaUrl ? { mediaUrl } : {}),
            ...(subject ? { subject } : {}),
            ...(bodyHtml ? { bodyHtml } : {}),
            ...(inReplyTo ? { inReplyTo } : {}),
            ...(references?.length ? { references } : {}),
            ...(emailThreadId ? { emailThreadId } : {}),
            ...(attachments?.length ? { attachments } : {}),
            ...(cc?.length ? { cc } : {}),
            ...(bcc?.length ? { bcc } : {}),
            ...(mailboxId ? { mailboxId } : {}),
          });

        await tenantRef.collection('inboxConversations').doc(conversationId).set({
          conversationId,
          tenantId,
          contactPhone: recipientPhone,
          contactName: recipientName,
          channel,
          lastMsgAt: now,
          lastMessageText: `You: ${content.slice(0, 180)}`,
          status: 'open',
          unreadCount: 0,
          ...(mailboxId ? { mailboxId } : {}),
        }, { merge: true });

        this.logger.log(`InboxService: Successfully saved outbound message to Firestore for tenant ${tenantId}`);
      },
      'saveOutboundMessage',
      { tenantId, conversationId, direction: 'outbound' },
    );
  }

  // ─── Send AS a tenant mailbox (Brevo transactional) ────────────────────────

  /**
   * Send an email FROM a Flyn-provisioned tenant mailbox via Brevo's transactional API — a PARALLEL
   * branch to ChannelsService.broadcastEmail (which sends through the tenant's connected SMTP).
   * Here the envelope From IS the mailbox address, DKIM-signed by Brevo against the tenant's
   * sending-authenticated domain. Server enforces the ACL (canSendAs) AND mailbox.status==='active'
   * — never trust the client. The recorded outbound row is TAGGED with mailboxId so the inbox
   * privacy gate scopes the resulting conversation to members who can access that mailbox.
   */
  async sendAsMailbox(params: {
    tenantId: string;
    uid: string;
    mailboxId: string;
    to: { email: string; name?: string };
    subject: string;
    text: string;
    html?: string;
    inReplyTo?: string;
    references?: string[];
  }): Promise<{ messageId: string; mailboxId: string; from: string }> {
    const { tenantId, uid, mailboxId, subject, text, html, inReplyTo } = params;
    if (!this.brevo.isConfigured()) {
      throw new BadRequestException('Email sending is not configured on this server (BREVO_API_KEY missing).');
    }
    const references = normalizeReferences(params.references);
    const recipient = { email: (params.to?.email || '').toLowerCase().trim(), name: params.to?.name };
    if (!recipient.email) throw new BadRequestException('A recipient email is required.');

    const mailbox = await this.mailboxes.getMailbox(tenantId, mailboxId);
    if (!mailbox) throw new NotFoundException('Mailbox not found');
    // ACL — the user must have access to this mailbox (team match / hand-picked / owner-admin).
    if (!(await this.mailboxes.canSendAs(tenantId, uid, mailbox.address))) {
      throw new ForbiddenException('You do not have access to send from this mailbox.');
    }
    // Deliverability — the mailbox is only sendable once its domain is sending-authenticated.
    if (mailbox.status !== 'active') {
      throw new BadRequestException('This mailbox is not active yet — authenticate its domain for sending first.');
    }

    const branding = await this.emailBranding.resolveTenantEmailBranding(tenantId);
    const brandedHtml = html ? applyEmailBranding(html, branding) : undefined;
    const headers: Record<string, string> = {};
    if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
    if (references.length) headers['References'] = references.join(' ');

    const res = await this.brevo.sendTransactional({
      sender: { email: mailbox.address, name: branding.fromName },
      to: [recipient.name ? { email: recipient.email, name: recipient.name } : { email: recipient.email }],
      subject,
      ...(brandedHtml ? { htmlContent: brandedHtml } : {}),
      textContent: text,
      // Reply-To = receivingAddress (mail.<domain>) — NOT branding.replyTo. This is the
      // only way replies route to Brevo inbound instead of bouncing off the apex MX which is
      // almost certainly Google Workspace / Microsoft 365 with no inbox for this address.
      replyTo: { email: mailbox.receivingAddress || mailbox.address },
      ...(Object.keys(headers).length ? { headers } : {}),
      tags: ['mailbox', mailbox.localPart],
    });
    if (!res.ok) {
      const why = res.ipBlocked ? 'this server IP is not authorised in Brevo' : res.error || 'send failed';
      throw new BadRequestException(`Could not send email: ${why}`);
    }
    const messageId = res.data?.messageId || `brevo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Record in the unified inbox, TAGGED with mailboxId (activates the privacy gate on this thread).
    await this.saveOutboundMessage({
      tenantId,
      channel: 'email',
      recipientPhone: recipient.email,
      recipientName: recipient.name || recipient.email.split('@')[0],
      content: text,
      messageId,
      subject,
      mailboxId: mailbox.id,
      emailThreadId: deriveEmailThreadKey({
        references,
        inReplyTo,
        messageId,
        subject,
        participants: [recipient.email],
      }),
      ...(brandedHtml ? { bodyHtml: sanitizeEmailHtml(brandedHtml) } : {}),
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references.length ? { references } : {}),
    }).catch((e: any) => this.logger.warn(jlog({ event: 'mailbox_outbound_inbox_save_failed', tenantId, error: e?.message })));

    this.logger.log(jlog({ event: 'mailbox_email_sent', tenantId, direction: 'outbound', mailboxId: mailbox.id, messageId }));
    return { messageId, mailboxId: mailbox.id, from: mailbox.address };
  }

  /**
   * Save an INTERNAL note on a conversation. Stored in the same messages store with
   * direction='note' so it renders inline in the thread but is never sent to the channel.
   */
  async saveNote(params: {
    tenantId: string;
    conversationId: string;
    content: string;
    authorName?: string;
  }): Promise<{ id: string; timestamp: number }> {
    const { tenantId, conversationId, content } = params;
    const authorName = params.authorName || 'You';
    const now = Date.now();
    const msgId = `note-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const sk = `${String(now).padStart(15, '0')}#${msgId}`;
    const item = {
      conversationId,
      sk,
      id: msgId,
      content,
      direction: 'note',
      senderName: authorName,
      senderPhone: '',
      channel: 'note',
      timestamp: now,
      status: 'note',
    };

    await this.executeWithFallback(
      async () => {
        await this.dynamo!.send(new PutItemCommand({ TableName: MESSAGES_TABLE, Item: marshall(item) }));
        await this.dynamo!.send(new UpdateItemCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: marshall({ tenantId, sk: conversationId }),
          UpdateExpression: 'SET lastMsgAt = :t, lastMessageText = :txt',
          ExpressionAttributeValues: marshall({ ':t': now, ':txt': `📝 ${content.slice(0, 160)}` }),
        }));
      },
      async () => {
        const db = this.firebase.firestore();
        const tenantRef = db.collection('tenants').doc(tenantId);
        await tenantRef.collection('inboxConversations').doc(conversationId)
          .collection('messages').doc(sk).set(item);
        await tenantRef.collection('inboxConversations').doc(conversationId)
          .set({ lastMsgAt: now, lastMessageText: `📝 ${content.slice(0, 160)}` }, { merge: true });
      },
      'saveNote',
      { tenantId, conversationId, direction: 'note' },
    );
    return { id: msgId, timestamp: now };
  }

  // ─── List conversations ────────────────────────────────────────────────────

  /** All tombstoned conversationIds for a tenant (one query, PK = tenantId). Fail-soft → empty. */
  private async listTombstonedIds(tenantId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    try {
      if (this.dynamo) {
        let lastKey: Record<string, any> | undefined;
        do {
          const res = await this.dynamo.send(new QueryCommand({
            TableName: DELETED_CONVERSATIONS_TABLE,
            KeyConditionExpression: 'tenantId = :t',
            ExpressionAttributeValues: marshall({ ':t': tenantId }),
            ProjectionExpression: 'conversationId',
            ExclusiveStartKey: lastKey,
          }));
          for (const it of res.Items || []) ids.add(unmarshall(it).conversationId);
          lastKey = res.LastEvaluatedKey;
        } while (lastKey);
      } else {
        const snap = await this.firebase.firestore().collection('tenants').doc(tenantId).collection('deletedConversations').get();
        for (const d of snap.docs) { const c = d.data().conversationId; if (c) ids.add(c); }
      }
    } catch (err: any) {
      this.logger.warn(jlog({ event: 'tombstone_list_failed', tenantId, error: err.message }));
    }
    return ids;
  }

  async listConversations(tenantId: string, limit = 50): Promise<InboxConversation[]> {
    const list = await this.executeWithFallback(
      async () => {
        const result = await this.dynamo!.send(new QueryCommand({
          TableName: CONVERSATIONS_TABLE,
          IndexName: GSI_NAME,
          KeyConditionExpression: 'tenantId = :tid',
          ExpressionAttributeValues: marshall({ ':tid': tenantId }),
          ScanIndexForward: false, // newest first
          Limit: limit,
        }));

        return (result.Items || []).map((item) => {
          const d = unmarshall(item);
          return {
            conversationId: d.conversationId || d.sk,
            tenantId: d.tenantId,
            contactPhone: d.contactPhone || '',
            contactName: d.contactName || 'Unknown',
            channel: d.channel || 'whatsapp',
            lastMsgAt: d.lastMsgAt || 0,
            lastMessageText: d.lastMessageText || '',
            unreadCount: d.unreadCount || 0,
            status: d.status || 'open',
            ...(d.mailboxId ? { mailboxId: d.mailboxId } : {}),
          } as InboxConversation;
        });
      },
      async () => {
        this.logger.debug(`Listing conversations from Firestore fallback for tenant ${tenantId}`);
        const snap = await this.firebase.firestore()
          .collection('tenants').doc(tenantId)
          .collection('inboxConversations')
          .orderBy('lastMsgAt', 'desc')
          .limit(limit)
          .get();

        return snap.docs.map(doc => {
          const d = doc.data();
          return {
            conversationId: d.conversationId,
            tenantId: d.tenantId,
            contactPhone: d.contactPhone,
            contactName: d.contactName,
            channel: d.channel,
            lastMsgAt: d.lastMsgAt,
            lastMessageText: d.lastMessageText,
            unreadCount: d.unreadCount,
            status: d.status,
            ...(d.mailboxId ? { mailboxId: d.mailboxId } : {}),
          } as InboxConversation;
        });
      },
      'listConversations'
    );
    // Never expose tombstoned (deleted) conversations, even if a row lingers in the store.
    const tombstoned = await this.listTombstonedIds(tenantId);
    return tombstoned.size ? list.filter((c) => !tombstoned.has(c.conversationId)) : list;
  }

  // ─── Get messages for a conversation ──────────────────────────────────────

  async getMessages(conversationId: string, limit = 100): Promise<InboxMessage[]> {
    return this.executeWithFallback(
      async () => {
        const result = await this.dynamo!.send(new QueryCommand({
          TableName: MESSAGES_TABLE,
          KeyConditionExpression: 'conversationId = :cid',
          ExpressionAttributeValues: marshall({ ':cid': conversationId }),
          ScanIndexForward: true, // oldest first
          Limit: limit,
        }));

        return (result.Items || []).map((item) => {
          const d = unmarshall(item);
          return {
            id: d.id || d.sk,
            conversationId: d.conversationId,
            content: d.content || '',
            direction: d.direction || 'inbound',
            senderName: d.senderName || '',
            senderPhone: d.senderPhone,
            channel: d.channel || 'whatsapp',
            timestamp: d.timestamp || 0,
            status: d.status,
            // email-only — undefined for WhatsApp (the P3 UI renders these when present).
            subject: d.subject,
            bodyHtml: d.bodyHtml,
            inReplyTo: d.inReplyTo,
            references: d.references,
            emailThreadId: d.emailThreadId,
            attachments: d.attachments,
            cc: d.cc,
            bcc: d.bcc,
          } as InboxMessage;
        });
      },
      async () => {
        const tid = conversationId.split(':')[0];
        this.logger.debug(`Getting messages from Firestore fallback for conversation ${conversationId}`);
        const snap = await this.firebase.firestore()
          .collection('tenants').doc(tid)
          .collection('inboxConversations').doc(conversationId)
          .collection('messages')
          .orderBy('timestamp', 'asc')
          .limit(limit)
          .get();

        return snap.docs.map(doc => {
          const d = doc.data();
          return {
            id: d.id,
            conversationId: d.conversationId,
            content: d.content,
            direction: d.direction,
            senderName: d.senderName,
            senderPhone: d.senderPhone,
            channel: d.channel,
            timestamp: d.timestamp,
            status: d.status,
            subject: d.subject,
            bodyHtml: d.bodyHtml,
            inReplyTo: d.inReplyTo,
            references: d.references,
            emailThreadId: d.emailThreadId,
            attachments: d.attachments,
            cc: d.cc,
            bcc: d.bcc,
          } as InboxMessage;
        });
      },
      'getMessages'
    );
  }

  /**
   * Thread context for replying on an email conversation: the Message-ID to reply to, its
   * References chain, and the thread's subject — so a Flyn reply is a real RFC-5322 reply
   * (In-Reply-To + References) that lands INSIDE the SAME Gmail thread, AND inherits the subject
   * so it reads as one conversation. Scans the most recent messages of ANY direction (newest
   * first): we reply to the LATEST real email in the thread — whether the customer's last inbound
   * OR our own last outbound (campaign / prior reply). This is the fix for "I sent a campaign then
   * replied and it spawned a new thread": before, only INBOUND was considered, so a thread we
   * started ourselves had no parent to chain to.
   *
   * `messageId` is the newest row carrying a real <…@…> Message-ID (notes / failed sends / pre-RFC
   * synthetic ids are skipped). `subject` is the newest row that has one. email-only; fails OPEN
   * (returns null) so a lookup error never blocks the send.
   */
  async getEmailThreadContext(
    conversationId: string,
  ): Promise<{ messageId?: string; references: string[]; subject?: string } | null> {
    const pick = (rows: Array<Record<string, any>>): { messageId?: string; references: string[]; subject?: string } | null => {
      let messageId: string | undefined;
      let references: string[] = [];
      let subject: string | undefined;
      for (const d of rows) {
        if (!messageId) {
          const id = d.id as string | undefined;
          if (id && /^<.+@.+>$/.test(id)) {
            messageId = id;
            references = Array.isArray(d.references) ? d.references : [];
          }
        }
        if (!subject && typeof d.subject === 'string' && d.subject.trim()) subject = d.subject.trim();
        if (messageId && subject) break;
      }
      return messageId || subject ? { messageId, references, subject } : null;
    };
    try {
      if (this.dynamo) {
        const res = await this.dynamo.send(new QueryCommand({
          TableName: MESSAGES_TABLE,
          KeyConditionExpression: 'conversationId = :cid',
          ExpressionAttributeValues: marshall({ ':cid': conversationId }),
          ScanIndexForward: false, // newest first — reply to the latest message in the thread
          Limit: 30,
        }));
        return pick((res.Items || []).map((it) => unmarshall(it)));
      }
      const tid = conversationId.split(':')[0];
      const snap = await this.firebase.firestore()
        .collection('tenants').doc(tid)
        .collection('inboxConversations').doc(conversationId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(30)
        .get();
      return pick(snap.docs.map((doc) => doc.data() as Record<string, any>));
    } catch (err: any) {
      this.logger.warn(jlog({ event: 'email_thread_lookup_failed', conversationId, error: err?.message, note: 'sending without thread headers' }));
      return null;
    }
  }

  /**
   * The stored contact address for a conversation — the REAL reply recipient. Needed by the email
   * reply path under P1b keying, where the conversationId is a thread token (`t_…`), not the
   * address. Returns null if not found (caller falls back to the parsed key for legacy chats).
   */
  async getConversationContactPhone(tenantId: string, conversationId: string): Promise<string | null> {
    try {
      if (this.dynamo) {
        const res = await this.dynamo.send(new GetItemCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: marshall({ tenantId, sk: conversationId }),
        }));
        if (!res.Item) return null;
        return (unmarshall(res.Item).contactPhone as string) || null;
      }
      const snap = await this.firebase.firestore()
        .collection('tenants').doc(tenantId)
        .collection('inboxConversations').doc(conversationId).get();
      return snap.exists ? ((snap.data() as any)?.contactPhone || null) : null;
    } catch {
      return null;
    }
  }

  /**
   * The mailboxId a conversation is tagged with (null when untagged / missing). Powers the inbox
   * detail/action mailbox-access gate (IDOR fix) — the server re-derives the tag from the store
   * rather than trusting any client-supplied mailboxId.
   */
  async getConversationMailboxId(tenantId: string, conversationId: string): Promise<string | null> {
    try {
      if (this.dynamo) {
        const res = await this.dynamo.send(new GetItemCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: marshall({ tenantId, sk: conversationId }),
        }));
        if (!res.Item) return null;
        return (unmarshall(res.Item).mailboxId as string) || null;
      }
      const snap = await this.firebase.firestore()
        .collection('tenants').doc(tenantId)
        .collection('inboxConversations').doc(conversationId).get();
      return snap.exists ? ((snap.data() as any)?.mailboxId || null) : null;
    } catch {
      return null;
    }
  }

  // ─── Update conversation status ───────────────────────────────────────────

  async updateStatus(tenantId: string, conversationId: string, status: 'open' | 'pending' | 'resolved'): Promise<void> {
    await this.executeWithFallback(
      async () => {
        await this.dynamo!.send(new UpdateItemCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: marshall({ tenantId, sk: conversationId }),
          UpdateExpression: 'SET #st = :status, updatedAt = :ts',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: marshall({ ':status': status, ':ts': Date.now() }),
        }));
      },
      async () => {
        await this.firebase.firestore()
          .collection('tenants').doc(tenantId)
          .collection('inboxConversations').doc(conversationId)
          .set({ status, updatedAt: Date.now() }, { merge: true });
      },
      'updateStatus'
    );
  }

  // ─── Mark conversation as read ─────────────────────────────────────────────

  async markRead(tenantId: string, conversationId: string): Promise<void> {
    await this.executeWithFallback(
      async () => {
        await this.dynamo!.send(new UpdateItemCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: marshall({ tenantId, sk: conversationId }),
          UpdateExpression: 'SET unreadCount = :zero',
          ExpressionAttributeValues: marshall({ ':zero': 0 }),
        }));
      },
      async () => {
        await this.firebase.firestore()
          .collection('tenants').doc(tenantId)
          .collection('inboxConversations').doc(conversationId)
          .set({ unreadCount: 0 }, { merge: true });
      },
      'markRead'
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE ONE RULE: every operation below wipes Flyn's MIRROR only. Nothing here
  // ever calls the Baileys socket / WhatsApp. The customer's chat is the source
  // of truth and is never touched.
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Tombstones (delete markers; block history re-sync resurrection) ────────

  /** Is this conversation tombstoned (deleted from Flyn)? Fail-soft → false. */
  async isTombstoned(tenantId: string, conversationId: string): Promise<boolean> {
    try {
      if (this.dynamo) {
        const res = await this.dynamo.send(new GetItemCommand({
          TableName: DELETED_CONVERSATIONS_TABLE,
          Key: marshall({ tenantId, conversationId }),
        }));
        return !!res.Item;
      }
      const snap = await this.firebase.firestore()
        .collection('tenants').doc(tenantId)
        .collection('deletedConversations').doc(encodeURIComponent(conversationId)).get();
      return snap.exists;
    } catch (err: any) {
      this.logger.warn(jlog({ event: 'tombstone_check_failed', tenantId, conversationId, error: err.message }));
      return false; // fail open — never drop a real message because the check errored
    }
  }

  private async writeTombstone(
    tenantId: string,
    conversationId: string,
    meta: { channel?: string; phoneNumber?: string; deletedBy?: 'user' | 'admin' },
  ): Promise<void> {
    const rec = {
      tenantId, conversationId,
      deletedAt: new Date().toISOString(),
      deletedBy: meta.deletedBy || 'user',
      channel: meta.channel,
      phoneNumber: meta.phoneNumber,
    };
    try {
      if (this.dynamo) {
        await this.dynamo.send(new PutItemCommand({
          TableName: DELETED_CONVERSATIONS_TABLE,
          Item: marshall(rec, { removeUndefinedValues: true }),
        }));
      } else {
        await this.firebase.firestore().collection('tenants').doc(tenantId)
          .collection('deletedConversations').doc(encodeURIComponent(conversationId)).set(rec);
      }
    } catch (err: any) {
      this.logger.warn(jlog({ event: 'tombstone_write_failed', tenantId, conversationId, error: err.message }));
    }
  }

  /** Lift the tombstone — used when a genuinely NEW live message restarts a deleted chat. */
  async removeTombstone(tenantId: string, conversationId: string): Promise<void> {
    try {
      if (this.dynamo) {
        await this.dynamo.send(new DeleteItemCommand({
          TableName: DELETED_CONVERSATIONS_TABLE,
          Key: marshall({ tenantId, conversationId }),
        }));
      } else {
        await this.firebase.firestore().collection('tenants').doc(tenantId)
          .collection('deletedConversations').doc(encodeURIComponent(conversationId)).delete();
      }
    } catch { /* noop */ }
  }

  // ─── Delete one conversation (mirror wipe) ──────────────────────────────────

  /** Raw message rows (with sort key + attachment URL) for batch delete. */
  private async queryAllMessageRows(conversationId: string): Promise<Array<{ sk: string; mediaUrl?: string }>> {
    const out: Array<{ sk: string; mediaUrl?: string }> = [];
    let lastKey: Record<string, any> | undefined;
    do {
      const res = await this.dynamo!.send(new QueryCommand({
        TableName: MESSAGES_TABLE,
        KeyConditionExpression: 'conversationId = :cid',
        ExpressionAttributeValues: marshall({ ':cid': conversationId }),
        ProjectionExpression: 'sk, mediaUrl',
        ExclusiveStartKey: lastKey,
      }));
      for (const it of res.Items || []) { const d = unmarshall(it); out.push({ sk: d.sk, mediaUrl: d.mediaUrl }); }
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    return out;
  }

  /**
   * Delete a conversation from Flyn's mirror: its messages (Dynamo + Firestore), its S3
   * attachments, and the conversation row — then tombstone it so a WhatsApp history re-sync
   * cannot resurrect it. Tenant-scoped. NEVER touches WhatsApp.
   */
  async deleteConversation(tenantId: string, conversationId: string): Promise<{ deletedMessages: number; deletedFiles: number }> {
    // Tenant isolation — key is `${tenantId}:${channel}:${contact}`.
    if (!conversationId.startsWith(tenantId + ':')) {
      throw new ForbiddenException('Conversation does not belong to this tenant');
    }
    const channel = conversationId.split(':')[1];
    const phone = conversationId.split(':').slice(2).join(':');
    let deletedMessages = 0;
    let deletedFiles = 0;

    // ── DynamoDB (primary) ──
    if (this.dynamo) {
      try {
        const rows = await this.queryAllMessageRows(conversationId);
        // S3 attachments — batched at 25, best-effort.
        const urls = rows.map(r => r.mediaUrl).filter((u): u is string => !!u);
        for (let i = 0; i < urls.length; i += 25) {
          await Promise.all(urls.slice(i, i + 25).map(async (url) => {
            try { await this.assets.deleteByUrl(url); deletedFiles++; }
            catch (e: any) { this.logger.warn(jlog({ event: 'attachment_delete_failed', conversationId, error: e.message })); }
          }));
        }
        // Messages — BatchWriteItem, 25 keys per call.
        for (let i = 0; i < rows.length; i += 25) {
          const chunk = rows.slice(i, i + 25);
          await this.dynamo.send(new BatchWriteItemCommand({
            RequestItems: { [MESSAGES_TABLE]: chunk.map(r => ({ DeleteRequest: { Key: marshall({ conversationId, sk: r.sk }) } })) },
          }));
          deletedMessages += chunk.length;
        }
        // Conversation row.
        await this.dynamo.send(new DeleteItemCommand({ TableName: CONVERSATIONS_TABLE, Key: marshall({ tenantId, sk: conversationId }) }));
      } catch (err: any) {
        this.logger.error(jlog({ event: 'conversation_delete_dynamo_failed', tenantId, conversationId, error: err.message }));
      }
    }

    // ── Firestore mirror (always attempt; harmless if empty) ──
    try {
      const db = this.firebase.firestore();
      const convRef = db.collection('tenants').doc(tenantId).collection('inboxConversations').doc(conversationId);
      const msgSnap = await convRef.collection('messages').get();
      let batch = db.batch();
      let n = 0;
      for (const doc of msgSnap.docs) {
        batch.delete(doc.ref);
        if (++n % 450 === 0) { await batch.commit(); batch = db.batch(); }
      }
      await batch.commit();
      await convRef.delete();
    } catch (err: any) {
      this.logger.warn(jlog({ event: 'conversation_delete_firestore_failed', tenantId, conversationId, error: err.message }));
    }

    // ── Tombstone so history re-sync can't resurrect it ──
    await this.writeTombstone(tenantId, conversationId, { channel, phoneNumber: phone, deletedBy: 'user' });
    this.logger.log(jlog({ action: 'conversation_deleted', tenantId, conversationId, deletedMessages, deletedFiles }));
    return { deletedMessages, deletedFiles };
  }

  /** Delete every conversation for a tenant (mirror wipe). Batched to avoid throttling. */
  async deleteAllConversations(tenantId: string): Promise<{ deletedConversations: number; deletedMessages: number; deletedFiles: number }> {
    const conversations = await this.listConversations(tenantId, 10_000);
    let deletedConversations = 0, deletedMessages = 0, deletedFiles = 0;
    for (let i = 0; i < conversations.length; i += 10) {
      const chunk = conversations.slice(i, i + 10);
      const results = await Promise.all(chunk.map(c => this.deleteConversation(tenantId, c.conversationId).catch((e: any) => {
        this.logger.warn(jlog({ event: 'bulk_delete_one_failed', tenantId, conversationId: c.conversationId, error: e.message }));
        return { deletedMessages: 0, deletedFiles: 0 };
      })));
      for (const r of results) { deletedConversations++; deletedMessages += r.deletedMessages; deletedFiles += r.deletedFiles; }
    }
    this.logger.log(jlog({ action: 'all_conversations_deleted', tenantId, deletedConversations, deletedMessages, deletedFiles }));
    return { deletedConversations, deletedMessages, deletedFiles };
  }

  // ─── P3: delivery/read receipts (tick status) ──────────────────────────────

  /**
   * Advance an outbound message's delivery status (sent → delivered → read) from a WhatsApp ACK.
   * Finds the row by provider message id, then only ADVANCES (never downgrades). Best-effort.
   */
  /**
   * Correct a conversation's displayed contact name (e.g. when WhatsApp address-book contacts sync
   * in after the conversation was created with a number or the owner's own name). Only updates when
   * the new name differs and is a real name — never overwrites with an empty/blank value. Best-effort.
   */
  async updateConversationContactName(tenantId: string, conversationId: string, name: string): Promise<void> {
    const clean = (name || '').trim();
    if (!clean) return;
    try {
      if (this.dynamo) {
        await this.dynamo.send(new UpdateItemCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: marshall({ tenantId, sk: conversationId }),
          UpdateExpression: 'SET contactName = :n',
          // Only touch rows that exist + whose name actually differs (avoid needless writes / churn).
          ConditionExpression: 'attribute_exists(conversationId) AND (attribute_not_exists(contactName) OR contactName <> :n)',
          ExpressionAttributeValues: marshall({ ':n': clean }),
        }));
      } else {
        await this.firebase.firestore()
          .collection('tenants').doc(tenantId)
          .collection('inboxConversations').doc(conversationId)
          .set({ contactName: clean }, { merge: true });
      }
    } catch (err: any) {
      // ConditionalCheckFailed = no such conversation or name already correct — both fine.
      if (err?.name !== 'ConditionalCheckFailedException') {
        this.logger.debug(jlog({ event: 'contact_name_update_failed', conversationId, error: err?.message }));
      }
    }
  }

  async updateMessageStatus(tenantId: string, conversationId: string, msgId: string, status: 'sent' | 'delivered' | 'read'): Promise<void> {
    const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
    try {
      if (this.dynamo) {
        // Find the row's sort key + current status by message id.
        const res = await this.dynamo.send(new QueryCommand({
          TableName: MESSAGES_TABLE,
          KeyConditionExpression: 'conversationId = :c',
          FilterExpression: 'id = :m',
          ExpressionAttributeValues: marshall({ ':c': conversationId, ':m': msgId }),
          ScanIndexForward: false, Limit: 50,
        }));
        const item = res.Items?.[0];
        if (!item) return;
        const d = unmarshall(item);
        if ((rank[d.status] ?? 0) >= rank[status]) return; // don't downgrade
        await this.dynamo.send(new UpdateItemCommand({
          TableName: MESSAGES_TABLE,
          Key: marshall({ conversationId, sk: d.sk }),
          UpdateExpression: 'SET #s = :st',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: marshall({ ':st': status }),
        }));
      }
    } catch (err: any) {
      this.logger.debug(jlog({ event: 'message_status_update_failed', conversationId, msgId, error: err.message }));
    }
  }

  // ─── P2: merge LID ↔ phone split threads (one-time, idempotent) ─────────────

  private async migrationRan(tenantId: string, migration: string): Promise<boolean> {
    try {
      if (!this.dynamo) return false;
      const res = await this.dynamo.send(new GetItemCommand({ TableName: MIGRATION_MARKERS_TABLE, Key: marshall({ tenantId, migration }) }));
      return !!res.Item;
    } catch { return false; }
  }

  private async markMigrationRan(tenantId: string, migration: string, meta: Record<string, unknown>): Promise<void> {
    try {
      if (!this.dynamo) return;
      await this.dynamo.send(new PutItemCommand({ TableName: MIGRATION_MARKERS_TABLE, Item: marshall({ tenantId, migration, ranAt: new Date().toISOString(), ...meta }, { removeUndefinedValues: true }) }));
    } catch (err: any) { this.logger.warn(jlog({ event: 'migration_marker_write_failed', tenantId, migration, error: err.message })); }
  }

  /** Public guards over the one-time migration markers — used by the email history backfill (P2). */
  async hasMigrationRun(tenantId: string, migration: string): Promise<boolean> {
    return this.migrationRan(tenantId, migration);
  }
  async recordMigrationRun(tenantId: string, migration: string, meta: Record<string, unknown> = {}): Promise<void> {
    return this.markMigrationRan(tenantId, migration, meta);
  }

  /** Copy one message row into a different conversation (IF_NOT_EXISTS dedup), preserving timestamp. */
  private async copyMessageRow(fromConvId: string, toConvId: string, sk: string): Promise<boolean> {
    const res = await this.dynamo!.send(new QueryCommand({
      TableName: MESSAGES_TABLE, KeyConditionExpression: 'conversationId = :c AND sk = :s',
      ExpressionAttributeValues: marshall({ ':c': fromConvId, ':s': sk }), Limit: 1,
    }));
    const item = res.Items?.[0];
    if (!item) return false;
    const d = unmarshall(item);
    try {
      await this.dynamo!.send(new PutItemCommand({
        TableName: MESSAGES_TABLE,
        Item: marshall({ ...d, conversationId: toConvId }, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(conversationId)', // never overwrite an existing message
      }));
      return true;
    } catch { return false; } // already present (ConditionalCheckFailed) → deduped
  }

  /**
   * One-time, idempotent, tenant-scoped migration: a contact that appears as BOTH a LID-keyed
   * thread (≥15-digit contact) AND a phone-keyed thread with the SAME name gets merged into the
   * phone thread (messages copied with dedup, name/lastMsgAt carried), then the LID thread is
   * tombstoned. Only merges on a UNIQUE exact name match — ambiguous names are skipped, never
   * mis-merged. Audited. Guarded by a migration marker so it never runs twice.
   */
  async mergeLidThreads(tenantId: string): Promise<{ merged: number; skipped: number; alreadyRun: boolean }> {
    if (await this.migrationRan(tenantId, LID_MERGE_MIGRATION)) return { merged: 0, skipped: 0, alreadyRun: true };
    if (!this.dynamo) return { merged: 0, skipped: 0, alreadyRun: false };

    const convs = await this.listConversations(tenantId, 10_000);
    const contactOf = (id: string) => id.split(':').slice(2).join(':');
    const phoneConvs = convs.filter((c) => contactOf(c.conversationId).replace(/\D/g, '').length < LID_DIGIT_THRESHOLD);
    const lidConvs = convs.filter((c) => contactOf(c.conversationId).replace(/\D/g, '').length >= LID_DIGIT_THRESHOLD);

    // name → phone conv, but ONLY when the name maps to exactly one phone conv (avoid wrong merges).
    const nameCount = new Map<string, number>();
    const nameToPhone = new Map<string, InboxConversation>();
    for (const c of phoneConvs) {
      const n = (c.contactName || '').trim().toLowerCase();
      if (!n) continue;
      nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
      nameToPhone.set(n, c);
    }

    let merged = 0, skipped = 0;
    for (const lid of lidConvs) {
      const n = (lid.contactName || '').trim().toLowerCase();
      const target = n && nameCount.get(n) === 1 ? nameToPhone.get(n) : undefined;
      if (!target || target.conversationId === lid.conversationId) { skipped++; continue; }

      const rows = await this.queryAllMessageRows(lid.conversationId);
      let copied = 0;
      for (const r of rows) { if (await this.copyMessageRow(lid.conversationId, target.conversationId, r.sk)) copied++; }

      // Carry the name forward + advance the target head if the LID thread is newer.
      await this.dynamo!.send(new UpdateItemCommand({
        TableName: CONVERSATIONS_TABLE, Key: marshall({ tenantId, sk: target.conversationId }),
        UpdateExpression: 'SET contactName = if_not_exists(contactName, :n), lastMsgAt = :t, lastMessageText = :txt',
        ConditionExpression: 'attribute_not_exists(lastMsgAt) OR lastMsgAt < :t',
        ExpressionAttributeValues: marshall({ ':n': lid.contactName, ':t': lid.lastMsgAt, ':txt': lid.lastMessageText }),
      })).catch(() => { /* target already newer — fine */ });

      // Delete the LID thread's data + tombstone it so it never reappears (incl. on a Sync Now).
      await this.deleteConversation(tenantId, lid.conversationId).catch((e: any) =>
        this.logger.warn(jlog({ event: 'lid_merge_delete_failed', tenantId, conversationId: lid.conversationId, error: e.message })));

      merged++;
      this.logger.log(jlog({ action: 'thread_merged', tenantId, fromId: lid.conversationId, toId: target.conversationId, messagesMerged: copied }));
    }

    await this.markMigrationRan(tenantId, LID_MERGE_MIGRATION, { merged, skipped });
    return { merged, skipped, alreadyRun: false };
  }

  /**
   * P1b migration — re-group pre-existing ADDRESS-keyed email conversations into THREAD-keyed ones,
   * so one Flyn chat == one Gmail thread (two subjects from one person split; one thread across
   * aliases joins). Idempotent (marker-guarded + copy uses attribute_not_exists dedup), tombstone-
   * aware (reuses deleteConversation), email-only (WhatsApp conversations are never touched).
   *
   * Per email conversation: read every message row, compute each message's thread token (from the
   * stored emailThreadId, else derived from its headers/subject), and copy it into
   * `${tenantId}:email:${token}`. Address chats fully drained are tombstoned; a chat already
   * single-threaded maps to its own token and is left in place. Safe to run before/independent of
   * flipping EMAIL_THREAD_KEYING — it only MOVES rows into the keys the live path will then use.
   */
  async migrateEmailThreadKeys(tenantId: string): Promise<{ moved: number; threads: number; convsProcessed: number; alreadyRun: boolean }> {
    if (await this.migrationRan(tenantId, EMAIL_THREAD_MIGRATION)) return { moved: 0, threads: 0, convsProcessed: 0, alreadyRun: true };
    if (!this.dynamo) return { moved: 0, threads: 0, convsProcessed: 0, alreadyRun: false };

    const convs = await this.listConversations(tenantId, 10_000);
    const emailConvs = convs.filter((c) => c.channel === 'email');
    const threadIds = new Set<string>();
    let moved = 0;
    let convsProcessed = 0;

    for (const conv of emailConvs) {
      const rows = await this.queryAllMessageRows(conv.conversationId);
      const drainedInto = new Set<string>();
      let rowsRemaining = rows.length;

      for (const r of rows) {
        // Need the row's headers to compute its thread token — read the full message.
        const full = await this.dynamo!.send(new GetItemCommand({
          TableName: MESSAGES_TABLE, Key: marshall({ conversationId: conv.conversationId, sk: r.sk }),
        })).then((x) => (x.Item ? unmarshall(x.Item) : null)).catch(() => null);
        if (!full) continue;

        const address = (full.direction === 'outbound' ? conv.contactPhone : full.senderPhone || conv.contactPhone) || '';
        const key = (full.emailThreadId as string) || deriveEmailThreadKey({
          references: normalizeReferences(full.references),
          inReplyTo: full.inReplyTo,
          messageId: full.id,
          subject: full.subject,
          participants: [String(address).toLowerCase().trim()],
        });
        const token = emailThreadConversationToken(key);
        const targetConvId = `${tenantId}:email:${token}`;
        threadIds.add(token);

        if (targetConvId === conv.conversationId) { drainedInto.add(targetConvId); continue; } // already correctly keyed
        if (await this.copyMessageRow(conv.conversationId, targetConvId, r.sk)) moved++;
        rowsRemaining--;

        // Ensure the target conversation head exists (carry address for reply/display).
        if (!drainedInto.has(targetConvId)) {
          drainedInto.add(targetConvId);
          await this.dynamo!.send(new UpdateItemCommand({
            TableName: CONVERSATIONS_TABLE, Key: marshall({ tenantId, sk: targetConvId }),
            UpdateExpression: `SET conversationId = if_not_exists(conversationId, :cid), contactPhone = if_not_exists(contactPhone, :phone),
              contactName = if_not_exists(contactName, :name), #ch = if_not_exists(#ch, :email), #st = if_not_exists(#st, :open),
              lastMsgAt = if_not_exists(lastMsgAt, :t), lastMessageText = if_not_exists(lastMessageText, :txt), unreadCount = if_not_exists(unreadCount, :zero),
              emailThreadId = if_not_exists(emailThreadId, :etid)`,
            ExpressionAttributeNames: { '#ch': 'channel', '#st': 'status' },
            ExpressionAttributeValues: marshall({
              ':cid': targetConvId, ':phone': conv.contactPhone, ':name': full.subject || conv.contactName || conv.contactPhone,
              ':email': 'email', ':open': 'open', ':t': full.timestamp || conv.lastMsgAt || Date.now(),
              ':txt': (full.content || '').slice(0, 200), ':zero': 0, ':etid': key,
            }),
          })).catch(() => { /* head already present */ });
        }
      }

      convsProcessed++;
      // If every row moved to a DIFFERENT thread chat, the address chat is empty → tombstone it.
      if (rowsRemaining <= 0 && !drainedInto.has(conv.conversationId)) {
        await this.deleteConversation(tenantId, conv.conversationId).catch((e: any) =>
          this.logger.warn(jlog({ event: 'email_thread_migrate_delete_failed', tenantId, conversationId: conv.conversationId, error: e.message })));
      }
    }

    await this.markMigrationRan(tenantId, EMAIL_THREAD_MIGRATION, { moved, threads: threadIds.size, convsProcessed });
    this.logger.log(jlog({ event: 'email_thread_migration_done', tenantId, moved, threads: threadIds.size, convsProcessed }));
    return { moved, threads: threadIds.size, convsProcessed, alreadyRun: false };
  }

  /**
   * Scope a conversation LIST to what `uid` may see/act on: untagged convs (global) + convs on
   * mailboxes the user can access. Owner/admin → getMailboxesForUser returns ALL, so nothing is
   * filtered. The ONE source of truth for mailbox-scoping a list — shared by export (read) and
   * markAllRead (mutate) so the rule never forks. No uid (system callers) → unchanged.
   */
  private async scopeConversationsForUser<T extends { mailboxId?: string }>(
    tenantId: string,
    uid: string | undefined,
    conversations: T[],
  ): Promise<T[]> {
    if (!uid) return conversations;
    if (!conversations.some((c) => !!c.mailboxId)) return conversations;
    const allowed = new Set((await this.mailboxes.getMailboxesForUser(tenantId, uid)).map((m) => m.id));
    return conversations.filter((c) => !c.mailboxId || allowed.has(c.mailboxId));
  }

  // ─── Mark all read ──────────────────────────────────────────────────────────

  async markAllRead(tenantId: string, uid?: string): Promise<{ updatedCount: number }> {
    const all = await this.listConversations(tenantId, 10_000);
    // Scope BEFORE the bulk write — a member must never zero another mailbox's unread counts.
    const conversations = await this.scopeConversationsForUser(tenantId, uid, all);
    let updatedCount = 0;
    for (let i = 0; i < conversations.length; i += 10) {
      const chunk = conversations.slice(i, i + 10);
      await Promise.all(chunk.map(c => this.markRead(tenantId, c.conversationId).then(() => { updatedCount++; }).catch(() => {})));
    }
    return { updatedCount };
  }

  // ─── Export (CSV) ───────────────────────────────────────────────────────────

  async exportConversationsCsv(tenantId: string, uid?: string): Promise<string> {
    const all = await this.listConversations(tenantId, 10_000);
    // Mailbox privacy: export only what this user may see — untagged convs + their mailboxes'
    // (mirrors the inbox list gate so a member can't exfiltrate another team's mailbox via CSV).
    const conversations = await this.scopeConversationsForUser(tenantId, uid, all);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['contact', 'phoneNumber', 'channel', 'lastMessage', 'lastMessageAt', 'status', 'unreadCount'];
    const rows = conversations.map(c => [
      esc(c.contactName), esc(c.contactPhone), esc(c.channel),
      esc(c.lastMessageText), esc(new Date(c.lastMsgAt || 0).toISOString()),
      esc(c.status), esc(c.unreadCount),
    ].join(','));
    return [header.map(esc).join(','), ...rows].join('\n');
  }

  // ─── New conversation (bare row, no send) ───────────────────────────────────

  /** Find an existing conversation for a tenant by normalized phone (any channel). */
  async findConversationByPhone(tenantId: string, channel: string, phone: string): Promise<string | null> {
    const id = `${tenantId}:${channel.toLowerCase()}:${phone}`;
    const list = await this.listConversations(tenantId, 10_000);
    return list.find(c => c.conversationId === id)?.conversationId ?? null;
  }

  /** Create an empty conversation row (used when starting a chat without an initial message). */
  async createBareConversation(tenantId: string, channel: string, phone: string, name?: string): Promise<string> {
    const conversationId = `${tenantId}:${channel.toLowerCase()}:${phone}`;
    await this.removeTombstone(tenantId, conversationId); // starting a chat lifts any prior delete
    const now = Date.now();
    const conv = {
      conversationId, tenantId, contactPhone: phone, contactName: name || phone,
      channel: channel.toLowerCase(), lastMsgAt: now, lastMessageText: '', unreadCount: 0, status: 'open',
    };
    await this.executeWithFallback(
      async () => {
        await this.dynamo!.send(new UpdateItemCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: marshall({ tenantId, sk: conversationId }),
          UpdateExpression: `SET conversationId = if_not_exists(conversationId, :cid), contactPhone = if_not_exists(contactPhone, :p),
            contactName = if_not_exists(contactName, :n), #ch = if_not_exists(#ch, :c), #st = if_not_exists(#st, :open),
            lastMsgAt = if_not_exists(lastMsgAt, :t), unreadCount = if_not_exists(unreadCount, :z)`,
          ExpressionAttributeNames: { '#ch': 'channel', '#st': 'status' },
          ExpressionAttributeValues: marshall({ ':cid': conversationId, ':p': phone, ':n': name || phone, ':c': channel.toLowerCase(), ':open': 'open', ':t': now, ':z': 0 }),
        }));
      },
      async () => {
        await this.firebase.firestore().collection('tenants').doc(tenantId)
          .collection('inboxConversations').doc(conversationId).set(conv, { merge: true });
      },
      'createBareConversation',
    );
    return conversationId;
  }
}
