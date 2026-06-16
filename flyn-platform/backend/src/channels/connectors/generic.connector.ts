import { Injectable } from '@nestjs/common';
import {
  ChannelConfig,
  ChannelCredentials,
  ChannelConnection,
  IncomingMessage,
  OutgoingMessage,
  ConnectionTestResult,
  ChannelSetupResult,
} from '../types/channel.types';
import { BaseConnector } from './base.connector';

@Injectable()
export class GenericConnector implements BaseConnector {
  async testConnection(_config: ChannelConfig): Promise<ConnectionTestResult> {
    return { success: true };
  }

  async setupChannel(_config: ChannelConfig, _webhookUrl: string): Promise<ChannelSetupResult> {
    return {
      success: true,
      channelId: `generic_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  async cleanupChannel(_channel: ChannelConnection, _credentials: ChannelCredentials): Promise<void> {
    return;
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    return {
      id: payload?.id || `msg_${Date.now()}`,
      channelExternalId: payload?.channelExternalId || payload?.channel_id || 'unknown',
      sender: {
        id: payload?.sender?.id || payload?.from?.id || 'unknown',
        name: payload?.sender?.name || payload?.from?.name,
        username: payload?.sender?.username || payload?.from?.username,
        phone: payload?.sender?.phone || payload?.from?.phone,
        email: payload?.sender?.email || payload?.from?.email,
        avatar: payload?.sender?.avatar || payload?.from?.avatar,
      },
      content: {
        type: 'text',
        text: payload?.text || payload?.content || JSON.stringify(payload ?? {}),
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
    _credentials: ChannelCredentials,
    _message: OutgoingMessage,
  ): Promise<void> {
    return;
  }
}
