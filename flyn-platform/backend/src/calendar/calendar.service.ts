import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  // Durable internal events (bookings, manually-created events). Firestore-backed
  // so they survive restarts and are visible across instances; falls back to the
  // in-memory map when Firestore is unavailable (dev).
  private readonly INTERNAL_EVENTS_COL = 'calendar_events';

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly firebase: FirebaseService,
  ) {}

  private readonly googleConfig = {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // Global prefix is /api — must match exactly what's registered in Google Cloud Console
    redirectUri: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/calendar/auth/google/callback`,
  };

  private readonly microsoftConfig = {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    // Use 'common' endpoint so any Microsoft account can connect
    redirectUri: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/calendar/auth/microsoft/callback`,
  };

  // Per-tenant in-memory event store (internal events)
  private readonly _events = new Map<string, any[]>();

  /** Generate Google OAuth URL */
  getGoogleAuthUrl(tenantId: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ];
    const params = new URLSearchParams({
      client_id: this.googleConfig.clientId,
      redirect_uri: this.googleConfig.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: JSON.stringify({ tenantId }),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** Handle Google OAuth callback — exchange code for real tokens */
  async handleGoogleCallback(code: string, tenantId: string): Promise<any> {
    this.logger.log(`Handling Google OAuth callback for tenant ${tenantId}`);

    // Exchange auth code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.googleConfig.clientId,
        client_secret: this.googleConfig.clientSecret,
        redirect_uri: this.googleConfig.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json() as any;

    if (!tokenRes.ok || tokenData.error) {
      this.logger.error('Google token exchange failed', tokenData);
      throw new BadRequestException(tokenData.error_description || 'Google token exchange failed');
    }

    // Fetch user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userRes.json() as any;

    const tokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiryDate: Date.now() + (tokenData.expires_in || 3600) * 1000,
      email: userInfo.email || '',
      name: userInfo.name || '',
      picture: userInfo.picture || '',
    };

    const tenant = await this.tenantsService.getTenant(tenantId);
    const integrations = tenant.integrations || {};
    integrations.calendar = { ...integrations.calendar, google: tokens };
    await this.tenantsService.updateTenant(tenantId, { integrations });

    this.logger.log(`Google Calendar linked for ${tokens.email} (tenant ${tenantId})`);
    return { status: 'success', message: 'Google Calendar linked successfully', email: tokens.email };
  }

  /** Generate Microsoft OAuth URL */
  getMicrosoftAuthUrl(tenantId: string): string {
    const scopes = ['offline_access', 'User.Read', 'Calendars.ReadWrite'];
    const params = new URLSearchParams({
      client_id: this.microsoftConfig.clientId,
      response_type: 'code',
      redirect_uri: this.microsoftConfig.redirectUri,
      response_mode: 'query',
      scope: scopes.join(' '),
      state: JSON.stringify({ tenantId }),
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /** Handle Microsoft OAuth callback — exchange code for real tokens */
  async handleMicrosoftCallback(code: string, tenantId: string): Promise<any> {
    this.logger.log(`Handling Microsoft OAuth callback for tenant ${tenantId}`);

    const tokenRes = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.microsoftConfig.clientId,
        client_secret: this.microsoftConfig.clientSecret,
        redirect_uri: this.microsoftConfig.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json() as any;

    if (!tokenRes.ok || tokenData.error) {
      this.logger.error('Microsoft token exchange failed', tokenData);
      throw new BadRequestException(tokenData.error_description || 'Microsoft token exchange failed');
    }

    const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userRes.json() as any;

    const tokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiryDate: Date.now() + (tokenData.expires_in || 3600) * 1000,
      email: userInfo.mail || userInfo.userPrincipalName || '',
      name: userInfo.displayName || '',
    };

    const tenant = await this.tenantsService.getTenant(tenantId);
    const integrations = tenant.integrations || {};
    integrations.calendar = { ...integrations.calendar, microsoft: tokens };
    await this.tenantsService.updateTenant(tenantId, { integrations });

    return { status: 'success', message: 'Microsoft Calendar linked successfully', email: tokens.email };
  }

  /** Refresh a Google access token using the stored refresh token */
  private async refreshGoogleToken(refreshToken: string): Promise<string> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.googleConfig.clientId,
        client_secret: this.googleConfig.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const data = await res.json() as any;
    if (!res.ok || data.error) throw new BadRequestException('Failed to refresh Google token');
    return data.access_token;
  }

  /** Fetch events from Google Calendar */
  private async fetchGoogleEvents(googleTokens: any): Promise<any[]> {
    let accessToken = googleTokens.accessToken;

    // Refresh if expired or expiring soon (within 5 min)
    if (googleTokens.refreshToken && Date.now() > googleTokens.expiryDate - 300_000) {
      try {
        accessToken = await this.refreshGoogleToken(googleTokens.refreshToken);
      } catch (e) {
        this.logger.warn('Could not refresh Google token, using existing');
      }
    }

    const now = new Date().toISOString();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // next 30 days

    const params = new URLSearchParams({
      timeMin: now,
      timeMax: future,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100',
    });

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      this.logger.warn(`Google Calendar fetch failed: ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    return (data.items || []).map((item: any) => ({
      id: item.id,
      title: item.summary || '(No title)',
      start: item.start?.dateTime || item.start?.date,
      end: item.end?.dateTime || item.end?.date,
      description: item.description || '',
      location: item.location || '',
      source: 'google',
      htmlLink: item.htmlLink,
    }));
  }

  // ── Microsoft (Graph) ──────────────────────────────────────────────────────
  private async refreshMicrosoftToken(refreshToken: string): Promise<string> {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.microsoftConfig.clientId,
        client_secret: this.microsoftConfig.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'offline_access User.Read Calendars.ReadWrite',
      }).toString(),
    });
    const data = await res.json() as any;
    if (!res.ok || data.error) throw new BadRequestException('Failed to refresh Microsoft token');
    return data.access_token;
  }

  /** Fetch events from Microsoft (Graph calendarView), next 30 days. */
  private async fetchMicrosoftEvents(msTokens: any): Promise<any[]> {
    let accessToken = msTokens.accessToken;
    if (msTokens.refreshToken && Date.now() > (msTokens.expiryDate ?? 0) - 300_000) {
      try { accessToken = await this.refreshMicrosoftToken(msTokens.refreshToken); }
      catch { this.logger.warn('Could not refresh Microsoft token, using existing'); }
    }
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start}&endDateTime=${end}&$orderby=start/dateTime&$top=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' } });
    if (!res.ok) { this.logger.warn(`Microsoft Calendar fetch failed: ${res.status}`); return []; }
    const data = await res.json() as any;
    return (data.value || []).map((e: any) => ({
      id: e.id,
      title: e.subject || '(No title)',
      start: e.start?.dateTime ? `${e.start.dateTime}Z`.replace(/Z+$/, 'Z') : undefined,
      end: e.end?.dateTime ? `${e.end.dateTime}Z`.replace(/Z+$/, 'Z') : undefined,
      description: e.bodyPreview || '',
      location: e.location?.displayName || '',
      joinUrl: e.onlineMeeting?.joinUrl || undefined,
      source: 'microsoft',
      htmlLink: e.webLink,
    }));
  }

  // ── Calendly ───────────────────────────────────────────────────────────────
  /** Fetch upcoming scheduled events booked via Calendly. */
  private async fetchCalendlyEvents(cal: any): Promise<any[]> {
    if (!cal?.accessToken || !cal?.calendlyUri) return [];
    const params = new URLSearchParams({
      user: cal.calendlyUri,
      status: 'active',
      min_start_time: new Date().toISOString(),
      max_start_time: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      count: '100',
    });
    const res = await fetch(`https://api.calendly.com/scheduled_events?${params}`, {
      headers: { Authorization: `Bearer ${cal.accessToken}` },
    });
    if (!res.ok) { this.logger.warn(`Calendly fetch failed: ${res.status}`); return []; }
    const data = await res.json() as any;
    return (data.collection || []).map((e: any) => ({
      id: e.uri?.split('/').pop() || e.uri,
      title: e.name || 'Calendly meeting',
      start: e.start_time,
      end: e.end_time,
      description: e.meeting_notes_plain || '',
      location: e.location?.location || e.location?.type || '',
      joinUrl: e.location?.join_url || undefined,
      source: 'calendly',
    }));
  }

  // ── Zoom ───────────────────────────────────────────────────────────────────
  private async refreshZoomToken(refreshToken: string): Promise<string> {
    const auth = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    });
    const data = await res.json() as any;
    if (!res.ok || data.error) throw new BadRequestException('Failed to refresh Zoom token');
    return data.access_token;
  }

  /** Fetch upcoming Zoom meetings. */
  private async fetchZoomMeetings(zoom: any): Promise<any[]> {
    if (!zoom?.accessToken) return [];
    let accessToken = zoom.accessToken;
    if (zoom.refreshToken && Date.now() > (zoom.expiryDate ?? 0) - 300_000) {
      try { accessToken = await this.refreshZoomToken(zoom.refreshToken); }
      catch { this.logger.warn('Could not refresh Zoom token, using existing'); }
    }
    const res = await fetch('https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=100', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) { this.logger.warn(`Zoom fetch failed: ${res.status}`); return []; }
    const data = await res.json() as any;
    return (data.meetings || []).map((m: any) => ({
      id: String(m.id),
      title: m.topic || 'Zoom meeting',
      start: m.start_time,
      end: m.start_time ? new Date(new Date(m.start_time).getTime() + (m.duration || 30) * 60000).toISOString() : undefined,
      description: m.agenda || '',
      joinUrl: m.join_url,
      source: 'zoom',
    }));
  }

  /** Create an event in the tenant's linked Google Calendar; falls back to internal store */
  async createGoogleCalendarEvent(tenantId: string, event: {
    summary: string;
    description: string;
    startDateTime: string;
    endDateTime: string;
    attendeeEmail?: string;
  }): Promise<{ id: string; htmlLink?: string } | null> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const googleTokens = tenant.integrations?.calendar?.google;

    if (googleTokens?.accessToken) {
      let accessToken = googleTokens.accessToken as string;
      if (googleTokens.refreshToken && Date.now() > (googleTokens.expiryDate as number) - 300_000) {
        try { accessToken = await this.refreshGoogleToken(googleTokens.refreshToken as string); } catch { /* use existing */ }
      }

      const body: Record<string, unknown> = {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startDateTime, timeZone: 'UTC' },
        end: { dateTime: event.endDateTime, timeZone: 'UTC' },
        sendUpdates: event.attendeeEmail ? 'all' : 'none',
      };
      if (event.attendeeEmail) {
        body.attendees = [{ email: event.attendeeEmail }];
      }

      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json() as any;
        this.logger.log(`Google Calendar event created: ${data.id as string} for tenant ${tenantId}`);
        return { id: data.id as string, htmlLink: data.htmlLink as string | undefined };
      }
      this.logger.warn(`Google Calendar event creation failed: ${res.status} for tenant ${tenantId}`);
    }

    // Fallback: store in durable internal events
    const internal = await this.createEvent(tenantId, {
      title: event.summary,
      start: event.startDateTime,
      end: event.endDateTime,
      description: event.description,
      source: 'voice-booking',
    });
    return { id: internal.id as string };
  }

  /** Create an event on the tenant's Microsoft calendar (Graph), else internal. */
  async createMicrosoftCalendarEvent(tenantId: string, event: {
    summary: string; description?: string; startDateTime: string; endDateTime: string; attendeeEmail?: string;
  }): Promise<{ id: string; htmlLink?: string } | null> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const ms = tenant.integrations?.calendar?.microsoft as any;
    if (ms?.accessToken) {
      let accessToken = ms.accessToken as string;
      if (ms.refreshToken && Date.now() > (ms.expiryDate ?? 0) - 300_000) {
        try { accessToken = await this.refreshMicrosoftToken(ms.refreshToken); } catch { /* use existing */ }
      }
      const body: Record<string, unknown> = {
        subject: event.summary,
        body: { contentType: 'text', content: event.description || '' },
        start: { dateTime: event.startDateTime, timeZone: 'UTC' },
        end: { dateTime: event.endDateTime, timeZone: 'UTC' },
        ...(event.attendeeEmail ? { attendees: [{ emailAddress: { address: event.attendeeEmail }, type: 'required' }] } : {}),
      };
      const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json() as any;
        this.logger.log(`Microsoft event created: ${data.id} for tenant ${tenantId}`);
        return { id: data.id as string, htmlLink: data.webLink as string | undefined };
      }
      this.logger.warn(`Microsoft event creation failed: ${res.status} for tenant ${tenantId}`);
    }
    const internal = await this.createEvent(tenantId, {
      title: event.summary, start: event.startDateTime, end: event.endDateTime,
      description: event.description, source: 'internal',
    });
    return { id: internal.id as string };
  }

  /** Create a Zoom meeting and mirror it into the unified calendar. */
  async createZoomMeeting(tenantId: string, event: {
    summary: string; description?: string; startDateTime: string; endDateTime: string;
  }): Promise<{ id: string; joinUrl?: string } | null> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const zoom = (tenant.integrations as any)?.zoom;
    if (!zoom?.accessToken) throw new BadRequestException('Zoom is not connected.');
    let accessToken = zoom.accessToken as string;
    if (zoom.refreshToken && Date.now() > (zoom.expiryDate ?? 0) - 300_000) {
      try { accessToken = await this.refreshZoomToken(zoom.refreshToken); } catch { /* use existing */ }
    }
    const durationMin = Math.max(15, Math.round((new Date(event.endDateTime).getTime() - new Date(event.startDateTime).getTime()) / 60000));
    const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: event.summary, type: 2, start_time: event.startDateTime,
        duration: durationMin, agenda: event.description || '', timezone: 'UTC',
      }),
    });
    if (!res.ok) { this.logger.warn(`Zoom meeting create failed: ${res.status}`); throw new BadRequestException('Could not create Zoom meeting.'); }
    const data = await res.json() as any;
    // Mirror into the unified calendar so it shows immediately (webhook will reconcile).
    await this.upsertExternalEvent(tenantId, {
      source: 'zoom', externalId: String(data.id), title: event.summary,
      start: event.startDateTime, end: event.endDateTime, description: event.description, joinUrl: data.join_url,
    });
    this.logger.log(`Zoom meeting created: ${data.id} for tenant ${tenantId}`);
    return { id: String(data.id), joinUrl: data.join_url as string | undefined };
  }

  /**
   * Provider-aware "New Meeting" router. Used by the calendar create endpoint to
   * write to the chosen provider (google/microsoft/zoom) or a durable internal event.
   */
  async createMeeting(tenantId: string, input: {
    provider?: string; title: string; description?: string; start: string; end?: string; attendeeEmail?: string;
  }): Promise<any> {
    const startDateTime = input.start;
    const endDateTime = input.end || new Date(new Date(input.start).getTime() + 30 * 60000).toISOString();
    const common = { summary: input.title, description: input.description, startDateTime, endDateTime, attendeeEmail: input.attendeeEmail };
    switch ((input.provider || 'internal').toLowerCase()) {
      case 'google': return this.createGoogleCalendarEvent(tenantId, common);
      case 'microsoft':
      case 'outlook': return this.createMicrosoftCalendarEvent(tenantId, common);
      case 'zoom': return this.createZoomMeeting(tenantId, { summary: input.title, description: input.description, startDateTime, endDateTime });
      default: return this.createEvent(tenantId, { title: input.title, start: startDateTime, end: endDateTime, description: input.description, source: 'internal' });
    }
  }

  /** Get events from all connected calendars + internal events (unified). */
  async getAllEvents(tenantId: string): Promise<any[]> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const events: any[] = [];
    const integ: any = tenant.integrations || {};

    // Pull from all four providers in parallel; each is fail-soft.
    const [g, ms, cal, zm] = await Promise.allSettled([
      integ.calendar?.google?.accessToken ? this.fetchGoogleEvents(integ.calendar.google) : Promise.resolve([]),
      integ.calendar?.microsoft?.accessToken ? this.fetchMicrosoftEvents(integ.calendar.microsoft) : Promise.resolve([]),
      integ.calendly?.accessToken ? this.fetchCalendlyEvents(integ.calendly) : Promise.resolve([]),
      integ.zoom?.accessToken ? this.fetchZoomMeetings(integ.zoom) : Promise.resolve([]),
    ]);
    for (const r of [g, ms, cal, zm]) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) events.push(...r.value);
      else if (r.status === 'rejected') this.logger.warn(`Calendar provider fetch failed for ${tenantId}: ${r.reason}`);
    }

    // Merge durable internal events (Firestore), else in-memory fallback
    const db = this.firebase.firestore();
    if (db) {
      try {
        const snap = await db.collection(this.INTERNAL_EVENTS_COL).where('tenantId', '==', tenantId).limit(500).get();
        events.push(...snap.docs.map(d => d.data()));
      } catch (e) {
        this.logger.warn(`Failed to read internal events for ${tenantId}: ${e}`);
        events.push(...(this._events.get(tenantId) ?? []));
      }
    } else {
      events.push(...(this._events.get(tenantId) ?? []));
    }

    return events;
  }

  /** Create a new internal event for the tenant (Firestore-durable). */
  async createEvent(tenantId: string, event: any): Promise<any> {
    const newEvent = {
      ...event,
      id: event.id ?? `internal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tenantId,
      source: event.source || 'internal',
    };
    const db = this.firebase.firestore();
    if (db) {
      try { await db.collection(this.INTERNAL_EVENTS_COL).doc(newEvent.id).set(newEvent); return newEvent; }
      catch (e) { this.logger.warn(`Firestore createEvent failed, using memory: ${e}`); }
    }
    this._events.set(tenantId, [...(this._events.get(tenantId) ?? []), newEvent]);
    return newEvent;
  }

  /**
   * Idempotent upsert of an external provider event (from an inbound webhook) into
   * the unified `calendar_events` store. Keyed by source+externalId so repeated
   * webhooks don't duplicate. Used by Calendly/Zoom webhooks (Phase 2).
   */
  async upsertExternalEvent(tenantId: string, ev: {
    source: string; externalId: string; title: string;
    start?: string; end?: string; description?: string; location?: string; joinUrl?: string;
  }): Promise<void> {
    const db = this.firebase.firestore();
    if (!db) return;
    const id = `${ev.source}_${ev.externalId}`;
    await db.collection(this.INTERNAL_EVENTS_COL).doc(id).set({
      ...ev, id, tenantId, updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  /** Remove an external event (e.g. Calendly cancellation / Zoom meeting deleted). */
  async removeExternalEvent(tenantId: string, source: string, externalId: string): Promise<void> {
    const db = this.firebase.firestore();
    if (!db) return;
    await db.collection(this.INTERNAL_EVENTS_COL).doc(`${source}_${externalId}`).delete().catch(() => {});
  }

  /** Delete an internal event for the tenant. */
  async deleteEvent(tenantId: string, eventId: string): Promise<{ deleted: boolean }> {
    const db = this.firebase.firestore();
    if (db) {
      try { await db.collection(this.INTERNAL_EVENTS_COL).doc(eventId).delete(); return { deleted: true }; }
      catch (e) { this.logger.warn(`Firestore deleteEvent failed, using memory: ${e}`); }
    }
    this._events.set(tenantId, (this._events.get(tenantId) ?? []).filter(e => e.id !== eventId));
    return { deleted: true };
  }

  /** Sync an event to the linked calendar */
  async syncEvent(tenantId: string, moduleKey: string, eventData: any): Promise<void> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const link = tenant.calendarLinks?.[moduleKey];
    if (!link || link === 'none') return;
    this.logger.log(`Syncing event for module ${moduleKey} to ${link} calendar`);
  }
}
