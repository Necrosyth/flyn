import {
  BadRequestException,
  Body,
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
import { FlutterwaveService } from './flutterwave.service';
import { BillingService } from '../../billing.service';

/**
 * FlutterwaveWebhookController
 *
 * Handles incoming Flutterwave webhook events.
 *
 * Security:
 *  - NOT protected by FirebaseAuthGuard (Flutterwave calls it directly).
 *  - Authentication is via the "verif-hash" header compared against
 *    FLW_WEBHOOK_SECRET_HASH using timingSafeEqual (in FlutterwaveService).
 *  - Raw body is passed to handleWebhook before any JSON parsing.
 */
@Controller('billing/webhooks/flutterwave')
export class FlutterwaveWebhookController {
  private readonly logger = new Logger(FlutterwaveWebhookController.name);

  constructor(
    private readonly flutterwaveService: FlutterwaveService,
    private readonly billingService: BillingService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('verif-hash') verifHash: string,
    // `@Body()` not used here – we parse from rawBody after signature check.
    @Body() _body: unknown,
  ): Promise<{ status: string }> {
    if (!verifHash) {
      throw new UnauthorizedException('Missing verif-hash header');
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Empty request body');
    }

    let webhookEvent;
    try {
      webhookEvent = await this.flutterwaveService.handleWebhook(rawBody, verifHash);
    } catch (err) {
      this.logger.warn(`Flutterwave webhook verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Webhook signature verification failed');
    }

    await this.billingService.handleWebhookEvent(webhookEvent);
    return { status: 'success' };
  }
}
