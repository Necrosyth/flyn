import { Global, Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { GatewayFactory } from './gateways/gateway.factory';
import { StripeModule } from './gateways/stripe/stripe.module';
import { StripeWebhookController } from './gateways/stripe/stripe.webhook.controller';
import { FlutterwaveModule } from './gateways/flutterwave/flutterwave.module';
import { FlutterwaveWebhookController } from './gateways/flutterwave/flutterwave.webhook.controller';
import { ZiinaModule } from './gateways/ziina/ziina.module';
import { ZiinaWebhookController } from './gateways/ziina/ziina.webhook.controller';
import { RegionDetectorService } from './region/region-detector.service';
import { PlansService } from './plans/plans.service';
import { PlansController } from './plans/plans.controller';
import { KeyValidationService } from './keys/key-validation.service';
import { KeyValidationController } from './keys/key-validation.controller';
import { ApiKeysService } from './keys/api-keys.service';
import { ApiKeysController } from './keys/api-keys.controller';
import { ApiKeyAuthGuard } from './keys/api-key-auth.guard';
import { ApiOrFirebaseAuthGuard } from './guards/api-or-firebase-auth.guard';
import { EntitlementService } from './entitlements/entitlement.service';
import { EntitlementController } from './entitlements/entitlement.controller';
import { RequiresPlanGuard } from './guards/requires-plan.guard';
import { FirebaseModule } from '../firebase/firebase.module';
import { UsageModule } from '../usage/usage.module';
import { WebsiteBuilderModule } from '../website-builder/website-builder.module';
import { WalletModule } from '../wallet/wallet.module';
import { TenantsModule } from '../tenants/tenants.module';
import { TelephonyModule } from '../telephony/telephony.module';

@Global()
@Module({
  imports: [
    FirebaseModule,
    UsageModule,
    StripeModule,
    FlutterwaveModule,
    ZiinaModule,
    WebsiteBuilderModule,
    WalletModule,
    TenantsModule,
    TelephonyModule,
  ],
  controllers: [
    BillingController,
    PlansController,
    ApiKeysController,
    KeyValidationController,
    StripeWebhookController,
    FlutterwaveWebhookController,
    ZiinaWebhookController,
    EntitlementController,
  ],
  providers: [
    BillingService,
    GatewayFactory,
    RegionDetectorService,
    PlansService,
    ApiKeysService,
    ApiKeyAuthGuard,
    ApiOrFirebaseAuthGuard,
    KeyValidationService,
    EntitlementService,
    RequiresPlanGuard,
    ApiOrFirebaseAuthGuard,
  ],
  exports: [BillingService, ApiKeysService, ApiKeyAuthGuard, EntitlementService, RequiresPlanGuard, ApiOrFirebaseAuthGuard],
})
export class BillingModule {}
