/**
 * Gemini AI Provider
 * 
 * Implementation of AIProvider using Google's Generative AI SDK.
 */

import { GoogleGenerativeAI, GenerativeModel, Content, Part } from '@google/generative-ai';
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

export class GeminiProvider implements AIProvider {
    readonly name = 'gemini' as const;
    private readonly logger = new Logger(GeminiProvider.name);
    private readonly client: GoogleGenerativeAI;
    private readonly defaultModel: string;
    private readonly defaultTemperature: number;
    private readonly defaultMaxTokens: number;

    constructor(config: AIProviderConfig) {
        if (!config.apiKey) {
            throw new Error('Gemini API key is required');
        }
        this.client = new GoogleGenerativeAI(config.apiKey);
        this.defaultModel = config.model || DEFAULT_MODELS.gemini;
        this.defaultTemperature = config.temperature ?? 0.7;
        this.defaultMaxTokens = config.maxTokens ?? 4096;
    }

    async chat(
        messages: AIMessage[],
        options?: Partial<AIProviderConfig>,
    ): Promise<AIResponse> {
        const modelName = options?.model || this.defaultModel;

        // Detect if this is a JSON-structured request
        const isJsonRequest = messages.some(m =>
            m.role === 'system' && (
                m.content.includes('"type":"workflow"') ||
                m.content.includes('ONLY valid JSON') ||
                m.content.includes('respond with ONLY')
            )
        );

        const generationConfig: Record<string, unknown> = {
            temperature: options?.temperature ?? this.defaultTemperature,
            maxOutputTokens: options?.maxTokens ?? this.defaultMaxTokens,
        };
        if (isJsonRequest) {
            generationConfig['responseMimeType'] = 'application/json';
        }
        // thinkingBudget: 0 disables the chain-of-thought phase on gemini-2.5-flash,
        // cutting AI latency from 2-8s down to ~300ms for short voice responses.
        if (typeof options?.thinkingBudget === 'number') {
            generationConfig['thinkingConfig'] = { thinkingBudget: options.thinkingBudget };
        }

        // `thinkingConfig` only exists on the v1beta surface — sending it to v1 returns a
        // 400 ("Unknown name thinkingConfig"), which silently broke EVERY voice turn.
        const apiVersion = generationConfig['thinkingConfig'] ? 'v1beta' : 'v1';
        const model = this.client.getGenerativeModel(
            { model: modelName, generationConfig: generationConfig as never },
            { apiVersion },
        );

        // Convert messages to Gemini format — system prompt re-injected into every user turn
        const contents = this.convertToGeminiFormat(messages);

        try {
            const result = await model.generateContent({ contents });

            const response = result.response;
            const text = response.text();
            const usage = response.usageMetadata;

            return {
                content: text,
                usage: usage
                    ? {
                        promptTokens: usage.promptTokenCount || 0,
                        completionTokens: usage.candidatesTokenCount || 0,
                        totalTokens: usage.totalTokenCount || 0,
                    }
                    : undefined,
            };
        } catch (error) {
            this.logger.error('Gemini chat error:', error);
            throw new Error(`Gemini API error: ${(error as Error).message}`);
        }
    }

    /**
     * STREAMING chat — yields the reply token-by-token as Gemini generates it (the latency win for
     * the ConversationRelay voice path: TTS speaks token #1 while the model is still producing #20).
     *
     * ADDITIVE: does not touch chat()/generateStructured()/chatWithTools(). Same auth, same config
     * shape, same v1beta/v1 selection rule (thinkingConfig only exists on v1beta). maxTokens +
     * thinkingBudget:0 parity with the voice chat() call is preserved by passing the same options.
     *
     * Yields each text chunk as it arrives. The caller forwards each as a ConversationRelay `text`
     * message ({token,last}). Throws on a hard API error (caller falls back to <Gather>).
     */
    async *chatStream(
        messages: AIMessage[],
        options?: Partial<AIProviderConfig>,
        /** Abort the in-flight stream (barge-in). Passed to the SDK AND checked per-chunk so we
         *  stop yielding immediately even before the underlying fetch unwinds. */
        signal?: AbortSignal,
    ): AsyncGenerator<string, void, unknown> {
        const modelName = options?.model || this.defaultModel;

        const generationConfig: Record<string, unknown> = {
            temperature: options?.temperature ?? this.defaultTemperature,
            maxOutputTokens: options?.maxTokens ?? this.defaultMaxTokens,
        };
        if (typeof options?.thinkingBudget === 'number') {
            generationConfig['thinkingConfig'] = { thinkingBudget: options.thinkingBudget };
        }
        const apiVersion = generationConfig['thinkingConfig'] ? 'v1beta' : 'v1';
        const model = this.client.getGenerativeModel(
            { model: modelName, generationConfig: generationConfig as never },
            { apiVersion },
        );

        const contents = this.convertToGeminiFormat(messages);

        // SDK 0.24.1: generateContentStream(request, { signal }) → { stream }. Each chunk.text()
        // is the incremental slice. SingleRequestOptions.signal cancels the client request on
        // barge-in. Errors surface at the call or mid-iteration; a post-abort AbortError is swallowed.
        try {
            const result = await model.generateContentStream({ contents }, signal ? { signal } : undefined);
            for await (const chunk of result.stream) {
                if (signal?.aborted) return; // stop forwarding the instant the caller interrupts
                const piece = chunk.text();
                if (piece) yield piece;
            }
        } catch (err: any) {
            if (signal?.aborted || err?.name === 'AbortError') return; // clean barge-in, not an error
            throw err;
        }
    }

