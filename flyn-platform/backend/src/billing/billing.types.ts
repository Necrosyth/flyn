// ─────────────────────────────────────────────────────────────────────────────
// billing.types.ts  —  Core domain types shared across all billing modules.
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentGatewayType = 'stripe' | 'flutterwave' | 'ziina';

export type PaymentStatus =
  | 'pending'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'incomplete';

export type BillingInterval = 'monthly' | 'yearly';

// ── Checkout / Payment ────────────────────────────────────────────────────────

export interface CheckoutPayload {
  tenantId: string;
  amount: number;          // smallest currency unit (cents / kobo / fils)
  currency: string;        // ISO 4217 e.g. 'USD', 'NGN', 'AED'
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  gateway: PaymentGatewayType;
  paymentUrl: string;      // hosted checkout URL – redirect user here
  gatewayPaymentId: string;
}

// ── Subscription ──────────────────────────────────────────────────────────────

export interface SubscriptionPayload {
  tenantId: string;
  gatewayPlanId: string;   // ID of the plan on the gateway (Stripe Price ID, etc.)
  gatewayCustomerId: string;
  metadata?: Record<string, string>;
}

export interface SubscriptionResult {
  gateway: PaymentGatewayType;
  gatewaySubscriptionId: string;
  gatewayCustomerId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

// ── Customer ──────────────────────────────────────────────────────────────────

export interface CustomerPayload {
  tenantId: string;
  email: string;
  name?: string;
}

// ── Webhook ───────────────────────────────────────────────────────────────────

export type WebhookEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'subscription.activated'
  | 'subscription.renewed'
  | 'subscription.payment_failed'
  | 'subscription.cancelled'
  | 'subscription.updated';

export interface WebhookEvent {
  gateway: PaymentGatewayType;
  /** Unique event ID from the gateway – used for idempotency deduplication. */
  eventId: string;
  type: WebhookEventType;
  gatewayPaymentId?: string;
  gatewaySubscriptionId?: string;
  gatewayCustomerId?: string;
  amount?: number;
  currency?: string;
  status?: PaymentStatus | SubscriptionStatus;
  rawData: Record<string, unknown>;
}

// ── Firestore document shapes ─────────────────────────────────────────────────

export interface PaymentRecord {
  id: string;
  tenantId: string;
  subscriptionId?: string;
  gateway: PaymentGatewayType;
  gatewayPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paidAt?: number;           // Unix ms
  metadata: Record<string, string>;
  createdAt: number;         // Unix ms
  updatedAt: number;         // Unix ms
}

export interface SubscriptionRecord {
  id: string;
  tenantId: string;
  planId: string;
  gateway: PaymentGatewayType;
  gatewaySubscriptionId: string;
  gatewayCustomerId: string;
  status: SubscriptionStatus;
  currentPeriodStart: number; // Unix ms
  currentPeriodEnd: number;   // Unix ms
  cancelAtPeriodEnd: boolean;
  createdAt: number;          // Unix ms
  updatedAt: number;          // Unix ms
}

/** Stored in Firestore to guarantee idempotent webhook processing. */
export interface ProcessedWebhookRecord {
  eventId: string;
  gateway: PaymentGatewayType;
  processedAt: number;        // Unix ms
}
