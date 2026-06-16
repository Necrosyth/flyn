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

@Injectable()
export class TikTokConnector implements BaseConnector {
  private readonly logger = new Logger(TikTokConnector.name);
  private readonly BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    const { accessToken } = config.credentials;
    if (!accessToken) return { success: false, error: 'TikTok Access Token is required.' };

    try {
      const res = await fetch(`${this.BASE_URL}/business/info/get/`, {
        headers: { 'Access-Token': accessToken },
      });
      const data = await res.json() as any;
      if (data.code !== 0) return { success: false, error: data.message || 'TikTok API error' };
      return { success: true, details: data.data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setupChannel(config: ChannelConfig, _webhookUrl: string): Promise<ChannelSetupResult> {
    const { accessToken } = config.credentials;
    try {
      const res = await fetch(`${this.BASE_URL}/business/info/get/`, {
        headers: { 'Access-Token': accessToken },
      });
      const data = await res.json() as any;
      return { 
        success: data.code === 0, 
        channelId: data.data?.business_id || `tiktok_${Date.now()}` 
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async cleanupChannel(_channel: ChannelConnection, _credentials: ChannelCredentials): Promise<void> {
    // TikTok cleanup if needed
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    return {
      id: payload.message_id || `tt_${Date.now()}`,
      channelExternalId: payload.recipient_id,
      sender: { id: payload.sender_id },
      content: { type: 'text', text: payload.content || '' },
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
  ): Promise<{ messageId: string }> {
    const { accessToken } = credentials;
    if (!accessToken) throw new Error('Missing TikTok access token.');

    const res = await fetch(`${this.BASE_URL}/business/message/send/`, {
      method: 'POST',
      headers: { 
        'Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient_id: message.recipientId,
        message_type: 'text',
        content: message.content.text,
      }),
    });

    const data = await res.json() as any;
    if (data.code !== 0) throw new Error(data.message || 'TikTok send failed');
    return { messageId: data.data?.message_id || '' };
  }
}
