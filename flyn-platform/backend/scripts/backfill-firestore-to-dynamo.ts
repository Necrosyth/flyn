/**
 * backfill-firestore-to-dynamo.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Recover inbound messages STRANDED in the Firestore fallback store.
 *
 * WHY: while the marshall bug was live, every inbound save threw on DynamoDB and fell back to
 * Firestore (`tenants/{tid}/inboxConversations/{convId}/messages/*`). Reads come from DynamoDB,
 * so those replies are invisible. This copies them into DynamoDB under the CANONICAL key so
 * they show in the thread, and ensures the conversation row exists so it shows in the list.
 *
 * SAFETY:
 *   • Dry-run by DEFAULT. Pass --apply to write.
 *   • Idempotent — messages are deduped by message id; a second run copies nothing.
 *   • Additive — never deletes from Firestore or DynamoDB.
 *
 * USAGE (from backend/):
 *   npx ts-node scripts/backfill-firestore-to-dynamo.ts                 # dry-run
 *   npx ts-node scripts/backfill-firestore-to-dynamo.ts --apply         # write to DynamoDB
 *   npx ts-node scripts/backfill-firestore-to-dynamo.ts --tenant=<tid> --apply
 */
import 'dotenv/config';
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const CONVERSATIONS_TABLE = 'flyn-conversations';
const MESSAGES_TABLE = 'flyn-messages';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY_TENANT = (args.find((a) => a.startsWith('--tenant=')) || '').split('=')[1] || '';

