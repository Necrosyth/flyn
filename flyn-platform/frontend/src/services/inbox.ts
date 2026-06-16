import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';
import type { Channel, Conversation, Message, QuickReply } from '@/types/inbox';

// ─── Raw API types ────────────────────────────────────────────────────────────

interface RawConversation {
  conversationId: string;
  contactPhone: string;
  contactName: string;
  contactId?: string;  // phonebook contact ID
  channel: string;
  lastMsgAt: number;
  lastMessageText: string;
  unreadCount: number;
  status: string;
  mailboxId?: string;  // set when this conversation belongs to a tenant mailbox (email)
}

interface RawMessage {
  id: string;
  conversationId: string;
  content: string;
  direction: 'inbound' | 'outbound';
  senderName: string;
  senderPhone?: string;
  channel: string;
  timestamp: number;
  status?: string;
  // email-only (undefined for WhatsApp)
  subject?: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string[];
  emailThreadId?: string;
  attachments?: Array<{ filename: string; contentType: string; size: number; s3Key: string; fileUrl: string }>;
  cc?: string[];
  bcc?: string[];
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapConversation(raw: RawConversation): Conversation {
  const isOutbound = raw.lastMessageText?.startsWith('You: ');
  const lastMsgContent = isOutbound
    ? raw.lastMessageText.slice(5)  // strip "You: " (5 chars)
    : raw.lastMessageText;
  const lastMsg: Message | undefined = lastMsgContent
    ? {
        id: `last-${raw.conversationId}`,
        content: lastMsgContent,
        messageType: isOutbound ? 'outgoing' : 'incoming',
        createdAt: new Date(raw.lastMsgAt),
      }
    : undefined;

  // Normalize channel to lowercase to match the ChannelType union
  const normalizedChannel = (raw.channel || 'whatsapp').toLowerCase() as any;

  return {
    id: raw.conversationId,
    inboxId: raw.conversationId,
    contact: {
      id: raw.contactId || raw.contactPhone,
      name: raw.contactName || raw.contactPhone || 'Unknown',
      phone: raw.contactPhone,
    },
    messages: lastMsg ? [lastMsg] : [],
    status: (raw.status as any) || 'open',
    channel: normalizedChannel,
    lastMessage: lastMsg,
    unreadCount: raw.unreadCount || 0,
    createdAt: new Date(raw.lastMsgAt),
    updatedAt: new Date(raw.lastMsgAt),
    ...(raw.mailboxId ? { mailboxId: raw.mailboxId } : {}),
  };
}

function mapMessage(raw: RawMessage): Message {
  // email-only fields, gated on channel so a WhatsApp/SMS message never trips the email renderer
  // (MessageBubble treats a message as email when any of these is set).
  const isEmail = raw.channel === 'email';
  return {
    id: raw.id,
    content: raw.content,
    messageType: raw.direction === 'inbound' ? 'incoming' : 'outgoing',
    createdAt: new Date(raw.timestamp),
    sender: {
      id: raw.senderPhone || raw.senderName,
      name: raw.senderName,
    },
    status: raw.status as any,
    ...(isEmail
      ? {
          emailSubject: raw.subject,
          emailHtml: raw.bodyHtml,
          emailText: raw.content,
          emailCc: raw.cc,
          emailBcc: raw.bcc,
        }
      : {}),
    ...(raw.attachments?.length
      ? {
          attachments: raw.attachments.map((a) => ({
            id: a.s3Key,
            fileType: a.contentType,
            url: '', // resolved on click via getAttachmentUrl(s3Key) — never the private S3 URL
            fileName: a.filename,
            size: a.size,
            s3Key: a.s3Key,
          })),
        }
      : {}),
  };
}

// ─── InboxService ─────────────────────────────────────────────────────────────

class InboxService {
  private base = `${API_BASE_URL}/inbox`;

  async getConversations(): Promise<Conversation[]> {
    const res = await authedFetch(`${this.base}/conversations`);
    if (!res.ok) return [];
    const data: RawConversation[] = await res.json();
    return (data || []).map(mapConversation);
  }

