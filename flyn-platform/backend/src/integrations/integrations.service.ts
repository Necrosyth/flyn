import { BadRequestException, Injectable, Logger, NotFoundException, NotImplementedException } from '@nestjs/common';
import axios from 'axios';

import { TenantsService, Tenant } from '../tenants/tenants.service';
import { CalendarService } from '../calendar/calendar.service';

export type IntegrationKey = 'whatsapp' | 'facebook' | 'api' | 'calendar' | 'xero' | 'quickbooks';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly calendar: CalendarService,
  ) {}

  // ── Calendar inbound webhooks (Phase 2): land booked meetings in calendar_events ──

  /** Calendly invitee.created / invitee.canceled → upsert/remove unified event. */
  async handleCalendlyWebhook(body: any): Promise<void> {
    const ev = body?.payload?.scheduled_event;
    if (!ev) return;
    const hostUri = ev.event_memberships?.[0]?.user as string | undefined;
    if (!hostUri) return;
    const tenant = await this.tenantsService.findByCalendlyUri(hostUri);
    if (!tenant) { this.logger.warn(`Calendly webhook: no tenant for host ${hostUri}`); return; }
    const externalId = (ev.uri || '').split('/').pop() || ev.uri;
    if (body.event === 'invitee.canceled') {
      await this.calendar.removeExternalEvent(tenant.id, 'calendly', externalId);
      return;
    }
    await this.calendar.upsertExternalEvent(tenant.id, {
      source: 'calendly', externalId,
      title: ev.name || 'Calendly meeting',
      start: ev.start_time, end: ev.end_time,
      location: ev.location?.location || ev.location?.type || '',
      joinUrl: ev.location?.join_url,
    });
  }

  /** Zoom meeting.created/updated/deleted → upsert/remove unified event. */
  async handleZoomCalendarWebhook(body: any): Promise<void> {
    const obj = body?.payload?.object;
    if (!obj) return;
    const hostId = obj.host_id as string | undefined;
    if (!hostId) return;
    const tenant = await this.tenantsService.findByZoomAccountId(hostId);
    if (!tenant) { this.logger.warn(`Zoom webhook: no tenant for host ${hostId}`); return; }
    const externalId = String(obj.id);
    if (body.event === 'meeting.deleted') {
      await this.calendar.removeExternalEvent(tenant.id, 'zoom', externalId);
      return;
    }
    await this.calendar.upsertExternalEvent(tenant.id, {
      source: 'zoom', externalId,
      title: obj.topic || 'Zoom meeting',
      start: obj.start_time,
      end: obj.start_time ? new Date(new Date(obj.start_time).getTime() + (obj.duration || 30) * 60000).toISOString() : undefined,
      description: obj.agenda || '',
      joinUrl: obj.join_url,
    });
  }

  async getStatus(tenantId: string): Promise<NonNullable<Tenant['integrations']>> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const raw = tenant.integrations;
    if (!raw || Array.isArray(raw)) return { whatsapp: null, facebook: null, api: null } as any;
    return raw;
  }

  private ensureUrl(url: string) {
    try {
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      throw new BadRequestException('Invalid callbackUrl');
    }
  }

  async connectApiConnector(params: {
    tenantId: string;
    key: IntegrationKey;
    name: string;
    callbackUrl: string;
  }): Promise<{ inboxId: string }>{
    const { tenantId, key, name, callbackUrl } = params;
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!name?.trim()) throw new BadRequestException('name is required');
    if (!callbackUrl?.trim()) throw new BadRequestException('callbackUrl is required');

    this.ensureUrl(callbackUrl.trim());

    const tenant = await this.tenantsService.getTenant(tenantId);
    
    const inboxId = `inbox_${Date.now()}`;
    const now = Date.now();
    const patch: Tenant['integrations'] = tenant.integrations || {};
    patch[key] = {
      type: 'api_connector',
      status: 'connected',
      name: name.trim(),
      inboxId,
      callbackUrl: callbackUrl.trim(),
      createdAt: (patch[key] as any)?.createdAt || now,
      updatedAt: now,
    } as any;

    await this.tenantsService.updateTenant(tenantId, { integrations: patch } as any);

    return { inboxId };
  }

  async connectNative(params: { tenantId: string; key: Exclude<IntegrationKey, 'api'> }) {
    throw new NotImplementedException('Native Chatwoot channel connection is not implemented yet');
  }

  async disconnect(params: { tenantId: string; key: IntegrationKey }): Promise<{ ok: true }> {
    const tenant = await this.tenantsService.getTenant(params.tenantId);
    const existing = tenant.integrations || {};
    if (!existing[params.key]) {
      return { ok: true };
    }

    existing[params.key] = {
      ...(existing[params.key] as any),
      status: 'disconnected',
      updatedAt: Date.now(),
    };

    await this.tenantsService.updateTenant(params.tenantId, { integrations: existing } as any);
    return { ok: true };
  }

  // ── Xero OAuth Handlers ──────────────────────────────────────────────────

  async handleXeroCallback(code: string, state: string) {
    // state should be the tenantId passed during the authorization URL generation
    const tenantId = state;
    if (!tenantId) throw new BadRequestException('No tenantId (state) provided');

    const tokenUrl = 'https://identity.xero.com/connect/token';
    const authHeader = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64');

    const response = await axios.post(tokenUrl, 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: (process.env.XERO_REDIRECT_URI || '').replace('/v1/integrations/', '/api/integrations/') || 'https://api.myflynai.com/api/integrations/xero/callback',
      }), {
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    const expiryDate = Date.now() + expires_in * 1000;

    // Get the Xero Tenant ID (needed for subsequent API calls)
    const connectionsResponse = await axios.get('https://api.xero.com/connections', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    const xeroTenantId = connectionsResponse.data[0]?.tenantId;

    const tenant = await this.tenantsService.getTenant(tenantId);
    const integrations = tenant.integrations || {};
    integrations.accounting = {
      ...integrations.accounting,
      xero: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiryDate,
        xeroTenantId,
        connectedAt: Date.now()
      }
    };

    await this.tenantsService.updateTenant(tenantId, { integrations });
    return { success: true };
  }

  // ── QuickBooks OAuth Handlers ──────────────────────────────────────────────

  async handleQuickBooksCallback(code: string, state: string, realmId: string) {
    const tenantId = state;
    if (!tenantId) throw new BadRequestException('No tenantId (state) provided');

    const tokenUrl = process.env.QUICKBOOKS_MODE === 'production' 
      ? 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'; // Same for both

    const authHeader = Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`).toString('base64');

    const response = await axios.post(tokenUrl, 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: (process.env.QUICKBOOKS_REDIRECT_URI || '').replace('/v1/integrations/', '/api/integrations/') || 'https://api.myflynai.com/api/integrations/quickbooks/callback',
      }), {
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    const expiryDate = Date.now() + expires_in * 1000;

    const tenant = await this.tenantsService.getTenant(tenantId);
    const integrations = tenant.integrations || {};
    integrations.accounting = {
      ...integrations.accounting,
      quickbooks: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiryDate,
        realmId,
        connectedAt: Date.now(),
        needsReconnect: false, // fresh connection — clear any stale reconnect flag
      }
    };

    await this.tenantsService.updateTenant(tenantId, { integrations });
    this.logger.log(`[qbo] tokens saved for tenant ${tenantId} realmId=${realmId} expiresIn=${expires_in}s`);
    return { success: true };
  }

  // ── Calendly OAuth Handlers ───────────────────────────────────────────────

  async handleCalendlyCallback(code: string, state: string) {
    const tenantId = state;
    if (!tenantId) throw new BadRequestException('No tenantId (state) provided');

    const redirectUri = process.env.CALENDLY_REDIRECT_URI
      || 'https://api.myflynai.com/api/integrations/calendly/callback';
    const authHeader = Buffer.from(
      `${process.env.CALENDLY_CLIENT_ID}:${process.env.CALENDLY_CLIENT_SECRET}`
    ).toString('base64');

    const tokenRes = await axios.post(
      'https://auth.calendly.com/oauth/token',
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      { headers: { Authorization: `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in, token_type } = tokenRes.data;

    // Fetch current user info to store their Calendly URI
    const userRes = await axios.get('https://api.calendly.com/users/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const calendlyUri = userRes.data?.resource?.uri ?? '';
    const calendlyName = userRes.data?.resource?.name ?? '';
    const calendlyOrg = userRes.data?.resource?.current_organization ?? '';

    // Register a webhook subscription so booked/canceled meetings flow into the
    // unified calendar (Phase 2). Best-effort — connection still succeeds if this fails.
    try {
      const callbackUrl = `${process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || ''}/api/integrations/webhooks/calendly`;
      if (calendlyOrg && callbackUrl) {
        await axios.post('https://api.calendly.com/webhook_subscriptions', {
          url: callbackUrl,
          events: ['invitee.created', 'invitee.canceled'],
          organization: calendlyOrg,
          scope: 'organization',
          signing_key: process.env.CALENDLY_WEBHOOK_SIGNING_KEY || undefined,
        }, { headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' } });
        this.logger.log(`Calendly webhook subscription registered for tenant ${tenantId}`);
      }
    } catch (err: any) {
      // 409 = already subscribed (fine); anything else is logged but non-fatal.
      this.logger.warn(`Calendly webhook subscription not created for ${tenantId}: ${err?.response?.data ? JSON.stringify(err.response.data) : err?.message}`);
    }

    const tenant = await this.tenantsService.getTenant(tenantId);
    const raw = tenant.integrations;
    const integrations: Record<string, any> = (raw && !Array.isArray(raw)) ? (raw as any) : {};
    integrations.calendly = {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiryDate: Date.now() + (expires_in ?? 3600) * 1000,
      calendlyUri,
      calendlyName,
      connectedAt: Date.now(),
      status: 'connected',
    };

    await this.tenantsService.updateTenant(tenantId, { integrations } as any);
    return { success: true };
  }

  // ── Zoom OAuth Handlers ───────────────────────────────────────────────────

  async handleZoomCallback(code: string, state: string) {
    const tenantId = state;
    if (!tenantId) throw new BadRequestException('No tenantId (state) provided');

    const redirectUri = process.env.ZOOM_REDIRECT_URI
      || 'https://api.myflynai.com/api/integrations/zoom/callback';
    const authHeader = Buffer.from(
      `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
    ).toString('base64');

    const tokenRes = await axios.post(
      'https://zoom.us/oauth/token',
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      { headers: { Authorization: `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Fetch Zoom user info
    const userRes = await axios.get('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const zoomUserId = userRes.data?.id ?? '';
    const zoomEmail = userRes.data?.email ?? '';
    const zoomName = `${userRes.data?.first_name ?? ''} ${userRes.data?.last_name ?? ''}`.trim();

    const tenant = await this.tenantsService.getTenant(tenantId);
    const raw = tenant.integrations;
    const integrations: Record<string, any> = (raw && !Array.isArray(raw)) ? (raw as any) : {};
    integrations.zoom = {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiryDate: Date.now() + (expires_in ?? 3600) * 1000,
      zoomUserId,
      zoomEmail,
      zoomName,
      connectedAt: Date.now(),
      status: 'connected',
    };

    await this.tenantsService.updateTenant(tenantId, { integrations } as any);
    return { success: true };
  }

  // ── Webhook Handlers ──────────────────────────────────────────────────────

  async handleXeroWebhook(payload: any) {
    // Xero webhooks send events in an array
    const events = payload.events || [];
    for (const event of events) {
      const xeroTenantId = event.tenantId;
      const tenant = await this.tenantsService.findByXeroTenantId(xeroTenantId);
      if (tenant) {
        this.logger.log(`Xero event ${event.eventType} for tenant ${tenant.id} (${tenant.name})`);
        // Here we would trigger a sync for the specific invoice/entity
      } else {
        this.logger.warn(`Xero webhook received for unknown Xero Tenant ID: ${xeroTenantId}`);
      }
    }
  }

  async handleQuickBooksWebhook(payload: any) {
    // QuickBooks webhooks send eventNotifications in an array
    const notifications = payload.eventNotifications || [];
    for (const notification of notifications) {
      const realmId = notification.realmId;
      const tenant = await this.tenantsService.findByQuickBooksRealmId(realmId);
      if (tenant) {
        this.logger.log(`QuickBooks notification for tenant ${tenant.id} (${tenant.name})`);
        // Here we would trigger a sync for the specific entities changed
      } else {
        this.logger.warn(`QuickBooks webhook received for unknown Realm ID: ${realmId}`);
      }
    }
  }
}
