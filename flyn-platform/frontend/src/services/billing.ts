import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";

export type BillingInterval = "monthly" | "yearly";

export type PlanPricing = {
  region: string;
  currency: string;
  amount: number;
};

export type BillingPlan = {
  id: string;
  name: string;
  description: string;
  interval: BillingInterval;
  features: string[];
  isActive: boolean;
  pricing: PlanPricing[];
  gatewayPlanIds: {
    stripe?: string;
    flutterwave?: string;
    ziina?: string;
  };
  createdAt: number;
  updatedAt: number;
};

export type PaymentStatus = "pending" | "successful" | "failed" | "cancelled" | "refunded";

export type PaymentRecord = {
  id: string;
  tenantId: string;
  subscriptionId?: string;
  gateway: string;
  gatewayPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paidAt?: number;
  metadata: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "cancelled"
  | "expired"
  | "incomplete";

export type SubscriptionRecord = {
  id: string;
  tenantId: string;
  planId: string;
  gateway: string;
  gatewaySubscriptionId: string;
  gatewayCustomerId: string;
  status: SubscriptionStatus;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CheckoutResult = {
  gateway: string;
  paymentUrl: string;
  gatewayPaymentId: string;
};

const base = `${API_BASE_URL}/billing`;

async function parseError(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  return text || resp.statusText;
}

export const billingService = {
  async listPlans(region?: string): Promise<BillingPlan[]> {
    const url = `${base}/plans${region ? `?region=${encodeURIComponent(region)}` : ""}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async listPayments(): Promise<PaymentRecord[]> {
    const resp = await authedFetch(`${base}/payments`);
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async subscribe(input: { tenantId: string; planId: string; countryCode: string; email: string; successUrl?: string; cancelUrl?: string }): Promise<SubscriptionRecord> {
    const resp = await authedFetch(`${base}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async createCheckout(input: {
    tenantId: string;
    amount: number;
    currency: string;
    countryCode: string;
    description: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<CheckoutResult> {
    const resp = await authedFetch(`${base}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async topUpWallet(input: {
    credits: number;
    countryCode: string;
    currency: string;
  }): Promise<CheckoutResult> {
    const resp = await authedFetch(`${base}/checkout/credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async planCheckout(input: {
    planId: string;
    billingInterval: 'monthly' | 'yearly';
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{ checkoutUrl: string }> {
    const resp = await authedFetch(`${base}/plan-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async cancelSubscription(subscriptionId: string): Promise<SubscriptionRecord> {
    const resp = await authedFetch(`${base}/subscription/${encodeURIComponent(subscriptionId)}`, {
      method: "DELETE",
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async getSubscription(subscriptionId: string): Promise<SubscriptionRecord> {
    const resp = await authedFetch(`${base}/subscription/${encodeURIComponent(subscriptionId)}`);
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async getCurrentSubscription(): Promise<SubscriptionRecord | null> {
    const resp = await authedFetch(`${base}/subscription/current`);
    if (!resp.ok) {
      if (resp.status === 404) return null;
      throw new Error(await parseError(resp));
    }
    return resp.json();
  },
};
