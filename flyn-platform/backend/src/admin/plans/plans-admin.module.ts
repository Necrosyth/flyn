import { Module } from '@nestjs/common';
import { PlansAdminService } from './plans-admin.service';
import { PlansAdminController } from './plans-admin.controller';
import { PlansPublicController } from './plans-public.controller';
import { FirebaseModule } from '../../firebase/firebase.module';
import { SystemSettingsModule } from '../../system-settings/system-settings.module';

@Module({
  imports: [FirebaseModule, SystemSettingsModule],
  providers: [PlansAdminService],
  controllers: [PlansAdminController, PlansPublicController],
  exports: [PlansAdminService],
})
export class PlansAdminModule {}
