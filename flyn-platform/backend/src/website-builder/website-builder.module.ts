import { Module } from '@nestjs/common';
import { WebsiteBuilderController } from './website-builder.controller';
import { PublicWebsiteController } from './public-website.controller';
import { PublicFormsController } from './public-forms.controller';
import { WebsiteCmsController } from './website-cms.controller';
import { WebsiteBuilderService } from './website-builder.service';
import { WebsiteCmsService } from './website-cms.service';
import { WebsiteBuilderCreditsService } from './website-builder-credits.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { CrmModule } from '../crm/crm.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [FirebaseModule, CrmModule, WalletModule],
  controllers: [WebsiteBuilderController, PublicWebsiteController, PublicFormsController, WebsiteCmsController],
  providers: [WebsiteBuilderService, WebsiteCmsService, WebsiteBuilderCreditsService],
  exports: [WebsiteBuilderService, WebsiteCmsService, WebsiteBuilderCreditsService],
})
export class WebsiteBuilderModule {}
