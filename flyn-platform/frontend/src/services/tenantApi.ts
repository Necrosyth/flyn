import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from './authApi';

export interface TenantPlan {
  plan: 'free' | 'starter' | 'growth' | 'pro' | 'enterprise';
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
}

/**
 * Get current tenant's plan information
 */
export async function getTenantPlan(): Promise<TenantPlan> {
  const response = await authedFetch(`${API_BASE_URL}/tenants/me/plan`);
  if (!response.ok) throw new Error('Failed to fetch tenant plan');
  return response.json();
}
