import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import * as path from 'path';
import * as fs from 'fs';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { useS3AuthState, deleteS3AuthState } from './s3-auth-state';
import { jlog } from '../../common/structured-log';
import { normalizeWaMessage } from './wa-message-normalizer';


export interface QREvent {
  type: 'qr' | 'connected' | 'disconnected' | 'error' | 'loading';
  data: Record<string, any>;
}

interface QRSession {
  tenantId: string;
  status: 'loading' | 'qr_ready' | 'connected' | 'disconnected' | 'error';
  qrCode?: string;
  phoneNumber?: string;
  errorMessage?: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  reconnectAttempts: number;
  isRestore: boolean; // restored session (no QR expected)
  subject: Subject<QREvent>;
  socket?: any;
}

/** A normalized WhatsApp message routed into the inbox. `fromMe` true = WE sent it (synced back). */
interface RoutedMessage { from: string; text: string; msgId: string; pushName?: string; isHistory?: boolean; fromMe?: boolean; timestampMs?: number; }
type InboxHandler = (m: RoutedMessage) => void | Promise<void>;
/** Tenant-scoped fallback router — handles inbound for sessions with no per-session handler (e.g. restored after restart). */
type GlobalInboxRouter = (tenantId: string, m: RoutedMessage) => void | Promise<void>;
/** Notifies ChannelsService when a tenant's WhatsApp connection state changes (keeps the channel doc in sync). */
type StatusListener = (tenantId: string, status: 'active' | 'disconnected', phoneNumber?: string) => void;

