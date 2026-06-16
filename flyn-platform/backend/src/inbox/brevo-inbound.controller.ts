import { Body, Controller, HttpCode, Logger, Post, Query, UnauthorizedException } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { sanitizeEmailHtml } from '../channels/services/email.util';

/**
 * Brevo Inbound Parsing webhook → unified inbox. Brevo POSTs received mail here (MX pointed at
 * Brevo, webhook URL set in the Inbound dashboard). Each item's recipient address is mapped to a
 * tenant mailbox; the message is saved via InboxService.saveInboundMessage TAGGED with mailboxId,
 * which is what activates the (already-shipped) inbox privacy gate for that conversation.
 *
 * Payload shape confirmed against Brevo docs (developers.brevo.com — Inbound Parsing): a top-level
 * `items[]`, each with `From` (Mailbox {Address,Name}), `To[]`/`Recipients[]`, `Subject`,
 * `RawTextBody`, `RawHtmlBody`, `MessageId`, `InReplyTo`, `Cc[]`, `Attachments[]`.
 *
 * AUTH: this route is PUBLIC (Brevo can't send a bearer token), so it is protected two ways —
 *   1. an optional shared secret (BREVO_INBOUND_SECRET) checked against ?token=, and
 *   2. it only persists mail whose recipient maps to a real tenant mailbox; everything else is
 *      dropped. No mailbox match → nothing is written.
 */
@Controller('webhooks/brevo')
export class BrevoInboundController {
  private readonly logger = new Logger(BrevoInboundController.name);

  constructor(
    private readonly inboxService: InboxService,
    private readonly mailboxes: MailboxesService,
  ) {}

  @Post('inbound')
  @HttpCode(200)
  async inbound(@Body() body: any, @Query('token') token?: string) {
    const secret = process.env.BREVO_INBOUND_SECRET;
    if (secret && token !== secret) throw new UnauthorizedException('Invalid inbound token');

    const items: any[] = Array.isArray(body?.items) ? body.items : [];
    let routed = 0;
    let skipped = 0;
    for (const item of items) {
      try {
        (await this.handleItem(item)) ? routed++ : skipped++;
      } catch (err: any) {
        skipped++;
        this.logger.warn(`[brevo-inbound] item failed: ${err?.message || err}`);
      }
    }
    // Always 200 so Brevo doesn't retry-storm; the body reports what we did.
    return { success: true, routed, skipped };
  }

  private addr(m: any): string {
    if (typeof m === 'string') return m.toLowerCase().trim();
    return String(m?.Address || m?.address || '').toLowerCase().trim();
  }
  private nameOf(m: any): string {
    return String(m?.Name || m?.name || '').trim();
  }

  /** Route one inbound email to its tenant mailbox. Returns true when persisted, false when dropped. */
  private async handleItem(item: any): Promise<boolean> {
    // Candidate recipients: explicit To[] plus the SMTP RCPT TO Recipients[] (covers BCC/alias delivery).
    const candidates = [
      ...(Array.isArray(item?.To) ? item.To.map((m: any) => this.addr(m)) : []),
      ...(Array.isArray(item?.Recipients) ? item.Recipients.map((m: any) => this.addr(m)) : []),
    ].filter(Boolean);

    let mailbox = null as Awaited<ReturnType<MailboxesService['findMailboxByAddress']>>;
    for (const r of candidates) {
      mailbox = await this.mailboxes.findMailboxByAddress(r);
      if (mailbox) break;
    }
    if (!mailbox) {
      this.logger.warn(`[brevo-inbound] no mailbox for recipients [${candidates.join(', ')}] — dropped`);
      return false;
    }

    const from = this.addr(item?.From);
    if (!from) {
      this.logger.warn(`[brevo-inbound] missing From on mail to ${mailbox.address} — dropped`);
      return false;
    }
    const text = String(item?.RawTextBody || item?.ExtractedMarkdownMessage || '').trim();
    const html = item?.RawHtmlBody ? sanitizeEmailHtml(String(item.RawHtmlBody)) : undefined;
    const cc = Array.isArray(item?.Cc) ? item.Cc.map((m: any) => this.addr(m)).filter(Boolean) : undefined;

    await this.inboxService.saveInboundMessage({
      tenantId: mailbox.tenantId,
      channel: 'email',
      senderPhone: from,
      senderName: this.nameOf(item?.From) || from,
      content: text || '(no text content)',
      ...(item?.MessageId ? { externalMessageId: String(item.MessageId) } : {}),
      ...(item?.Subject ? { subject: String(item.Subject) } : {}),
      mailboxId: mailbox.id,
      ...(html ? { bodyHtml: html } : {}),
      ...(item?.InReplyTo ? { inReplyTo: String(item.InReplyTo) } : {}),
      ...(cc?.length ? { cc } : {}),
    });
    this.logger.log(`[brevo-inbound] ${from} → ${mailbox.address} (tenant ${mailbox.tenantId}, mailbox ${mailbox.id})`);
    return true;
  }
}
