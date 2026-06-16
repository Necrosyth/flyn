import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
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

@Injectable()
export class WhatsAppConnector implements BaseConnector {
  private readonly logger = new Logger(WhatsAppConnector.name);
  private readonly graphApiBaseUrl = 'https://graph.facebook.com/v18.0';

  constructor(private readonly httpService: HttpService) {}

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    try {
      const { accessToken, phoneNumberId } = config.credentials;

      if (!accessToken || !phoneNumberId) {
        return {
          success: false,
          error: 'Missing accessToken or phoneNumberId',
        };
      }

      // Test by fetching phone number details
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphApiBaseUrl}/${phoneNumberId}`,
          {
            timeout: 12000,
            params: {
              access_token: accessToken,
              fields: 'id,display_phone_number,verified_name',
            },
          },
        ),
      );

      return {
        success: true,
        details: {
          phoneNumber: response.data.display_phone_number,
          verifiedName: response.data.verified_name,
        },
      };
    } catch (error: any) {
      this.logger.error(`WhatsApp connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  async setupChannel(
    config: ChannelConfig,
    webhookUrl: string,
  ): Promise<ChannelSetupResult> {
    try {
      const { accessToken, wabaId, verifyToken } = config.credentials;

      if (!accessToken || !wabaId) {
        return {
          success: false,
          error: 'Missing accessToken or wabaId',
        };
      }

      // Generate a verify token if not provided
      const generatedVerifyToken = verifyToken || this.generateVerifyToken();

      // Subscribe app to WABA webhooks (best-effort — webhook URL is configured in Meta dashboard)
      await firstValueFrom(
        this.httpService.post(
          `${this.graphApiBaseUrl}/${wabaId}/subscribed_apps`,
          {},
          {
            timeout: 10000,
            params: {
              access_token: accessToken,
            },
          },
        ),
      );

      this.logger.log(`WhatsApp webhook registered for WABA ${wabaId}`);

      return {
        success: true,
        channelId: wabaId,
        webhookVerifyToken: generatedVerifyToken,
      };
    } catch (error: any) {
      this.logger.error(`WhatsApp setup failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  async cleanupChannel(
    channel: ChannelConnection,
    credentials: ChannelCredentials,
  ): Promise<void> {
    try {
      const { accessToken, wabaId } = credentials;

      if (!accessToken || !wabaId) {
        this.logger.warn('Missing credentials for cleanup');
        return;
      }

      // Unregister webhook
      await firstValueFrom(
        this.httpService.delete(
          `${this.graphApiBaseUrl}/${wabaId}/subscribed_apps`,
          {
            params: { access_token: accessToken },
          },
        ),
      );

      this.logger.log(`WhatsApp webhook unregistered for WABA ${wabaId}`);
    } catch (error: any) {
      this.logger.error(`WhatsApp cleanup failed: ${error.message}`);
      // Don't throw - allow disconnect to proceed
    }
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    try {
      // Meta WhatsApp webhook payload structure
      const entry = payload.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      if (!message) {
        throw new Error('No message found in payload');
      }

      const contact = value?.contacts?.[0];

      // Build content based on message type
      const content = this.parseMessageContent(message);

      return {
        id: message.id,
        channelExternalId: value?.metadata?.phone_number_id,
        sender: {
          id: message.from,
          name: contact?.profile?.name,
          phone: message.from,
        },
        content,
        timestamp: parseInt(message.timestamp) * 1000,
        metadata: {
          wabaId: value?.metadata?.business_phone_number_id,
          rawPayload: payload,
        },
      };
    } catch (error: any) {
      this.logger.error(`Failed to parse WhatsApp message: ${error.message}`);
      throw error;
    }
  }

  async verifyWebhook(payload: any, signature: string): Promise<boolean> {
    try {
      // WhatsApp uses a verify token challenge, not signature verification
      // The signature check is for the initial webhook verification
      const { appSecret } = payload.credentials || {};

      if (!appSecret) {
        // If no app secret configured, skip verification (development mode)
        return true;
      }

      // Calculate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', appSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return signature === expectedSignature;
    } catch (error: any) {
      this.logger.error(`Webhook verification failed: ${error.message}`);
      return false;
    }
  }

  async sendMessage(
    channel: ChannelConnection,
    credentials: ChannelCredentials,
    message: OutgoingMessage,
  ): Promise<{ messageId: string }> {
    try {
      const { accessToken, phoneNumberId } = credentials;

      if (!accessToken || !phoneNumberId) {
        this.logger.error(`[SendMessage] Missing credentials — accessToken=${!!accessToken}, phoneNumberId=${!!phoneNumberId}, channel=${channel.id}`);
        throw new Error('Missing WhatsApp credentials (accessToken or phoneNumberId). Reconnect the channel in Settings → Channels.');
      }

      const payload = this.buildOutgoingPayload(message);

      this.logger.debug(`[SendMessage] Sending to ${message.recipientId} via phoneNumberId=${phoneNumberId}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphApiBaseUrl}/${phoneNumberId}/messages`,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: message.recipientId,
            ...payload,
          },
          {
            timeout: 15000,
            params: { access_token: accessToken },
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      // Meta returns: { messages: [{ id: "wamid.xxx" }] }
      const messageId: string = response.data?.messages?.[0]?.id || '';
      this.logger.log(`WhatsApp message sent to ${message.recipientId} (id: ${messageId})`);
      return { messageId };
    } catch (error: any) {
      // Extract Meta Graph API error details for better debugging
      const metaError = error.response?.data?.error;
      const errMsg = metaError
        ? `[Meta API ${metaError.code}] ${metaError.message} (type: ${metaError.type})`
        : error.message;
      this.logger.error(`[SendMessage] Failed to send WhatsApp to ${message.recipientId}: ${errMsg}`);
      throw error;
    }
  }

  private parseMessageContent(message: any): IncomingMessage['content'] {
    const type = message.type;

    switch (type) {
      case 'text':
        return {
          type: 'text',
          text: message.text?.body,
        };

      case 'image':
        return {
          type: 'image',
          mediaUrl: message.image?.id, // Need to fetch actual URL
          mimeType: message.image?.mime_type,
          caption: message.image?.caption,
        };

      case 'video':
        return {
          type: 'video',
          mediaUrl: message.video?.id,
          mimeType: message.video?.mime_type,
          caption: message.video?.caption,
        };

      case 'audio':
      case 'voice':
        return {
          type: 'audio',
          mediaUrl: message.audio?.id || message.voice?.id,
          mimeType: message.audio?.mime_type || message.voice?.mime_type,
        };

      case 'document':
        return {
          type: 'file',
          mediaUrl: message.document?.id,
          mimeType: message.document?.mime_type,
          filename: message.document?.filename,
          caption: message.document?.caption,
        };

      case 'location':
        return {
          type: 'location',
          location: {
            latitude: message.location?.latitude,
            longitude: message.location?.longitude,
            address: message.location?.name,
          },
        };

      default:
        return {
          type: 'text',
          text: `[Unsupported message type: ${type}]`,
        };
    }
  }

  private buildOutgoingPayload(message: OutgoingMessage): any {
    const { content } = message;

    switch (content.type) {
      case 'text':
        return {
          type: 'text',
          text: { body: content.text },
        };

      case 'template':
        return {
          type: 'template',
          template: {
            name: content.template?.name,
            language: { code: content.template?.language },
            components: content.template?.components,
          },
        };

      case 'interactive_buttons': {
        const ic = content.interactive!;
        const buttons = (ic.buttons as Array<{ label: string; type: string; value?: string }>)
          .filter(b => b.label?.trim())
          .slice(0, 3)
          .map((b, i) => {
            if (b.type === 'url') {
              return { type: 'button', reply: { id: `btn_${i}`, title: b.label } }; // WA doesn't support URL buttons in interactive — use quick_reply
            }
            return { type: 'button', reply: { id: `btn_${i}_${b.label.toLowerCase().replace(/\s+/g, '_')}`, title: b.label } };
          });
        return {
          type: 'interactive',
          interactive: {
            type: 'button',
            ...(ic.header ? { header: { type: 'text', text: ic.header } } : {}),
            body: { text: ic.body },
            ...(ic.footer ? { footer: { text: ic.footer } } : {}),
            action: { buttons },
          },
        };
      }

      case 'interactive_list': {
        const il = content.interactive!;
        return {
          type: 'interactive',
          interactive: {
            type: 'list',
            ...(il.header ? { header: { type: 'text', text: il.header } } : {}),
            body: { text: il.body },
            ...(il.footer ? { footer: { text: il.footer } } : {}),
            action: {
              button: il.buttonLabel || 'Choose an option',
              sections: il.sections || [],
            },
          },
        };
      }

      default:
        // For other types, we'd need to upload media first
        return {
          type: 'text',
          text: { body: (content as any).text || '[Media message]' },
        };
    }
  }

  private generateVerifyToken(): string {
    return `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
