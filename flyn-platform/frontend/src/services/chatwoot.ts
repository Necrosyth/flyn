import type {
  Channel,
  Conversation,
  Message,
  QuickReply,
  ChatwootConversationResponse,
  ChannelType,
  ConversationStatus,
} from '@/types/inbox';
import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const isConversationStatus = (value: string): value is ConversationStatus => {
  return value === 'open' || value === 'pending' || value === 'resolved' || value === 'snoozed';
};

const isChannelType = (value: string): value is ChannelType => {
  return (
    value === 'whatsapp' ||
    value === 'email' ||
    value === 'facebook' ||
    value === 'instagram' ||
    value === 'telegram' ||
    value === 'slack' ||
    value === 'slack_connect' ||
    value === 'sms' ||
    value === 'mms' ||
    value === 'voice' ||
    value === 'web' ||
    value === 'webchat' ||
    value === 'teams' ||
    value === 'apple_business_chat' ||
    value === 'google_business_messages' ||
    value === 'twitter' ||
    value === 'tiktok' ||
    value === 'linkedin'
  );
};

class ApiClient {
  private baseUrl = `${API_BASE_URL}/chatwoot`;
  private cachedTenantId: string | null | undefined;

  private async resolveTenantId(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    // Only use cache when we have a real tenantId — never cache null/undefined
    // so that a failed first attempt (e.g. claims not yet propagated) retries
    if (this.cachedTenantId) return this.cachedTenantId;
    try {
      const lsId = localStorage.getItem('tenantId');
      if (lsId && lsId.length >= 15 && !lsId.includes(' ')) {
        this.cachedTenantId = lsId;
        return lsId;
      }

      // Fetch the current user's own tenant (auth-scoped — never leaks other tenants)
      const resp = await authedFetch(`${API_BASE_URL}/tenants/me`);
      if (resp.ok) {
        const target = await resp.json();
        if (isRecord(target) && typeof target.id === 'string') {
          localStorage.setItem('tenantId', target.id);
          this.cachedTenantId = target.id;
          return target.id;
        }
      }
    } catch (err) {
      console.error('Failed to resolve tenantId:', err);
    }
    // Do NOT cache null — let the next call retry
    return null;
  }

  async getTenantId(): Promise<string | null> {
    return this.resolveTenantId();
  }

