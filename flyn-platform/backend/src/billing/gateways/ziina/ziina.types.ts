/**
 * ziina.types.ts
 *
 * Response shapes from the Ziina v2 REST API.
 * Reference: https://docs.ziina.com
 */

export interface ZiinaPaymentIntentCreateBody {
  amount: number;          // integer, smallest currency unit (fils for AED)
  currency_code: string;   // 'AED' | 'USD'
  message: string;
  success_url: string;
  cancel_url: string;
  test: boolean;
  transaction_source?: string;
}

export interface ZiinaPaymentIntentResponse {
  id: string;
  payment_url: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency_code: string;
  message: string;
  created_at: string;
  updated_at: string;
}

export interface ZiinaCustomerCreateBody {
  email: string;
  name?: string;
}

export interface ZiinaCustomerResponse {
  id: string;
  email: string;
  name?: string;
  created_at: string;
}

export interface ZiinaSubscriptionPlanCreateBody {
  name: string;
  amount: number;
  currency_code: string;
  interval: 'monthly' | 'yearly';
}

export interface ZiinaSubscriptionPlanResponse {
  id: string;
  name: string;
  amount: number;
  currency_code: string;
  interval: string;
  created_at: string;
}

export interface ZiinaSubscriptionCreateBody {
  customer_id: string;
  plan_id: string;
  metadata?: Record<string, string>;
}

export interface ZiinaSubscriptionResponse {
  id: string;
  customer_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface ZiinaWebhookPayload {
  event: string;
  data: {
    id: string;
    amount?: number;
    currency_code?: string;
    status?: string;
    customer_id?: string;
    subscription_id?: string;
    payment_intent_id?: string;
  };
}
