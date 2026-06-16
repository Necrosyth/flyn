import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [TenantsModule, FirebaseModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
