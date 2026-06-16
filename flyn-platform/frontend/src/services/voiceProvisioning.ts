import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';

export type VoiceActivationStatus =
  | 'inactive'
  | 'pending'
  | 'pending_number'
  | 'active'
  | 'rejected';

export interface VoiceActivationRequest {
  tenantId: string;
  tenantName: string;
  requestedBy: string;
  requestedAt: string;
  status: VoiceActivationStatus;
  assignedNumber: string | null;
  assignedNumberSid: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  webhookConfigured: boolean;
}

export interface VoiceStatusResponse {
  status: VoiceActivationStatus;
  phoneNumber: string | null;
  selectedAgentId: string | null;
  activatedAt: string | null;
  request: VoiceActivationRequest | null;
}

export interface PoolNumber {
  number: string;
  twilioSid: string;
  status: 'available' | 'assigned' | 'reserved';
  assignedTo: string | null;
  assignedAt: string | null;
  country: string;
  capabilities: { voice: boolean; sms: boolean };
  addedAt: string;
  addedBy: string;
}

export interface PoolCounts {
  total: number;
  available: number;
  assigned: number;
  reserved: number;
}

export interface TenantVoiceNumber {
  number: string;
  twilioSid: string;
  source: 'pool' | 'purchased';
  billable: boolean;
  allocatedAt: string;
  allocatedBy: string;
  stripeSubscriptionId?: string;
  priceCents?: number;
  periodStart?: number;
  periodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  status?: 'active' | 'canceling';
  agentId?: string | null;
}

const BASE = `${API_BASE_URL}/voice-provisioning`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(`${BASE}${path}`, init);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body?.message || body?.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg || `HTTP ${res.status}`);
  }
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const voiceProvisioning = {
  // ── Client ──────────────────────────────────────────────────────────────
  requestActivation: () =>
    req<{ status: string; message: string }>('/request-activation', { method: 'POST' }),
  allocate: (country?: string) =>
    req<{
      allocated: boolean;
      requiresPayment: boolean;
      number?: string;
      source?: 'pool' | 'purchased';
      message: string;
    }>('/allocate', { method: 'POST', ...json({ country: country ?? 'US' }) }),
  getStatus: () => req<VoiceStatusResponse>('/status'),
  updateAgent: (agentId: string) =>
    req<{ updated: boolean; agentId: string }>('/update-agent', { method: 'PATCH', ...json({ agentId }) }),
  deactivate: () => req<{ deactivated: boolean }>('/deactivate', { method: 'DELETE' }),

  // Numbers (free first + paid additional @ $1.15/mo)
  listNumbers: () =>
    req<{ numbers: TenantVoiceNumber[]; priceCents: number; currency: string }>('/numbers'),
  createNumberCheckout: (successUrl: string, cancelUrl: string, country = 'US') =>
    req<{ checkoutUrl: string }>('/numbers/checkout', { method: 'POST', ...json({ successUrl, cancelUrl, country }) }),
  removeNumber: (number: string) =>
    req<{ released: boolean; immediate: boolean; cancelsAt?: number | null }>(
      `/numbers/${encodeURIComponent(number)}`,
      { method: 'DELETE' },
    ),
  setNumberAgent: (number: string, agentId: string) =>
    req<{ updated: boolean; number: string; agentId: string }>(
      `/numbers/${encodeURIComponent(number)}/agent`,
      { method: 'PATCH', ...json({ agentId }) },
    ),

  // ── Admin ───────────────────────────────────────────────────────────────
  listRequests: () => req<{ requests: VoiceActivationRequest[] }>('/admin/requests'),
  listActiveTenants: () => req<{ tenants: VoiceActivationRequest[] }>('/admin/active-tenants'),
  approve: (tenantId: string) =>
    req<{ status: string; phoneNumber?: string; message: string }>('/admin/approve', { method: 'POST', ...json({ tenantId }) }),
  reject: (tenantId: string, reason: string) =>
    req<{ rejected: boolean }>('/admin/reject', { method: 'POST', ...json({ tenantId, reason }) }),
  addNumber: (input: {
    number: string;
    twilioSid: string;
    country?: string;
    capabilities?: { voice: boolean; sms: boolean };
  }) =>
    req<{ added: boolean; number: string; autoFulfilled: string | null }>('/admin/add-number', {
      method: 'POST',
      ...json(input),
    }),
  listPool: () => req<{ numbers: PoolNumber[]; counts: PoolCounts }>('/admin/pool'),
  adminDeactivate: (tenantId: string) =>
    req<{ deactivated: boolean }>('/admin/deactivate', { method: 'DELETE', ...json({ tenantId }) }),
  reconcileWebhooks: () =>
    req<{ reconciled: number; failed: number; results: { number: string; tenantId: string; ok: boolean; error?: string }[] }>(
      '/admin/reconcile-webhooks', { method: 'POST' },
    ),
};
