import { Module } from '@nestjs/common';
import { UsageService } from './usage.service';
import { UsageMeterService } from './usage-meter.service';
import { UsageController } from './usage.controller';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [UsageController],
  providers: [UsageService, UsageMeterService],
  exports: [UsageService, UsageMeterService],
})
export class UsageModule {}
