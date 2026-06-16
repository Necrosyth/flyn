import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { SystemSettingsModule } from '../../../system-settings/system-settings.module';

@Module({
  imports: [SystemSettingsModule],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
