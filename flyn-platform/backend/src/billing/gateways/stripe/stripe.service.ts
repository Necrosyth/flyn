import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  CheckoutPayload,
  CheckoutResult,
  CustomerPayload,
  PaymentGatewayType,
  SubscriptionPayload,
  SubscriptionResult,
  SubscriptionStatus,
  WebhookEvent,
  WebhookEventType,
} from '../../billing.types';
import { IPaymentGateway } from '../gateway.interface';
import { SystemSettingsService } from '../../../system-settings/system-settings.service';

/**
 * StripeService
 *
 * Adapts the Stripe Node.js SDK to the IPaymentGateway interface.
 * Configuration is dynamically loaded from SystemSettingsService (Firestore).
 */
@Injectable()
export class StripeService implements IPaymentGateway {
  readonly gatewayName: PaymentGatewayType = 'stripe';
  private readonly logger = new Logger(StripeService.name);

  constructor(private readonly settingsService: SystemSettingsService) {}

  private async getClient(): Promise<Stripe> {
    const config = await this.settingsService.getStripeConfig();
    if (!config.isEnabled || !config.secretKey) {
      throw new Error('Stripe is not configured or is disabled in system settings.');
    }

    return new Stripe(config.secretKey, {
      apiVersion: '2026-02-25.clover',
      appInfo: { name: 'FLYN Platform', version: '1.0.0' },
    });
  }

  private async getWebhookSecret(): Promise<string> {
    const config = await this.settingsService.getStripeConfig();
    return config.webhookSecret;
  }

  // ────────────────────────────────────────────────────
  // Checkout
  // ────────────────────────────────────────────────────

