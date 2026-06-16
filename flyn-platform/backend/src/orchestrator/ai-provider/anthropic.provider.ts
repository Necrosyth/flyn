/**
 * Anthropic AI Provider
 *
 * Implementation of AIProvider using Anthropic's Messages API.
 * Uses Node.js built-in https module — no extra npm packages required.
 */

import * as https from 'https';
import {
    AIProvider,
    AIProviderConfig,
    AIMessage,
    AIResponse,
    AIStructuredResponse,
    AssistantTool,
    DEFAULT_MODELS,
} from './ai-provider.interface';
import { Logger } from '@nestjs/common';

interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface AnthropicResponse {
    content: Array<{ type: string; text: string }>;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
}

interface AnthropicTool {
    name: string;
    description: string;
    input_schema: object;
}

interface AnthropicContentBlock {
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    tool_use_id?: string;
    content?: string;
}

interface AnthropicToolMessage {
    role: 'user' | 'assistant';
    content: string | AnthropicContentBlock[];
}

export class AnthropicProvider implements AIProvider {
    readonly name = 'anthropic' as const;
    private readonly logger = new Logger(AnthropicProvider.name);
    private readonly apiKey: string;
    private readonly defaultModel: string;
    private readonly defaultTemperature: number;
    private readonly defaultMaxTokens: number;

    constructor(config: AIProviderConfig) {
        if (!config.apiKey) {
            throw new Error('Anthropic API key is required');
        }
        this.apiKey = config.apiKey;
        this.defaultModel = config.model || DEFAULT_MODELS.anthropic;
        this.defaultTemperature = config.temperature ?? 0.7;
        this.defaultMaxTokens = config.maxTokens ?? 4096;
    }

    async chat(
        messages: AIMessage[],
        options?: Partial<AIProviderConfig>,
    ): Promise<AIResponse> {
        const { system, userMessages } = this.splitMessages(messages);

        const payload: Record<string, unknown> = {
            model: options?.model || this.defaultModel,
            max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
            temperature: options?.temperature ?? this.defaultTemperature,
            messages: userMessages,
        };
        if (system) payload['system'] = system;

        const body = JSON.stringify(payload);
        const raw = await this.post('/v1/messages', body);
        const parsed = JSON.parse(raw) as AnthropicResponse;

        const content =
            parsed.content?.find((c) => c.type === 'text')?.text ?? '';
        const usage = parsed.usage;

        return {
            content,
            usage: usage
                ? {
                    promptTokens: usage.input_tokens,
                    completionTokens: usage.output_tokens,
                    totalTokens: usage.input_tokens + usage.output_tokens,
                }
                : undefined,
        };
    }

    async generateStructured<T>(
        prompt: string,
        schema: object,
        options?: Partial<AIProviderConfig>,
    ): Promise<AIStructuredResponse<T>> {
        const structuredPrompt = `${prompt}

You must respond with a valid JSON object that matches this schema:
${JSON.stringify(schema, null, 2)}

Respond ONLY with valid JSON, no additional text.`;

        const payload: Record<string, unknown> = {
            model: options?.model || this.defaultModel,
            max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
            temperature: options?.temperature ?? 0.3,
            messages: [{ role: 'user', content: structuredPrompt }] as AnthropicMessage[],
        };

        const body = JSON.stringify(payload);
        const raw = await this.post('/v1/messages', body);
        const parsed = JSON.parse(raw) as AnthropicResponse;
        const text = parsed.content?.find((c) => c.type === 'text')?.text ?? '{}';

        let data: T;
        try {
            let clean = text.trim();
            if (clean.startsWith('```json')) clean = clean.slice(7);
            if (clean.startsWith('```')) clean = clean.slice(3);
            if (clean.endsWith('```')) clean = clean.slice(0, -3);
            data = JSON.parse(clean.trim()) as T;
        } catch (parseError) {
            this.logger.error('Failed to parse Anthropic response as JSON:', text);
            throw new Error(`Invalid JSON response from Anthropic: ${(parseError as Error).message}`);
        }

        const confidence =
            typeof (data as Record<string, unknown>).confidence === 'number'
                ? ((data as Record<string, unknown>).confidence as number)
                : undefined;

        return { data, raw: text, confidence };
    }

    async chatWithTools(
        systemPrompt: string,
        messages: AnthropicToolMessage[],
        tools: AssistantTool[],
        toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>,
        options?: { maxTokens?: number; maxIterations?: number },
    ): Promise<{ content: string; toolCallLog: string[] }> {
        const currentMessages: AnthropicToolMessage[] = [...messages];
        const toolCallLog: string[] = [];
        const maxIterations = options?.maxIterations ?? 8;

        for (let i = 0; i < maxIterations; i++) {
            const payload: Record<string, unknown> = {
                model: this.defaultModel,
                max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
                system: systemPrompt,
                tools,
                messages: currentMessages,
            };

            const raw = await this.post('/v1/messages', JSON.stringify(payload));
            const response = JSON.parse(raw) as { stop_reason: string; content: AnthropicContentBlock[] };

            if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
                const textBlock = response.content.find(c => c.type === 'text');
                return { content: textBlock?.text ?? '', toolCallLog };
            }

            if (response.stop_reason === 'tool_use') {
                // Add assistant turn (may include text + tool_use blocks)
                currentMessages.push({ role: 'assistant', content: response.content });

                // Execute every tool_use block
                const toolResults: AnthropicContentBlock[] = [];
                for (const block of response.content) {
                    if (block.type === 'tool_use' && block.id && block.name) {
                        const inputStr = JSON.stringify(block.input ?? {});
                        toolCallLog.push(`${block.name}(${inputStr})`);
                        this.logger.debug(`Tool call: ${block.name}(${inputStr})`);
                        try {
                            const result = await toolExecutor(block.name, block.input ?? {});
                            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
                        } catch (err: any) {
                            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${err.message}` });
                        }
                    }
                }
                currentMessages.push({ role: 'user', content: toolResults });
            } else {
                // max_tokens or unknown stop
                const textBlock = response.content.find((c: AnthropicContentBlock) => c.type === 'text');
                return { content: textBlock?.text ?? 'I ran out of space. Please ask a shorter question.', toolCallLog };
            }
        }

        return { content: 'I reached my tool call limit. Try asking a more specific question.', toolCallLog };
    }

    /**
     * Anthropic separates the system prompt from user/assistant messages.
     */
    private splitMessages(messages: AIMessage[]): {
        system: string;
        userMessages: AnthropicMessage[];
    } {
        const systemParts: string[] = [];
        const userMessages: AnthropicMessage[] = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemParts.push(msg.content);
            } else {
                userMessages.push({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                });
            }
        }

        // Anthropic requires at least one user message
        if (userMessages.length === 0) {
            userMessages.push({ role: 'user', content: systemParts.join('\n\n') });
            return { system: '', userMessages };
        }

        return { system: systemParts.join('\n\n'), userMessages };
    }

    /**
     * Make a POST request to the Anthropic API.
     */
    private post(path: string, body: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const options: https.RequestOptions = {
                hostname: 'api.anthropic.com',
                path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Length': Buffer.byteLength(body),
                },
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`Anthropic API error ${res.statusCode}: ${data}`));
                    } else {
                        resolve(data);
                    }
                });
            });

            req.on('error', (err) => reject(new Error(`Anthropic request failed: ${err.message}`)));
            req.write(body);
            req.end();
        });
    }
}
