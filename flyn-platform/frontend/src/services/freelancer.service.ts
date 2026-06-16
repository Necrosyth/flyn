import { authedFetch } from '@/services/authApi';
/**
 * Freelancer Module — Frontend Service
 * Talks to the NestJS backend which stores data in NocoBase.
 */

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = `${envBaseUrl?.trim() ? envBaseUrl.trim().replace(/\/$/, '') : 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api'}/freelancer`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FreelancerProject {
  id: string;
  name: string;
  client?: string;
  clientName?: string;
  status: string;
  budget?: number | string;
  deadline?: string;
}

export interface FreelancerStats {
  totalProjects: number;
  activeProjects: number;
  totalHoursLogged: number;
  totalRevenue: number;
  outstandingAmount: number;
  projectStatusBreakdown: Array<{ status: string; count: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatBudget = (budget?: number | string): string => {
  if (!budget) return '—';
  const num = typeof budget === 'number' ? budget : parseFloat(String(budget));
  if (isNaN(num)) return String(budget);
  return `$${num.toLocaleString()}`;
};

// ── API calls ─────────────────────────────────────────────────────────────────

export const freelancerService = {
  getProjects: async (params?: { search?: string; status?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await authedFetch(`${BASE}/projects?${query.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    const raw: any[] = Array.isArray(json) ? json : (json.data ?? []);
    
    return raw.map((p) => ({
      ...p,
      client: p.clientName ?? p.client ?? '—',
      budget: formatBudget(p.budget),
      deadline: p.deadline ?? '—',
    }));
  },

  createProject: async (data: Partial<FreelancerProject>) => {
    const res = await authedFetch(`${BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  updateProject: async (id: string, data: Partial<FreelancerProject>) => {
    const res = await authedFetch(`${BASE}/projects/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getStats: async (): Promise<FreelancerStats> => {
    const res = await authedFetch(`${BASE}/stats`);
    if (!res.ok) return { totalProjects: 0, activeProjects: 0, totalHoursLogged: 0, totalRevenue: 0, outstandingAmount: 0, projectStatusBreakdown: [] };
    return res.json();
  },

  seedDemoData: async (): Promise<any> => {
    const res = await authedFetch(`${BASE}/seed`, { method: 'POST' });
    return res.json();
  },

  getProjectRisk: async (id: string): Promise<any> => {
    const res = await authedFetch(`${BASE}/projects/${id}/risk`);
    return res.json();
  },

  getTalentMatch: async (data?: any): Promise<any> => {
    const qs = data?.skills ? `?skills=${data.skills.join(',')}` : '';
    const res = await authedFetch(`${BASE}/talent-match${qs}`);
    return res.json();
  },

  getProjectMilestones: async (id: string): Promise<any> => {
    const res = await authedFetch(`${BASE}/projects/${id}/milestones`);
    return res.json();
  },

  runAutoHire: async (id: string): Promise<any> => {
    const res = await authedFetch(`${BASE}/jobs/${id}/auto-hire`, { method: 'POST' });
    return res.json();
  },

  generateProjectContract: async (id: string): Promise<any> => {
    const res = await authedFetch(`${BASE}/projects/${id}/generate-contract`, { method: 'POST' });
    return res.json();
  },

  deleteProject: async (id: string): Promise<boolean> => {
    try {
      const res = await authedFetch(`${BASE}/projects/${id}`, { method: 'DELETE' });
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

  // ── Advanced Freelancer (PDF 2) ────────────────────────────────────────

  getJobs: async (status?: string) => {
    const qs = status ? `?status=${status}` : '';
    const res = await authedFetch(`${BASE}/jobs${qs}`);
    return res.json();
  },

  createJob: async (data: any) => {
    const res = await authedFetch(`${BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getProfiles: async (skill?: string) => {
    const qs = skill ? `?skill=${skill}` : '';
    const res = await authedFetch(`${BASE}/profiles${qs}`);
    return res.json();
  },

  getProfileReviews: async (id: string) => {
    const res = await authedFetch(`${BASE}/profiles/${id}/reviews`);
    return res.json();
  },

  createDispute: async (data: any) => {
    const res = await authedFetch(`${BASE}/disputes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getDisputes: async (status?: string) => {
    const qs = status ? `?status=${status}` : '';
    const res = await authedFetch(`${BASE}/disputes${qs}`);
    return res.json();
  },

  aiReply: async (message: string) => {
    const res = await authedFetch(`${BASE}/ai/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    return res.json();
  },

  aiSummarize: async (projectId: string) => {
    const res = await authedFetch(`${BASE}/ai/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    return res.json();
  },
};
