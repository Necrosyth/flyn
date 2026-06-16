import { Module } from '@nestjs/common';
import { OccasionsService } from './occasions.service';
import { OccasionsController } from './occasions.controller';
import { FirebaseModule } from '../firebase/firebase.module';
import { ChannelsModule } from '../channels/channels.module';
import { BrandingModule } from '../branding/branding.module';

@Module({
  imports: [FirebaseModule, ChannelsModule, BrandingModule],
  controllers: [OccasionsController],
  providers: [OccasionsService],
  exports: [OccasionsService],
})
export class OccasionsModule {}
