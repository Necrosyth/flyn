import sanitizeHtml = require('sanitize-html');
import { createHash } from 'crypto';

/**
 * Pure, side-effect-free email helpers. Unit-tested in email.util.spec.ts.
 *
 * These exist so the inbound HTML email body can be STORED and later RENDERED like Gmail,
 * and so a Flyn reply is a REAL RFC-5322 reply (Message-ID + In-Reply-To + References) that
 * lands inside the customer's existing Gmail thread — not a cosmetic "Re:" that starts a new one.
 *
 * Nothing here touches WhatsApp. Callers gate every use behind channel === 'email'.
 */

/**
 * Server-side sanitizer for UNTRUSTED inbound email HTML before it is stored/rendered.
 * Email bodies can carry <script>, on*= handlers, javascript: URLs, exfil <form>s, and
 * <iframe>/<object> payloads. We strip all of those while keeping the formatting that makes
 * an email look like Gmail (styled text, links, images, tables, lists).
 * Defense-in-depth: the P3 UI ALSO renders inside a sandboxed iframe — this is the storage layer.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'div', 'span', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'small',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'a', 'img',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
      'font', 'center',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'style'],
      font: ['color', 'face', 'size'],
      td: ['colspan', 'rowspan', 'align', 'valign', 'width', 'height', 'bgcolor', 'style'],
      th: ['colspan', 'rowspan', 'align', 'valign', 'width', 'height', 'bgcolor', 'style'],
      table: ['width', 'cellpadding', 'cellspacing', 'border', 'align', 'bgcolor', 'style'],
      tr: ['align', 'valign', 'bgcolor', 'style'],
      col: ['span', 'width', 'style'],
      '*': ['style', 'align', 'dir', 'title'],
    },
    // Links: http/https/mailto/tel only — NO javascript:, data:, vbscript:.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    // Images additionally allow inline data: URIs (very common in real email).
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    // Force external links to open safely (no window.opener back-reference, no referrer leak).
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
    },
    // Drop the ENTIRE content of dangerous tags, not just the tag wrapper.
    nonTextTags: ['style', 'script', 'textarea', 'noscript', 'iframe', 'object', 'embed', 'form'],
    // CSS: prop-allowlisted (sanitize-html parses the style string and drops anything not listed,
    // killing position/behavior/expression-style vectors). Values stay permissive for layout fidelity.
    allowedStyles: {
      '*': {
        color: [/^.*$/], 'background-color': [/^.*$/], 'text-align': [/^.*$/],
        'font-size': [/^.*$/], 'font-weight': [/^.*$/], 'font-style': [/^.*$/],
        'font-family': [/^.*$/], 'text-decoration': [/^.*$/], 'line-height': [/^.*$/],
        'vertical-align': [/^.*$/], display: [/^.*$/], width: [/^.*$/], height: [/^.*$/],
        margin: [/^.*$/], padding: [/^.*$/], border: [/^.*$/], 'border-color': [/^.*$/],
        'border-radius': [/^.*$/],
      },
    },
  });
}

/**
 * Flatten HTML to plain text for the conversation PREVIEW + search only. The rich HTML is
 * preserved separately in `bodyHtml` — this never discards it. (Uses `<[^>]+>`, not the old
 * inbound-stripping `<[^>]*>` that threw the body away before storage.)
 */
export function htmlToPreviewText(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A stable Message-ID we own for an outbound email: `<flyn-{token}@{sender-domain}>`.
 * Returned by the connector and persisted on the outbound row so the customer's next reply
 * (In-Reply-To: this id) chains back to it.
 */
export function buildOwnMessageId(token: string, fromAddress: string): string {
  const domain = (fromAddress.split('@')[1] || 'flyn.app').trim().replace(/[>\s]/g, '') || 'flyn.app';
  return `<flyn-${token}@${domain}>`;
}

/**
 * Coerce mailparser's `references` / `inReplyTo` (string | string[] | undefined — space- or
 * newline-separated when a string) into a clean array of angle-bracket Message-IDs.
 */
export function normalizeReferences(refs?: string | string[]): string[] {
  if (!refs) return [];
  const arr = Array.isArray(refs) ? refs : String(refs).split(/\s+/);
  return arr.map((r) => r.trim()).filter(Boolean);
}

/**
 * Build the References header for a reply (RFC 5322 §3.6.4): the parent's References chain
 * followed by the parent's Message-ID, deduped, original order preserved.
 */
export function buildReplyReferences(parentReferences: string[], parentMessageId?: string): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    const t = v?.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  for (const r of parentReferences || []) push(r);
  push(parentMessageId);
  return out;
}

/** Extract the bare email from a "Name <addr@x.com>" string, or return the input if already bare. */
export function extractEmailAddress(input: string): string {
  const m = input.match(/<([^>]+)>/);
  return (m ? m[1] : input).trim();
}

// Pragmatic RFC-5322-ish check — one @, no spaces, a dotted domain. Good enough to drop garbage
// without rejecting valid real-world addresses; nodemailer does the authoritative parsing.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whether a "addr" or "Name <addr>" string carries a structurally valid email. */
export function isValidEmailAddress(input: string): boolean {
  return EMAIL_RE.test(extractEmailAddress(input || ''));
}

/**
 * Parse a Cc/Bcc input — a comma/semicolon-separated string OR an array, each entry "addr" or
 * "Name <addr>" — into a clean array of valid address strings. Preserves the "Name <addr>" form
 * (nodemailer accepts it; verified Options.cc = string | Address | Array<string|Address>),
 * de-dupes by bare email, drops invalid/empty entries rather than crashing the send.
 */
