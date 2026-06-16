import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';
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
  FlwPaymentInitResponse,
  FlwVerifyTransactionResponse,
  FlwWebhookPayload,
} from './flutterwave.types';

/**
 * FlutterwaveService
 *
 * Adapts the Flutterwave v3 REST API to the IPaymentGateway interface.
 * Uses axios directly for full TypeScript type safety.
 *
 * Security:
 *  - Secret key is loaded once at startup; never logged or returned to clients.
 *  - Webhook verification uses a simple constant-time check against
 *    FLW_WEBHOOK_SECRET_HASH (provided by Flutterwave dashboard).
 *  - All amounts handled as integers (smallest currency unit).
 *  - Transaction references are random UUIDs to prevent enumeration.
 */
@Injectable()
export class FlutterwaveService implements IPaymentGateway {
  readonly gatewayName: PaymentGatewayType = 'flutterwave';
  private readonly logger = new Logger(FlutterwaveService.name);
  private readonly http: AxiosInstance;
  private readonly webhookSecretHash: string;
  private readonly publicKey: string;

  private static readonly BASE_URL = 'https://api.flutterwave.com/v3';

  constructor() {
    const secretKey = process.env.FLW_SECRET_KEY;
    const publicKey = process.env.FLW_PUBLIC_KEY;
    const webhookSecretHash = process.env.FLW_WEBHOOK_SECRET_HASH;

    if (!secretKey || !publicKey || !webhookSecretHash) {
      this.logger.warn(
        'Flutterwave is not configured. Set FLW_SECRET_KEY, FLW_PUBLIC_KEY, and FLW_WEBHOOK_SECRET_HASH to enable Flutterwave payments.',
      );
      this.publicKey = '';
      this.webhookSecretHash = '';
      this.http = null as unknown as AxiosInstance;
      return;
    }

    this.publicKey = publicKey;
    this.webhookSecretHash = webhookSecretHash;

    this.http = axios.create({
      baseURL: FlutterwaveService.BASE_URL,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });
  }

  private assertConfigured(): void {
    if (!this.http) {
      throw new Error('Flutterwave is not configured. Set FLW_SECRET_KEY, FLW_PUBLIC_KEY, and FLW_WEBHOOK_SECRET_HASH.');
    }
  }

  // ────────────────────────────────────────────────────
  // Checkout
  // ────────────────────────────────────────────────────

  async createCheckoutSession(payload: CheckoutPayload): Promise<CheckoutResult> {
    this.assertConfigured();
    // Generate a unique transaction reference to prevent duplicate charges.
    const txRef = `flw-${payload.tenantId}-${randomUUID()}`;

    const body = {
      tx_ref: txRef,
      amount: payload.amount,        // Flutterwave accepts full unit amounts (e.g. 5000 NGN)
      currency: payload.currency,
      redirect_url: payload.successUrl,
      meta: { tenantId: payload.tenantId, ...(payload.metadata ?? {}) },
      customer: {
        email: payload.customerEmail,
        name: payload.customerEmail,
      },
      customizations: {
        title: payload.description,
        logo: '',
      },
      payment_options: 'card,banktransfer,ussd',
    };

    const res = await this.http.post<FlwPaymentInitResponse>('/payments', body);

    if (res.data.status !== 'success' || !res.data.data?.link) {
      throw new Error(`Flutterwave checkout initiation failed: ${res.data.message}`);
    }

    return {
      gateway: 'flutterwave',
      paymentUrl: res.data.data.link,
      gatewayPaymentId: txRef,
    };
  }

  // ────────────────────────────────────────────────────
  // Subscription via Payment Plans
  // ────────────────────────────────────────────────────

