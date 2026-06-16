import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from "react";
import { usePlan } from "./PlanContext";
import { useAuth } from "./AuthContext";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

// ============================================
// USAGE METRIC KEYS - From pricing docs
// ============================================
export const USAGE_METRICS = {
  "messages.sent": "messages.sent",
  "calls.minutes": "calls.minutes",
  "ai.tokens": "ai.tokens",
  "webchat.sessions": "webchat.sessions",
  "storage.gb": "storage.gb",
  "whatsapp.conversations": "whatsapp.conversations",
} as const;

export type UsageMetricKey = keyof typeof USAGE_METRICS;

// ============================================
// USAGE LIMITS BY PLAN
// ============================================
type UsageLimits = Record<UsageMetricKey, number>;

const PLAN_USAGE_LIMITS: Record<string, UsageLimits> = {
  FREE: {
    "messages.sent": 100,
    "calls.minutes": 0,
    "ai.tokens": 1_000,
    "webchat.sessions": 0,
    "storage.gb": 0,
    "whatsapp.conversations": 50,
  },
  STARTER: {
    "messages.sent": 1000,
    "calls.minutes": 100,
    "ai.tokens": 50000,
    "webchat.sessions": 100,
    "storage.gb": 1,
    "whatsapp.conversations": 250,
  },
  GROWTH: {
    "messages.sent": 10000,
    "calls.minutes": 500,
    "ai.tokens": 250000,
    "webchat.sessions": 1000,
    "storage.gb": 10,
    "whatsapp.conversations": 1000,
  },
  PRO: {
    "messages.sent": 50000,
    "calls.minutes": 2000,
    "ai.tokens": 1000000,
    "webchat.sessions": 5000,
    "storage.gb": 50,
    "whatsapp.conversations": 5000,
  },
  ENTERPRISE: {
    "messages.sent": 999999,
    "calls.minutes": 999999,
    "ai.tokens": 999999999,
    "webchat.sessions": 999999,
    "storage.gb": 999,
    "whatsapp.conversations": 999999,
  },
};

// ============================================
// USAGE THRESHOLDS - Alert percentages
// ============================================
export const USAGE_THRESHOLDS = {
  INFO: 50,
  WARNING: 80,
  CRITICAL: 90,
  LIMIT: 100,
} as const;

export type UsageThreshold = keyof typeof USAGE_THRESHOLDS;

// ============================================
// USAGE COUNTER TYPE
// ============================================
export interface UsageCounter {
  metricKey: UsageMetricKey;
  period: string; // YYYY-MM format
  used: number;
  limit: number;
  hardLimit: number;
}

// ============================================
// USAGE ALERT TYPE
// ============================================
export interface UsageAlert {
  id: string;
  metricKey: UsageMetricKey;
  threshold: UsageThreshold;
  percentage: number;
  triggeredAt: Date;
  dismissed: boolean;
}

// ============================================
// CONTEXT TYPES
// ============================================
interface UsageContextState {
  counters: UsageCounter[];
  alerts: UsageAlert[];
  currentPeriod: string;
}

interface UsageContextType extends UsageContextState {
  // Read usage
  getUsage: (metricKey: UsageMetricKey) => UsageCounter;
  getUsagePercentage: (metricKey: UsageMetricKey) => number;
  getThresholdStatus: (metricKey: UsageMetricKey) => UsageThreshold | null;
  
  // Check if action can proceed
  canExecute: (metricKey: UsageMetricKey, amount?: number) => boolean;
  isLimitReached: (metricKey: UsageMetricKey) => boolean;
  
  // Increment usage (atomic pattern)
  incrementUsage: (metricKey: UsageMetricKey, amount?: number) => boolean;
  
  // Alerts
  getActiveAlerts: () => UsageAlert[];
  dismissAlert: (alertId: string) => void;
  
  // For demo/testing
  setUsage: (metricKey: UsageMetricKey, used: number) => void;
  resetUsage: () => void;
}

// ============================================
// HELPERS
// ============================================
const getCurrentPeriod = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const createDefaultCounters = (plan: string): UsageCounter[] => {
  const limits = PLAN_USAGE_LIMITS[plan] || PLAN_USAGE_LIMITS.FREE;
  const period = getCurrentPeriod();
  
  return Object.keys(USAGE_METRICS).map((key) => ({
    metricKey: key as UsageMetricKey,
    period,
    used: 0,
    limit: limits[key as UsageMetricKey],
    hardLimit: Math.ceil(limits[key as UsageMetricKey] * 1.1), // 10% buffer for hard limit
  }));
};

// ============================================
// CONTEXT
// ============================================
const UsageContext = createContext<UsageContextType | undefined>(undefined);

