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
export class TelegramConnector implements BaseConnector {
  private readonly logger = new Logger(TelegramConnector.name);
  private readonly telegramApiBaseUrl = 'https://api.telegram.org/bot';

  constructor(private readonly httpService: HttpService) {}

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    try {
      const { telegramBotToken } = config.credentials;

      if (!telegramBotToken) {
        return {
          success: false,
          error: 'Missing bot token',
        };
      }

      // Test by calling getMe endpoint
      const response = await firstValueFrom(
        this.httpService.get(`${this.telegramApiBaseUrl}${telegramBotToken}/getMe`),
      );

      if (response.data.ok) {
        return {
          success: true,
          details: {
            botName: response.data.result.username,
            botId: response.data.result.id,
          },
        };
      }

      return {
        success: false,
        error: 'Invalid bot token',
      };
    } catch (error: any) {
      this.logger.error(`Telegram connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.description || error.message,
      };
    }
  }

  async setupChannel(
    config: ChannelConfig,
    webhookUrl: string,
  ): Promise<ChannelSetupResult> {
    try {
      const { telegramBotToken } = config.credentials;

      if (!telegramBotToken) {
        return {
          success: false,
          error: 'Missing bot token',
        };
      }

      // Set webhook with Telegram
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.telegramApiBaseUrl}${telegramBotToken}/setWebhook`,
          {
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query', 'edited_message'],
          },
        ),
      );

      if (response.data.ok) {
        this.logger.log('Telegram webhook configured successfully');
        return {
          success: true,
          channelId: telegramBotToken.split(':')[0], // Bot ID is before the colon
        };
      }

      return {
        success: false,
        error: response.data.description || 'Failed to set webhook',
      };
    } catch (error: any) {
      this.logger.error(`Telegram setup failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.description || error.message,
      };
    }
  }

  async cleanupChannel(
    channel: ChannelConnection,
    credentials: ChannelCredentials,
  ): Promise<void> {
    try {
      const { telegramBotToken } = credentials;

      if (!telegramBotToken) {
        this.logger.warn('Missing bot token for cleanup');
        return;
      }

      // Delete webhook
      await firstValueFrom(
        this.httpService.post(
          `${this.telegramApiBaseUrl}${telegramBotToken}/deleteWebhook`,
        ),
      );

      this.logger.log('Telegram webhook deleted');
    } catch (error: any) {
      this.logger.error(`Telegram cleanup failed: ${error.message}`);
    }
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    try {
      // Telegram webhook payload structure
      const message = payload.message || payload.edited_message || payload.callback_query?.message;

      if (!message) {
        throw new Error('No message found in payload');
      }

      const chat = message.chat;
      const from = message.from;

      // Build content based on message type
      const content = this.parseMessageContent(message);

      return {
        id: String(message.message_id),
        channelExternalId: String(chat.id),
        sender: {
          id: String(from.id),
          name: `${from.first_name || ''} ${from.last_name || ''}`.trim(),
          username: from.username,
        },
        content,
        timestamp: message.date * 1000,
        metadata: {
          chatType: chat.type,
          rawPayload: payload,
        },
      };
    } catch (error: any) {
      this.logger.error(`Failed to parse Telegram message: ${error.message}`);
      throw error;
    }
  }

  async verifyWebhook(payload: any, signature: string): Promise<boolean> {
    // Telegram doesn't use signatures for webhook verification
    // It uses a secret token if configured during setWebhook
    return true;
  }

  async sendMessage(
    channel: ChannelConnection,
    credentials: ChannelCredentials,
    message: OutgoingMessage,
  ): Promise<void> {
    try {
      const { telegramBotToken } = credentials;

      if (!telegramBotToken) {
        throw new Error('Missing bot token');
      }

      const chatId = message.recipientId;
      const payload = this.buildOutgoingPayload(message);

      await firstValueFrom(
        this.httpService.post(
          `${this.telegramApiBaseUrl}${telegramBotToken}/sendMessage`,
          {
            chat_id: chatId,
            ...payload,
          },
        ),
      );

      this.logger.log(`Telegram message sent to chat ${chatId}`);
    } catch (error: any) {
      this.logger.error(`Failed to send Telegram message: ${error.message}`);
      throw error;
    }
  }

  private parseMessageContent(message: any): IncomingMessage['content'] {
    // Check for different message types
    if (message.text) {
      return {
        type: 'text',
        text: message.text,
      };
    }

    if (message.photo) {
      const largestPhoto = message.photo[message.photo.length - 1];
      return {
        type: 'image',
        mediaUrl: largestPhoto.file_id,
        caption: message.caption,
      };
    }

    if (message.video) {
      return {
        type: 'video',
        mediaUrl: message.video.file_id,
        caption: message.caption,
      };
    }

    if (message.voice) {
      return {
        type: 'audio',
        mediaUrl: message.voice.file_id,
      };
    }

    if (message.audio) {
      return {
        type: 'audio',
        mediaUrl: message.audio.file_id,
      };
    }

    if (message.document) {
      return {
        type: 'file',
        mediaUrl: message.document.file_id,
        filename: message.document.file_name,
        mimeType: message.document.mime_type,
        caption: message.caption,
      };
    }

    if (message.location) {
      return {
        type: 'location',
        location: {
          latitude: message.location.latitude,
          longitude: message.location.longitude,
        },
      };
    }

    return {
      type: 'text',
      text: '[Unsupported message type]',
    };
  }

  private buildOutgoingPayload(message: OutgoingMessage): any {
    const { content } = message;

    switch (content.type) {
      case 'text':
        return {
          text: content.text,
          parse_mode: 'HTML',
        };

      default:
        return {
          text: content.text || '[Media message - not supported yet]',
          parse_mode: 'HTML',
        };
    }
  }
}
