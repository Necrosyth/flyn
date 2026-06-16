export enum ChannelType {
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  SLACK = 'slack',
  SLACK_CONNECT = 'slack_connect',
  EMAIL = 'email',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  SMS = 'sms',
  MMS = 'mms',
  VOICE = 'voice',
  WEBCHAT = 'webchat',
  TEAMS = 'teams',
  APPLE_BUSINESS_CHAT = 'apple_business_chat',
  GOOGLE_BUSINESS_MESSAGES = 'google_business_messages',
  TWITTER = 'twitter',
  TIKTOK = 'tiktok',
  LINKEDIN = 'linkedin',
  SNAPCHAT = 'snapchat',
  TWILIO = 'twilio',
  VAPI = 'vapi',
}

export interface ChannelCredentials {
  // WhatsApp / Meta
  accessToken?: string;
  phoneNumberId?: string;
  wabaId?: string;
  appSecret?: string;
  verifyToken?: string;

  // Telegram
  telegramBotToken?: string;

  // Slack
  slackBotToken?: string;
  signingSecret?: string;

  // Email
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;

  // Generic
  [key: string]: unknown;
}

export interface ChannelConfig {
  name: string;
  credentials: ChannelCredentials;
  settings?: {
    autoReply?: boolean;
    welcomeMessage?: string;
  };
}

export interface ChannelConnection {
  id: string;
  type: ChannelType;
  name: string;
  status: 'active' | 'inactive' | 'disconnected' | 'error';
  tenantId: string;
  chatwootInboxId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConnectChannelRequest {
  tenantId: string;
  channelType: ChannelType;
  config: ChannelConfig;
}

export interface ConnectChannelResponse {
  success: boolean;
  channelId?: string;
  inboxId?: string;
  error?: string;
}
