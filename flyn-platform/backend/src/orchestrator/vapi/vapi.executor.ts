import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../node-executor/base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../types';
import { VapiService } from './vapi.service';

/**
 * Vapi Voice AI Executor
 *
 * Workflow node executor for Vapi voice operations.
 * Supports: create_call, create_assistant, list_calls
 */
@Injectable()
export class VapiExecutor extends BaseExecutor {
    private readonly logger = new Logger(VapiExecutor.name);

    readonly nodeType = 'vapi';
    readonly displayName = 'Vapi Voice Call';
    readonly description =
        'Make outbound voice calls, create voice assistants, and manage calls using Vapi AI';

    constructor(private readonly vapiService: VapiService) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const { config } = node;
        const vapiAction = (config.vapiAction || config.vapi_action) as string;

        context.services.log('info', `Executing Vapi action: ${vapiAction}`, {
            nodeId: node.id,
            config,
        });

        try {
            const output = await this.executeVapiAction(
                vapiAction,
                config,
                context,
            );

            return this.completed({
                success: true,
                vapiAction,
                result: output,
                executedAt: new Date().toISOString(),
            });
        } catch (error) {
            const err = error as Error;
            context.services.log('error', `Vapi action failed: ${err.message}`, {
                nodeId: node.id,
                error: err.message,
            });

            return this.failed(
                'VAPI_EXECUTION_ERROR',
                err.message,
                true,
                { vapiAction, originalError: err.message },
            );
        }
    }

    private async executeVapiAction(
        action: string,
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Promise<Record<string, unknown>> {
        switch (action) {
            case 'create_call':
                return this.vapiService.createCall({
                    phoneNumberId:
                        this.resolveValue(config.phoneNumberId || config.phone_number_id, context) as string,
                    customerNumber:
                        this.resolveValue(config.customerNumber || config.customer_number, context) as string,
                    assistantId:
                        this.resolveValue(config.assistantId || config.assistant_id, context) as string,
                });

            case 'create_assistant':
                return this.vapiService.createAssistant({
                    name: this.resolveValue(config.assistantName || config.assistant_name, context) as string,
                    firstMessage:
                        this.resolveValue(config.firstMessage || config.first_message, context) as string,
                    systemPrompt:
                        this.resolveValue(config.systemPrompt || config.system_prompt, context) as string | undefined,
                    modelProvider:
                        (config.modelProvider || config.model_provider) as string | undefined,
                    modelName:
                        (config.modelName || config.model_name) as string | undefined,
                    voiceProvider:
                        (config.voiceProvider || config.voice_provider) as string | undefined,
                    voiceId:
                        (config.voiceId || config.voice_id) as string | undefined,
                });

            case 'list_calls':
                return this.vapiService.listCalls({
                    limit: (config.limit as number) || 10,
                });

            default:
                throw new Error(`Unknown Vapi action: ${action}`);
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
        const action = (node.config.vapiAction || node.config.vapi_action) as string;
        if (!action) {
            return {
                valid: false,
                errors: [
                    {
                        field: 'vapiAction',
                        message: 'Vapi action is required',
                        code: 'MISSING_VAPI_ACTION',
                    },
                ],
            };
        }
        return { valid: true };
    }
}
