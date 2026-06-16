import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from "react";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { useAuth } from "./AuthContext";
import { getAllPublicPlans, type PlanDefinition as ApiPlanDefinition } from "@/services/plansApi";

// ============================================
// PLAN TYPES - Aligned with PRICING_STRUCTURE.txt
// ============================================
// Canonical tiers: STARTER ($29.99) | GROWTH ($49) | PROFESSIONAL ($99) | ENTERPRISE (custom)
export type PlanTier = "STARTER" | "GROWTH" | "PROFESSIONAL" | "ENTERPRISE";
export type TenantStatus = "trial" | "active" | "past_due" | "suspended";

// ============================================
// FEATURE FLAGS - Engineering-ready keys
// ============================================
export const FEATURE_FLAGS = {
  // Tenant level
  "tenant.live_mode": "tenant.live_mode",
  "sandbox.mode": "sandbox.mode",
  "regions.multi": "regions.multi",
  
  // Unified Inbox & Channels
  "channels.whatsapp": "channels.whatsapp",
  "channels.sms": "channels.sms",
  "channels.mms": "channels.mms",
  "channels.email": "channels.email",
  "channels.voice": "channels.voice",
  "channels.webchat": "channels.webchat",
  "channels.telegram": "channels.telegram",
  "channels.facebook": "channels.facebook",
  "channels.instagram": "channels.instagram",
  "channels.social": "channels.social",
  "channels.teams": "channels.teams",
  "channels.slack": "channels.slack",
  
  // CRM
  "crm.contacts": "crm.contacts",
  "crm.deals": "crm.deals",
  "crm.pipelines": "crm.pipelines",
  "crm.import": "crm.import",
  "crm.export": "crm.export",
  "crm.live_data": "crm.live_data",
  
  // Automations
  "automation.builder": "automation.builder",
  "automation.publish": "automation.publish",
  "automation.simulate": "automation.simulate",
  "automation.conditions.advanced": "automation.conditions.advanced",
  "automation.webhooks": "automation.webhooks",
  
  // AI
  "ai.agent.builder": "ai.agent.builder",
  "ai.agent.deploy": "ai.agent.deploy",
  "ai.inference.live": "ai.inference.live",
  "ai.summaries": "ai.summaries",
  "ai.reply_suggestions": "ai.reply_suggestions",
  "ai.intent_detection": "ai.intent_detection",
  "ai.sentiment": "ai.sentiment",
  "ai.qa": "ai.qa",
  
  // Telephony
  "telephony.ui": "telephony.ui",
  "telephony.ivr.builder": "telephony.ivr.builder",
  "telephony.calls.live": "telephony.calls.live",
  "telephony.recordings": "telephony.recordings",
  "telephony.ivr.deploy": "telephony.ivr.deploy",
  "telephony.routing.advanced": "telephony.routing.advanced",
  
  // Dashboard
  "dashboard.view": "dashboard.view",
  "dashboard.data.demo": "dashboard.data.demo",
  "dashboard.realtime": "dashboard.realtime",
  
  // Analytics
  "analytics.basic": "analytics.basic",
  "analytics.advanced": "analytics.advanced",
  "analytics.export": "analytics.export",
  
  // Branding
  "branding.preview": "branding.preview",
  "branding.basic": "branding.basic",
  "branding.custom_domain": "branding.custom_domain",
  "branding.full_white_label": "branding.full_white_label",
  
  // API / Dev
  "api.docs.readonly": "api.docs.readonly",
  "api.keys.issue": "api.keys.issue",
  "webhooks.create": "webhooks.create",
  
  // Vertical modules
  "modules.hr": "modules.hr",
  "modules.church": "modules.church",
  "modules.coaches": "modules.coaches",
  "modules.freelancers": "modules.freelancers",
  "modules.events": "modules.events",
  "modules.phonebook": "modules.phonebook",
  "modules.accounting": "modules.accounting",
  "modules.contracts": "modules.contracts",

  // AI tools
  "ai.marketing": "ai.marketing",
  "ai.content": "ai.content",
  "ai.social": "ai.social",
  "ai.frontdesk": "ai.frontdesk",

  // Inbox / channels
  "channels.inbox": "channels.inbox",

  // Web & SEO
  "seo.tools": "seo.tools",
  "website.builder": "website.builder",

  // Productivity
  "calendar.sync": "calendar.sync",
  "sla.management": "sla.management",

  // API / integrations
  "api.integrations": "api.integrations",

  // Support tiers
  "support.priority": "support.priority",
  "support.dedicated_manager": "support.dedicated_manager",
  "support.sla_guarantee": "support.sla_guarantee",
  "support.24_7_phone": "support.24_7_phone",

  // Team
  "users.roles": "users.roles",
  "users.permissions.advanced": "users.permissions.advanced",

  // Compliance
  "audit.logs": "audit.logs",
  "sso.saml": "sso.saml",

  // Reseller / White-label agency
  "reseller.mode": "reseller.mode",
  "reseller.sub_accounts": "reseller.sub_accounts",
  "reseller.billing_passthrough": "reseller.billing_passthrough",
} as const;

