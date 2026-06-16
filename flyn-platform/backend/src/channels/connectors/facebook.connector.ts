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
export class FacebookConnector implements BaseConnector {
  private readonly logger = new Logger(FacebookConnector.name);
  private readonly GRAPH = 'https://graph.facebook.com/v18.0';

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    const { accessToken } = config.credentials;
    if (!accessToken) return { success: false, error: 'Page Access Token is required.' };

    try {
      const res = await fetch(`${this.GRAPH}/me?access_token=${accessToken}&fields=id,name`);
      const data = await res.json() as any;
      if (!res.ok) return { success: false, error: data?.error?.message ?? `Facebook API ${res.status}` };
      return { success: true, details: { pageId: data.id, pageName: data.name } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setupChannel(config: ChannelConfig, _webhookUrl: string): Promise<ChannelSetupResult> {
    const { accessToken } = config.credentials;
    if (!accessToken) return { success: false, error: 'Page Access Token is required.' };

    try {
      const meRes = await fetch(`${this.GRAPH}/me?access_token=${accessToken}&fields=id`);
      const meData = await meRes.json() as any;
      if (!meData.id) return { success: false, error: 'Could not get page ID from access token.' };

      // Subscribe page to Messenger webhooks (best-effort)
      await fetch(`${this.GRAPH}/${meData.id}/subscribed_apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          subscribed_fields: 'messages,messaging_postbacks,message_deliveries,message_reads',
        }),
      }).catch((e) => this.logger.warn(`FB subscribe best-effort failed: ${e.message}`));

      return { success: true, channelId: meData.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async cleanupChannel(_channel: ChannelConnection, credentials: ChannelCredentials): Promise<void> {
    const { accessToken } = credentials;
    if (!accessToken) return;
    await fetch(`${this.GRAPH}/me/subscribed_apps?access_token=${accessToken}`, { method: 'DELETE' }).catch(() => {});
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    const entry = payload.entry?.[0];
    const messaging = entry?.messaging?.[0];
    const msg = messaging?.message;
    return {
      id: msg?.mid || `fb_${Date.now()}`,
      channelExternalId: entry?.id,
      sender: { id: messaging?.sender?.id },
      content: { type: 'text', text: msg?.text || '' },
      timestamp: messaging?.timestamp || Date.now(),
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
    if (!accessToken) throw new Error('Missing Facebook page access token.');

    const res = await fetch(`${this.GRAPH}/me/messages?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: message.recipientId },
        message: { text: message.content.text },
      }),
    });

    const data = await res.json() as any;
    if (!res.ok) throw new Error(data?.error?.message ?? `Facebook send failed HTTP ${res.status}`);
    return { messageId: data.message_id || '' };
  }
}
