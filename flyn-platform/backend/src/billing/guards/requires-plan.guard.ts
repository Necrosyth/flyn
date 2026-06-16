import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from '../billing.service';
import { FEATURE_KEY } from './plan-feature.decorator';
import { PlanFeature, PLAN_ENTITLEMENTS } from '../plan-entitlements';
import { AuthRequest } from './firebase-auth.guard';

@Injectable()
export class RequiresPlanGuard implements CanActivate {
  private readonly logger = new Logger(RequiresPlanGuard.name);

  constructor(
    private reflector: Reflector,
    private billingService: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<PlanFeature>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const tenantId = (request.firebaseUser?.['organization_id'] as string) ?? request.firebaseUser?.uid;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    // Owners bypass all feature gates
    const ownerEmails = (process.env.OWNER_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
    const userEmail = request.firebaseUser?.email as string | undefined;
    if (userEmail && ownerEmails.includes(userEmail)) {
      return true;
    }

    const subscription = await this.billingService.getActiveSubscription(tenantId);

    // Default to 'free' if no subscription
    const planId = subscription?.planId?.toLowerCase() || 'free';
    const entitlements = PLAN_ENTITLEMENTS[planId] || PLAN_ENTITLEMENTS['free'];

    const hasFeature = entitlements.features.includes(requiredFeature);

    if (!hasFeature) {
      this.logger.warn(`Tenant ${tenantId} attempted to access ${requiredFeature} but their plan (${planId}) does not allow it.`);
      throw new ForbiddenException(`Your current plan (${planId}) does not include the ${requiredFeature} feature. Please upgrade.`);
    }

    return true;
  }
}
