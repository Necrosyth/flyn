/**
 * Pure (DI-free) email-branding helpers — shared by every outbound send path so
 * branding is applied identically whether the mail originates from a campaign,
 * an inbox reply, or an automated occasion.
 *
 * The resolved object is produced by EmailBrandingService.resolveTenantEmailBranding.
 * These functions only *apply* it. Keeping them pure means the SMTP connector can
 * brand a message without taking a Nest dependency on the resolver.
 *
 * BYO-SMTP model (today): the email is sent through the tenant's own connected
 * mailbox, so the envelope From address stays that DKIM-authenticated mailbox and
 * we override only the DISPLAY name (every SMTP allows this) + set Reply-To to the
 * tenant's customEmailDomain. The `usingCustomDomain` flag on the resolved object
 * is the dormant seam for a future "add-DNS, we send for you" SES mode — it is
 * always false here, and no path may send FROM an unverified domain.
 */

export interface ResolvedEmailBranding {
  /** Display name shown in the recipient's inbox (emailFromName || workspace name). */
  fromName: string;
  /** Reply-To address (the tenant's customEmailDomain) when it's a valid email, else null.
   *  NEVER used as the envelope sender — only as Reply-To over the connected mailbox. */
  replyTo: string | null;
  /** The tenant's footer text (may be empty). */
  footerText: string;
  /** Whether "Powered by Flyn AI" is appended — only ENTERPRISE (white_label) may turn this off. */
  showPoweredBy: boolean;
  logoMode: 'logo' | 'name';
  logoUrl: string;
  logoText: string;
  /** Platform SES-verified sender — used ONLY as the envelope From when there is no
   *  tenant SMTP to send through (e.g. the occasions fallback). Never a tenant domain. */
  platformSender: string;
  /** Dormant SES "we-send-for-you" seam. Always false in BYO mode. */
  usingCustomDomain: boolean;
  /** 'off' when no customEmailDomain set; 'unverified' when set (BYO never verifies via SES). */
  customDomainStatus: 'off' | 'unverified' | 'verified';
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

/** Final footer line: the tenant's text plus, when allowed/enabled, "Powered by Flyn AI". */
export function resolveFooterText(b: ResolvedEmailBranding): string {
  const parts = [b.footerText, b.showPoweredBy ? 'Powered by Flyn AI' : '']
    .map((s) => (s || '').trim())
    .filter(Boolean);
  // de-dupe so a tenant footer of "Powered by Flyn AI" + showPoweredBy doesn't double up
  return parts.filter((p, i) => parts.indexOf(p) === i).join(' · ');
}

/** Build the From header: display name over the real envelope address. In BYO mode the
 *  address is the connected mailbox (DKIM-aligned); only the visible name changes. */
export function formatFromHeader(fromName: string, envelopeAddress: string): string {
  const name = (fromName || '').replace(/["\r\n]/g, '').trim();
  return name ? `"${name}" <${envelopeAddress}>` : envelopeAddress;
}

function brandLogoHtml(b: ResolvedEmailBranding): string {
  if (b.logoMode === 'logo' && b.logoUrl) {
    return `<img src="${b.logoUrl}" alt="${escapeHtml(b.logoText)}" height="36" style="height:36px;max-height:36px;display:block;border:0" />`;
  }
  return `<span style="font-size:18px;font-weight:700;color:#111827">${escapeHtml(b.logoText)}</span>`;
}

/**
 * Re-brand pre-rendered email HTML at send time. Operates ONLY on known markers, so it
 * is safe on arbitrary template HTML (unknown bodies pass through untouched):
 *   1. rich-template seams `{{brand_footer}}` / `{{brand_logo}}` (when a template opts in)
 *   2. the hardcoded "Sent with FLYN AI" footer present in renderEmailHtml + all library shells
 * Idempotent enough to run once per template before per-recipient {{name}} substitution.
 */
export function applyEmailBranding(html: string, b: ResolvedEmailBranding): string {
  if (!html) return html;
  const footer = escapeHtml(resolveFooterText(b));
  return html
    .replace(/\{\{\s*brand_footer\s*\}\}/gi, footer)
    .replace(/\{\{\s*brand_logo\s*\}\}/gi, brandLogoHtml(b))
    .replace(/Sent with FLYN AI/g, footer);
}
