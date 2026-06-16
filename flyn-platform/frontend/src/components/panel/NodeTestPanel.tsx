/**
 * NodeTestPanel Component
 * -----------------------
 * Provides a "🧪 Test" button for Vapi and WebRTC nodes.
 * Sends the current node config to the isolated test endpoint
 * and displays the result or error in a collapsible JSON viewer.
 */

import React, { useState, useCallback, useRef } from 'react';
import { FlaskConical, Loader2, CheckCircle2, XCircle, Mic, Square, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { orchestratorService } from '@/services/orchestrator';

interface NodeTestPanelProps {
    nodeType: 'vapi' | 'webrtc';
    config: Record<string, unknown>;
}

interface TestResult {
    success: boolean;
    action: string;
    result?: Record<string, unknown>;
    error?: string;
    durationMs: number;
}

const NodeTestPanel: React.FC<NodeTestPanelProps> = ({ nodeType, config }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    /**
     * Strip internal technical jargon from error messages before showing to users.
     * The backend should never surface env vars, file paths, or SDK internals.
     */
    const sanitizeErrorForUser = (raw: string): string => {
        const lower = raw.toLowerCase();
        // Internal config / env issues
        if (lower.includes('api_key') || lower.includes('.env') || lower.includes('not set') ||
            lower.includes('environment variable') || lower.includes('process.env')) {
            return 'This feature is not configured for your account. Please contact your administrator.';
        }
        // SDK / network errors
        if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('etimedout')) {
            return 'Could not connect to the service. Please check your internet connection and try again.';
        }
        if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('403')) {
            return 'Access denied. Your account may not have permission to use this feature.';
        }
        if (lower.includes('429') || lower.includes('rate limit')) {
            return 'Too many requests. Please wait a moment and try again.';
        }
        // Long stack traces or internal paths — show a generic message
        if (raw.length > 300 || raw.includes('\n    at ') || raw.includes('/src/')) {
            return 'An unexpected error occurred. Please try again or contact support.';
        }
        return raw;
    };

    const getAction = (): string => {
        if (nodeType === 'vapi') {
            return (config.vapi_action || config.vapiAction || '') as string;
        }
        return (config.webrtc_action || config.webrtcAction || '') as string;
    };

    const getConfigForTest = (): Record<string, unknown> => {
        // Flatten dynamic group fields into the top-level config
        const flat: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(config)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Flatten nested objects (e.g. call_config, session_fields, lambda_config)
                for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
                    flat[subKey] = subVal;
                }
            } else {
                flat[key] = value;
            }
        }
        return flat;
    };

    const handleTest = useCallback(async () => {
        const action = getAction();
        if (!action) return;

        setIsLoading(true);
        setTestResult(null);

        try {
            const flatConfig = getConfigForTest();
            let result: TestResult;

            if (nodeType === 'vapi') {
                result = await orchestratorService.testVapiNode(action, flatConfig);
            } else {
                result = await orchestratorService.testWebRTCNode(action, flatConfig);
            }

            setTestResult(result);

            // If WebRTC start_session succeeded, save the sessionId for recording
            if (nodeType === 'webrtc' && action === 'start_session' && result.success && result.result) {
                setRecordingSessionId((result.result as { sessionId?: string }).sessionId || null);
            }
        } catch (err) {
            setTestResult({
                success: false,
                action,
                error: sanitizeErrorForUser((err as Error).message),
                durationMs: 0,
            });
        } finally {
            setIsLoading(false);
        }
    }, [nodeType, config]);

    /**
     * Record a short audio clip and send it via process_audio
     */
    const handleRecordAudio = useCallback(async () => {
        if (isRecording) {
            // Stop recording
            if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
            return;
        }

        // Need a session ID
        const sessionId = recordingSessionId ||
            (config.session_fields as Record<string, unknown>)?.session_id as string ||
            config.session_id as string;

        if (!sessionId) {
            setTestResult({
                success: false,
                action: 'process_audio',
                error: 'No session ID. Run "Start Voice Session" first, or enter a session ID.',
                durationMs: 0,
            });
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
            });
            streamRef.current = stream;

            const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
                .find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;

            const chunks: Blob[] = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                // Clean up stream
                stream.getTracks().forEach(t => t.stop());
                streamRef.current = null;

                if (chunks.length === 0) return;

                const blob = new Blob(chunks, { type: mimeType });
                const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const result = reader.result as string;
                        resolve(result.split(',')[1] || '');
                    };
                    reader.readAsDataURL(blob);
                });

                // Send to backend
                setIsLoading(true);
                try {
                    const result = await orchestratorService.testWebRTCNode('process_audio', {
                        session_id: sessionId,
                        audio_data: base64,
                    });
                    setTestResult(result);
                } catch (err) {
                    setTestResult({
                        success: false,
                        action: 'process_audio',
                        error: sanitizeErrorForUser((err as Error).message),
                        durationMs: 0,
                    });
                } finally {
                    setIsLoading(false);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);

            // Auto-stop after 5 seconds
            setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    mediaRecorderRef.current.stop();
                    setIsRecording(false);
                }
            }, 5000);
        } catch (err) {
            setTestResult({
                success: false,
                action: 'process_audio',
                error: sanitizeErrorForUser(`Microphone access denied: ${(err as Error).message}`),
                durationMs: 0,
            });
        }
    }, [isRecording, recordingSessionId, config]);

    const action = getAction();
    const showRecordButton = nodeType === 'webrtc' && action === 'process_audio';

    return (
        <div className="border-t border-border">
            <div className="p-4 space-y-3">
                {/* Section header */}
                <div className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Node Test
                    </span>
                </div>

                {/* Test button */}
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleTest}
                        disabled={isLoading || !action}
                        className="flex-1 gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <FlaskConical className="h-4 w-4" />
                        )}
                        {isLoading ? 'Testing...' : `Test ${action || 'Action'}`}
                    </Button>

                    {showRecordButton && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleRecordAudio}
                            disabled={isLoading}
                            className={`gap-2 ${isRecording
                                    ? 'border-red-500/50 text-red-400 hover:bg-red-500/10 bg-red-500/10'
                                    : 'border-sky-500/30 text-sky-400 hover:bg-sky-500/10'
                                }`}
                        >
                            {isRecording ? (
                                <>
                                    <Square className="h-3 w-3" />
                                    Stop
                                </>
                            ) : (
                                <>
                                    <Mic className="h-3 w-3" />
                                    Record
                                </>
                            )}
                        </Button>
                    )}
                </div>

                {!action && (
                    <p className="text-xs text-muted-foreground/60">
                        Select an action above to enable testing
                    </p>
                )}

                {/* Test Result */}
                {testResult && (
                    <div
                        className={`rounded-lg border p-3 ${testResult.success
                                ? 'border-emerald-500/30 bg-emerald-500/5'
                                : 'border-red-500/30 bg-red-500/5'
                            }`}
                    >
                        {/* Result header */}
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="w-full flex items-center justify-between text-left"
                        >
                            <div className="flex items-center gap-2">
                                {testResult.success ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                ) : (
                                    <XCircle className="h-4 w-4 text-red-400" />
                                )}
                                <span className={`text-xs font-medium ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {testResult.success ? 'Success' : 'Failed'}
                                </span>
                                <span className="text-xs text-muted-foreground/50">
                                    {testResult.durationMs}ms
                                </span>
                            </div>
                            {isExpanded ? (
                                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            )}
                        </button>

                        {/* Result body */}
                        {isExpanded && (
                            <div className="mt-2 pt-2 border-t border-border/50">
                                {testResult.error ? (
                                    <p className="text-xs text-red-400 break-words">{testResult.error}</p>
                                ) : (
                                    <pre className="text-xs text-muted-foreground overflow-auto max-h-48 whitespace-pre-wrap break-words font-mono bg-background/50 rounded p-2">
                                        {JSON.stringify(testResult.result, null, 2)}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NodeTestPanel;
