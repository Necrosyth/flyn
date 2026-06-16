import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { FirebaseModule } from '../firebase/firebase.module';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { EmailBrandingService } from './email-branding.service';

@Module({
  imports: [FirebaseModule, MulterModule],
  controllers: [BrandingController],
  providers: [BrandingService, EmailBrandingService],
  exports: [EmailBrandingService],
})
export class BrandingModule {}
