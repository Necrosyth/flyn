/**
 * AI Provider Service
 * 
 * NestJS injectable service that provides AI capabilities
 * with support for multiple providers (Gemini, OpenAI, Anthropic).
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import {
    AIProvider,
    AIProviderConfig,
    AIProviderType,
    AIMessage,
    AIResponse,
    AIStructuredResponse,
    MongoQuerySchema,
    SQLQuerySchema,
    DEFAULT_MODELS,
} from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { AssistantTool } from './ai-provider.interface';
import { UsageService } from '../../usage/usage.service';

@Injectable()
export class AIProviderService implements OnModuleInit {
    private readonly logger = new Logger(AIProviderService.name);
    private provider: AIProvider | null = null;
    private readonly providerType: AIProviderType;

    constructor(@Optional() private readonly usageService?: UsageService) {
        // Determine provider from environment
        this.providerType = (process.env.AI_PROVIDER as AIProviderType) || 'gemini';
    }

    private trackTokens(tenantId: string, totalTokens: number): void {
        if (!tenantId || !totalTokens || totalTokens <= 0 || !this.usageService) return;
        this.usageService.increment(tenantId, 'ai.tokens', totalTokens).catch((err: any) =>
            this.logger.warn(`[Usage] ai.tokens track failed for ${tenantId}: ${err?.message}`),
        );
    }

    onModuleInit() {
        this.initializeProvider();
    }

    private initializeProvider(): void {
        const apiKey = this.getApiKeyForProvider(this.providerType);

        if (!apiKey) {
            this.logger.warn(
                `No API key found for ${this.providerType}. AI features will be disabled. ` +
                `Set ${this.getEnvKeyName(this.providerType)} in your .env file.`,
            );
            return;
        }

        try {
            this.provider = this.createProvider(this.providerType, apiKey);
            this.logger.log(`AI Provider initialized: ${this.providerType} (${DEFAULT_MODELS[this.providerType]})`);
        } catch (error) {
            this.logger.error(`Failed to initialize AI provider: ${(error as Error).message}`);
        }
    }

    private getApiKeyForProvider(provider: AIProviderType): string | undefined {
        switch (provider) {
            case 'gemini':
                return process.env.GEMINI_API_KEY;
            case 'openai':
                return process.env.OPENAI_API_KEY;
            case 'anthropic':
                return process.env.ANTHROPIC_API_KEY;
            default:
                return undefined;
        }
    }

    private getEnvKeyName(provider: AIProviderType): string {
        switch (provider) {
            case 'gemini':
                return 'GEMINI_API_KEY';
            case 'openai':
                return 'OPENAI_API_KEY';
            case 'anthropic':
                return 'ANTHROPIC_API_KEY';
            default:
                return 'AI_API_KEY';
        }
    }

    private createProvider(type: AIProviderType, apiKey: string): AIProvider {
        const config: AIProviderConfig = {
            provider: type,
            apiKey,
            model: type === 'gemini' ? (process.env.GEMINI_MODEL || 'gemini-2.5-flash') : undefined,
        };

        switch (type) {
            case 'gemini':
                return new GeminiProvider(config);
            case 'openai':
                return new OpenAIProvider({
                    ...config,
                    model: config.model || (process.env.OPENAI_MODEL || DEFAULT_MODELS.openai),
                });
            case 'anthropic':
                return new AnthropicProvider({
                    ...config,
                    model: config.model || (process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic),
                });
            default:
                throw new Error(`Unknown AI provider: ${type}`);
        }
    }

    /**
     * Check if AI provider is available
     */
    isAvailable(): boolean {
        return this.provider !== null;
    }

    /**
     * Get the current provider type
     */
    getProviderType(): AIProviderType {
        return this.providerType;
    }

    /**
     * Send a chat completion request.
     * Pass options.tenantId to automatically track actual token usage.
     */
    async chat(
        messages: AIMessage[],
        options?: Partial<AIProviderConfig>,
    ): Promise<AIResponse> {
        if (!this.provider) {
            throw new Error('AI provider not initialized. Please set the appropriate API key.');
        }
        const response = await this.provider.chat(messages, options);
        if (options?.tenantId && response.usage?.totalTokens) {
            this.trackTokens(options.tenantId, response.usage.totalTokens);
        }
        return response;
    }

    /**
     * Generate a response (alias for chat — threads tenantId for token tracking)
     */
    async generateResponse(tenantId: string, messages: AIMessage[]): Promise<AIResponse> {
        return this.chat(messages, { tenantId } as Partial<AIProviderConfig>);
    }

    /** Whether the active provider supports token streaming (currently Gemini only). */
    supportsStreaming(): boolean {
        return !!this.provider && typeof (this.provider as { chatStream?: unknown }).chatStream === 'function';
    }

    /**
     * STREAMING chat — yields reply tokens as they generate (for the ConversationRelay voice path).
     * Only the Gemini provider implements chatStream today; callers must guard with supportsStreaming()
     * (or be prepared to fall back to chat()). Throws if the active provider can't stream.
     */
    async *chatStream(
        messages: AIMessage[],
        options?: Partial<AIProviderConfig>,
        signal?: AbortSignal,
    ): AsyncGenerator<string, void, unknown> {
        if (!this.provider) {
            throw new Error('AI provider not initialized. Please set the appropriate API key.');
        }
        const streamer = this.provider as {
            chatStream?: (m: AIMessage[], o?: Partial<AIProviderConfig>, s?: AbortSignal) => AsyncGenerator<string, void, unknown>;
        };
        if (typeof streamer.chatStream !== 'function') {
            throw new Error(`Provider ${this.providerType} does not support streaming`);
        }
        yield* streamer.chatStream(messages, options, signal);
    }

    /**
     * Generate structured output
     */
    async generateStructured<T>(
        prompt: string,
        schema: object,
        options?: Partial<AIProviderConfig>,
    ): Promise<AIStructuredResponse<T>> {
        if (!this.provider) {
            throw new Error('AI provider not initialized. Please set the appropriate API key.');
        }
        return this.provider.generateStructured<T>(prompt, schema, options);
    }

    /**
     * Generate a MongoDB query from natural language
     */
    async generateMongoQuery(
        naturalLanguageQuery: string,
        context?: {
            availableCollections?: string[];
            sampleDocuments?: Record<string, unknown>[];
        },
    ): Promise<AIStructuredResponse<MongoQuerySchema>> {
        const schema = {
            type: 'object',
            properties: {
                intent: {
                    type: 'string',
                    description: 'What the user wants to achieve',
                },
                confidence: {
                    type: 'number',
                    description: 'Confidence score between 0 and 1',
                },
                collection: {
                    type: 'string',
                    description: 'The MongoDB collection to query',
                },
                operation: {
                    type: 'string',
                    enum: ['find', 'aggregate', 'findOne'],
                    description: 'The MongoDB operation to perform',
                },
                query: {
                    type: 'object',
                    description: 'The MongoDB query filter or aggregation pipeline',
                },
                projection: {
                    type: 'object',
                    description: 'Fields to include/exclude (optional)',
                },
                sort: {
                    type: 'object',
                    description: 'Sort order (optional)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of documents to return (optional)',
                },
                description: {
                    type: 'string',
                    description: 'Human-readable description of the query',
                },
            },
            required: ['intent', 'confidence', 'collection', 'operation', 'query', 'description'],
        };

        let prompt = `You are a MongoDB query expert. Convert the following natural language request into a MongoDB query.

User Request: "${naturalLanguageQuery}"`;

        if (context?.availableCollections?.length) {
            prompt += `\n\nAvailable collections: ${context.availableCollections.join(', ')}`;
        }

        if (context?.sampleDocuments?.length) {
            // Build a rich schema description from the sample documents
            const allFields = new Map<string, Set<string>>(); // field → set of observed types

            for (const doc of context.sampleDocuments) {
                for (const [field, value] of Object.entries(doc)) {
                    if (!allFields.has(field)) allFields.set(field, new Set());
                    const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
                    allFields.get(field)!.add(t);
                }
            }

            // Show field names with their types
            const schemaLines = Array.from(allFields.entries())
                .map(([field, types]) => `  - ${field}: ${[...types].join(' | ')}`);

            prompt += `\n\nCollection schema (inferred from real documents):\n${schemaLines.join('\n')}`;

            // Show 2 sample docs so the LLM sees real values
            const preview = context.sampleDocuments.slice(0, 2)
                .map((d, i) => `  Document ${i + 1}: ${JSON.stringify(d)}`)
                .join('\n');
            prompt += `\n\nSample documents:\n${preview}`;
        }

        prompt += `

Generate a MongoDB query that fulfills this request. Use standard MongoDB query operators like $gt, $lt, $eq, $in, $regex, etc.
Make sure to use the EXACT field names shown in the schema above.
For the collection name, use one of the available collections listed above.`;

        return this.generateStructured<MongoQuerySchema>(prompt, schema);
    }

    /**
     * Generate a SQL query from natural language (PostgreSQL or MySQL)
     */
    async generateSQLQuery(
        naturalLanguageQuery: string,
        dialect: 'postgresql' | 'mysql',
        context?: {
            availableTables?: string[];
            tableSchemas?: Record<string, { column: string; type: string }[]>;
        },
    ): Promise<AIStructuredResponse<SQLQuerySchema>> {
        const schema = {
            type: 'object',
            properties: {
                intent: {
                    type: 'string',
                    description: 'What the user wants to achieve',
                },
                confidence: {
                    type: 'number',
                    description: 'Confidence score between 0 and 1',
                },
                table: {
                    type: 'string',
                    description: 'The primary table involved',
                },
                operation: {
                    type: 'string',
                    enum: ['select', 'insert', 'update', 'delete', 'raw'],
                    description: 'The type of SQL operation',
                },
                sql: {
                    type: 'string',
                    description: 'The complete SQL query string. Use $1, $2, ... placeholders for PostgreSQL or ? placeholders for MySQL',
                },
                params: {
                    type: 'array',
                    description: 'Parameter values for the placeholders in the SQL query (optional)',
                },
                description: {
                    type: 'string',
                    description: 'Human-readable description of the query',
                },
            },
            required: ['intent', 'confidence', 'table', 'operation', 'sql', 'description'],
        };

        const dialectLabel = dialect === 'postgresql' ? 'PostgreSQL' : 'MySQL';
        const placeholderStyle = dialect === 'postgresql' ? '$1, $2, $3' : '?, ?, ?';

        let prompt = `You are a ${dialectLabel} SQL expert. Convert the following natural language request into a SQL query.

User Request: "${naturalLanguageQuery}"

Use ${dialectLabel} syntax. Use ${placeholderStyle} style parameterized placeholders if values need to be parameterized.`;

        if (context?.availableTables?.length) {
            prompt += `\n\nAvailable tables: ${context.availableTables.join(', ')}`;
        }

        if (context?.tableSchemas) {
            prompt += '\n\nTable schemas:';
            for (const [table, columns] of Object.entries(context.tableSchemas)) {
                const colDesc = columns.map(c => `  - ${c.column} (${c.type})`).join('\n');
                prompt += `\n\nTable "${table}":\n${colDesc}`;
            }
        }

        prompt += `\n\nGenerate a valid ${dialectLabel} SQL query that fulfills this request. Only return SELECT queries unless the user explicitly asks for INSERT/UPDATE/DELETE. Make sure to use the EXACT column names shown in the schema above.`;

        return this.generateStructured<SQLQuerySchema>(prompt, schema);
    }

    /**
     * Chat with tool use — delegates to provider-specific implementation.
     * Gemini and Anthropic use native function calling; others fall back to plain chat.
     */
    async chatWithTools(
        systemPrompt: string,
        messages: Array<{ role: 'user' | 'assistant'; content: string }>,
        tools: AssistantTool[],
        toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>,
        options?: { maxTokens?: number; maxIterations?: number },
    ): Promise<{ content: string; toolCallLog: string[] }> {
        if (!this.provider) {
            throw new Error('AI provider not initialized.');
        }
        if (this.provider instanceof GeminiProvider) {
            return (this.provider as GeminiProvider).chatWithTools(
                systemPrompt,
                messages,
                tools,
                toolExecutor,
                options,
            );
        }
        if (this.provider instanceof AnthropicProvider) {
            return (this.provider as AnthropicProvider).chatWithTools(
                systemPrompt,
                messages as any,
                tools,
                toolExecutor,
                options,
            );
        }
        // Fallback: inject context without tool use
        const result = await this.chat([
            { role: 'system', content: systemPrompt },
            ...messages,
        ]);
        return { content: result.content, toolCallLog: [] };
    }
}
