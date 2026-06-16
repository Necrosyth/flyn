/**
 * stripe.types.ts
 *
 * Stripe-specific helper types and re-exports.
 * The SDK ships its own complete type definitions; this file only
 * adds application-level helpers so services stay clean.
 */

/** The Stripe event types we actively handle. */
export const HANDLED_STRIPE_EVENTS = [
  'checkout.session.completed',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
] as const;

export type HandledStripeEventType = (typeof HANDLED_STRIPE_EVENTS)[number];
