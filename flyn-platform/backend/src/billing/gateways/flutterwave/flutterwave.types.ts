/**
 * flutterwave.types.ts
 *
 * Response shapes from the Flutterwave v3 REST API.
 * Reference: https://developer.flutterwave.com/reference
 */

export interface FlwPaymentInitResponse {
  status: string;
  message: string;
  data: {
    link: string;
  };
}

export interface FlwVerifyTransactionResponse {
  status: string;
  message: string;
  data: {
    id: number;
    tx_ref: string;
    flw_ref: string;
    amount: number;
    currency: string;
    charged_amount: number;
    status: 'successful' | 'failed' | 'pending';
    customer: {
      id: number;
      email: string;
      name: string;
    };
    created_at: string;
    payment_plan?: number;
  };
}

export interface FlwCreatePlanResponse {
  status: string;
  message: string;
  data: {
    id: number;
    name: string;
    amount: number;
    interval: string;
    duration: number;
    status: string;
    currency: string;
    plan_token: string;
  };
}

export interface FlwSubscriptionResponse {
  status: string;
  message: string;
  data: {
    id: number;
    amount: number;
    customer: { id: number; customer_email: string };
    plan: number;
    status: 'active' | 'cancelled' | 'completed';
    created_at: string;
    next_payment_date: string;
  };
}

export interface FlwWebhookPayload {
  event: string;
  data: {
    id: number;
    txRef?: string;
    tx_ref?: string;
    flwRef?: string;
    flw_ref?: string;
    amount: number;
    currency: string;
    status: string;
    customer?: { email?: string; id?: number };
    'payment-plan'?: number;
    paymentPlan?: number;
  };
}

/** Supported Flutterwave billing intervals mapped to our internal type. */
export const FLW_INTERVAL_MAP: Record<string, string> = {
  monthly: 'monthly',
  quarterly: 'monthly', // map to monthly for simplicity
  yearly: 'yearly',
  annual: 'yearly',
};