  /**
   * "Sync Now" — reconnect a stale WhatsApp session and pull recent history back into the inbox.
   * Returns the resulting session status so the UI can refresh or prompt a QR re-scan.
   */
  async syncWhatsApp(): Promise<{ success: boolean; status?: 'connected' | 'reconnecting' | 'needs_rescan'; error?: string }> {
    try {
      const res = await authedFetch(`${API_BASE_URL}/channels/whatsapp/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: (data as any)?.message || `Server error ${res.status}` };
      return data as { success: boolean; status?: 'connected' | 'reconnecting' | 'needs_rescan' };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Email receive-capability — used to warn when SMTP is connected but IMAP (inbound) is not. */
  async getEmailReceiveStatus(): Promise<{ connected: boolean; receiving: boolean }> {
    try {
      const res = await authedFetch(`${this.base}/email/receive-status`);
      if (!res.ok) return { connected: false, receiving: true }; // unknown → don't nag
      return (await res.json()) as { connected: boolean; receiving: boolean };
    } catch {
      return { connected: false, receiving: true };
    }
  }

  /**
   * Resolve an email attachment's S3 key to a short-lived presigned GET URL. Server checks tenant
   * isolation; pass the owning conversationId so it also applies the mailbox-access gate.
   */
  async getAttachmentUrl(s3Key: string, conversationId?: string): Promise<string | null> {
    try {
      const q = `key=${encodeURIComponent(s3Key)}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`;
      const res = await authedFetch(`${this.base}/attachment-url?${q}`);
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      return (data as { url?: string })?.url ?? null;
    } catch {
      return null;
    }
  }

  async getConversationMessages(conversationId: string): Promise<Message[]> {
    const res = await authedFetch(
      `${this.base}/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    if (!res.ok) return [];
    const data: RawMessage[] = await res.json();
    return (data || []).map(mapMessage);
  }

  async sendReply(
    conversationId: string,
    content: string,
    subject?: string,
    cc?: string,
    bcc?: string,
  ): Promise<{ success: boolean; error?: string }> {
    let res: Response;
    try {
      res = await authedFetch(
        `${this.base}/conversations/${encodeURIComponent(conversationId)}/reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Email: send the (editable) subject + optional cc/bcc the user sees. The backend
          // validates addresses and keeps bcc hidden from other recipients.
          body: JSON.stringify({
            content,
            ...(subject?.trim() ? { subject: subject.trim() } : {}),
            ...(cc?.trim() ? { cc: cc.trim() } : {}),
            ...(bcc?.trim() ? { bcc: bcc.trim() } : {}),
          }),
        },
      );
    } catch {
      return { success: false, error: 'Network error — could not reach the server' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as any)?.message || (data as any)?.error || `Server error ${res.status}`;
      return { success: false, error: msg };
    }
    return data as { success: boolean; error?: string };
  }

  /**
   * Send an email FROM one of the user's tenant mailboxes via Brevo (parallel to sendReply's
   * BYO-SMTP path). The server enforces the mailbox ACL + active status and tags the conversation
   * with mailboxId. Only call this when the user explicitly picks a mailbox in the From selector.
   */
  async sendAsMailbox(params: {
    mailboxId: string;
    to: { email: string; name?: string };
    subject: string;
    text: string;
    html?: string;
    inReplyTo?: string;
    references?: string[];
  }): Promise<{ success: boolean; messageId?: string; from?: string; error?: string }> {
    let res: Response;
    try {
      res = await authedFetch(`${this.base}/send-as-mailbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    } catch {
      return { success: false, error: 'Network error — could not reach the server' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as any)?.message || (data as any)?.error || `Server error ${res.status}`;
      return { success: false, error: msg };
    }
    return { success: true, ...(data as { messageId?: string; from?: string }) };
  }

  /** Save an internal note (team-only). */
  async addNote(conversationId: string, content: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await authedFetch(
        `${this.base}/conversations/${encodeURIComponent(conversationId)}/note`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: (data as any)?.message || `Server error ${res.status}` };
      return data as { success: boolean };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Generate an AI-drafted reply from conversation context. */
  async aiDraft(conversationId: string): Promise<{ success: boolean; draft?: string; error?: string; waitingForCustomer?: boolean }> {
    try {
      const res = await authedFetch(
        `${this.base}/conversations/${encodeURIComponent(conversationId)}/ai-draft`,
        { method: 'POST' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: (data as any)?.message || `Server error ${res.status}` };
      return data as { success: boolean; draft?: string; error?: string; waitingForCustomer?: boolean };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Delete one conversation from Flyn (mirror only — not from WhatsApp). */
  async deleteConversation(conversationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await authedFetch(`${this.base}/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: (data as any)?.message || `Server error ${res.status}` };
      return { success: true };
    } catch { return { success: false, error: 'Network error' }; }
  }

  /** Delete ALL conversations for this tenant (mirror only). */
  async deleteAllConversations(): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await authedFetch(`${this.base}/conversations`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: (data as any)?.message || `Server error ${res.status}` };
      return { success: true };
    } catch { return { success: false, error: 'Network error' }; }
  }

  /** Mark every conversation as read. */
  async markAllRead(): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await authedFetch(`${this.base}/conversations/read-all`, { method: 'PATCH' });
      if (!res.ok) return { success: false, error: `Server error ${res.status}` };
      return { success: true };
    } catch { return { success: false, error: 'Network error' }; }
  }

  /** Start a new conversation (optionally sending a first message). */
  async startConversation(phoneNumber: string, message?: string): Promise<{ success: boolean; conversationId?: string; isNew?: boolean; error?: string }> {
    try {
      const res = await authedFetch(`${this.base}/conversations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, message, channel: 'whatsapp' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as any)?.success === false) return { success: false, error: (data as any)?.error || (data as any)?.message || `Server error ${res.status}` };
      return data as { success: boolean; conversationId?: string; isNew?: boolean };
    } catch { return { success: false, error: 'Network error' }; }
  }

  /** Download all conversations as a CSV file. */
  async exportConversations(): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await authedFetch(`${this.base}/conversations/export?format=csv`);
      if (!res.ok) return { success: false, error: `Server error ${res.status}` };
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flyn-inbox-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      return { success: true };
    } catch { return { success: false, error: 'Network error' }; }
  }

  /** Translate text (default target English). */
  async translate(text: string, targetLang = 'en'): Promise<{ success: boolean; translated?: string; error?: string }> {
    try {
      const res = await authedFetch(`${this.base}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: (data as any)?.message || `Server error ${res.status}` };
      return data as { success: boolean; translated?: string };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Upload a file to S3 (presigned) then send it as an attachment on the conversation. */
  async sendAttachment(
    conversationId: string,
    file: File,
    caption?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1) Presigned S3 upload URL (browser uploads directly to S3 — scalable, no proxying).
      const presRes = await authedFetch(`${API_BASE_URL}/assets/presigned-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileType: file.type || 'application/octet-stream', module: 'inbox' }),
      });
      if (!presRes.ok) return { success: false, error: 'Could not prepare upload' };
      const { uploadUrl, fileUrl } = await presRes.json();

      // 2) Upload the bytes straight to S3.
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!put.ok) return { success: false, error: 'Upload failed' };

      // 3) Tell the backend to deliver it on the channel.
      const res = await authedFetch(
        `${this.base}/conversations/${encodeURIComponent(conversationId)}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileUrl, fileName: file.name, fileType: file.type || 'application/octet-stream', caption }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as any)?.success === false) {
        return { success: false, error: (data as any)?.error || (data as any)?.message || 'Failed to send attachment' };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Upload error' };
    }
  }

  async markRead(conversationId: string): Promise<void> {
    await authedFetch(
      `${this.base}/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: 'POST' },
    );
  }

  async updateConversationStatus(
    conversationId: string,
    status: 'open' | 'pending' | 'resolved',
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await authedFetch(
        `${this.base}/conversations/${encodeURIComponent(conversationId)}/status`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) },
      );
      if (!res.ok) return { success: false, error: `Server error ${res.status}` };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async getChannels(): Promise<Channel[]> {
    const res = await authedFetch(`${this.base}/channels`);
    if (!res.ok) return [];
    const data: any[] = await res.json();
    return (data || [])
      .filter((ch) => ch.status === 'active')
      .map((ch) => ({
        id: ch.id || ch.channelId,
        name: ch.name || `${ch.type} Channel`,
        type: ch.type,
        status: 'active' as const,
      }));
  }

  // Quick replies are now static — no Chatwoot dependency
  async getQuickReplies(): Promise<QuickReply[]> {
    return [
      { id: '1', text: 'Hello! How can I help you today?' },
      { id: '2', text: 'Thank you for reaching out. We will get back to you shortly.' },
      { id: '3', text: 'Could you please provide more details?' },
    ];
  }
}

export const inboxService = new InboxService();
