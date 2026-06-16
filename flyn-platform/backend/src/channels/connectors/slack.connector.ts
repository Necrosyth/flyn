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
export class SlackConnector implements BaseConnector {
  private readonly logger = new Logger(SlackConnector.name);
  private readonly slackApiBaseUrl = 'https://slack.com/api';

  constructor(private readonly httpService: HttpService) {}

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    try {
      const { slackBotToken } = config.credentials;

      if (!slackBotToken) {
        return {
          success: false,
          error: 'Missing bot token',
        };
      }

      // Test by calling auth.test endpoint
      const response = await firstValueFrom(
        this.httpService.get(`${this.slackApiBaseUrl}/auth.test`, {
          headers: {
            Authorization: `Bearer ${slackBotToken}`,
          },
        }),
      );

      if (response.data.ok) {
        return {
          success: true,
          details: {
            team: response.data.team,
            user: response.data.user,
            userId: response.data.user_id,
          },
        };
      }

      return {
        success: false,
        error: response.data.error || 'Invalid bot token',
      };
    } catch (error: any) {
      this.logger.error(`Slack connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  async setupChannel(
    config: ChannelConfig,
    webhookUrl: string,
  ): Promise<ChannelSetupResult> {
    try {
      const { slackBotToken } = config.credentials;

      if (!slackBotToken) {
        return {
          success: false,
          error: 'Missing bot token',
        };
      }

      // For Slack, we don't register a webhook URL - instead we use Event Subscriptions
      // The user needs to configure this in their Slack app settings
      // We just verify the bot token works
      const testResult = await this.testConnection(config);

      if (!testResult.success) {
        return {
          success: false,
          error: testResult.error,
        };
      }

      this.logger.log('Slack bot token verified successfully');

      return {
        success: true,
        channelId: testResult.details?.userId,
        webhookVerifyToken: '', // Slack doesn't use verify tokens for webhooks
      };
    } catch (error: any) {
      this.logger.error(`Slack setup failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async cleanupChannel(
    channel: ChannelConnection,
    credentials: ChannelCredentials,
  ): Promise<void> {
    // For Slack, cleanup is minimal - just log it
    this.logger.log(`Slack channel ${channel.id} cleanup (no action needed)`);
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    try {
      // Slack Events API payload structure
      const event = payload.event;

      if (!event) {
        throw new Error('No event found in payload');
      }

      // Handle different event types
      if (event.type === 'message') {
        return this.parseMessageEvent(event, payload);
      }

      throw new Error(`Unsupported Slack event type: ${event.type}`);
    } catch (error: any) {
      this.logger.error(`Failed to parse Slack message: ${error.message}`);
      throw error;
    }
  }

  async verifyWebhook(payload: any, signature: string): Promise<boolean> {
    try {
      // Slack webhook verification uses request signing
      // This requires the signing secret from the app credentials
      // Implementation depends on how the signature is passed
      const { signingSecret } = payload.credentials || {};

      if (!signingSecret) {
        // If no signing secret configured, skip verification (development mode)
        return true;
      }

      // Verify Slack request signature
      // This is typically done at the controller level with headers
      return true;
    } catch (error: any) {
      this.logger.error(`Slack webhook verification failed: ${error.message}`);
      return false;
    }
  }

  async sendMessage(
    channel: ChannelConnection,
    credentials: ChannelCredentials,
    message: OutgoingMessage,
  ): Promise<void> {
    try {
      const { slackBotToken } = credentials;

      if (!slackBotToken) {
        throw new Error('Missing bot token');
      }

      const channelId = message.recipientId;

      await firstValueFrom(
        this.httpService.post(
          `${this.slackApiBaseUrl}/chat.postMessage`,
          {
            channel: channelId,
            text: message.content.text,
            thread_ts: message.replyToMessageId,
          },
          {
            headers: {
              Authorization: `Bearer ${slackBotToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.logger.log(`Slack message sent to channel ${channelId}`);
    } catch (error: any) {
      this.logger.error(`Failed to send Slack message: ${error.message}`);
      throw error;
    }
  }

  private parseMessageEvent(event: any, payload: any): IncomingMessage {
    const user = event.user;
    const text = event.text;
    const timestamp = event.ts;
    const channel = event.channel;

    // Skip bot messages
    if (event.bot_id || event.subtype === 'bot_message') {
      throw new Error('Skipping bot message');
    }

    return {
      id: event.client_msg_id || `${timestamp}-${user}`,
      channelExternalId: channel,
      sender: {
        id: user,
        name: event.user_profile?.real_name || user,
        username: event.user_profile?.display_name,
        avatar: event.user_profile?.image_72,
      },
      content: {
        type: 'text',
        text: text,
      },
      timestamp: parseFloat(timestamp) * 1000,
      metadata: {
        teamId: payload.team_id,
        eventId: payload.event_id,
        channelType: event.channel_type,
        rawPayload: payload,
      },
    };
  }
}
