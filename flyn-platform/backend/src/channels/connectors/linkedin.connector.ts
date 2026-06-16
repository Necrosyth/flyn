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
export class LinkedInConnector implements BaseConnector {
  private readonly logger = new Logger(LinkedInConnector.name);
  private readonly BASE_URL = 'https://api.linkedin.com/v2';

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    const { accessToken } = config.credentials;
    if (!accessToken) return { success: false, error: 'LinkedIn Access Token is required.' };

    try {
      const res = await fetch(`${this.BASE_URL}/me`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      const data = await res.json() as any;
      if (!res.ok) return { success: false, error: data.message || 'LinkedIn API error' };
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
        channelId: data.id || `linkedin_${Date.now()}` 
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async cleanupChannel(_channel: ChannelConnection, _credentials: ChannelCredentials): Promise<void> {
    // LinkedIn cleanup if needed
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    return {
      id: payload.id || `li_${Date.now()}`,
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
    if (!accessToken) throw new Error('Missing LinkedIn access token.');

    // LinkedIn messaging API is quite specific, this is a placeholder for the actual endpoint
    const res = await fetch(`${this.BASE_URL}/messages`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipients: [message.recipientId],
        subject: 'New message',
        body: message.content.text,
      }),
    });

    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.message || 'LinkedIn send failed');
    return { messageId: data.id || '' };
  }
}
