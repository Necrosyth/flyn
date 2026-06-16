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
 * Instagram DM connector via the Instagram Graph API.
 * Requires a Facebook Page Access Token for a page with a linked Instagram Business Account.
 */
@Injectable()
export class InstagramConnector implements BaseConnector {
  private readonly logger = new Logger(InstagramConnector.name);
  private readonly GRAPH = 'https://graph.facebook.com/v18.0';

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    const { accessToken } = config.credentials;
    if (!accessToken) return { success: false, error: 'Page Access Token is required.' };

    try {
      const res = await fetch(
        `${this.GRAPH}/me?access_token=${accessToken}&fields=id,name,instagram_business_account`,
      );
      const data = await res.json() as any;
      if (!res.ok) return { success: false, error: data?.error?.message ?? `Graph API ${res.status}` };
      if (!data.instagram_business_account) {
        return { success: false, error: 'No Instagram Business Account linked to this Facebook Page.' };
      }
      return {
        success: true,
        details: { pageId: data.id, instagramId: data.instagram_business_account.id, pageName: data.name },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setupChannel(config: ChannelConfig, _webhookUrl: string): Promise<ChannelSetupResult> {
    const { accessToken } = config.credentials;
    if (!accessToken) return { success: false, error: 'Access Token is required.' };

    try {
      const res = await fetch(
        `${this.GRAPH}/me?access_token=${accessToken}&fields=id,instagram_business_account`,
      );
      const data = await res.json() as any;
      const pageId = data.id;
      const igId = data.instagram_business_account?.id;

      // Subscribe to instagram_manage_messages (best-effort)
      await fetch(`${this.GRAPH}/${pageId}/subscribed_apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          subscribed_fields: 'messages,messaging_postbacks,instagram_manage_messages',
        }),
      }).catch((e) => this.logger.warn(`IG subscribe best-effort failed: ${e.message}`));

      return { success: true, channelId: igId || pageId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async cleanupChannel(_channel: ChannelConnection, _credentials: ChannelCredentials): Promise<void> {}

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    const entry = payload.entry?.[0];
    const messaging = entry?.messaging?.[0];
    const msg = messaging?.message;
    return {
      id: msg?.mid || `ig_${Date.now()}`,
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
    if (!accessToken) throw new Error('Missing Instagram access token.');

    const res = await fetch(`${this.GRAPH}/me/messages?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: message.recipientId },
        message: { text: message.content.text },
      }),
    });

    const data = await res.json() as any;
    if (!res.ok) throw new Error(data?.error?.message ?? `Instagram send failed HTTP ${res.status}`);
    return { messageId: data.message_id || '' };
  }
}
