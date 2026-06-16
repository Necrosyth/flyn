import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { ChannelsService, RelayCallState } from './channels.service';
import { signRelayToken } from './voice-relay.token';

/**
 * VoiceRelayGateway — the STATEFUL transport half of a ConversationRelay call.
 *
 * Owns a raw `ws.Server({ noServer: true })` attached to the Nest HTTP server's `upgrade` event,
 * claiming ONLY the path `/api/voice/relay` (the existing socket.io `/webrtc` gateway is untouched).
 * Each connection holds RelayCallState in memory for the call's lifetime; the brain (prompt/RAG/
 * grounding + streaming Gemini) lives in ChannelsService — never duplicated here.
 *
 * Protocol (confirmed verbatim against Twilio's live 2026 docs):
 *   INBOUND  setup {type,callSid,from,to,customParameters} · prompt {type,voicePrompt,lang,last}
 *            · interrupt {type,utteranceUntilInterrupt,durationUntilInterruptMs} · dtmf · error
 *   OUTBOUND text {type:"text",token,last} · (language/end available, used in later phases)
 *
 * DORMANT until Phase 4 emits <ConversationRelay> TwiML — nothing routes real calls here yet.
 */
@Injectable()
export class VoiceRelayGateway implements OnApplicationBootstrap {
  private readonly logger = new Logger(VoiceRelayGateway.name);
  private readonly PATH = '/api/voice/relay';
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly channelsService: ChannelsService,
  ) {}

  private verifyToken(callSid: string, token: string): boolean {
    if (!callSid || !token) return false;
    const expected = signRelayToken(callSid); // identical scheme to the TwiML builder
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  onApplicationBootstrap(): void {
    const server = this.adapterHost?.httpAdapter?.getHttpServer?.();
    if (!server) {
      this.logger.warn('[relay] no HTTP server available — ConversationRelay WS not attached');
      return;
    }
    this.wss = new WebSocketServer({ noServer: true });

    // Claim ONLY our path on the shared upgrade event — socket.io /webrtc keeps working.
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      let pathname: string;
      let token: string | null;
      try {
        const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        pathname = url.pathname;
        token = url.searchParams.get('token');
        // Defer auth to the setup message for callSid binding, but require a token to be present.
        (req as any)._relayToken = token;
      } catch {
        return; // not ours — let other upgrade listeners handle it
      }
      if (pathname !== this.PATH) return; // NOT our path → do not touch (webrtc/socket.io handles its own)

      if (!token) {
        this.logger.warn('[relay] upgrade rejected — missing token');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.handleConnection(ws, token!));
    });

    this.logger.log(`[relay] ConversationRelay WS attached at ${this.PATH} (dormant until Phase 4)`);
  }

  private handleConnection(ws: WebSocket, token: string): void {
    let state: RelayCallState | null = null;
    let setupPromise: Promise<void> | null = null; // resolves when loadRelayContext finishes
    let abort: AbortController | null = null;
    let closed = false;

    const send = (msg: Record<string, unknown>) => {
      if (!closed && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const teardown = () => {
      if (closed) return;
      closed = true;
      if (abort) { abort.abort(); abort = null; }
      state = null; // drop in-memory call state — no leak across the minutes-long socket
    };

    ws.on('message', async (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      try {
        switch (msg.type) {
          case 'setup': {
            const callSid: string = msg.callSid;
            const params = msg.customParameters || {};
            const tenantId: string = params.tenantId;
            const agentId: string | undefined = params.agentId || undefined;
            // AUTH: the signed token must match THIS call's callSid.
            if (!this.verifyToken(callSid, token)) {
              this.logger.warn(`[relay] setup rejected — bad token for ${callSid}`);
              send({ type: 'end', handoffData: JSON.stringify({ reason: 'auth_failed' }) });
              ws.close();
              return;
            }
            // Track the load so a prompt arriving before context is ready awaits it (no race).
            setupPromise = this.channelsService.loadRelayContext(tenantId, agentId, callSid).then((s) => {
              state = s;
              // Seed the greeting as the opening assistant turn so history is complete.
              // (ConversationRelay plays welcomeGreeting itself; we only record it.)
              if (state.firstMessage) state.history.push({ role: 'assistant', content: state.firstMessage });
              this.logger.log(`[relay] setup ok callSid=${callSid} tenant=${tenantId} agent=${agentId}`);
            });
            await setupPromise;
            break;
          }
          case 'prompt': {
            // Act only on a COMPLETE utterance (last:true). Partials are ignored.
            if (msg.last !== true) return;
            const text: string = (msg.voicePrompt || '').trim();
            if (!text) return;
            // Await setup if a fast first utterance beat loadRelayContext (rare — greeting buffers it).
            if (setupPromise) await setupPromise;
            if (!state) return;
            // Fresh abort controller per turn — barge-in cancels exactly this stream.
            if (abort) abort.abort();
            abort = new AbortController();
            await this.channelsService.handleRelayTurn(state, text, send, abort.signal);
            break;
          }
          case 'interrupt': {
            // True barge-in: abort the in-flight Gemini stream immediately.
            if (abort) { abort.abort(); this.logger.log(`[relay] interrupt callSid=${state?.callSid}`); }
            break;
          }
          case 'dtmf':
            // Not handled in v1 (no IVR keypad flows on the relay path yet).
            break;
          case 'error':
            this.logger.warn(`[relay] CR error: ${msg.description}`);
            break;
          default:
            break;
        }
      } catch (err: any) {
        this.logger.error(`[relay] message handler error: ${err?.message}`);
        // In-band: never crash the socket; the turn handler already speaks an apology on its own errors.
      }
    });

    ws.on('close', () => { this.logger.log(`[relay] socket closed callSid=${state?.callSid}`); teardown(); });
    ws.on('error', (e) => { this.logger.warn(`[relay] socket error: ${e?.message}`); teardown(); });
  }
}