export const UsageProvider = ({ children }: { children: ReactNode }) => {
  const { currentPlan, isSandboxMode } = usePlan();
  const { user } = useAuth();
  
  const [state, setState] = useState<UsageContextState>(() => {
    const stored = localStorage.getItem("flyn_usage");
    const currentPeriod = getCurrentPeriod();
    
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      const parsedObj = isRecord(parsed) ? parsed : {};
      const parsedCurrentPeriod = typeof parsedObj.currentPeriod === "string" ? parsedObj.currentPeriod : undefined;
      // Reset if period changed
      if (parsedCurrentPeriod !== currentPeriod) {
        return {
          counters: createDefaultCounters(currentPlan),
          alerts: [],
          currentPeriod,
        };
      }

      const rawCounters = Array.isArray(parsedObj.counters) ? parsedObj.counters : [];
      const counters: UsageCounter[] = rawCounters
        .map((c: unknown) => (isRecord(c) ? c : null))
        .filter((c): c is Record<string, unknown> => !!c)
        .map((c) => {
          const metricKeyRaw = c.metricKey;
          const periodRaw = c.period;
          const usedRaw = c.used;
          const limitRaw = c.limit;
          const hardLimitRaw = c.hardLimit;

          return {
            metricKey: String(metricKeyRaw) as UsageMetricKey,
            period: typeof periodRaw === "string" ? periodRaw : currentPeriod,
            used: typeof usedRaw === "number" ? usedRaw : 0,
            limit: typeof limitRaw === "number" ? limitRaw : 0,
            hardLimit: typeof hardLimitRaw === "number" ? hardLimitRaw : 0,
          };
        });

      const rawAlerts = Array.isArray(parsedObj.alerts) ? parsedObj.alerts : [];
      const alerts: UsageAlert[] = rawAlerts
        .map((a: unknown) => (isRecord(a) ? a : null))
        .filter((a): a is Record<string, unknown> => !!a)
        .map((a) => {
          const triggeredAtRaw = a.triggeredAt;
          return {
            ...(a as unknown as Omit<UsageAlert, "triggeredAt">),
            triggeredAt: new Date(
              typeof triggeredAtRaw === "string" || typeof triggeredAtRaw === "number"
                ? triggeredAtRaw
                : Date.now(),
            ),
          } as UsageAlert;
        });
      return {
        counters,
        alerts,
        currentPeriod,
      };
    }
    
    return {
      counters: createDefaultCounters(currentPlan),
      alerts: [],
      currentPeriod,
    };
  });

  // Update limits when plan changes
  useEffect(() => {
    const limits = PLAN_USAGE_LIMITS[currentPlan] || PLAN_USAGE_LIMITS.FREE;
    
    setState((prev) => ({
      ...prev,
      counters: prev.counters.map((counter) => ({
        ...counter,
        limit: limits[counter.metricKey],
        hardLimit: Math.ceil(limits[counter.metricKey] * 1.1),
      })),
    }));
  }, [currentPlan]);

  // Hydrate counters from backend on mount (once per user session)
  useEffect(() => {
    if (!user || isSandboxMode()) return;
    const hydrate = async () => {
      try {
        const res = await authedFetch(`${API_BASE_URL}/usage/me`);
        if (!res.ok) return;
        const serverCounters = await res.json() as Array<{ metricKey: string; used: number; period: string }>;
        if (!Array.isArray(serverCounters) || serverCounters.length === 0) return;
        setState((prev) => ({
          ...prev,
          counters: prev.counters.map((c) => {
            const server = serverCounters.find((s) => s.metricKey === c.metricKey && s.period === prev.currentPeriod);
            if (!server) return c;
            // Use server value if it's higher (server is authoritative)
            return server.used > c.used ? { ...c, used: server.used } : c;
          }),
        }));
      } catch {
        // Non-critical — local state still works
      }
    };
    void hydrate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Persist state
  useEffect(() => {
    localStorage.setItem("flyn_usage", JSON.stringify(state));
  }, [state]);

  const getUsage = useCallback((metricKey: UsageMetricKey): UsageCounter => {
    const counter = state.counters.find((c) => c.metricKey === metricKey);
    if (counter) return counter;
    
    // Return empty counter if not found
    const limits = PLAN_USAGE_LIMITS[currentPlan] || PLAN_USAGE_LIMITS.FREE;
    return {
      metricKey,
      period: state.currentPeriod,
      used: 0,
      limit: limits[metricKey],
      hardLimit: Math.ceil(limits[metricKey] * 1.1),
    };
  }, [state.counters, state.currentPeriod, currentPlan]);

  const getUsagePercentage = useCallback((metricKey: UsageMetricKey): number => {
    const counter = getUsage(metricKey);
    if (counter.limit === 0) return 0;
    return Math.round((counter.used / counter.limit) * 100);
  }, [getUsage]);

  const getThresholdStatus = useCallback((metricKey: UsageMetricKey): UsageThreshold | null => {
    const percentage = getUsagePercentage(metricKey);
    
    if (percentage >= USAGE_THRESHOLDS.LIMIT) return "LIMIT";
    if (percentage >= USAGE_THRESHOLDS.CRITICAL) return "CRITICAL";
    if (percentage >= USAGE_THRESHOLDS.WARNING) return "WARNING";
    if (percentage >= USAGE_THRESHOLDS.INFO) return "INFO";
    return null;
  }, [getUsagePercentage]);

  const canExecute = useCallback((metricKey: UsageMetricKey, amount = 1): boolean => {
    // Sandbox mode doesn't consume usage
    if (isSandboxMode()) return true;
    
    const counter = getUsage(metricKey);
    return counter.used + amount <= counter.limit;
  }, [getUsage, isSandboxMode]);

  const isLimitReached = useCallback((metricKey: UsageMetricKey): boolean => {
    const counter = getUsage(metricKey);
    return counter.used >= counter.limit;
  }, [getUsage]);

  const checkAndCreateAlert = useCallback((metricKey: UsageMetricKey, newPercentage: number) => {
    const thresholds: UsageThreshold[] = ["LIMIT", "CRITICAL", "WARNING", "INFO"];
    
    for (const threshold of thresholds) {
      if (newPercentage >= USAGE_THRESHOLDS[threshold]) {
        // Check if alert already exists for this threshold
        const existingAlert = state.alerts.find(
          (a) => a.metricKey === metricKey && a.threshold === threshold
        );
        
        if (!existingAlert) {
          const newAlert: UsageAlert = {
            id: `${metricKey}-${threshold}-${Date.now()}`,
            metricKey,
            threshold,
            percentage: newPercentage,
            triggeredAt: new Date(),
            dismissed: false,
          };
          
          setState((prev) => ({
            ...prev,
            alerts: [...prev.alerts, newAlert],
          }));
        }
        break; // Only create alert for highest threshold reached
      }
    }
  }, [state.alerts]);

  const incrementUsage = useCallback((metricKey: UsageMetricKey, amount = 1): boolean => {
    // Sandbox mode doesn't increment
    if (isSandboxMode()) return true;
    
    const counter = getUsage(metricKey);
    
    // Check if can proceed
    if (counter.used + amount > counter.hardLimit) {
      return false;
    }
    
    const newUsed = counter.used + amount;
    const newPercentage = Math.round((newUsed / counter.limit) * 100);
    
    setState((prev) => ({
      ...prev,
      counters: prev.counters.map((c) =>
        c.metricKey === metricKey ? { ...c, used: newUsed } : c
      ),
    }));

    // Check for threshold alerts
    checkAndCreateAlert(metricKey, newPercentage);

    // Sync to backend (fire-and-forget — local state is source of truth for UX)
    void authedFetch(`${API_BASE_URL}/usage/increment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metricKey, amount }),
    }).catch(() => {/* non-critical */});

    return true;
  }, [getUsage, isSandboxMode, checkAndCreateAlert]);

  const getActiveAlerts = useCallback((): UsageAlert[] => {
    return state.alerts.filter((a) => !a.dismissed);
  }, [state.alerts]);

  const dismissAlert = useCallback((alertId: string) => {
    setState((prev) => ({
      ...prev,
      alerts: prev.alerts.map((a) =>
        a.id === alertId ? { ...a, dismissed: true } : a
      ),
    }));
  }, []);

  const setUsage = useCallback((metricKey: UsageMetricKey, used: number) => {
    setState((prev) => ({
      ...prev,
      counters: prev.counters.map((c) =>
        c.metricKey === metricKey ? { ...c, used } : c
      ),
    }));
    
    const counter = getUsage(metricKey);
    const newPercentage = Math.round((used / counter.limit) * 100);
    checkAndCreateAlert(metricKey, newPercentage);
  }, [getUsage, checkAndCreateAlert]);

  const resetUsage = useCallback(() => {
    setState({
      counters: createDefaultCounters(currentPlan),
      alerts: [],
      currentPeriod: getCurrentPeriod(),
    });
  }, [currentPlan]);

  return (
    <UsageContext.Provider
      value={{
        ...state,
        getUsage,
        getUsagePercentage,
        getThresholdStatus,
        canExecute,
        isLimitReached,
        incrementUsage,
        getActiveAlerts,
        dismissAlert,
        setUsage,
        resetUsage,
      }}
    >
      {children}
    </UsageContext.Provider>
  );
};

export const useUsage = () => {
  const context = useContext(UsageContext);
  if (!context) {
    throw new Error("useUsage must be used within UsageProvider");
  }
  return context;
};

// ============================================
// HELPER HOOK - Usage meter for specific metric
// ============================================
export const useUsageMeter = (metricKey: UsageMetricKey) => {
  const { getUsage, getUsagePercentage, getThresholdStatus, canExecute, incrementUsage } = useUsage();
  
  return {
    usage: getUsage(metricKey),
    percentage: getUsagePercentage(metricKey),
    threshold: getThresholdStatus(metricKey),
    canExecute: (amount?: number) => canExecute(metricKey, amount),
    increment: (amount?: number) => incrementUsage(metricKey, amount),
  };
};