    async generateStructured<T>(
        prompt: string,
        schema: object,
        options?: Partial<AIProviderConfig>,
    ): Promise<AIStructuredResponse<T>> {
        const modelName = options?.model || this.defaultModel;
        const model = this.client.getGenerativeModel(
            { 
                model: modelName, 
                generationConfig: { 
                    temperature: options?.temperature ?? 0.3, 
                    maxOutputTokens: options?.maxTokens ?? this.defaultMaxTokens,
                    responseMimeType: 'application/json'
                } 
            },
            { apiVersion: 'v1' },
        );

        // Create a prompt that includes the schema
        const structuredPrompt = `${prompt}

You must respond with a valid JSON object that matches this schema:
${JSON.stringify(schema, null, 2)}

Respond ONLY with valid JSON, no additional text.`;

        try {
            const result = await model.generateContent(structuredPrompt);
            const response = result.response;
            const text = response.text();

            // Parse the JSON response
            let parsed: T;
            try {
                // Clean the response - remove markdown code blocks if present
                let cleanText = text.trim();
                if (cleanText.startsWith('```json')) {
                    cleanText = cleanText.slice(7);
                }
                if (cleanText.startsWith('```')) {
                    cleanText = cleanText.slice(3);
                }
                if (cleanText.endsWith('```')) {
                    cleanText = cleanText.slice(0, -3);
                }
                parsed = JSON.parse(cleanText.trim()) as T;
            } catch (parseError) {
                this.logger.error('Failed to parse Gemini response as JSON:', text);
                throw new Error(`Invalid JSON response from Gemini: ${(parseError as Error).message}`);
            }

            // Extract confidence if present in the response
            const confidence = typeof (parsed as Record<string, unknown>).confidence === 'number'
                ? (parsed as Record<string, unknown>).confidence as number
                : undefined;

            return {
                data: parsed,
                raw: text,
                confidence,
            };
        } catch (error) {
            if (error instanceof Error && error.message.includes('Invalid JSON')) {
                throw error;
            }
            this.logger.error('Gemini structured generation error:', error);
            throw new Error(`Gemini API error: ${(error as Error).message}`);
        }
    }

    async chatWithTools(
        systemPrompt: string,
        messages: Array<{ role: 'user' | 'assistant'; content: string }>,
        tools: AssistantTool[],
        toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>,
        options?: { maxTokens?: number; maxIterations?: number },
    ): Promise<{ content: string; toolCallLog: string[] }> {
        const modelName = this.defaultModel;

        const functionDeclarations = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema as any,
        }));

        const model = this.client.getGenerativeModel(
            {
                model: modelName,
                tools: [{ functionDeclarations }] as any,
                systemInstruction: systemPrompt,
                generationConfig: {
                    maxOutputTokens: options?.maxTokens ?? this.defaultMaxTokens,
                    temperature: this.defaultTemperature,
                },
            },
            // tools + systemInstruction are only supported on the v1beta surface;
            // v1 rejects them with "Unknown name tools/systemInstruction".
            { apiVersion: 'v1beta' },
        );

        const contents: Content[] = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

        const toolCallLog: string[] = [];
        const maxIterations = options?.maxIterations ?? 8;

        for (let i = 0; i < maxIterations; i++) {
            const result = await model.generateContent({ contents });
            const candidate = result.response.candidates?.[0];
            const parts: Part[] = candidate?.content?.parts ?? [];

            const functionCallParts = parts.filter(p => (p as any).functionCall);

            if (functionCallParts.length === 0) {
                const text = parts
                    .filter(p => (p as any).text !== undefined)
                    .map(p => (p as any).text as string)
                    .join('');
                return { content: text, toolCallLog };
            }

            // Add model turn with function calls
            contents.push({ role: 'model', parts });

            // Execute each function call and collect responses
            const responseParts: Part[] = [];
            for (const part of functionCallParts) {
                const fc = (part as any).functionCall as { name: string; args: Record<string, unknown> };
                const inputStr = JSON.stringify(fc.args ?? {});
                toolCallLog.push(`${fc.name}(${inputStr})`);
                this.logger.debug(`Gemini tool call: ${fc.name}(${inputStr})`);
                try {
                    const output = await toolExecutor(fc.name, fc.args ?? {});
                    responseParts.push({
                        functionResponse: { name: fc.name, response: { output } },
                    } as any);
                } catch (err: any) {
                    responseParts.push({
                        functionResponse: { name: fc.name, response: { output: `Error: ${err.message}` } },
                    } as any);
                }
            }

            contents.push({ role: 'user', parts: responseParts });
        }

        return { content: 'I reached my tool call limit. Try asking a more specific question.', toolCallLog };
    }

    /**
     * Convert AIMessage array to Gemini Content format
     */
    private convertToGeminiFormat(messages: AIMessage[]): Content[] {
        const contents: Content[] = [];
        let systemPrompt = '';

        for (const message of messages) {
            if (message.role === 'system') {
                // Gemini has no native system role — store to prepend to EVERY user turn
                systemPrompt = message.content + '\n\n---\n\n';
            } else {
                const role = message.role === 'assistant' ? 'model' : 'user';
                let content = message.content;

                // Re-inject system prompt into EVERY user message so Gemini always has instructions
                // This is critical for multi-turn conversations where instructions must persist
                if (systemPrompt && role === 'user') {
                    content = systemPrompt + content;
                }

                contents.push({
                    role,
                    parts: [{ text: content }],
                });
            }
        }

        // If only a system prompt was provided with no user messages
        if (systemPrompt && contents.length === 0) {
            contents.push({
                role: 'user',
                parts: [{ text: systemPrompt.trim() }],
            });
        }

        return contents;
    }
}
