// Chatwoot-compatible types for the Unified Inbox

export type ConversationStatus = 'open' | 'pending' | 'resolved' | 'snoozed';

export type ChannelType =
  | 'whatsapp'
  | 'email'
  | 'facebook'
  | 'instagram'
  | 'telegram'
  | 'slack'
  | 'slack_connect'
  | 'sms'
  | 'mms'
  | 'voice'
  | 'web'
  | 'webchat'
  | 'teams'
  | 'apple_business_chat'
  | 'google_business_messages'
  | 'twitter'
  | 'tiktok'
  | 'linkedin';

export type MessageType = 'incoming' | 'outgoing' | 'activity';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  status: 'active' | 'pending' | 'closed';
  unreadCount?: number;
}

export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  tags?: string[];
  customAttributes?: Record<string, string>;
}

export interface Message {
  id: string;
  content: string;
  messageType: MessageType;
  createdAt: Date;
  sender?: Contact;
  attachments?: Attachment[];
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  emailSubject?: string;
  emailHtml?: string;
  emailText?: string;
  emailCc?: string[];
  emailBcc?: string[];
  audioUrl?: string;
  transcript?: string;
}

export interface Attachment {
  id: string;
  fileType: string;
  url: string;
  fileName?: string;
  size?: number;
  /** S3 key — resolved to a short-lived presigned GET URL on download (email attachments). */
  s3Key?: string;
}

export interface Conversation {
  id: string;
  inboxId: string;
  contact: Contact;
  messages: Message[];
  status: ConversationStatus;
  channel: ChannelType;
  lastMessage?: Message;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
  assignee?: {
    id: string;
    name: string;
    avatar?: string;
  };
  labels?: string[];
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  /** Tenant mailbox this conversation belongs to (email). Drives the switcher + attribution chip. */
  mailboxId?: string;
}

export interface QuickReply {
  id: string;
  text: string;
}

// Chatwoot API types
export interface ChatwootConfig {
  baseUrl: string;
  accountId: string;
  apiAccessToken: string;
}

export interface ChatwootConversationResponse {
  id: number;
  inbox_id: number;
  contact: {
    id: number;
    name: string;
    email: string;
    phone_number: string;
    thumbnail: string;
    custom_attributes: Record<string, string>;
  };
  messages: ChatwootMessageResponse[];
  status: string;
  created_at: number;
  updated_at: number;
  unread_count: number;
  meta: {
    sender: {
      name: string;
      email: string;
      phone_number: string;
      thumbnail: string;
    };
    channel: string;
  };
}

export interface ChatwootMessageResponse {
  id: number;
  content: string;
  message_type: number;
  created_at: number;
  sender: {
    id: number;
    name: string;
    thumbnail: string;
  };
  attachments: {
    id: number;
    file_type: string;
    data_url: string;
  }[];
}
