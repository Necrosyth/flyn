import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { TenantsService } from './tenants.service';
import { PlansAdminService } from '../admin/plans/plans-admin.service';
import type { PlanDefinition } from '../admin/plans/plan-definitions.types';

export interface UsageMetric {
  name: string;
  label: string;
  current: number;
  limit: number;
  percentage: number;
  status: 'ok' | 'warning' | 'critical';
  trend?: number; // percent change from last period
}

export interface FeatureAccessItem {
  name: string;
  enabled: boolean;
  tier_minimum?: string;
  beta?: boolean;
  deprecated?: boolean;
}

export interface SubscriptionInfo {
  status: 'active' | 'trialing' | 'paused' | 'canceled';
  currentPlan: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  daysUntilRenewal: number;
  trialEndsAt?: string;
  daysLeftInTrial?: number;
  nextBillingDate: string;
  cancelAtPeriodEnd?: boolean;
  autoRenew: boolean;
}

export interface PlanChangeRecommendation {
  type: 'upgrade' | 'downgrade';
  fromPlan: string;
  toPlan: string;
  reason: string;
  estimatedSavings?: number;
  requiredLimits: Record<string, number>;
}

export interface PlanChangeHistory {
  timestamp: string;
  fromPlan: string;
  toPlan: string;
  changedBy?: string;
  reason?: string;
}

export interface TenantPlanDashboard {
  tenant: any;
  subscription: SubscriptionInfo;
  currentPlan: PlanDefinition;
  usage: UsageMetric[];
  features: Record<string, FeatureAccessItem[]>;
  recommendations: PlanChangeRecommendation[];
  changeHistory: PlanChangeHistory[];
  upcomingLimitWarnings: string[];
  nextUpgradeThreshold?: {
    metric: string;
    remainingCapacity: number;
  };
}

