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

export enum ChannelStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  PENDING = 'pending',
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
  clientId?: string;
  clientSecret?: string;

  // Email (SMTP/IMAP)
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  imapHost?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;

  // Twilio
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;  // E.164 format e.g. +14155552671

  // Vapi
  vapiApiKey?: string;        // Server / private key (never sent to browser)
  vapiPublicKey?: string;     // Public key for Vapi Web SDK
  vapiPhoneNumberId?: string; // Vapi phone number ID for outbound calls
  vapiAssistantId?: string;   // Default assistant ID

  // Generic
  [key: string]: any;
}

export interface ChannelConfig {
  name?: string;
  credentials: ChannelCredentials;
  webhookUrl?: string;
  settings?: {
    autoReply?: boolean;
    welcomeMessage?: string;
    workingHours?: {
      enabled: boolean;
      timezone: string;
      schedule: {
        day: string;
        start: string;
        end: string;
      }[];
    };
  };
}

export interface ChannelConnection {
  id: string;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  tenantId: string;
  chatwootAccountId: string;
  chatwootInboxId: string;
  externalChannelId?: string;
  webhookUrl: string;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  lastErrorAt?: number;
}

export interface IncomingMessage {
  id: string;
  channelExternalId: string;
  sender: {
    id: string;
    name?: string;
    username?: string;
    phone?: string;
    email?: string;
    avatar?: string;
  };
  content: {
    type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'template';
    text?: string;
    mediaUrl?: string;
    mimeType?: string;
    filename?: string;
    caption?: string;
    location?: {
      latitude: number;
      longitude: number;
      address?: string;
    };
    template?: {
      name: string;
      language: string;
      components?: any[];
    };
  };
  timestamp: number;
  metadata?: any;
}

export interface OutgoingMessage {
  id: string;
  recipientId: string;
  content: {
    type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'template' | 'interactive_buttons' | 'interactive_list';
    text?: string;
    mediaUrl?: string;
    mimeType?: string;
    filename?: string;
    caption?: string;
    template?: {
      name: string;
      language: string;
      components?: any[];
    };
    interactive?: {
      header?: string;
      body: string;
      footer?: string;
      buttons?: Array<{ label: string; type: string; value?: string }>;
      buttonLabel?: string;
      sections?: any[];
    };
  };
  /** Pre-rendered HTML body (email only). When set, the connector sends it verbatim
   *  instead of wrapping content.text. */
  html?: string;
  replyToMessageId?: string;
  /** Email branding (email only). Display name shown over the connected mailbox address
   *  (the envelope sender is unchanged → DKIM stays aligned) and the Reply-To address. */
  fromName?: string;
  replyTo?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  details?: any;
}

export interface ChannelSetupResult {
  success: boolean;
  channelId?: string;
  error?: string;
  webhookVerifyToken?: string;
}
