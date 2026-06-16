/**
 * merge-split-conversations.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * ONE-TIME BACKFILL — collapse conversations that were split across multiple keys.
 *
 * WHY: the inbox conversation key used to embed `channelId`
 *   `${tenantId}:${channel}:${channelId}:${phone}`  (4-part)
 * channelId is per-session transport identity (a QR re-scan / redeploy mints a new
 * `wa_web_<ts>` channel doc), so the SAME human conversation fragmented into 2-3 buckets:
 * the agent's outbound landed in one, the customer's inbound in another → "replies never
 * show up". The code now writes the canonical key `${tenantId}:${channel}:${phone}` (3-part).
 * This script merges the pre-existing split rows into that canonical key.
 *
 * DEVIATION FROM SPEC: the spec assumed a Firestore `flyn-conversations` collection. In this
 * codebase `flyn-conversations` / `flyn-messages` are **DynamoDB** tables and Dynamo is the
 * LIVE production store (App Runner runs with NODE_ENV=production + an IAM role, so
 * InboxService uses the Dynamo client). This script therefore targets DynamoDB by default,
 * with an optional `--store=firestore` branch for local/dev tenants.
 *
 * SAFETY:
 *   • Dry-run by DEFAULT. Pass --apply to actually write/delete.
 *   • Idempotent — canonical key is deterministic, so a second run finds nothing to merge.
 *   • Messages are COPIED to the canonical conversation, deduped by message id, and only then
 *     are the orphan rows deleted.
 *
 * USAGE (from backend/):
 *   npx ts-node scripts/merge-split-conversations.ts                # dry-run (default)
 *   npx ts-node scripts/merge-split-conversations.ts --apply        # execute (DynamoDB)
 *   npx ts-node scripts/merge-split-conversations.ts --store=firestore --apply
 *   npx ts-node scripts/merge-split-conversations.ts --tenant=<tid> # limit to one tenant
 */
