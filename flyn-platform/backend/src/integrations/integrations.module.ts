import { Module, forwardRef } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { TenantsModule } from '../tenants/tenants.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [forwardRef(() => TenantsModule), CalendarModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
