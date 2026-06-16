import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FirebaseService } from '../firebase/firebase.service';
import { MailService } from '../mail/mail.service';
import { NocoBaseService } from '../nocobase/nocobase.service';
import { ChannelsService } from '../channels/channels.service';
import { ChannelCredentialsService } from '../channels/services/channel-credentials.service';
import { ChannelType } from '../channels/types/channel.types';
import { EmailBrandingService } from '../branding/email-branding.service';
import { formatFromHeader, resolveFooterText } from '../branding/email-branding.util';
import * as nodemailer from 'nodemailer';
import sharp = require('sharp');

export interface OccasionEvent {
  type: string;
  data: Record<string, string | number>;
}

export interface CelebrationPrefs {
  birthday: boolean;
  workAnniversary: boolean;
  orgAnniversary: boolean;
  emoji: boolean;
  tone: 'warm' | 'formal' | 'founder';
  logoMode: 'logo' | 'name';
}

const DEFAULT_PREFS: CelebrationPrefs = {
  birthday: true,
  workAnniversary: true,
  orgAnniversary: true,
  emoji: true,
  tone: 'warm',
  logoMode: 'logo',
};

interface TenantBranding {
  name: string;        // emailFromName from White Label → Email tab
  logoUrl: string;     // logoUrl from White Label → Branding tab
  replyTo: string;     // customEmailDomain — used as Reply-To ONLY, never the envelope sender
  footerText: string;  // emailFooterText (+ Powered by Flyn unless ENTERPRISE hid it)
  logoMode: 'logo' | 'name'; // emailLogoMode from White Label → Email tab
}

