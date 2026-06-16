import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../node-executor/base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../types';
import { WebRTCService } from './webrtc.service';

/**
 * WebRTC Audio Executor
 *
 * Workflow node executor for WebRTC voice operations.
 * Supports: start_session, end_session, get_status, process_audio
 */
@Injectable()
export class WebRTCExecutor extends BaseExecutor {
    private readonly logger = new Logger(WebRTCExecutor.name);

    readonly nodeType = 'webrtc';
    readonly displayName = 'WebRTC Voice';
    readonly description =
        'Stream audio via WebRTC and process through AWS Lambda for AI voice interactions';

    constructor(private readonly webrtcService: WebRTCService) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const { config } = node;
        const action = (config.webrtcAction || config.webrtc_action) as string;

        context.services.log('info', `Executing WebRTC action: ${action}`, {
            nodeId: node.id,
            config,
        });

        try {
            const output = await this.executeAction(action, config, context);

            return this.completed({
                success: true,
                webrtcAction: action,
                result: output,
                executedAt: new Date().toISOString(),
            });
        } catch (error) {
            const err = error as Error;
            context.services.log(
                'error',
                `WebRTC action failed: ${err.message}`,
                { nodeId: node.id, error: err.message },
            );

            return this.failed(
                'WEBRTC_EXECUTION_ERROR',
                err.message,
                true,
                { webrtcAction: action, originalError: err.message },
            );
        }
    }

    private async executeAction(
        action: string,
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Promise<Record<string, unknown>> {
        switch (action) {
            case 'start_session': {
                return this.webrtcService.createSession();
            }

            case 'end_session': {
                const sessionId = this.resolveValue(
                    config.sessionId || config.session_id,
                    context,
                ) as string;
                return this.webrtcService.endSession(sessionId);
            }

            case 'get_status': {
                const sessionId = this.resolveValue(
                    config.sessionId || config.session_id,
                    context,
                ) as string;
                const status =
                    this.webrtcService.getSessionStatus(sessionId);
                if (!status) {
                    throw new Error(
                        `Session not found: ${sessionId}`,
                    );
                }
                return status;
            }

            case 'process_audio': {
                const sessionId = this.resolveValue(
                    config.sessionId || config.session_id,
                    context,
                ) as string;
                const audio = this.resolveValue(
                    config.audio || config.audioData,
                    context,
                ) as string;
                return this.webrtcService.processAudio(sessionId, audio);
            }

            default:
                throw new Error(`Unknown WebRTC action: ${action}`);
        }
    }

    /**
     * Resolve {{variable}} references from previous node outputs
     */
    private resolveValue(
        value: unknown,
        context: NodeExecutionContext,
    ): unknown {
        if (typeof value !== 'string') return value;
        return value.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
            const segments = path.trim().split('.');
            let current: unknown = context.previousOutputs;
            for (const seg of segments) {
                if (current == null) return `{{${path}}}`;
                current = (current as Record<string, unknown>)[seg];
            }
            return current != null ? String(current) : `{{${path}}}`;
        });
    }

    validate(node: CompiledNode) {
        const action = (node.config.webrtcAction ||
            node.config.webrtc_action) as string;
        if (!action) {
            return {
                valid: false,
                errors: [
                    {
                        field: 'webrtcAction',
                        message: 'WebRTC action is required',
                        code: 'MISSING_WEBRTC_ACTION',
                    },
                ],
            };
        }
        return { valid: true };
    }
}