@Injectable()
export class WhatsAppQRService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppQRService.name);
  private readonly sessions = new Map<string, QRSession>();
  private readonly inboxHandlers = new Map<string, InboxHandler>();
  private globalRouter?: GlobalInboxRouter;
  /** Routes delivery/read receipts for our sent messages to advance the tick status. */
  private ackRouter?: (tenantId: string, contactPhone: string, msgId: string, status: 'sent' | 'delivered' | 'read') => void;
  private statusListener?: StatusListener;
  /** WhatsApp address-book names (the names YOU saved), per tenant: phone → display name.
   *  Populated from contacts.upsert/update + messaging-history.set — this is what mirrors the name
   *  WhatsApp shows. Keyed `${tenantId}:${phone}` (last 10 digits) so it's tenant-isolated. */
  private readonly contactNames = new Map<string, string>();
  /** Notifies channels.service when a contact name is learned/changed, so existing conversations
   *  get corrected (the stored name may have been a number or the owner's name). */
  private contactsRouter?: (tenantId: string, phone: string, name: string) => void;
  private cachedVersion?: number[];
  private readonly authDir = process.env.WA_SESSION_DIR || '/tmp/wa-sessions';

  // ── Disconnect-reason policy (Law 1: map EVERY reason explicitly; "default: delete" is forbidden) ──
  // Session creds are persistent USER state in S3. They are deleted ONLY on a genuine revocation
  // (a real logout). Every other close — infra handoff (440), restart (515), transient drop,
  // forbidden/mismatch/badSession — KEEPS the creds. Deleting valid creds on an infra event is the
  // #1 incident class on this platform (it forced a QR re-scan after every rolling deploy).
  private readonly REVOKE_CODES = new Set([401]);          // loggedOut — device unlinked → creds invalid → delete
  private readonly TERMINAL_KEEP_CODES = new Set([403, 411, 500]); // forbidden/mismatch/badSession — stop, but KEEP creds (manual reconnect)
  private readonly REPLACED_CODE = 440;                    // connectionReplaced — creds valid, another session owns it now
  private readonly MAX_RECONNECT = 10;       // give up after this many consecutive transient failures
  private readonly RECONNECT_BASE_MS = 2_000;
  private readonly RECONNECT_MAX_MS = 60_000;

  // S3 client — instantiated only when WA_S3_BUCKET is set (production)
  private s3Client: S3Client | null = null;
  private readonly s3Bucket = process.env.WA_S3_BUCKET || '';
  private readonly s3Region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

  // CloudWatch client for session-health metrics (uses the default credential chain / IAM role).
  private cwClient: CloudWatchClient | null = null;

  onModuleInit() {
    // CloudWatch metrics for WhatsApp session health (best-effort; never blocks startup).
    this.cwClient = new CloudWatchClient({ region: this.s3Region });
    if (this.s3Bucket) {
      this.s3Client = new S3Client({ region: this.s3Region });
      this.logger.log(`[WAWeb] S3 session persistence enabled: s3://${this.s3Bucket}/wa-sessions/ (region: ${this.s3Region})`);
    } else {
      this.logger.log(`[WAWeb] S3 not configured — using local auth state at ${this.authDir}. Set WA_S3_BUCKET for production.`);
    }
    // Auto-restore persisted sessions (survives process restart AND redeploy in S3 mode).
    void this.restoreSessions();
  }

  /** Register a listener that keeps the tenant's WhatsApp channel doc in sync with the live socket state. */
  setStatusListener(listener: StatusListener): void {
    this.statusListener = listener;
  }

  /** Resolve the WhatsApp web protocol version once (latest, with timeout + fallback). */
  private async getWAVersion(): Promise<number[]> {
    if (this.cachedVersion) return this.cachedVersion;
    const FALLBACK = [2, 3000, 1035194821];
    try {
      const { fetchLatestBaileysVersion } = (await import('@whiskeysockets/baileys')) as any;
      const res = (await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3_000)),
      ])) as any;
      this.cachedVersion = (Array.isArray(res?.version) && res.version.length) ? res.version : FALLBACK;
      this.logger.log(`[WAWeb] Using WhatsApp version ${this.cachedVersion!.join('.')}`);
    } catch {
      this.cachedVersion = FALLBACK;
      this.logger.warn(`[WAWeb] Version fetch failed — using fallback ${FALLBACK.join('.')}`);
    }
    return this.cachedVersion!;
  }

  /** Derive tenantId from a session id (stable `wa_{tenantId}` or legacy `{tenantId}_{13-digit-ts}`). */
  private tenantIdFromSessionId(sessionId: string): string | null {
    if (sessionId.startsWith('wa_')) return sessionId.slice(3) || null;
    const m = sessionId.match(/^(.+)_(\d{13})$/);
    return m ? m[1] : null;
  }

  /** Enumerate persisted session ids from S3 (prod) — one prefix per session under wa-sessions/. */
  private async listS3SessionIds(): Promise<string[]> {
    const ids = new Set<string>();
    let token: string | undefined;
    do {
      const res = await this.s3Client!.send(new ListObjectsV2Command({
        Bucket: this.s3Bucket, Prefix: 'wa-sessions/', ContinuationToken: token,
      }));
      for (const obj of res.Contents ?? []) {
        const parts = (obj.Key || '').split('/'); // wa-sessions/{sessionId}/creds.json
        if (parts.length >= 2 && parts[1]) ids.add(parts[1]);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return [...ids];
  }

  /**
   * Restore persisted sessions on boot. Source of truth is S3 in production (so sessions
   * survive container REDEPLOYS, not just restarts) and local disk in dev. One session
   * per tenant; reconnects silently using the saved creds (no QR).
   */
  private async restoreSessions(): Promise<void> {
    try {
      let sessionIds: string[] = [];
      if (this.useS3) {
        sessionIds = await this.listS3SessionIds();
      } else if (fs.existsSync(this.authDir)) {
        sessionIds = fs.readdirSync(this.authDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      }

      const tenantsSeen = new Set<string>();
      let restored = 0;
      for (const sessionId of sessionIds) {
        const tenantId = this.tenantIdFromSessionId(sessionId);
        if (!tenantId || tenantsSeen.has(tenantId)) continue;
        tenantsSeen.add(tenantId);

        const session: QRSession = {
          tenantId, status: 'loading', reconnectAttempts: 0, isRestore: true, subject: new Subject<QREvent>(),
        };
        this.sessions.set(sessionId, session);
        this.initBaileys(sessionId, session).catch((err: any) => {
          this.logger.warn(`[WAWeb] Could not restore session ${sessionId}: ${err?.message}`);
          this.sessions.delete(sessionId);
        });
        restored++;
      }
      if (restored > 0) this.logger.log(`[WAWeb] Restoring ${restored} WhatsApp session(s) (${this.useS3 ? 'S3' : 'local'})…`);
    } catch (err: any) {
      this.logger.warn(`[WAWeb] Session restore failed: ${err?.message}`);
    }
  }

  /** Returns true when running in production S3-backed mode */
  private get useS3(): boolean {
    return !!(this.s3Client && this.s3Bucket);
  }

  private s3Prefix(sessionId: string): string {
    return `wa-sessions/${sessionId}`;
  }

  /** Find the active session ID for a tenant (for outbound sends) */
  getActiveSessionId(tenantId: string): string | null {
    for (const [id, s] of this.sessions.entries()) {
      if (s.tenantId === tenantId && s.status === 'connected') return id;
    }
    return null;
  }

  /**
   * Route a batch of Baileys messages into the inbox via the per-session handler (fresh
   * connects) or the tenant-scoped global router (restored sessions). Shared by the live
   * `messages.upsert` stream and the `messaging-history.set` reconnect import. Skips own
   * (outbound) and group messages; `maxToProcess` caps history batches (newest kept).
   */
  /**
   * Law 8 — resolve a WhatsApp LID (privacy Link-ID, `<id>@lid`) to the real phone-number JID.
   * Prefers `remoteJidAlt` carried on the message key (sync, present in Baileys 7 for LID chats),
   * then the socket's LID→PN mapping store. Returns '' if it can't resolve.
   */
  private async resolveLidToPhone(session: QRSession, msg: any): Promise<string> {
    const alt = msg?.key?.remoteJidAlt;
    if (typeof alt === 'string' && alt.endsWith('@s.whatsapp.net')) return alt;
    try {
      const pn = await session.socket?.signalRepository?.lidMapping?.getPNForLID?.(msg?.key?.remoteJid);
      if (typeof pn === 'string' && pn.endsWith('@s.whatsapp.net')) return pn;
    } catch { /* noop */ }
    return '';
  }

  private async dispatchInbound(sessionId: string, session: QRSession, messages: any[], maxToProcess?: number): Promise<void> {
    const perSession = this.inboxHandlers.get(sessionId);
    const handler: InboxHandler | undefined =
      perSession ??
      (this.globalRouter ? (m: RoutedMessage) => this.globalRouter!(session.tenantId, m) : undefined);
    if (!handler) return;
    // History sync sets maxToProcess; live messages.upsert does not. This distinguishes a
    // history re-import (which a tombstone must block) from a live new message (which pierces it).
    const isHistory = typeof maxToProcess === 'number';
    const list =
      typeof maxToProcess === 'number' && messages.length > maxToProcess
        ? messages.slice(-maxToProcess)
        : messages;

    // Normalize all (async LID resolution where the key lacks remoteJidAlt).
    const routed: RoutedMessage[] = [];
    for (const msg of list) {
      const rawJid: string = msg?.key?.remoteJid ?? '';
      let resolvedJid: string | undefined;
      if (rawJid.endsWith('@lid') && !msg?.key?.remoteJidAlt) {
        resolvedJid = (await this.resolveLidToPhone(session, msg)) || undefined;
        if (!resolvedJid) this.logger.warn(jlog({ event: 'wa_lid_unresolved', sessionId, tenantId: session.tenantId, lid: rawJid }));
      }
      const norm = normalizeWaMessage(msg, resolvedJid);
      if (!norm) continue; // group / status / no content
      // Route by DIRECTION (no longer drop fromMe). fromMe = our own message synced back from the
      // phone or another linked device → stored as OUTBOUND so the thread shows BOTH sides.
      routed.push({ from: norm.fromPhone, text: norm.text, msgId: norm.msgId, pushName: norm.pushName, isHistory, fromMe: norm.fromMe, timestampMs: norm.timestampMs });
    }

    if (!isHistory) {
      // Live: dispatch immediately, fire-and-forget (don't block the socket event loop).
      for (const m of routed) void Promise.resolve(handler(m)).catch(() => {});
      return;
    }

    // History: process in chunks of 50 with allSettled so one bad message can't drop the batch
    // and we don't flood DynamoDB with hundreds of concurrent writes.
    let totalSkipped = 0;
    for (let i = 0; i < routed.length; i += 50) {
      const chunk = routed.slice(i, i + 50);
      const results = await Promise.allSettled(chunk.map((m) => Promise.resolve(handler(m))));
      const skipped = results.filter((r) => r.status === 'rejected').length;
      totalSkipped += skipped;
      this.logger.log(jlog({ event: 'wa_history_batch', tenantId: session.tenantId, sessionId, count: chunk.length, skipped }));
    }
    if (routed.length) this.logger.log(jlog({ event: 'wa_history_sync_done', tenantId: session.tenantId, sessionId, total: routed.length, skipped: totalSkipped }));
  }

  /**
   * "Sync Now" — force a sync for a tenant's WhatsApp session.
   *  • connected      → nothing to do (history was imported on the last connect)
   *  • disconnected   → if creds are persisted, reconnect silently (no QR); the resulting
   *                     `messaging-history.set` repopulates the inbox
   *  • no creds       → caller must show the QR flow (needs_rescan)
   */
  async resync(tenantId: string): Promise<{ status: 'connected' | 'reconnecting' | 'needs_rescan' }> {
    if (this.getActiveSessionId(tenantId)) return { status: 'connected' };
    const sessionId = `wa_${tenantId}`;
    if (!(await this.hasPersistedCreds(sessionId))) return { status: 'needs_rescan' };
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { tenantId, status: 'loading', reconnectAttempts: 0, isRestore: true, subject: new Subject<QREvent>() };
      this.sessions.set(sessionId, session);
    }
    this.initBaileys(sessionId, session).catch((err: any) =>
      this.logger.warn(jlog({ event: 'wa_resync_failed', tenantId, error: err?.message })),
    );
    return { status: 'reconnecting' };
  }

  /** Whether persisted auth creds exist for a session (S3 in prod, local disk in dev). */
  private async hasPersistedCreds(sessionId: string): Promise<boolean> {
    try {
      if (this.useS3) {
        const ids = await this.listS3SessionIds();
        const tid = this.tenantIdFromSessionId(sessionId);
        return ids.includes(sessionId) || ids.some((id) => this.tenantIdFromSessionId(id) === tid);
      }
      return fs.existsSync(path.join(this.authDir, sessionId));
    } catch {
      return false;
    }
  }

  /**
   * Send a text message via the live Baileys socket for the given tenant.
   * Called by ChannelsService.broadcastWhatsApp() when channelSubtype === 'qr'.
   */
  /**
   * Resolve the live socket for an outbound send — ONE source of truth for sendMessage + sendMedia.
   * "Live" = a session for this tenant with status 'connected' AND a socket attached (the same
   * liveness 'open' grants at connection.update:522-525). On failure it logs a PRECISE diagnosis so a
   * genuine send/receive split (socket present + receiving, but status flag not 'connected') can
   * never silently masquerade as a dead session. The status guard is intentionally NOT loosened:
   * sending through a non-open socket just hangs/fails, so a true absence must still surface the QR
   * prompt. The log is what tells the two apart.
   */
  private resolveLiveSocketForSend(tenantId: string, op: 'text' | 'media'): any {
    const sessionId = this.getActiveSessionId(tenantId);
    if (sessionId) {
      const sock = this.sessions.get(sessionId)?.socket;
      if (sock) return sock;
    }
    // No usable 'connected' session — inspect what we DO hold for this tenant and name the case.
    let diagnosis = 'no_session_for_tenant';
    for (const [, s] of this.sessions.entries()) {
      if (s.tenantId !== tenantId) continue;
      diagnosis = s.socket ? `socket_present_but_status_${s.status}` : `session_present_no_socket_status_${s.status}`;
      break;
    }
    this.logger.warn(jlog({ event: 'wa_send_no_live_session', tenantId, op, diagnosis }));
    throw new Error('WhatsApp QR session not found or not connected. Reconnect via QR scan.');
  }

  async sendMessage(tenantId: string, to: string, text: string): Promise<{ messageId: string }> {
    const sock = this.resolveLiveSocketForSend(tenantId, 'text');

    // Normalize to JID: strip non-digits then append @s.whatsapp.net
    const digits = to.replace(/\D/g, '');
    const jid = `${digits}@s.whatsapp.net`;

    const sent = await sock.sendMessage(jid, { text });
    const messageId: string = sent?.key?.id ?? `wa_qr_${Date.now()}`;
    this.logger.log(`[WAWeb] Sent message to ${jid} (id: ${messageId}) for tenant ${tenantId}`);
    return { messageId };
  }


  /** Register a callback that fires for every inbound message on this session */
  setInboxHandler(sessionId: string, handler: InboxHandler): void {
    this.inboxHandlers.set(sessionId, handler);
    this.logger.log(`[WAWeb] Inbox handler registered for session ${sessionId}`);
  }

  /** Register the tenant-scoped fallback router (set once at startup by ChannelsService). */
  setGlobalInboxRouter(router: GlobalInboxRouter): void {
    this.globalRouter = router;
    this.logger.log('[WAWeb] Global inbox router registered (handles restored sessions).');
  }

  /** Register the delivery/read-receipt router (advances message tick status). */
  setAckRouter(router: (tenantId: string, contactPhone: string, msgId: string, status: 'sent' | 'delivered' | 'read') => void): void {
    this.ackRouter = router;
  }

  /** Register the contact-name router (fired when an address-book name is learned, to correct
   *  existing conversation names). Set once at startup by ChannelsService. */
  setContactsRouter(router: (tenantId: string, phone: string, name: string) => void): void {
    this.contactsRouter = router;
  }

  /** Last 10 digits of a JID/phone — the tenant-isolated key for the contact-name map. */
  private contactKey(tenantId: string, idOrPhone: string): string {
    const digits = (idOrPhone || '').split('@')[0].replace(/\D/g, '');
    return `${tenantId}:${digits.slice(-10)}`;
  }

  /** The WhatsApp address-book name for a phone, if we've synced it. Mirrors what WhatsApp shows. */
  getContactName(tenantId: string, phone: string): string | undefined {
    return this.contactNames.get(this.contactKey(tenantId, phone));
  }

  /**
   * Ingest WhatsApp contacts (from contacts.upsert/update + messaging-history.set). The displayed
   * name follows WhatsApp's own priority: name (your saved address-book name) → verifiedName
   * (business) → notify (the contact's own push name). We never store an empty name, and we fire
   * the contactsRouter so existing conversations get their (possibly wrong) name corrected.
   */
  private ingestContacts(tenantId: string, contacts: any[]): void {
    if (!Array.isArray(contacts)) return;
    let learned = 0;
    for (const c of contacts) {
      const name = (c?.name || c?.verifiedName || c?.notify || '').toString().trim();
      if (!name) continue;
      const phoneRaw = (c?.phoneNumber || c?.id || c?.jid || '').toString();
      const digits = phoneRaw.split('@')[0].replace(/\D/g, '');
      if (digits.length < 8) continue; // skip groups / malformed
      const key = `${tenantId}:${digits.slice(-10)}`;
      const prev = this.contactNames.get(key);
      if (prev === name) continue;
      this.contactNames.set(key, name);
      learned++;
      // Correct any existing conversation that was stored with a number or the owner's name.
      try { this.contactsRouter?.(tenantId, digits, name); } catch { /* non-fatal */ }
    }
    if (learned) this.logger.log(jlog({ event: 'wa_contacts_synced', tenantId, learned, total: contacts.length }));
  }

  /**
   * Send a media message (image or document) via the live Baileys socket.
   * `url` is a publicly reachable URL (e.g. our S3 asset URL).
   */
  async sendMedia(
    tenantId: string,
    to: string,
    media: { url: string; type: 'image' | 'document'; fileName?: string; mimetype?: string; caption?: string },
  ): Promise<{ messageId: string }> {
    const sock = this.resolveLiveSocketForSend(tenantId, 'media');

    const jid = `${to.replace(/\D/g, '')}@s.whatsapp.net`;
    const content =
      media.type === 'image'
        ? { image: { url: media.url }, caption: media.caption || undefined }
        : { document: { url: media.url }, fileName: media.fileName || 'file', mimetype: media.mimetype || 'application/octet-stream', caption: media.caption || undefined };

    const sent = await sock.sendMessage(jid, content as any);
    const messageId: string = sent?.key?.id ?? `wa_qr_media_${Date.now()}`;
    this.logger.log(`[WAWeb] Sent ${media.type} to ${jid} (id: ${messageId}) for tenant ${tenantId}`);
    return { messageId };
  }

  async startSession(tenantId: string): Promise<{ sessionId: string }> {
    // Close any existing session for this tenant (also clears stale creds for a clean pairing).
    for (const [id, s] of this.sessions.entries()) {
      if (s.tenantId === tenantId) this.destroySession(id);
    }

    // STABLE id — one WhatsApp session per tenant. A re-scan reuses the same identity,
    // so conversations never orphan and restore is deterministic.
    const sessionId = `wa_${tenantId}`;
    const session: QRSession = {
      tenantId,
      status: 'loading',
      reconnectAttempts: 0,
      isRestore: false,
      subject: new Subject<QREvent>(),
    };
    this.sessions.set(sessionId, session);

    // 45-second timeout: if QR never appears, surface a real error message
    session.timeoutHandle = setTimeout(() => {
      if (session.status === 'loading' || session.status === 'qr_ready') {
        session.status = 'error';
        session.errorMessage = 'QR code timed out — WhatsApp servers may be unreachable from this server. Try again later.';
        session.subject.next({ type: 'error', data: { message: session.errorMessage } });
        this.destroySession(sessionId);
      }
    }, 45000);

    // Run in background — don't await
    this.initBaileys(sessionId, session).catch((err) => {
      this.logger.error(`Baileys init error [${sessionId}]: ${err.message}`);
      if (session.timeoutHandle) { clearTimeout(session.timeoutHandle); session.timeoutHandle = undefined; }
      session.status = 'error';
      session.errorMessage = err.message || 'WhatsApp connection failed';
      session.subject.next({ type: 'error', data: { message: session.errorMessage } });
    });

    return { sessionId };
  }

  private async initBaileys(sessionId: string, session: QRSession) {
    // Lazy imports so startup isn't slowed down
    const {
      default: makeWASocket,
      DisconnectReason,
      useMultiFileAuthState,
      Browsers,
    } = await import('@whiskeysockets/baileys') as any;

    // qrcode is CJS — require gives the module directly (no .default wrapper)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const QRCode = require('qrcode') as typeof import('qrcode');

    // ── Auth state: S3 (production) or local disk (dev) ─────────────────────
    let state: any;
    let saveCreds: () => Promise<void>;

    if (this.useS3) {
      // Production: persist to S3 so sessions survive ECS restarts
      const s3Auth = await useS3AuthState(
        this.s3Client!,
        this.s3Bucket,
        this.s3Prefix(sessionId),
      );
      state = s3Auth.state;
      saveCreds = s3Auth.saveCreds;
      this.logger.log(`[WAWeb] Using S3 auth state for session ${sessionId}`);
    } else {
      // Local dev: persist to local filesystem
      const authPath = path.join(this.authDir, sessionId);
      fs.mkdirSync(authPath, { recursive: true });
      const localAuth = await useMultiFileAuthState(authPath);
      state = localAuth.state;
      saveCreds = localAuth.saveCreds;
    }

    // End any previous socket for this session; its late events are ignored by the
    // stale-socket guard (isCurrent) below, so this won't trigger a spurious reconnect.
    if (session.socket) { try { session.socket.end(undefined); } catch { /* noop */ } }

    const version = await this.getWAVersion();
    const silent: any = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child: () => silent };

    // Full-history sync (WhatsApp Web fidelity): WhatsApp only sends the FULL chat history to a
    // device that identifies as a DESKTOP. Gated by env (default OFF) and applied only to fresh
    // QR scans — enabling it mid-flight on a live session can flood the history handler.
    // Browsers.macOS('Desktop') === ['Mac OS','Desktop','14.4.1'] (verified against the lib).
    const wantFullHistory = process.env.WA_SYNC_FULL_HISTORY === 'true' && !session.isRestore;
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: silent,
      browser: wantFullHistory ? Browsers.macOS('Desktop') : ['Flyn', 'Chrome', '120.0.0'],
      keepAliveIntervalMs: 25_000,     // ping cadence — keeps the socket warm (fewer 408s)
      connectTimeoutMs: 60_000,        // give the handshake real time
      retryRequestDelayMs: 2_000,
      markOnlineOnConnect: false,      // don't hijack the phone's presence
      syncFullHistory: wantFullHistory,
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined,
    });
    if (wantFullHistory) this.logger.log(jlog({ event: 'wa_full_history_enabled', sessionId, tenantId: session.tenantId }));

    session.socket = sock;
    const isCurrent = () => session.socket === sock; // ignore events from superseded sockets

    sock.ev.on('creds.update', saveCreds);

    // Live inbound stream.
    sock.ev.on('messages.upsert', (payload: { messages: any[]; type: string }) => {
      if (!isCurrent() || payload.type !== 'notify') return;
      void this.dispatchInbound(sessionId, session, payload.messages)
        .catch((e: any) => this.logger.warn(jlog({ event: 'wa_dispatch_inbound_failed', sessionId, error: e?.message })));
    });

    // Delivery/read receipts for OUR sent messages → advance the tick status (sent→delivered→read).
    // Baileys WAMessageStatus: 2=SERVER_ACK(sent), 3=DELIVERY_ACK(delivered), 4=READ, 5=PLAYED.
    sock.ev.on('messages.update', (updates: any[]) => {
      if (!isCurrent() || !this.ackRouter) return;
      for (const u of updates ?? []) {
        const code = u?.update?.status;
        if (typeof code !== 'number') continue;
        const status = code >= 4 ? 'read' : code === 3 ? 'delivered' : code === 2 ? 'sent' : undefined;
        if (!status) continue;
        const jid: string = u?.key?.remoteJid ?? '';
        const phone = jid.replace(/@[a-z.]+$/i, '').replace(/\D/g, '');
        const msgId: string = u?.key?.id ?? '';
        if (!phone || !msgId) continue;
        try { this.ackRouter(session.tenantId, phone, msgId, status); } catch { /* noop */ }
      }
    });

    // On (re)connect, WhatsApp pushes recent chat history. Importing it — deduped downstream by
    // providerMsgId — is what makes "Sync Now" bring the last conversations back into the inbox
    // after a session goes stale. Capped so a large history sync can't flood the save path.
    sock.ev.on('messaging-history.set', (payload: { messages?: any[]; contacts?: any[] }) => {
      if (!isCurrent()) return;
      // Initial sync carries the address-book contacts — capture them so conversation names mirror
      // WhatsApp (the names YOU saved), not the owner's push name.
      if (payload?.contacts?.length) this.ingestContacts(session.tenantId, payload.contacts);
      const msgs = payload?.messages ?? [];
      if (!msgs.length) return;
      this.logger.log(jlog({ event: 'wa_history_sync', sessionId, tenantId: session.tenantId, count: msgs.length }));
      void this.dispatchInbound(sessionId, session, msgs, 500)
        .catch((e: any) => this.logger.warn(jlog({ event: 'wa_dispatch_inbound_failed', sessionId, error: e?.message })));
    });

    // Live address-book updates (a contact saved/renamed on the phone) → keep names in sync.
    sock.ev.on('contacts.upsert', (contacts: any[]) => { if (isCurrent()) this.ingestContacts(session.tenantId, contacts); });
    sock.ev.on('contacts.update', (contacts: any[]) => { if (isCurrent()) this.ingestContacts(session.tenantId, contacts); });

    sock.ev.on('connection.update', async (update: any) => {
      if (!isCurrent()) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          session.qrCode = await QRCode.toDataURL(qr);
          session.status = 'qr_ready';
          session.subject.next({ type: 'qr', data: { qr: session.qrCode } });
        } catch (e: any) {
          this.logger.error(`QR encode error: ${e.message}`);
        }
      }

      if (connection === 'open') {
        if (session.timeoutHandle) { clearTimeout(session.timeoutHandle); session.timeoutHandle = undefined; }
        session.reconnectAttempts = 0;
        session.status = 'connected';
        const phoneNumber = (sock.user?.id || '').split(':')[0].split('@')[0];
        session.phoneNumber = phoneNumber;
        session.subject.next({ type: 'connected', data: { phoneNumber } });
        this.statusListener?.(session.tenantId, 'active', phoneNumber);
        this.logger.log(`[WAWeb] Session ${sessionId} connected as ${phoneNumber}`);
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as any)?.output?.statusCode as number | undefined;
        this.handleClose(sessionId, session, code, DisconnectReason);
      }
    });
  }

  /**
   * Connection-close state machine.
   *  • Terminal codes (loggedOut/forbidden/badSession/replaced/mismatch) → dead creds, re-scan required.
   *  • restartRequired (515) → immediate restart (expected right after pairing).
   *  • Transient (timedOut/connectionLost/closed/unavailable/unknown) → exponential backoff + jitter,
   *    capped attempts, then give up (keep creds — could be a network outage) and mark disconnected.
   */
  /**
   * Emit a CloudWatch metric (namespace Flyn/WhatsApp). Two datums per call: one dimensioned by
   * tenantId (per-tenant search) and one undimensioned aggregate (what the alarm watches).
   * Best-effort — a metric failure never affects reconnect logic.
   *
   * `WASessionDisconnected` → genuine, health-relevant drops (timeouts, logouts, transient). The
   *   disconnect-health alarm watches this.
   * `WASessionReplaced`     → 440 hand-offs (expected on every rolling deploy). Tracked separately
   *   so routine deploys don't trip the health alarm, while staying visible.
   */
  private emitMetric(tenantId: string, metricName: 'WASessionDisconnected' | 'WASessionReplaced', code?: number): void {
    if (!this.cwClient) return;
    const ts = new Date();
    this.cwClient
      .send(new PutMetricDataCommand({
        Namespace: 'Flyn/WhatsApp',
        MetricData: [
          { MetricName: metricName, Dimensions: [{ Name: 'tenantId', Value: tenantId }], Value: 1, Unit: 'Count', Timestamp: ts },
          { MetricName: metricName, Value: 1, Unit: 'Count', Timestamp: ts },
        ],
      }))
      .catch((err: any) => this.logger.warn(jlog({ event: 'wa_metric_emit_failed', tenantId, metricName, code, error: err?.message })));
  }

  private handleClose(sessionId: string, session: QRSession, code: number | undefined, DisconnectReason: any): void {
    if (!this.sessions.has(sessionId)) return; // explicitly destroyed — nothing to do

    // 440 connectionReplaced — another connection took over this WhatsApp identity (a rolling-deploy
    // overlap, or the number linked elsewhere). The creds are STILL VALID, so:
    //   • KEEP the creds (deleting them forces a needless QR re-scan after every deploy),
    //   • do NOT reconnect (reconnecting kicks the new session → an endless ping-pong war),
    //   • do NOT sync 'disconnected' (the replacing session is healthy and already marked 'active';
    //     overwriting it would falsely show the channel as down),
    //   • count it as WASessionReplaced, not WASessionDisconnected, so deploys don't trip the alarm.
    if (code === this.REPLACED_CODE) {
      this.emitMetric(session.tenantId, 'WASessionReplaced', code);
      this.logger.warn(jlog({ event: 'wa_session_replaced', sessionId, tenantId: session.tenantId, code, note: 'creds kept; not reconnecting; handed off to the live session' }));
      this.finalizeDisconnect(sessionId, session, /* deleteCreds */ false, /* syncStatus */ false);
      return;
    }

    // Genuine disconnect — record for the session-health alarm.
    this.emitMetric(session.tenantId, 'WASessionDisconnected', code);

    // REVOKE — a real logout (401). The creds are invalid; delete them (the only auto-delete path).
    if (code !== undefined && this.REVOKE_CODES.has(code)) {
      this.logger.warn(jlog({ event: 'wa_session_logged_out', sessionId, tenantId: session.tenantId, code, note: 're-scan required' }));
      this.finalizeDisconnect(sessionId, session, /* deleteCreds */ true, /* syncStatus */ true, 'logged_out');
      return;
    }

    // TERMINAL-KEEP — forbidden/mismatch/badSession. Stop, but DO NOT delete creds: they may still
    // be valid after a manual reconnect, and deleting them would needlessly force a QR re-scan.
    if (code !== undefined && this.TERMINAL_KEEP_CODES.has(code)) {
      const name = DisconnectReason ? Object.keys(DisconnectReason).find((k) => DisconnectReason[k] === code) : '';
      this.logger.warn(jlog({ event: 'wa_session_terminal_kept', sessionId, tenantId: session.tenantId, code, name: name || undefined, note: 'creds KEPT; manual reconnect required' }));
      this.finalizeDisconnect(sessionId, session, /* deleteCreds */ false, /* syncStatus */ true);
      return;
    }

    if (code === 515 /* restartRequired */) {
      session.reconnectAttempts = 0;
      this.scheduleReconnect(sessionId, session, 0);
      return;
    }

    session.reconnectAttempts += 1;
    if (session.reconnectAttempts > this.MAX_RECONNECT) {
      this.logger.error(`[WAWeb] Session ${sessionId} gave up after ${this.MAX_RECONNECT} attempts (last code ${code}). Keeping creds; needs manual reconnect.`);
      this.finalizeDisconnect(sessionId, session, false);
      return;
    }
    const delay =
      Math.min(this.RECONNECT_BASE_MS * 2 ** (session.reconnectAttempts - 1), this.RECONNECT_MAX_MS) +
      Math.floor(Math.random() * 1000);
    this.logger.warn(`[WAWeb] Session ${sessionId} closed (code ${code}); reconnect ${session.reconnectAttempts}/${this.MAX_RECONNECT} in ${Math.round(delay / 1000)}s`);
    this.scheduleReconnect(sessionId, session, delay);
  }

  private scheduleReconnect(sessionId: string, session: QRSession, delayMs: number): void {
    if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
    session.reconnectTimer = setTimeout(() => {
      if (!this.sessions.has(sessionId)) return;
      this.initBaileys(sessionId, session).catch((e: any) => {
        this.logger.warn(`[WAWeb] Reconnect init failed for ${sessionId}: ${e?.message}`);
        this.handleClose(sessionId, session, undefined, undefined);
      });
    }, delayMs);
  }

  /**
   * Tear down a session.
   * @param deleteCreds  remove the persisted auth state (true only when creds are genuinely dead).
   * @param syncStatus   propagate a 'disconnected' status to the channel doc. Pass FALSE when this
   *   teardown is a hand-off to another live session (440 connectionReplaced) — otherwise the
   *   replaced (old) instance would race-overwrite the channel doc to 'disconnected' even though
   *   the replacing (new) instance is healthy and already marked it 'active'.
   */
  /**
   * THE ONLY path that deletes persistent session creds (Law 2 — single choke point; Law 9 —
   * audited). Call ONLY for a genuine revocation: a real logout, a user re-scan/cancel, or admin
   * revocation. NEVER call on an infrastructure event (440 handoff, SIGTERM, transient drop) —
   * those must keep the creds so the session resumes without a QR re-scan.
   */
  private revokeCreds(sessionId: string, reason: 'logged_out' | 'session_destroyed' | 'admin_revocation'): void {
    const tenantId = this.tenantIdFromSessionId(sessionId) ?? undefined;
    this.logger.warn(jlog({ event: 'wa_creds_revoked', action: 'creds_revoked', sessionId, tenantId, reason, note: 'S3 creds deleted — QR re-scan required' }));
    if (this.useS3) {
      deleteS3AuthState(this.s3Client!, this.s3Bucket, this.s3Prefix(sessionId))
        .catch((e: any) => this.logger.warn(jlog({ event: 'wa_creds_revoke_failed', sessionId, error: e?.message })));
    } else {
      try { fs.rmSync(path.join(this.authDir, sessionId), { recursive: true, force: true }); } catch { /* noop */ }
    }
  }

  private finalizeDisconnect(
    sessionId: string,
    session: QRSession,
    deleteCreds: boolean,
    syncStatus = true,
    revokeReason: 'logged_out' | 'admin_revocation' = 'logged_out',
  ): void {
    if (session.timeoutHandle) { clearTimeout(session.timeoutHandle); session.timeoutHandle = undefined; }
    if (session.reconnectTimer) { clearTimeout(session.reconnectTimer); session.reconnectTimer = undefined; }
    session.status = 'disconnected';
    try { session.socket?.end(undefined); } catch { /* noop */ }
    session.subject.next({ type: 'disconnected', data: {} });
    session.subject.complete();
    this.sessions.delete(sessionId);
    this.inboxHandlers.delete(sessionId);
    if (syncStatus) this.statusListener?.(session.tenantId, 'disconnected');
    if (deleteCreds) this.revokeCreds(sessionId, revokeReason);
  }

  getSessionStream(sessionId: string): Subject<QREvent> | null {
    return this.sessions.get(sessionId)?.subject ?? null;
  }

  getSessionStatus(sessionId: string): Pick<QRSession, 'status' | 'qrCode' | 'phoneNumber' | 'errorMessage'> | null {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    return { status: s.status, qrCode: s.qrCode, phoneNumber: s.phoneNumber, errorMessage: s.errorMessage };
  }

  destroySession(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    if (s.timeoutHandle) { clearTimeout(s.timeoutHandle); s.timeoutHandle = undefined; }
    if (s.reconnectTimer) { clearTimeout(s.reconnectTimer); s.reconnectTimer = undefined; }
    const sock = s.socket;
    s.socket = undefined; // null first so the close handler's isCurrent() guard ignores the teardown
    try { sock?.end?.(undefined); } catch {}
    s.subject.complete();
    this.sessions.delete(sessionId);
    this.inboxHandlers.delete(sessionId);
    // destroySession is user-initiated (re-scan from startSession, or cancel endpoint) → revoke.
    // Routes through the single audited choke point (Law 2/9) — no inline S3 deletes anywhere else.
    this.revokeCreds(sessionId, 'session_destroyed');
  }

  /** Graceful shutdown: stop reconnect timers WITHOUT deleting creds, so sessions restore after redeploy. */
  onModuleDestroy() {
    for (const s of this.sessions.values()) {
      if (s.timeoutHandle) clearTimeout(s.timeoutHandle);
      if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
      s.socket = undefined;
      try { s.subject.complete(); } catch { /* noop */ }
    }
    this.sessions.clear();
  }
}
