import { BadRequestException, Body, Controller, Delete, Get, HttpCode, InternalServerErrorException, Logger, Param, Patch, Post, Res, UnauthorizedException, UseGuards, Req, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { TenantFromAuthInterceptor } from '../common/tenant-from-auth.interceptor';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { TenantsService, Tenant } from './tenants.service';
import { TenantPlanDashboardService } from './tenant-plan-dashboard.service';
import { FirebaseService } from '../firebase/firebase.service';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { MailService } from '../mail/mail.service';
import { Public } from '../billing/guards/public.decorator';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  private readonly logger = new Logger(TenantsController.name);

  constructor(
    private readonly tenants: TenantsService,
    private readonly dashboard: TenantPlanDashboardService,
    private readonly firebase: FirebaseService,
    private readonly mail: MailService,
  ) {}

  private tenantIdFromReq(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
  }

  @Get()
  @UseGuards(ApiOrFirebaseAuthGuard)
  list(@Req() req: AuthRequest): Promise<Tenant[]> {
    // Return only the requesting user's own tenant — prevents cross-tenant data leakage
    const tenantId = this.tenantIdFromReq(req);
    return tenantId ? this.tenants.getTenant(tenantId).then((t) => [t]).catch(() => []) : Promise.resolve([]);
  }

  @Get('me')
  @UseGuards(ApiOrFirebaseAuthGuard)
  me(@Req() req: AuthRequest): Promise<Tenant> {
    return this.tenants.getTenant(this.tenantIdFromReq(req));
  }

  @Get('me/plan')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getPlan(@Req() req: AuthRequest) {
    const tenantId = this.tenantIdFromReq(req);
    return this.tenants.getTenantPlan(tenantId);
  }

  @Get('me/plan-dashboard')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getPlanDashboard(@Req() req: AuthRequest) {
    const tenantId = this.tenantIdFromReq(req);
    return this.dashboard.getDashboard(tenantId);
  }

  @Patch('me')
  @UseGuards(ApiOrFirebaseAuthGuard)
  patchMe(
    @Req() req: AuthRequest,
    @Body() body: Partial<Omit<Tenant, 'id' | 'createdAt'>>,
  ): Promise<Tenant> {
    return this.tenants.updateTenant(this.tenantIdFromReq(req), body);
  }

  /** True MFA enrollment for the logged-in user, read from Firebase (server truth). */
  @Get('me/mfa-status')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async mfaStatus(@Req() req: AuthRequest) {
    const uid = req.firebaseUser?.uid;
    const auth = this.firebase.auth();
    if (!uid || !auth) return { enrolled: false };
    try {
      const u = await auth.getUser(uid);
      return { enrolled: (u.multiFactor?.enrolledFactors?.length ?? 0) > 0 };
    } catch {
      return { enrolled: false };
    }
  }

  /**
   * Disable MFA for the logged-in user by clearing ALL enrolled factors via the
   * Admin SDK — reliable (no client recent-login requirement, removes every factor,
   * not just the first). After this, login won't require an OTP.
   */
  @Post('me/disable-mfa')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(200)
  async disableMfa(@Req() req: AuthRequest) {
    const uid = req.firebaseUser?.uid;
    const auth = this.firebase.auth();
    if (!uid || !auth) throw new BadRequestException('Not authenticated');
    await auth.updateUser(uid, { multiFactor: { enrolledFactors: null } });
    this.logger.log(`MFA disabled (all factors cleared) for uid ${uid}`);
    return { disabled: true };
  }

  @Get('me/export')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async exportMe(@Req() req: AuthRequest, @Res() res: Response) {
    const tenantId = this.tenantIdFromReq(req);
    const tenant = await this.tenants.getTenant(tenantId);
    const safe = { ...tenant };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="flyn-workspace-export-${tenantId}.json"`);
    res.send(JSON.stringify(safe, null, 2));
  }

  @Delete('me')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(200)
  async deleteMe(@Req() req: AuthRequest) {
    const tenantId = this.tenantIdFromReq(req);
    const uid = req.firebaseUser?.uid;
    // Delete Firebase user if UID is known
    if (uid) {
      await this.firebase.auth()?.deleteUser(uid).catch((err: Error) => {
        this.logger.warn(`Could not delete Firebase user ${uid}: ${err?.message}`);
      });
    }
    await this.tenants.deleteTenant(tenantId);
    return { success: true, message: 'Account and workspace data deleted.' };
  }

  @Post()
  create(@Body() body: { name: string; domain?: string }): Promise<Tenant> {
    return this.tenants.createTenant({ name: body.name, domain: body.domain });
  }

  // NOTE: must be declared BEFORE @Get(':id') — otherwise 'verify-ip' is
  // captured as an :id param and the request 404s with "Tenant not found".
  @Get('verify-ip')
  @Public()
  async verifyIp(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const db = this.firebase.firestore();
    if (!db) {
      throw new InternalServerErrorException('Firestore is not available');
    }
    const snap = await db.collection('ip_verification_tokens').where('token', '==', token).get();
    if (snap.empty) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    const doc = snap.docs[0];
    const data = doc.data();
    // Token expires in 15 minutes
    if (Date.now() - data.createdAt > 15 * 60 * 1000) {
      await doc.ref.delete();
      throw new BadRequestException('Verification token has expired. Please log in again.');
    }

    // Add IP to tenant's verifiedIps
    const tenant = await this.tenants.getTenant(data.tenantId);
    const verifiedIps = tenant.verifiedIps || [];
    if (!verifiedIps.includes(data.ip)) {
      verifiedIps.push(data.ip);
      await this.tenants.updateTenant(data.tenantId, { verifiedIps });
    }

    // Delete the token
    await doc.ref.delete();

    // Redirect to frontend dashboard
    const frontendUrl = process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:8081';
    return res.redirect(`${frontendUrl}/dashboard?ip_verified=true`);
  }

  @Get(':id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  get(@Param('id') id: string): Promise<Tenant> {
    return this.tenants.getTenant(id);
  }

  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Body() body: Partial<Omit<Tenant, 'id' | 'createdAt'>>,
  ): Promise<Tenant> {
    return this.tenants.updateTenant(id, body);
  }

  @Post('provision')
  async provision(
    @Body() body: { idToken: string; name?: string; domain?: string; role?: 'admin' | 'manager' | 'agent'; inviteCode?: string },
  ): Promise<{ tenant: Tenant; claims: Record<string, any> }> {
    this.logger.log(`[PROVISION] Starting provisioning request`, { name: body?.name, hasInviteCode: !!body?.inviteCode });

    if (!body?.idToken) {
      this.logger.warn('[PROVISION] Missing idToken');
      throw new BadRequestException('idToken is required');
    }

    // name is only required when NOT using an invite code
    if (!body?.inviteCode && !body?.name) {
      this.logger.warn('[PROVISION] Missing name (required for non-invite signups)');
      throw new BadRequestException('name is required');
    }

    // Verify Firebase ID token and get UID + email
    let uid: string;
    let userEmail: string;
    try {
      this.logger.log('[PROVISION] Verifying Firebase ID token');
      const decoded = await this.firebase.verifyIdToken(body.idToken);
      uid = decoded.uid;
      userEmail = decoded.email || '';
      this.logger.log('[PROVISION] Token verified successfully', { uid });
    } catch (err) {
      this.logger.warn('[PROVISION] Invalid Firebase ID token', { error: (err as Error).message });
      throw new UnauthorizedException('Invalid Firebase ID token');
    }

    // Check if user already has claims (idempotent provision)
    let existingClaims: Record<string, any> | undefined;
    try {
      const user = await this.firebase.auth()?.getUser(uid);
      existingClaims = user?.customClaims;
      userEmail = userEmail || user?.email || '';
      if (existingClaims?.organization_id) {
        this.logger.log('[PROVISION] User already has organization_id, returning existing tenant', {
          uid,
          organizationId: existingClaims.organization_id
        });
        const existingTenant = await this.tenants.getTenant(existingClaims.organization_id);
        return { tenant: existingTenant, claims: existingClaims };
      }
    } catch (err) {
      this.logger.debug('[PROVISION] Could not fetch existing claims (OK for new users)', { error: (err as Error).message });
    }

    // ── INVITE CODE PATH ────────────────────────────────────────────────────────
    // If an invite code was provided, validate it and wire the user to the
    // existing organization instead of creating a new tenant.
    if (body.inviteCode?.trim()) {
      const code = body.inviteCode.trim();
      this.logger.log('[PROVISION] Invite code provided, looking up invitation', { code });

      const db = this.firebase.firestore();
      if (!db) throw new InternalServerErrorException('Firestore not available');

      const inviteSnap = await db.collection('invitations')
        .where('code', '==', code)
        .where('used', '==', false)
        .limit(1)
        .get();

      if (inviteSnap.empty) {
        throw new BadRequestException('Invalid or already used invite code');
      }

      const inviteData = inviteSnap.docs[0].data();

      const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
      if (Date.now() - inviteData.createdAt > INVITE_TTL_MS) {
        throw new BadRequestException('Invite code has expired');
      }

      if (userEmail && inviteData.email && userEmail.toLowerCase() !== inviteData.email.toLowerCase()) {
        this.logger.warn('[PROVISION] Invite email mismatch', { userEmail, inviteEmail: inviteData.email });
        throw new BadRequestException(`This invite was sent to ${inviteData.email}. Please sign up with that email address.`);
      }

      const { tenantId, role } = inviteData;
      const now = Date.now();

      // Set claims — spread existing to preserve plan and other fields
      const claims = { ...(existingClaims ?? {}), organization_id: tenantId, role };
      await this.firebase.setCustomUserClaims(uid, claims);

      // Write team_members record
      await db.collection('team_members').doc(uid).set({
        uid,
        tenantId,
        email: userEmail.toLowerCase(),
        name: '',
        role,
        permissions: role === 'admin'
          ? { accessCRM: true, manageUsers: true, editSettings: true }
          : role === 'manager'
          ? { accessCRM: true, manageUsers: true, editSettings: true }
          : { accessCRM: true, manageUsers: false, editSettings: false },
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      // Mark invite used
      await inviteSnap.docs[0].ref.update({ used: true, usedAt: now, usedBy: uid });

      this.logger.log('[PROVISION] Invite join complete', { uid, tenantId, role });

      const tenant = await this.tenants.getTenant(tenantId);
      return { tenant, claims };
    }
    // ────────────────────────────────────────────────────────────────────────────

    // Create tenant (handled in service)
    let tenant: Tenant;
    try {
      this.logger.log('[PROVISION] Creating new tenant', { name: body.name, domain: body.domain });
      tenant = await this.tenants.createTenant({ name: body.name!, domain: body.domain });
      this.logger.log('[PROVISION] Tenant created successfully', { tenantId: tenant.id });
    } catch (err) {
      this.logger.error('[PROVISION] Failed to create tenant', (err as Error).message, (err as Error).stack);
      throw new InternalServerErrorException('Failed to create tenant');
    }

    // Set custom claims — spread existing to preserve plan and other fields
    const claims = {
      ...(existingClaims ?? {}),
      organization_id: tenant.id,
      role: body.role || 'admin',
    };
    try {
      this.logger.log('[PROVISION] Setting custom claims', { uid, claims });
      await this.firebase.setCustomUserClaims(uid, claims);
      this.logger.log('[PROVISION] Custom claims set successfully', { uid, tenantId: tenant.id });
    } catch (err) {
      this.logger.error('[PROVISION] Failed to set custom claims', (err as Error).message, (err as Error).stack);
      throw new InternalServerErrorException('Failed to set user claims');
    }

    // Send welcome email (asynchronous, don't block response)
    this.logger.log('[PROVISION] Scheduling welcome email', { uid });
    this.firebase.auth()?.getUser(uid).then(user => {
      if (user.email) {
        this.logger.log('[PROVISION] Sending welcome email to', { email: user.email });
        this.mail.sendWelcomeEmail(user.email, user.displayName || body.name || 'User').catch(err => {
          this.logger.error(`[PROVISION] Failed to send welcome email: ${err.message}`);
        });
      }
    }).catch(err => {
      this.logger.warn(`[PROVISION] Could not fetch user for welcome email: ${err.message}`);
    });

    this.logger.log('[PROVISION] Provision complete', { tenantId: tenant.id, uid });
    return { tenant, claims };
  }

  @Post('me/upload')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadFile(
    @Req() req: AuthRequest,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    try {
      const tenantId = this.tenantIdFromReq(req);
      const fieldname: string = (req.body?.fieldname as string) ?? 'logo';
      const base64 = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${base64}`;

      // Persist in Firestore keyed by fieldname
      const db = this.firebase.firestore();
      if (db) {
        const doc = { tenantId, fieldname, data: base64, mimetype: file.mimetype, uploadedAt: new Date().toISOString() };
        await db.collection('file_uploads').doc(`${tenantId}-${fieldname}`).set(doc)
          .catch(err => this.logger.warn(`Firestore persist failed: ${err.message}`));
        // Logo uploads: also save under the canonical 'logo' key so GET /tenants/logo/:id can serve it
        if (fieldname === 'companyLogo' || fieldname === 'logo') {
          await db.collection('file_uploads').doc(`${tenantId}-logo`).set({ ...doc, fieldname: 'logo' })
            .catch(err => this.logger.warn(`Firestore logo-key persist failed: ${err.message}`));
        }
      }

      // For logo uploads, return the public backend URL so emails can display it.
      // Falls back to data URI only for non-logo fields (profile pics etc).
      const isLogoUpload = fieldname === 'companyLogo' || fieldname === 'logo';
      const publicBase = (process.env.PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
      if (isLogoUpload && publicBase && !publicBase.includes('localhost')) {
        return { success: true, url: `${publicBase}/api/tenants/logo/${tenantId}` };
      }
      return { success: true, url: dataUri };
    } catch (err) {
      this.logger.error(`Failed to process file: ${(err as Error).message}`);
      throw new InternalServerErrorException('Failed to process file');
    }
  }

  @Get('logo/:tenantId')
  async getLogo(@Param('tenantId') tenantId: string, @Res() res: Response) {
    try {
      const db = this.firebase.firestore();
      if (!db) throw new InternalServerErrorException('Firestore not available');

      const doc = await db.collection('file_uploads').doc(`${tenantId}-logo`).get();
      if (!doc.exists) {
        return res.status(404).send('Logo not found');
      }

      const data = doc.data() as any;
      const buffer = Buffer.from(data.data, 'base64');

      res.setHeader('Content-Type', data.mimetype || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch (err) {
      this.logger.error(`Failed to retrieve logo: ${(err as Error).message}`);
      res.status(500).send('Failed to retrieve logo');
    }
  }

}
