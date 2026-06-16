import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../firebase/firebase.service';
import { UsageService, MetricKey } from '../../usage/usage.service';
import { SubscriptionRecord } from '../billing.types';
import {
  PlanTier,
  PLAN_FEATURE_FLAGS,
  PLAN_USAGE_LIMITS,
  USAGE_WARNING_THRESHOLDS,
  normalizePlanTier,
} from './plan-entitlements';
import type { PlanDefinition } from '../../admin/plans/plan-definitions.types';

export interface UsageCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  percentage: number;
  /** threshold key if above a warning level, else null */
  threshold: 'INFO' | 'WARNING' | 'CRITICAL' | 'LIMIT' | null;
}

/**
 * EntitlementService
 *
 * Resolves a tenant's current plan tier and enforces:
 *   1. Feature-flag entitlements  — canUseFeature(tenantId, featureKey)
 *   2. Usage-based limits         — checkUsage(tenantId, metricKey, amount)
 *
 * Plan resolution order:
 *   billing_subscriptions (active/trialing) → FREE fallback
 *
 * Results are NOT cached (Firestore reads are fast; subscriptions change rarely).
 * Add Redis caching if p95 latency on guarded endpoints becomes a concern.
 */
@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);
  private readonly COL_SUBSCRIPTIONS = 'billing_subscriptions';
  private readonly COL_PLAN_DEFINITIONS = 'plan_definitions';

  constructor(
    private readonly firebase: FirebaseService,
    private readonly usageService: UsageService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────
  // Plan resolution
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Returns the current PlanTier for the tenant.
   * Checks Firestore billing_subscriptions for an active or trialing subscription.
   * Falls back to FREE if none found or Firestore is unavailable.
   */
  async getTenantPlan(tenantId: string): Promise<PlanTier> {
    try {
      const db = this.firebase.firestore();
      if (!db) return 'STARTER';

      const snap = await db
        .collection(this.COL_SUBSCRIPTIONS)
        .where('tenantId', '==', tenantId)
        .where('status', 'in', ['active', 'trialing'])
        .limit(1)
        .get();

      if (snap.empty) return 'STARTER';

      const sub = snap.docs[0].data() as SubscriptionRecord;
      return normalizePlanTier(sub.planId);
    } catch (err) {
      this.logger.warn(`getTenantPlan failed for ${tenantId}: ${(err as Error).message}`);
      return 'STARTER';
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Feature-flag entitlements
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Read plan definition directly from Firestore — no in-memory cache.
   * Admin feature toggles propagate on the next request with no restart needed.
   */
  private async getPlanDefinition(planId: string): Promise<PlanDefinition | null> {
    try {
      const db = this.firebase.firestore();
      if (!db) return null;

      const doc = await db.collection(this.COL_PLAN_DEFINITIONS).doc(planId).get();
      if (!doc.exists) return null;

      return doc.data() as PlanDefinition;
    } catch (err) {
      this.logger.warn(`Failed to fetch plan definition for ${planId}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Returns the full flat feature-flag map for a tenant.
   * Reads from Firestore plan_definitions first; falls back to hardcoded PLAN_FEATURE_FLAGS.
   * Flattens nested category objects into a single { featureKey: boolean } map.
   */
  async getResolvedFeatures(tenantId: string): Promise<Record<string, boolean>> {
    const plan = await this.getTenantPlan(tenantId);
    const planDef = await this.getPlanDefinition(plan.toLowerCase());

    if (planDef?.features) {
      const flat: Record<string, boolean> = {};
      for (const category of Object.values(planDef.features)) {
        if (category && typeof category === 'object') {
          for (const [key, value] of Object.entries(category as Record<string, unknown>)) {
            // Handle both plain boolean and FeatureMetadata object { enabled: boolean }
            if (typeof value === 'boolean') {
              flat[key] = value;
            } else if (value && typeof value === 'object' && 'enabled' in value) {
              flat[key] = Boolean((value as { enabled: unknown }).enabled);
            } else {
              flat[key] = false;
            }
          }
        }
      }
      if (Object.keys(flat).length > 0) return flat;
    }

    // Firestore unavailable or empty doc — fall back to hardcoded for safety
    return { ...(PLAN_FEATURE_FLAGS[plan] ?? {}) };
  }

  /**
   * Returns true if the tenant's plan grants access to the given feature key.
   * Checks dynamic plan_definitions first, falls back to hardcoded for migration.
   * Defaults to false (deny) on any unexpected input.
   */
  async canUseFeature(tenantId: string, featureKey: string): Promise<boolean> {
    try {
      const plan = await this.getTenantPlan(tenantId);
      const planDef = await this.getPlanDefinition(plan.toLowerCase());

      if (planDef && planDef.features) {
        for (const category of Object.values(planDef.features)) {
          if (!category) continue;
          const val = (category as Record<string, unknown>)[featureKey];
          if (val === true) return true;
          if (val && typeof val === 'object' && 'enabled' in val && (val as { enabled: unknown }).enabled === true) return true;
        }
        return false;
      }

      // Fallback to hardcoded for backward compatibility during migration
      const flags = PLAN_FEATURE_FLAGS[plan];
      return (flags && flags[featureKey] === true) ?? false;
    } catch (err) {
      this.logger.error(`canUseFeature failed for ${tenantId}: ${(err as Error).message}`);
      return false; // Deny by default on error
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Usage-based entitlements
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Checks whether a tenant can consume `amount` units of a metric without
   * exceeding their plan's monthly limit.
   *
   * Returns a UsageCheckResult:
   *   - allowed:    true if current usage + amount ≤ limit
   *   - used:       current counter value
   *   - limit:      plan cap (0 = no access on this plan)
   *   - percentage: (used / limit) * 100, capped at 100
   *   - threshold:  highest warning level reached, or null
   *
   * Reads limits from dynamic plan_definitions, falls back to hardcoded for migration.
   */
  async checkUsage(
    tenantId: string,
    metricKey: string,
    amount = 1,
  ): Promise<UsageCheckResult> {
    try {
      const plan = await this.getTenantPlan(tenantId);
      const planDef = await this.getPlanDefinition(plan.toLowerCase());

      let limit = 0;
      if (planDef && planDef.limits) {
        // Map common metric keys to plan limits
        const limitMap: Record<string, keyof typeof planDef.limits> = {
          'messages.sent': 'messagesPerMonth',
          'ai.tokens': 'aiTokensPerMonth',
          'calls.minutes': 'telephonyMinutesPerMonth',
        };
        const limitKey = limitMap[metricKey];
        limit = limitKey ? (planDef.limits[limitKey] as number) : 0;
      }

      // Fallback to hardcoded if dynamic not found
      if (limit === 0) {
        limit = PLAN_USAGE_LIMITS[plan]?.[metricKey] ?? 0;
      }

      if (limit === 0) {
        return { allowed: false, used: 0, limit: 0, percentage: 100, threshold: 'LIMIT' };
      }

      const used = await this.usageService.getCount(tenantId, metricKey as MetricKey);
      const allowed = used + amount <= limit;
      const percentage = Math.min(100, Math.round((used / limit) * 100));

      let threshold: UsageCheckResult['threshold'] = null;
      if (percentage >= USAGE_WARNING_THRESHOLDS.LIMIT) threshold = 'LIMIT';
      else if (percentage >= USAGE_WARNING_THRESHOLDS.CRITICAL) threshold = 'CRITICAL';
      else if (percentage >= USAGE_WARNING_THRESHOLDS.WARNING) threshold = 'WARNING';
      else if (percentage >= USAGE_WARNING_THRESHOLDS.INFO) threshold = 'INFO';

      return { allowed, used, limit, percentage, threshold };
    } catch (err) {
      this.logger.error(`checkUsage failed for ${tenantId}: ${(err as Error).message}`);
      return { allowed: false, used: 0, limit: 0, percentage: 100, threshold: 'LIMIT' };
    }
  }

  /**
   * Convenience: check + increment atomically in one call.
   * Returns UsageCheckResult with the state BEFORE incrementing.
   * Does NOT increment if usage would be exceeded.
   */
  async checkAndIncrement(
    tenantId: string,
    metricKey: string,
    amount = 1,
  ): Promise<UsageCheckResult> {
    const result = await this.checkUsage(tenantId, metricKey, amount);
    if (result.allowed) {
      await this.usageService.increment(tenantId, metricKey as MetricKey, amount);
    }
    return result;
  }
}
