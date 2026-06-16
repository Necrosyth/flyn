import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard, AuthRequest } from '../guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../guards/api-or-firebase-auth.guard';
import { EntitlementService } from './entitlement.service';
import { PLAN_USAGE_LIMITS } from './plan-entitlements';

class CheckFeatureDto {
  featureKey: string;
}

class CheckUsageDto {
  metricKey: string;
  amount?: number;
}

/**
 * EntitlementController
 *
 * GET  /api/entitlements/me            — Tenant's resolved plan + all feature flags
 * POST /api/entitlements/feature-check — Check if a specific feature is allowed
 * POST /api/entitlements/usage-check   — Check if a usage action can proceed
 *
 * These endpoints let the frontend verify plan entitlements server-side,
 * providing a secondary check beyond the client-side PlanContext.
 */
@Controller('entitlements')
@UseGuards(ApiOrFirebaseAuthGuard)
export class EntitlementController {
  constructor(private readonly entitlementService: EntitlementService) {}

  private tenantId(req: AuthRequest): string {
    return (
      (req.firebaseUser?.['organization_id'] as string | undefined) ??
      req.firebaseUser?.uid ??
      ''
    );
  }

  /**
   * Returns the tenant's current plan and the full resolved feature-flag map.
   * Frontend PlanContext can use this to sync against server state on mount.
   */
  @Get('me')
  async getMyEntitlements(@Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    const plan = await this.entitlementService.getTenantPlan(tenantId);
    const features = await this.entitlementService.getResolvedFeatures(tenantId);
    const usageLimits = PLAN_USAGE_LIMITS[plan];

    return {
      tenantId,
      plan,
      features,
      usageLimits,
    };
  }

  /**
   * Checks if the tenant's plan allows a specific feature.
   * Returns { allowed: boolean, plan, featureKey }.
   */
  @Post('feature-check')
  @HttpCode(200)
  async checkFeature(
    @Req() req: AuthRequest,
    @Body() body: CheckFeatureDto,
  ) {
    const tenantId = this.tenantId(req);
    const allowed = await this.entitlementService.canUseFeature(
      tenantId,
      body.featureKey,
    );
    const plan = await this.entitlementService.getTenantPlan(tenantId);

    return { tenantId, featureKey: body.featureKey, allowed, plan };
  }

  /**
   * Checks current usage against plan limits for a specific metric.
   * Returns { allowed, used, limit, percentage, threshold }.
   */
  @Post('usage-check')
  @HttpCode(200)
  async checkUsage(
    @Req() req: AuthRequest,
    @Body() body: CheckUsageDto,
  ) {
    const tenantId = this.tenantId(req);
    return this.entitlementService.checkUsage(
      tenantId,
      body.metricKey,
      body.amount ?? 1,
    );
  }
}
