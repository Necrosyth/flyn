import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChannelsService } from '../channels.service';
import { ChannelCredentialsService } from './channel-credentials.service';
import { TenantsService } from '../../tenants/tenants.service';
import { InboxService } from '../../inbox/inbox.service';
import { ChannelCredentials, ChannelType } from '../types/channel.types';
import * as Imap from 'node-imap';
import { simpleParser } from 'mailparser';
import { Readable } from 'stream';
import { sanitizeEmailHtml, htmlToPreviewText, normalizeReferences, deriveEmailThreadKey, selectEmailAttachments, sanitizeAttachmentName, addressObjectToEmails } from './email.util';
import type { EmailAttachmentMeta } from './email.util';
import { jlog } from '../../common/structured-log';
import { AssetsService } from '../../assets/assets.service';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

@Injectable()
export class EmailPollingService implements OnModuleInit {
  private readonly logger = new Logger(EmailPollingService.name);
  private isPolling = false;
  // CloudWatch metrics (namespace Flyn/Email) — mirrors the WhatsApp emitMetric pattern exactly.
  private cwClient: CloudWatchClient | null = null;

  /**
   * Emit a CloudWatch metric (namespace Flyn/Email). Two datums per call: one dimensioned by
   * tenantId (per-tenant search) and one undimensioned aggregate (what an alarm would watch).
   * Best-effort — a metric failure never affects polling. Mirrors WhatsAppQRService.emitMetric.
   */
  private emitMetric(tenantId: string, metricName: 'EmailIngested' | 'EmailBounce', value = 1): void {
    if (!this.cwClient) return;
    const ts = new Date();
    this.cwClient
      .send(new PutMetricDataCommand({
        Namespace: 'Flyn/Email',
        MetricData: [
          { MetricName: metricName, Dimensions: [{ Name: 'tenantId', Value: tenantId }], Value: value, Unit: 'Count', Timestamp: ts },
          { MetricName: metricName, Value: value, Unit: 'Count', Timestamp: ts },
        ],
      }))
      .catch((err: any) => this.logger.warn(jlog({ event: 'email_metric_emit_failed', tenantId, metricName, error: err?.message })));
  }

  constructor(
    private readonly channelsService: ChannelsService,
    private readonly credentialsService: ChannelCredentialsService,
    private readonly tenantsService: TenantsService,
    private readonly inboxService: InboxService,
    private readonly assetsService: AssetsService,
  ) {}

  /**
   * Upload an email's downloadable attachments to S3 (server-side, from the parsed Buffers) and
   * return the metadata we persist on the message row. Best-effort per file: a single upload
   * failure is logged and skipped, never aborting the message save. email-only.
   */
  private async uploadEmailAttachments(tenantId: string, parsed: any): Promise<EmailAttachmentMeta[]> {
    const selected = selectEmailAttachments(parsed?.attachments);
    if (!selected.length) return [];
    const out: EmailAttachmentMeta[] = [];
    for (const att of selected) {
      try {
        const filename = sanitizeAttachmentName(att.filename, att.contentType);
        const contentType = att.contentType || 'application/octet-stream';
        const body = att.content as Buffer;
        const { fileKey, fileUrl, fileSize } = await this.assetsService.uploadBuffer({
          tenantId, fileName: filename, contentType, body, module: 'email',
        });
        out.push({ filename, contentType, size: att.size ?? fileSize, s3Key: fileKey, fileUrl });
      } catch (e: any) {
        this.logger.warn(jlog({ event: 'email_attachment_upload_failed', tenantId, file: att.filename, error: e?.message }));
      }
    }
    if (out.length) this.logger.log(jlog({ event: 'email_attachments_stored', tenantId, count: out.length }));
    return out;
  }

  onModuleInit() {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    try { this.cwClient = new CloudWatchClient({ region }); } catch { this.cwClient = null; }
    this.logger.log('Email Polling Service initialized');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isPolling) {
      this.logger.debug('Polling already in progress, skipping...');
      return;
    }

