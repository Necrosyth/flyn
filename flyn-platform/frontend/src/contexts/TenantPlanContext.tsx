import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getTenantPlan } from '@/services/tenantApi';
import type { TenantPlan } from '@/services/tenantApi';
import { isDemoModeEnabled } from '@/lib/demo-mode';

interface TenantPlanContextType {
  tenantPlan: TenantPlan | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const TenantPlanContext = createContext<TenantPlanContextType | undefined>(undefined);

export function TenantPlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const demoMode = isDemoModeEnabled();
  const [tenantPlan, setTenantPlan] = useState<TenantPlan | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = async () => {
    if (demoMode) {
      setTenantPlan({ plan: 'enterprise', status: 'active' });
      setError(null);
      setLoading(false);
      return;
    }
    if (!user) {
      setTenantPlan(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const plan = await getTenantPlan();
      setTenantPlan(plan);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      setTenantPlan(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlan();
  }, [user?.id, demoMode]);

  return (
    <TenantPlanContext.Provider
      value={{
        tenantPlan,
        loading,
        error,
        refresh: fetchPlan,
      }}
    >
      {children}
    </TenantPlanContext.Provider>
  );
}

export function useTenantPlan() {
  const context = useContext(TenantPlanContext);
  if (!context) {
    throw new Error('useTenantPlan must be used within TenantPlanProvider');
  }
  return context;
}
