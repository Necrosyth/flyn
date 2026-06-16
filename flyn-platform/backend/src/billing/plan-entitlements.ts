export enum PlanFeature {
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  SOCIAL_CHANNELS = 'social_channels', // Instagram, Facebook
  AI_AGENTS = 'ai_agents',
  ADVANCED_AI = 'advanced_ai', // Sentiment, etc.
  TELEPHONY = 'telephony',
  CRM = 'crm',
  TEAM_MANAGEMENT = 'team_management',
  WHITE_LABEL = 'white_label',
  CUSTOM_DOMAINS = 'custom_domains',
  SSO = 'sso',
  BYOK = 'byok',
}

export interface PlanEntitlements {
  features: PlanFeature[];
  limits: {
    messagesPerMonth: number;
    aiTokensPerMonth: number;
    telephonyMinutesPerMonth: number;
    extraAiSeats: number;
  };
}

export const PLAN_ENTITLEMENTS: Record<string, PlanEntitlements> = {
  // Legacy aliases — map to same entitlements so old claims still work
  free: {
    features: [PlanFeature.CRM],
    limits: { messagesPerMonth: 500, aiTokensPerMonth: 1000, telephonyMinutesPerMonth: 0, extraAiSeats: 0 },
  },

  // $29.99/mo
  starter: {
    features: [
      PlanFeature.CRM,
      PlanFeature.AI_AGENTS,
    ],
    limits: { messagesPerMonth: 500, aiTokensPerMonth: 1000, telephonyMinutesPerMonth: 0, extraAiSeats: 0 },
  },

  // $49/mo — Most Popular (formerly "pro")
  growth: {
    features: [
      PlanFeature.CRM,
      PlanFeature.WHATSAPP,
      PlanFeature.TELEGRAM,
      PlanFeature.AI_AGENTS,
      PlanFeature.TEAM_MANAGEMENT,
    ],
    limits: { messagesPerMonth: 5000, aiTokensPerMonth: 50000, telephonyMinutesPerMonth: 0, extraAiSeats: 5 },
  },

  // $99/mo (formerly "growth")
  professional: {
    features: [
      PlanFeature.CRM,
      PlanFeature.WHATSAPP,
      PlanFeature.TELEGRAM,
      PlanFeature.SOCIAL_CHANNELS,
      PlanFeature.AI_AGENTS,
      PlanFeature.ADVANCED_AI,
      PlanFeature.TELEPHONY,
      PlanFeature.TEAM_MANAGEMENT,
      PlanFeature.CUSTOM_DOMAINS,
    ],
    limits: { messagesPerMonth: 50000, aiTokensPerMonth: 500000, telephonyMinutesPerMonth: 200, extraAiSeats: 15 },
  },

  enterprise: {
    features: Object.values(PlanFeature),
    limits: { messagesPerMonth: 999999, aiTokensPerMonth: 9999999, telephonyMinutesPerMonth: 9999, extraAiSeats: 99 },
  },
};
