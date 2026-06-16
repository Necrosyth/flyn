/**
 * StripeService — Production Integration
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles full Stripe lifecycle:
 *  - Customer management (create / retrieve / update)
 *  - Subscription management (create / cancel / upgrade / prorate)
 *  - Payment Intent creation (one-time charges)
 *  - Payout listing & syncing
 *  - Webhook event verification + dispatch → Flyn Accounting reconciliation
 *  - Stripe Connect (platform → sub-account onboarding)
 *
 * All financial events are auto-reconciled into the AccountingService ledger.
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import Stripe from 'stripe';
import axios from 'axios';
import { AccountingService } from './accounting.service';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;

  constructor(
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
    private readonly tenantsService: TenantsService,
  ) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      this.logger.warn('Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing features.');
      this.stripe = undefined as unknown as Stripe;
      return;
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-02-25.clover',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CUSTOMERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create or retrieve a Stripe Customer by email.
   * If a customer already exists with that email, returns the existing one.
   */
  async ensureCustomer(params: {
    email: string;
    name?: string;
    phone?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    // Search for existing customer by email
    const existing = await this.stripe.customers.list({ email: params.email, limit: 1 });
    if (existing.data.length > 0) {
      return existing.data[0];
    }

    // Create new customer
    const customer = await this.stripe.customers.create({
      email: params.email,
      name: params.name,
      phone: params.phone,
      metadata: params.metadata ?? {},
    });

    this.logger.log(`Stripe customer created: ${customer.id} for ${params.email}`);
    return customer;
  }

  /** Retrieve a Stripe customer by their Stripe ID */
  async getCustomer(stripeCustomerId: string): Promise<Stripe.Customer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(stripeCustomerId);
      if (customer.deleted) return null;
      return customer as Stripe.Customer;
    } catch {
      return null;
    }
  }

  /** List all Stripe customers (paginated) */
  async listCustomers(limit = 100): Promise<Stripe.Customer[]> {
    const result = await this.stripe.customers.list({ limit });
    return result.data;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PAYMENT INTENTS (ONE-TIME CHARGES)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Create a Payment Intent for a one-time charge */
  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    customerId?: string;
    description?: string;
    metadata?: Record<string, string>;
    invoiceId?: string;
  }): Promise<Stripe.PaymentIntent> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency.toLowerCase(),
      customer: params.customerId,
      description: params.description,
      metadata: {
        flynInvoiceId: params.invoiceId ?? '',
        ...params.metadata,
      },
      automatic_payment_methods: { enabled: true },
    });

    this.logger.log(`PaymentIntent created: ${intent.id} for ${params.amountCents} ${params.currency}`);
    return intent;
  }

  /** Retrieve a Payment Intent */
  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  /** List recent Payment Intents */
  async listPaymentIntents(limit = 100): Promise<Stripe.PaymentIntent[]> {
    const result = await this.stripe.paymentIntents.list({ limit });
    return result.data;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /** Create a subscription for a customer */
  async createSubscription(params: {
    customerId: string;
    priceId: string;
    trialDays?: number;
    coupon?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    const subscription = await this.stripe.subscriptions.create({
      customer: params.customerId,
      items: [{ price: params.priceId }],
      trial_period_days: params.trialDays,
      discounts: params.coupon ? [{ coupon: params.coupon }] : undefined,
      metadata: params.metadata ?? {},
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    this.logger.log(`Subscription created: ${subscription.id} for customer ${params.customerId}`);
    return subscription;
  }

  /** Cancel a subscription immediately or at period end */
  async cancelSubscription(subscriptionId: string, atPeriodEnd = true): Promise<Stripe.Subscription> {
    const updated = await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: atPeriodEnd,
    });
    this.logger.log(`Subscription ${subscriptionId} set to cancel (at_period_end=${atPeriodEnd})`);
    return updated;
  }

  /** Upgrade or downgrade a subscription */
  async updateSubscription(subscriptionId: string, newPriceId: string): Promise<Stripe.Subscription> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const itemId = sub.items.data[0].id;
    return this.stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'create_prorations',
    });
  }

  /** List all subscriptions */
  async listSubscriptions(status?: Stripe.Subscription.Status, limit = 100): Promise<Stripe.Subscription[]> {
    const result = await this.stripe.subscriptions.list({
      status,
      limit,
      expand: ['data.customer'],
    });
    return result.data;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INVOICES
  // ─────────────────────────────────────────────────────────────────────────────

  /** List Stripe invoices (synced from Stripe, not Flyn invoices) */
  async listStripeInvoices(customerId?: string, limit = 100): Promise<Stripe.Invoice[]> {
    const result = await this.stripe.invoices.list({
      customer: customerId,
      limit,
    });
    return result.data;
  }

  /** Retrieve a single Stripe invoice */
  async getStripeInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    return this.stripe.invoices.retrieve(invoiceId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PAYOUTS
  // ─────────────────────────────────────────────────────────────────────────────

  /** List all payouts from Stripe to your bank account */
  async listPayouts(limit = 100): Promise<Stripe.Payout[]> {
    const result = await this.stripe.payouts.list({ limit });
    return result.data;
  }

  /** Retrieve a single payout */
  async getPayout(payoutId: string): Promise<Stripe.Payout> {
    return this.stripe.payouts.retrieve(payoutId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRODUCTS & PRICES
  // ─────────────────────────────────────────────────────────────────────────────

  /** Create a product in Stripe (e.g. a Flyn subscription plan) */
  async createProduct(name: string, description?: string): Promise<Stripe.Product> {
    return this.stripe.products.create({ name, description });
  }

  /** Create a price for a product */
  async createPrice(params: {
    productId: string;
    unitAmountCents: number;
    currency: string;
    interval?: 'day' | 'week' | 'month' | 'year';
  }): Promise<Stripe.Price> {
    return this.stripe.prices.create({
      product: params.productId,
      unit_amount: params.unitAmountCents,
      currency: params.currency.toLowerCase(),
      recurring: params.interval ? { interval: params.interval } : undefined,
    });
  }

  /** List all products */
  async listProducts(limit = 100): Promise<Stripe.Product[]> {
    const result = await this.stripe.products.list({ limit, active: true });
    return result.data;
  }

  /** List all prices */
  async listPrices(productId?: string, limit = 100): Promise<Stripe.Price[]> {
    const result = await this.stripe.prices.list({ product: productId, limit, active: true });
    return result.data;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRIPE CONNECT (PLATFORM / MULTI-TENANT)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Create a connected account + Account Link for tenant onboarding. Reuses existing account if already created.
   *  `country` (ISO-2, e.g. 'GB', 'AE', 'IN') sets the connected account's country at creation, which
   *  drives the Home-address country and phone prefix in Stripe's hosted onboarding. Defaults to the
   *  platform country (US) when omitted. Note: a connected account's country cannot be changed once set —
   *  to switch, the tenant must disconnect and reconnect, which creates a fresh account. */
  async getConnectOnboardingUrl(tenantId: string, redirectUri: string, country?: string): Promise<string> {
    const tenant = await this.tenantsService.getTenant(tenantId).catch(() => null);
    const integObj = (tenant?.integrations && !Array.isArray(tenant.integrations)) ? tenant.integrations : {} as any;
    const existingAccountId = integObj?.accounting?.stripe?.stripeUserId;

    const wantCountry = country ? country.toUpperCase() : undefined;
    let accountId: string = '';
    let oldAccountToReplace = ''; // delete only AFTER a new account is successfully created
    if (existingAccountId) {
      // Verify the existing account is still usable before reusing it
      try {
        const existing = await this.stripe.accounts.retrieve(existingAccountId);
        // If the account is fully onboarded already, just return the dashboard link
        if (existing.details_submitted && existing.charges_enabled) {
          const loginLink = await this.stripe.accounts.createLoginLink(existingAccountId);
          return loginLink.url;
        }
        // A connected account's country CANNOT be changed. If the user asked for a different
        // country than the existing (still-incomplete) account, we must create a fresh one.
        // Mark the old one for deletion but DON'T delete it yet — if the new create fails
        // (e.g. Stripe cross-border restriction), we keep the old account intact.
        if (wantCountry && existing.country && existing.country.toUpperCase() !== wantCountry) {
          oldAccountToReplace = existingAccountId;
          accountId = '';
        } else {
          accountId = existingAccountId;
        }
      } catch {
        // Account unreachable — create a fresh one below
        accountId = '';
      }
    }

    if (!accountId) {
      // Express accounts: don't conflict with existing personal Stripe accounts and complete
      // onboarding faster than Standard. Country drives the onboarding form's address/phone.
      let account: Stripe.Account;
      try {
        account = await this.stripe.accounts.create({
          type: 'express',
          ...(wantCountry ? { country: wantCountry } : {}),
        });
      } catch (err: any) {
        // Creation failed (commonly Stripe's cross-border rule, e.g. a US platform can't create
        // IN accounts). Leave the existing account untouched and surface Stripe's real message.
        const msg = err?.raw?.message || err?.message || 'Stripe could not create the connected account.';
        this.logger.warn(`[stripe] create failed for tenant ${tenantId} country=${wantCountry}: ${msg}`);
        throw new Error(msg);
      }
      accountId = account.id;

      // New account created successfully → now it's safe to delete the old incomplete one.
      if (oldAccountToReplace) {
        this.logger.log(`[stripe] tenant ${tenantId}: replaced incomplete account ${oldAccountToReplace} → ${accountId} (${wantCountry})`);
        try { await this.stripe.accounts.del(oldAccountToReplace); } catch (e: any) { this.logger.warn(`[stripe] could not delete old account ${oldAccountToReplace}: ${e?.message}`); }
      }

      // Always persist — use updateTenant which does an upsert (merge: true), so it works
      // even if getTenant returned null due to a Firestore timeout above.
      const integrations = (tenant?.integrations && !Array.isArray(tenant.integrations))
        ? { ...tenant.integrations }
        : {} as Record<string, any>;
      integrations.accounting = {
        ...(integrations.accounting ?? {}),
        stripe: { stripeUserId: accountId, accessToken: '', connectedAt: Date.now() },
      };
      await this.tenantsService.updateTenant(tenantId, { integrations });
    }

    // refresh_url must re-trigger onboarding (not just land on the dashboard)
    const baseUrl = redirectUri.split('?')[0];
    const refreshUrl = `${baseUrl}?stripe=refresh`;

    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: redirectUri,
      type: 'account_onboarding',
    });
    return link.url;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRIPE CONNECT — OAuth (connect an EXISTING, merchant-owned Standard account)
  // ─────────────────────────────────────────────────────────────────────────────
  //
  // Why OAuth (vs the Express flow above): Express calls accounts.create(), so the
  // PLATFORM creates the account — and a US-based platform can only create accounts in
  // US/UK/EEA/CA/CH (Stripe cross-border rule). OAuth instead links an account the
  // merchant ALREADY owns in their own country, so it works in any Stripe country
  // (UAE, Australia, Singapore, Japan, India, …). Charges run on the connected account
  // via the platform key + Stripe-Account header (exactly like createCheckoutSession),
  // so nothing downstream changes. Ref: https://docs.stripe.com/connect/oauth-reference

  /** Build the Stripe OAuth authorize URL to connect an existing Standard account. */
  getOAuthAuthorizeUrl(
    tenantId: string,
    redirectUri: string,
    prefill?: { email?: string; country?: string },
  ): string {
    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    if (!clientId) {
      throw new Error('Stripe Connect is not configured (STRIPE_CONNECT_CLIENT_ID missing).');
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'read_write',
      redirect_uri: redirectUri,
      state: tenantId || 'default',
    });
    // Optional prefills just pre-populate Stripe's hosted form — they don't restrict it.
    if (prefill?.email) params.set('stripe_user[email]', prefill.email);
    if (prefill?.country) params.set('stripe_user[country]', prefill.country.toUpperCase());
    return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange the OAuth authorization code for the connected account id and persist it.
   * The platform secret key authenticates the token call (HTTP Basic). We store only
   * stripe_user_id — Stripe deprecated the per-account access_token for Standard accounts;
   * API calls use the platform key + Stripe-Account header instead.
   */
  async handleOAuthCallback(tenantId: string, code: string): Promise<{ stripeUserId: string; livemode: boolean }> {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing).');
    if (!tenantId || tenantId === 'default') throw new Error('Missing tenant for Stripe OAuth callback.');

    let resp;
    try {
      resp = await axios.post(
        'https://connect.stripe.com/oauth/token',
        new URLSearchParams({ grant_type: 'authorization_code', code }).toString(),
        {
          auth: { username: secretKey, password: '' },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );
    } catch (err: any) {
      const detail = err?.response?.data?.error_description || err?.response?.data?.error || err?.message;
      this.logger.error(`[stripe] OAuth token exchange failed for tenant ${tenantId}: ${detail}`);
      throw new Error(detail || 'Stripe OAuth token exchange failed');
    }

    const stripeUserId: string | undefined = resp.data?.stripe_user_id;
    const livemode = !!resp.data?.livemode;
    if (!stripeUserId) throw new Error('Stripe did not return a connected account id');

    // Persist in the SAME shape the Express flow uses, so findTenantStripeAccountId (and
    // therefore checkout) works identically. method:'oauth' lets disconnect deauthorize.
    const tenant = await this.tenantsService.getTenant(tenantId).catch(() => null);
    const integrations = (tenant?.integrations && !Array.isArray(tenant.integrations))
      ? { ...tenant.integrations }
      : {} as Record<string, any>;
    integrations.accounting = {
      ...(integrations.accounting ?? {}),
      stripe: { stripeUserId, accessToken: '', method: 'oauth', connectedAt: Date.now() },
    };
    await this.tenantsService.updateTenant(tenantId, { integrations });

    this.logger.log(`[stripe] tenant ${tenantId} linked existing account ${stripeUserId} via OAuth (livemode=${livemode})`);
    return { stripeUserId, livemode };
  }

  /** Retrieve the connected account ID after onboarding completes */
  async connectAccount(accountId: string): Promise<{ stripeUserId: string }> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return { stripeUserId: account.id };
  }

  /** Check if Stripe is connected. Makes a live API call to verify charges_enabled + details_submitted. */
  async getConnectionStatus(tenantId: string): Promise<{
    connected: boolean;
    stripeUserId?: string;
    connectedAt?: number;
    chargesEnabled?: boolean;
    detailsSubmitted?: boolean;
    pendingVerification?: boolean;
  }> {
    const tenant = await this.tenantsService.getTenant(tenantId).catch(() => null);
    const integObj = (tenant?.integrations && !Array.isArray(tenant.integrations)) ? tenant.integrations : {} as any;
    const stripeData = integObj?.accounting?.stripe;
    if (!stripeData?.stripeUserId) return { connected: false };

    try {
      const account = await this.stripe.accounts.retrieve(stripeData.stripeUserId);
      const chargesEnabled = account.charges_enabled ?? false;
      const detailsSubmitted = account.details_submitted ?? false;
      return {
        connected: chargesEnabled && detailsSubmitted,
        stripeUserId: stripeData.stripeUserId,
        connectedAt: stripeData.connectedAt,
        chargesEnabled,
        detailsSubmitted,
        pendingVerification: detailsSubmitted && !chargesEnabled,
      };
    } catch (err: any) {
      this.logger.warn(`Stripe live verification failed for tenant ${tenantId}: ${err.message}`);
      // Account ID in DB but unreachable — treat as not connected
      return { connected: false, stripeUserId: stripeData.stripeUserId, connectedAt: stripeData.connectedAt };
    }
  }

  async disconnectAccount(tenantId: string): Promise<{ success: boolean }> {
    try {
      const tenant = await this.tenantsService.getTenant(tenantId);
      const integrations = (tenant?.integrations && !Array.isArray(tenant.integrations))
        ? { ...tenant.integrations }
        : {} as Record<string, any>;
      const stripeData = integrations.accounting?.stripe;

      // For OAuth (Standard) accounts, also revoke the link on Stripe's side. Best-effort:
      // deauthorize only applies to Standard accounts, so we gate on method:'oauth' and
      // never let a failure block removing our local record.
      if (stripeData?.method === 'oauth' && stripeData?.stripeUserId) {
        try {
          await axios.post(
            'https://connect.stripe.com/oauth/deauthorize',
            new URLSearchParams({
              client_id: process.env.STRIPE_CONNECT_CLIENT_ID ?? '',
              stripe_user_id: stripeData.stripeUserId,
            }).toString(),
            {
              auth: { username: process.env.STRIPE_SECRET_KEY ?? '', password: '' },
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            },
          );
        } catch (e: any) {
          this.logger.warn(`[stripe] deauthorize failed for tenant ${tenantId}: ${e?.response?.data?.error_description || e?.message}`);
        }
      }

      if (integrations.accounting?.stripe) {
        integrations.accounting = { ...integrations.accounting };
        delete integrations.accounting.stripe;
        await this.tenantsService.updateTenant(tenantId, { integrations });
      }
      this.logger.log(`Stripe disconnected for tenant: ${tenantId}`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Stripe disconnect failed for tenant ${tenantId}: ${err?.message}`);
      return { success: false };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BALANCE
  // ─────────────────────────────────────────────────────────────────────────────

  /** Retrieve the current Stripe balance */
  async getBalance(): Promise<Stripe.Balance> {
    return this.stripe.balance.retrieve();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WEBHOOK HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Verify and parse a raw Stripe webhook payload.
   * Call this from the AccountingController webhook endpoint.
   * Returns null if signature verification fails.
   */
  constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event | null {
    // The same endpoint URL can be registered as MULTIPLE Stripe destinations (e.g. one for
    // "Your account" events and one for "Connected accounts" events) — each has its OWN signing
    // secret. Support a comma/whitespace-separated STRIPE_WEBHOOK_SECRET and try each, so events
    // from any destination verify instead of being silently dropped.
    const secrets = (process.env.STRIPE_WEBHOOK_SECRET ?? '')
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (secrets.length === 0) {
      this.logger.error('Stripe webhook: STRIPE_WEBHOOK_SECRET is not set');
      return null;
    }
    let lastErr = '';
    for (const secret of secrets) {
      try {
        return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
      } catch (err: any) {
        lastErr = err?.message ?? 'verification failed';
      }
    }
    this.logger.error(`Stripe webhook signature verification failed against ${secrets.length} secret(s): ${lastErr}`);
    return null;
  }

  /**
   * Process a verified Stripe webhook event.
   * Auto-reconciles payments into the Flyn accounting ledger.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<{ processed: boolean; type: string }> {
    const stripeAccountId = event.account;
    let tenantId: string | undefined;

    if (stripeAccountId) {
      const tenant = await this.accountingService.findTenantByStripeAccountId(stripeAccountId);
      if (tenant) {
        tenantId = tenant.id;
        this.logger.log(`Processing Stripe webhook for tenant ${tenantId} (${tenant.name}): ${event.type}`);
      } else {
        this.logger.warn(`Stripe webhook received for unknown Stripe Account ID: ${stripeAccountId}`);
      }
    } else {
      this.logger.log(`Processing platform Stripe webhook: ${event.type}`);
    }

    switch (event.type) {
      // ── Successful payment (one-time) ─────────────────────────────────────
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await this.reconcilePaymentIntent(intent, tenantId);
        break;
      }

      // ── Invoice paid (subscription renewal / one-off invoice) ─────────────
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await this.reconcileStripeInvoice(invoice, tenantId);
        break;
      }

      // ── Invoice payment failed ─────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        this.logger.warn(`Invoice payment failed: ${invoice.id} — customer: ${invoice.customer}`);
        // Could trigger dunning or alert here
        break;
      }

      // ── Subscription created ───────────────────────────────────────────────
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        this.logger.log(`New subscription: ${sub.id} — status: ${sub.status}`);
        break;
      }

      // ── Subscription cancelled ─────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        this.logger.log(`Subscription cancelled: ${sub.id}`);
        break;
      }

      // ── Subscription updated ───────────────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        this.logger.log(`Subscription updated: ${sub.id} — status: ${sub.status}`);
        break;
      }

      // ── Payout created (Stripe → your bank) ────────────────────────────────
      case 'payout.paid': {
        const payout = event.data.object as Stripe.Payout;
        this.logger.log(`Payout completed: ${payout.id} — ${payout.amount / 100} ${payout.currency.toUpperCase()}`);
        await this.reconcilePayout(payout, tenantId);
        break;
      }

      // ── Charge disputed (chargeback) ─────────────────────────────────────
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        this.logger.warn(`Chargeback dispute opened: ${dispute.id} — ${dispute.amount / 100} ${dispute.currency.toUpperCase()}`);
        break;
      }

      // ── Refund issued ────────────────────────────────────────────────────
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        this.logger.log(`Charge refunded: ${charge.id} — ${(charge.amount_refunded ?? 0) / 100} ${charge.currency.toUpperCase()}`);
        break;
      }

      // ── Merchant revoked our access from THEIR Stripe dashboard ───────────
      // (Standard/OAuth accounts.) Drop the stored link so we stop treating a
      // disconnected account as connected and don't try to charge on it.
      case 'account.application.deauthorized': {
        if (stripeAccountId && tenantId) {
          await this.disconnectAccount(tenantId).catch(e =>
            this.logger.warn(`[stripe] cleanup after deauthorize failed for tenant ${tenantId}: ${e?.message}`),
          );
          this.logger.log(`[stripe] account ${stripeAccountId} deauthorized by merchant — cleared link for tenant ${tenantId}`);
        }
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    return { processed: true, type: event.type };
  }

  // ── PRIVATE — Reconciliation Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private async reconcilePaymentIntent(intent: Stripe.PaymentIntent, tenantId?: string): Promise<void> {
    const amount = (intent.amount / 100).toFixed(2);
    const currency = intent.currency.toUpperCase();
    const invoiceId = intent.metadata?.flynInvoiceId;

    try {
      await this.accountingService.reconcilePayment({
        amount,
        date: new Date(intent.created * 1000).toISOString().slice(0, 10),
        reference: intent.id,
        method: 'stripe',
      }, tenantId);

      // If linked to a Flyn invoice, mark it as paid
      if (invoiceId) {
        await this.accountingService.addPartialPayment(invoiceId, {
          date: new Date(intent.created * 1000).toISOString().slice(0, 10),
          amount,
          method: 'Stripe',
          reference: intent.id,
          notes: `Auto-reconciled from Stripe PaymentIntent ${intent.id}`,
        } as any, tenantId);
      }

      this.logger.log(`Reconciled Stripe PaymentIntent ${intent.id}: ${amount} ${currency}`);
    } catch (err: any) {
      this.logger.error(`Failed to reconcile PaymentIntent ${intent.id}: ${err.message}`);
    }
  }

  private async reconcileStripeInvoice(invoice: Stripe.Invoice, tenantId?: string): Promise<void> {
    if (!invoice.amount_paid || invoice.amount_paid === 0) return;

    const amount = (invoice.amount_paid / 100).toFixed(2);
    const currency = (invoice.currency ?? 'usd').toUpperCase();

    try {
      await this.accountingService.reconcilePayment({
        amount,
        date: new Date((invoice.status_transitions?.paid_at ?? invoice.created) * 1000).toISOString().slice(0, 10),
        reference: invoice.id,
        method: 'stripe',
      }, tenantId);

      this.logger.log(`Reconciled Stripe Invoice ${invoice.id}: ${amount} ${currency}`);
    } catch (err: any) {
      this.logger.error(`Failed to reconcile Stripe Invoice ${invoice.id}: ${err.message}`);
    }
  }

  private async reconcilePayout(payout: Stripe.Payout, tenantId?: string): Promise<void> {
    const amount = (payout.amount / 100).toFixed(2);
    const currency = payout.currency.toUpperCase();

    try {
      await this.accountingService.addBankTransaction({
        date: new Date(payout.created * 1000).toISOString().slice(0, 10),
        description: `Stripe Payout — ${payout.description ?? payout.id}`,
        amount,
        type: 'credit',
        category: 'Stripe Payout',
        reference: payout.id,
        reconciled: true,
      }, tenantId);

      this.logger.log(`Recorded payout ${payout.id}: ${amount} ${currency}`);
    } catch (err: any) {
      this.logger.error(`Failed to record payout ${payout.id}: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SYNC HELPERS (pull historical data)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Pull all historical Stripe charges and reconcile them into Flyn.
   * Call this once on initial setup to backfill data.
   */
  async syncHistoricalCharges(limit = 100): Promise<{ synced: number; failed: number }> {
    const charges = await this.stripe.charges.list({ limit });
    let synced = 0;
    let failed = 0;

    for (const charge of charges.data) {
      if (charge.status !== 'succeeded') continue;
      try {
        await this.accountingService.reconcilePayment({
          amount: (charge.amount / 100).toFixed(2),
          date: new Date(charge.created * 1000).toISOString().slice(0, 10),
          reference: charge.id,
          method: 'stripe',
        });
        synced++;
      } catch {
        failed++;
      }
    }

    this.logger.log(`Historical sync complete: ${synced} synced, ${failed} failed`);
    return { synced, failed };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHECKOUT SESSIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a Stripe Checkout Session for an invoice.
   */
  async createCheckoutSession(params: {
    amountCents: number;
    currency: string;
    invoiceId: string;           // Flyn DB id — used for reconciliation (must match addPartialPayment lookup)
    invoiceNumber?: string;      // human number (INV-…) — display only
    customerEmail?: string;
    successUrl: string;
    cancelUrl: string;
  }, tenantId?: string): Promise<Stripe.Checkout.Session> {
    const stripeAccount = tenantId ? (await this.accountingService.findTenantStripeAccountId(tenantId)) : undefined;

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: params.currency.toLowerCase(),
          product_data: {
            name: `Invoice ${params.invoiceNumber ?? params.invoiceId}`,
          },
          unit_amount: params.amountCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      metadata: {
        flynInvoiceId: params.invoiceId,
        flynInvoiceNumber: params.invoiceNumber ?? '',
        tenantId: tenantId ?? '',
      },
      // Session metadata does NOT propagate to the PaymentIntent. The payment_intent.succeeded
      // webhook reconciles by intent.metadata.flynInvoiceId, so copy it onto the PI explicitly —
      // otherwise paid invoices never get auto-marked paid.
      payment_intent_data: {
        metadata: {
          flynInvoiceId: params.invoiceId,
          tenantId: tenantId ?? '',
        },
      },
    }, stripeAccount ? { stripeAccount } : undefined);

    this.logger.log(`Checkout session created: ${session.id} for invoice ${params.invoiceId}`);
    return session;
  }

  /**
   * Create a Stripe Checkout Session in subscription mode for recurring giving.
   * frequency: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'annually'
   */
  async createSubscriptionCheckout(params: {
    amountCents: number;
    currency: string;
    frequency: string;
    fund: string;
    donorEmail?: string;
    donorName?: string;
    cancelAt?: number; // Unix timestamp — Stripe cancels subscription automatically at this date
    successUrl: string;
    cancelUrl: string;
  }, tenantId?: string): Promise<Stripe.Checkout.Session> {
    const stripeAccount = tenantId ? (await this.accountingService.findTenantStripeAccountId(tenantId)) : undefined;

    const intervalMap: Record<string, { interval: Stripe.Price.Recurring.Interval; interval_count: number }> = {
      'weekly':    { interval: 'week',  interval_count: 1 },
      'bi-weekly': { interval: 'week',  interval_count: 2 },
      'monthly':   { interval: 'month', interval_count: 1 },
      'quarterly': { interval: 'month', interval_count: 3 },
      'annually':  { interval: 'year',  interval_count: 1 },
    };
    const rec = intervalMap[params.frequency] ?? intervalMap['monthly'];

    // Metadata on subscription_data so it appears on every invoice.paid webhook
    const subscriptionMetadata = {
      type: 'church_recurring_donation',
      fund: params.fund,
      frequency: params.frequency,
      tenantId: tenantId ?? '',
      donorName: params.donorName ?? '',
    };

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: params.currency.toLowerCase(),
          product_data: { name: `Recurring Gift — ${params.fund}` },
          unit_amount: params.amountCents,
          recurring: { interval: rec.interval, interval_count: rec.interval_count },
        },
        quantity: 1,
      }],
      subscription_data: {
        metadata: subscriptionMetadata,
        ...(params.cancelAt ? { cancel_at: params.cancelAt } : {}),
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.donorEmail,
      metadata: subscriptionMetadata, // Also on session for checkout.session.completed
    }, stripeAccount ? { stripeAccount } : undefined);

    this.logger.log(`Subscription checkout created: ${session.id} for ${params.frequency} giving to ${params.fund}${params.cancelAt ? ` until ${new Date(params.cancelAt * 1000).toISOString().slice(0, 10)}` : ' (no end date)'}`);
    return session;
  }
}
