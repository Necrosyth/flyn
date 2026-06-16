import { Module, forwardRef } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';
import { BrevoInboundController } from './brevo-inbound.controller';
import { ChannelsModule } from '../channels/channels.module';
import { EmailPollingService } from '../channels/services/email-polling.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AIProviderModule } from '../orchestrator/ai-provider/ai-provider.module';
import { TranslationModule } from '../translation/translation.module';
import { AssetsModule } from '../assets/assets.module';
import { MailboxesModule } from '../mailboxes/mailboxes.module';
import { BrandingModule } from '../branding/branding.module';

@Module({
  imports: [forwardRef(() => ChannelsModule), FirebaseModule, TenantsModule, AIProviderModule, TranslationModule, AssetsModule, MailboxesModule, BrandingModule],
  controllers: [InboxController, BrevoInboundController],
  providers: [InboxService, EmailPollingService],
  exports: [InboxService],
})
export class InboxModule {}
