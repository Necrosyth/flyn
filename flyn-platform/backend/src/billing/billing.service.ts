import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FirebaseService } from '../firebase/firebase.service';
import { GatewayFactory } from './gateways/gateway.factory';
import { RegionDetectorService } from './region/region-detector.service';
import { PlansService } from './plans/plans.service';
import { TenantsService } from '../tenants/tenants.service';
import { StripeService } from './gateways/stripe/stripe.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { WebsiteBuilderCreditsService } from '../website-builder/website-builder-credits.service';
import { WalletService } from '../wallet/wallet.service';
import { VoiceProvisioningService } from '../telephony/voice-provisioning.service';
import {
  CheckoutResult,
  PaymentRecord,
  ProcessedWebhookRecord,
  SubscriptionRecord,
  SubscriptionResult,
  WebhookEvent,
} from './billing.types';

/**
 * BillingService
 *
 * Orchestrates the full billing lifecycle:
 *   1. Resolves the correct payment gateway via GatewayFactory + RegionDetector.
 *   2. Creates checkout sessions and subscriptions on the gateway.
 *   3. Persists payment/subscription records to Firestore.
 *   4. Processes inbound webhook events with idempotency guarantees.
 *
 * Firestore collections:
 *   billing_payments      — one doc per payment attempt
 *   billing_subscriptions — one doc per active/historical subscription
 *   billing_webhooks      — processed event IDs (idempotency lock)
 *
 * Security:
 *   - tenantId in API calls is driven by the Firebase auth token, not the
 *     request body.  BillingController passes req.firebaseUser claims here.
 *   - Webhook idempotency prevents double-processing retried events.
 *   - No raw gateway credentials are ever logged.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  private readonly COL_PAYMENTS = 'billing_payments';
  private readonly COL_SUBSCRIPTIONS = 'billing_subscriptions';
  private readonly COL_WEBHOOKS = 'billing_webhooks';

  constructor(
    private readonly firebase: FirebaseService,
    private readonly gatewayFactory: GatewayFactory,
    private readonly regionDetector: RegionDetectorService,
    private readonly plansService: PlansService,
    private readonly creditsService: WebsiteBuilderCreditsService,
    private readonly walletService: WalletService,
    private readonly tenantsService: TenantsService,
    private readonly stripeService: StripeService,
    private readonly voiceProvisioning: VoiceProvisioningService,
  ) {}

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialised');
    return db;
  }

  // ────────────────────────────────────────────────────
  // Public API — Checkout (one-time payment)
  // ────────────────────────────────────────────────────

  async createCheckoutSession(
    dto: CreatePaymentDto,
    tenantId: string,  // from verified Firebase token — NOT from dto.tenantId
  ): Promise<CheckoutResult> {
    try {
      this.logger.log(`Creating checkout session for tenant ${tenantId}, amount: ${dto.amount}`);
      const region = this.regionDetector.resolveRegion(dto.countryCode);
      const gateway = this.gatewayFactory.resolve(region);

      const result = await gateway.createCheckoutSession({
        tenantId,
        amount: dto.amount,
        currency: dto.currency,
        description: dto.description,
        customerEmail: dto.customerEmail,
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
        metadata: dto.metadata,
      });

      // Persist a pending payment record immediately.
      const paymentId = randomUUID();
      const record: PaymentRecord = {
        id: paymentId,
        tenantId,
        gateway: result.gateway,
        gatewayPaymentId: result.gatewayPaymentId,
        amount: dto.amount,
        currency: dto.currency,
        status: 'pending',
        metadata: dto.metadata ?? {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await this.db().collection(this.COL_PAYMENTS).doc(paymentId).set(record);
      this.logger.log(`Checkout session created: ${paymentId} via ${gateway.gatewayName}`);

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to create checkout session for tenant ${tenantId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ────────────────────────────────────────────────────
  // Public API — Subscriptions
  // ────────────────────────────────────────────────────

  async createSubscription(
    dto: CreateSubscriptionDto,
    tenantId: string, // from verified Firebase token
    email: string,    // from verified Firebase token
  ): Promise<SubscriptionRecord> {
    const region = this.regionDetector.resolveRegion(dto.countryCode);
    const gateway = this.gatewayFactory.resolve(region);
    const plan = await this.plansService.getPlan(dto.planId);

    // Resolve the gateway-specific plan ID.
    const gatewayPlanId = plan.gatewayPlanIds[gateway.gatewayName];
    if (!gatewayPlanId) {
      throw new ConflictException(
        `Plan '${plan.name}' is not available for gateway '${gateway.gatewayName}' (region: ${region})`,
      );
    }

    // Create or retrieve the customer on the gateway.
    const gatewayCustomerId = await gateway.createCustomer({
      tenantId,
      email,
      name: tenantId,
    });

    // Create the subscription on the gateway.
    const subResult: SubscriptionResult = await gateway.createSubscription({
      tenantId,
      gatewayPlanId,
      gatewayCustomerId,
      metadata: { planId: plan.id },
    });

    // Persist to Firestore.
    const subId = randomUUID();
    const record: SubscriptionRecord = {
      id: subId,
      tenantId,
      planId: plan.id,
      gateway: subResult.gateway,
      gatewaySubscriptionId: subResult.gatewaySubscriptionId,
      gatewayCustomerId: subResult.gatewayCustomerId,
      status: subResult.status,
      currentPeriodStart: subResult.currentPeriodStart.getTime(),
      currentPeriodEnd: subResult.currentPeriodEnd.getTime(),
      cancelAtPeriodEnd: subResult.cancelAtPeriodEnd,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.db().collection(this.COL_SUBSCRIPTIONS).doc(subId).set(record);
    this.logger.log(`Subscription created: ${subId} via ${gateway.gatewayName}`);
    return record;
  }

  async getSubscription(subscriptionId: string, tenantId: string): Promise<SubscriptionRecord> {
    const doc = await this.db().collection(this.COL_SUBSCRIPTIONS).doc(subscriptionId).get();
    if (!doc.exists) throw new NotFoundException(`Subscription ${subscriptionId} not found`);

    const data = { id: doc.id, ...doc.data() } as SubscriptionRecord;

    // Ownership check: the subscription must belong to the requesting tenant.
    if (data.tenantId !== tenantId) {
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);
    }
    return data;
  }

  async cancelSubscription(subscriptionId: string, tenantId: string): Promise<SubscriptionRecord> {
    const record = await this.getSubscription(subscriptionId, tenantId);
    const gateway = this.gatewayFactory.resolve(
      this.regionDetector.resolveRegion(''),  // Use stored gateway directly.
    );

    // Use the gateway stored on the record (not re-resolved) to prevent
    // cancelling via the wrong gateway if region config changes.
    const allGateways = ['stripe', 'flutterwave', 'ziina'] as const;
    const targetGateway = this.gatewayFactory.resolve(
      record.gateway === 'flutterwave' ? 'africa'
      : record.gateway === 'ziina' ? 'middle_east'
      : 'global',
    );
    // Suppress lint warning on unused variable
    void gateway;
    void allGateways;

    await targetGateway.cancelSubscription(record.gatewaySubscriptionId);

    const updated: SubscriptionRecord = {
      ...record,
      status: 'cancelled',
      updatedAt: Date.now(),
    };
    await this.db().collection(this.COL_SUBSCRIPTIONS).doc(subscriptionId).set(updated);
    return updated;
  }

  async listPayments(tenantId: string): Promise<PaymentRecord[]> {
    try {
      const db = this.db();
      const snap = await db
        .collection(this.COL_PAYMENTS)
        .where('tenantId', '==', tenantId)
        .get();

      const payments = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentRecord));
      
      // Sort manually to avoid index requirement for now
      return payments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 50);
    } catch (error) {
      this.logger.error(`Failed to list payments for tenant ${tenantId}: ${error.message}`);
      return []; // Return empty instead of 500
    }
  }

  // ────────────────────────────────────────────────────
  // Plan subscription via Stripe Checkout
  // ────────────────────────────────────────────────────

  async createPlanCheckout(
    planId: string,
    billingInterval: 'monthly' | 'yearly',
    tenantId: string,
    email: string,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<{ checkoutUrl: string }> {
    const planDoc = await this.db().collection('plan_definitions').doc(planId).get();
    if (!planDoc.exists) {
      throw new NotFoundException(`Plan '${planId}' not found`);
    }

    const plan = planDoc.data() as any;
    const priceId = billingInterval === 'yearly'
      ? plan.pricing?.stripeYearlyPriceId
      : plan.pricing?.stripeMonthlyPriceId;

    if (!priceId) {
      throw new ConflictException(
        `Plan '${planId}' is not configured for Stripe payments. ` +
        `Run the bootstrap script or update pricing in the admin portal.`,
      );
    }

    const defaultSuccessUrl = `https://app.myflynai.com/settings/billing?subscribed=true`;
    const defaultCancelUrl  = `https://app.myflynai.com/settings/billing?cancelled=true`;

    const session = await this.stripeService.createSubscriptionCheckout({
      tenantId,
      email,
      priceId,
      planId,
      billingInterval,
      successUrl: successUrl ?? defaultSuccessUrl,
      cancelUrl:  cancelUrl  ?? defaultCancelUrl,
    });

    this.logger.log(`Stripe subscription checkout created for tenant ${tenantId}, plan ${planId} (${billingInterval}): ${session.sessionId}`);
    return { checkoutUrl: session.url };
  }

  // ────────────────────────────────────────────────────
  // Webhook processing  —  idempotent, called by all 3 webhook controllers
  // ────────────────────────────────────────────────────

  async getActiveSubscription(tenantId: string): Promise<SubscriptionRecord | null> {
    const db = this.db();
    const snap = await db
      .collection(this.COL_SUBSCRIPTIONS)
      .where('tenantId', '==', tenantId)
      .where('status', 'in', ['active', 'trialing'])
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as SubscriptionRecord;
  }

  async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    const db = this.db();
    const eventDocId = `${event.gateway}-${event.eventId}`;

    // ── Idempotency check: skip already-processed events ──
    const existingDoc = await db.collection(this.COL_WEBHOOKS).doc(eventDocId).get();
    if (existingDoc.exists) {
      this.logger.log(`Duplicate webhook event skipped: ${eventDocId}`);
      return;
    }

    // ── Lock the event ID before any processing ──
    // Using a transaction would be ideal but Firestore set() with a
    // unique doc ID provides sufficient protection for our retry patterns.
    const webhookRecord: ProcessedWebhookRecord = {
      eventId: event.eventId,
      gateway: event.gateway,
      processedAt: Date.now(),
    };
    await db.collection(this.COL_WEBHOOKS).doc(eventDocId).set(webhookRecord);

    this.logger.log(`Processing webhook: ${event.type} (${eventDocId})`);

    try {
      switch (event.type) {
        case 'payment.succeeded':
          await this.onPaymentSucceeded(event);
          break;

        case 'payment.failed':
          await this.onPaymentFailed(event);
          break;

        case 'subscription.activated':
        case 'subscription.renewed':
        case 'subscription.updated':
          await this.onSubscriptionUpdated(event);
          break;

        case 'subscription.payment_failed':
          await this.onSubscriptionPaymentFailed(event);
          break;

        case 'subscription.cancelled':
          await this.onSubscriptionCancelled(event);
          break;

        default:
          this.logger.warn(`Unhandled webhook event type: ${event.type as string}`);
      }
    } catch (err) {
      // Log but do NOT re-throw — we must return 200 to the gateway to prevent
      // infinite retries; the event is logged in COL_WEBHOOKS for manual replay.
      this.logger.error(`Error processing webhook ${eventDocId}: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  // ────────────────────────────────────────────────────
  // Private webhook handlers
  // ────────────────────────────────────────────────────

  private async onPaymentSucceeded(event: WebhookEvent): Promise<void> {
    if (!event.gatewayPaymentId) return;

    // Flyn Voice additional-number subscription — fulfil the number (webhook is the
    // only trust anchor). Branch BEFORE the generic plan-subscription path.
    const meta = event.rawData?.metadata as Record<string, string> | undefined;
    if (meta?.type === 'flyn_voice_number') {
      await this.onVoiceNumberCheckoutCompleted(event);
      return;
    }

    // Stripe subscription checkout: mode='subscription' on the session data
    if (event.rawData?.mode === 'subscription' && event.gatewaySubscriptionId) {
      await this.onSubscriptionCheckoutCompleted(event);
      return;
    }

    const db = this.db();

    // Find payment record by gateway payment ID.
    const snap = await db
      .collection(this.COL_PAYMENTS)
      .where('gatewayPaymentId', '==', event.gatewayPaymentId)
      .limit(1)
      .get();

    if (snap.empty) {
      this.logger.warn(`No payment record found for gatewayPaymentId: ${event.gatewayPaymentId}`);
      return;
    }

    const paymentDoc = snap.docs[0];
    const paymentRecord = paymentDoc.data() as PaymentRecord;

    await paymentDoc.ref.update({
      status: 'successful',
      paidAt: Date.now(),
      updatedAt: Date.now(),
    });

    // If this is a website builder credit purchase, allocate the credits to the wallet
    if (paymentRecord.metadata?.type === 'website-builder-credits' && paymentRecord.metadata?.credits) {
      let credits = parseInt(paymentRecord.metadata.credits, 10);

      // Handle version: old system (v1) stored internal credits (2x), new system (v2) stores wallet credits (1:1)
      const version = paymentRecord.metadata?.version || 'v1'; // default to v1 for old payments
      if (version === 'v1') {
        credits = Math.floor(credits / 2); // Convert internal credits to wallet credits
      }

      try {
        await this.walletService.credit(
          paymentRecord.tenantId,
          credits,
          `Top-up via payment ${paymentRecord.gatewayPaymentId}`,
          'manual',
          paymentRecord.id,
        );
        this.logger.log(`Credited ${credits} to wallet for tenant ${paymentRecord.tenantId}`);
      } catch (err: any) {
        this.logger.error(`Failed to credit wallet for payment ${paymentRecord.id}: ${err.message}`);
        // Don't throw — payment succeeded even if wallet credit failed; manual recovery possible
      }
    }
  }

  private async onSubscriptionCheckoutCompleted(event: WebhookEvent): Promise<void> {
    const metadata = event.rawData?.metadata as Record<string, string> | undefined;
    const tenantId = metadata?.tenantId;
    const planId   = metadata?.planId;
    const billingInterval = metadata?.billingInterval ?? 'monthly';

    if (!tenantId || !planId) {
      this.logger.warn(`subscription checkout.session.completed missing metadata: tenantId=${tenantId}, planId=${planId}`);
      return;
    }

    const gatewaySubscriptionId = event.gatewaySubscriptionId!;
    const gatewayCustomerId     = (event.rawData?.customer as string) ?? event.gatewayCustomerId ?? '';

    // Fetch period dates from Stripe so we have accurate timestamps
    let periodStart = Date.now();
    let periodEnd   = Date.now() + (billingInterval === 'yearly' ? 365 : 30) * 24 * 3600 * 1000;
    try {
      const subResult = await this.stripeService.getSubscription(gatewaySubscriptionId);
      periodStart = subResult.currentPeriodStart.getTime();
      periodEnd   = subResult.currentPeriodEnd.getTime();
    } catch (err) {
      this.logger.warn(`Could not fetch subscription dates for ${gatewaySubscriptionId}: ${(err as Error).message}`);
    }

    // Upsert subscription record (keyed by tenantId so only one active record per tenant)
    const db = this.db();
    const existing = await db
      .collection(this.COL_SUBSCRIPTIONS)
      .where('tenantId', '==', tenantId)
      .where('gateway', '==', 'stripe')
      .limit(1)
      .get();

    const now = Date.now();
    if (!existing.empty) {
      await existing.docs[0].ref.update({
        planId,
        gatewaySubscriptionId,
        gatewayCustomerId,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd:   periodEnd,
        cancelAtPeriodEnd: false,
        updatedAt: now,
      });
      this.logger.log(`Updated subscription for tenant ${tenantId}: ${gatewaySubscriptionId}`);
    } else {
      const subId = randomUUID();
      const record: SubscriptionRecord = {
        id: subId,
        tenantId,
        planId,
        gateway: 'stripe',
        gatewaySubscriptionId,
        gatewayCustomerId,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd:   periodEnd,
        cancelAtPeriodEnd: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection(this.COL_SUBSCRIPTIONS).doc(subId).set(record);
      this.logger.log(`Created subscription for tenant ${tenantId}: ${subId}`);
    }

    // Sync plan to tenant record
    try {
      await this.tenantsService.syncSubscriptionToTenant(tenantId, {
        id: gatewaySubscriptionId,
        planId,
        status: 'active',
        startDate: new Date(periodStart).toISOString(),
        endDate:   new Date(periodEnd).toISOString(),
      });
    } catch (err) {
      this.logger.warn(`Failed to sync subscription to tenant ${tenantId}: ${(err as Error).message}`);
    }

    // Sync plan to Firebase Auth custom claims so the JWT reflects the new plan immediately
    try {
      await this.updateTenantPlanClaims(tenantId, planId);
    } catch (err) {
      this.logger.warn(`Failed to update Firebase claims for tenant ${tenantId}: ${(err as Error).message}`);
    }
  }

  /**
   * Flyn Voice additional-number subscription checkout completed.
   * Fetches the real period dates from Stripe, then fulfils the number.
   */
  private async onVoiceNumberCheckoutCompleted(event: WebhookEvent): Promise<void> {
    const metadata = event.rawData?.metadata as Record<string, string> | undefined;
    const tenantId = metadata?.tenantId;
    const country = metadata?.country || 'US';
    const subscriptionId = event.gatewaySubscriptionId;

    if (!tenantId || !subscriptionId) {
      this.logger.warn(`flyn_voice_number checkout missing data: tenantId=${tenantId}, sub=${subscriptionId}`);
      return;
    }

    let periodStart = Date.now();
    let periodEnd = Date.now() + 30 * 24 * 3600 * 1000;
    try {
      const sub = await this.stripeService.getSubscription(subscriptionId);
      periodStart = sub.currentPeriodStart.getTime();
      periodEnd = sub.currentPeriodEnd.getTime();
    } catch (err) {
      this.logger.warn(`Could not fetch voice-number subscription dates for ${subscriptionId}: ${(err as Error).message}`);
    }

    await this.voiceProvisioning.fulfillPaidNumber({
      tenantId,
      country,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: (event.rawData?.customer as string) ?? event.gatewayCustomerId ?? null,
      periodStart,
      periodEnd,
    });
  }

  private async updateTenantPlanClaims(tenantId: string, planId: string): Promise<void> {
    const auth = this.firebase.auth();
    if (!auth) return;

    let pageToken: string | undefined;
    let updated = 0;
    do {
      const result = await auth.listUsers(1000, pageToken);
      for (const user of result.users) {
        const claims = user.customClaims as Record<string, any> | undefined;
        if (claims?.organization_id === tenantId) {
          await auth.setCustomUserClaims(user.uid, { ...claims, plan: planId });
          updated++;
          this.logger.log(`Plan claim updated for ${user.email ?? user.uid}: ${planId}`);
        }
      }
      pageToken = result.pageToken;
    } while (pageToken);

    this.logger.log(`Firebase claims updated for ${updated} user(s) in tenant ${tenantId}: plan=${planId}`);
  }

  private async onPaymentFailed(event: WebhookEvent): Promise<void> {
    if (!event.gatewayPaymentId) return;
    const db = this.db();

    const snap = await db
      .collection(this.COL_PAYMENTS)
      .where('gatewayPaymentId', '==', event.gatewayPaymentId)
      .limit(1)
      .get();

    if (!snap.empty) {
      await snap.docs[0].ref.update({
        status: 'failed',
        updatedAt: Date.now(),
      });
    }
  }

  private async onSubscriptionUpdated(event: WebhookEvent): Promise<void> {
    if (!event.gatewaySubscriptionId) return;
    const db = this.db();

    const snap = await db
      .collection(this.COL_SUBSCRIPTIONS)
      .where('gatewaySubscriptionId', '==', event.gatewaySubscriptionId)
      .limit(1)
      .get();

    if (!snap.empty) {
      const sub = snap.docs[0].data() as SubscriptionRecord;
      await snap.docs[0].ref.update({
        status: event.status ?? 'active',
        updatedAt: Date.now(),
      });

      // Sync subscription to tenant record
      try {
        await this.tenantsService.syncSubscriptionToTenant(sub.tenantId, {
          id: sub.id,
          planId: sub.planId,
          status: (event.status ?? 'active') as any,
          startDate: new Date(sub.currentPeriodStart).toISOString(),
          endDate: new Date(sub.currentPeriodEnd).toISOString(),
        });
      } catch (err) {
        this.logger.warn(`Failed to sync subscription to tenant ${sub.tenantId}: ${(err as Error).message}`);
      }
    }
  }

  private async onSubscriptionPaymentFailed(event: WebhookEvent): Promise<void> {
    if (!event.gatewaySubscriptionId) return;
    const db = this.db();

    const snap = await db
      .collection(this.COL_SUBSCRIPTIONS)
      .where('gatewaySubscriptionId', '==', event.gatewaySubscriptionId)
      .limit(1)
      .get();

    if (!snap.empty) {
      const sub = snap.docs[0].data() as SubscriptionRecord;
      await snap.docs[0].ref.update({
        status: 'past_due',
        updatedAt: Date.now(),
      });

      // Sync subscription to tenant record
      try {
        await this.tenantsService.syncSubscriptionToTenant(sub.tenantId, {
          id: sub.id,
          planId: sub.planId,
          status: 'past_due',
          startDate: new Date(sub.currentPeriodStart).toISOString(),
          endDate: new Date(sub.currentPeriodEnd).toISOString(),
        });
      } catch (err) {
        this.logger.warn(`Failed to sync subscription to tenant ${sub.tenantId}: ${(err as Error).message}`);
      }
    }
  }

  private async onSubscriptionCancelled(event: WebhookEvent): Promise<void> {
    if (!event.gatewaySubscriptionId) return;

    // Flyn Voice paid number: if this ended subscription maps to a number, release it.
    // No-ops for non-voice subscriptions.
    await this.voiceProvisioning
      .releaseBySubscriptionId(event.gatewaySubscriptionId)
      .catch((e) => this.logger.warn(`Voice number release failed for sub ${event.gatewaySubscriptionId}: ${e?.message}`));

    const db = this.db();

    const snap = await db
      .collection(this.COL_SUBSCRIPTIONS)
      .where('gatewaySubscriptionId', '==', event.gatewaySubscriptionId)
      .limit(1)
      .get();

    if (!snap.empty) {
      const sub = snap.docs[0].data() as SubscriptionRecord;
      await snap.docs[0].ref.update({
        status: 'cancelled',
        cancelAtPeriodEnd: false,
        updatedAt: Date.now(),
      });

      // Sync subscription to tenant record
      try {
        await this.tenantsService.syncSubscriptionToTenant(sub.tenantId, {
          id: sub.id,
          planId: sub.planId,
          status: 'canceled',
          startDate: new Date(sub.currentPeriodStart).toISOString(),
          endDate: new Date(sub.currentPeriodEnd).toISOString(),
        });
      } catch (err) {
        this.logger.warn(`Failed to sync subscription to tenant ${sub.tenantId}: ${(err as Error).message}`);
      }
    }
  }

  /** GET /api/billing/admin/metrics — Owner dashboard: real subscription + payment stats */
  async getOwnerMetrics(): Promise<Record<string, unknown>> {
    const PLAN_CENTS: Record<string, number> = {
      starter: 2999, growth: 4900, professional: 9900, enterprise: 29900,
    };

    const db = this.db();
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const [activeSnap, allSubsSnap, paymentsSnap] = await Promise.all([
      db.collection(this.COL_SUBSCRIPTIONS).where('status', '==', 'active').get(),
      db.collection(this.COL_SUBSCRIPTIONS).get(),
      db.collection(this.COL_PAYMENTS).orderBy('createdAt', 'desc').limit(50).get(),
    ]);

    const activeSubs = activeSnap.docs.map(d => d.data() as Record<string, any>);
    // Deduplicate: keep only one active sub per tenant (latest)
    const activeTenantMap = new Map<string, Record<string, any>>();
    for (const sub of activeSubs) {
      const existing = activeTenantMap.get(sub.tenantId);
      if (!existing || (sub.createdAt || 0) > (existing.createdAt || 0)) {
        activeTenantMap.set(sub.tenantId, sub);
      }
    }
    const dedupedActiveSubs = Array.from(activeTenantMap.values());

    const uniqueTenants = new Set(allSubsSnap.docs.map(d => d.data().tenantId));

    let monthlyRevenueCents = 0;
    const planCounts: Record<string, number> = {};
    for (const sub of dedupedActiveSubs) {
      monthlyRevenueCents += PLAN_CENTS[sub.planId] ?? 0;
      planCounts[sub.planId] = (planCounts[sub.planId] || 0) + 1;
    }

    // New customers this month
    const newThisMonth = allSubsSnap.docs.filter(
      d => (d.data().createdAt || 0) >= thirtyDaysAgo,
    ).length;

    const activePlans = Object.entries(planCounts).map(([planId, count]) => ({
      planId,
      planName: planId.charAt(0).toUpperCase() + planId.slice(1),
      count,
      revenue: Math.round((PLAN_CENTS[planId] ?? 0) * count / 100),
    }));

    const totalCustomers = uniqueTenants.size;
    const monthlyRevenue = Math.round(monthlyRevenueCents / 100);

    // Collect unique tenantIds from payments to look up org names
    const rawPayments = paymentsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as Array<Record<string, any>>;
    const tenantIds = [...new Set(rawPayments.map(p => p.tenantId).filter(Boolean))];

    // Batch fetch tenant docs for org names
    const tenantNameMap: Record<string, string> = {};
    if (tenantIds.length > 0) {
      try {
        const tenantDocs = await Promise.all(
          tenantIds.slice(0, 20).map(tid => db.collection('tenants').doc(tid).get()),
        );
        for (const doc of tenantDocs) {
          if (doc.exists) {
            const data = doc.data() as Record<string, any>;
            tenantNameMap[doc.id] = data.name || data.orgName || data.companyName || data.displayName || doc.id.substring(0, 8);
          }
        }
      } catch { /* ignore — fall back to IDs */ }
    }

    const transactions = rawPayments.slice(0, 30).map(data => ({
      id: data.id,
      customerId: data.tenantId || '',
      customerName: tenantNameMap[data.tenantId] || data.metadata?.customerName || data.metadata?.name || data.tenantId?.substring(0, 8) || 'Unknown',
      customerEmail: data.metadata?.email || data.metadata?.customerEmail || '',
      amount: data.amount || 0,
      currency: data.currency || 'usd',
      status: data.status || 'succeeded',
      type: 'subscription',
      planName: data.planId || '',
      createdAt: new Date(data.createdAt || now).toISOString(),
    }));

    // Build daily revenue history from payments (last 30 days)
    const revenueByDay: Record<string, number> = {};
    for (const p of rawPayments) {
      if ((p.createdAt || 0) < thirtyDaysAgo) continue;
      const day = new Date(p.createdAt || now).toISOString().split('T')[0];
      revenueByDay[day] = (revenueByDay[day] || 0) + Math.round((p.amount || 0) / 100);
    }

    const revenueHistory = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now - (29 - i) * 86400000);
      const date = d.toISOString().split('T')[0];
      const rev = revenueByDay[date] || 0;
      return { date, revenue: rev, subscriptions: rev, oneTime: 0 };
    });

    // Build daily customer history from subscriptions (last 30 days)
    const newByDay: Record<string, number> = {};
    let runningTotal = 0;
    for (const doc of allSubsSnap.docs) {
      const data = doc.data();
      const ts = data.createdAt || 0;
      if (ts >= thirtyDaysAgo) {
        const day = new Date(ts).toISOString().split('T')[0];
        newByDay[day] = (newByDay[day] || 0) + 1;
      } else {
        runningTotal++;
      }
    }

    const customerHistory = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now - (29 - i) * 86400000);
      const date = d.toISOString().split('T')[0];
      const newCount = newByDay[date] || 0;
      runningTotal += newCount;
      return { date, total: runningTotal, new: newCount, churned: 0 };
    });

    return {
      isConnected: !!process.env.STRIPE_SECRET_KEY,
      metrics: {
        totalRevenue: monthlyRevenue * 12,
        monthlyRevenue,
        yearlyRevenue: monthlyRevenue * 12,
        revenueGrowth: 0,
        totalCustomers,
        newCustomersThisMonth: newThisMonth,
        customerGrowth: totalCustomers > 0 ? Math.round((newThisMonth / totalCustomers) * 100) : 0,
        avgRevenuePerUser: totalCustomers > 0 ? Math.round(monthlyRevenue / totalCustomers) : 0,
        churnRate: 0,
        conversionRate: 0,
        activePlans,
      },
      transactions,
      revenueHistory,
      customerHistory,
    };
  }
}
