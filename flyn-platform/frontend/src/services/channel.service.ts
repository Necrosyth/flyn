import { ChannelType, ChannelConfig, ChannelConnection, ConnectChannelResponse } from '../components/channels/channel.types';
import { API_BASE_URL } from '../lib/api';
import { authedFetch } from './authApi';

export class ChannelService {
  static async listChannels(): Promise<ChannelConnection[]> {
    const res = await authedFetch(`${API_BASE_URL}/channels/list`);
    if (!res.ok) throw new Error('Failed to fetch channels');
    const data = await res.json();
    return data.channels || [];
  }

  static async connectChannel(channelType: ChannelType, config: ChannelConfig): Promise<ConnectChannelResponse> {
    const res = await authedFetch(`${API_BASE_URL}/channels/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelType, config }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.message || 'Failed to connect channel' };
    return data;
  }

  static async disconnectChannel(channelId: string): Promise<boolean> {
    const res = await authedFetch(`${API_BASE_URL}/channels/${channelId}`, { method: 'DELETE' });
    return res.ok;
  }

  static async testConnection(channelType: ChannelType, config: ChannelConfig): Promise<{ success: boolean; message?: string; error?: string; details?: any }> {
    const res = await authedFetch(`${API_BASE_URL}/channels/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelType, config }),
    });
    return res.json();
  }

  // ── WhatsApp QR ──────────────────────────────────────────────────────────

  static async startQRSession(): Promise<{ sessionId: string }> {
    const res = await authedFetch(`${API_BASE_URL}/channels/whatsapp/qr/start`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start QR session');
    return res.json();
  }

  static async getQRStatus(sessionId: string): Promise<{ status: string; qrCode?: string; phoneNumber?: string; errorMessage?: string }> {
    const res = await fetch(`${API_BASE_URL}/channels/whatsapp/qr/${sessionId}/status`);
    if (!res.ok) throw new Error('Session not found');
    return res.json();
  }

  static async cancelQRSession(sessionId: string): Promise<void> {
    await authedFetch(`${API_BASE_URL}/channels/whatsapp/qr/${sessionId}`, { method: 'DELETE' });
  }

  // ── Email OAuth ───────────────────────────────────────────────────────────

  static async getGmailAuthUrl(): Promise<string> {
    const res = await authedFetch(`${API_BASE_URL}/channels/oauth/gmail/url`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Gmail OAuth is not configured on this server');
    }
    const { url } = await res.json();
    return url;
  }

  static async getOutlookAuthUrl(): Promise<string> {
    const res = await authedFetch(`${API_BASE_URL}/channels/oauth/outlook/url`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Outlook OAuth is not configured on this server');
    }
    const { url } = await res.json();
    return url;
  }

  static async connectEnvSmtp(): Promise<{ success: boolean; channelId?: string; error?: string }> {
    const res = await authedFetch(`${API_BASE_URL}/channels/smtp/env-connect`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.message || 'Failed to connect' };
    return data;
  }

  static openOAuthPopup(url: string): Promise<{ provider: string; email: string }> {
    return new Promise((resolve, reject) => {
      const popup = window.open(url, 'oauth_popup', 'width=520,height=640,scrollbars=yes');
      if (!popup) { reject(new Error('Popup blocked. Allow popups for this site.')); return; }

      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'oauth_success') {
          window.removeEventListener('message', handler);
          resolve({ provider: e.data.provider, email: e.data.email });
        } else if (e.data?.type === 'oauth_error') {
          window.removeEventListener('message', handler);
          reject(new Error(e.data.message || 'OAuth failed'));
        }
      };
      window.addEventListener('message', handler);

      // Fallback: detect popup closed without message
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          window.removeEventListener('message', handler);
          reject(new Error('OAuth window was closed'));
        }
      }, 500);
    });
  }

    // ── WhatsApp Embedded Signup ───────────────────────────────────────────

    static async registerWhatsappWaba(accessToken: string): Promise<{ success: boolean; channelId: string }> {
      const res = await authedFetch(`${API_BASE_URL}/channels/whatsapp/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to register WhatsApp');
      return data;
    }
    }
