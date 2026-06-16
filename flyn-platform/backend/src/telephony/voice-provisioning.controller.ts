import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { VoiceProvisioningService } from './voice-provisioning.service';
import { AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';

/**
 * Voice Provisioning routes.
 *   Client routes  → /api/voice-provisioning/*
 *   Admin routes   → /api/voice-provisioning/admin/*   (gated by assertAdmin)
 *
 * Admin gating reuses the codebase's existing convention: a Firebase custom claim
 * role of 'admin'/'owner', or uid === ADMIN_UID. Frontend NEVER receives Twilio creds.
 */
@Controller('voice-provisioning')
@UseGuards(ApiOrFirebaseAuthGuard)
export class VoiceProvisioningController {
  private readonly logger = new Logger(VoiceProvisioningController.name);

  constructor(private readonly provisioning: VoiceProvisioningService) {}

  private tenantId(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
  }

  private assertAdmin(req: AuthRequest): void {
    const role = req.firebaseUser?.['role'];
    const uid = req.firebaseUser?.uid;
    const isAdmin = role === 'admin' || role === 'owner' || uid === process.env.ADMIN_UID;
    if (!isAdmin) {
      this.logger.warn(`Forbidden admin access attempt by uid=${uid} role=${role}`);
      throw new ForbiddenException('Admin access required');
    }
  }

  // ─── Client routes ─────────────────────────────────────────────────────

  @Post('request-activation')
  @HttpCode(HttpStatus.OK)
  async requestActivation(@Req() req: AuthRequest) {
    return this.provisioning.requestActivation(this.tenantId(req), req.firebaseUser?.uid ?? '');
  }

  @Get('status')
  async getStatus(@Req() req: AuthRequest) {
    return this.provisioning.getActivationStatus(this.tenantId(req));
  }

  /**
   * Instant self-service allocation. First number free; additional numbers are
   * billable (returns requiresPayment until billing is configured).
   */
  @Post('allocate')
  @HttpCode(HttpStatus.OK)
  async allocate(@Body() body: { country?: string }, @Req() req: AuthRequest) {
    return this.provisioning.allocateNumber(this.tenantId(req), req.firebaseUser?.uid ?? '', {
      country: body?.country,
    });
  }

  @Patch('update-agent')
  @HttpCode(HttpStatus.OK)
  async updateAgent(@Body() body: { agentId: string }, @Req() req: AuthRequest) {
    if (!body?.agentId) throw new BadRequestException('agentId is required.');
    return this.provisioning.updateSelectedAgent(this.tenantId(req), body.agentId);
  }

  // ── Numbers (free first + paid additional) ───────────────────────────────

  @Get('numbers')
  async listNumbers(@Req() req: AuthRequest) {
    return this.provisioning.listNumbers(this.tenantId(req));
  }

  /** Create a Stripe subscription checkout ($1.15/mo) for an additional number. */
  @Post('numbers/checkout')
  @HttpCode(HttpStatus.OK)
  async createNumberCheckout(
    @Body() body: { country?: string; successUrl?: string; cancelUrl?: string },
    @Req() req: AuthRequest,
  ) {
    const email = req.firebaseUser?.email ?? '';
    return this.provisioning.createPaidNumberCheckout(this.tenantId(req), email, {
      country: body?.country,
      successUrl: body?.successUrl,
      cancelUrl: body?.cancelUrl,
    });
  }

  /** Bind a specific number's inbound calls to an AI agent (Dialer receptionist). */
  @Patch('numbers/:number/agent')
  @HttpCode(HttpStatus.OK)
  async setNumberAgent(
    @Param('number') number: string,
    @Body() body: { agentId: string },
    @Req() req: AuthRequest,
  ) {
    if (!number) throw new BadRequestException('number is required.');
    return this.provisioning.setNumberAgent(this.tenantId(req), number, body?.agentId ?? '');
  }

  /** Remove a number. Free → immediate; paid → cancel at period end (locked, no refund). */
  @Delete('numbers/:number')
  @HttpCode(HttpStatus.OK)
  async removeNumber(@Param('number') number: string, @Req() req: AuthRequest) {
    if (!number) throw new BadRequestException('number is required.');
    return this.provisioning.requestRemoveNumber(this.tenantId(req), number);
  }

  @Delete('deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Req() req: AuthRequest) {
    return this.provisioning.deactivateVoice(this.tenantId(req), req.firebaseUser?.uid ?? '');
  }

  // ─── Admin routes ──────────────────────────────────────────────────────

  @Get('admin/requests')
  async listRequests(@Req() req: AuthRequest) {
    this.assertAdmin(req);
    return this.provisioning.listRequests();
  }

  @Get('admin/active-tenants')
  async listActiveTenants(@Req() req: AuthRequest) {
    this.assertAdmin(req);
    return this.provisioning.listActiveTenants();
  }

  @Post('admin/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Body() body: { tenantId: string }, @Req() req: AuthRequest) {
    this.assertAdmin(req);
    if (!body?.tenantId) throw new BadRequestException('tenantId is required.');
    return this.provisioning.approveActivation(body.tenantId, req.firebaseUser?.uid ?? '');
  }

  @Post('admin/reject')
  @HttpCode(HttpStatus.OK)
  async reject(@Body() body: { tenantId: string; reason?: string }, @Req() req: AuthRequest) {
    this.assertAdmin(req);
    if (!body?.tenantId) throw new BadRequestException('tenantId is required.');
    return this.provisioning.rejectActivation(body.tenantId, body.reason ?? '', req.firebaseUser?.uid ?? '');
  }

  @Post('admin/add-number')
  @HttpCode(HttpStatus.CREATED)
  async addNumber(
    @Body()
    body: {
      number: string;
      twilioSid: string;
      country?: string;
      capabilities?: { voice: boolean; sms: boolean };
    },
    @Req() req: AuthRequest,
  ) {
    this.assertAdmin(req);
    if (!body?.number || !body?.twilioSid) {
      throw new BadRequestException('number and twilioSid are required.');
    }
    return this.provisioning.addNumberToPool(body.number, body.twilioSid, req.firebaseUser?.uid ?? '', {
      country: body.country,
      capabilities: body.capabilities,
    });
  }

  @Get('admin/pool')
  async listPool(@Req() req: AuthRequest) {
    this.assertAdmin(req);
    return this.provisioning.listPool();
  }

  /** One-shot backfill: re-point Voice webhooks on all assigned pool numbers. */
  @Post('admin/reconcile-webhooks')
  @HttpCode(HttpStatus.OK)
  async reconcileWebhooks(@Req() req: AuthRequest) {
    this.assertAdmin(req);
    return this.provisioning.reconcileWebhooks();
  }

  @Delete('admin/deactivate')
  @HttpCode(HttpStatus.OK)
  async adminDeactivate(@Body() body: { tenantId: string }, @Req() req: AuthRequest) {
    this.assertAdmin(req);
    if (!body?.tenantId) throw new BadRequestException('tenantId is required.');
    return this.provisioning.deactivateVoice(body.tenantId, req.firebaseUser?.uid ?? '');
  }
}
