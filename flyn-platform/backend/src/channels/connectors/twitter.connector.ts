import { Injectable, Logger } from '@nestjs/common';
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
export class TwitterConnector implements BaseConnector {
  private readonly logger = new Logger(TwitterConnector.name);
  private readonly API_BASE = 'https://api.twitter.com/2';

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    const { accessToken } = config.credentials;
    if (!accessToken) {
      return { success: false, error: 'X (Twitter) access token is required.' };
    }

    try {
      const res = await fetch(
        `${this.API_BASE}/users/me?user.fields=name,username,profile_image_url`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const body = (await res.json()) as any;

      if (!res.ok) {
        return {
          success: false,
          error: body.detail ?? body.title ?? `Twitter API error (${res.status})`,
        };
      }

      return { success: true, details: body.data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setupChannel(config: ChannelConfig, _webhookUrl: string): Promise<ChannelSetupResult> {
    const { accessToken } = config.credentials;

    try {
      const res = await fetch(`${this.API_BASE}/users/me?user.fields=name,username`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = (await res.json()) as any;

      if (!res.ok) {
        return { success: false, error: body.detail ?? 'Twitter setup failed' };
      }

      const user = body.data;
      return {
        success: true,
        channelId: user?.id ?? `twitter_${Date.now()}`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async cleanupChannel(
    _channel: ChannelConnection,
    _credentials: ChannelCredentials,
  ): Promise<void> {
    // Twitter OAuth 2.0 tokens expire naturally; no server-side revocation needed here.
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    // Twitter Account Activity API v2 DM webhook format
    const dmEvent = payload?.direct_message_events?.[0];
    const senderId: string = dmEvent?.message_create?.sender_id ?? '';
    const senderUser = payload?.users?.[senderId];

    return {
      id: dmEvent?.id ?? `tw_${Date.now()}`,
      channelExternalId: payload?.for_user_id ?? '',
      sender: {
        id: senderId,
        name: senderUser?.name ?? senderId,
        username: senderUser?.screen_name,
      },
      content: {
        type: 'text',
        text: dmEvent?.message_create?.message_data?.text ?? '',
      },
      timestamp: dmEvent?.created_timestamp
        ? Number(dmEvent.created_timestamp)
        : Date.now(),
      metadata: payload,
    };
  }

  async verifyWebhook(payload: any, signature: string): Promise<boolean> {
    const consumerSecret = process.env.TWITTER_CLIENT_SECRET;
    if (!consumerSecret || !signature) return true;

    try {
      const hmac = crypto.createHmac('sha256', consumerSecret);
      hmac.update(JSON.stringify(payload));
      const expected = `sha256=${hmac.digest('base64')}`;
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected),
      );
    } catch {
      return false;
    }
  }

  async sendMessage(
    _channel: ChannelConnection,
    credentials: ChannelCredentials,
    message: OutgoingMessage,
  ): Promise<{ messageId: string }> {
    const { accessToken } = credentials;
    if (!accessToken) throw new Error('Missing X (Twitter) access token.');

    // Twitter API v2: POST /2/dm_conversations/with/:participantId/messages
    const res = await fetch(
      `${this.API_BASE}/dm_conversations/with/${message.recipientId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: message.content.text }),
      },
    );

    const body = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(body.detail ?? body.title ?? 'X (Twitter) DM send failed');
    }

    return { messageId: body.data?.dm_conversation_id ?? '' };
  }
}
