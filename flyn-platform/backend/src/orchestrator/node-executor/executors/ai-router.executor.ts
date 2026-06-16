/**
 * AI Router Executor
 * 
 * Uses AI to understand natural language queries, generate MongoDB queries,
 * and route workflow execution based on confidence scores.
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';
import { AIProviderService, MongoQuerySchema } from '../../ai-provider';

export interface AIRouterConfig {
    // The natural language prompt/question
    prompt: string;

    // What task the AI should perform
    task: 'generate_mongo_query' | 'classify_intent' | 'extract_data' | 'custom' | 'generate_inbox_reply' | 'analyze_sentiment';

    // Custom system prompt (optional)
    systemPrompt?: string;

    // Confidence threshold for routing (default: 0.8)
    confidenceThreshold?: number;

    // Additional context for the AI
    context?: {
        availableCollections?: string[];
        sampleDocuments?: Record<string, unknown>[];
        customInstructions?: string;
    };

    // Fallback action if confidence is low
    fallbackAction?: 'human_review' | 'default_path' | 'error';
}

export interface AIRouterOutput {
    intent: string;
    confidence: number;
    task: string;
    mongoQuery?: MongoQuerySchema;
    extractedData?: Record<string, unknown>;
    classification?: string;
    /** Generated reply text — set by generate_inbox_reply task. Read by SendReplyExecutor. */
    aiReply?: string;
    /** Sentiment analysis result — set by analyze_sentiment task. */
    sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
    sentimentScore?: number;
    sentimentSummary?: string;
    routing: {
        path: 'high_confidence' | 'low_confidence' | 'human_review';
        reason: string;
    };
}

@Injectable()
export class AIRouterExecutor extends BaseExecutor {
    private readonly logger = new Logger(AIRouterExecutor.name);
    readonly nodeType = NodeType.AI_ROUTER;
    readonly displayName = 'AI Router';
    readonly description = 'Uses AI to understand queries and route workflow execution';

    constructor(private readonly aiProvider: AIProviderService) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as unknown as AIRouterConfig;

        // ── Mock mode: return pre-computed result for demos / tests ──
        const mockResult = (node.config as any)._mockResult;
        if (mockResult) {
            context.services.log('info', `AI Router returning mock result`, {
                nodeId: node.id,
                mock: true,
            });
            return this.completed({
                ...mockResult,
                executedAt: new Date().toISOString(),
            });
        }

        // Validate configuration
        if (!config.prompt) {
            return this.failed(
                'INVALID_CONFIG',
                'AI Router requires a prompt',
                false,
            );
        }

        // Check if AI provider is available
        if (!this.aiProvider.isAvailable()) {
            return this.failed(
                'AI_UNAVAILABLE',
                'AI provider is not configured. Please set the appropriate API key.',
                false,
            );
        }

        context.services.log('info', `AI Router executing task: ${config.task || 'generate_mongo_query'}`, {
            nodeId: node.id,
            prompt: config.prompt.substring(0, 100) + '...',
        });