@Injectable()
export class TenantPlanDashboardService {
  private readonly logger = new Logger(TenantPlanDashboardService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenants: TenantsService,
    private readonly plans: PlansAdminService,
  ) {}

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialized');
    return db;
  }

  private calculateStatus(percentage: number): 'ok' | 'warning' | 'critical' {
    if (percentage >= 90) return 'critical';
    if (percentage >= 70) return 'warning';
    return 'ok';
  }

  async getDashboard(tenantId: string): Promise<TenantPlanDashboard> {
    const tenant = await this.tenants.getTenant(tenantId);
    const { plan: planId } = await this.tenants.getTenantPlan(tenantId);
    let currentPlan: any;
    try {
      currentPlan = await this.plans.getPlanById(planId as any);
    } catch {
      currentPlan = { id: planId, name: planId, pricing: { monthly: 0, yearly: 0, currency: 'USD' }, features: {}, limits: {} };
    }

    let subscription: any;
    try { subscription = await this.getSubscriptionInfo(tenantId); } catch (e) {
      this.logger.error('getSubscriptionInfo failed', e);
      subscription = { status: 'active', currentPlan: planId, currentPeriodStart: new Date().toISOString(), currentPeriodEnd: new Date().toISOString(), daysUntilRenewal: 0, nextBillingDate: new Date().toISOString(), autoRenew: false };
    }

    let usage: any[] = [];
    try { usage = await this.calculateUsageMetrics(tenantId, currentPlan); } catch (e) { this.logger.error('calculateUsageMetrics failed', e); }

    let features: any = {};
    try { features = this.buildFeatureAccessMatrix(currentPlan); } catch (e) { this.logger.error('buildFeatureAccessMatrix failed', e); }

    let recommendations: any[] = [];
    try { recommendations = await this.analyzeUpgradeDowngrade(tenantId, currentPlan, usage); } catch (e) { this.logger.error('analyzeUpgradeDowngrade failed', e); }

    let changeHistory: any[] = [];
    try { changeHistory = await this.getPlanChangeHistory(tenantId); } catch (e) { this.logger.error('getPlanChangeHistory failed', e); }

    // Check for upcoming warnings
    const upcomingLimitWarnings = usage
      .filter((m) => m.status !== 'ok')
      .map((m) => `${m.label}: ${m.current}/${m.limit} (${m.percentage}%)`);

    // Find next threshold
    const nextUpgradeThreshold = this.findNextUpgradeThreshold(usage);

    return {
      tenant,
      subscription,
      currentPlan,
      usage,
      features,
      recommendations,
      changeHistory,
      upcomingLimitWarnings,
      nextUpgradeThreshold,
    };
  }

  private async getSubscriptionInfo(tenantId: string): Promise<SubscriptionInfo> {
    const tenant = await this.tenants.getTenant(tenantId);
    const now = new Date();

    const currentPeriodEnd = tenant.subscriptionEndDate
      ? new Date(tenant.subscriptionEndDate)
      : null;
    const daysUntilRenewal = currentPeriodEnd
      ? Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      status: (tenant.subscriptionStatus as any) || 'active',
      currentPlan: tenant.currentPlan || 'free',
      currentPeriodStart: tenant.subscriptionStartDate || new Date().toISOString(),
      currentPeriodEnd: currentPeriodEnd?.toISOString() || new Date().toISOString(),
      daysUntilRenewal: Math.max(0, daysUntilRenewal),
      nextBillingDate: currentPeriodEnd?.toISOString() || new Date().toISOString(),
      autoRenew: tenant.subscriptionStatus !== 'canceled',
      cancelAtPeriodEnd: false,
    };
  }

  private async calculateUsageMetrics(
    tenantId: string,
    plan: PlanDefinition,
  ): Promise<UsageMetric[]> {
    // In a real app, query actual usage from analytics
    // For now, simulate usage data
    const metrics: UsageMetric[] = [];

    const limits: any = plan.limits || {};
    const usage = {
      messagesPerMonth: Math.floor((limits.messagesPerMonth || 0) * 0.45),
      aiTokensPerMonth: Math.floor((limits.aiTokensPerMonth || 0) * 0.32),
      telephonyMinutesPerMonth: Math.floor((limits.telephonyMinutesPerMonth || 0) * 0.61),
      apiCallsPerMonth: Math.floor((limits.apiCallsPerMonth || 10000) * 0.28),
      storageGb: Math.floor((limits.storageGb || 100) * 0.55),
    };

    const msgLimit = limits.messagesPerMonth || 1;
    metrics.push({
      name: 'messages',
      label: 'Messages/Month',
      current: usage.messagesPerMonth,
      limit: msgLimit,
      percentage: Math.round((usage.messagesPerMonth / msgLimit) * 100),
      status: 'ok',
      trend: Math.floor(Math.random() * 10 - 5),
    });

    const tokenLimit = limits.aiTokensPerMonth || 1;
    metrics.push({
      name: 'ai_tokens',
      label: 'AI Tokens/Month',
      current: usage.aiTokensPerMonth,
      limit: tokenLimit,
      percentage: Math.round((usage.aiTokensPerMonth / tokenLimit) * 100),
      status: 'ok',
      trend: Math.floor(Math.random() * 15 - 5),
    });

    if ((limits.telephonyMinutesPerMonth || 0) > 0) {
      metrics.push({
        name: 'telephony',
        label: 'Telephony Minutes/Month',
        current: usage.telephonyMinutesPerMonth,
        limit: limits.telephonyMinutesPerMonth,
        percentage: Math.round((usage.telephonyMinutesPerMonth / limits.telephonyMinutesPerMonth) * 100),
        status: 'ok',
        trend: Math.floor(Math.random() * 20 - 10),
      });
    }

    if (limits.apiCallsPerMonth) {
      metrics.push({
        name: 'api_calls',
        label: 'API Calls/Month',
        current: usage.apiCallsPerMonth,
        limit: limits.apiCallsPerMonth,
        percentage: Math.round((usage.apiCallsPerMonth / limits.apiCallsPerMonth) * 100),
        status: 'ok',
        trend: Math.floor(Math.random() * 12 - 3),
      });
    }

    const storageLimit = limits.storageGb || 100;
    metrics.push({
      name: 'storage',
      label: 'Storage Used (GB)',
      current: usage.storageGb,
      limit: storageLimit,
      percentage: Math.round((usage.storageGb / storageLimit) * 100),
      status: 'ok',
      trend: Math.floor(Math.random() * 8 - 2),
    });

    // Update status based on percentage
    return metrics.map((m) => ({
      ...m,
      status: this.calculateStatus(m.percentage),
    }));
  }

  private buildFeatureAccessMatrix(plan: PlanDefinition): Record<string, FeatureAccessItem[]> {
    const categories = {
      'Core Modules': plan.features.core_modules || {},
      'Communication': plan.features.communication || {},
      'AI Features': plan.features.ai || {},
      'Automation': plan.features.automation || {},
      'Platform': plan.features.platform || {},
      'Team & Support': plan.features.team_and_support || {},
    };

    const result: Record<string, FeatureAccessItem[]> = {};

    Object.entries(categories).forEach(([category, features]) => {
      result[category] = Object.entries(features).map(([name, value]) => {
        const metadata = typeof value === 'boolean' ? null : value;
        return {
          name: name
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          enabled: typeof value === 'boolean' ? value : (value as any)?.enabled ?? false,
          tier_minimum: (metadata as any)?.tier_minimum,
          beta: (metadata as any)?.beta,
          deprecated: (metadata as any)?.deprecated,
        };
      });
    });

    return result;
  }

  private async analyzeUpgradeDowngrade(
    tenantId: string,
    currentPlan: PlanDefinition,
    usage: UsageMetric[],
  ): Promise<PlanChangeRecommendation[]> {
    const allPlans = await this.plans.getAllPlans();
    const recommendations: PlanChangeRecommendation[] = [];

    // Check if should upgrade
    const criticalUsage = usage.filter((u) => u.status === 'critical');
    if (criticalUsage.length > 0) {
      const nextPlan = allPlans.find(
        (p) => this.getPlanOrder(p.id) > this.getPlanOrder(currentPlan.id),
      );
      if (nextPlan) {
        recommendations.push({
          type: 'upgrade',
          fromPlan: currentPlan.name,
          toPlan: nextPlan.name,
          reason: `You're approaching limits on ${criticalUsage.map((u) => u.name).join(', ')}`,
          requiredLimits: {
            messages: nextPlan.limits.messagesPerMonth,
            tokens: nextPlan.limits.aiTokensPerMonth,
          },
        });
      }
    }

    return recommendations;
  }

  private getPlanOrder(planId: string): number {
    const order: Record<string, number> = {
      free: 0,
      starter: 1,
      growth: 2,
      pro: 3,
      enterprise: 4,
    };
    return order[planId] ?? 999;
  }

  private async getPlanChangeHistory(tenantId: string): Promise<PlanChangeHistory[]> {
    try {
    const snap = await this.db()
      .collection('billing_subscriptions')
      .where('tenantId', '==', tenantId)
      .limit(20)
      .get();

    const history: PlanChangeHistory[] = [];
    let lastPlan = 'free';

    const sorted = snap.docs.sort((a, b) => {
      const aDate = a.data()?.updatedAt ?? '';
      const bDate = b.data()?.updatedAt ?? '';
      return bDate > aDate ? 1 : bDate < aDate ? -1 : 0;
    });

    sorted.forEach((doc) => {
      const data = doc.data() as any;
      if (data.planId !== lastPlan) {
        history.push({
          timestamp: data.updatedAt || new Date().toISOString(),
          fromPlan: lastPlan,
          toPlan: data.planId,
        });
        lastPlan = data.planId;
      }
    });

    return history.slice(0, 5);
    } catch {
      return [];
    }
  }

  private findNextUpgradeThreshold(
    usage: UsageMetric[],
  ): { metric: string; remainingCapacity: number } | undefined {
    const sorted = [...usage].sort((a, b) => b.percentage - a.percentage);
    const highest = sorted[0];

    if (highest && highest.percentage < 100) {
      return {
        metric: highest.label,
        remainingCapacity: highest.limit - highest.current,
      };
    }

    return undefined;
  }
}
