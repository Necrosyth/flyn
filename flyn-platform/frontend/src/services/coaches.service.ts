import { authedFetch } from '@/services/authApi';
/**
 * Coaches Module — Frontend Service
 * Talks to the NestJS backend which stores data in NocoBase.
 */

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = `${envBaseUrl?.trim() ? envBaseUrl.trim().replace(/\/$/, '') : 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api'}/coaches`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CoachClient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  program?: string;
  status: string;
  nextSession?: string;
  healthStatus?: string;
}

export interface CoachesStats {
  totalClients: number;
  activeClients: number;
  totalSessions: number;
  completedSessions: number;
  averageProgressRating: number;
  programBreakdown: Array<{ program: string; count: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const toHealthStatus = (rating?: number): string => {
  if (!rating) return 'gray';
  if (rating >= 8) return 'green';
  if (rating >= 5) return 'amber';
  return 'red';
};

const toSuccessProbability = (rating?: number): string => {
  if (!rating) return '—';
  return `${Math.round(rating * 10)}%`;
};

// ── API calls ─────────────────────────────────────────────────────────────────

export const coachesService = {
  getClients: async (params?: { search?: string; program?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.program) query.set('program', params.program);
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await authedFetch(`${BASE}/clients?${query.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    const raw: any[] = Array.isArray(json) ? json : (json.data ?? []);
    
    return raw.map((c) => ({
      ...c,
      healthStatus: toHealthStatus(c.progressRating),
      activePrograms: c.program ? 1 : 0,
      successProbability: toSuccessProbability(c.progressRating),
      nextSession: '—',
    }));
  },

  addClient: async (data: Partial<CoachClient>) => {
    const res = await authedFetch(`${BASE}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  updateClient: async (id: string, data: Partial<CoachClient>) => {
    const res = await authedFetch(`${BASE}/clients/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getStats: async (): Promise<CoachesStats> => {
    const res = await authedFetch(`${BASE}/stats`);
    if (!res.ok) return { totalClients: 0, activeClients: 0, totalSessions: 0, completedSessions: 0, averageProgressRating: 0, programBreakdown: [] };
    return res.json();
  },

  deleteClient: async (id: string): Promise<boolean> => {
    try {
      const res = await authedFetch(`${BASE}/clients/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      const json = await res.json();
      return json.success !== false;
    } catch {
      return false;
    }
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
};
