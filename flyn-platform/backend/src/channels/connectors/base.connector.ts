import { ChannelConfig, ChannelCredentials, ChannelConnection, IncomingMessage, OutgoingMessage, ConnectionTestResult, ChannelSetupResult } from '../types/channel.types';

export interface BaseConnector {
  /**
   * Test if the provided credentials are valid
   */
  testConnection(config: ChannelConfig): Promise<ConnectionTestResult>;

  /**
   * Set up the channel with the external service
   * Configure webhooks, etc.
   */
  setupChannel(config: ChannelConfig, webhookUrl: string): Promise<ChannelSetupResult>;

  /**
   * Clean up channel configuration when disconnecting
   */
  cleanupChannel(channel: ChannelConnection, credentials: ChannelCredentials): Promise<void>;

  /**
   * Parse an incoming webhook payload from the channel
   */
  parseIncomingMessage(payload: any): Promise<IncomingMessage>;

  /**
   * Verify webhook signature (if supported)
   */
  verifyWebhook(payload: any, signature: string): Promise<boolean>;

  /**
   * Send an outgoing message to the channel.
   * May return channel-specific metadata (e.g. messageId for status tracking).
   */
  sendMessage(
    channel: ChannelConnection,
    credentials: ChannelCredentials,
    message: OutgoingMessage,
  ): Promise<void | { messageId?: string; trackingToken?: string }>;
}
