import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { UsageService, MetricKey, UsageCounter } from './usage.service';

const VALID_METRICS: MetricKey[] = [
  'messages.sent',
  'calls.minutes',
  'ai.tokens',
  'webchat.sessions',
  'storage.gb',
  'whatsapp.conversations',
];

class IncrementDto {
  @IsIn(VALID_METRICS)
  metricKey: MetricKey;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  period?: string;
}

/**
 * UsageController
 *
 * GET  /api/usage/me              — Current period counters for the tenant
 * POST /api/usage/increment       — Increment a metric (called by backend services)
 *
 * The GET endpoint is used by the frontend UsageContext to hydrate/sync
 * server-side counters with the client's local state.
 *
 * The POST endpoint is intended for internal backend-to-backend calls
 * (e.g., ChannelsService calling it after sending a WhatsApp message).
 * It is also exposed here for authorized SDK/API-key clients.
 */
@Controller('usage')
@UseGuards(ApiOrFirebaseAuthGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  private tenantId(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '');
  }

  @Get('me')
  getCounters(
    @Req() req: AuthRequest,
    @Query('period') period?: string,
  ): Promise<UsageCounter[]> {
    return this.usageService.getCounters(this.tenantId(req), period);
  }

  @Post('increment')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async increment(
    @Req() req: AuthRequest,
    @Body() dto: IncrementDto,
  ): Promise<{ metricKey: MetricKey; used: number; period: string }> {
    const tenantId = this.tenantId(req);
    const used = await this.usageService.increment(
      tenantId,
      dto.metricKey,
      dto.amount ?? 1,
      dto.period,
    );
    const period = dto.period ?? this.currentPeriod();
    return { metricKey: dto.metricKey, used, period };
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
