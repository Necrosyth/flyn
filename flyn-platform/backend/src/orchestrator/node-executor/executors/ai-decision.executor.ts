/**
 * AI Decision Executor
 *
 * Handles `ai_decision` type nodes created via the visual builder.
 * Uses AI to make a binary true/false routing decision based on a prompt.
 *
 * Config shape:
 *   prompt:               string [REQUIRED] – what the AI should decide
 *   aiTask:               'classify' | 'sentiment' | 'extract' | 'generate' | 'custom'
 *   confidenceThreshold:  number (0-100, default 80)
 *   fallbackAction:       'human_review' | 'retry' | 'default_path'
 *   model:                string (optional model preference)
 *
 * Returns:
 *   output.matched        – true if AI decision is YES and confidence >= threshold
 *   output.confidence     – AI confidence score (0-1)
 *   output.decision       – 'yes' | 'no'
 *   output.reasoning      – AI explanation for the decision
 *
 * The graph traversal service routes to the 'true' edge when matched=true,
 * and to the 'false' edge otherwise — identical to the Decision node.
 */

import { Injectable } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../../types';
import { AIProviderService } from '../../ai-provider';

interface AiDecisionConfig {
    prompt?: string;
    aiTask?: string;
    confidenceThreshold?: number;
    fallbackAction?: string;
    model?: string;
}

@Injectable()
export class AiDecisionExecutor extends BaseExecutor {
    readonly nodeType = 'ai_decision';
    readonly displayName = 'AI Decision';
    readonly description = 'Uses AI to make a yes/no routing decision based on a natural-language prompt';

    constructor(private readonly aiProvider: AIProviderService) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as AiDecisionConfig;

        const rawPrompt = config.prompt || '';
        if (!rawPrompt.trim()) {
            return this.failed('MISSING_PROMPT', 'AI Decision node requires a prompt', false);
        }

        // Resolve {{...}} template variables from previousOutputs
        const prompt = this.interpolate(rawPrompt, context.previousOutputs);

        // Confidence threshold: config stores 0-100, we convert to 0-1 for comparison
        const threshold = ((config.confidenceThreshold ?? 80)) / 100;

        const systemPrompt = this.buildSystemPrompt(config.aiTask || 'custom');

        context.services.log('info', `AI Decision "${node.id}": evaluating prompt (threshold=${Math.round(threshold * 100)}%)`, {
            nodeId: node.id,
        });

        let decision: 'yes' | 'no' = 'no';
        let confidence = 0;
        let reasoning = '';

        try {
            const response = await this.aiProvider.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ]);

            const text = (response.content || '').trim().toLowerCase();
            const parsed = this.parseResponse(text);
            decision = parsed.decision;
            confidence = parsed.confidence;
            reasoning = parsed.reasoning;
        } catch (error: any) {
            context.services.log('warn', `AI Decision "${node.id}": AI provider failed: ${error?.message} — defaulting to false path`, {
                nodeId: node.id,
            });
            return this.completed({
                matched: false,
                decision: 'no',
                confidence: 0,
                reasoning: `AI provider error: ${error?.message}`,
                aiProviderError: true,
            });
        }

        const matched = decision === 'yes' && confidence >= threshold;

        context.services.log('info', `AI Decision "${node.id}": decision=${decision}, confidence=${confidence.toFixed(2)}, threshold=${threshold.toFixed(2)}, matched=${matched}`, {
            nodeId: node.id,
        });

        return this.completed({
            matched,
            decision,
            confidence,
            reasoning,
            threshold,
            aiTask: config.aiTask || 'custom',
        });
    }

    // ─────────────────────────────── Helpers ────────────────────────────────

    private buildSystemPrompt(aiTask: string): string {
        const taskDescriptions: Record<string, string> = {
            classify: 'Classify the intent or category of the input and decide if it matches the target condition.',
            sentiment: 'Analyze the sentiment of the input and decide if it is positive/good (yes) or negative/neutral (no).',
            extract: 'Extract the key information from the input and decide if the required data is present.',
            generate: 'Generate a response to the input and decide if the situation warrants a yes outcome.',
            custom: 'Analyze the situation described and make a yes or no decision.',
        };

        const taskDesc = taskDescriptions[aiTask] || taskDescriptions.custom;

        return `You are a decision-making AI assistant. ${taskDesc}

Respond ONLY in this exact format:
DECISION: yes|no
CONFIDENCE: 0-100
REASONING: one sentence explanation

Example:
DECISION: yes
CONFIDENCE: 85
REASONING: The customer expressed clear purchase intent and mentioned budget availability.`;
    }

    private parseResponse(text: string): { decision: 'yes' | 'no'; confidence: number; reasoning: string } {
        let decision: 'yes' | 'no' = 'no';
        let confidence = 50;
        let reasoning = text;

        // Try structured format: DECISION: yes\nCONFIDENCE: 80\nREASONING: ...
        const decisionMatch = text.match(/decision:\s*(yes|no)/i);
        const confidenceMatch = text.match(/confidence:\s*(\d+)/i);
        const reasoningMatch = text.match(/reasoning:\s*(.+)/i);

        if (decisionMatch) {
            decision = decisionMatch[1].toLowerCase() as 'yes' | 'no';
        } else if (text.startsWith('yes')) {
            decision = 'yes';
        } else if (text.startsWith('no')) {
            decision = 'no';
        }

        if (confidenceMatch) {
            const raw = parseInt(confidenceMatch[1], 10);
            confidence = raw > 1 ? raw / 100 : raw; // Handle both 0-100 and 0-1 ranges
        }

        if (reasoningMatch) {
            reasoning = reasoningMatch[1].trim();
        }

        // Ensure confidence is 0-1
        if (confidence > 1) confidence = confidence / 100;
        confidence = Math.max(0, Math.min(1, confidence));

        return { decision, confidence, reasoning };
    }

    private interpolate(template: string, data: Record<string, unknown>): string {
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
                return Number.isInteger(idx) && !isNaN(idx) ? cur[idx] : (cur[0] as any)?.[key];
            }
            return (cur as Record<string, unknown>)[key];
        }, obj as unknown);
    }
}
