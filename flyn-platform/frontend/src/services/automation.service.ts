import { authedFetch } from '@/services/authApi';
/**
 * Automation Module — Frontend Service
 * ────────────────────────────────────
 * Communicates with the NestJS backend for rules, events, and AI assist.
 */

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = `${envBaseUrl?.trim() ? envBaseUrl.trim().replace(/\/$/, '') : 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api'}/automation`;

export const automationService = {
  getRules: async () => {
    const res = await authedFetch(`${BASE}/rules`);
    if (!res.ok) return [];
    return res.json();
  },

  createRule: async (data: any) => {
    const res = await authedFetch(`${BASE}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  toggleRule: async (id: string) => {
    const res = await authedFetch(`${BASE}/rules/${id}/toggle`, { method: 'POST' });
    return res.json();
  },

  deleteRule: async (id: string) => {
    const res = await authedFetch(`${BASE}/rules/${id}`, { method: 'DELETE' });
    return res.json();
  },

  getStats: async () => {
    const res = await authedFetch(`${BASE}/stats`);
    if (!res.ok) return null;
    return res.json();
  },

  getEvents: async (params?: { type?: string; sourceModule?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.type) query.set('type', params.type);
    if (params?.sourceModule) query.set('sourceModule', params.sourceModule);
    if (params?.limit) query.set('limit', String(params.limit));
    
    const res = await authedFetch(`${BASE}/events?${query.toString()}`);
    if (!res.ok) return [];
    return res.json();
  },

  // ── AI Capabilities (PDF CRM Blueprint §4) ─────────────────────────

  aiWorkflowAssist: async (query: string) => {
    const res = await authedFetch(`${BASE}/ai/assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    return res.json();
  },

  aiOptimizeFlow: async (id: string) => {
    const res = await authedFetch(`${BASE}/rules/${id}/optimize`, { method: 'POST' });
    return res.json();
  },
};