export type FeatureKey = keyof typeof FEATURE_FLAGS;

// ============================================
// ENTITLEMENT VALUE TYPE
// ============================================
type EntitlementValue = boolean | number | string;

// ============================================
// PLAN METADATA
// ============================================
export interface PlanInfo {
  id: PlanTier;
  name: string;
  description: string;
  price: number | null; // null = custom pricing
  billingCycle: "monthly" | "yearly" | "custom";
  isPopular?: boolean;
}

export const PLANS: Record<PlanTier, PlanInfo> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    description: "For individuals & solopreneurs",
    price: 29.99,
    billingCycle: "monthly",
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    description: "For growing teams",
    price: 49,
    billingCycle: "monthly",
    isPopular: true,
  },
  PROFESSIONAL: {
    id: "PROFESSIONAL",
    name: "Professional",
    description: "For scaling businesses",
    price: 99,
    billingCycle: "monthly",
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    description: "Mission-critical deployment at scale",
    price: null,
    billingCycle: "custom",
  },
};

// ============================================
// CONTEXT TYPES
// ============================================
interface TenantOverride {
  featureKey: FeatureKey;
  value: EntitlementValue;
  expiresAt?: Date;
}

interface PlanContextState {
  currentPlan: PlanTier;
  tenantStatus: TenantStatus;
  trialEndsAt: Date | null;
  tenantOverrides: TenantOverride[];
}

// ============================================
// APPS — keys that can be selected during onboarding
// ============================================
export const ALL_APP_KEYS = ["crm", "events", "hr", "church", "coaches", "freelancers", "whatsapp_crm", "telephony", "channels"] as const;
export type AppKey = typeof ALL_APP_KEYS[number];

// Default: all apps selected (for users who haven't gone through onboarding yet)
const DEFAULT_SELECTED_APPS: AppKey[] = ["crm", "events", "hr", "church", "coaches", "freelancers", "channels", "telephony"];

interface PlanContextType extends PlanContextState {
  // Onboarding-selected apps — drives dashboard and sidebar visibility
  selectedApps: AppKey[];
  isAppSelected: (app: AppKey) => boolean;
  setSelectedApps: (apps: AppKey[]) => void;

  // Entitlement resolution — server-authoritative (Firestore via /api/entitlements/me)
  isEntitled: (featureKey: FeatureKey) => boolean;
  getEntitlementValue: (featureKey: FeatureKey) => EntitlementValue;

  // True once /api/entitlements/me has resolved (success or error)
  // Gates render in PlanGate — use to show loading skeleton instead of upgrade wall on first load
  featuresLoaded: boolean;

  // Plan management
  upgradePlan: (newPlan: PlanTier) => void;
  getPlanInfo: (plan: PlanTier) => PlanInfo;
  // Computed from live /api/public/plans data — which tier first grants this feature
  getRequiredPlanForFeature: (featureKey: FeatureKey) => PlanTier | null;