@Injectable()
export class OccasionsService {
  private readonly logger = new Logger(OccasionsService.name);
  private readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly mail: MailService,
    private readonly nc: NocoBaseService,
    private readonly channelsService: ChannelsService,
    private readonly credentialsService: ChannelCredentialsService,
    private readonly emailBranding: EmailBrandingService,
  ) {}

  // ── Prefs ─────────────────────────────────────────────────────────────────

  async savePrefs(tenantId: string, prefs: Partial<CelebrationPrefs>): Promise<void> {
    const db = this.firebase.firestore();
    if (!db) return;
    await db
      .collection('tenants').doc(tenantId)
      .collection('settings').doc('celebrations')
      .set({ ...prefs, updatedAt: Date.now() }, { merge: true });
  }

  async getPrefs(tenantId: string): Promise<CelebrationPrefs> {
    const db = this.firebase.firestore();
    if (!db) return DEFAULT_PREFS;
    const snap = await db
      .collection('tenants').doc(tenantId)
      .collection('settings').doc('celebrations')
      .get();
    if (!snap.exists) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(snap.data() as Partial<CelebrationPrefs>) };
  }

  // ── In-app occasion check (admin banners) ─────────────────────────────────

  async checkOccasions(tenantId: string): Promise<OccasionEvent[]> {
    const occasions: OccasionEvent[] = [];
    try {
      const db = this.firebase.firestore();
      if (!db) return occasions;

      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (tenantDoc.exists) {
        const tenant = tenantDoc.data() ?? {};
        const orgName = String(tenant['workspaceName'] ?? tenant['name'] ?? 'Your organisation');

        const companyStartDate = tenant['companyStartDate'] as string | undefined;
        const now = new Date();

        // Organization Founded Anniversary — fires on companyStartDate match
        if (companyStartDate) {
          const parsed = new Date(companyStartDate);
          if (!isNaN(parsed.getTime())) {
            const yearsDiff = now.getFullYear() - parsed.getFullYear();
            if (
              parsed.getMonth() === now.getMonth() &&
              parsed.getDate() === now.getDate() &&
              yearsDiff > 0
            ) {
              occasions.push({
                type: 'occasion.org_anniversary',
                data: { years: yearsDiff, years_word: yearsDiff === 1 ? 'year' : 'years', org_name: orgName },
              });
            }
          }
        }

        // FLYN AI Join Anniversary — fires on account createdAt match
        const raw = tenant['createdAt'];
        let ms = 0;
        if (typeof raw === 'number') ms = raw;
        else if (raw && typeof (raw as any).toMillis === 'function') ms = (raw as any).toMillis();
        else if (raw && typeof (raw as any).seconds === 'number') ms = (raw as any).seconds * 1000;
        if (ms > 0) {
          const flynJoined = new Date(ms);
          const yearsDiff = now.getFullYear() - flynJoined.getFullYear();
          if (
            flynJoined.getMonth() === now.getMonth() &&
            flynJoined.getDate() === now.getDate() &&
            yearsDiff > 0
          ) {
            occasions.push({
              type: 'occasion.join_anniversary',
              data: { years: yearsDiff, years_word: yearsDiff === 1 ? 'year' : 'years', org_name: orgName },
            });
          }
        }
      }

      const todayHoliday = this.getTodayHoliday();
      if (todayHoliday) {
        occasions.push({
          type: 'occasion.holiday',
          data: { holiday_name: todayHoliday.name, country: todayHoliday.country },
        });
      }
    } catch (err) {
      this.logger.warn(`Occasion check failed for ${tenantId}: ${(err as Error).message}`);
    }
    return occasions;
  }

  // ── Daily cron: 8 AM UTC ──────────────────────────────────────────────────

  @Cron('0 8 * * *')
  async runDailyCelebrations(): Promise<void> {
    this.logger.log('Running daily celebrations scan…');
    const db = this.firebase.firestore();
    if (!db) return;
    try {
      const tenantsSnap = await db.collection('tenants').get();
      await Promise.allSettled(
        tenantsSnap.docs.map((doc) => this.sendCelebrationsForTenant(doc.id)),
      );
      this.logger.log(`Daily celebrations done for ${tenantsSnap.size} tenants.`);
    } catch (err) {
      this.logger.error(`Daily celebrations cron failed: ${(err as Error).message}`);
    }
  }

  // ── Per-tenant scan (also used by POST /occasions/send-now) ───────────────

  async sendCelebrationsForTenant(tenantId: string): Promise<{ sent: number; skipped: number }> {
    const db = this.firebase.firestore();
    if (!db) return { sent: 0, skipped: 0 };

    const [prefs, branding, emailMap] = await Promise.all([
      this.getPrefs(tenantId),
      this.getTenantBranding(tenantId),
      this.buildEmailMap(tenantId),
    ]);

    const today = new Date();
    const todayMM = today.getMonth() + 1;
    const todayDD = today.getDate();
    const todayYear = today.getFullYear();

    let sent = 0;
    let skipped = 0;

    try {
      const contactsSnap = await db
        .collection('tenants').doc(tenantId)
        .collection('phonebookContacts')
        .get();

      const contacts = contactsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      for (const contact of contacts) {
        const email = this.resolveEmail(contact, emailMap);
        if (!email) { skipped++; continue; }

        const name: string = contact.name ?? 'there';

        // Birthday
        if (prefs.birthday && contact.dateOfBirth) {
          const dob = new Date(contact.dateOfBirth);
          if (!isNaN(dob.getTime()) && dob.getMonth() + 1 === todayMM && dob.getDate() === todayDD) {
            try {
              await this.sendBirthdayEmail(email, name, prefs, branding, tenantId);
              sent++;
            } catch (e) {
              this.logger.error(`[occasions] Birthday email to ${email} FAILED: ${(e as Error).message}`, (e as Error).stack);
            }
            continue;
          }
        }

        // Work anniversary
        if (prefs.workAnniversary && contact.joinDate) {
          const joined = new Date(contact.joinDate);
          if (
            !isNaN(joined.getTime()) &&
            joined.getMonth() + 1 === todayMM &&
            joined.getDate() === todayDD &&
            joined.getFullYear() < todayYear
          ) {
            const years = todayYear - joined.getFullYear();
            try {
              await this.sendWorkAnniversaryEmail(email, name, years, prefs, branding, tenantId);
              sent++;
            } catch (e) {
              this.logger.error(`[occasions] Work-anniversary email to ${email} FAILED: ${(e as Error).message}`, (e as Error).stack);
            }
          }
        }
      }

      // HR employees — scan for work anniversaries (startDate)
      if (prefs.workAnniversary) {
        const hrSnap = await db
          .collection('hr_employees')
          .where('tenantId', '==', tenantId)
          .get();

        for (const doc of hrSnap.docs) {
          const emp = doc.data() as any;
          const email = this.resolveEmail(emp, emailMap);
          if (!email) continue;

          const startDate = emp.startDate || emp.hireDate || emp.joinDate;
          if (!startDate) continue;

          const start = new Date(startDate);
          if (
            !isNaN(start.getTime()) &&
            start.getMonth() + 1 === todayMM &&
            start.getDate() === todayDD &&
            start.getFullYear() < todayYear
          ) {
            const years = todayYear - start.getFullYear();
            await this.sendWorkAnniversaryEmail(email, emp.name ?? 'there', years, prefs, branding, tenantId).catch(() => {});
            sent++;
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Celebration scan failed for ${tenantId}: ${(err as Error).message}`);
    }

    return { sent, skipped };
  }

  // ── Build a unified phone→email + name→email map from ALL contact sources ─

  private async buildEmailMap(tenantId: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const normPhone = (p: string) => (p ?? '').replace(/\D/g, '').slice(-10);
    const normName = (n: string) => (n ?? '').toLowerCase().trim();

    const addContact = (name: string, phone: string | undefined, email: string | undefined) => {
      if (!email) return;
      if (phone) map.set(`ph:${normPhone(phone)}`, email);
      if (name) map.set(`nm:${normName(name)}`, email);
    };

    const db = this.firebase.firestore();

    await Promise.allSettled([
      // 1. Phonebook contacts (Firestore subcollection)
      db && db.collection('tenants').doc(tenantId).collection('phonebookContacts').get()
        .then(snap => snap.docs.forEach(d => {
          const c = d.data() as any;
          addContact(c.name, c.phone, c.email);
        })),

      // 2. HR employees (global Firestore collection filtered by tenantId)
      db && db.collection('hr_employees').where('tenantId', '==', tenantId).get()
        .then(snap => snap.docs.forEach(d => {
          const e = d.data() as any;
          addContact(e.name, e.phone, e.email);
        })),

      // 3. Church members (NocoBase)
      this.nc.list<any>('flyn_church_members', { pageSize: 500 })
        .then(res => (res?.data ?? []).forEach(m => addContact(m.name, m.phone, m.email))),

      // 4. Coaches clients (NocoBase)
      this.nc.list<any>('flyn_coaches_clients', { pageSize: 500 })
        .then(res => (res?.data ?? []).forEach(c => addContact(c.name, c.phone, c.email))),

      // 5. CRM contacts (NocoBase)
      this.nc.list<any>('contacts', { pageSize: 500 })
        .then(res => (res?.data ?? []).forEach(c => addContact(c.name, c.phone, c.email))),
    ]);

    return map;
  }

  // Resolve email for a contact: own email first, then fallback via phone/name
  private resolveEmail(contact: any, emailMap: Map<string, string>): string | null {
    if (contact.email) return contact.email;
    const normPhone = (p: string) => (p ?? '').replace(/\D/g, '').slice(-10);
    const normName = (n: string) => (n ?? '').toLowerCase().trim();
    if (contact.phone) {
      const found = emailMap.get(`ph:${normPhone(contact.phone)}`);
      if (found) return found;
    }
    if (contact.name) {
      const found = emailMap.get(`nm:${normName(contact.name)}`);
      if (found) return found;
    }
    return null;
  }

  // ── Tenant branding (name + logo) ─────────────────────────────────────────
  // Delegates to the ONE shared resolver (EmailBrandingService) so occasions use the
  // exact same branding + entitlement logic as campaigns/inbox — no second implementation.
  // Adapts the resolved object to the local shape occasions' HTML renderer needs.

  private async getTenantBranding(tenantId: string): Promise<TenantBranding> {
    const r = await this.emailBranding.resolveTenantEmailBranding(tenantId);
    return {
      name: r.fromName,
      logoUrl: r.logoUrl,
      replyTo: r.replyTo ?? '',                 // customEmailDomain → Reply-To only (never sender)
      footerText: resolveFooterText(r),         // tenant footer + "Powered by Flyn" unless ENTERPRISE hid it
      logoMode: r.logoMode,
    };
  }

  // ── Email send — uses tenant's own SMTP, falls back to system Brevo ─────────

  private async sendViaTenantSmtp(
    tenantId: string,
    params: { to: string; subject: string; html: string; fromName: string; replyTo?: string; attachments?: { filename: string; content: Buffer; contentType: string; cid: string }[] },
  ): Promise<void> {
    // DELIVERABILITY GATE: the envelope From is ALWAYS a verified sender — the tenant's connected
    // SMTP mailbox (DKIM-aligned) if present, else the platform sender noreply@myflynai.com. The
    // tenant's customEmailDomain is NEVER used as the envelope sender (it goes to Reply-To only),
    // so an unverified domain can never be sent through SES. See the Phase-6 law in
    // email-branding.service.ts.
    const replyTo = params.replyTo && this.EMAIL_RE.test(params.replyTo) ? params.replyTo : undefined;
    try {
      const channels = await this.channelsService.getTenantChannels(tenantId);
      const emailChannel = (channels as any[]).find(
        (c) => c.type === ChannelType.EMAIL && c.status === 'active',
      );
      if (emailChannel) {
        const creds = await this.credentialsService.getCredentialsByChannelId(tenantId, emailChannel.id, ChannelType.EMAIL);
        if (creds?.smtpHost && creds?.smtpUsername && creds?.smtpPassword) {
          const transporter = nodemailer.createTransport({
            host: creds.smtpHost,
            port: creds.smtpPort || 587,
            secure: creds.smtpPort === 465,
            auth: { user: creds.smtpUsername, pass: creds.smtpPassword },
          });
          await transporter.sendMail({
            from: formatFromHeader(params.fromName, creds.smtpUsername),
            to: params.to,
            subject: params.subject,
            html: params.html,
            ...(replyTo ? { replyTo } : {}),
            attachments: params.attachments,
          });
          this.logger.log(`[occasions] Sent via tenant SMTP (${creds.smtpHost}, from ${creds.smtpUsername}${replyTo ? `, reply-to ${replyTo}` : ''}) → ${params.to}`);
          return;
        }
      }
    } catch (err) {
      this.logger.warn(`[occasions] Tenant SMTP failed, falling back to platform sender: ${(err as Error).message}`);
    }
    // Fallback: platform SES from the verified noreply@myflynai.com — NEVER the custom domain.
    await this.mail.sendEmail({
      to: params.to,
      subject: params.subject,
      html: params.html,
      from: formatFromHeader(params.fromName, EmailBrandingService.PLATFORM_SENDER),
      ...(replyTo ? { replyTo } : {}),
      attachments: params.attachments,
    });
    this.logger.log(`[occasions] Sent via platform sender ${EmailBrandingService.PLATFORM_SENDER}${replyTo ? ` (reply-to ${replyTo})` : ''} → ${params.to}`);
  }

  // ── Email templates ────────────────────────────────────────────────────────

  private async sendBirthdayEmail(
    to: string,
    name: string,
    prefs: CelebrationPrefs,
    branding: TenantBranding,
    tenantId: string,
  ): Promise<void> {
    const emoji = prefs.emoji ? ' 🎂🎉' : '';
    const subject = `Happy Birthday, ${name}!${emoji}`;
    const body = this.buildBody(prefs.tone, name, {
      warm: `Hi ${name},\n\nWishing you a wonderful birthday${prefs.emoji ? ' 🎉' : ''}! We hope your day is filled with joy.\n\nWith warmest wishes,\nThe ${branding.name} Team`,
      formal: `Dear ${name},\n\nPlease accept our sincerest birthday wishes on this special occasion.\n\nBest regards,\nThe ${branding.name} Team`,
      founder: `Hey ${name},\n\nJust wanted to personally wish you a Happy Birthday! So grateful to have you.\n\nCheers,\nThe ${branding.name} Team`,
    });
    const { html, attachment } = await this.toHtml(body, branding, branding.logoMode ?? 'logo');
    await this.sendViaTenantSmtp(tenantId, { to, subject, html, fromName: branding.name, replyTo: branding.replyTo, attachments: attachment ? [attachment] : undefined });
  }

  private async sendWorkAnniversaryEmail(
    to: string,
    name: string,
    years: number,
    prefs: CelebrationPrefs,
    branding: TenantBranding,
    tenantId: string,
  ): Promise<void> {
    const emoji = prefs.emoji ? ' 🌟' : '';
    const yearWord = `${years} year${years !== 1 ? 's' : ''}`;
    const subject = `Happy ${yearWord} Anniversary, ${name}!${emoji}`;
    const body = this.buildBody(prefs.tone, name, {
      warm: `Hi ${name},\n\nCongratulations on ${yearWord} together${prefs.emoji ? ' 🌟' : ''}! Your dedication means the world to us.\n\nWith appreciation,\nThe ${branding.name} Team`,
      formal: `Dear ${name},\n\nWe are pleased to recognize your ${yearWord} anniversary. Thank you for your continued commitment.\n\nSincerely,\nThe ${branding.name} Team`,
      founder: `Hey ${name},\n\n${yearWord} — can you believe it? Huge thank you for being part of this journey.\n\nWith gratitude,\nThe ${branding.name} Team`,
    });
    const { html, attachment } = await this.toHtml(body, branding, branding.logoMode ?? 'logo');
    await this.sendViaTenantSmtp(tenantId, { to, subject, html, fromName: branding.name, replyTo: branding.replyTo, attachments: attachment ? [attachment] : undefined });
  }

  private buildBody(
    tone: CelebrationPrefs['tone'],
    _name: string,
    variants: Record<CelebrationPrefs['tone'], string>,
  ): string {
    return variants[tone] ?? variants.warm;
  }

  // Builds the email header logo. Must NEVER throw — logo is decoration, the email must still send.
  private async buildLogoAttachment(logoUrl: string): Promise<{ html: string; attachment?: { filename: string; content: Buffer; contentType: string; cid: string } }> {
    try {
      if (logoUrl.startsWith('data:')) {
        const commaIdx = logoUrl.indexOf(',');
        const decoded = Buffer.from(logoUrl.slice(commaIdx + 1), 'base64');
        // Resize to max 300×120 PNG — keeps it well under email-client size limits
        const compressed = await sharp(decoded).resize(300, 120, { fit: 'inside', withoutEnlargement: true }).png({ quality: 80 }).toBuffer();
        return {
          html: `<img src="cid:logo@flyn" style="max-height:48px;max-width:160px;object-fit:contain;margin-bottom:16px"/>`,
          attachment: { filename: 'logo.png', content: compressed, contentType: 'image/png', cid: 'logo@flyn' },
        };
      }
      if (logoUrl.startsWith('https://')) {
        return { html: `<img src="${logoUrl}" style="max-height:48px;max-width:160px;object-fit:contain;margin-bottom:16px"/>` };
      }
    } catch (err) {
      this.logger.warn(`[occasions] Logo processing failed, falling back to name: ${(err as Error).message}`);
    }
    return { html: '' };
  }

  private async toHtml(text: string, branding: TenantBranding, logoMode: 'logo' | 'name' = 'logo'): Promise<{ html: string; attachment?: { filename: string; content: Buffer; contentType: string; cid: string } }> {
    let logoHtml: string;
    let attachment: { filename: string; content: Buffer; contentType: string; cid: string } | undefined;

    if (logoMode === 'logo' && branding.logoUrl) {
      const result = await this.buildLogoAttachment(branding.logoUrl);
      logoHtml = result.html || `<p style="font-weight:bold;font-size:18px;margin:0 0 16px">${branding.name}</p>`;
      attachment = result.attachment;
    } else {
      logoHtml = `<p style="font-weight:bold;font-size:18px;margin:0 0 16px">${branding.name}</p>`;
    }

    const lines = text
      .split('\n')
      .map((l) => `<p style="margin:0 0 8px">${l}</p>`)
      .join('');

    const footerHtml = branding.footerText
      ? `<p style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center">${branding.footerText}</p>`
      : '';

    return {
      html: `<div style="font-family:sans-serif;padding:24px;color:#333;max-width:600px">
      ${logoHtml}
      ${lines}
      ${footerHtml}
    </div>`,
      attachment,
    };
  }

  // ── Public holidays ────────────────────────────────────────────────────────

  private getTodayHoliday(): { name: string; country: string } | null {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const holidays = [
      { month: 1, day: 1, name: "New Year's Day", country: 'Global' },
      { month: 2, day: 14, name: "Valentine's Day", country: 'Global' },
      { month: 3, day: 8, name: "International Women's Day", country: 'Global' },
      { month: 5, day: 1, name: "International Workers' Day", country: 'Global' },
      { month: 6, day: 19, name: 'Juneteenth', country: 'US' },
      { month: 7, day: 4, name: 'Independence Day', country: 'US' },
      { month: 10, day: 31, name: 'Halloween', country: 'US/UK' },
      { month: 11, day: 11, name: 'Remembrance Day', country: 'UK/CA' },
      { month: 12, day: 25, name: 'Christmas Day', country: 'Global' },
      { month: 12, day: 26, name: 'Boxing Day', country: 'UK/CA/AU' },
      { month: 12, day: 31, name: "New Year's Eve", country: 'Global' },
      { month: 12, day: 2, name: 'UAE National Day', country: 'UAE' },
      { month: 4, day: 23, name: 'Saudi National Day', country: 'SA' },
      { month: 3, day: 6, name: 'Ghana Independence Day', country: 'Ghana' },
      { month: 10, day: 1, name: 'Nigeria Independence Day', country: 'Nigeria' },
      { month: 12, day: 12, name: 'Kenya Independence Day', country: 'Kenya' },
      { month: 1, day: 26, name: 'Republic Day', country: 'India' },
      { month: 8, day: 15, name: 'Independence Day', country: 'India' },
      { month: 1, day: 26, name: 'Australia Day', country: 'Australia' },
      { month: 7, day: 1, name: 'Canada Day', country: 'Canada' },
    ];

    const match = holidays.find((h) => h.month === month && h.day === day);
    return match ?? null;
  }
}