  async createSubscription(payload: SubscriptionPayload): Promise<SubscriptionResult> {
    // In Flutterwave, a "subscription" is a payment plan with a tokenized card.
    // The customer must first make a charge with a payment plan attached;
    // that links their tokenized card to the plan for auto-renewals.
    // Here we initiate the first charge for the plan.
    const txRef = `flw-sub-${payload.tenantId}-${randomUUID()}`;

    const body = {
      tx_ref: txRef,
      amount: 0,          // Will be overridden by plan amount
      currency: 'NGN',    // Default; plan currency takes precedence
      payment_plan: payload.gatewayPlanId,
      customer: {
        email: payload.gatewayCustomerId, // Here we store email as customerId for FLW
        name: `tenant-${payload.tenantId}`,
      },
      meta: { tenantId: payload.tenantId, ...(payload.metadata ?? {}) },
    };

    const res = await this.http.post('/payments', body);

    if (res.data.status !== 'success') {
      throw new Error(`Flutterwave subscription initiation failed: ${res.data.message as string}`);
    }

    const now = Date.now();
    return {
      gateway: 'flutterwave',
      gatewaySubscriptionId: txRef,
      gatewayCustomerId: payload.gatewayCustomerId,
      status: 'active',
      currentPeriodStart: new Date(now),
      currentPeriodEnd: new Date(now + 30 * 24 * 60 * 60 * 1000), // +30 days
      cancelAtPeriodEnd: false,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // subscriptionId here is the Flutterwave payment-plan numeric ID
    await this.http.put(`/payment-plans/${subscriptionId}/cancel`);
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    const res = await this.http.get<{ status: string; data: { id: number; status: string; created_at: string; next_payment_date: string; customer: { customer_email: string } } }>(
      `/payment-plans/${subscriptionId}`,
    );

    const d = res.data.data;
    const STATUS_MAP: Record<string, SubscriptionStatus> = {
      active: 'active',
      cancelled: 'cancelled',
      completed: 'expired',
    };

    return {
      gateway: 'flutterwave',
      gatewaySubscriptionId: String(d.id),
      gatewayCustomerId: d.customer?.customer_email ?? '',
      status: STATUS_MAP[d.status] ?? 'active',
      currentPeriodStart: new Date(d.created_at),
      currentPeriodEnd: new Date(d.next_payment_date ?? Date.now()),
      cancelAtPeriodEnd: false,
    };
  }

  // ────────────────────────────────────────────────────
  // Customer
  // ────────────────────────────────────────────────────

  async createCustomer(payload: CustomerPayload): Promise<string> {
    // Flutterwave has no standalone "create customer" endpoint.
    // Customers are created implicitly on first payment.
    // We return the email as the customer ID, which is used to look up history.
    this.logger.log(`Flutterwave customer registered inline for tenant ${payload.tenantId}`);
    return payload.email;
  }

  // ────────────────────────────────────────────────────
  // Webhook
  // ────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    // Flutterwave uses a secret hash sent as a plain string header.
    // We use timingSafeEqual to prevent timing attacks.
    const { timingSafeEqual } = await import('crypto');
    const expectedBuf = Buffer.from(this.webhookSecretHash, 'utf-8');
    const receivedBuf = Buffer.from(signature, 'utf-8');

    const signaturesMatch =
      expectedBuf.length === receivedBuf.length &&
      timingSafeEqual(expectedBuf, receivedBuf);

    if (!signaturesMatch) {
      throw new Error('Flutterwave webhook signature (verif-hash) mismatch');
    }

    const body = JSON.parse(rawBody.toString('utf-8')) as FlwWebhookPayload;
    return this.mapWebhookEvent(body);
  }

  // ────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────

  /** Verifies a transaction with FLW and returns the verification response. */
  async verifyTransaction(transactionId: string): Promise<FlwVerifyTransactionResponse> {
    const res = await this.http.get<FlwVerifyTransactionResponse>(`/transactions/${transactionId}/verify`);
    return res.data;
  }

  private mapWebhookEvent(body: FlwWebhookPayload): WebhookEvent {
    const EVENT_MAP: Record<string, WebhookEventType> = {
      'charge.completed': 'payment.succeeded',
      'transfer.completed': 'payment.succeeded',
      'subscription.cancelled': 'subscription.cancelled',
      'payment-plan.payment': 'subscription.renewed',
    };

    const type: WebhookEventType = EVENT_MAP[body.event] ?? 'payment.failed';
    const txRef = body.data?.tx_ref ?? body.data?.txRef;
    const planId = body.data?.['payment-plan'] ?? body.data?.paymentPlan;

    return {
      gateway: 'flutterwave',
      eventId: txRef ?? `flw-${Date.now()}`,
      type,
      gatewayPaymentId: txRef,
      gatewaySubscriptionId: planId ? String(planId) : undefined,
      gatewayCustomerId: body.data?.customer?.email,
      amount: body.data?.amount,
      currency: body.data?.currency,
      rawData: body.data as unknown as Record<string, unknown>,
    };
  }
}
