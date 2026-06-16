import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { TelephonyService } from './telephony.service';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { Public } from '../billing/guards/public.decorator';
import { TenantsService } from '../tenants/tenants.service';

@Controller('telephony')
@UseGuards(ApiOrFirebaseAuthGuard)
export class TelephonyController {
  private readonly logger = new Logger(TelephonyController.name);

  constructor(
    private readonly telephony: TelephonyService,
    private readonly tenantsService: TenantsService,
  ) {}

  private tenantId(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
  }

  /**
   * GET /api/telephony/status
   * Returns Flyn-managed telephony status (sms + voice) for the authed tenant.
   * Response is client-safe — no internal Twilio/VAPI IDs are included.
   */
  @Get('status')
  async getStatus(@Req() req: AuthRequest) {
    return this.telephony.getStatus(this.tenantId(req));
  }

  /**
   * GET /api/telephony/voice/config
   * Returns VAPI public key + assistant ID for the browser Dialer (read-only, safe).
   */
  @Get('voice/config')
  async getVoiceConfig(@Req() req: AuthRequest) {
    return this.telephony.getVoiceConfig(this.tenantId(req));
  }

  /**
   * POST /api/telephony/sms/activate
   * Provisions a Flyn-managed SMS number for the tenant.
   * Body: { countryCode?: string }   — defaults to 'US'
   */
  @Post('sms/activate')
  @HttpCode(HttpStatus.OK)
  async activateSms(
    @Body() body: { countryCode?: string },
    @Req() req: AuthRequest,
  ) {
    try {
      const result = await this.telephony.activateSms(this.tenantId(req), body.countryCode ?? 'US');
      return { success: true, ...result };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  /**
   * DELETE /api/telephony/sms
   * Releases the tenant's Flyn SMS number.
   */
  @Delete('sms')
  @HttpCode(HttpStatus.OK)
  async deactivateSms(@Req() req: AuthRequest) {
    await this.telephony.deactivateSms(this.tenantId(req));
    return { success: true };
  }

  /**
   * POST /api/telephony/voice/activate
   * Provisions a Flyn-managed Voice + AI number for the tenant.
   * Body: { countryCode?: string }
   */
  @Post('voice/activate')
  @HttpCode(HttpStatus.OK)
  async activateVoice(
    @Body() body: { countryCode?: string },
    @Req() req: AuthRequest,
  ) {
    try {
      const result = await this.telephony.activateVoice(this.tenantId(req), body.countryCode ?? 'US');
      return { success: true, ...result };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  /**
   * DELETE /api/telephony/voice
   * Releases the tenant's Flyn Voice number and VAPI assistant.
   */
  @Delete('voice')
  @HttpCode(HttpStatus.OK)
  async deactivateVoice(@Req() req: AuthRequest) {
    await this.telephony.deactivateVoice(this.tenantId(req));
    return { success: true };
  }

  /**
   * POST /api/telephony/voice/provider
   * Update the calling provider choice (twilio or vapi) for the tenant.
   */
  @Post('voice/provider')
  @HttpCode(HttpStatus.OK)
  async updateVoiceProvider(
    @Body() body: { aiProvider: 'twilio' | 'vapi' },
    @Req() req: AuthRequest,
  ) {
    if (body.aiProvider !== 'twilio' && body.aiProvider !== 'vapi') {
      throw new BadRequestException('Invalid provider choice');
    }
    const result = await this.telephony.updateVoiceProvider(this.tenantId(req), body.aiProvider);
    return { success: true, voice: result };
  }

  // ─── Inbound webhooks (public — Twilio posts here) ─────────────────────────

  /**
   * POST /api/telephony/webhook/sms
   * Twilio posts inbound SMS events here.
   * Query: tenantId — used to route to the correct tenant's inbox.
   */
  @Public()
  @Post('webhook/sms')
  @HttpCode(HttpStatus.OK)
  async smsWebhook(
    @Body() payload: any,
    @Query('tenantId') tenantId: string,
  ) {
    this.logger.log(`Inbound SMS webhook for tenant ${tenantId}: From=${payload.From} Body=${payload.Body?.slice(0, 80)}`);
    // TODO: push to DynamoDB inbox (same pattern as channels/inbound-webhooks.controller.ts)
    // For now: acknowledge Twilio with empty TwiML
    return '<Response></Response>';
  }

  /**
   * POST /api/telephony/webhook/voice
   * Twilio posts inbound voice call events here.
   * Responds with TwiML that bridges the call to VAPI via <Connect>.
   */
  @Public()
  @Post('webhook/voice')
  @HttpCode(HttpStatus.OK)
  async voiceWebhook(
    @Body() payload: any,
    @Query('tenantId') tenantId: string,
  ) {
    this.logger.log(`Inbound voice call for tenant ${tenantId}: From=${payload.From}`);
    const tenant = await this.tenantsService.getTenant(tenantId).catch(() => null);
    const tel = (tenant as any)?.telephony ?? {};
    const aiProvider = tel.voice?.aiProvider;
    const isFlyn = (tenant as any)?.isFlynPlatform === true;

    // TWILIO IS THE DEFAULT. Route inbound to the Twilio + Gemini speech loop UNLESS the tenant
    // has EXPLICITLY chosen VAPI (aiProvider === 'vapi'). Previously this required
    // aiProvider === 'twilio', but the provisioning flow writes the number to `flynVoice` and
    // never sets `telephony.voice.aiProvider` — so aiProvider was always undefined and every
    // inbound call fell through to VAPI (unconfigured for pool tenants), answering "this number
    // is not yet configured". Defaulting to Twilio fixes inbound for every allocated pool number.
    if (aiProvider !== 'vapi') {
      // Hand over to the Gemini speech loop
      const backendUrl = process.env.PUBLIC_BACKEND_URL || 'http://localhost:3000';
      const voiceUrl = `${backendUrl}/api/channels/webhook/twilio/inbound-voice?tenantId=${tenantId}`;
      this.logger.log(`[inbound] tenant ${tenantId} → Twilio/Gemini (aiProvider=${aiProvider ?? 'default'}, isFlyn=${isFlyn})`);
      return `<Response><Redirect>${voiceUrl}</Redirect></Response>`;
    }
    this.logger.log(`[inbound] tenant ${tenantId} → VAPI (explicitly selected)`);

    // Explicitly selected VAPI provider
    // Return TwiML that connects to VAPI — VAPI handles the AI conversation
    const vapiConfig = await this.telephony.getVoiceConfig(tenantId).catch(() => null);
    const assistantId = vapiConfig?.vapiAssistantId ?? '';

    if (!assistantId) {
      // Fallback: plain message if voice not configured
      return `<Response><Say>This number is not yet configured. Please try again later.</Say></Response>`;
    }

    // Bridge to VAPI via SIP
    return `<Response>
  <Connect>
    <Stream url="wss://api.vapi.ai/twilio">
      <Parameter name="assistantId" value="${assistantId}" />
    </Stream>
  </Connect>
</Response>`;
  }
}