  // Refresh plan from server (call after Stripe checkout redirect)
  refreshPlan: () => Promise<void>;

  // Status helpers
  isLiveMode: () => boolean;
  isSandboxMode: () => boolean;
  isTrialActive: () => boolean;

  // For testing/demo
  setTenantOverride: (featureKey: FeatureKey, value: EntitlementValue, expiresAt?: Date) => void;
}

// ============================================
// CONTEXT
// ============================================
const PlanContext = createContext<PlanContextType | undefined>(undefined);

// Migrate OLD localStorage / Firebase-claims values to canonical tier names.
// Only call on cached local values — NOT on server responses.
// Legacy mappings: FREE→STARTER, PRO→GROWTH (old $49 tier)
const migratePlanTier = (p: string): PlanTier => {
  if (p === "FREE") return "STARTER";
  if (p === "PRO") return "GROWTH";       // legacy: old $49 tier → GROWTH
  if (p === "STARTER") return "STARTER";
  if (p === "GROWTH") return "GROWTH";
  if (p === "PROFESSIONAL") return "PROFESSIONAL";
  if (p === "ENTERPRISE") return "ENTERPRISE";
  return "STARTER";
};

// Coerce a plan string coming from the SERVER (/entitlements/me).
// The backend normalises planId to the canonical set; we just validate here.
const coerceServerPlan = (p: string): PlanTier => {
  const upper = p.toUpperCase().trim();
  if (upper === "STARTER" || upper === "FREE") return "STARTER";
  if (upper === "GROWTH" || upper === "PRO") return "GROWTH"; // legacy "pro" planId
  if (upper === "PROFESSIONAL") return "PROFESSIONAL";
  if (upper === "ENTERPRISE") return "ENTERPRISE";
  return "STARTER";
};

