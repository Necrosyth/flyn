import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import WebSocket from 'ws';

/**
 * Unmute Voice Service
 *
 * Manages downstream raw-WebSocket connections to a local Kyutai Unmute
 * backend running the OpenAI Realtime API (ORA) protocol.
 *
 * Each frontend client that enters voice mode gets its own dedicated WS
 * connection to Unmute, keyed by the Socket.IO `client.id`.
 */
@Injectable()
export class UnmuteService implements OnModuleDestroy {
    private readonly logger = new Logger(UnmuteService.name);

    /** Active downstream connections: Socket.IO clientId → WebSocket */
    private connections = new Map<string, WebSocket>();

    private get unmuteUrl(): string {
        return process.env.UNMUTE_WS_URL || 'ws://localhost:8000/v1/realtime';
    }

    // ── lifecycle ────────────────────────────────────────────────────────

    /** Tear down every downstream connection when the NestJS module shuts down. */
    onModuleDestroy() {
        for (const [clientId] of this.connections) {
            this.disconnect(clientId);
        }
    }

    // ── public API ───────────────────────────────────────────────────────

    /**
     * Open a WebSocket to Unmute and configure the session.
     *
     * @param clientId  Socket.IO client id (used as map key)
     * @param onAudioDelta  Called every time Unmute sends a `response.audio.delta`
     * @param onError       Called on downstream errors
     */
    connectToUnmute(
        clientId: string,
        onAudioDelta: (audioBase64: string) => void,
        onError: (message: string) => void,
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // Disconnect any stale connection first
            if (this.connections.has(clientId)) {
                this.disconnect(clientId);
            }

            const url = this.unmuteUrl;
            this.logger.log(
                `[${clientId}] Connecting to Unmute at ${url}`,
            );

            const ws = new WebSocket(url);

            ws.on('open', () => {
                this.logger.log(`[${clientId}] Unmute WebSocket opened`);
                this.connections.set(clientId, ws);

                // Send session.update to configure the voice agent
                const sessionUpdate = JSON.stringify({
                    type: 'session.update',
                    session: {
                        instructions:
                            'You are a professional telephony assistant. Keep responses very brief and natural for voice conversation.',
                        voice: 'Haku',
                        modalities: ['text', 'audio'],
                    },
                });
                ws.send(sessionUpdate);
                this.logger.log(`[${clientId}] Sent session.update`);
                resolve();
            });

            ws.on('message', (raw: WebSocket.RawData) => {
                try {
                    const event = JSON.parse(raw.toString());

                    switch (event.type) {
                        case 'response.audio.delta':
                            if (event.delta) {
                                onAudioDelta(event.delta);
                            }
                            break;

                        case 'response.audio.done':
                            this.logger.debug(
                                `[${clientId}] Unmute audio response complete`,
                            );
                            break;

                        case 'session.created':
                        case 'session.updated':
                            this.logger.log(
                                `[${clientId}] Unmute ${event.type}`,
                            );
                            break;

                        case 'error':
                            this.logger.error(
                                `[${clientId}] Unmute error: ${JSON.stringify(event.error ?? event)}`,
                            );
                            onError(
                                event.error?.message ||
                                'Unknown Unmute error',
                            );
                            break;

                        default:
                            this.logger.debug(
                                `[${clientId}] Unmute event: ${event.type}`,
                            );
                    }
                } catch (err) {
                    this.logger.warn(
                        `[${clientId}] Failed to parse Unmute message: ${err}`,
                    );
                }
            });

            ws.on('error', (err) => {
                this.logger.error(
                    `[${clientId}] Unmute WS error: ${err.message}`,
                );
                onError(err.message);
                reject(err);
            });

            ws.on('close', (code, reason) => {
                this.logger.log(
                    `[${clientId}] Unmute WS closed (code=${code}, reason=${reason})`,
                );
                this.connections.delete(clientId);
            });
        });
    }

    /**
     * Forward a base64 audio chunk to the Unmute backend.
     */
    forwardAudio(clientId: string, audioBase64: string): void {
        const ws = this.connections.get(clientId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            this.logger.warn(
                `[${clientId}] Cannot forward audio — no open Unmute connection`,
            );
            return;
        }

        const event = JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: audioBase64,
        });
        ws.send(event);
    }

    /**
     * Tear down the downstream Unmute connection for a client.
     */
    disconnect(clientId: string): void {
        const ws = this.connections.get(clientId);
        if (ws) {
            this.logger.log(`[${clientId}] Closing Unmute connection`);
            ws.close();
            this.connections.delete(clientId);
        }
    }

    /**
     * Check whether a given client currently has an active Unmute connection.
     */
    isConnected(clientId: string): boolean {
        const ws = this.connections.get(clientId);
        return !!ws && ws.readyState === WebSocket.OPEN;
    }
}
