import { authedFetch } from '@/services/authApi';

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const API_ROOT = envBaseUrl?.trim() ? envBaseUrl.trim().replace(/\/$/, '') : 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api';
const BASE = `${API_ROOT}/calendar`;

export const calendarService = {
  /** Get all events for the tenant */
  async getEvents(tenantId: string) {
    const resp = await authedFetch(`${BASE}/events/${tenantId}`);
    if (!resp.ok) throw new Error('Failed to fetch events');
    return resp.json();
  },

  /** Create a new internal event for the tenant */
  async createEvent(tenantId: string, event: any) {
    const resp = await authedFetch(`${BASE}/events/${tenantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!resp.ok) throw new Error('Failed to create event');
    return resp.json();
  },

  /** Delete an event for the tenant */
  async deleteEvent(tenantId: string, eventId: string) {
    const resp = await authedFetch(`${BASE}/events/${tenantId}/${eventId}`, {
      method: 'DELETE',
    });
    if (!resp.ok) throw new Error('Failed to delete event');
    return resp.json();
  },

  /** Get Google Auth URL */
  getGoogleAuthUrl(tenantId: string) {
    return `${BASE}/auth/google/${tenantId}`;
  },

  /** Get Microsoft Auth URL */
  getMicrosoftAuthUrl(tenantId: string) {
    return `${BASE}/auth/microsoft/${tenantId}`;
  },

  /** Get Calendly OAuth URL */
  getCalendlyAuthUrl(tenantId: string) {
    return `${API_ROOT}/integrations/calendly/connect?tenantId=${encodeURIComponent(tenantId)}`;
  },

  /** Get Zoom OAuth URL */
  getZoomAuthUrl(tenantId: string) {
    return `${API_ROOT}/integrations/zoom/connect?tenantId=${encodeURIComponent(tenantId)}`;
  },

  /** Link a module to a provider */
  async linkModule(tenantId: string, moduleKey: string, provider: 'google' | 'microsoft' | 'none') {
    const resp = await authedFetch(`${BASE}/link/${tenantId}/${moduleKey}/${provider}`);
    if (!resp.ok) throw new Error('Failed to link module');
    return resp.json();
  },
};
