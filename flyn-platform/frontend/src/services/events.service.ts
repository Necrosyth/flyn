/**
 * Events Module — Frontend Service
 * Events are stored in the church module's events collection on the backend.
 * GET  /api/church/events       — list events
 * POST /api/church/events       — create event
 * DELETE /api/church/events/:id — delete event
 */

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = `${envBaseUrl?.trim() ? envBaseUrl.trim().replace(/\/$/, '') : 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api'}/church`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Event {
  id?: string;
  _id?: string;
  name?: string;
  title?: string;
  dateTime?: string;
  date?: string;
  time?: string;
  endDate?: string;
  endTime?: string;
  timezone?: string;
  location?: string;
  locationType?: 'physical' | 'virtual' | 'hybrid';
  virtualLink?: string;
  virtualPlatform?: 'zoom' | 'google_meet' | 'custom';
  capacityStatus?: string;
  capacity?: number | 'unlimited';
  visibility?: string;
  eventType?: string;
  description?: string;
  status?: string;
  coverImage?: string;
  ticketPrice?: number | 'free';
  requireApproval?: boolean;
  theme?: string;
  category?: string;
  inviteChurchMembers?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const mapEvent = (r: any): Event => ({
  id: String(r.id ?? r._id ?? ''),
  _id: String(r._id ?? r.id ?? ''),
  name: r.title ?? r.name ?? 'Untitled Event',
  title: r.title ?? r.name ?? 'Untitled Event',
  dateTime: r.dateTime ?? (r.date ? `${r.date}${r.time ? ' ' + r.time : ''}` : '—'),
  date: r.date ?? '',
  time: r.time ?? '',
  endDate: r.endDate ?? '',
  endTime: r.endTime ?? '',
  timezone: r.timezone ?? 'UTC',
  location: r.location ?? '',
  locationType: r.locationType ?? 'physical',
  virtualLink: r.virtualLink ?? '',
  virtualPlatform: r.virtualPlatform ?? undefined,
  capacityStatus: r.capacityStatus ?? 'Open',
  capacity: r.capacity ?? 'unlimited',
  visibility: r.visibility ?? r.eventType ?? 'Public',
  eventType: r.eventType ?? 'service',
  description: r.description ?? '',
  status: r.status ?? 'active',
  coverImage: r.coverImage ?? '',
  ticketPrice: r.ticketPrice ?? 'free',
  requireApproval: r.requireApproval ?? false,
  theme: r.theme ?? '',
});

// ── API calls ─────────────────────────────────────────────────────────────────

export const eventsService = {
  getEvents: async (params?: { eventType?: string; limit?: number }): Promise<Event[]> => {
    const query = new URLSearchParams();
    if (params?.eventType) query.set('eventType', params.eventType);
    if (params?.limit) query.set('limit', String(params.limit));
    try {
      const res = await fetch(`${BASE}/events?${query.toString()}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw: any[] = Array.isArray(json) ? json : (json.data ?? []);
      return raw.map(mapEvent);
    } catch {
      return [];
    }
  },

  createEvent: async (data: Partial<Event> & { tags?: string; ticketTiers?: any[]; useMultipleTiers?: boolean; isRecurring?: boolean; recurringFrequency?: string; recurringEndDate?: string }): Promise<Event> => {
    const res = await fetch(`${BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.name ?? data.title ?? 'New Event',
        date: data.date ?? '',
        time: data.time ?? '',
        endDate: data.endDate ?? '',
        endTime: data.endTime ?? '',
        timezone: data.timezone ?? 'UTC',
        location: data.location ?? '',
        locationType: data.locationType ?? 'physical',
        virtualLink: data.virtualLink ?? '',
        virtualPlatform: data.virtualPlatform ?? '',
        eventType: data.eventType ?? data.visibility ?? 'service',
        visibility: data.visibility ?? 'Public',
        description: data.description ?? '',
        coverImage: data.coverImage ?? '',
        ticketPrice: data.ticketPrice ?? 'free',
        ticketTiers: data.ticketTiers ?? [],
        useMultipleTiers: data.useMultipleTiers ?? false,
        requireApproval: data.requireApproval ?? false,
        capacity: data.capacity ?? 'unlimited',
        theme: data.theme ?? '',
        category: data.category ?? '',
        tags: data.tags ?? '',
        inviteChurchMembers: (data as any).inviteChurchMembers ?? false,
        isRecurring: data.isRecurring ?? false,
        recurringFrequency: data.recurringFrequency ?? '',
        recurringEndDate: data.recurringEndDate ?? '',
      }),
    });
    const json = await res.json();
    return mapEvent(json);
  },

  updateEvent: async (id: string, data: Partial<Event>): Promise<Event> => {
    const res = await fetch(`${BASE}/events/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.name ?? data.title,
        date: data.date,
        time: data.time,
        endDate: data.endDate,
        endTime: data.endTime,
        timezone: data.timezone,
        location: data.location,
        locationType: data.locationType,
        virtualLink: data.virtualLink,
        virtualPlatform: data.virtualPlatform,
        eventType: data.eventType ?? data.visibility,
        visibility: data.visibility,
        description: data.description,
        coverImage: data.coverImage,
        ticketPrice: data.ticketPrice,
        requireApproval: data.requireApproval,
        capacity: data.capacity,
        theme: data.theme,
      }),
    });
    const json = await res.json();
    return mapEvent(json);
  },

  deleteEvent: async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/events/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      const json = await res.json();
      return json.success !== false;
    } catch {
      return false;
    }
  },

  getStats: async () => {
    try {
      const res = await fetch(`${BASE}/events-stats`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  getAnalytics: async (_range = '30d') => {
    try {
      const res = await fetch(`${BASE}/events-analytics?range=${_range}`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  getInsights: async () => {
    try {
      const res = await fetch(`${BASE}/events-insights`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  runAIRespond: async (query: string, category?: string) => {
    try {
      const res = await fetch(`${BASE}/ai/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, category }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  // ── Promo Codes ─────────────────────────────────────────────────────────────

  createPromoCode: async (eventId: string, data: {
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    maxUses?: number;
    expiresAt?: string;
  }) => {
    const res = await fetch(`${BASE}/events/${eventId}/promo-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getPromoCodes: async (eventId: string): Promise<any[]> => {
    try {
      const res = await fetch(`${BASE}/events/${eventId}/promo-codes`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.promoCodes ?? [];
    } catch {
      return [];
    }
  },

  deletePromoCode: async (eventId: string, code: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/events/${eventId}/promo-codes/${code}`, { method: 'DELETE' });
      if (!res.ok) return false;
      const json = await res.json();
      return json.success !== false;
    } catch {
      return false;
    }
  },

  validatePromoCode: async (eventId: string, code: string, ticketPrice?: number) => {
    try {
      const res = await fetch(`${BASE}/events/${eventId}/validate-promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ticketPrice }),
      });
      return res.json();
    } catch {
      return { valid: false, error: 'Network error' };
    }
  },
};
