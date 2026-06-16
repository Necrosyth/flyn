import { Module } from '@nestjs/common';
import { TelephonyService } from './telephony.service';
import { TelephonyController } from './telephony.controller';
import { VoiceProvisioningService } from './voice-provisioning.service';
import { VoiceProvisioningController } from './voice-provisioning.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { StripeModule } from '../billing/gateways/stripe/stripe.module';

@Module({
  imports: [TenantsModule, FirebaseModule, StripeModule],
  controllers: [TelephonyController, VoiceProvisioningController],
  providers: [TelephonyService, VoiceProvisioningService],
  exports: [TelephonyService, VoiceProvisioningService],
})
export class TelephonyModule {}
