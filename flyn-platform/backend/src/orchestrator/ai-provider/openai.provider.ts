/**
 * OpenAI AI Provider
 *
 * Implementation of AIProvider using OpenAI's Chat Completions API.
 * Uses Node.js built-in https module — no extra npm packages required.
 */

import * as https from 'https';
import {
    AIProvider,
    AIProviderConfig,
    AIMessage,
    AIResponse,
    AIStructuredResponse,
    DEFAULT_MODELS,
} from './ai-provider.interface';
import { Logger } from '@nestjs/common';

interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface OpenAIResponse {
    choices: Array<{
        message: { content: string };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export class OpenAIProvider implements AIProvider {
    readonly name = 'openai' as const;
    private readonly logger = new Logger(OpenAIProvider.name);
    private readonly apiKey: string;
    private readonly defaultModel: string;
    private readonly defaultTemperature: number;
    private readonly defaultMaxTokens: number;

    constructor(config: AIProviderConfig) {
        if (!config.apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.apiKey = config.apiKey;
        this.defaultModel = config.model || DEFAULT_MODELS.openai;
        this.defaultTemperature = config.temperature ?? 0.7;
        this.defaultMaxTokens = config.maxTokens ?? 4096;
    }

    async chat(
        messages: AIMessage[],
        options?: Partial<AIProviderConfig>,
    ): Promise<AIResponse> {
        const body = JSON.stringify({
            model: options?.model || this.defaultModel,
            messages: messages as OpenAIMessage[],
            temperature: options?.temperature ?? this.defaultTemperature,
            max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
        });

        const raw = await this.post('/v1/chat/completions', body);
        const parsed = JSON.parse(raw) as OpenAIResponse;

        const content = parsed.choices?.[0]?.message?.content ?? '';
        const usage = parsed.usage;

        return {
            content,
            usage: usage
                ? {
                    promptTokens: usage.prompt_tokens,
                    completionTokens: usage.completion_tokens,
                    totalTokens: usage.total_tokens,
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

        const body = JSON.stringify({
            model: options?.model || this.defaultModel,
            messages: [{ role: 'user', content: structuredPrompt }] as OpenAIMessage[],
            temperature: options?.temperature ?? 0.3,
            max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
            response_format: { type: 'json_object' },
        });

        const raw = await this.post('/v1/chat/completions', body);
        const parsed = JSON.parse(raw) as OpenAIResponse;
        const text = parsed.choices?.[0]?.message?.content ?? '{}';

        let data: T;
        try {
            let clean = text.trim();
            if (clean.startsWith('```json')) clean = clean.slice(7);
            if (clean.startsWith('```')) clean = clean.slice(3);
            if (clean.endsWith('```')) clean = clean.slice(0, -3);
            data = JSON.parse(clean.trim()) as T;
        } catch (parseError) {
            this.logger.error('Failed to parse OpenAI response as JSON:', text);
            throw new Error(`Invalid JSON response from OpenAI: ${(parseError as Error).message}`);
        }

        const confidence =
            typeof (data as Record<string, unknown>).confidence === 'number'
                ? ((data as Record<string, unknown>).confidence as number)
                : undefined;

        return { data, raw: text, confidence };
    }

    /**
     * Make a POST request to the OpenAI API.
     */
    private post(path: string, body: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const options: https.RequestOptions = {
                hostname: 'api.openai.com',
                path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': Buffer.byteLength(body),
                },
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`OpenAI API error ${res.statusCode}: ${data}`));
                    } else {
                        resolve(data);
                    }
                });
            });

            req.on('error', (err) => reject(new Error(`OpenAI request failed: ${err.message}`)));
            req.write(body);
            req.end();
        });
    }
}
