import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
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
import {
  ZiinaPaymentIntentCreateBody,
  ZiinaPaymentIntentResponse,
  ZiinaSubscriptionResponse,
  ZiinaWebhookPayload,
} from './ziina.types';

/**
 * ZiinaService
 *
 * Adapts the Ziina v2 REST API to the IPaymentGateway interface.
 * Ziina has no official Node SDK; we use axios with typed request/response shapes.
 *
 * Security:
 *  - API key loaded once at startup; never logged or returned to clients.
 *  - Webhook signature: HMAC-SHA256(rawBody, ZIINA_WEBHOOK_SECRET), compared
 *    using timingSafeEqual to prevent timing-based side-channel attacks.
 *  - Amounts are smallest currency unit (fils for AED: 1 AED = 100 fils).
 *  - test mode flag driven by NODE_ENV.
 */
@Injectable()
export class ZiinaService implements IPaymentGateway {
  readonly gatewayName: PaymentGatewayType = 'ziina';
  private readonly logger = new Logger(ZiinaService.name);
  private readonly http: AxiosInstance;
  private readonly webhookSecret: string;
  private readonly isTestMode: boolean;

  private static readonly BASE_URL = 'https://api-v2.ziina.com/api';

  constructor() {
    const apiKey = process.env.ZIINA_API_KEY;
    const webhookSecret = process.env.ZIINA_WEBHOOK_SECRET;

    if (!apiKey || !webhookSecret) {
      this.logger.warn(
        'Ziina is not configured. Set ZIINA_API_KEY and ZIINA_WEBHOOK_SECRET to enable Ziina payments.',
      );
      this.webhookSecret = '';
      this.isTestMode = true;
      this.http = null as unknown as AxiosInstance;
      return;
    }

    this.webhookSecret = webhookSecret;
    this.isTestMode = process.env.NODE_ENV !== 'production';

    this.http = axios.create({
      baseURL: ZiinaService.BASE_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });
  }

  private assertConfigured(): void {
    if (!this.http) {
      throw new Error('Ziina is not configured. Set ZIINA_API_KEY and ZIINA_WEBHOOK_SECRET.');
    }
  }

  // ────────────────────────────────────────────────────
  // Checkout
  // ────────────────────────────────────────────────────

  async createCheckoutSession(payload: CheckoutPayload): Promise<CheckoutResult> {
    this.assertConfigured();
    const body: ZiinaPaymentIntentCreateBody = {
      amount: payload.amount,
      currency_code: payload.currency,
      message: payload.description,
      success_url: payload.successUrl,
      cancel_url: payload.cancelUrl,
      test: this.isTestMode,
      transaction_source: 'directPayment',
    };

    const res = await this.http.post<ZiinaPaymentIntentResponse>('/payment_intent', body);

    if (!res.data.payment_url) {
      throw new Error(`Ziina payment intent creation failed: no payment_url returned`);
    }

    return {
      gateway: 'ziina',
      paymentUrl: res.data.payment_url,
      gatewayPaymentId: res.data.id,
    };
  }

  // ────────────────────────────────────────────────────
  // Subscription
  // ────────────────────────────────────────────────────

  async createSubscription(payload: SubscriptionPayload): Promise<SubscriptionResult> {
    // Subscribe an existing customer to a Ziina subscription plan.
    const res = await this.http.post<ZiinaSubscriptionResponse>('/subscription', {
      customer_id: payload.gatewayCustomerId,
      plan_id: payload.gatewayPlanId,
      metadata: { tenantId: payload.tenantId, ...(payload.metadata ?? {}) },
    });

    return this.mapSubscription(res.data);
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.http.delete(`/subscription/${subscriptionId}`);
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    const res = await this.http.get<ZiinaSubscriptionResponse>(`/subscription/${subscriptionId}`);
    return this.mapSubscription(res.data);
  }

  // ────────────────────────────────────────────────────
  // Customer
  // ────────────────────────────────────────────────────

  async createCustomer(payload: CustomerPayload): Promise<string> {
    const res = await this.http.post<{ id: string }>('/customer', {
      email: payload.email,
      name: payload.name ?? payload.email,
    });
    return res.data.id;
  }

  // ────────────────────────────────────────────────────
  // Webhook
  // ────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    // Compute HMAC-SHA256 of the raw body using ZIINA_WEBHOOK_SECRET.
    const expectedSig = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'utf-8');
    const receivedBuf = Buffer.from(signature, 'utf-8');

    const signaturesMatch =
      expectedBuf.length === receivedBuf.length &&
      timingSafeEqual(expectedBuf, receivedBuf);

    if (!signaturesMatch) {
      throw new Error('Ziina webhook HMAC-SHA256 signature mismatch');
    }

    const body = JSON.parse(rawBody.toString('utf-8')) as ZiinaWebhookPayload;
    return this.mapWebhookEvent(body);
  }

  // ────────────────────────────────────────────────────
  // Private mappers
  // ────────────────────────────────────────────────────

  private mapSubscription(data: ZiinaSubscriptionResponse): SubscriptionResult {
    const STATUS_MAP: Record<string, SubscriptionStatus> = {
      active: 'active',
      trialing: 'trialing',
      past_due: 'past_due',
      cancelled: 'cancelled',
    };

    return {
      gateway: 'ziina',
      gatewaySubscriptionId: data.id,
      gatewayCustomerId: data.customer_id,
      status: STATUS_MAP[data.status] ?? 'active',
      currentPeriodStart: new Date(data.current_period_start),
      currentPeriodEnd: new Date(data.current_period_end),
      cancelAtPeriodEnd: data.cancel_at_period_end,
    };
  }

  private mapWebhookEvent(body: ZiinaWebhookPayload): WebhookEvent {
    const EVENT_MAP: Record<string, WebhookEventType> = {
      'payment_intent.completed': 'payment.succeeded',
      'payment_intent.failed': 'payment.failed',
      'subscription.payment': 'subscription.renewed',
      'subscription.cancelled': 'subscription.cancelled',
      'subscription.activated': 'subscription.activated',
      'subscription.updated': 'subscription.updated',
    };

    const type: WebhookEventType = EVENT_MAP[body.event] ?? 'payment.failed';

    return {
      gateway: 'ziina',
      eventId: body.data.id,
      type,
      gatewayPaymentId: body.data.payment_intent_id ?? body.data.id,
      gatewaySubscriptionId: body.data.subscription_id,
      gatewayCustomerId: body.data.customer_id,
      amount: body.data.amount,
      currency: body.data.currency_code,
      rawData: body.data as unknown as Record<string, unknown>,
    };
  }
}

//       GET /api/payment_intent/:id
//
// Supported currencies: AED (primary), USD
// Coverage: UAE, Saudi Arabia, Bahrain, Kuwait, Oman, Qatar
//
// NOTE: Ziina is UAE-based and focused on GCC / MENA region.
//       Subscription API is newer — confirm latest endpoint availability.
