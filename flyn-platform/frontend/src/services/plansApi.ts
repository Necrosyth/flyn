import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from './authApi';

export interface PlanFeatures {
  core_modules?: Record<string, boolean>;
  communication?: Record<string, boolean>;
  ai?: Record<string, boolean>;
  automation?: Record<string, boolean>;
  platform?: Record<string, boolean>;
  team_and_support?: Record<string, boolean>;
}

export interface PlanLimits {
  messagesPerMonth: number;
  aiTokensPerMonth: number;
  telephonyMinutesPerMonth: number;
  teamMembers: number;
  customIntegrations?: number;
  apiCallsPerMonth?: number;
  storageGb?: number;
  customDomainsCount?: number;
}

export interface PlanPricing {
  monthly: number;
  yearly: number;
  currency: string;
  discountYearly?: number;
  trialDays?: number;
  ctaText?: string;
  stripeMonthlyPriceId?: string;
  stripeYearlyPriceId?: string;
  displayMonthly?: string;
  displayYearly?: string;
}

export interface PlanDefinition {
  id: string;
  version: number;
  name: string;
  description: string;
  tagline?: string;
  icon?: string;
  pricing: PlanPricing;
  features: PlanFeatures;
  limits: PlanLimits;
  highlights?: string[];
  recommended?: boolean;
  position?: number;
  color?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  enforcedAt?: string;
  enforcementMode?: 'immediate' | 'future_only';
  enforcedBy?: string;
  subscriptionCount?: number;
  stripeProductId?: string;
}

export interface BillingPeriodConfig {
  enabled: boolean;
  discount: number; // percentage off, 0 for monthly
}

export interface AddOnDef {
  enabled: boolean;
  basePrice: number;
  availableOn?: string;
  features?: string[];
}

export interface PricingTableSchema {
  plans?: PlanDefinition[];
  categories?: PricingTableCategory[];
  updatedAt?: string;
  updatedBy?: string;
  billingPeriods?: {
    monthly?: BillingPeriodConfig;
    quarterly?: BillingPeriodConfig;
    biannual?: BillingPeriodConfig;
    annual?: BillingPeriodConfig;
  };
  addOns?: {
    essential?: AddOnDef;
    advanced?: AddOnDef;
  };
  version?: number;
  [key: string]: unknown;
}

export interface PricingTableFeatureRow {
  key: string;
  label: string;
  order?: number;
  type?: 'boolean' | 'text' | 'number' | 'limit';
  limitKey?: string;
  tooltip?: string;
}

export interface PricingTableCategory {
  key: string;
  label: string;
  order?: number;
  features: PricingTableFeatureRow[];
}

/**
 * PUBLIC API — No auth required
 */
export async function getAllPublicPlans(): Promise<PlanDefinition[]> {
  const response = await fetch(`${API_BASE_URL}/public/plans`);
  if (!response.ok) throw new Error('Failed to fetch plans');
  return response.json();
}

export async function getPublicPlanById(planId: string): Promise<PlanDefinition> {
  const response = await fetch(`${API_BASE_URL}/public/plans/${planId}`);
  if (!response.ok) throw new Error(`Failed to fetch plan ${planId}`);
  return response.json();
}

export async function getPublicSchema(): Promise<PricingTableSchema> {
  const response = await fetch(`${API_BASE_URL}/public/plans/schema`);
  if (!response.ok) throw new Error('Failed to fetch pricing schema');
  return response.json();
}

/**
 * ADMIN API — Auth required
 */
export async function getAllPlans(): Promise<PlanDefinition[]> {
  const response = await authedFetch(`${API_BASE_URL}/admin/plans`);
  if (!response.ok) throw new Error('Failed to fetch plans');
  return response.json();
}

export async function getPlanById(planId: string): Promise<PlanDefinition> {
  const response = await authedFetch(`${API_BASE_URL}/admin/plans/${planId}`);
  if (!response.ok) throw new Error(`Failed to fetch plan ${planId}`);
  return response.json();
}

export async function getAdminSchema(): Promise<PricingTableSchema> {
  const response = await authedFetch(`${API_BASE_URL}/admin/plans/schema`);
  if (!response.ok) throw new Error('Failed to fetch admin pricing schema');
  return response.json();
}

export async function updateSchema(schema: PricingTableSchema): Promise<PricingTableSchema> {
  const response = await authedFetch(`${API_BASE_URL}/admin/plans/schema`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schema),
  });
  if (!response.ok) throw new Error('Failed to update pricing schema');
  return response.json();
}

export async function updatePlan(
  planId: string,
  updates: Partial<PlanDefinition>,
): Promise<PlanDefinition> {
  const response = await authedFetch(`${API_BASE_URL}/admin/plans/${planId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error(`Failed to update plan ${planId}`);
  return response.json();
}

export async function seedPlans(): Promise<{ message: string }> {
  const response = await authedFetch(`${API_BASE_URL}/admin/plans/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to seed plans');
  return response.json();
}

export async function enforcePlanUpdate(
  planId: string,
  applyToExisting: boolean,
): Promise<{ updated: number; skipped: number }> {
  const response = await authedFetch(`${API_BASE_URL}/admin/plans/${planId}/enforce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applyToExisting }),
  });
  if (!response.ok) throw new Error(`Failed to enforce plan ${planId}`);
  return response.json();
}