// ── Canonical key helpers (kept in lock-step with merge-split-conversations.ts) ──
const PHONE_CHANNELS = new Set(['whatsapp', 'wa', 'sms', 'mms', 'voice', 'telephony']);
function normalizePhone(raw: string): string {
  const trimmed = (raw || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}
function normalizeContact(channel: string, raw: string): string {
  const ch = (channel || '').toLowerCase();
  if (PHONE_CHANNELS.has(ch)) return normalizePhone(raw);
  return (raw || '').trim().toLowerCase(); // email & non-phone: identifier as-is, never digit-stripped
}
function canonicalId(tenantId: string, channel: string, contact: string): string {
  const ch = (channel || 'whatsapp').toLowerCase();
  return `${tenantId}:${ch}:${normalizeContact(ch, contact)}`;
}

/** Collect message ids already present in DynamoDB under a conversation (dedup target). */
async function existingMsgIds(db: DynamoDBClient, conversationId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await db.send(new QueryCommand({
      TableName: MESSAGES_TABLE,
      KeyConditionExpression: 'conversationId = :cid',
      ExpressionAttributeValues: marshall({ ':cid': conversationId }),
      ProjectionExpression: 'id',
      ExclusiveStartKey: lastKey,
    }));
    for (const it of res.Items || []) {
      const d = unmarshall(it);
      if (d.id) ids.add(d.id);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return ids;
}

(async () => {
  const region = process.env.AWS_REGION || 'us-east-1';
  const db = new DynamoDBClient({ region });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (b64) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
    else if (path) admin.initializeApp({ credential: admin.credential.cert(require(path)) });
    else throw new Error('Set FIREBASE_SERVICE_ACCOUNT_B64 or FIREBASE_SERVICE_ACCOUNT_PATH');
  }
  const fs = admin.firestore();
  console.log(`[fs→dynamo] region=${region}, apply=${APPLY}${ONLY_TENANT ? `, tenant=${ONLY_TENANT}` : ''}`);

  const tenants = ONLY_TENANT ? [{ id: ONLY_TENANT }] : (await fs.collection('tenants').get()).docs;
  let convosTouched = 0, msgsCopied = 0, msgsSkipped = 0;

  for (const t of tenants) {
    const tid = t.id;
    const convCol = fs.collection('tenants').doc(tid).collection('inboxConversations');
    const convSnap = await convCol.get();
    if (convSnap.empty) continue;

    // Group Firestore conversations by canonical key (a contact may have 3-part + 4-part rows).
    const groups = new Map<string, { canonical: string; channel: string; rows: { docId: string; data: any }[] }>();
    for (const doc of convSnap.docs) {
      const d = doc.data() as Record<string, any>;
      const parts = doc.id.split(':');
      const channel = (d.channel || parts[1] || 'whatsapp').toLowerCase();
      const contactPhone = d.contactPhone || (parts.length >= 4 ? parts.slice(3).join(':') : parts.slice(2).join(':'));
      const canonical = canonicalId(tid, channel, contactPhone);
      const g = groups.get(canonical) || { canonical, channel, rows: [] };
      g.rows.push({ docId: doc.id, data: d });
      groups.set(canonical, g);
    }

    for (const [canonical, g] of groups) {
      // Guard: never write an empty-contact key (e.g. `tid:telegram:`). An empty identifier
      // would fuse unrelated conversations into one bucket — the same class as the email bug.
      if (normalizeContact(g.channel, canonical.split(':').slice(2).join(':')) === '') {
        console.log(`  SKIP empty-contact group ${canonical} (${g.rows.length} conv row(s)) — cannot key safely`);
        continue;
      }
      const existing = APPLY ? await existingMsgIds(db, canonical) : new Set<string>();
      let lastMsgAt = 0, lastText = '', channelId: string | undefined, contactName: string | undefined, contactPhone: string | undefined, inboundCopied = 0, copiedHere = 0;

      for (const row of g.rows) {
        const msgSnap = await convCol.doc(row.docId).collection('messages').get();
        for (const m of msgSnap.docs) {
          const md = m.data() as Record<string, any>;
          const id = md.id || m.id;
          if (existing.has(id)) { msgsSkipped++; continue; }
          if (APPLY) {
            await db.send(new PutItemCommand({
              TableName: MESSAGES_TABLE,
              Item: marshall({ ...md, conversationId: canonical, sk: m.id, id }, { removeUndefinedValues: true }),
            }));
          }
          existing.add(id);
          msgsCopied++; copiedHere++;
          if ((md.timestamp || 0) >= lastMsgAt) {
            lastMsgAt = md.timestamp || lastMsgAt;
            lastText = (md.direction === 'outbound' ? 'You: ' : '') + String(md.content || '').slice(0, 180);
          }
          if (md.direction === 'inbound') inboundCopied++;
          channelId = md.channelId || channelId;
          contactName = contactName || md.senderName;
        }
        channelId = row.data.channelId || channelId;
        contactName = contactName || row.data.contactName;
        contactPhone = contactPhone || row.data.contactPhone;
      }

      if (copiedHere === 0) continue;
      convosTouched++;
      console.log(`  ${APPLY ? 'COPIED' : 'WOULD COPY'} ${copiedHere} msg(s) (${inboundCopied} inbound) → ${canonical}`);

      if (APPLY) {
        const channel = canonical.split(':')[1];
        const phone = canonical.split(':').slice(2).join(':');
        // Create the conversation row if missing; don't clobber a newer aggregate already there.
        await db.send(new UpdateItemCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: marshall({ tenantId: tid, sk: canonical }),
          UpdateExpression: `SET conversationId = if_not_exists(conversationId, :cid),
            #ch = if_not_exists(#ch, :ch), #st = if_not_exists(#st, :open),
            contactPhone = if_not_exists(contactPhone, :phone), contactName = if_not_exists(contactName, :name),
            lastMsgAt = if_not_exists(lastMsgAt, :t), lastMessageText = if_not_exists(lastMessageText, :txt)
            ${channelId ? ', channelId = if_not_exists(channelId, :chid)' : ''}
            ADD unreadCount :unread`,
          ExpressionAttributeNames: { '#ch': 'channel', '#st': 'status' },
          ExpressionAttributeValues: marshall({
            ':cid': canonical, ':ch': channel, ':open': 'open',
            ':phone': contactPhone || phone, ':name': contactName || contactPhone || phone,
            ':t': lastMsgAt || Date.now(), ':txt': lastText || '', ':unread': inboundCopied,
            ...(channelId ? { ':chid': channelId } : {}),
          }, { removeUndefinedValues: true }),
        }));
      }
    }
  }

  console.log(`\n[fs→dynamo] ${APPLY ? 'APPLIED' : 'DRY-RUN'} — conversations touched: ${convosTouched}, messages copied: ${msgsCopied}, already-present skipped: ${msgsSkipped}`);
  if (!APPLY) console.log('No writes performed. Re-run with --apply to recover the messages.');
  process.exit(0);
})().catch((e: any) => {
  console.error('[fs→dynamo] FAILED:', e?.message || e);
  process.exit(1);
});
