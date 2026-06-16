import { Injectable, Logger } from '@nestjs/common';
import { VapiClient } from '@vapi-ai/server-sdk';

/**
 * Vapi Voice AI Service
 *
 * Thin wrapper around the Vapi Server SDK.
 * Handles outbound calls, assistant management, and call listing.
 */
@Injectable()
export class VapiService {
    private readonly logger = new Logger(VapiService.name);
    private client: VapiClient | null = null;

    private getClient(): VapiClient {
        if (!this.client) {
            const token = process.env.VAPI_API_KEY;
            if (!token) {
                throw new Error(
                    'Voice calling is not configured for this account. Please contact your administrator to enable the Make a Phone Call feature.',
                );
            }
            this.client = new VapiClient({ token });
            this.logger.log('Vapi client initialized');
        }
        return this.client;
    }

    /**
     * Create an outbound phone call
     */
    async createCall(params: {
        phoneNumberId: string;
        customerNumber: string;
        assistantId: string;
        metadata?: Record<string, unknown>;
    }): Promise<Record<string, unknown>> {
        const client = this.getClient();

        this.logger.log(
            `Creating outbound call to ${params.customerNumber} with assistant ${params.assistantId}`,
        );

        const call = await client.calls.create({
            phoneNumberId: params.phoneNumberId,
            customer: { number: params.customerNumber },
            assistantId: params.assistantId,
        }) as any;

        return {
            callId: call.id ?? call.callId,
            status: call.status ?? 'queued',
            createdAt: call.createdAt ?? new Date().toISOString(),
            phoneNumberId: params.phoneNumberId,
            customerNumber: params.customerNumber,
            assistantId: params.assistantId,
        };
    }

    /**
     * Create a Vapi assistant
     */
    async createAssistant(params: {
        name: string;
        firstMessage: string;
        systemPrompt?: string;
        modelProvider?: string;
        modelName?: string;
        voiceProvider?: string;
        voiceId?: string;
    }): Promise<Record<string, unknown>> {
        const client = this.getClient();

        this.logger.log(`Creating Vapi assistant: ${params.name}`);

        const assistantConfig: Record<string, unknown> = {
            name: params.name,
            firstMessage: params.firstMessage,
        };

        // Model configuration
        if (params.modelProvider || params.modelName) {
            const modelCfg: Record<string, unknown> = {
                provider: params.modelProvider || 'openai',
                model: params.modelName || 'gpt-4o',
            };
            if (params.systemPrompt) {
                modelCfg.messages = [
                    { role: 'system', content: params.systemPrompt },
                ];
            }
            assistantConfig.model = modelCfg;
        }

        // Voice configuration
        if (params.voiceProvider || params.voiceId) {
            assistantConfig.voice = {
                provider: params.voiceProvider || '11labs',
                voiceId: params.voiceId || '21m00Tcm4TlvDq8ikWAM',
            };
        }

        const assistant = await (client.assistants as any).create(
            assistantConfig,
        );

        return {
            assistantId: assistant.id,
            name: assistant.name,
            createdAt: assistant.createdAt,
        };
    }

    /**
     * Update an existing Vapi assistant
     */
    async updateAssistant(assistantId: string, params: {
        name?: string;
        firstMessage?: string;
        systemPrompt?: string;
        modelProvider?: string;
        modelName?: string;
        voiceProvider?: string;
        voiceId?: string;
    }): Promise<Record<string, unknown>> {
        const client = this.getClient();

        this.logger.log(`Updating Vapi assistant: ${assistantId}`);

        const assistantConfig: Record<string, unknown> = {};

        if (params.name) assistantConfig.name = params.name;
        if (params.firstMessage) assistantConfig.firstMessage = params.firstMessage;

        // Model configuration
        if (params.modelProvider || params.modelName || params.systemPrompt) {
            const modelCfg: Record<string, unknown> = {
                provider: params.modelProvider || 'openai',
                model: params.modelName || 'gpt-4o',
            };
            if (params.systemPrompt) {
                modelCfg.messages = [
                    { role: 'system', content: params.systemPrompt },
                ];
            }
            assistantConfig.model = modelCfg;
        }

        // Voice configuration
        if (params.voiceProvider || params.voiceId) {
            assistantConfig.voice = {
                provider: params.voiceProvider || '11labs',
                voiceId: params.voiceId || '21m00Tcm4TlvDq8ikWAM',
            };
        }

        const assistant = await (client.assistants as any).update(
            assistantId,
            assistantConfig,
        );

        return {
            assistantId: assistant.id,
            name: assistant.name,
            updatedAt: assistant.updatedAt,
        };
    }

    /**
     * List recent calls
     */
    async listCalls(params: {
        limit?: number;
    }): Promise<Record<string, unknown>> {
        const client = this.getClient();

        this.logger.log(`Listing Vapi calls (limit: ${params.limit || 10})`);

        const calls = await (client.calls as any).list({
            limit: params.limit || 10,
        });

        const callList = Array.isArray(calls) ? calls : calls?.data || [];

        return {
            calls: callList.map((call: any) => ({
                id: call.id,
                status: call.status,
                createdAt: call.createdAt,
                endedAt: call.endedAt,
                duration: call.duration,
            })),
            count: callList.length,
        };
    }
}
