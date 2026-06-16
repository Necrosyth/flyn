import { useState, useRef, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * WebRTC Voice Call Hook
 *
 * Captures mic audio via MediaRecorder, streams it over WebSocket
 * to the backend for AWS Lambda processing, and plays back the
 * AI-generated audio response.
 *
 * Usage:
 *   const { status, startCall, endCall, transcript, response } = useWebRTCCall();
 */

export type WebRTCCallStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'recording'
    | 'processing'
    | 'playing'
    | 'error';

interface UseWebRTCCallOptions {
    /** Backend WebSocket URL, defaults to window.location origin */
    serverUrl?: string;
    /** Silence detection timeout in ms before auto-sending chunk */
    silenceTimeoutMs?: number;
}

interface UseWebRTCCallReturn {
    status: WebRTCCallStatus;
    sessionId: string | null;
    error: string | null;
    transcript: string | null;
    response: string | null;
    startCall: () => Promise<void>;
    endCall: () => void;
}

export function useWebRTCCall(
    options: UseWebRTCCallOptions = {},
): UseWebRTCCallReturn {
    const {
        serverUrl = getDefaultServerUrl(),
        silenceTimeoutMs = 2000,
    } = options;

    const [status, setStatus] = useState<WebRTCCallStatus>('idle');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<string | null>(null);
    const [response, setResponse] = useState<string | null>(null);

    const socketRef = useRef<Socket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isRecordingRef = useRef(false);

    const isRecord = useCallback((value: unknown): value is Record<string, unknown> => {
        return typeof value === 'object' && value !== null;
    }, []);

    /**
     * Connect to the WebSocket gateway
     */
    const connectSocket = useCallback((): Promise<Socket> => {
        return new Promise((resolve, reject) => {
            const socket = io(`${serverUrl}/webrtc`, {
                transports: ['websocket', 'polling'],
                timeout: 10000,
            });

            socket.on('connect', () => {
                console.log('[WebRTC] Socket connected:', socket.id);
                resolve(socket);
            });

            socket.on('connect_error', (err: unknown) => {
                console.error('[WebRTC] Socket connection error:', err);
                const msg = err instanceof Error ? err.message : 'Unknown error';
                reject(new Error(`Connection failed: ${msg}`));
            });

            socket.on('audio:response', (data: unknown) => {
                console.log('[WebRTC] Audio response received');
                const payload = isRecord(data) ? data : {};
                const nextTranscript =
                    typeof payload.text === 'string' ? payload.text : null;
                const nextResponse =
                    typeof payload.responseText === 'string'
                        ? payload.responseText
                        : null;
                const audio = typeof payload.audio === 'string' ? payload.audio : null;

                setTranscript(nextTranscript);
                setResponse(nextResponse);

                if (audio && audio.length > 0) {
                    playAudioBase64(audio);
                    setStatus('playing');
                    // After a short delay, go back to recording
                    setTimeout(() => {
                        if (isRecordingRef.current) {
                            setStatus('recording');
                        }
                    }, 2000);
                } else {
                    setStatus('recording');
                }
            });

            socket.on('audio:error', (data: unknown) => {
                const payload = isRecord(data) ? data : {};
                const message = typeof payload.message === 'string' ? payload.message : 'Unknown error';
                console.error('[WebRTC] Audio error:', message);
                setError(message);
                setStatus('error');
            });

            socket.on('audio:status', (data: unknown) => {
                const payload = isRecord(data) ? data : {};
                const nextStatus = typeof payload.status === 'string' ? payload.status : undefined;
                console.log('[WebRTC] Status update:', nextStatus);
                if (nextStatus === 'processing') {
                    setStatus('processing');
                }
            });

            socket.on('disconnect', () => {
                console.log('[WebRTC] Socket disconnected');
                if (isRecordingRef.current) {
                    setStatus('error');
                    setError('Connection lost');
                }
            });

            socketRef.current = socket;
        });
    }, [serverUrl]);

    /**
     * Start a voice call session
     */
    const startCall = useCallback(async () => {
        setError(null);
        setTranscript(null);
        setResponse(null);
        setStatus('connecting');

        try {
            // 1. Connect WebSocket
            const socket = await connectSocket();

            // 2. Request mic access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 48000,
                },
            });
            streamRef.current = stream;

            // 3. Start audio session on backend
            const sessionResult = await new Promise<{ sessionId: string }>(
                (resolve, reject) => {
                    socket.emit('audio:start', {}, (res: unknown) => {
                        if (!isRecord(res)) {
                            reject(new Error('Invalid response from audio:start'));
                            return;
                        }
                        if (typeof res.error === 'string' && res.error.length > 0) {
                            reject(new Error(res.error));
                            return;
                        }
                        if (typeof res.sessionId !== 'string' || res.sessionId.length === 0) {
                            reject(new Error('Missing sessionId from audio:start'));
                            return;
                        }
                        resolve({ sessionId: res.sessionId });
                    });
                },
            );

            setSessionId(sessionResult.sessionId);
            setStatus('connected');
            isRecordingRef.current = true;

            // 4. Set up MediaRecorder for audio capture
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: getSupportedMimeType(),
            });
            mediaRecorderRef.current = mediaRecorder;

            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                if (chunks.length === 0 || !isRecordingRef.current) return;

                const blob = new Blob(chunks, {
                    type: mediaRecorder.mimeType,
                });
                chunks.length = 0;

                // Convert to base64 and send
                const base64 = await blobToBase64(blob);
                if (base64 && socketRef.current?.connected) {
                    setStatus('processing');
                    socketRef.current.emit('audio:chunk', {
                        sessionId: sessionResult.sessionId,
                        audio: base64,
                    });
                }

                // Restart recording if still active
                if (isRecordingRef.current && mediaRecorder.state === 'inactive') {
                    try {
                        mediaRecorder.start();
                        setupSilenceDetection(stream, mediaRecorder);
                    } catch {
                        // Stream may have ended
                    }
                }
            };

            // Start recording
            mediaRecorder.start();
            setStatus('recording');

            // Set up silence detection to auto-stop and send chunks
            setupSilenceDetection(stream, mediaRecorder);
        } catch (err: unknown) {
            console.error('[WebRTC] Start call failed:', err);
            const msg = err instanceof Error ? err.message : 'Failed to start call';
            setError(msg);
            setStatus('error');
            cleanup();
        }
    }, [connectSocket, silenceTimeoutMs]);

    /**
     * Set up silence detection using AudioContext analyser
     */
    const setupSilenceDetection = useCallback(
        (stream: MediaStream, mediaRecorder: MediaRecorder) => {
            // Clear any existing timer
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
            }

            try {
                if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                    audioContextRef.current = new AudioContext();
                }

                const audioContext = audioContextRef.current;
                const source = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 512;

                source.connect(analyser);

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                let silenceStart = Date.now();

                const checkAudio = () => {
                    if (!isRecordingRef.current) return;

                    analyser.getByteFrequencyData(dataArray);
                    const average =
                        dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

                    if (average < 5) {
                        // Silence
                        if (Date.now() - silenceStart > silenceTimeoutMs) {
                            // Silence threshold exceeded — send chunk
                            if (
                                mediaRecorder.state === 'recording'
                            ) {
                                mediaRecorder.stop();
                            }
                            source.disconnect();
                            return;
                        }
                    } else {
                        silenceStart = Date.now();
                    }

                    requestAnimationFrame(checkAudio);
                };

                requestAnimationFrame(checkAudio);
            } catch {
                // Fallback: just send every N seconds
                silenceTimerRef.current = setTimeout(() => {
                    if (
                        isRecordingRef.current &&
                        mediaRecorder.state === 'recording'
                    ) {
                        mediaRecorder.stop();
                    }
                }, silenceTimeoutMs + 1000);
            }
        },
        [silenceTimeoutMs],
    );

    /**
     * End the voice call
     */
    const endCall = useCallback(() => {
        isRecordingRef.current = false;

        if (socketRef.current?.connected && sessionId) {
            socketRef.current.emit('audio:end', { sessionId });
        }

        cleanup();
        setStatus('idle');
        setSessionId(null);
    }, [sessionId]);

    /**
     * Cleanup all resources
     */
    const cleanup = useCallback(() => {
        isRecordingRef.current = false;

        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }

        if (mediaRecorderRef.current?.state === 'recording') {
            try {
                mediaRecorderRef.current.stop();
            } catch { /* ignore */ }
        }
        mediaRecorderRef.current = null;

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }

        if (audioContextRef.current?.state !== 'closed') {
            try {
                audioContextRef.current?.close();
            } catch { /* ignore */ }
        }
        audioContextRef.current = null;

        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    return {
        status,
        sessionId,
        error,
        transcript,
        response,
        startCall,
        endCall,
    };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getDefaultServerUrl(): string {
    // In production, use the App Runner backend
    if (!import.meta.env.DEV) {
        return 'https://pjpmzvu7wn.us-east-1.awsapprunner.com';
    }
    // In dev, backend runs on port 3000
    if (typeof window !== 'undefined') {
        const { protocol, hostname } = window.location;
        return `${protocol}//${hostname}:3000`;
    }
    return 'https://pjpmzvu7wn.us-east-1.awsapprunner.com';
}

function getSupportedMimeType(): string {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'audio/webm'; // fallback
}

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // Strip "data:audio/...;base64," prefix
            const base64 = result.split(',')[1] || '';
            resolve(base64);
        };
        reader.readAsDataURL(blob);
    });
}

function playAudioBase64(base64Audio: string) {
    try {
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play().catch((err: unknown) => {
            console.warn('[WebRTC] Auto-play blocked:', err);
        });
    } catch (err) {
        console.error('[WebRTC] Failed to play audio:', err);
    }
}