  async get<T>(path: string): Promise<T> {
    const tenantId = await this.resolveTenantId();
    const response = await authedFetch(`${this.baseUrl}/${path}`, {
      headers: {
        ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      },
    });
    if (!response.ok) {
      let details = response.statusText;
      try {
        const text = await response.text();
        if (text) {
          try {
            const json = JSON.parse(text) as unknown;
            if (isRecord(json)) {
              details = getString(json.message) || getString(json.error) || text;
            } else {
              details = text;
            }
          } catch {
            details = text;
          }
        }
      } catch (err) {
        void err;
      }
      throw new Error(`API call failed: ${details}`);
    }
    return response.json();
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    const tenantId = await this.resolveTenantId();
    const response = await authedFetch(`${this.baseUrl}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let details = response.statusText;
      try {
        const text = await response.text();
        if (text) {
          try {
            const json = JSON.parse(text) as unknown;
            if (isRecord(json)) {
              details = getString(json.message) || getString(json.error) || text;
            } else {
              details = text;
            }
          } catch {
            details = text;
          }
        }
      } catch (err) {
        void err;
      }
      throw new Error(`API call failed: ${details}`);
    }
    return response.json();
  }

  async delete<T>(path: string): Promise<T> {
    const tenantId = await this.resolveTenantId();
    const response = await authedFetch(`${this.baseUrl}/${path}`, {
      method: 'DELETE',
      headers: {
        ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      },
    });

    if (!response.ok) {
      let details = response.statusText;
      try {
        const text = await response.text();
        if (text) details = text;
      } catch (err) {
        void err;
      }
      throw new Error(`API call failed: ${details}`);
    }

    try {
      return (await response.json()) as T;
    } catch {
      return undefined as unknown as T;
    }
  }
}

class ChatwootDataMapper {
  static mapConversation(cwConversation: ChatwootConversationResponse): Conversation {
    const mappedMessages = (cwConversation.messages || []).map(ChatwootDataMapper.mapMessage);

    const statusRaw = typeof cwConversation.status === 'string' ? cwConversation.status : '';
    const normalizedStatus = isConversationStatus(statusRaw) ? statusRaw : 'open';

    const meta = cwConversation.meta || ({} as any);
    const sender = meta.sender || ({} as any);
    const contact = cwConversation.contact || ({} as any);

    const channelRaw = typeof meta.channel === 'string' ? meta.channel : '';
    const normalizedChannel = isChannelType(channelRaw) ? channelRaw : 'webchat';

    return {
      id: String(cwConversation.id ?? ''),
      inboxId: String(cwConversation.inbox_id ?? ''),
      contact: {
        id: String(contact.id ?? sender.id ?? ''),
        name: sender.name || contact.name || 'Unknown',
        email: sender.email || contact.email,
        phone: sender.phone_number || contact.phone_number,
        avatar: sender.thumbnail || contact.thumbnail,
      },
      messages: mappedMessages,
      status: normalizedStatus,
      channel: normalizedChannel,
      lastMessage: mappedMessages.length ? mappedMessages[mappedMessages.length - 1] : undefined,
      unreadCount: cwConversation.unread_count ?? 0,
      createdAt: new Date((cwConversation.created_at || 0) * 1000),
      updatedAt: new Date((cwConversation.updated_at || 0) * 1000),
    };
  }

  static mapMessage(cwMessage: unknown): Message {
    const msg = isRecord(cwMessage) ? cwMessage : {};

    const rawAttachments = isRecord(msg) ? msg.attachments : undefined;
    const attachmentsArray = Array.isArray(rawAttachments) ? rawAttachments : [];
    const attachments = attachmentsArray.length
      ? attachmentsArray.map((a: unknown) => {
          const att = isRecord(a) ? a : {};
          const id =
            typeof att.id === 'string'
              ? att.id
              : typeof att.id === 'number'
                ? String(att.id)
                : '';
          const fileType =
            getString(att.file_type) || getString(att.fileType) || 'unknown';
          const url =
            getString(att.data_url) ||
            getString(att.url) ||
            getString(att.file_url) ||
            '';
          const fileName = getString(att.file_name) || getString(att.filename);
          return {
            id,
            fileType,
            url,
            fileName,
          };
        })
      : undefined;

    const attrsRaw = msg.content_attributes || msg.contentAttributes;
    const attrs = isRecord(attrsRaw) ? attrsRaw : {};

    const emailRaw = attrs.email;
    const email = isRecord(emailRaw) ? emailRaw : {};

    const statusRaw =
      msg.status ||
      attrs?.status ||
      attrs?.message_status ||
      attrs?.delivery_status ||
      attrs?.deliveryStatus;

    const normalizedStatus =
      statusRaw === 'sent' || statusRaw === 'delivered' || statusRaw === 'read' || statusRaw === 'failed'
        ? statusRaw
        : undefined;

    const emailSubject =
      attrs?.email_subject ||
      attrs?.emailSubject ||
      email.subject ||
      email.Subject;

    const emailText =
      attrs?.email_text ||
      attrs?.emailText ||
      email.text ||
      email.body_text;

    const emailHtml =
      attrs?.email_html ||
      attrs?.emailHtml ||
      email.html ||
      email.body_html;

    const transcript = attrs?.transcript || attrs?.call_transcript || attrs?.callTranscript;

    const audioUrlFromAttachments = attachments?.find((a) =>
      String(a.fileType || '').toLowerCase().includes('audio'),
    )?.url;

    return {
      id: typeof msg.id === 'number' ? String(msg.id) : String(msg.id || ''),
      content: getString(msg.content) || '',
      messageType: msg.message_type === 0 ? 'incoming' : 'outgoing',
      createdAt: new Date((typeof msg.created_at === 'number' ? msg.created_at : 0) * 1000),
      sender: {
        id: isRecord(msg.sender) ? String(msg.sender.id || '') : '',
        name: isRecord(msg.sender) ? getString(msg.sender.name) || '' : '',
        avatar: isRecord(msg.sender) ? getString(msg.sender.thumbnail) : undefined,
      },
      attachments,
      status: normalizedStatus,
      emailSubject: typeof emailSubject === 'string' ? emailSubject : undefined,
      emailText: typeof emailText === 'string' ? emailText : undefined,
      emailHtml: typeof emailHtml === 'string' ? emailHtml : undefined,
      audioUrl: typeof audioUrlFromAttachments === 'string' && audioUrlFromAttachments ? audioUrlFromAttachments : undefined,
      transcript: typeof transcript === 'string' ? transcript : undefined,
    };
  }
}

class ChatwootService {
  private apiClient = new ApiClient();

  private unwrapArray(input: unknown): unknown[] {
    if (Array.isArray(input)) return input;
    if (!isRecord(input)) return [];

    // Direct array properties
    if (Array.isArray(input.payload) && input.payload.length > 0) return input.payload;
    if (Array.isArray(input.conversations) && input.conversations.length > 0) return input.conversations as unknown[];
    if (Array.isArray(input.inboxes) && input.inboxes.length > 0) return input.inboxes as unknown[];
    if (Array.isArray(input.canned_responses) && input.canned_responses.length > 0) return input.canned_responses as unknown[];

    // Handle nested Chatwoot response: { data: { payload: [...] } }
    if (isRecord(input.data)) {
      const nested = input.data;
      if (Array.isArray(nested.payload)) return nested.payload as unknown[];
      if (Array.isArray(nested)) return nested as unknown[];
    }

    // Fallback: if data itself is an array
    if (Array.isArray(input.data)) return input.data;

    return [];
  }

  async getChannels(): Promise<Channel[]> {
    const tenantId = await this.apiClient.getTenantId();

    // Fetch both Chatwoot inboxes and Firestore-stored channels in parallel
    const [chatwootResult, firestoreResult] = await Promise.allSettled([
      this.apiClient.get<unknown>('inboxes'),
      tenantId
        ? authedFetch(`${API_BASE_URL}/channels/list?tenantId=${tenantId}`).then((r) => r.json())
        : Promise.resolve(null),
    ]);

    // --- Chatwoot inboxes ---
    const chatwootChannels: Channel[] = [];
    if (chatwootResult.status === 'fulfilled') {
      const inboxes = this.unwrapArray(chatwootResult.value);
      const chatwootTypeMap: Record<string, ChannelType> = {
        'api': 'webchat',
        'email': 'email',
        'whatsapp': 'whatsapp',
        'facebook': 'facebook',
        'instagram': 'instagram',
        'telegram': 'telegram',
        'sms': 'sms',
        'voice': 'voice',
        'twitter': 'twitter',
        'webchat': 'webchat',
        'web_widget': 'webchat',
      };
      inboxes
        .map((inbox) => (isRecord(inbox) ? inbox : null))
        .filter((inbox): inbox is Record<string, unknown> => Boolean(inbox))
        .forEach((inbox) => {
          const rawType = String(inbox.channel_type || '')
            .toLowerCase()
            .replace('channel::', '');
          const channelType: ChannelType = chatwootTypeMap[rawType] ?? (isChannelType(rawType) ? rawType : 'webchat');
          chatwootChannels.push({
            id: `cw-${String(inbox.id || '')}`,
            name: getString(inbox.name) || 'Inbox',
            type: channelType,
            status: 'active',
          });
        });
    }

    // --- Firestore channels (connected via Integrations section) ---
    const firestoreChannels: Channel[] = [];
    if (firestoreResult.status === 'fulfilled' && firestoreResult.value) {
      const fsData = firestoreResult.value;
      const channels: unknown[] = Array.isArray(fsData)
        ? fsData
        : Array.isArray(fsData?.channels)
          ? fsData.channels
          : [];
      channels
        .map((ch) => (isRecord(ch) ? ch : null))
        .filter((ch): ch is Record<string, unknown> => Boolean(ch) && ch?.status !== 'disconnected')
        .forEach((ch) => {
          const chType = getString(ch.type) || '';
          const channelType: ChannelType = isChannelType(chType) ? chType : 'webchat';
          // Avoid duplicate if a Chatwoot inbox already covers this (same type + similar name)
          const duplicate = chatwootChannels.some(
            (cw) => cw.type === channelType && cw.type !== 'webchat',
          );
          if (!duplicate) {
            firestoreChannels.push({
              id: String(ch.id || ''),
              name: getString(ch.name) || `${chType} Channel`,
              type: channelType,
              status: (ch.status === 'active' ? 'active' : 'pending') as Channel['status'],
            });
          }
        });
    }

    return [...chatwootChannels, ...firestoreChannels];
  }

  async deleteInbox(inboxId: string): Promise<void> {
    await this.apiClient.delete<unknown>(`inboxes/${encodeURIComponent(inboxId)}`);
  }

  async getConversations(): Promise<Conversation[]> {
    const raw = await this.apiClient.get<unknown>('conversations');
    const conversations = this.unwrapArray(raw);
    return (conversations as ChatwootConversationResponse[]).map((c) => ChatwootDataMapper.mapConversation(c));
  }


  async getConversationMessages(conversationId: string): Promise<Message[]> {
    const raw = await this.apiClient.get<unknown>(`conversations/${conversationId}/messages`);
    const messages = this.unwrapArray(raw);
    return messages.map((m) => ChatwootDataMapper.mapMessage(m));
  }


  async sendMessage(conversationId: string, content: string): Promise<Message> {
    const response = await this.apiClient.post<unknown>(`conversations/${conversationId}/messages`, { content });
    return ChatwootDataMapper.mapMessage(response);
  }

  async getQuickReplies(): Promise<QuickReply[]> {
    const raw = await this.apiClient.get<unknown>('canned_responses');
    const cannedResponses = this.unwrapArray(raw);
    return cannedResponses
      .map((res) => (isRecord(res) ? res : null))
      .filter((res): res is Record<string, unknown> => Boolean(res))
      .map((res) => ({
        id: String(res.id || ''),
        text: getString(res.short_code) || '',
      }));
  }

  async createInbox(input: { name: string; channelType: string }): Promise<unknown> {
    return this.apiClient.post<unknown>('inboxes', {
      name: input.name,
      channel: {
        type: input.channelType,
      },
    });
  }
}

export const chatwootService = new ChatwootService();