export const PlanProvider = ({ children }: { children: ReactNode }) => {
  const demoMode = isDemoModeEnabled();
  const [state, setState] = useState<PlanContextState>(() => {
    const stored = localStorage.getItem("flyn_plan");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        currentPlan: migratePlanTier(parsed.currentPlan ?? "FREE"),
        trialEndsAt: parsed.trialEndsAt ? new Date(parsed.trialEndsAt) : null,
      };
    }
    return {
      currentPlan: demoMode ? "ENTERPRISE" as PlanTier : "STARTER" as PlanTier,
      tenantStatus: "active" as TenantStatus,
      trialEndsAt: null,
      tenantOverrides: [],
    };
  });

  // Server-authoritative feature map — NOT persisted to localStorage (must stay fresh)
  const [serverFeatures, setServerFeatures] = useState<Record<string, boolean> | null>(
    demoMode ? ({ "tenant.live_mode": true, "sandbox.mode": false } as Record<string, boolean>) : null,
  );
  // True once the first /entitlements/me call resolves (success or error)
  const [featuresLoaded, setFeaturesLoaded] = useState(demoMode);
  // All plan definitions loaded from /api/public/plans — used to compute required plan for upgrade wall
  const [allPlans, setAllPlans] = useState<ApiPlanDefinition[]>([]);

  const { user } = useAuth();

  // Persist state changes
  const persistState = useCallback((newState: PlanContextState) => {
    localStorage.setItem("flyn_plan", JSON.stringify(newState));
    setState(newState);
  }, []);

  // Sync plan from Firebase custom claims (fast path)
  useEffect(() => {
    if (user?.plan) {
      const fbPlan = migratePlanTier(user.plan.toUpperCase());
      if (state.currentPlan !== fbPlan) {
        persistState({ ...state, currentPlan: fbPlan, tenantStatus: "active" });
      }
    }
  }, [user?.plan, state.currentPlan, persistState]);

  // Sync plan + server feature flags from entitlements endpoint — single source of truth
  useEffect(() => {
    if (!user || demoMode) {
      if (demoMode) setFeaturesLoaded(true);
      return;
    }
    let cancelled = false;
    authedFetch(`${API_BASE_URL}/entitlements/me`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { plan?: string; features?: Record<string, boolean> } | null) => {
        if (cancelled) return;
        if (data?.plan) {
          const serverPlan = coerceServerPlan(data.plan);
          if (state.currentPlan !== serverPlan) {
            persistState({ ...state, currentPlan: serverPlan, tenantStatus: "active" });
          }
        }
        if (data?.features && Object.keys(data.features).length > 0) {
          setServerFeatures(data.features);
        }
      })
      .catch(() => {/* network error — featuresLoaded still marks true so gate renders */})
      .finally(() => {
        if (!cancelled) setFeaturesLoaded(true);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Load all plan definitions (public, no auth) — used by getRequiredPlanForFeature
  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    getAllPublicPlans()
      .then((plans) => { if (!cancelled) setAllPlans(plans); })
      .catch(() => {/* non-critical — upgrade wall just won't show plan name */});
    return () => { cancelled = true; };
  }, []);



  // Re-fetch plan + features from server — call after Stripe checkout redirect
  const refreshPlan = useCallback(async () => {
    if (!user || demoMode) return;
    try {
      const r = await authedFetch(`${API_BASE_URL}/entitlements/me`);
      const data: { plan?: string; features?: Record<string, boolean> } | null = r.ok ? await r.json() : null;
      if (!data) return;
      if (data.plan) {
        const serverPlan = coerceServerPlan(data.plan);
        persistState({ ...state, currentPlan: serverPlan, tenantStatus: 'active' });
      }
      if (data.features && Object.keys(data.features).length > 0) {
        setServerFeatures(data.features);
      }
    } catch {/* non-critical */}
    finally {
      setFeaturesLoaded(true);
    }
  }, [user, state, persistState]);

  // Selected apps — driven by onboarding; synced with backend via /tenants/me (aiAgents field)
  const [selectedApps, setSelectedAppsState] = useState<AppKey[]>(() => {
    const stored = localStorage.getItem("flyn_selected_apps");
    return stored ? (JSON.parse(stored) as AppKey[]) : (demoMode ? [...ALL_APP_KEYS] : DEFAULT_SELECTED_APPS);
  });

  // Sync selected apps from backend on mount — reads aiAgents field from tenant record
  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    authedFetch(`${API_BASE_URL}/tenants/me`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { aiAgents?: string[] } | null) => {
        if (cancelled || !data?.aiAgents?.length) return;
        const apps = data.aiAgents.filter((a): a is AppKey =>
          (ALL_APP_KEYS as readonly string[]).includes(a)
        );
        if (!apps.length) return;
        localStorage.setItem("flyn_selected_apps", JSON.stringify(apps));
        setSelectedAppsState(apps);
      })
      .catch(() => {/* fallback to localStorage */});
    return () => { cancelled = true; };
  }, []);

  const setSelectedApps = useCallback((apps: AppKey[]) => {
    setSelectedAppsState(apps);
    localStorage.setItem("flyn_selected_apps", JSON.stringify(apps));
    if (demoMode) return;
    // Persist to backend via PATCH /tenants/me (best-effort)
    authedFetch(`${API_BASE_URL}/tenants/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiAgents: apps }),
    }).then(r => { if (!r.ok) console.warn(`[PlanContext] App selection sync failed: HTTP ${r.status}`); })
      .catch((err: Error) => console.warn("[PlanContext] App selection sync error:", err.message));
  }, []);

  const isAppSelected = useCallback((app: AppKey): boolean => {
    // CRM and WhatsApp CRM are always available
    if (demoMode) return true;
    if (app === "crm") return true;
    return selectedApps.includes(app);
  }, [selectedApps, demoMode]);



  // Resolution order: tenant override → server features (Firestore) → false
  // PLAN_ENTITLEMENTS has been removed — frontend has no hardcoded opinion about plan features.
  // All feature values come exclusively from /api/entitlements/me (which reads Firestore).
  const getEntitlementValue = useCallback((featureKey: FeatureKey): EntitlementValue => {
    if (demoMode) return featureKey === "sandbox.mode" ? false : true;
    // 1. Tenant override (highest priority — admin-set per-tenant flag)
    const override = state.tenantOverrides.find(o => o.featureKey === featureKey);
    if (override) {
      if (!override.expiresAt || new Date() < override.expiresAt) {
        return override.value;
      }
    }

    // 2. Server feature map (from /entitlements/me — live Firestore plan_definitions)
    if (serverFeatures !== null && featureKey in serverFeatures) {
      return serverFeatures[featureKey];
    }

    // 3. Default = false (while loading or feature not in any plan)
    return false;
  }, [state.tenantOverrides, serverFeatures, demoMode]);

  const isEntitled = useCallback((featureKey: FeatureKey): boolean => {
    const value = getEntitlementValue(featureKey);
    return value === true || (typeof value === "number" && value > 0) || 
           (typeof value === "string" && value !== "" && value !== "false");
  }, [getEntitlementValue]);

  const getRequiredPlanForFeature = useCallback((featureKey: FeatureKey): PlanTier | null => {
    if (!allPlans.length) return null;
    const orderedIds = ['starter', 'growth', 'professional', 'enterprise'];
    const tierMap: Record<string, PlanTier> = {
      starter: 'STARTER', growth: 'GROWTH', professional: 'PROFESSIONAL', enterprise: 'ENTERPRISE',
    };
    for (const planId of orderedIds) {
      const plan = allPlans.find(p => p.id === planId);
      if (!plan?.features) continue;
      for (const category of Object.values(plan.features)) {
        if (category && (category as Record<string, unknown>)[featureKey] === true) {
          return tierMap[planId] ?? null;
        }
      }
    }
    return null;
  }, [allPlans]);

  const upgradePlan = useCallback((newPlan: PlanTier) => {
    persistState({
      ...state,
      currentPlan: newPlan,
      tenantStatus: newPlan === "STARTER" ? "trial" : "active",
      trialEndsAt: newPlan === "STARTER" ? state.trialEndsAt : null,
    });
  }, [state, persistState]);

  const getPlanInfo = useCallback((plan: PlanTier): PlanInfo => {
    return PLANS[plan];
  }, []);

  const isLiveMode = useCallback(() => {
    return getEntitlementValue("tenant.live_mode") === true;
  }, [getEntitlementValue]);

  const isSandboxMode = useCallback(() => {
    return getEntitlementValue("sandbox.mode") === true;
  }, [getEntitlementValue]);

  const isTrialActive = useCallback(() => {
    return state.tenantStatus === "trial" && 
           state.trialEndsAt !== null && 
           new Date() < state.trialEndsAt;
  }, [state.tenantStatus, state.trialEndsAt]);

  const setTenantOverride = useCallback((
    featureKey: FeatureKey, 
    value: EntitlementValue, 
    expiresAt?: Date
  ) => {
    const newOverrides = state.tenantOverrides.filter(o => o.featureKey !== featureKey);
    newOverrides.push({ featureKey, value, expiresAt });
    persistState({ ...state, tenantOverrides: newOverrides });
  }, [state, persistState]);

  return (
    <PlanContext.Provider
      value={{
        ...state,
        selectedApps,
        isAppSelected,
        setSelectedApps,
        isEntitled,
        getEntitlementValue,
        featuresLoaded,
        upgradePlan,
        getPlanInfo,
        getRequiredPlanForFeature,
        refreshPlan,
        isLiveMode,
        isSandboxMode,
        isTrialActive,
        setTenantOverride,
      }}
    >
      {children}
    </PlanContext.Provider>
  );
};

export const usePlan = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error("usePlan must be used within PlanProvider");
  }
  return context;
};

// ============================================
// HELPER HOOKS
// ============================================
export const useFeatureGate = (featureKey: FeatureKey) => {
  const { isEntitled, getRequiredPlanForFeature, currentPlan, isSandboxMode } = usePlan();
  
  return {
    isEnabled: isEntitled(featureKey),
    requiredPlan: getRequiredPlanForFeature(featureKey),
    currentPlan,
    isSandboxMode: isSandboxMode(),
  };
};
