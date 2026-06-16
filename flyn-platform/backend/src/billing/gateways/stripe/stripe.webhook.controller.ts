import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { BillingService } from '../../billing.service';

/**
 * StripeWebhookController
 *
 * Handles incoming Stripe webhook events.
 *
 * Security:
 *  - The route is intentionally NOT protected by FirebaseAuthGuard because
 *    Stripe calls it directly — it has no Bearer token.
 *  - Instead, HMAC-SHA256 signature verification (via StripeService.handleWebhook)
 *    is the sole authentication mechanism.  No processing happens before that.
 *  - Raw body access is required for signature verification; NestJS's
 *    rawBody option is enabled in main.ts for this path.
 */
@Controller('billing/webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly billingService: BillingService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    if (!signature) {
      throw new UnauthorizedException('Missing stripe-signature header');
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Empty request body');
    }

    let webhookEvent;
    try {
      webhookEvent = await this.stripeService.handleWebhook(rawBody, signature);
    } catch (err) {
      // Stripe throws StripeSignatureVerificationError for bad signatures.
      this.logger.warn(`Stripe webhook signature verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Webhook signature verification failed');
    }

    // Idempotent processing — BillingService checks for duplicate event IDs.
    await this.billingService.handleWebhookEvent(webhookEvent);

    // Always return 200 once the event is queued, so Stripe stops retrying.
    return { received: true };
  }
}