import 'dotenv/config';
import {
  DynamoDBClient,
  ScanCommand,
  QueryCommand,
  PutItemCommand,
  DeleteItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const CONVERSATIONS_TABLE = 'flyn-conversations';
const MESSAGES_TABLE = 'flyn-messages';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const STORE = (args.find((a) => a.startsWith('--store=')) || '--store=dynamo').split('=')[1];
const ONLY_TENANT = (args.find((a) => a.startsWith('--tenant=')) || '').split('=')[1] || '';

/** Mirror of ChannelsService.normalizePhoneE164(...).replace(/^\+/,'') — keep in lock-step. */
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

// CRITICAL: only phone-based channels may be digit-normalized. Applying normalizePhone to an
// email strips every letter → "" and would FUSE unrelated senders into one empty-key bucket.
// For email (and any non-phone channel) the contact identifier IS the key segment, lowercased.
const PHONE_CHANNELS = new Set(['whatsapp', 'wa', 'sms', 'mms', 'voice', 'telephony']);
function normalizeContact(channel: string, raw: string): string {
  const ch = (channel || '').toLowerCase();
  if (PHONE_CHANNELS.has(ch)) return normalizePhone(raw);
  return (raw || '').trim().toLowerCase();
}

function canonicalId(tenantId: string, channel: string, contact: string): string {
  const ch = (channel || 'whatsapp').toLowerCase();
  return `${tenantId}:${ch}:${normalizeContact(ch, contact)}`;
}

// ── Group key derived from a conversation row's attributes (not by parsing the sk, which may
//    be 3-part or 4-part). Falls back to parsing the sk when contactPhone is missing. ──
function groupKeyForConv(d: Record<string, any>): { tenantId: string; channel: string; phone: string; canonical: string } | null {
  const tenantId = d.tenantId;
  let channel = (d.channel || '').toLowerCase();
  let phone = d.contactPhone || '';
  if (!tenantId) return null;
  if (!channel || !phone) {
    // Derive from the stored key: tid:channel:[channelId:]phone
    const sk: string = d.conversationId || d.sk || '';
    const parts = sk.split(':');
    if (parts.length >= 3) {
      channel = channel || parts[1];
      phone = phone || (parts.length >= 4 ? parts.slice(3).join(':') : parts.slice(2).join(':'));
    }
  }
  if (!channel || !phone) return null;
  return { tenantId, channel, phone, canonical: canonicalId(tenantId, channel, phone) };
}

// ════════════════════════════════════════════════════════════════════════════
// DynamoDB implementation
// ════════════════════════════════════════════════════════════════════════════
async function runDynamo() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const db = new DynamoDBClient({ region });
  console.log(`[backfill] DynamoDB store, region=${region}, apply=${APPLY}${ONLY_TENANT ? `, tenant=${ONLY_TENANT}` : ''}`);

  // 1. Scan all conversations
  const convs: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await db.send(new ScanCommand({ TableName: CONVERSATIONS_TABLE, ExclusiveStartKey: lastKey }));
    for (const it of res.Items || []) convs.push(unmarshall(it));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  console.log(`[backfill] scanned ${convs.length} conversation rows`);

  // 2. Group by canonical key
  const groups = new Map<string, Record<string, any>[]>();
  for (const c of convs) {
    if (ONLY_TENANT && c.tenantId !== ONLY_TENANT) continue;
    const gk = groupKeyForConv(c);
    if (!gk) continue;
    const arr = groups.get(gk.canonical) || [];
    arr.push(c);
    groups.set(gk.canonical, arr);
  }

  let mergedGroups = 0;
  let movedMessages = 0;
  let deletedOrphans = 0;

  // 3. Merge each multi-row group into its canonical doc
  for (const [canonical, rows] of groups) {
    const orphans = rows.filter((r) => (r.conversationId || r.sk) !== canonical);
    if (orphans.length === 0) continue; // already canonical / single row

    const tenantId = rows[0].tenantId;
    console.log(`\n[group] ${canonical} — ${rows.length} rows (${orphans.length} orphan${orphans.length > 1 ? 's' : ''})`);

    // Collect existing message ids already under canonical (dedup target)
    const existingIds = new Set<string>();
    if (APPLY) {
      for (const m of await queryAllMessages(db, canonical)) existingIds.add(m.id);
    }

    let aggLastMsgAt = 0;
    let aggUnread = 0;
    let aggLastText = '';
    let aggChannelId: string | undefined;
    let aggContactName: string | undefined;
    let aggContactPhone: string | undefined;
    let aggStatus = 'open';
    // Seed aggregates from a canonical row if it already exists
    const canonicalRow = rows.find((r) => (r.conversationId || r.sk) === canonical);
    if (canonicalRow) {
      aggLastMsgAt = canonicalRow.lastMsgAt || 0;
      aggUnread = canonicalRow.unreadCount || 0;
      aggLastText = canonicalRow.lastMessageText || '';
      aggChannelId = canonicalRow.channelId;
      aggContactName = canonicalRow.contactName;
      aggContactPhone = canonicalRow.contactPhone;
      aggStatus = canonicalRow.status || aggStatus;
    }

    for (const orphan of orphans) {
      const orphanKey: string = orphan.conversationId || orphan.sk;
      const msgs = await queryAllMessages(db, orphanKey);
      console.log(`  • orphan ${orphanKey} → ${msgs.length} message(s)`);

      for (const m of msgs) {
        if (m.id && existingIds.has(m.id)) continue; // already present under canonical
        if (APPLY) {
          await db.send(new PutItemCommand({
            TableName: MESSAGES_TABLE,
            Item: marshall({ ...m, conversationId: canonical }, { removeUndefinedValues: true }),
          }));
          await db.send(new DeleteItemCommand({
            TableName: MESSAGES_TABLE,
            Key: marshall({ conversationId: orphanKey, sk: m.sk }),
          }));
        }
        if (m.id) existingIds.add(m.id);
        movedMessages++;
      }

      // Fold orphan conversation aggregates in
      aggUnread += orphan.unreadCount || 0;
      if ((orphan.lastMsgAt || 0) >= aggLastMsgAt) {
        aggLastMsgAt = orphan.lastMsgAt || aggLastMsgAt;
        aggLastText = orphan.lastMessageText || aggLastText;
      }
      aggChannelId = orphan.channelId || aggChannelId;
      aggContactName = aggContactName || orphan.contactName;
      aggContactPhone = aggContactPhone || orphan.contactPhone;

      if (APPLY) {
        await db.send(new DeleteItemCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: marshall({ tenantId, sk: orphanKey }),
        }));
      }
      deletedOrphans++;
      console.log(`    merged ${orphanKey} → ${canonical} (${msgs.length} messages)`);
    }

    // Upsert the canonical conversation aggregate
    if (APPLY) {
      const channel = canonical.split(':')[1];
      const phone = canonical.split(':').slice(2).join(':');
      await db.send(new UpdateItemCommand({
        TableName: CONVERSATIONS_TABLE,
        Key: marshall({ tenantId, sk: canonical }),
        UpdateExpression: `SET lastMsgAt = :t, lastMessageText = :txt, contactPhone = :phone,
          contactName = :name, #ch = :ch, #st = :st, conversationId = :cid, unreadCount = :unread
          ${aggChannelId ? ', channelId = :chid' : ''}`,
        ExpressionAttributeNames: { '#ch': 'channel', '#st': 'status' },
        ExpressionAttributeValues: marshall({
          ':t': aggLastMsgAt || Date.now(),
          ':txt': aggLastText || '',
          ':phone': aggContactPhone || phone,
          ':name': aggContactName || phone,
          ':ch': channel,
          ':st': aggStatus,
          ':cid': canonical,
          ':unread': aggUnread,
          ...(aggChannelId ? { ':chid': aggChannelId } : {}),
        }, { removeUndefinedValues: true }),
      }));
    }
    mergedGroups++;
  }

  console.log(`\n[backfill] ${APPLY ? 'APPLIED' : 'DRY-RUN'} — groups merged: ${mergedGroups}, messages moved: ${movedMessages}, orphan rows deleted: ${deletedOrphans}`);
  if (!APPLY) console.log('[backfill] No writes performed. Re-run with --apply to execute.');
}

