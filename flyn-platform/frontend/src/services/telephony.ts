import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';

export type TelephonyServiceStatus = 'active' | 'inactive' | 'provisioning' | 'error';

export interface TelephonyServiceInfo {
  status: TelephonyServiceStatus;
  phoneNumber?: string;
  activatedAt?: number;
  errorMessage?: string;
  aiProvider?: 'twilio' | 'vapi';
}

export interface TelephonyStatusResponse {
  sms: TelephonyServiceInfo | null;
  voice: TelephonyServiceInfo | null;
}

const BASE = `${API_BASE_URL}/telephony`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

export const telephonyService = {
  getStatus: () => req<TelephonyStatusResponse>('/status'),

  activateSms: (countryCode = 'US') =>
    req<TelephonyServiceInfo & { success: boolean }>('/sms/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode }),
    }),

  deactivateSms: () =>
    req<{ success: boolean }>('/sms', { method: 'DELETE' }),

  activateVoice: (countryCode = 'US') =>
    req<TelephonyServiceInfo & { success: boolean }>('/voice/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode }),
    }),

  deactivateVoice: () =>
    req<{ success: boolean }>('/voice', { method: 'DELETE' }),

  updateVoiceProvider: (provider: 'twilio' | 'vapi') =>
    req<TelephonyServiceInfo & { success: boolean }>('/voice/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiProvider: provider }),
    }),
};
