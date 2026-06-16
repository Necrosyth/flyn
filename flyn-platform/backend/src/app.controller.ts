import { Body, Controller, Get, Post, UnauthorizedException, Req, Res, Logger, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppService } from './app.service';
import { FirebaseService } from './firebase/firebase.service';
import { WebsiteBuilderService } from './website-builder/website-builder.service';
import { Public } from './billing/guards/public.decorator';


@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly firebase: FirebaseService,
    private readonly websiteBuilder: WebsiteBuilderService,
  ) {}

  @Public()
  @Get('health')
  healthCheck(@Res() res: Response) {
    res.status(200).json({ status: 'ok', service: 'flyn-backend', timestamp: new Date().toISOString() });
  }

  @Public()
  @Get('.well-known/acme-challenge/:token')
  async handleAcmeChallenge(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Serve ACME challenge validation
    // Expected format: token.signature
    // For test.myflynai.com, we return a dummy response to indicate the server is reachable
    // Cloudflare will validate once it confirms HTTP connectivity
    const token = req.params.token;
    this.logger.log(`[ACME] Challenge request for token: ${token}`);

    // Return the challenge token as-is (Cloudflare expects token.signature format)
    // We return the full validation string if available, otherwise just the token
    const response = `${token}.dummysignature`;

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(response);
  }

  @Public()
  @Get()
  async handleRoot(
    @Req() req: Request,
    @Res() res: Response,
    @Query('domain') domainParam?: string,
  ) {
    // Fast-path for health checks from App Runner (internal IP 169.254.*)
    // This prevents slow database lookups from timing out the health check
    const clientIp = req.ip || req.socket?.remoteAddress || '';
    const isInternalHealth = clientIp.startsWith('169.254.') || clientIp.startsWith('127.0.0.1') || clientIp.startsWith('localhost');

    if (isInternalHealth) {
      res.status(200).json({ status: 'ok', service: 'flyn-backend', timestamp: new Date().toISOString() });
      return;
    }

    // DEBUG: Log everything about the incoming request
    this.logger.log(`[DEBUG] ===== REQUEST DETAILS =====`);
    this.logger.log(`[DEBUG] req.url: ${req.url}`);
    this.logger.log(`[DEBUG] (req as any).originalUrl: ${(req as any).originalUrl}`);
    this.logger.log(`[DEBUG] (req as any).baseUrl: ${(req as any).baseUrl}`);
    this.logger.log(`[DEBUG] req.query (full object): ${JSON.stringify(req.query)}`);
    this.logger.log(`[DEBUG] @Query('domain') param: ${domainParam}`);
    this.logger.log(`[DEBUG] ALL HEADERS: ${JSON.stringify(req.headers)}`);
    this.logger.log(`[DEBUG] req.method: ${req.method}`);
    this.logger.log(`[DEBUG] ===== END DEBUG =====`);

    // Then try standard proxy headers
    let host = domainParam ||
               (req.headers['cf-original-host'] as string) ||
               (req.headers['x-forwarded-host'] as string) ||
               (req.headers['x-forwarded-proto'] === 'https' ? (req.socket as any).servername : '') ||
               req.headers.host || '';

    // Fallback: if host is internal IP and we know this is a custom domain request via Cloudflare,
    // check if there's a matching custom hostname in DB by looking up what domain might be trying to access us
    // This is a workaround for when Cloudflare doesn't properly forward headers

    // Extract domain without port
    const hostWithoutPort = host.split(':')[0];

    this.logger.log(`[ROOT] INCOMING: host=${host}, hostWithoutPort=${hostWithoutPort}, domainParam=${domainParam}, cf-original-host=${req.headers['cf-original-host']}, x-forwarded-host=${req.headers['x-forwarded-host']}, sni=${(req.socket as any).servername}, raw-host=${req.headers.host}`);

    // If host is primary platform domain, return hello
    // Note: be specific to avoid matching custom domains like "test.myflynai.com"
    const isPlatformDomain =
      hostWithoutPort === 'api.myflynai.com' ||
      hostWithoutPort === 'app.myflynai.com' ||
      hostWithoutPort === 'esim.myflynai.com' ||
      hostWithoutPort === 'myflynai.com' ||
      hostWithoutPort.includes('localhost') ||
      hostWithoutPort.includes('127.0.0.1');

    this.logger.log(`[ROOT] isPlatformDomain=${isPlatformDomain}, host=${hostWithoutPort}, will resolve custom domain: ${!isPlatformDomain}`);

    if (!isPlatformDomain) {
      try {
        this.logger.log(`[ROOT] Attempting to resolve website for domain: ${hostWithoutPort}`);
        const website = await this.websiteBuilder.resolveWebsiteByDomain(hostWithoutPort);
        this.logger.log(`[ROOT] Website resolved: ${website ? 'YES - id=' + website.id + ', hasHtml=' + !!website.html : 'NO'}`);

        if (website && website.html) {
          this.logger.log(`[ROOT] Sending HTML response, length=${website.html.length}`);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('X-Frame-Options', 'SAMEORIGIN');
          res.status(200);
          res.send(website.html);
          this.logger.log(`[ROOT] HTML response sent successfully`);
          return;
        } else {
          this.logger.warn(`[ROOT] Website found but no HTML: website=${!!website}, html=${website?.html ? 'exists' : 'missing'}`);
        }
      } catch (err: any) {
        this.logger.error(`[ROOT] Error resolving website for host ${hostWithoutPort}: ${err.message}`, err.stack);
      }
    }

    this.logger.log(`[ROOT] Returning platform response (not a custom domain or resolution failed)`);
    res.status(200);
    res.setHeader('Content-Type', 'text/plain');
    res.send(this.appService.getHello());
    return;
  }

  @Public()
  @Post('auth/dev-token')
  async devToken(
    @Body() body: { email?: string; uid?: string },
    @Req() req: Request,
  ): Promise<{ customToken: string }> {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Not available in production');
    }
    const origin = req.headers['origin'] as string || '';
    const host = req.headers['host'] as string || '';
    const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1') ||
                    host.includes('localhost') || host.includes('127.0.0.1');
    if (!isLocal) {
      throw new UnauthorizedException('Only available on localhost');
    }
    if (!body?.email && !body?.uid) {
      throw new UnauthorizedException('Email or UID is required');
    }
    const fbAuth = this.firebase.auth();
    if (!fbAuth) throw new UnauthorizedException('Firebase not initialized');
    let uid = body.uid;
    let existingClaims: Record<string, unknown> = {};
    if (!uid) {
      const user = await this.firebase.getUserByEmail(body.email!);
      uid = user.uid;
      existingClaims = (user.customClaims as Record<string, unknown>) || {};
    } else {
      const user = await fbAuth.getUser(uid);
      existingClaims = (user.customClaims as Record<string, unknown>) || {};
    }
    // Pass existing custom claims so the resulting ID token has organization_id/role from the start,
    // preventing the tenant fetch from failing on the first load after MFA bypass.
    const customToken = await fbAuth.createCustomToken(uid, existingClaims);
    this.logger.log(`[DEV] Issued custom token for ${body.email ?? body.uid} (${uid}) with claims: ${JSON.stringify(Object.keys(existingClaims))}`);
    return { customToken };
  }

  @Post('admin/bootstrap-owner')
  async bootstrapOwner(
    @Body() body: { secret: string; email: string; password?: string },
  ): Promise<{ ok: true; uid: string; email: string; claims: Record<string, any> }> {
    const expected = process.env.OWNER_BOOTSTRAP_SECRET;
    if (!expected || body?.secret !== expected) {
      throw new UnauthorizedException('Invalid bootstrap secret');
    }

    const allowListRaw = process.env.OWNER_EMAILS || process.env.OWNER_EMAIL;
    const allowedEmails = (allowListRaw || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const requestedEmail = (body?.email || '').trim().toLowerCase();
    if (!requestedEmail) {
      throw new UnauthorizedException('Email not allowed');
    }

    if (allowedEmails.length && !allowedEmails.includes(requestedEmail)) {
      throw new UnauthorizedException('Email not allowed');
    }

    const user = await this.firebase.getOrCreateUserByEmailWithPassword(
      requestedEmail,
      body?.password,
    );
    const existing = (user.customClaims || {}) as Record<string, any>;
    const claims = { ...existing, role: 'owner' };
    await this.firebase.setCustomUserClaims(user.uid, claims);

    return { ok: true, uid: user.uid, email: body.email, claims };
  }
}