async function queryAllMessages(db: DynamoDBClient, conversationId: string): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await db.send(new QueryCommand({
      TableName: MESSAGES_TABLE,
      KeyConditionExpression: 'conversationId = :cid',
      ExpressionAttributeValues: marshall({ ':cid': conversationId }),
      ExclusiveStartKey: lastKey,
    }));
    for (const it of res.Items || []) out.push(unmarshall(it));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// Firestore implementation (dev/local fallback store)
// ════════════════════════════════════════════════════════════════════════════
async function runFirestore() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (b64) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
    } else if (path) {
      admin.initializeApp({ credential: admin.credential.cert(require(path)) });
    } else {
      throw new Error('Set FIREBASE_SERVICE_ACCOUNT_B64 or FIREBASE_SERVICE_ACCOUNT_PATH for --store=firestore');
    }
  }
  const db = admin.firestore();
  console.log(`[backfill] Firestore store, apply=${APPLY}${ONLY_TENANT ? `, tenant=${ONLY_TENANT}` : ''}`);

  const tenantsSnap = ONLY_TENANT
    ? [{ id: ONLY_TENANT }]
    : (await db.collection('tenants').get()).docs;

  let mergedGroups = 0, movedMessages = 0, deletedOrphans = 0;

  for (const t of tenantsSnap) {
    const tenantId = t.id;
    const convCol = db.collection('tenants').doc(tenantId).collection('inboxConversations');
    const convSnap = await convCol.get();
    if (convSnap.empty) continue;

    const groups = new Map<string, any[]>();
    for (const doc of convSnap.docs) {
      const d = { ...doc.data(), _docId: doc.id };
      const gk = groupKeyForConv({ ...d, conversationId: d.conversationId || doc.id });
      if (!gk) continue;
      const arr = groups.get(gk.canonical) || [];
      arr.push(d);
      groups.set(gk.canonical, arr);
    }

    for (const [canonical, rows] of groups) {
      const orphans = rows.filter((r) => (r._docId) !== canonical);
      if (orphans.length === 0) continue;
      console.log(`\n[group] ${canonical} — ${rows.length} rows (${orphans.length} orphan)`);

      const canonicalRef = convCol.doc(canonical);
      for (const orphan of orphans) {
        const msgsSnap = await convCol.doc(orphan._docId).collection('messages').get();
        for (const m of msgsSnap.docs) {
          if (APPLY) {
            await canonicalRef.collection('messages').doc(m.id).set({ ...m.data(), conversationId: canonical }, { merge: true });
            await m.ref.delete();
          }
          movedMessages++;
        }
        if (APPLY) await convCol.doc(orphan._docId).delete();
        deletedOrphans++;
        console.log(`  merged ${orphan._docId} → ${canonical} (${msgsSnap.size} messages)`);
      }

      if (APPLY) {
        const newest = rows.slice().sort((a, b) => (b.lastMsgAt || 0) - (a.lastMsgAt || 0))[0];
        await canonicalRef.set({
          conversationId: canonical,
          tenantId,
          contactPhone: newest.contactPhone || canonical.split(':').slice(2).join(':'),
          contactName: newest.contactName || newest.contactPhone,
          channel: canonical.split(':')[1],
          lastMsgAt: newest.lastMsgAt || Date.now(),
          lastMessageText: newest.lastMessageText || '',
          status: newest.status || 'open',
          unreadCount: rows.reduce((s, r) => s + (r.unreadCount || 0), 0),
          ...(newest.channelId ? { channelId: newest.channelId } : {}),
        }, { merge: true });
      }
      mergedGroups++;
    }
  }

  console.log(`\n[backfill] ${APPLY ? 'APPLIED' : 'DRY-RUN'} — groups merged: ${mergedGroups}, messages moved: ${movedMessages}, orphan rows deleted: ${deletedOrphans}`);
  if (!APPLY) console.log('[backfill] No writes performed. Re-run with --apply to execute.');
}

(async () => {
  try {
    if (STORE === 'firestore') await runFirestore();
    else await runDynamo();
    process.exit(0);
  } catch (err: any) {
    console.error('[backfill] FAILED:', err?.message || err);
    process.exit(1);
  }
})();
