import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CreatePlanCheckoutDto } from './dto/create-plan-checkout.dto';
import { FirebaseAuthGuard, AuthRequest } from './guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from './guards/api-or-firebase-auth.guard';
import { CheckoutResult, PaymentRecord, SubscriptionRecord } from './billing.types';

/**
 * BillingController
 *
 * All routes except webhook endpoints require a valid Firebase ID token.
 *
 * The `tenantId` is ALWAYS sourced from the verified Firebase token claims
 * (req.firebaseUser.organization_id), never from the request body.
 * This prevents tenants from initiating or reading each other's billing data.
 *
 * Webhook routes live in their respective gateway webhook controllers.
 */
@ApiTags('Billing')
@Controller('billing')
@UseGuards(ApiOrFirebaseAuthGuard)
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  /**
   * POST /api/billing/checkout
   * Creates a hosted checkout session for a one-time payment.
   * Returns a paymentUrl to redirect the user to.
   */
  @Post('checkout')
  @HttpCode(201)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  createCheckout(
    @Body() dto: CreatePaymentDto,
    @Req() req: AuthRequest,
  ): Promise<CheckoutResult> {
    // Extract tenantId from verified Firebase claims, not from body.
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.billingService.createCheckoutSession(dto, tenantId);
  }

  /**
   * POST /api/billing/checkout/credits
   * Creates a checkout session to top up the unified FLYN Wallet.
   * Body: { credits: number, countryCode: string, currency: string }
   * 1 credit = $1 (flat, no multipliers)
   * e.g. { credits: 10, countryCode: "US", currency: "USD" } = $10, adds 10 wallet credits
   */
  @Post('checkout/credits')
  @HttpCode(201)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  checkoutCredits(
    @Body() body: { credits: number; countryCode: string; currency: string },
    @Req() req: AuthRequest,
  ): Promise<CheckoutResult> {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const email = req.firebaseUser?.email;

    // Calculate amount: $1 per credit (simple 1:1 mapping)
    const amountUsd = body.credits * 1.0;
    const amount = Math.round(amountUsd * 100); // Convert to cents

    const dto: CreatePaymentDto = {
      tenantId,
      amount,
      currency: body.currency,
      countryCode: body.countryCode,
      description: `FLYN Wallet: ${body.credits} credits`,
      customerEmail: email,
      successUrl: `https://app.myflynai.com/ai-website-builder?credits_added=true`,
      cancelUrl: `https://app.myflynai.com/ai-website-builder?credits_cancelled=true`,
      metadata: {
        type: 'website-builder-credits',
        credits: String(body.credits),
        version: 'v2', // New unified wallet system (1 credit = $1, no multipliers)
      },
    };

    return this.billingService.createCheckoutSession(dto, tenantId);
  }

  /**
   * POST /api/billing/plan-checkout
   * Creates a Stripe Checkout Session (subscription mode) for a plan upgrade.
   * Returns { checkoutUrl } — the client should redirect the browser there.
   * Price IDs are read from Firestore plan_definitions; run stripe-bootstrap.mjs first.
   */
  @Post('plan-checkout')
  @HttpCode(201)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  createPlanCheckout(
    @Body() dto: CreatePlanCheckoutDto,
    @Req() req: AuthRequest,
  ): Promise<{ checkoutUrl: string }> {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const email    = req.firebaseUser?.email ?? '';
    return this.billingService.createPlanCheckout(
      dto.planId,
      dto.billingInterval,
      tenantId,
      email,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  /**
   * POST /api/billing/subscribe
   * Subscribes the tenant to a plan using the region-appropriate gateway.
   */
  @Post('subscribe')
  @HttpCode(201)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  subscribe(
    @Body() dto: CreateSubscriptionDto,
    @Req() req: AuthRequest,
  ): Promise<SubscriptionRecord> {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const email = req.firebaseUser?.email ?? dto.email;
    return this.billingService.createSubscription(dto, tenantId, email);
  }

  /**
   * GET /api/billing/subscription/:id
   * Fetches a subscription by its internal ID.
   * Only returns the subscription if it belongs to the requesting tenant.
   */
  @Get('subscription/:id')
  getSubscription(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ): Promise<SubscriptionRecord> {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.billingService.getSubscription(id, tenantId);
  }

  /**
   * DELETE /api/billing/subscription/:id
   * Cancels an active subscription. Ownership is verified inside the service.
   */
  @Delete('subscription/:id')
  cancelSubscription(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ): Promise<SubscriptionRecord> {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.billingService.cancelSubscription(id, tenantId);
  }

  /**
   * GET /api/billing/payments
   * Lists the last 50 payment records for the requesting tenant.
   */
  @Get('payments')
  listPayments(@Req() req: AuthRequest): Promise<PaymentRecord[]> {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.billingService.listPayments(tenantId);
  }

  /**
   * GET /api/billing/admin/metrics
   * Owner dashboard: real subscription counts, MRR, and recent transactions
   * aggregated from billing_subscriptions + billing_payments Firestore collections.
   */
  @Get('admin/metrics')
  getOwnerMetrics(): Promise<Record<string, unknown>> {
    return this.billingService.getOwnerMetrics();
  }
}
