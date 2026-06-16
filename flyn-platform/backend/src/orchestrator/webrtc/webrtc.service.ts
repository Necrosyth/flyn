import { Injectable, Logger } from '@nestjs/common';
import {
    LambdaClient,
    InvokeCommand,
    InvokeCommandInput,
} from '@aws-sdk/client-lambda';

/**
 * WebRTC Audio Processing Service
 *
 * Manages audio processing sessions and AWS Lambda invocation.
 * Audio flows: Browser → WebSocket → this service → Lambda → response audio
 */
@Injectable()
export class WebRTCService {
    private readonly logger = new Logger(WebRTCService.name);
    private lambdaClient: LambdaClient | null = null;

    /**
     * Active sessions: sessionId → session metadata
     */
    private sessions = new Map<
        string,
        {
            id: string;
            status: 'active' | 'processing' | 'closed';
            createdAt: Date;
            lastActivityAt: Date;
        }
    >();

    private getLambdaClient(): LambdaClient | null {
        if (!this.lambdaClient) {
            const region = process.env.AWS_REGION || 'us-east-1';
            const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
            const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

            if (!accessKeyId || !secretAccessKey) {
                this.logger.warn(
                    'AWS credentials not configured — WebRTC audio processing will use mock mode',
                );
                return null;
            }

            this.lambdaClient = new LambdaClient({
                region,
                credentials: { accessKeyId, secretAccessKey },
            });
            this.logger.log(`Lambda client initialized (region: ${region})`);
        }
        return this.lambdaClient;
    }

    /**
     * Create a new audio session
     */
    createSession(): { sessionId: string } {
        const sessionId = `webrtc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.sessions.set(sessionId, {
            id: sessionId,
            status: 'active',
            createdAt: new Date(),
            lastActivityAt: new Date(),
        });
        this.logger.log(`Session created: ${sessionId}`);
        return { sessionId };
    }

    /**
     * Process audio through AWS Lambda
     *
     * @param sessionId - Active session ID
     * @param audioBase64 - Base64-encoded audio data (WebM/Opus from MediaRecorder)
     * @returns Processed audio response from Lambda
     */
    async processAudio(
        sessionId: string,
        audioBase64: string,
    ): Promise<{
        audio: string;
        text?: string;
        responseText?: string;
    }> {
        const session = this.sessions.get(sessionId);
        if (!session || session.status === 'closed') {
            throw new Error(`Session not found or closed: ${sessionId}`);
        }

        session.status = 'processing';
        session.lastActivityAt = new Date();

        const functionName =
            process.env.AWS_LAMBDA_AUDIO_FUNCTION || 'flyn-audio-processor';

        this.logger.log(
            `Processing audio for session ${sessionId} via Lambda: ${functionName}`,
        );

        try {
            const client = this.getLambdaClient();

            // ── Mock mode when Lambda is not configured ──────────────
            if (!client) {
                const audioLen = audioBase64 ? audioBase64.length : 0;
                const audioSizeBytes = Math.ceil((audioLen * 3) / 4);
                this.logger.log(
                    `[MOCK] Audio chunk received for session ${sessionId} — ${audioSizeBytes} bytes (base64 length: ${audioLen})`,
                );

                session.status = 'active';
                session.lastActivityAt = new Date();

                return {
                    audio: '',
                    text: `[MOCK] Audio received — ${audioSizeBytes} bytes`,
                    responseText:
                        `[MOCK] Lambda not configured — audio chunk received and decoded successfully. ` +
                        `Size: ${audioSizeBytes} bytes, Format: webm-opus, Session: ${sessionId}. ` +
                        `Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env to enable real processing.`,
                };
            }

            const payload = JSON.stringify({
                sessionId,
                audio: audioBase64,
                format: 'webm-opus',
                sampleRate: 48000,
                timestamp: new Date().toISOString(),
            });

            const params: InvokeCommandInput = {
                FunctionName: functionName,
                InvocationType: 'RequestResponse',
                Payload: new TextEncoder().encode(payload),
            };

            const command = new InvokeCommand(params);
            const response = await client.send(command);

            if (response.FunctionError) {
                const errorPayload = response.Payload
                    ? JSON.parse(new TextDecoder().decode(response.Payload))
                    : {};
                throw new Error(
                    `Lambda error: ${response.FunctionError} — ${errorPayload.errorMessage || 'Unknown'}`,
                );
            }

            const result = response.Payload
                ? JSON.parse(new TextDecoder().decode(response.Payload))
                : {};

            session.status = 'active';
            session.lastActivityAt = new Date();

            this.logger.log(
                `Audio processed for session ${sessionId} — response text: "${result.responseText?.slice(0, 50) || 'N/A'}..."`,
            );

            return {
                audio: result.audio || '',
                text: result.text,
                responseText: result.responseText,
            };
        } catch (error) {
            session.status = 'active';
            const err = error as Error;
            this.logger.error(
                `Audio processing failed for session ${sessionId}: ${err.message}`,
            );
            throw error;
        }
    }

    /**
     * End an audio session
     */
    endSession(sessionId: string): { success: boolean } {
        const session = this.sessions.get(sessionId);
        if (!session) {
            this.logger.warn(`Session not found: ${sessionId}`);
            return { success: false };
        }
        session.status = 'closed';
        this.sessions.delete(sessionId);
        this.logger.log(`Session ended: ${sessionId}`);
        return { success: true };
    }

    /**
     * Get session status
     */
    getSessionStatus(
        sessionId: string,
    ): {
        sessionId: string;
        status: string;
        createdAt: string;
        lastActivityAt: string;
    } | null {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        return {
            sessionId: session.id,
            status: session.status,
            createdAt: session.createdAt.toISOString(),
            lastActivityAt: session.lastActivityAt.toISOString(),
        };
    }
}
