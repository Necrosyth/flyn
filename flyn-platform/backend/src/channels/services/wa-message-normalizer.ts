/**
 * Pure normalizer for a raw Baileys WhatsApp message → a flat, direction-aware shape the inbox
 * can store faithfully. No I/O, no side effects (so it is unit-testable in isolation).
 *
 * The async LID→phone resolution that needs the live socket stays in the service; when it has
 * resolved a phone JID it passes it in as `resolvedJid`. Otherwise this function falls back to
 * the message key's own `remoteJidAlt` (the phone form WhatsApp carries alongside a LID).
 *
 * Field names verified against the actual Baileys message shape (msg.key.fromMe,
 * msg.key.remoteJid, msg.key.remoteJidAlt, msg.key.id, msg.messageTimestamp, msg.pushName,
 * msg.message.{conversation,extendedTextMessage,imageMessage,...}).
 */

export type WaMediaType = 'image' | 'video' | 'document' | 'audio' | 'sticker';

export interface NormalizedWaMessage {
  fromMe: boolean;       // true = WE sent it (synced back from the phone / another device)
  jid: string;           // resolved remote JID (phone form when resolvable)
  fromPhone: string;     // digits only (E.164 without '+') — the conversation contact
  text: string;          // extracted text or a media placeholder
  msgId: string;         // provider message id (for dedup)
  timestampMs: number;   // REAL message time in ms (not import time)
  pushName?: string;
  mediaType?: WaMediaType;
  hasMedia: boolean;
}

/** Convert Baileys `messageTimestamp` (Unix seconds, number | string | Long) to ms. */
export function waTimestampMs(ts: unknown): number {
  if (ts === undefined || ts === null) return Date.now();
  let n: number;
  if (typeof ts === 'object' && ts !== null && 'low' in (ts as any)) {
    n = Number((ts as any).low); // protobuf Long
  } else {
    n = Number(ts);
  }
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return n > 1e10 ? n : n * 1000; // already ms vs seconds → ms
}

const MEDIA_PLACEHOLDER: Record<WaMediaType, string> = {
  image: '[Image]', video: '[Video]', document: '[Document]', audio: '[Audio]', sticker: '[Sticker]',
};

/** Extract text + media type from a Baileys message content. */
function extractContent(m: any): { text: string; mediaType?: WaMediaType; hasMedia: boolean } {
  if (!m) return { text: '', hasMedia: false };
  if (typeof m.conversation === 'string' && m.conversation) return { text: m.conversation, hasMedia: false };
  if (m.extendedTextMessage?.text) return { text: m.extendedTextMessage.text, hasMedia: false };

  const mediaMap: [string, WaMediaType][] = [
    ['imageMessage', 'image'], ['videoMessage', 'video'], ['documentMessage', 'document'],
    ['audioMessage', 'audio'], ['stickerMessage', 'sticker'],
  ];
  for (const [key, type] of mediaMap) {
    if (m[key]) {
      const caption = (m[key].caption as string) || (m[key].fileName as string) || '';
      return { text: caption ? `${MEDIA_PLACEHOLDER[type]} ${caption}`.trim() : MEDIA_PLACEHOLDER[type], mediaType: type, hasMedia: true };
    }
  }
  return { text: '', hasMedia: false };
}

/** Strip a JID to digits only (phone form). */
function jidToPhone(jid: string): string {
  return (jid || '').replace(/@[a-z.]+$/i, '').replace(/:\d+$/, '').replace(/\D/g, '');
}

/**
 * Normalize one Baileys message. Returns null for messages that should be skipped
 * (groups, broadcast/status, or no usable content/phone).
 */
export function normalizeWaMessage(msg: any, resolvedJid?: string): NormalizedWaMessage | null {
  const rawJid: string = msg?.key?.remoteJid ?? '';
  if (!rawJid) return null;
  if (rawJid.endsWith('@g.us')) return null;            // group
  if (rawJid === 'status@broadcast') return null;        // status updates

  // Resolve the remote JID to a phone form: caller-resolved → key's alt → raw.
  let jid = rawJid;
  if (resolvedJid && resolvedJid.endsWith('@s.whatsapp.net')) {
    jid = resolvedJid;
  } else if (rawJid.endsWith('@lid')) {
    const alt = msg?.key?.remoteJidAlt;
    if (typeof alt === 'string' && alt.endsWith('@s.whatsapp.net')) jid = alt;
  }

  const fromPhone = jidToPhone(jid);
  if (!fromPhone) return null;

  const { text, mediaType, hasMedia } = extractContent(msg?.message);
  if (!text) return null; // nothing renderable

  return {
    fromMe: !!msg?.key?.fromMe,
    jid,
    fromPhone,
    text,
    msgId: msg?.key?.id ?? `wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestampMs: waTimestampMs(msg?.messageTimestamp),
    pushName: typeof msg?.pushName === 'string' ? msg.pushName : undefined,
    mediaType,
    hasMedia,
  };
}
