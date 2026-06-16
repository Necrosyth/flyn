/**
 * plan-entitlements.ts
 *
 * Server-side source of truth for plan feature flags and usage limits.
 * Plan tiers: STARTER ($29.99) → GROWTH ($49) → PROFESSIONAL ($99) → ENTERPRISE (custom)
 */

export type PlanTier = 'STARTER' | 'GROWTH' | 'PROFESSIONAL' | 'ENTERPRISE';

// ─────────────────────────────────────────────────────────────────────────────
// Feature flags — boolean entitlements per plan (sparse fallback)
// Primary source is Firestore plan_definitions; these are the fallback.
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_FEATURE_FLAGS: Record<PlanTier, Record<string, boolean>> = {
  STARTER: {
    'crm.contacts': true,
    'channels.inbox': true,
    'modules.phonebook': true,
    'channels.email': true,
    'calendar.sync': true,
  },

  // $49/mo — was "PRO" in previous naming
  GROWTH: {
    'crm.contacts': true,
    'channels.inbox': true,
    'modules.phonebook': true,
    'modules.events': true,
    'modules.hr': true,
    'channels.whatsapp': true,
    'channels.telegram': true,
    'channels.email': true,
    'ai.agent.deploy': true,
    'ai.agent.builder': true,   // canonical key used by AIAgents page
    'ai.frontdesk': true,
    'website.builder': true,
    'automation.publish': true,
    'calendar.sync': true,
    'modules.freelancers': true,
    'api.keys.issue': true,
    'support.priority': true,
    'support.sla_guarantee': true,
  },

  // $99/mo — was "GROWTH" in previous naming
  PROFESSIONAL: {
    'crm.contacts': true,
    'channels.inbox': true,
    'modules.phonebook': true,
    'modules.events': true,
    'modules.hr': true,
    'modules.accounting': true,
    'channels.whatsapp': true,
    'channels.telegram': true,
    'channels.email': true,
    'ai.agent.deploy': true,
    'ai.agent.builder': true,   // canonical key used by AIAgents page
    'ai.frontdesk': true,
    'ai.marketing': true,
    'ai.content': true,
    'ai.social': true,          // canonical key used by AISocialMedia page
    'seo.tools': true,
    'website.builder': true,
    'automation.publish': true,
    'calendar.sync': true,
    'telephony.ivr.deploy': true,
    'telephony.ui': true,       // canonical key used by Dialer page
    'modules.freelancers': true,
    'sla.management': true,
    'modules.contracts': true,
    'api.keys.issue': true,
    'api.integrations': true,
    'support.dedicated_manager': true,
    'support.sla_guarantee': true,
    'support.priority': true,
  },

  ENTERPRISE: {
    'crm.contacts': true,
    'channels.inbox': true,
    'modules.phonebook': true,
    'modules.events': true,
    'modules.hr': true,
    'modules.accounting': true,
    'channels.whatsapp': true,
    'channels.telegram': true,
    'channels.email': true,
    'ai.agent.deploy': true,
    'ai.agent.builder': true,       // canonical key used by AIAgents page
    'ai.frontdesk': true,
    'ai.marketing': true,
    'ai.content': true,
    'ai.social': true,              // canonical key used by AISocialMedia page
    'seo.tools': true,
    'website.builder': true,
    'automation.publish': true,
    'calendar.sync': true,
    'telephony.ivr.deploy': true,
    'telephony.ui': true,           // canonical key used by Dialer page
    'modules.freelancers': true,
    'sla.management': true,
    'modules.contracts': true,
    'api.keys.issue': true,
    'api.integrations': true,
    'branding.full_white_label': true,
    'branding.custom_domain': true, // canonical key used by DomainManager page
    'support.dedicated_manager': true,
    'support.sla_guarantee': true,
    'support.priority': true,
    'support.24_7_phone': true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Usage limits — monthly caps per metric per plan (0 = no access)
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_USAGE_LIMITS: Record<PlanTier, Record<string, number>> = {
  STARTER: {
    'messages.sent': 500,
    'calls.minutes': 0,
    'ai.tokens': 1000,
  },
  GROWTH: {
    'messages.sent': 5000,
    'calls.minutes': 30,
    'ai.tokens': 50000,
  },
  PROFESSIONAL: {
    'messages.sent': 50000,
    'calls.minutes': 200,
    'ai.tokens': 500000,
  },
  ENTERPRISE: {
    'messages.sent': 9999999,
    'calls.minutes': 9999,
    'ai.tokens': 999999999,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Usage warning thresholds (% of limit)
// ─────────────────────────────────────────────────────────────────────────────

export const USAGE_WARNING_THRESHOLDS = {
  INFO: 70,
  WARNING: 85,
  CRITICAL: 95,
  LIMIT: 100,
} as const;

export function normalizePlanTier(planId: string, planName?: string): PlanTier {
  const src = (planName ?? planId).toUpperCase().trim();
  if (src.includes('ENTERPRISE')) return 'ENTERPRISE';
  // PROFESSIONAL must be checked before PRO (includes() would match both)
  if (src.includes('PROFESSIONAL')) return 'PROFESSIONAL';
  // Legacy "pro" planId → GROWTH ($49 tier)
  if (src === 'PRO' || src.includes('GROWTH')) return 'GROWTH';
  if (src.includes('STARTER') || src.includes('FREE')) return 'STARTER';
  return 'STARTER';
}