        try {
            const output = await this.executeTask(config, context);

            context.services.log('info', `AI Router completed with confidence: ${output.confidence}`, {
                nodeId: node.id,
                routing: output.routing,
            });

            return this.completed({
                ...output,
                executedAt: new Date().toISOString(),
            });
        } catch (error) {
            const err = error as Error;
            this.logger.error(`AI Router error: ${err.message}`, err.stack);

            return this.failed(
                'AI_ROUTER_ERROR',
                err.message,
                true,
                { originalError: err.message },
            );
        }
    }

    private async executeTask(
        config: AIRouterConfig,
        context: NodeExecutionContext,
    ): Promise<AIRouterOutput> {
        const task = config.task || 'generate_mongo_query';
        const confidenceThreshold = config.confidenceThreshold ?? 0.8;

        switch (task) {
            case 'generate_mongo_query':
                return this.generateMongoQuery(config, context, confidenceThreshold);

            case 'classify_intent':
                return this.classifyIntent(config, context, confidenceThreshold);

            case 'extract_data':
                return this.extractData(config, context, confidenceThreshold);

            case 'custom':
                return this.executeCustomPrompt(config, context, confidenceThreshold);

            case 'generate_inbox_reply':
                return this.generateInboxReply(config, context, confidenceThreshold);

            case 'analyze_sentiment':
                return this.analyzeSentiment(config, context, confidenceThreshold);

            default:
                throw new Error(`Unknown AI Router task: ${task}`);
        }
    }

    private async generateMongoQuery(
        config: AIRouterConfig,
        context: NodeExecutionContext,
        confidenceThreshold: number,
    ): Promise<AIRouterOutput> {
        // Interpolate the prompt with previous outputs
        const interpolatedPrompt = this.interpolateString(config.prompt, context.previousOutputs);

        const result = await this.aiProvider.generateMongoQuery(
            interpolatedPrompt,
            config.context,
        );

        const mongoQuery = result.data;
        const confidence = mongoQuery.confidence;

        return {
            intent: mongoQuery.intent,
            confidence,
            task: 'generate_mongo_query',
            mongoQuery,
            routing: this.determineRouting(confidence, confidenceThreshold, config.fallbackAction),
        };
    }

    private async classifyIntent(
        config: AIRouterConfig,
        context: NodeExecutionContext,
        confidenceThreshold: number,
    ): Promise<AIRouterOutput> {
        const interpolatedPrompt = this.interpolateString(config.prompt, context.previousOutputs);

        const schema = {
            type: 'object',
            properties: {
                intent: { type: 'string', description: 'The classified intent' },
                confidence: { type: 'number', description: 'Confidence score 0-1' },
                classification: { type: 'string', description: 'Category or class' },
                reasoning: { type: 'string', description: 'Why this classification' },
            },
            required: ['intent', 'confidence', 'classification'],
        };

        const systemPrompt = config.systemPrompt ||
            'You are an intent classifier. Analyze the input and classify it into the most appropriate category.';

        const fullPrompt = `${systemPrompt}

Input to classify: "${interpolatedPrompt}"

${config.context?.customInstructions || ''}`;

        const result = await this.aiProvider.generateStructured<{
            intent: string;
            confidence: number;
            classification: string;
            reasoning?: string;
        }>(fullPrompt, schema);

        return {
            intent: result.data.intent,
            confidence: result.data.confidence,
            task: 'classify_intent',
            classification: result.data.classification,
            routing: this.determineRouting(result.data.confidence, confidenceThreshold, config.fallbackAction),
        };
    }

    private async extractData(
        config: AIRouterConfig,
        context: NodeExecutionContext,
        confidenceThreshold: number,
    ): Promise<AIRouterOutput> {
        const interpolatedPrompt = this.interpolateString(config.prompt, context.previousOutputs);

        const schema = {
            type: 'object',
            properties: {
                confidence: { type: 'number', description: 'Confidence score 0-1' },
                extractedData: { type: 'object', description: 'Extracted key-value pairs' },
                summary: { type: 'string', description: 'Summary of what was extracted' },
            },
            required: ['confidence', 'extractedData'],
        };

        const systemPrompt = config.systemPrompt ||
            'You are a data extraction expert. Extract relevant information from the input.';

        const fullPrompt = `${systemPrompt}

Input: "${interpolatedPrompt}"

${config.context?.customInstructions || ''}`;

        const result = await this.aiProvider.generateStructured<{
            confidence: number;
            extractedData: Record<string, unknown>;
            summary?: string;
        }>(fullPrompt, schema);

        return {
            intent: 'data_extraction',
            confidence: result.data.confidence,
            task: 'extract_data',
            extractedData: result.data.extractedData,
            routing: this.determineRouting(result.data.confidence, confidenceThreshold, config.fallbackAction),
        };
    }

    private async executeCustomPrompt(
        config: AIRouterConfig,
        context: NodeExecutionContext,
        confidenceThreshold: number,
    ): Promise<AIRouterOutput> {
        const interpolatedPrompt = this.interpolateString(config.prompt, context.previousOutputs);

        const response = await this.aiProvider.chat([
            { role: 'system', content: config.systemPrompt || 'You are a helpful assistant.' },
            { role: 'user', content: interpolatedPrompt },
        ]);

        // For custom prompts, we default to high confidence since there's no structured output
        return {
            intent: 'custom_response',
            confidence: 1.0,
            task: 'custom',
            extractedData: { response: response.content },
            routing: {
                path: 'high_confidence',
                reason: 'Custom prompt executed successfully',
            },
        };
    }

    /**
     * Find a field value by scanning all node outputs (one level deep).
     * Used when the user configures a bare field name like "sentiment" instead
     * of the fully-qualified "ai_sentiment_1.sentiment".
     */
    private findInPreviousOutputs(
        previousOutputs: Record<string, unknown>,
        fieldNames: string[],
    ): unknown {
        for (const nodeOutput of Object.values(previousOutputs)) {
            if (nodeOutput && typeof nodeOutput === 'object') {
                const obj = nodeOutput as Record<string, unknown>;
                for (const field of fieldNames) {
                    if (field in obj && obj[field] !== undefined && obj[field] !== null && obj[field] !== '') {
                        return obj[field];
                    }
                }
            }
        }
        return undefined;
    }

    /**
     * If the prompt has no {{variable}} references, automatically append the
     * customer message body found in any previous node's output.
     */
    private enrichPromptWithMessage(
        prompt: string,
        previousOutputs: Record<string, unknown>,
    ): string {
        if (prompt.includes('{{')) return prompt; // already has variables — leave as-is
        const message = this.findInPreviousOutputs(previousOutputs, [
            'messageBody', 'lastMessage', 'message', 'body', 'text', 'content',
        ]);
        if (message) {
            return `${prompt}\n\nCustomer message:\n${String(message)}`;
        }
        return prompt;
    }

    /**
     * Generate a reply for an inbox conversation.
     * Expects the prompt / system_prompt to describe the tone / rules.
     * Reads the conversation thread from the prompt (user interpolates {{messageBody}}).
     * Outputs `aiReply` — consumed directly by SendReplyExecutor.
     */
    private async generateInboxReply(
        config: AIRouterConfig,
        context: NodeExecutionContext,
        confidenceThreshold: number,
    ): Promise<AIRouterOutput> {
        const enrichedPrompt = this.enrichPromptWithMessage(config.prompt, context.previousOutputs);
        const interpolatedPrompt = this.interpolateString(enrichedPrompt, context.previousOutputs);

        const systemPrompt = config.systemPrompt ||
            'You are a professional customer support agent. Write a concise, helpful, and friendly reply to the customer message below. Reply in plain text only — no markdown, no bullet points.';

        const response = await this.aiProvider.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: interpolatedPrompt },
        ]);

        return {
            intent: 'inbox_reply',
            confidence: 1.0,
            task: 'generate_inbox_reply',
            aiReply: response.content,
            extractedData: { response: response.content },
            routing: {
                path: 'high_confidence',
                reason: 'Inbox reply generated successfully',
            },
        };
    }

    /**
     * Analyze the sentiment of an inbox conversation thread.
     * Expects {{messageBody}} to be interpolated into the prompt.
     * Outputs `sentiment`, `sentimentScore`, `sentimentSummary`.
     */
    private async analyzeSentiment(
        config: AIRouterConfig,
        context: NodeExecutionContext,
        confidenceThreshold: number,
    ): Promise<AIRouterOutput> {
        const enrichedPrompt = this.enrichPromptWithMessage(config.prompt, context.previousOutputs);
        const interpolatedPrompt = this.interpolateString(enrichedPrompt, context.previousOutputs);

        const schema = {
            type: 'object',
            properties: {
                sentiment: {
                    type: 'string',
                    enum: ['positive', 'negative', 'neutral', 'mixed'],
                    description: 'Overall sentiment of the conversation',
                },
                sentimentScore: {
                    type: 'number',
                    description: 'Score from -1.0 (very negative) to 1.0 (very positive)',
                },
                summary: {
                    type: 'string',
                    description: 'One-sentence summary of the main topic/concern',
                },
                urgency: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'How urgently this needs a response',
                },
            },
            required: ['sentiment', 'sentimentScore', 'summary', 'urgency'],
        };

        const systemPrompt = config.systemPrompt ||
            'You are a CRM sentiment analysis specialist. Analyze the customer conversation and return structured sentiment data.';

        const fullPrompt = `${systemPrompt}

Conversation:
${interpolatedPrompt}`;

        const result = await this.aiProvider.generateStructured<{
            sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
            sentimentScore: number;
            summary: string;
            urgency: 'low' | 'medium' | 'high';
        }>(fullPrompt, schema);

        return {
            intent: 'sentiment_analysis',
            confidence: 1.0,
            task: 'analyze_sentiment',
            sentiment: result.data.sentiment,
            sentimentScore: result.data.sentimentScore,
            sentimentSummary: result.data.summary,
            extractedData: {
                sentiment: result.data.sentiment,
                sentimentScore: result.data.sentimentScore,
                summary: result.data.summary,
                urgency: result.data.urgency,
            },
            routing: {
                path: 'high_confidence',
                reason: `Sentiment: ${result.data.sentiment} (urgency: ${result.data.urgency})`,
            },
        };
    }

    private determineRouting(
        confidence: number,
        threshold: number,
        fallbackAction?: string,
    ): AIRouterOutput['routing'] {
        if (confidence >= threshold) {
            return {
                path: 'high_confidence',
                reason: `Confidence ${(confidence * 100).toFixed(1)}% meets threshold ${(threshold * 100).toFixed(1)}%`,
            };
        }

        if (fallbackAction === 'human_review' || (!fallbackAction && confidence >= threshold * 0.6)) {
            return {
                path: 'human_review',
                reason: `Confidence ${(confidence * 100).toFixed(1)}% below threshold, routing to human review`,
            };
        }

        return {
            path: 'low_confidence',
            reason: `Confidence ${(confidence * 100).toFixed(1)}% too low, using default path`,
        };
    }

    /**
     * Interpolate variables in a string using {{variablePath}} syntax
     */
    private interpolateString(template: string, data: Record<string, unknown>): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = this.getNestedValue(data, path.trim());
            return value !== undefined ? String(value) : `{{${path}}}`;
        });
    }

    /**
     * Get a nested value from an object using dot/bracket notation.
     * Supports: a.b.c, a.b[0].c, a[0], a["key"]
     */
    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        const tokens = path
            .replace(/\[(\d+)\]/g, '.$1')
            .replace(/\["([^"]+)"\]/g, '.$1')
            .replace(/\['([^']+)'\]/g, '.$1')
            .split('.')
            .filter(Boolean);

        return tokens.reduce((current, key) => {
            if (current === undefined || current === null) return undefined;
            if (Array.isArray(current)) {
                const idx = Number(key);
                if (Number.isInteger(idx)) return current[idx];
                const first = current[0];
                if (first && typeof first === 'object') {
                    return (first as Record<string, unknown>)[key];
                }
                return undefined;
            }
            if (typeof current === 'object') {
                return (current as Record<string, unknown>)[key];
            }
            return undefined;
        }, obj as unknown);
    }
}
