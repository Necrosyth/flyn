/**
 * AI Action Executor
 *
 * Handles `ai_action` type nodes created via the visual builder.
 * Config shape (from flow JSON):
 *   instruction:    "Write a follow-up message for {{merge_1.result.0.name}}"
 *   context_data:   "{{merge_1.result.0}}"   (optional, extra context pasted to the prompt)
 *   output_field:   "generatedText"           (optional alias for output key)
 *
 * Returns:
 *   output.generatedText  – the AI's response text
 *   output.instruction    – the resolved instruction string (for debugging)
 */

import { Injectable } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../../types';
import { AIProviderService } from '../../ai-provider';

@Injectable()
export class AiActionExecutor extends BaseExecutor {
    readonly nodeType = 'ai_action';
    readonly displayName = 'AI Action';
    readonly description = 'Generates text using an AI provider based on an instruction';

    constructor(private readonly aiProvider: AIProviderService) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as {
            instruction?: string;
            context_data?: string;
            output_field?: string;
            system_prompt?: string;
        };

        const rawInstruction = config.instruction || '';
        const rawContextData = config.context_data || '';

        // Resolve {{...}} template variables from previousOutputs
        const instruction = this.interpolateString(rawInstruction, context.previousOutputs);
        const contextData = rawContextData
            ? this.interpolateString(rawContextData, context.previousOutputs)
            : '';

        context.services.log('info', `AI Action "${node.id}": executing with instruction: "${instruction.substring(0, 100)}..."`, {
            nodeId: node.id,
        });

        // Build the prompt — include context_data if provided
        const userPrompt = contextData
            ? `${instruction}\n\nContext:\n${contextData}`
            : instruction;

        const systemPrompt = config.system_prompt
            ? this.interpolateString(config.system_prompt, context.previousOutputs)
            : 'You are a helpful assistant. Respond concisely and professionally.';

        let generatedText: string;
        try {
            const response = await this.aiProvider.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ]);
            generatedText = response.content;
        } catch (error: any) {
            // AI provider may not be configured — return a graceful fallback
            context.services.log('warn', `AI Action "${node.id}": AI provider call failed: ${error?.message}`, {
                nodeId: node.id,
            });
            return {
                status: 'COMPLETED',
                output: {
                    generatedText: `[AI provider unavailable: ${error?.message}]`,
                    instruction,
                    error: error?.message,
                },
            };
        }

        return {
            status: 'COMPLETED',
            output: {
                generatedText,
                // Aliases expected by SendReplyExecutor.resolveAcrossOutputs
                aiReply: generatedText,
                draftReply: generatedText,
                reply: generatedText,
                instruction,
            },
        };
    }

    // ─────────────────────────────── Helpers ────────────────────────────────

    /**
     * Interpolate {{path.to.value}} templates using previousOutputs
     */
    private interpolateString(template: string, data: Record<string, unknown>): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = this.getNestedValue(data, path.trim());
            return value !== undefined ? String(value) : `{{${path}}}`;
        });
    }

    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        if (!path) return undefined;
        const tokens = path
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.')
            .filter(Boolean);
        return tokens.reduce((cur: unknown, key: string) => {
            if (cur === undefined || cur === null) return undefined;
            if (Array.isArray(cur)) {
                const idx = Number(key);
                return Number.isInteger(idx) && !isNaN(idx)
                    ? cur[idx]
                    : (cur[0] as any)?.[key];
            }
            return (cur as Record<string, unknown>)[key];
        }, obj as unknown);
    }
}
