export type PlanId = 'free' | 'starter' | 'growth' | 'pro' | 'enterprise';
export type FeatureCategory = 'core_modules' | 'communication' | 'ai' | 'automation' | 'platform' | 'team_and_support';

export interface FeatureMetadata {
  enabled: boolean;
  icon?: string;
  tier_minimum?: PlanId; // First tier where feature appears
  description?: string;
  beta?: boolean;
  deprecated?: boolean;
}

export interface PlanFeatures {
  core_modules?: Record<string, FeatureMetadata | boolean>;
  communication?: Record<string, FeatureMetadata | boolean>;
  ai?: Record<string, FeatureMetadata | boolean>;
  automation?: Record<string, FeatureMetadata | boolean>;
  platform?: Record<string, FeatureMetadata | boolean>;
  team_and_support?: Record<string, FeatureMetadata | boolean>;
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
  discountYearly?: number; // percentage
  trialDays?: number;
  stripeMonthlyPriceId?: string;
  stripeYearlyPriceId?: string;
  displayMonthly?: string;
  displayYearly?: string;
}

export interface PlanDefinition {
  id: PlanId;
  version: number; // Increment on each change
  name: string;
  description: string;
  tagline?: string;
  icon?: string;
  pricing: PlanPricing;
  features: PlanFeatures;
  limits: PlanLimits;

  // Advanced fields
  recommended?: boolean;
  position?: number; // Display order
  color?: string; // Hex color for UI

  // Audit
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  enforcedAt?: string;
  enforcementMode?: 'immediate' | 'future_only';
  enforcedBy?: string;

  // Metadata
  subscriptionCount?: number; // Active subscriptions on this plan
  changeLog?: PlanChange[]; // Last 10 changes
  stripeProductId?: string;
}

export interface PlanChange {
  version: number;
  timestamp: string;
  changes: Record<string, { before: any; after: any }>;
  changedBy: string;
  reason?: string;
}

export interface CreatePlanDto {
  name: string;
  description: string;
  tagline?: string;
  pricing: PlanPricing;
  features: PlanFeatures;
  limits: PlanLimits;
  icon?: string;
  color?: string;
  position?: number;
  recommended?: boolean;
}

export interface UpdatePlanDto {
  name?: string;
  description?: string;
  tagline?: string;
  pricing?: PlanPricing;
  features?: PlanFeatures;
  limits?: PlanLimits;
  icon?: string;
  color?: string;
  position?: number;
  recommended?: boolean;
}

export interface EnforcePlanDto {
  applyToExisting: boolean;
  rolloutPercentage?: number; // 1-100, gradual rollout
  rolloutSchedule?: 'immediate' | 'staggered_24h' | 'staggered_7d';
  reason?: string;
}

export interface PlanComparisonDto {
  plans: PlanId[];
  includeMetadata?: boolean;
}

export interface PlanComparison {
  plans: Record<PlanId, PlanDefinition>;
  featureDifferences: Record<string, Record<PlanId, boolean>>;
  limitDifferences: Record<string, Record<PlanId, number>>;
}

export interface PlanImpactAnalysis {
  planId: PlanId;
  affectedSubscriptions: number;
  breakdownByStatus: Record<'active' | 'trialing' | 'paused', number>;
  estimatedChurn?: number; // Estimated churn if enforced
  revenue_impact?: number;
}

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  baseDefinition: Omit<PlanDefinition, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'changeLog'>;
  category: 'saas' | 'marketplace' | 'b2b' | 'consumer';
  industry?: string[];
  createdAt: string;
}

export interface PricingTableSchema {
  plans?: PlanDefinition[];
  updatedAt?: string;
  updatedBy?: string;
  version?: number;
  categories?: any[];
  [key: string]: unknown;
}
