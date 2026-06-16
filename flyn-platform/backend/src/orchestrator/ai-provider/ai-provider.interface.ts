/**
 * AI Provider Interface
 * 
 * Provider-agnostic interface for AI services.
 * Supports Gemini, OpenAI, and Anthropic (Claude).
 */

export type AIProviderType = 'gemini' | 'openai' | 'anthropic';

export interface AIProviderConfig {
    provider: AIProviderType;
    model?: string;
    apiKey: string;
    temperature?: number;
    maxTokens?: number;
    tenantId?: string; // forwarded for usage tracking only — not sent to provider
    thinkingBudget?: number; // Gemini 2.5-flash: 0 = disable thinking (saves 2-8s on voice calls)
}

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface AIStructuredResponse<T> {
    data: T;
    raw: string;
    confidence?: number;
}

/**
 * AI Provider interface that all providers must implement
 */
export interface AIProvider {
    /**
     * The name of the provider (e.g., 'gemini', 'openai')
     */
    readonly name: AIProviderType;

    /**
     * Send a chat completion request
     * 
     * @param messages - Array of messages in the conversation
     * @param options - Optional configuration overrides
     * @returns Promise with the AI response
     */
    chat(
        messages: AIMessage[],
        options?: Partial<AIProviderConfig>,
    ): Promise<AIResponse>;

    /**
     * Generate structured output (JSON) from a prompt
     * 
     * @param prompt - The prompt to generate from
     * @param schema - JSON schema describing the expected output
     * @param options - Optional configuration overrides
     * @returns Promise with parsed structured response
     */
    generateStructured<T>(
        prompt: string,
        schema: object,
        options?: Partial<AIProviderConfig>,
    ): Promise<AIStructuredResponse<T>>;
}

/**
 * Generic tool definition used by the AI assistant across all providers.
 * Uses Anthropic-style schema; each provider converts internally.
 */
export interface AssistantTool {
    name: string;
    description: string;
    input_schema: {
        type: 'object';
        properties?: Record<string, unknown>;
        required?: string[];
    };
}

/**
 * Schema for MongoDB query generation
 */
export interface MongoQuerySchema {
    intent: string;
    confidence: number;
    collection: string;
    operation: 'find' | 'aggregate' | 'findOne';
    query: Record<string, unknown>;
    projection?: Record<string, number>;
    sort?: Record<string, 1 | -1>;
    limit?: number;
    description: string;
}

/**
 * Schema for SQL query generation (PostgreSQL / MySQL)
 */
export interface SQLQuerySchema {
    intent: string;
    confidence: number;
    table: string;
    operation: 'select' | 'insert' | 'update' | 'delete' | 'raw';
    sql: string;
    params?: unknown[];
    description: string;
}

/**
 * Default models for each provider
 * Override gemini model via GEMINI_MODEL env var
 */
export const DEFAULT_MODELS: Record<AIProviderType, string> = {
    gemini: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    openai: 'gpt-4-turbo-preview',
    anthropic: 'claude-3-sonnet-20240229',
};
