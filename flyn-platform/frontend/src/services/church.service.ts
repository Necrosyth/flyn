import { authedFetch } from '@/services/authApi';
/**
 * Church Module — Frontend Service
 * Talks to the NestJS backend which stores data in NocoBase.
 */

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = `${envBaseUrl?.trim() ? envBaseUrl.trim().replace(/\/$/, '') : 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api'}/church`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChurchMember {
  id: string;
  name: string;
  status: string;
  discipleshipStage?: string;
  ministryTier?: string;
  lastAttendance?: string;
  givingCapacity?: string;
  attendanceRate?: string | number;
}

export interface ChurchStats {
  totalMembers: number;
  activeMembers: number;
  totalDonations: number;
  donationCount: number;
  upcomingEvents: number;
  membershipBreakdown: Array<{ type: string; count: number }>;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const churchService = {
  getMembers: async (params?: { search?: string; membershipType?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.membershipType) query.set('membershipType', params.membershipType);
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await authedFetch(`${BASE}/members?${query.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json.data ?? []);
  },

  addMember: async (data: Partial<ChurchMember>) => {
    const res = await authedFetch(`${BASE}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  updateMember: async (id: string, data: Partial<ChurchMember>) => {
    const res = await authedFetch(`${BASE}/members/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getStats: async (): Promise<ChurchStats> => {
    const res = await authedFetch(`${BASE}/stats`);
    if (!res.ok) return { totalMembers: 0, activeMembers: 0, totalDonations: 0, donationCount: 0, upcomingEvents: 0, membershipBreakdown: [] };
    return res.json();
  },

  getDonations: async (memberId?: string) => {
    const query = memberId ? `?memberId=${memberId}` : '';
    const res = await authedFetch(`${BASE}/donations${query}`);
    if (!res.ok) return [];
    return res.json();
  },

  deleteMember: async (id: string): Promise<boolean> => {
    try {
      const res = await authedFetch(`${BASE}/members/${id}`, { method: 'DELETE' });
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

  // ── Broadcast ────────────────────────────────────────────────────────────

  broadcast: async (params: { message: string; segment?: string; channel?: string; subject?: string }) => {
    const res = await authedFetch(`${BASE}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  // ── Volunteer Blockouts ───────────────────────────────────────────────────

  createVolunteerBlockout: async (data: {
    volunteerName: string;
    volunteerId?: string;
    ministry?: string;
    fromDate: string;
    toDate: string;
    reason?: string;
  }) => {
    const res = await authedFetch(`${BASE}/volunteers/blockout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getVolunteerBlockouts: async (date?: string) => {
    const q = date ? `?date=${date}` : '';
    const res = await authedFetch(`${BASE}/volunteers/blockouts${q}`);
    if (!res.ok) return { blockouts: [], total: 0 };
    return res.json();
  },

  deleteVolunteerBlockout: async (id: string) => {
    const res = await authedFetch(`${BASE}/volunteers/blockouts/${id}`, { method: 'DELETE' });
    return res.json();
  },

  getEnforcedSchedule: async (date?: string) => {
    const q = date ? `?date=${date}` : '';
    const res = await authedFetch(`${BASE}/volunteer-schedule/enforced${q}`);
    if (!res.ok) return null;
    return res.json();
  },

  // ── Event QR Check-in ─────────────────────────────────────────────────────

  getEventQRCode: async (eventId: string) => {
    const res = await authedFetch(`${BASE}/events/${eventId}/qr-code`);
    if (!res.ok) return null;
    return res.json();
  },

  checkInToEvent: async (eventId: string, data: { memberId?: string; memberName: string; method?: 'qr' | 'manual' }) => {
    const res = await authedFetch(`${BASE}/events/${eventId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getEventAttendance: async (eventId: string) => {
    const res = await authedFetch(`${BASE}/events/${eventId}/attendance`);
    if (!res.ok) return null;
    return res.json();
  },

  // ── AI Follow-up Send ─────────────────────────────────────────────────────

  sendFollowUp: async (data: {
    memberId?: string;
    memberName?: string;
    channel: string;
    message: string;
    followUpType?: string;
  }) => {
    const res = await authedFetch(`${BASE}/ai/follow-up/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // ── Church CMS ────────────────────────────────────────────────────────────

  getCMS: async () => {
    try {
      const res = await authedFetch(`${BASE}/cms`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  saveCMS: async (config: Record<string, unknown>) => {
    const res = await authedFetch(`${BASE}/cms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return res.json();
  },

  // ── AI endpoints ─────────────────────────────────────────────────────────

  getAttendanceAI: async () => {
    try {
      const res = await authedFetch(`${BASE}/attendance-ai`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  getVolunteerSchedule: async (date?: string) => {
    try {
      const q = date ? `?date=${date}` : '';
      const res = await authedFetch(`${BASE}/volunteer-schedule${q}`);
      if (!res.ok) return { suggestedSchedule: [] };
      return res.json();
    } catch { return { suggestedSchedule: [] }; }
  },

  getReEngagementPlan: async () => {
    try {
      const res = await authedFetch(`${BASE}/ai/re-engage`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  getPrayerRequests: async (status?: string) => {
    try {
      const q = status ? `?status=${status}` : '';
      const res = await authedFetch(`${BASE}/prayer-requests${q}`);
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
  },

  runAIRespond: async (query: string, category?: string): Promise<{ response: string; category: string } | null> => {
    try {
      const res = await authedFetch(`${BASE}/ai/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, category }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },
};
