import { Logger } from '@nestjs/common';
import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WebRTCService } from './webrtc.service';
import { UnmuteService } from './unmute.service';

/**
 * WebRTC Audio Signaling Gateway
 *
 * WebSocket gateway that handles:
 * 1. Session creation/teardown
 * 2. Audio chunk streaming (browser → server → Lambda → server → browser)
 *
 * Protocol:
 *   Client → 'audio:start'        → Server creates session, returns { sessionId }
 *   Client → 'audio:chunk'        → Server buffers/sends to Lambda, returns { audio, text }
 *   Client → 'audio:end'          → Server tears down session
 *   Server → 'audio:response'     → Emitted back with processed audio
 *   Server → 'audio:error'        → Emitted on processing error
 *   Server → 'audio:status'       → Session status updates
 */
@WebSocketGateway({
    namespace: '/webrtc',
    cors: {
        origin: [
            'http://localhost:5173',
            'http://localhost:8080',
            'http://localhost:8081',
            'http://127.0.0.1:5173',
            'https://myflynai.com',
        ],
        credentials: true,
    },
})
export class WebRTCGateway
    implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(WebRTCGateway.name);

    @WebSocketServer()
    server: Server;

    /**
     * Map socket IDs to their active session IDs for cleanup on disconnect
     */
    private socketSessions = new Map<string, string>();

    constructor(
        private readonly webrtcService: WebRTCService,
        private readonly unmuteService: UnmuteService,
    ) { }

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
        client.emit('audio:status', {
            status: 'connected',
            message: 'WebRTC audio gateway connected',
        });
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
        // Clean up any active session for this socket
        const sessionId = this.socketSessions.get(client.id);
        if (sessionId) {
            this.webrtcService.endSession(sessionId);
            this.socketSessions.delete(client.id);
            this.logger.log(
                `Auto-cleaned session ${sessionId} for disconnected client ${client.id}`,
            );
        }

        // Clean up any active Unmute voice-mode connection
        this.unmuteService.disconnect(client.id);
    }

    /**
     * Start a new audio session
     * Client sends: { }
     * Server responds: { sessionId }
     */
    @SubscribeMessage('audio:start')
    handleAudioStart(@ConnectedSocket() client: Socket) {
        try {
            const { sessionId } = this.webrtcService.createSession();
            this.socketSessions.set(client.id, sessionId);

            this.logger.log(
                `Audio session started: ${sessionId} (client: ${client.id})`,
            );

            client.emit('audio:status', {
                status: 'session_started',
                sessionId,
            });

            return { sessionId };
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Failed to start audio session: ${err.message}`);
            client.emit('audio:error', { message: err.message });
            return { error: err.message };
        }
    }

    /**
     * Process an audio chunk
     * Client sends: { sessionId, audio: "<base64 audio data>" }
     * Server emits 'audio:response' with processed audio
     */
    @SubscribeMessage('audio:chunk')
    async handleAudioChunk(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string; audio: string },
    ) {
        const { sessionId, audio } = data;

        if (!sessionId || !audio) {
            client.emit('audio:error', {
                message: 'Missing sessionId or audio data',
            });
            return { error: 'Missing sessionId or audio data' };
        }

        client.emit('audio:status', {
            status: 'processing',
            sessionId,
        });

        try {
            const result = await this.webrtcService.processAudio(
                sessionId,
                audio,
            );

            client.emit('audio:response', {
                sessionId,
                audio: result.audio,
                text: result.text,
                responseText: result.responseText,
                timestamp: new Date().toISOString(),
            });

            client.emit('audio:status', {
                status: 'ready',
                sessionId,
            });

            return { success: true };
        } catch (error) {
            const err = error as Error;
            this.logger.error(
                `Audio chunk processing failed (session: ${sessionId}): ${err.message}`,
            );
            client.emit('audio:error', {
                sessionId,
                message: err.message,
            });
            return { error: err.message };
        }
    }

    /**
     * End an audio session
     * Client sends: { sessionId }
     */
    @SubscribeMessage('audio:end')
    handleAudioEnd(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string },
    ) {
        const { sessionId } = data;

        try {
            const result = this.webrtcService.endSession(sessionId);
            this.socketSessions.delete(client.id);

            this.logger.log(
                `Audio session ended: ${sessionId} (client: ${client.id})`,
            );

            client.emit('audio:status', {
                status: 'session_ended',
                sessionId,
            });

            return result;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Failed to end session: ${err.message}`);
            client.emit('audio:error', { message: err.message });
            return { error: err.message };
        }
    }

    /**
     * Get session status
     * Client sends: { sessionId }
     */
    @SubscribeMessage('audio:status')
    handleGetStatus(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string },
    ) {
        const status = this.webrtcService.getSessionStatus(data.sessionId);
        if (!status) {
            return { error: 'Session not found' };
        }
        return status;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Voice Mode — Kyutai Unmute bridge
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Start a voice-mode session by connecting to the local Unmute backend.
     * The downstream connection is created per frontend client.
     */
    @SubscribeMessage('voice:start')
    async handleVoiceStart(@ConnectedSocket() client: Socket) {
        this.logger.log(`[VoiceMode] Client ${client.id} requesting voice start`);

        if (this.unmuteService.isConnected(client.id)) {
            client.emit('voice:status', {
                status: 'already_connected',
                message: 'Unmute session already active',
            });
            return { status: 'already_connected' };
        }

        try {
            await this.unmuteService.connectToUnmute(
                client.id,
                // onAudioDelta — relay audio back to the frontend
                (audioBase64: string) => {
                    client.emit('voice:audio', { audio: audioBase64 });
                },
                // onError — relay errors to the frontend
                (message: string) => {
                    client.emit('voice:error', { message });
                },
            );

            client.emit('voice:status', {
                status: 'unmute_connected',
                message: 'Connected to Unmute voice engine',
            });

            return { status: 'unmute_connected' };
        } catch (error) {
            const err = error as Error;
            this.logger.error(
                `[VoiceMode] Failed to connect for ${client.id}: ${err.message}`,
            );
            client.emit('voice:error', { message: err.message });
            return { error: err.message };
        }
    }

    /**
     * Forward an audio chunk from the frontend to the Unmute backend.
     * Client sends: { audio: "<base64>" }
     */
    @SubscribeMessage('voice:audio:chunk')
    handleVoiceAudioChunk(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { audio: string },
    ) {
        if (!data?.audio) {
            client.emit('voice:error', { message: 'Missing audio data' });
            return { error: 'Missing audio data' };
        }

        if (!this.unmuteService.isConnected(client.id)) {
            client.emit('voice:error', {
                message: 'No active Unmute connection. Call voice:start first.',
            });
            return { error: 'Not connected' };
        }

        this.unmuteService.forwardAudio(client.id, data.audio);
        return { success: true };
    }

    /**
     * Stop the voice-mode session and tear down the Unmute connection.
     */
    @SubscribeMessage('voice:stop')
    handleVoiceStop(@ConnectedSocket() client: Socket) {
        this.logger.log(`[VoiceMode] Client ${client.id} stopping voice mode`);
        this.unmuteService.disconnect(client.id);

        client.emit('voice:status', {
            status: 'unmute_disconnected',
            message: 'Unmute voice session ended',
        });

        return { status: 'unmute_disconnected' };
    }
}
