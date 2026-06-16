import { Module, forwardRef, Global } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantPlanDashboardService } from './tenant-plan-dashboard.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { MailModule } from '../mail/mail.module';
import { PlansAdminModule } from '../admin/plans/plans-admin.module';

@Global()
@Module({
  imports: [FirebaseModule, MailModule, PlansAdminModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantPlanDashboardService],
  exports: [TenantsService, TenantPlanDashboardService],
})
export class TenantsModule {}
