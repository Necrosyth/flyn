import { Injectable, Logger } from '@nestjs/common';
import { BaseConnector } from './base.connector';
import {
  ChannelConfig,
  ChannelCredentials,
  ChannelConnection,
  IncomingMessage,
  OutgoingMessage,
  ConnectionTestResult,
  ChannelSetupResult,
} from '../types/channel.types';

/**
 * VapiConnector
 *
 * Stores and validates a tenant's own Vapi credentials:
 *   - vapiApiKey       (server/private key — used for outbound calls via Vapi API)
 *   - vapiPublicKey    (public key — returned to browser for Vapi Web SDK)
 *   - vapiPhoneNumberId (Vapi phone number resource ID for outbound PSTN calls)
 *   - vapiAssistantId  (default assistant for web/outbound calls)
 *
 * The connector validates the API key against the Vapi /assistants endpoint.
 * No webhook registration is needed — Vapi posts to your server via its own
 * server URL setting on the assistant.
 */
@Injectable()
export class VapiConnector implements BaseConnector {
  private readonly logger = new Logger(VapiConnector.name);
  private readonly VAPI_BASE = 'https://api.vapi.ai';

  // ─── BaseConnector ────────────────────────────────────────────────────────

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    const { vapiApiKey } = config.credentials;

    if (!vapiApiKey) {
      return { success: false, error: 'Vapi API Key is required.' };
    }

    try {
      const res = await fetch(`${this.VAPI_BASE}/assistant?limit=1`, {
        headers: { Authorization: `Bearer ${vapiApiKey}` },
      });

      if (res.status === 401) {
        return { success: false, error: 'Invalid Vapi API key.' };
      }

      if (!res.ok) {
        return { success: false, error: `Vapi returned HTTP ${res.status}` };
      }

      this.logger.log('Vapi API key validated successfully.');
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async setupChannel(config: ChannelConfig, _webhookUrl: string): Promise<ChannelSetupResult> {
    // No webhook to register — Vapi server URL is set on the assistant level.
    // Just return a synthetic channel ID.
    const { vapiApiKey } = config.credentials;
    if (!vapiApiKey) {
      return { success: false, error: 'Vapi API Key is required.' };
    }
    const channelId = `vapi-${Date.now()}`;
    return { success: true, channelId };
  }

  async cleanupChannel(_channel: ChannelConnection, _credentials: ChannelCredentials): Promise<void> {
    // Nothing to clean up on Vapi side
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    // Vapi posts call events — this would parse a call-end or message event
    return {
      id: payload.call?.id ?? String(Date.now()),
      channelExternalId: payload.call?.phoneNumberId ?? '',
      sender: {
        id: payload.call?.customer?.number ?? '',
        phone: payload.call?.customer?.number,
      },
      content: {
        type: 'text',
        text: payload.transcript ?? payload.message?.content ?? '',
      },
      timestamp: Date.now(),
      metadata: payload,
    };
  }

  async verifyWebhook(_payload: any, _signature: string): Promise<boolean> {
    return true;
  }

  async sendMessage(
    _channel: ChannelConnection,
    credentials: ChannelCredentials,
    message: OutgoingMessage,
  ): Promise<void> {
    // Vapi is voice-first; sending a text "message" means initiating a call.
    const { vapiApiKey, vapiPhoneNumberId, vapiAssistantId } = credentials;

    if (!vapiApiKey || !vapiPhoneNumberId || !vapiAssistantId) {
      throw new Error('vapiApiKey, vapiPhoneNumberId, and vapiAssistantId are required to initiate a Vapi call.');
    }

    const res = await fetch(`${this.VAPI_BASE}/call`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: vapiPhoneNumberId,
        customer: { number: message.recipientId },
        assistantId: vapiAssistantId,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(err?.message ?? `Vapi call failed: HTTP ${res.status}`);
    }

    this.logger.log(`Vapi call initiated to ${message.recipientId}`);
  }

  /**
   * Initiate an outbound voice call using tenant's own Vapi credentials.
   */
  async makeCall(
    credentials: ChannelCredentials,
    to: string,
    assistantId?: string,
  ): Promise<{ callId: string; status: string }> {
    const { vapiApiKey, vapiPhoneNumberId, vapiAssistantId } = credentials;

    const apiKey = vapiApiKey;
    const phoneNumberId = vapiPhoneNumberId;
    const aid = assistantId ?? vapiAssistantId;

    if (!apiKey || !phoneNumberId || !aid) {
      throw new Error('vapiApiKey, vapiPhoneNumberId, and vapiAssistantId are required.');
    }

    const res = await fetch(`${this.VAPI_BASE}/call`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId,
        customer: { number: to },
        assistantId: aid,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(err?.message ?? `Vapi call failed: HTTP ${res.status}`);
    }

    const data = await res.json() as any;
    return { callId: data.id, status: data.status ?? 'queued' };
  }
}