  async createCheckoutSession(payload: CheckoutPayload): Promise<CheckoutResult> {
    const client = await this.getClient();
    
    // Resolve or create customer if email provided but no ID
    let customerId: string | undefined = undefined;
    if (payload.customerEmail) {
      const customers = await client.customers.list({ email: payload.customerEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await client.customers.create({
          email: payload.customerEmail,
          metadata: { tenantId: payload.tenantId },
        });
        customerId = customer.id;
      }
    }

    const session = await client.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: payload.currency.toLowerCase(),
            unit_amount: payload.amount,
            product_data: { name: payload.description },
          },
          quantity: 1,
        },
      ],
      success_url: payload.successUrl,
      cancel_url: payload.cancelUrl,
      metadata: {
        tenantId: payload.tenantId,
        ...(payload.metadata ?? {}),
      },
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });

    if (!session.url) {
      throw new Error('Stripe checkout session URL is missing');
    }

    return {
      gateway: 'stripe',
      paymentUrl: session.url,
      gatewayPaymentId: session.id,
    };
  }

  // ────────────────────────────────────────────────────
  // Subscription Checkout (Stripe-hosted checkout for plans)
  // ────────────────────────────────────────────────────

  async createSubscriptionCheckout(payload: {
    tenantId: string;
    email: string;
    priceId: string;
    planId: string;
    billingInterval: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    const client = await this.getClient();

    // Resolve or create customer by email so existing customers are preserved
    let customerId: string | undefined;
    if (payload.email) {
      const customers = await client.customers.list({ email: payload.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await client.customers.create({
          email: payload.email,
          metadata: { tenantId: payload.tenantId },
        });
        customerId = customer.id;
      }
    }

    const session = await client.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: payload.priceId, quantity: 1 }],
      success_url: payload.successUrl,
      cancel_url: payload.cancelUrl,
      metadata: {
        tenantId: payload.tenantId,
        planId: payload.planId,
        billingInterval: payload.billingInterval,
      },
      subscription_data: {
        metadata: {
          tenantId: payload.tenantId,
          planId: payload.planId,
          billingInterval: payload.billingInterval,
        },
      },
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });

    if (!session.url) throw new Error('Stripe subscription checkout session URL is missing');

    return { url: session.url, sessionId: session.id };
  }

  // ────────────────────────────────────────────────────
  // Recurring add-on checkout (inline price — no pre-made Stripe Price needed)
  // Used by Flyn Voice additional numbers ($X/mo each).
  // ────────────────────────────────────────────────────

  async createRecurringCheckout(payload: {
    tenantId: string;
    email: string;
    unitAmount: number; // smallest currency unit (e.g. 115 = $1.15)
    currency: string;
    productName: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    const client = await this.getClient();

    let customerId: string | undefined;
    if (payload.email) {
      const customers = await client.customers.list({ email: payload.email, limit: 1 });
      customerId = customers.data[0]?.id
        ?? (await client.customers.create({ email: payload.email, metadata: { tenantId: payload.tenantId } })).id;
    }

    const metadata = { tenantId: payload.tenantId, ...payload.metadata };

    const session = await client.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: payload.currency.toLowerCase(),
            unit_amount: payload.unitAmount,
            recurring: { interval: 'month' },
            product_data: { name: payload.productName },
          },
        },
      ],
      success_url: payload.successUrl,
      cancel_url: payload.cancelUrl,
      metadata,
      subscription_data: { metadata },
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });

    if (!session.url) throw new Error('Stripe recurring checkout session URL is missing');
    return { url: session.url, sessionId: session.id };
  }

  /** Schedule cancellation at the end of the current paid period (no refund, no immediate cut-off). */
  async cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<{ currentPeriodEnd: number }> {
    const client = await this.getClient();
    const sub = await client.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    return { currentPeriodEnd: this.mapSubscription(sub).currentPeriodEnd.getTime() };
  }

  // ────────────────────────────────────────────────────
  // Subscription
  // ────────────────────────────────────────────────────

  async createSubscription(payload: SubscriptionPayload): Promise<SubscriptionResult> {
    const client = await this.getClient();
    const sub = await client.subscriptions.create({
      customer: payload.gatewayCustomerId,
      items: [{ price: payload.gatewayPlanId }],
      payment_behavior: 'error_if_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        tenantId: payload.tenantId,
        ...(payload.metadata ?? {}),
      },
    });

    return this.mapSubscription(sub);
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const client = await this.getClient();
    await client.subscriptions.cancel(subscriptionId);
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    const client = await this.getClient();
    const sub = await client.subscriptions.retrieve(subscriptionId);
    return this.mapSubscription(sub);
  }

  // ────────────────────────────────────────────────────
  // Customer
  // ────────────────────────────────────────────────────

  async createCustomer(payload: CustomerPayload): Promise<string> {
    const client = await this.getClient();
    const customer = await client.customers.create({
      email: payload.email,
      name: payload.name,
      metadata: { tenantId: payload.tenantId },
    });
    return customer.id;
  }

  // ────────────────────────────────────────────────────
  // Webhook
  // ────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    const client = await this.getClient();
    const webhookSecret = await this.getWebhookSecret();

    if (!webhookSecret) {
      throw new Error('Stripe webhooks are not configured (secret missing).');
    }

    const event = client.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );

    return this.mapWebhookEvent(event);
  }

  // ────────────────────────────────────────────────────
  // Private mappers
  // ────────────────────────────────────────────────────

  private mapSubscription(sub: Stripe.Subscription): SubscriptionResult {
    // Normalise Stripe status to our internal SubscriptionStatus.
    const STATUS_MAP: Record<string, SubscriptionStatus> = {
      active: 'active',
      trialing: 'trialing',
      past_due: 'past_due',
      canceled: 'cancelled',
      incomplete: 'incomplete',
      incomplete_expired: 'expired',
      unpaid: 'past_due',
      paused: 'past_due',
    };

    // In Stripe API 2025+, period data lives on the first SubscriptionItem.
    // We cast the item (and sub) via unknown to access period fields that
    // may not be reflected in the SDK typings for this API version.
    const item = sub.items?.data?.[0] as unknown as {
      period?: { start?: number; end?: number };
      current_period_start?: number;
      current_period_end?: number;
    } | undefined;

    const subAny = sub as unknown as {
      current_period_start?: number;
      current_period_end?: number;
      billing_cycle_anchor?: number;
    };

    const periodStart: number =
      item?.period?.start ??
      item?.current_period_start ??
      subAny.current_period_start ??
      subAny.billing_cycle_anchor ??
      Math.floor(Date.now() / 1000);

    const periodEnd: number =
      item?.period?.end ??
      item?.current_period_end ??
      subAny.current_period_end ??
      (periodStart + 30 * 24 * 3600);

    return {
      gateway: 'stripe',
      gatewaySubscriptionId: sub.id,
      gatewayCustomerId: sub.customer as string,
      status: STATUS_MAP[sub.status] ?? 'incomplete',
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
  }

  private mapWebhookEvent(event: Stripe.Event): WebhookEvent {
    const EVENT_MAP: Partial<Record<Stripe.Event.Type, WebhookEventType>> = {
      'checkout.session.completed': 'payment.succeeded',
      'invoice.payment_succeeded': 'subscription.renewed',
      'invoice.payment_failed': 'subscription.payment_failed',
      'customer.subscription.updated': 'subscription.updated',
      'customer.subscription.deleted': 'subscription.cancelled',
      'customer.subscription.created': 'subscription.activated',
      'charge.refunded': 'payment.failed',
    };

    const type = EVENT_MAP[event.type];
    if (!type) {
      this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }

    // Cast via unknown first to safely convert the Stripe union type to a
    // plain record — this is intentional, as we extract only known fields.
    const data = event.data.object as unknown as Record<string, unknown>;

    return {
      gateway: 'stripe',
      eventId: event.id,
      type: type ?? 'payment.failed',
      gatewayPaymentId: (data['id'] as string) ?? undefined,
      gatewaySubscriptionId: (data['subscription'] as string) ?? undefined,
      gatewayCustomerId: (data['customer'] as string) ?? undefined,
      amount: typeof data['amount_total'] === 'number' ? (data['amount_total'] as number) : undefined,
      currency: typeof data['currency'] === 'string' ? (data['currency'] as string).toUpperCase() : undefined,
      rawData: data,
    };
  }
}
