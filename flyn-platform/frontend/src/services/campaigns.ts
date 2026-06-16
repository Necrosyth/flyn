import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';

export type CampaignChannel = 'whatsapp' | 'telegram' | 'email' | 'call';
export type CampaignStatus = 'draft' | 'launching' | 'launched';
export type CampaignType = 'standard' | 'ab_test';

export interface CampaignContact {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  telegramId?: string;
  channelId?: string;
  source?: 'phonebook' | 'crm' | 'telegram';
}

export interface Campaign {
  campaignId: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  type: CampaignType;
  messageA: string;
  messageB?: string;
  subject?: string;
  emailHtml?: string;
  agentId?: string;
  audienceType: 'selected';
  selectedContacts: CampaignContact[];
  contactCount: number;
  sent: number;
  failed: number;
  createdAt: number;
  launchedAt?: number;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  preheader?: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  accent?: string;
  /** OPTIONAL pre-rendered full HTML (rich library templates). When present it IS the email body
   *  verbatim; the structured fields are ignored at render time. Absent on existing structured
   *  templates → they keep rendering through renderEmailHtml unchanged. Back-compatible. */
  html?: string;
  createdAt: number;
  updatedAt: number;
}

const BASE = `${API_BASE_URL}/campaigns`;

export const campaignsApi = {
  async list(channel?: CampaignChannel): Promise<Campaign[]> {
    const url = channel ? `${BASE}?channel=${channel}` : BASE;
    const res = await authedFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.campaigns || [];
  },

  async create(body: {
    name: string;
    channel: CampaignChannel;
    messageA?: string;
    messageB?: string;
    subject?: string;
    emailHtml?: string;
    agentId?: string;
    /** Tenant mailbox id to send FROM via Brevo (email only). Omit to use BYO-SMTP. */
    mailboxId?: string;
    selectedContacts: CampaignContact[];
  }): Promise<{ success: boolean; campaignId?: string; message?: string }> {
    const res = await authedFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: data.message || `Server error ${res.status}` };
    return data;
  },

  async launch(campaignId: string): Promise<{ success: boolean; sent: number; failed: number; error?: string; message?: string }> {
    const res = await authedFetch(`${BASE}/${campaignId}/launch`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, sent: 0, failed: 0, message: data.message || `Server error ${res.status}` };
    return data;
  },

  async remove(campaignId: string): Promise<{ success: boolean }> {
    const res = await authedFetch(`${BASE}/${campaignId}`, { method: 'DELETE' });
    return res.ok ? { success: true } : { success: false };
  },

  // ─── Email templates ──────────────────────────────────────────────────────

  async listEmailTemplates(): Promise<EmailTemplate[]> {
    const res = await authedFetch(`${BASE}/email-templates/list`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.templates || [];
  },

  async saveEmailTemplate(tpl: Partial<EmailTemplate>): Promise<EmailTemplate | null> {
    const res = await authedFetch(`${BASE}/email-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tpl),
    });
    if (!res.ok) return null;
    return res.json();
  },

  async deleteEmailTemplate(id: string): Promise<{ success: boolean }> {
    const res = await authedFetch(`${BASE}/email-templates/${id}`, { method: 'DELETE' });
    return res.ok ? { success: true } : { success: false };
  },
};

// ─── Shared email HTML renderer (used by builder preview + send payload) ───────

/** Branding for an ACCURATE preview. When omitted, renderEmailHtml emits seams
 *  ({{brand_logo}}) + the default "Sent with FLYN AI" footer, which the backend's
 *  applyEmailBranding swaps authoritatively at send time. When provided (preview),
 *  the header + footer are resolved client-side so preview === delivered email. */
export interface EmailBrandingPreview {
  footerText?: string;
  showPoweredBy?: boolean;
  logoMode?: 'logo' | 'name';
  logoUrl?: string | null;
  logoText?: string;
}

const htmlEscape = (s: string): string =>
  (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Footer line for preview — mirrors the backend resolveFooterText: tenant text +
 *  "Powered by Flyn AI" unless hidden, de-duped. Falls back to the swap-target default. */
export function previewFooterText(b?: EmailBrandingPreview): string {
  if (!b) return 'Sent with FLYN AI';
  const parts = [b.footerText, (b.showPoweredBy ?? true) ? 'Powered by Flyn AI' : '']
    .map((s) => (s || '').trim())
    .filter(Boolean);
  const uniq = parts.filter((p, i) => parts.indexOf(p) === i);
  return uniq.join(' · ') || 'Sent with FLYN AI';
}

/** Header brand cell — resolved logo/name for preview, else the {{brand_logo}} seam. */
function previewLogoHtml(b?: EmailBrandingPreview): string {
  if (!b) return '{{brand_logo}}';
  if (b.logoMode === 'logo' && b.logoUrl) {
    return `<img src="${b.logoUrl}" alt="${htmlEscape(b.logoText || '')}" height="32" style="height:32px;max-height:32px;display:block;border:0" />`;
  }
  return `<span style="font-size:18px;font-weight:700;color:#111827">${htmlEscape(b.logoText || 'Flyn')}</span>`;
}

export function renderEmailHtml(tpl: {
  subject?: string;
  preheader?: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  accent?: string;
}, branding?: EmailBrandingPreview): string {
  const accent = tpl.accent || '#7C6FF7';
  const paragraphs = (tpl.body || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#3f3f46">${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  const button = tpl.buttonLabel && tpl.buttonUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">
        <tr><td style="border-radius:10px;background:${accent}">
          <a href="${tpl.buttonUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${tpl.buttonLabel}</a>
        </td></tr>
      </table>`
    : '';

  const preheader = tpl.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${tpl.preheader}</div>`
    : '';

  // Header brand cell + footer. Both resolve from `branding` for an accurate preview, else fall
  // back to the {{brand_logo}} seam / "Sent with FLYN AI" default that the backend swaps at send.
  const headerBrand = previewLogoHtml(branding);
  const footer = previewFooterText(branding);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 0">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
      <tr><td style="height:4px;background:${accent}"></td></tr>
      <tr><td style="padding:28px 40px 0">${headerBrand}</td></tr>
      <tr><td style="padding:24px 40px 32px">
        ${paragraphs || '<p style="color:#a1a1aa;font-size:15px">Your message…</p>'}
        ${button}
      </td></tr>
      <tr><td style="padding:18px 40px 28px;border-top:1px solid #ececf1">
        <p style="margin:0;font-size:12px;color:#a1a1aa">${footer}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * The HTML actually previewed/sent for a draft: a rich library template's verbatim `html` when
 * present, otherwise the structured `renderEmailHtml` (UNCHANGED). This is a strict superset —
 * identical to renderEmailHtml when `html` is absent — so every existing structured template +
 * the whole send path behave exactly as before. {{name}} personalisation is applied by the caller
 * / broadcastEmail exactly as today, on whichever HTML this returns.
 */
export function resolveEmailHtml(tpl: {
  subject?: string;
  preheader?: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  accent?: string;
  html?: string;
}, branding?: EmailBrandingPreview): string {
  if (tpl.html && tpl.html.trim()) {
    // Rich template: brand it the same way the backend applyEmailBranding does (swap the seam +
    // hardcoded footer) so the preview matches the delivered email. Without branding, leave the
    // verbatim HTML — the backend brands it at send.
    return branding ? applyBrandingToHtml(tpl.html, branding) : tpl.html;
  }
  return renderEmailHtml(tpl, branding);
}

/** Frontend mirror of the backend applyEmailBranding — swaps the {{brand_footer}} / {{brand_logo}}
 *  seams and the hardcoded "Sent with FLYN AI" footer in arbitrary (rich) template HTML. Used for
 *  preview only; the backend re-applies authoritatively at send. */
export function applyBrandingToHtml(html: string, b: EmailBrandingPreview): string {
  if (!html) return html;
  const footer = htmlEscape(previewFooterText(b));
  return html
    .replace(/\{\{\s*brand_footer\s*\}\}/gi, footer)
    .replace(/\{\{\s*brand_logo\s*\}\}/gi, previewLogoHtml(b))
    .replace(/Sent with FLYN AI/g, footer);
}
