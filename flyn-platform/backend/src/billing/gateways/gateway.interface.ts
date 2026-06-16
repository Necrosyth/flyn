import {
  CheckoutPayload,
  CheckoutResult,
  CustomerPayload,
  PaymentGatewayType,
  SubscriptionPayload,
  SubscriptionResult,
  WebhookEvent,
} from '../billing.types';

/**
 * IPaymentGateway
 *
 * Every payment gateway adapter (Stripe, Flutterwave, Ziina) MUST implement
 * this interface.  BillingService talks only to this abstraction, never to
 * a concrete gateway class directly.
 */
export interface IPaymentGateway {
  /** Identifies which gateway this adapter wraps. */
  readonly gatewayName: PaymentGatewayType;

  /**
   * Create a hosted checkout session and return the redirect URL.
   * The customer is sent to `paymentUrl` to complete payment.
   */
  createCheckoutSession(payload: CheckoutPayload): Promise<CheckoutResult>;

  /**
   * Subscribe an existing gateway customer to a plan.
   * The caller is responsible for ensuring the customer exists first.
   */
  createSubscription(payload: SubscriptionPayload): Promise<SubscriptionResult>;

  /** Cancel an active subscription (takes effect at period end or immediately). */
  cancelSubscription(subscriptionId: string): Promise<void>;

  /** Fetch the current state of a subscription from the gateway. */
  getSubscription(subscriptionId: string): Promise<SubscriptionResult>;

  /**
   * Create (or look up) a customer on the gateway.
   * Returns the gateway-side customer ID to store on the tenant.
   */
  createCustomer(payload: CustomerPayload): Promise<string>;

  /**
   * Verify a raw webhook payload and return a normalised WebhookEvent.
   *
   * Security contract:
   *  - MUST verify the HMAC/signature before doing any further processing.
   *  - MUST throw if the signature is invalid — do not swallow the error.
   *  - `rawBody` MUST be the unmodified Buffer from the HTTP request.
   */
  handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
}
