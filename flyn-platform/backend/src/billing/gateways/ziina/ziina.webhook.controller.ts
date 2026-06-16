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
import { ZiinaService } from './ziina.service';
import { BillingService } from '../../billing.service';

/**
 * ZiinaWebhookController
 *
 * Handles incoming Ziina webhook events.
 *
 * Security:
 *  - NOT protected by FirebaseAuthGuard (Ziina calls it directly).
 *  - Authentication is via HMAC-SHA256 signature in the "x-ziina-signature" header,
 *    compared using timingSafeEqual (inside ZiinaService.handleWebhook).
 *  - Raw body is passed to handleWebhook before any JSON parsing.
 */
@Controller('billing/webhooks/ziina')
export class ZiinaWebhookController {
  private readonly logger = new Logger(ZiinaWebhookController.name);

  constructor(
    private readonly ziinaService: ZiinaService,
    private readonly billingService: BillingService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-ziina-signature') signature: string,
  ): Promise<{ status: string }> {
    if (!signature) {
      throw new UnauthorizedException('Missing x-ziina-signature header');
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Empty request body');
    }

    let webhookEvent;
    try {
      webhookEvent = await this.ziinaService.handleWebhook(rawBody, signature);
    } catch (err) {
      this.logger.warn(`Ziina webhook signature verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Webhook signature verification failed');
    }

    await this.billingService.handleWebhookEvent(webhookEvent);
    return { status: 'success' };
  }
}
