import {
  Body, Controller, Get, Headers, Post, Query,
  HttpCode, Logger, UnauthorizedException, Req, Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationsService, IntegrationKey } from './integrations.service';
import * as crypto from 'crypto';

@ApiTags('Integrations')
@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(private readonly integrationsService: IntegrationsService) {}

  private tenantIdFromHeader(tenantId?: string): string {
    return (tenantId || '').trim();
  }

  // ── Generic Integration Routes ────────────────────────────────────────────

  @Get('status')
  async status(@Headers('x-tenant-id') tenantId?: string) {
    return this.integrationsService.getStatus(this.tenantIdFromHeader(tenantId));
  }

  @Post('connect')
  async connect(
    @Body() body: { key: IntegrationKey; mode: 'api_connector' | 'native_chatwoot'; name: string; callbackUrl: string },
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    const tid = this.tenantIdFromHeader(tenantId);
    if (body.mode === 'native_chatwoot') {
      return this.integrationsService.connectNative({ tenantId: tid, key: body.key as any });
    }
    return this.integrationsService.connectApiConnector({
      tenantId: tid,
      key: body.key,
      name: body.name,
      callbackUrl: body.callbackUrl,
    });
  }

  @Post('disconnect')
  async disconnect(
    @Body() body: { key: IntegrationKey },
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    return this.integrationsService.disconnect({
      tenantId: this.tenantIdFromHeader(tenantId),
      key: body.key,
    });
  }

  // ── Xero OAuth ────────────────────────────────────────────────────────────

  /** Step 1: Redirect the browser to Xero's authorization page */
  @Get('xero/connect')
  async xeroConnect(@Query('tenantId') tenantId: string, @Res() res: any) {
    const xeroRedirectUri = (process.env.XERO_REDIRECT_URI ?? '')
      .replace('/v1/integrations/', '/api/integrations/')
      || 'https://api.myflynai.com/api/integrations/xero/callback';

    const isLocalhostRedirect = xeroRedirectUri.includes('localhost') || xeroRedirectUri.includes('127.0.0.1');
    if (isLocalhostRedirect) {
      this.logger.warn(`Xero OAuth: redirect_uri is localhost (${xeroRedirectUri}) — external users will see a connection error`);
    }

    // Xero GRANULAR SCOPES (required for apps created on/after 2026-03-02; the old broad
    // `accounting.transactions` scope now returns invalid_scope for those apps). Granular
    // scopes also work for older apps, so this string is safe for every app:
    //   accounting.invoices       → invoices (read+write)
    //   accounting.payments       → payments (read+write)
    //   accounting.banktransactions → bank transactions / reconciliation
    //   accounting.contacts       → contacts (read+write)
    //   accounting.settings       → chart of accounts / org settings
    // Ref: https://developer.xero.com/faq/granular-scopes
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.XERO_CLIENT_ID ?? '',
      redirect_uri: xeroRedirectUri,
      scope: process.env.XERO_SCOPES || 'openid profile email accounting.contacts accounting.settings accounting.invoices accounting.payments accounting.banktransactions offline_access',
      state: tenantId || 'default',
    });
    this.logger.log(`Xero connect → client_id: ${(process.env.XERO_CLIENT_ID ?? '').slice(0, 8)}... redirect_uri: ${xeroRedirectUri}`);
    return res.redirect(`https://login.xero.com/identity/connect/authorize?${params.toString()}`);
  }

  /** Step 2: Xero redirects back here with the authorization code (or an error) */
  @Get('xero/callback')
  async xeroCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: any,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGINS?.split(',')[0]?.trim() || 'http://localhost:8081';
    this.logger.log(`Xero callback received — code: ${code ? code.slice(0, 10) + '...' : 'MISSING'}, state/tenantId: ${state || 'EMPTY'}${error ? `, error: ${error} (${errorDescription || ''})` : ''}`);

    // Xero redirected back with an OAuth error (e.g. wrong scopes, denied) instead of a code.
    // Surface the real reason rather than masking it as a generic token failure.
    if (error || !code) {
      const reason = errorDescription || error || 'No authorization code returned by Xero';
      this.logger.error(`Xero authorization rejected for tenant ${state}: ${reason}`);
      return res.redirect(`${frontendUrl}/dashboard/accounting?xero=error&reason=${encodeURIComponent(reason)}`);
    }

    try {
      await this.integrationsService.handleXeroCallback(code, state);
      this.logger.log(`Xero OAuth tokens saved successfully for tenant: ${state}`);
      return res.redirect(`${frontendUrl}/dashboard/accounting?xero=connected`);
    } catch (err: any) {
      const detail = err?.response?.data?.error_description || err?.response?.data?.error || err?.message || 'Token exchange failed';
      this.logger.error(`Xero callback FAILED for tenant ${state}: ${err?.response?.data ? JSON.stringify(err.response.data) : err?.message}`);
      return res.redirect(`${frontendUrl}/dashboard/accounting?xero=error&reason=${encodeURIComponent(detail)}`);
    }
  }

  /** Xero webhook URL verification challenge (GET) */
  @Get('webhooks/xero')
  @HttpCode(200)
  async xeroWebhookChallenge(@Query('challenge') challenge: string) {
    return challenge;
  }

  /** Xero live event webhook (POST) — HMAC-verified */
  @Post('webhooks/xero')
  @HttpCode(200)
  async xeroWebhook(
    @Req() req: any,
    @Body() body: any,
    @Headers('x-xero-signature') signature: string,
  ) {
    const webhookKey = process.env.XERO_WEBHOOK_KEY;
    if (webhookKey) {
      const hmac = crypto.createHmac('sha256', webhookKey);
      hmac.update(req.rawBody ?? JSON.stringify(body));
      const expected = hmac.digest('base64');
      if (signature !== expected) {
        this.logger.warn('Xero webhook signature verification failed');
        throw new UnauthorizedException('Invalid Xero webhook signature');
      }
    }
    this.logger.log(`Verified Xero Webhook event received`);
    await this.integrationsService.handleXeroWebhook(body);
    return { received: true };
  }

  // ── Calendly OAuth ───────────────────────────────────────────────────────

  @Get('calendly/connect')
  async calendlyConnect(@Query('tenantId') tenantId: string, @Res() res: any) {
    const redirectUri = process.env.CALENDLY_REDIRECT_URI
      || 'https://api.myflynai.com/api/integrations/calendly/callback';
    const params = new URLSearchParams({
      client_id: process.env.CALENDLY_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      state: tenantId || 'default',
    });
    this.logger.log(`Calendly connect redirect_uri: ${redirectUri}`);
    return res.redirect(`https://auth.calendly.com/oauth/authorize?${params.toString()}`);
  }

  @Get('calendly/callback')
  async calendlyCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: any,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.myflynai.com';
    await this.integrationsService.handleCalendlyCallback(code, state);
    return res.redirect(`${frontendUrl}/dashboard/calendars?calendly_connected=1`);
  }

  @Post('webhooks/calendly')
  @HttpCode(200)
  async calendlyWebhook(
    @Req() req: any,
    @Body() body: any,
    @Headers('calendly-webhook-signature') signature: string,
  ) {
    const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    if (signingKey && signature) {
      const [tPart, v1Part] = signature.split(',');
      const t = tPart?.replace('t=', '');
      const v1 = v1Part?.replace('v1=', '');
      if (t && v1) {
        const payload = `${t}.${req.rawBody ?? JSON.stringify(body)}`;
        const hmac = crypto.createHmac('sha256', signingKey);
        hmac.update(payload);
        const expected = hmac.digest('hex');
        if (expected !== v1) {
          this.logger.warn('Calendly webhook signature verification failed');
          throw new UnauthorizedException('Invalid Calendly webhook signature');
        }
      }
    }
    this.logger.log(`Calendly webhook event: ${body?.event}`);
    try { await this.integrationsService.handleCalendlyWebhook(body); }
    catch (err: any) { this.logger.error(`Calendly webhook handling failed: ${err?.message ?? err}`); }
    return { received: true };
  }

  // ── Zoom OAuth ────────────────────────────────────────────────────────────

  @Get('zoom/connect')
  async zoomConnect(@Query('tenantId') tenantId: string, @Res() res: any) {
    const redirectUri = process.env.ZOOM_REDIRECT_URI
      || 'https://api.myflynai.com/api/integrations/zoom/callback';
    const params = new URLSearchParams({
      client_id: process.env.ZOOM_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      state: tenantId || 'default',
    });
    this.logger.log(`Zoom connect redirect_uri: ${redirectUri}`);
    return res.redirect(`https://zoom.us/oauth/authorize?${params.toString()}`);
  }

  @Get('zoom/callback')
  async zoomCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: any,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.myflynai.com';
    await this.integrationsService.handleZoomCallback(code, state);
    return res.redirect(`${frontendUrl}/dashboard/calendars?zoom_connected=1`);
  }

  @Post('webhooks/zoom')
  @HttpCode(200)
  async zoomWebhook(
    @Req() req: any,
    @Body() body: any,
    @Headers('x-zm-signature') signature: string,
    @Headers('x-zm-request-timestamp') timestamp: string,
  ) {
    // Zoom URL validation challenge
    if (body?.event === 'endpoint.url_validation') {
      const secretToken = process.env.ZOOM_SECRET_TOKEN ?? '';
      const hashForValidate = crypto.createHmac('sha256', secretToken)
        .update(body.payload?.plainToken ?? '')
        .digest('hex');
      return { plainToken: body.payload?.plainToken, encryptedToken: hashForValidate };
    }
    // Verify signature
    const secretToken = process.env.ZOOM_SECRET_TOKEN ?? '';
    if (secretToken && signature) {
      const message = `v0:${timestamp}:${req.rawBody ?? JSON.stringify(body)}`;
      const expected = 'v0=' + crypto.createHmac('sha256', secretToken).update(message).digest('hex');
      if (expected !== signature) {
        this.logger.warn('Zoom webhook signature verification failed');
        throw new UnauthorizedException('Invalid Zoom webhook signature');
      }
    }
    this.logger.log(`Zoom webhook event: ${body?.event}`);
    if (typeof body?.event === 'string' && body.event.startsWith('meeting.')) {
      try { await this.integrationsService.handleZoomCalendarWebhook(body); }
      catch (err: any) { this.logger.error(`Zoom webhook handling failed: ${err?.message ?? err}`); }
    }
    return { received: true };
  }

  // ── QuickBooks OAuth ──────────────────────────────────────────────────────

  /** Step 1: Redirect the browser to Intuit's authorization page */
  @Get('quickbooks/connect')
  async quickbooksConnect(@Query('tenantId') tenantId: string, @Res() res: any) {
    const clientId = process.env.QUICKBOOKS_CLIENT_ID ?? '';
    const rawRedirectUri = process.env.QUICKBOOKS_REDIRECT_URI ?? '';
    const qbRedirectUri = rawRedirectUri.replace('/v1/integrations/', '/api/integrations/')
      || 'https://api.myflynai.com/api/integrations/quickbooks/callback';

    // Guard: if redirect_uri is localhost but request isn't local, the OAuth will fail at Intuit.
    // This prevents the cryptic "undefined didn't connect" error page.
    const isLocalhostRedirect = qbRedirectUri.includes('localhost') || qbRedirectUri.includes('127.0.0.1');
    if (isLocalhostRedirect && !clientId.startsWith('AB')) {
      return res.status(503).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>QuickBooks Not Configured</h2>
          <p>The production QuickBooks credentials are not set on this server. Please update QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, and QUICKBOOKS_REDIRECT_URI in the server environment.</p>
        </body></html>`);
    }
    if (isLocalhostRedirect) {
      this.logger.warn(`QuickBooks OAuth: redirect_uri is localhost (${qbRedirectUri}) — this will fail for external users`);
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: qbRedirectUri,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      state: tenantId || 'default',
    });
    this.logger.log(`QuickBooks connect → client_id: ${clientId.slice(0, 8)}... redirect_uri: ${qbRedirectUri}`);
    return res.redirect(`https://appcenter.intuit.com/connect/oauth2?${params.toString()}`);
  }

  /** Step 2: QuickBooks redirects back here with the authorization code */
  @Get('quickbooks/callback')
  async quickbooksCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('realmId') realmId: string,
    @Res() res: any,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGINS?.split(',')[0]?.trim() || 'http://localhost:8081';
    this.logger.log(`QuickBooks callback received — code: ${code ? code.slice(0, 10) + '...' : 'MISSING'}, state/tenantId: ${state || 'EMPTY'}, realmId: ${realmId || 'MISSING'}`);
    try {
      await this.integrationsService.handleQuickBooksCallback(code, state, realmId);
      this.logger.log(`QuickBooks OAuth tokens saved successfully for tenant: ${state}`);
      return res.redirect(`${frontendUrl}/dashboard/accounting?quickbooks=connected`);
    } catch (err: any) {
      this.logger.error(`QuickBooks callback FAILED for tenant ${state}: ${err?.response?.data ? JSON.stringify(err.response.data) : err?.message}`);
      return res.redirect(`${frontendUrl}/dashboard/accounting?quickbooks=error`);
    }
  }

  /** QuickBooks live event webhook (POST) */
  @Post('webhooks/quickbooks')
  @HttpCode(200)
  async quickbooksWebhook(
    @Body() body: any,
    @Headers('intuit-signature') signature: string,
  ) {
    this.logger.log(`QuickBooks webhook event received`);
    await this.integrationsService.handleQuickBooksWebhook(body);
    return { received: true };
  }
}