    this.isPolling = true;
    try {
      const tenants = await this.tenantsService.listTenants();
      if (!Array.isArray(tenants) || tenants.length === 0) {
        this.logger.debug('No tenants found for email polling');
        return;
      }
      this.logger.debug(`Polling email for ${tenants.length} tenants`);
      
      for (const tenant of tenants) {
        try {
          // Get all channels for this tenant
          const channels = await this.channelsService.getTenantChannels(tenant.id);
          const emailChannels = channels.filter(c => c.type === ChannelType.EMAIL && c.status === 'active');
          
          for (const channel of emailChannels) {
            this.logger.debug(`Polling email for tenant ${tenant.id}, channel ${channel.id}`);
            await this.backfillInboxOnce(tenant.id, channel.id);  // P2: one-time history load (isHistory)
            await this.pollTenantEmail(tenant.id, channel.id);   // INBOX → inbound (live, UNSEEN)
            await this.pollSentBox(tenant.id, channel.id);        // SENT  → outbound (two-sided)
          }
        } catch (error) {
          this.logger.error(`Failed to poll tenant ${tenant.id}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error during email polling: ${error.message}`);
    } finally {
      this.isPolling = false;
    }
  }

  private async pollAllTenants() {
    // Deprecated in favor of handleCron logic
  }

  async pollTenantEmail(tenantId: string, channelId: string) {
    try {
      // Read by CHANNEL ID — connect stores email creds keyed by channelId, not by type. The
      // by-channelId read falls back to the legacy type doc. (Same fix as broadcastEmail.)
      const credentials = await this.credentialsService.getCredentialsByChannelId(tenantId, channelId, ChannelType.EMAIL) as ChannelCredentials;
      if (!credentials || !credentials.imapHost) {
        this.logger.warn(`No IMAP credentials for tenant ${tenantId}`);
        return;
      }

      const imap = new Imap({
        // IMAP login. Fall back to the SMTP username/password: most providers (Gmail, Outlook) use
        // ONE credential for both, and the "custom mail server" connect form often only captures the
        // smtp* pair. Without this fallback node-imap gets an empty user/pass and throws
        // "No supported authentication method(s) available" — it never even tries to log in.
        user: credentials.imapUsername || credentials.username || credentials.auth?.user || credentials.smtpUsername || '',
        password: credentials.imapPassword || credentials.password || credentials.auth?.pass || credentials.smtpPassword || '',
        host: credentials.imapHost,
        port: credentials.imapPort || 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
      });

    return new Promise((resolve, reject) => {
      this.logger.debug(`Connecting to IMAP for tenant ${tenantId}...`);
      imap.once('ready', () => {
        this.logger.debug(`IMAP ready for tenant ${tenantId}, opening INBOX...`);
        imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            this.logger.error(`Failed to open INBOX for tenant ${tenantId}: ${err.message}`);
            imap.end();
            return reject(err);
          }

          this.logger.debug(`INBOX opened for tenant ${tenantId}, searching for UNSEEN messages...`);
          // Look for UNSEEN messages
          imap.search(['UNSEEN'], (err, results) => {
            if (err) {
              this.logger.error(`Search error for tenant ${tenantId}: ${err.message}`);
              imap.end();
              return reject(err);
            }
            
            if (!results || !results.length) {
              this.logger.debug(`No UNSEEN messages found for tenant ${tenantId}`);
              imap.end();
              return resolve(true);
            }

            // P4 observability — structured log + a real CloudWatch metric (Flyn/Email EmailIngested)
            // per poll cycle that ingested mail, so it's alarmable like the WhatsApp metrics.
            this.logger.log(jlog({ event: 'email_poll_ingest', tenantId, channelId, unseen: results.length }));
            this.emitMetric(tenantId, 'EmailIngested', results.length);
            const f = imap.fetch(results, {
              bodies: '',
              markSeen: false,
            });

              f.on('message', (msg) => {
                msg.on('body', (stream) => {
                  const readable = Readable.from(stream as any);
                  simpleParser(readable, async (err, parsed) => {
                    if (err) {
                      this.logger.error(`Failed to parse email for tenant ${tenantId}: ${err.message}`);
                      return;
                    }

                    const fromAddr = (parsed.from?.value?.[0]?.address || parsed.from?.text || 'unknown@unknown.com').toLowerCase().trim();
                    const fromName = parsed.from?.value?.[0]?.name || fromAddr;
                    const subject = parsed.subject || '(no subject)';
                    // Preserve the rich HTML (sanitized) so it can render like Gmail; `content` keeps a
                    // plain-text PREVIEW for the list + search. We no longer DISCARD the HTML at the door.
                    const rawHtml = typeof parsed.html === 'string' ? parsed.html : '';
                    const bodyHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : undefined;
                    const body = (parsed.text && parsed.text.trim()) || htmlToPreviewText(rawHtml) || '(no content)';
                    const msgId = parsed.messageId || `email-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    const inReplyTo = (parsed as any).inReplyTo || undefined;
                    const references = normalizeReferences((parsed as any).references);
                    const cc = addressObjectToEmails(parsed.cc as any); // who else was on this email
                    // P1 — derive a stable thread key and STORE it as a signal (emailThreadId). Not yet
                    // used as the conversation key (that re-key + merge is the deploy-gated P2 migration).
                    const emailThreadId = deriveEmailThreadKey({ references, inReplyTo, messageId: msgId, subject, participants: [fromAddr] });

                    // P4 — bounce/complaint awareness. A delivery failure DSN arrives from the mail
                    // daemon; flag it so it's not mistaken for a real customer reply.
                    if (/mailer-daemon|postmaster|no-?reply/i.test(fromAddr)) {
                      this.logger.warn(jlog({ event: 'email_bounce_detected', tenantId, from: fromAddr, subject }));
                      this.emitMetric(tenantId, 'EmailBounce');
                    }

                    this.logger.log(`Email received from ${fromAddr} (tenant ${tenantId}): ${subject}`);

                    try {
                      const attachments = await this.uploadEmailAttachments(tenantId, parsed);
                      await this.inboxService.saveInboundMessage({
                        tenantId,
                        channel: 'email',
                        channelId,
                        senderPhone: fromAddr,
                        senderName: fromName,
                        content: body,
                        subject,
                        externalMessageId: msgId,
                        // Use the email's real Date header so it sorts by send time, not import time.
                        createdAtMs: parsed.date instanceof Date ? parsed.date.getTime() : undefined,
                        bodyHtml,
                        inReplyTo,
                        references,
                        emailThreadId,
                        attachments,
                        cc,
                      });
                    } catch (dbErr: any) {
                      this.logger.error(`Failed to store email in inbox for tenant ${tenantId}: ${dbErr.message}`);
                    }
                  });
                });
              });

              f.once('error', (err) => {
                this.logger.error(`Fetch error: ${err.message}`);
              });

              f.once('end', () => {
                imap.end();
              });
            });
          });
        });

        imap.once('error', (err) => {
          reject(err);
        });

        imap.once('end', () => {
          resolve(true);
        });

        imap.connect();
      });
    } catch (error: any) {
      this.logger.error(jlog({ event: 'email_poll_error', tenantId, channelId, error: error?.message }));
    }
  }

  /**
   * Poll the SENT mailbox so emails the user sent DIRECTLY from Gmail/Outlook (not via Flyn) appear
   * in the inbox as OUTBOUND — the two-sided fix (the email parity for WhatsApp's fromMe routing).
   * Keyed by the RECIPIENT ("to") address so it joins that contact's thread. Deduped downstream by
   * Message-ID (saveOutboundMessage). Bounded to recent mail (SINCE) and best-effort.
   */
  async pollSentBox(tenantId: string, channelId: string): Promise<void> {
    try {
      // Read by CHANNEL ID — connect stores email creds keyed by channelId, not by type. The
      // by-channelId read falls back to the legacy type doc. (Same fix as broadcastEmail.)
      const credentials = await this.credentialsService.getCredentialsByChannelId(tenantId, channelId, ChannelType.EMAIL) as ChannelCredentials;
      if (!credentials || !credentials.imapHost) return;
      const sentFolder = (credentials as any).sentFolder || '[Gmail]/Sent Mail';
      const imap = new Imap({
        // IMAP login. Fall back to the SMTP username/password: most providers (Gmail, Outlook) use
        // ONE credential for both, and the "custom mail server" connect form often only captures the
        // smtp* pair. Without this fallback node-imap gets an empty user/pass and throws
        // "No supported authentication method(s) available" — it never even tries to log in.
        user: credentials.imapUsername || credentials.username || credentials.auth?.user || credentials.smtpUsername || '',
        password: credentials.imapPassword || credentials.password || credentials.auth?.pass || credentials.smtpPassword || '',
        host: credentials.imapHost,
        port: credentials.imapPort || 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
      });

      await new Promise((resolve) => {
        const finish = () => { try { imap.end(); } catch { /* noop */ } resolve(true); };
        imap.once('ready', () => {
          imap.openBox(sentFolder, true, (boxErr) => {
            if (boxErr) { this.logger.warn(`[Email] Sent folder "${sentFolder}" not found for tenant ${tenantId}: ${boxErr.message}`); return finish(); }
            const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // last 2 days, deduped by id
            imap.search([['SINCE', since]], (sErr, results) => {
              if (sErr || !results?.length) return finish();
              const f = imap.fetch(results.slice(-100), { bodies: '', markSeen: false });
              f.on('message', (msg) => {
                msg.on('body', (stream) => {
                  simpleParser(Readable.from(stream as any), async (err, parsed) => {
                    if (err) return;
                    const toAddr = (parsed.to as any)?.value?.[0]?.address?.toLowerCase().trim();
                    if (!toAddr) return;
                    const toName = (parsed.to as any)?.value?.[0]?.name || toAddr;
                    const subject = parsed.subject || undefined;
                    const rawHtml = typeof parsed.html === 'string' ? parsed.html : '';
                    const bodyHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : undefined;
                    const body = (parsed.text && parsed.text.trim()) || htmlToPreviewText(rawHtml) || '';
                    if (!body && !bodyHtml) return;
                    const inReplyTo = (parsed as any).inReplyTo || undefined;
                    const references = normalizeReferences((parsed as any).references);
                    const emailThreadId = deriveEmailThreadKey({ references, inReplyTo, messageId: parsed.messageId || undefined, subject, participants: [toAddr] });
                    try {
                      const attachments = await this.uploadEmailAttachments(tenantId, parsed);
                      await this.inboxService.saveOutboundMessage({
                        tenantId, channel: 'email', channelId,
                        recipientPhone: toAddr, recipientName: toName, content: body || '(no content)',
                        messageId: parsed.messageId || `email-sent-${Date.now()}`,
                        createdAtMs: parsed.date instanceof Date ? parsed.date.getTime() : undefined,
                        subject, bodyHtml, inReplyTo, references, emailThreadId, attachments,
                      });
                    } catch { /* dedup / non-fatal */ }
                  });
                });
              });
              f.once('end', finish);
              f.once('error', finish);
            });
          });
        });
        imap.once('error', () => resolve(true));
        imap.connect();
      });
    } catch (error: any) {
      this.logger.warn(`[Email] Sent-box poll failed for tenant ${tenantId}: ${error.message}`);
    }
  }

  /**
   * P2 — ONE-TIME history backfill of the INBOX (the live poller only sees UNSEEN going forward).
   * Marker-guarded in flyn-migration-markers so it runs exactly once per channel, on the first cron
   * after the channel is connected. Saves every message with isHistory:true — which routes through
   * saveInboundMessage's if_not_exists branch, so it NEVER inflates unread or drags an active head
   * backward, and the by-id dedup makes a re-run a no-op. Read-only IMAP (never marks mail seen).
   * Fetched in sequential chunks to cap concurrency (no DynamoDB flood). Window = EMAIL_BACKFILL_DAYS
   * (default 30; set 0 to disable). The field extraction mirrors pollTenantEmail intentionally — the
   * live poller's control flow is left byte-for-byte untouched (Rule Zero: don't break what works).
   */
  async backfillInboxOnce(tenantId: string, channelId: string): Promise<void> {
    const days = Number(process.env.EMAIL_BACKFILL_DAYS ?? 30);
    if (!days || days <= 0) return;
    const migration = `email-backfill-v1:${channelId}`;
    if (await this.inboxService.hasMigrationRun(tenantId, migration)) return;

    try {
      // Read by CHANNEL ID — connect stores email creds keyed by channelId, not by type. The
      // by-channelId read falls back to the legacy type doc. (Same fix as broadcastEmail.)
      const credentials = await this.credentialsService.getCredentialsByChannelId(tenantId, channelId, ChannelType.EMAIL) as ChannelCredentials;
      if (!credentials || !credentials.imapHost) return;

      const imap = new Imap({
        // IMAP login. Fall back to the SMTP username/password: most providers (Gmail, Outlook) use
        // ONE credential for both, and the "custom mail server" connect form often only captures the
        // smtp* pair. Without this fallback node-imap gets an empty user/pass and throws
        // "No supported authentication method(s) available" — it never even tries to log in.
        user: credentials.imapUsername || credentials.username || credentials.auth?.user || credentials.smtpUsername || '',
        password: credentials.imapPassword || credentials.password || credentials.auth?.pass || credentials.smtpPassword || '',
        host: credentials.imapHost,
        port: credentials.imapPort || 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
      });

      let total = 0;
      let connectionErrored = false;
      this.logger.log(jlog({ event: 'email_backfill_start', tenantId, channelId, days }));

      await new Promise((resolve) => {
        const finish = () => { try { imap.end(); } catch { /* noop */ } resolve(true); };
        imap.once('ready', () => {
          imap.openBox('INBOX', true, (boxErr) => { // read-only — never mark seen
            if (boxErr) { connectionErrored = true; return finish(); }
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            imap.search([['SINCE', since]], async (sErr, results) => {
              if (sErr) { connectionErrored = true; return finish(); }
              if (!results?.length) return finish();
              const uids = results.slice(-500); // hard cap — most recent 500 in the window
              const chunkSize = 50;
              for (let i = 0; i < uids.length; i += chunkSize) {
                const chunk = uids.slice(i, i + chunkSize);
                // Fetch + persist one chunk fully before the next → concurrency capped at the chunk size.
                await new Promise((res) => {
                  const f = imap.fetch(chunk, { bodies: '', markSeen: false });
                  const pending: Promise<unknown>[] = [];
                  f.on('message', (msg) => {
                    msg.on('body', (stream) => {
                      pending.push(new Promise((done) => {
                        simpleParser(Readable.from(stream as any), async (err, parsed) => {
                          if (!err) {
                            try { if (await this.saveBackfillInbound(tenantId, channelId, parsed)) total++; } catch { /* dedup / non-fatal */ }
                          }
                          done(true);
                        });
                      }));
                    });
                  });
                  f.once('end', async () => { await Promise.allSettled(pending); res(true); });
                  f.once('error', () => { res(true); });
                });
              }
              finish();
            });
          });
        });
        imap.once('error', () => { connectionErrored = true; resolve(true); });
        imap.connect();
      });

      // Only mark done on a clean pass — a connection error leaves the marker unset so it retries
      // next cron (saves are idempotent, so a partial run + retry is safe).
      if (!connectionErrored) {
        await this.inboxService.recordMigrationRun(tenantId, migration, { backfilled: total, days });
        this.logger.log(jlog({ event: 'email_backfill_done', tenantId, channelId, backfilled: total, days }));
      } else {
        this.logger.warn(jlog({ event: 'email_backfill_incomplete', tenantId, channelId, backfilled: total, note: 'will retry next cron' }));
      }
    } catch (error: any) {
      this.logger.warn(jlog({ event: 'email_backfill_error', tenantId, channelId, error: error?.message }));
    }
  }

  /** Persist one backfilled inbound email (isHistory). Mirrors pollTenantEmail's field extraction. */
  private async saveBackfillInbound(tenantId: string, channelId: string, parsed: any): Promise<boolean> {
    const fromAddr = (parsed.from?.value?.[0]?.address || parsed.from?.text || 'unknown@unknown.com').toLowerCase().trim();
    const fromName = parsed.from?.value?.[0]?.name || fromAddr;
    const subject = parsed.subject || '(no subject)';
    const rawHtml = typeof parsed.html === 'string' ? parsed.html : '';
    const bodyHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : undefined;
    const body = (parsed.text && parsed.text.trim()) || htmlToPreviewText(rawHtml) || '(no content)';
    const msgId = parsed.messageId || `email-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const inReplyTo = parsed.inReplyTo || undefined;
    const references = normalizeReferences(parsed.references);
    const emailThreadId = deriveEmailThreadKey({ references, inReplyTo, messageId: msgId, subject, participants: [fromAddr] });
    const cc = addressObjectToEmails(parsed.cc);
    const attachments = await this.uploadEmailAttachments(tenantId, parsed);
    await this.inboxService.saveInboundMessage({
      tenantId,
      channel: 'email',
      channelId,
      senderPhone: fromAddr,
      senderName: fromName,
      content: body,
      subject,
      externalMessageId: msgId,
      createdAtMs: parsed.date instanceof Date ? parsed.date.getTime() : undefined,
      bodyHtml,
      inReplyTo,
      references,
      emailThreadId,
      attachments,
      cc,
      isHistory: true, // never inflate unread / clobber an active head
    });
    return true;
  }
}
