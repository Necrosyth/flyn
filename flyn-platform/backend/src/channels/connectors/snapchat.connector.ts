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
export class SnapchatConnector implements BaseConnector {
  private readonly logger = new Logger(SnapchatConnector.name);
  private readonly BASE_URL = 'https://adsapi.snapchat.com/v1';

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    const { accessToken } = config.credentials;
    if (!accessToken) return { success: false, error: 'Snapchat Access Token is required.' };

    try {
      const res = await fetch(`${this.BASE_URL}/me`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      const data = await res.json() as any;
      if (!res.ok) return { success: false, error: data.message || 'Snapchat API error' };
      return { success: true, details: data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setupChannel(config: ChannelConfig, _webhookUrl: string): Promise<ChannelSetupResult> {
    const { accessToken } = config.credentials;
    try {
      const res = await fetch(`${this.BASE_URL}/me`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      const data = await res.json() as any;
      return { 
        success: res.ok, 
        channelId: data.me?.id || `snap_${Date.now()}` 
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async cleanupChannel(_channel: ChannelConnection, _credentials: ChannelCredentials): Promise<void> {
    // Snapchat cleanup if needed
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    return {
      id: payload.id || `snap_${Date.now()}`,
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
    if (!accessToken) throw new Error('Missing Snapchat access token.');

    // This is a placeholder for the actual Snapchat Business Messaging API endpoint
    const res = await fetch(`${this.BASE_URL}/messages`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient_id: message.recipientId,
        body: message.content.text,
      }),
    });

    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.message || 'Snapchat send failed');
    return { messageId: data.id || '' };
  }
}
