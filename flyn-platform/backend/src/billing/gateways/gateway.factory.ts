import { Injectable } from '@nestjs/common';
import { Region } from '../region/region.types';
import { IPaymentGateway } from './gateway.interface';
import { StripeService } from './stripe/stripe.service';
import { FlutterwaveService } from './flutterwave/flutterwave.service';
import { ZiinaService } from './ziina/ziina.service';

/**
 * GatewayFactory
 *
 * The SINGLE place in the codebase that maps a billing Region to a payment
 * gateway implementation.  BillingService calls resolve() and receives an
 * IPaymentGateway — it never imports a concrete gateway directly.
 *
 * Mapping:
 *   africa       → Flutterwave
 *   middle_east  → Ziina
 *   global       → Stripe  (default / fallback)
 */
@Injectable()
export class GatewayFactory {
  constructor(
    private readonly stripe: StripeService,
    private readonly flutterwave: FlutterwaveService,
    private readonly ziina: ZiinaService,
  ) {}

  resolve(region: Region): IPaymentGateway {
    switch (region) {
      case 'africa':
        return this.flutterwave;
      case 'middle_east':
        return this.ziina;
      case 'global':
      default:
        return this.stripe;
    }
  }
}