export function parseAddressList(input?: string | string[]): string[] {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : String(input).split(/[,;]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const trimmed = (item || '').trim();
    if (!trimmed || !isValidEmailAddress(trimmed)) continue;
    const bare = extractEmailAddress(trimmed).toLowerCase();
    if (seen.has(bare)) continue;
    seen.add(bare);
    out.push(trimmed);
  }
  return out;
}

/** Bare lowercase emails from a mailparser AddressObject (parsed.cc) — for storage/display. */
export function addressObjectToEmails(addr?: { value?: Array<{ address?: string; name?: string }> }): string[] {
  const vals = addr?.value;
  if (!Array.isArray(vals)) return [];
  return vals.map((v) => (v?.address || '').toLowerCase().trim()).filter(Boolean);
}

/** Shape of a mailparser attachment we care about (verified against installed mailparser 3.x). */
export interface ParsedAttachmentLike {
  filename?: string;
  contentType?: string;
  size?: number;
  content?: Buffer | Uint8Array;
  related?: boolean;
}

/** Stored attachment metadata on a message row (S3-backed; served via presigned GET). */
export interface EmailAttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
  s3Key: string;
  fileUrl: string;
}

/** Sanitize an email attachment filename for display + S3 keying (strip path + control chars). */
export function sanitizeAttachmentName(name?: string, contentType?: string): string {
  const raw = (name || '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\\/]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._\s]+/, '')
    .trim();
  if (raw) return raw.slice(0, 200);
  const ext = (contentType || '').split('/')[1]?.split(';')[0]?.trim() || 'bin';
  return `attachment.${ext}`;
}

/**
 * Select the real, downloadable attachments from a mailparser attachments array: must have bytes
 * and a sane size, and we drop inline cid images that belong to the HTML body (related, no filename)
 * — those render in the body, not as a file chip. Bounded by maxBytes (Gmail's 25MB default).
 */
export function selectEmailAttachments(
  atts?: ParsedAttachmentLike[],
  maxBytes = 25 * 1024 * 1024,
): ParsedAttachmentLike[] {
  if (!Array.isArray(atts)) return [];
  return atts.filter((a) => {
    if (!a || !a.content) return false;
    const size = a.size ?? (a.content as any)?.length ?? 0;
    if (size <= 0 || size > maxBytes) return false;
    if (a.related === true && !a.filename) return false;
    return true;
  });
}

/**
 * Ensure a reply subject carries exactly one "Re: " prefix (Gmail-style). Already-prefixed
 * subjects (re:/fwd: in any case) are returned unchanged so we never stack "Re: Re:".
 */
export function ensureRePrefix(subject: string): string {
  const s = (subject || '').trim();
  if (!s) return 'Re: Your message';
  if (/^\s*(re|fwd|fw|aw|sv|antw)\s*(\[\d+\])?\s*:/i.test(s)) return s;
  return `Re: ${s}`;
}

/** Strip Re:/Fwd:/Fw:/Aw:/Sv: (incl. stacked + [n]) prefixes and normalize a subject for keying. */
export function normalizeSubject(subject: string): string {
  return (subject || '')
    .replace(/^(\s*(re|fwd|fw|aw|sv|antw)\s*(\[\d+\])?\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Derive a STABLE thread key so every message of one conversation groups together the way Gmail
 * threads do — regardless of which alias the person used. Strategy, best-first:
 *   1. Gmail's thread id (X-GM-THRID) when the IMAP server exposes it — globally stable, both sides agree.
 *   2. the ROOT Message-ID of the reference chain (References[0] → In-Reply-To → own Message-ID).
 *   3. normalized Subject (Re:/Fwd: stripped) + the sorted participant set — last resort.
 *
 * Pure + unit-tested. IMPORTANT: only the DERIVATION lives here. Wiring this as the conversation
 * KEY (replacing the address key) is a deploy-gated migration that must move existing data in
 * lockstep (P2) — until then callers STORE it as a signal (the emailThreadId attribute), they do
 * not key on it, so the inbox behavior is unchanged.
 */
export function deriveEmailThreadKey(input: {
  gmThreadId?: string | number | null;
  references?: string[];
  inReplyTo?: string;
  messageId?: string;
  subject?: string;
  participants?: string[];
}): string {
  if (input.gmThreadId !== undefined && input.gmThreadId !== null && String(input.gmThreadId).trim()) {
    return `gm:${String(input.gmThreadId).trim()}`;
  }
  const root =
    (input.references && input.references.length ? input.references[0] : undefined) ||
    input.inReplyTo ||
    input.messageId;
  if (root && root.trim()) return `ref:${root.trim()}`;
  const subj = normalizeSubject(input.subject || '');
  const parts = (input.participants || []).map((p) => p.toLowerCase().trim()).filter(Boolean).sort();
  return `subj:${subj}|${parts.join(',')}`;
}

/**
 * Colon-free, stable conversation token derived from a thread key. The raw key contains ':'
 * (e.g. "ref:<id>", "gm:123"), which would corrupt the colon-delimited conversationId
 * (`${tenantId}:email:${token}`). Hashing gives a short, opaque, deterministic token. Used ONLY
 * when EMAIL_THREAD_KEYING is enabled (P1b); the address-keyed default is unchanged.
 */
export function emailThreadConversationToken(threadKey: string): string {
  return 't_' + createHash('sha1').update(threadKey || '').digest('hex').slice(0, 16);
}
