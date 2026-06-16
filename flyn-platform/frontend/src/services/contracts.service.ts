import { authedFetch } from '@/services/authApi';
/**
 * Contracts Module — Frontend Service
 * Talks to the NestJS backend for the Contracts & eSignature Engine.
 */

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = `${envBaseUrl?.trim() ? envBaseUrl.trim().replace(/\/$/, '') : 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api'}/contracts`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContractItem {
  id: string;
  _id?: string;
  title: string;
  type: string;
  status: string;
  sourceModule?: string;
  sourceEntityId?: string;
  signers?: Array<{ name: string; email: string; role: string; status: string }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContractStats {
  totalContracts: number;
  draftCount: number;
  sentCount: number;
  signedCount: number;
  declinedCount: number;
  expiredCount: number;
  statusBreakdown: Array<{ status: string; count: number }>;
  typeBreakdown: Array<{ type: string; count: number }>;
}

export interface ContractTemplate {
  id: string;
  _id?: string;
  name: string;
  type: string;
  variables: string[];
  isDefault: boolean;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const contractsService = {
  getContracts: async (params?: { status?: string; type?: string; sourceModule?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.type) query.set('type', params.type);
    if (params?.sourceModule) query.set('sourceModule', params.sourceModule);
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await authedFetch(`${BASE}?${query.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json.data ?? []);
  },

  getContractById: async (id: string) => {
    const res = await authedFetch(`${BASE}/${id}`);
    if (!res.ok) return null;
    return res.json();
  },

  createContract: async (data: any) => {
    const res = await authedFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  updateContract: async (id: string, data: any) => {
    const res = await authedFetch(`${BASE}/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteContract: async (id: string): Promise<boolean> => {
    try {
      const res = await authedFetch(`${BASE}/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      const json = await res.json();
      return json.success !== false;
    } catch {
      return false;
    }
  },

  // ── Signing Flow ──────────────────────────────────────────────────────────

  sendContract: async (id: string) => {
    const res = await authedFetch(`${BASE}/${id}/send`, { method: 'POST' });
    return res.json();
  },

  signContract: async (id: string, data: { signerId: string; signingToken: string; signatureData: string; method: string }) => {
    const res = await authedFetch(`${BASE}/${id}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  voidContract: async (id: string) => {
    const res = await authedFetch(`${BASE}/${id}/void`, { method: 'POST' });
    return res.json();
  },

  // ── Signers ───────────────────────────────────────────────────────────────

  getSigners: async (contractId: string) => {
    const res = await authedFetch(`${BASE}/${contractId}/signers`);
    if (!res.ok) return [];
    return res.json();
  },

  addSigner: async (contractId: string, data: { name: string; email: string; role: string }) => {
    const res = await authedFetch(`${BASE}/${contractId}/signers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // ── Audit Trail ───────────────────────────────────────────────────────────

  getEvents: async (contractId: string) => {
    const res = await authedFetch(`${BASE}/${contractId}/events`);
    if (!res.ok) return [];
    return res.json();
  },

  // ── Templates ─────────────────────────────────────────────────────────────

  getTemplates: async (type?: string) => {
    const query = type ? `?type=${type}` : '';
    const res = await authedFetch(`${BASE}/templates${query}`);
    if (!res.ok) return [];
    return res.json();
  },

  createTemplate: async (data: any) => {
    const res = await authedFetch(`${BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // ── Stats / Analytics / Insights ──────────────────────────────────────────

  getStats: async (): Promise<ContractStats> => {
    const res = await authedFetch(`${BASE}/stats`);
    if (!res.ok) return { totalContracts: 0, draftCount: 0, sentCount: 0, signedCount: 0, declinedCount: 0, expiredCount: 0, statusBreakdown: [], typeBreakdown: [] };
    return res.json();
  },

  getAnalytics: async (range = '30d') => {
    try {
      const res = await authedFetch(`${BASE}/analytics?range=${range}`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  getInsights: async () => {
    try {
      const res = await authedFetch(`${BASE}/insights`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  // ── Advanced Security & Versions (PDF 5) ──────────────────────────────────

  getVersions: async (id: string) => {
    const res = await authedFetch(`${BASE}/${id}/versions`);
    return res.json();
  },

  encryptContract: async (id: string) => {
    const res = await authedFetch(`${BASE}/${id}/encrypt`, { method: 'POST' });
    return res.json();
  },

  generateSignedUrl: async (id: string, signerEmail: string) => {
    const res = await authedFetch(`${BASE}/${id}/generate-signed-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signerEmail }),
    });
    return res.json();
  },

  verifyUrl: async (signedUrl: string) => {
    const res = await authedFetch(`${BASE}/verify-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedUrl }),
    });
    return res.json();
  },

  // ── Seed ──────────────────────────────────────────────────────────────────

  seedDemoData: async () => {
    const res = await authedFetch(`${BASE}/seed`, { method: 'POST' });
    return res.json();
  },
};
