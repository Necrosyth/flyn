import { BadRequestException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { ChannelsService } from '../channels/channels.service';
import { InboxService } from '../inbox/inbox.service';

export type CampaignChannel = 'whatsapp' | 'telegram' | 'email' | 'call';
export type CampaignStatus = 'draft' | 'launching' | 'launched';
export type CampaignType = 'standard' | 'ab_test';

/** A single selected recipient. Shape varies per channel:
 *  - whatsapp/call: { phone, name }
 *  - email:         { email, name }
 *  - telegram:      { telegramId, channelId, name }
 */
export interface CampaignContact {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  telegramId?: string;
  channelId?: string;
  source?: 'phonebook' | 'crm' | 'telegram';
}

export interface CampaignDoc {
  campaignId: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  type: CampaignType;
  messageA: string;
  messageB?: string;
  subject?: string;       // email only
  emailHtml?: string;     // email only — pre-rendered HTML body (may contain {{name}})
  agentId?: string;       // call only
  /** Tenant mailbox to send from (email only). When set, sends via Brevo (send-as-mailbox) instead
   *  of broadcastEmail (BYO-SMTP). Stored at create; read at launch. */
  mailboxId?: string;
  audienceType: 'selected';
  selectedContacts: CampaignContact[];
  contactCount: number;
  sent: number;
  failed: number;
  createdAt: number;
  launchedAt?: number;
}

export interface EmailTemplateDoc {
  id: string;
  name: string;
  subject: string;
  preheader?: string;
  /** Body in simple block markup — paragraphs separated by blank lines; supports {{vars}} */
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  /** Hex accent for the CTA button + header bar */
  accent?: string;
  /** OPTIONAL pre-rendered full HTML (rich library templates). When present it is the email body
   *  verbatim and the structured fields above are ignored at render time. Absent for the existing
   *  structured templates, which keep rendering through renderEmailHtml unchanged. Back-compatible. */
  html?: string;
  createdAt: number;
  updatedAt: number;
}

const COLLECTION = 'campaigns';
const EMAIL_TEMPLATES = 'emailTemplates';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly channelsService: ChannelsService,
    @Inject(forwardRef(() => InboxService))
    private readonly inboxService: InboxService,
  ) {}

  private col(tenantId: string) {
    return this.firebase.firestore()!
      .collection('tenants').doc(tenantId)
      .collection(COLLECTION);
  }

  private templatesCol(tenantId: string) {
    return this.firebase.firestore()!
      .collection('tenants').doc(tenantId)
      .collection(EMAIL_TEMPLATES);
  }

  // ─── Email Templates ──────────────────────────────────────────────────────

  async listEmailTemplates(tenantId: string): Promise<EmailTemplateDoc[]> {
    try {
      const snap = await this.templatesCol(tenantId).get();
      return snap.docs.map((d) => d.data() as EmailTemplateDoc).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    } catch (err: any) {
      this.logger.error(`listEmailTemplates failed: ${err.message}`);
      return [];
    }
  }

  async saveEmailTemplate(tenantId: string, body: Partial<EmailTemplateDoc>): Promise<EmailTemplateDoc> {
    if (!body.name?.trim()) throw new BadRequestException('Template name is required');
    if (!body.subject?.trim()) throw new BadRequestException('Subject is required');
    const id = body.id || `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const existing = body.id ? (await this.templatesCol(tenantId).doc(id).get()).data() as EmailTemplateDoc | undefined : undefined;
    const doc: EmailTemplateDoc = {
      id,
      name: body.name.trim(),
      subject: body.subject.trim(),
      preheader: body.preheader?.trim() || '',
      body: body.body || '',
      buttonLabel: body.buttonLabel?.trim() || '',
      buttonUrl: body.buttonUrl?.trim() || '',
      accent: body.accent || '#7C6FF7',
      // Persist rich HTML only when supplied (a library template cloned as-is). Structured
      // templates omit it → unchanged behaviour.
      ...(body.html?.trim() ? { html: body.html } : {}),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await this.templatesCol(tenantId).doc(id).set(doc);
    return doc;
  }

  async deleteEmailTemplate(tenantId: string, id: string): Promise<{ success: boolean }> {
    await this.templatesCol(tenantId).doc(id).delete();
    return { success: true };
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async list(tenantId: string, channel?: CampaignChannel): Promise<CampaignDoc[]> {
    let snap;
    try {
      snap = await this.col(tenantId).get();
    } catch (err: any) {
      this.logger.error(`list campaigns failed: ${err.message}`);
      return [];
    }
    let campaigns = snap.docs.map((d) => d.data() as CampaignDoc);
    if (channel) campaigns = campaigns.filter((c) => c.channel === channel);
    return campaigns.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  async create(tenantId: string, body: {
    name: string;
    channel: CampaignChannel;
    messageA?: string;
    messageB?: string;
    subject?: string;
    emailHtml?: string;
    agentId?: string;
    /** Tenant mailbox id to send email campaign from via Brevo (optional; falls back to BYO-SMTP). */
    mailboxId?: string;
    selectedContacts?: CampaignContact[];
  }): Promise<{ success: boolean; campaignId: string }> {
    if (!body.name?.trim()) throw new BadRequestException('name is required');
    if (!body.channel) throw new BadRequestException('channel is required');
    if (!['whatsapp', 'telegram', 'email', 'call'].includes(body.channel)) {
      throw new BadRequestException('Invalid channel');
    }
    if (!body.selectedContacts?.length) throw new BadRequestException('Select at least one contact');

    // Call campaigns don't need a message body (the AI agent drives the call).
    if (body.channel !== 'call' && !body.messageA?.trim()) {
      throw new BadRequestException('messageA is required');
    }
    if (body.channel === 'email' && !body.subject?.trim()) {
      throw new BadRequestException('subject is required for email campaigns');
    }

    const campaignId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isAB = !!body.messageB?.trim();
    const doc: CampaignDoc = {
      campaignId,
      name: body.name.trim(),
      channel: body.channel,
      status: 'draft',
      type: isAB ? 'ab_test' : 'standard',
      messageA: body.messageA?.trim() || '',
      ...(isAB ? { messageB: body.messageB!.trim() } : {}),
      ...(body.subject?.trim() ? { subject: body.subject.trim() } : {}),
      ...(body.emailHtml?.trim() ? { emailHtml: body.emailHtml } : {}),
      ...(body.agentId ? { agentId: body.agentId } : {}),
      ...(body.mailboxId && body.channel === 'email' ? { mailboxId: body.mailboxId } : {}),
      audienceType: 'selected',
      selectedContacts: body.selectedContacts,
      contactCount: body.selectedContacts.length,
      sent: 0,
      failed: 0,
      createdAt: Date.now(),
    };

    await this.col(tenantId).doc(campaignId).set(doc);
    return { success: true, campaignId };
  }

  async remove(tenantId: string, campaignId: string): Promise<{ success: boolean }> {
    await this.col(tenantId).doc(campaignId).delete();
    return { success: true };
  }

  // ─── Launch ───────────────────────────────────────────────────────────────

  async launch(tenantId: string, campaignId: string): Promise<{ success: boolean; sent: number; failed: number; error?: string }> {
    const ref = this.col(tenantId).doc(campaignId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Campaign not found');
    const campaign = snap.data() as CampaignDoc;

    if (campaign.status === 'launched') {
      throw new BadRequestException('Campaign already launched');
    }
    const contacts = campaign.selectedContacts || [];
    if (!contacts.length) return { success: false, sent: 0, failed: 0, error: 'No contacts selected' };

    await ref.update({ status: 'launching' });

    try {
      let sent = 0;
      let failed = 0;
      const personalise = (msg: string, name?: string) =>
        msg.replace(/\{\{\s*name\s*\}\}/gi, name || 'there');

      const isAB = campaign.type === 'ab_test' && !!campaign.messageB;
      const pickMessage = (idx: number) =>
        isAB && idx % 2 === 1 ? campaign.messageB! : campaign.messageA;

      switch (campaign.channel) {
        case 'whatsapp': {
          // broadcastWhatsApp handles the loop; split for A/B
          const withPhone = contacts.filter((c) => c.phone);
          if (isAB) {
            const half = Math.floor(withPhone.length / 2);
            const groupA = withPhone.slice(0, half).map((c) => ({ phone: c.phone!, name: c.name }));
            const groupB = withPhone.slice(half).map((c) => ({ phone: c.phone!, name: c.name }));
            const rA = await this.channelsService.broadcastWhatsApp(tenantId, groupA, campaign.messageA);
            sent += rA.sent; failed += rA.failed;
            if (groupB.length) {
              const rB = await this.channelsService.broadcastWhatsApp(tenantId, groupB, campaign.messageB!);
              sent += rB.sent; failed += rB.failed;
            }
          } else {
            const recipients = withPhone.map((c) => ({ phone: c.phone!, name: c.name }));
            const r = await this.channelsService.broadcastWhatsApp(tenantId, recipients, campaign.messageA);
            sent = r.sent; failed = r.failed;
          }
          break;
        }

        case 'email': {
          const withEmail = contacts.filter((c) => c.email);
          const subj = campaign.subject || campaign.name;
          const html = campaign.emailHtml;

          if (campaign.mailboxId) {
            // Send-as-mailbox path: Brevo transactional, DKIM-aligned to the tenant domain.
            // Per-recipient so {{name}} personalisation + individual thread tagging works.
            for (const c of withEmail) {
              const idx = withEmail.indexOf(c);
              const msg = isAB && idx % 2 === 1 ? (campaign.messageB ?? campaign.messageA) : campaign.messageA;
              try {
                const res = await this.inboxService.sendAsMailbox({
                  tenantId,
                  uid: 'campaign',   // campaign sends bypass the per-user ACL; mailbox access already
                  mailboxId: campaign.mailboxId, // checked at create time when the user picked it.
                  to: { email: c.email!, name: c.name },
                  subject: subj,
                  text: personalise(msg, c.name),
                  ...(html ? { html: personalise(html, c.name) } : {}),
                });
                if (res.messageId) sent++; else failed++;
              } catch { failed++; }
            }
          } else {
            // BYO-SMTP path (broadcastEmail) — unchanged behaviour.
            if (isAB) {
              const half = Math.floor(withEmail.length / 2);
              const groupA = withEmail.slice(0, half).map((c) => ({ email: c.email!, name: c.name }));
              const groupB = withEmail.slice(half).map((c) => ({ email: c.email!, name: c.name }));
              const rA = await this.channelsService.broadcastEmail(tenantId, groupA, campaign.messageA, subj, html);
              sent += rA.sent; failed += rA.failed;
              if (groupB.length) {
                const rB = await this.channelsService.broadcastEmail(tenantId, groupB, campaign.messageB!, subj, html);
                sent += rB.sent; failed += rB.failed;
              }
            } else {
              const recipients = withEmail.map((c) => ({ email: c.email!, name: c.name }));
              const r = await this.channelsService.broadcastEmail(tenantId, recipients, campaign.messageA, subj, html);
              sent = r.sent; failed = r.failed;
            }
          }
          break;
        }

        case 'telegram': {
          // Per-subscriber send via sendChannelMessage (needs channelId + telegramId)
          for (let i = 0; i < contacts.length; i++) {
            const c = contacts[i];
            if (!c.telegramId || !c.channelId) { failed++; continue; }
            try {
              const msg = personalise(pickMessage(i), c.name);
              const r = await this.channelsService.sendChannelMessage(tenantId, c.channelId, c.telegramId, msg);
              if (r.success) sent++; else failed++;
            } catch (err: any) {
              this.logger.warn(`[Campaign ${campaignId}] Telegram send failed → ${c.telegramId}: ${err.message}`);
              failed++;
            }
          }
          break;
        }

        case 'call': {
          // Real outbound AI voice calls, reusing the Dialer's primitive.
          for (const c of contacts) {
            if (!c.phone) { failed++; continue; }
            try {
              await this.channelsService.makeTwilioAiCall(tenantId, c.phone, campaign.agentId, true);
              sent++;
            } catch (err: any) {
              this.logger.warn(`[Campaign ${campaignId}] Call failed → ${c.phone}: ${err.message}`);
              failed++;
            }
          }
          break;
        }

        default:
          throw new BadRequestException(`Unsupported channel: ${campaign.channel}`);
      }

      await ref.update({ status: 'launched', sent, failed, launchedAt: Date.now() });
      this.logger.log(`[Campaign ${campaignId}] launched (${campaign.channel}): ${sent} sent, ${failed} failed for tenant ${tenantId}`);
      return { success: true, sent, failed };
    } catch (err: any) {
      this.logger.error(`launch campaign ${campaignId} failed: ${err.message}`, err.stack);
      try { await ref.update({ status: 'draft' }); } catch { /* non-fatal */ }
      throw new BadRequestException(err?.message || 'Campaign launch failed');
    }
  }
}
