import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ChannelsService } from './channels.service';
import { VoiceRelayGateway } from './voice-relay.gateway';
import { CallFlowExecutorService } from './call-flow-executor.service';
import { ChannelsController } from './channels.controller';
import { InboundWebhooksController } from './controllers/inbound-webhooks.controller';
import { WhatsAppCRMAdvancedController } from './controllers/whatsapp-crm-advanced.controller';
import { EmailTrackingController } from './controllers/email-tracking.controller';
import { OAuthCallbackController } from './controllers/oauth-callback.controller';
import { ChannelCredentialsService } from './services/channel-credentials.service';
import { OutboundPollingService } from './services/outbound-polling.service';
import { WhatsAppQRService } from './services/whatsapp-qr.service';
import { EmailOAuthService } from './services/email-oauth.service';
import { WhatsAppConnector } from './connectors/whatsapp.connector';
import { TelegramConnector } from './connectors/telegram.connector';
import { SlackConnector } from './connectors/slack.connector';
import { EmailConnector } from './connectors/email.connector';
import { GenericConnector } from './connectors/generic.connector';
import { TwilioConnector } from './connectors/twilio.connector';
import { VapiConnector } from './connectors/vapi.connector';
import { FacebookConnector } from './connectors/facebook.connector';
import { InstagramConnector } from './connectors/instagram.connector';
import { TikTokConnector } from './connectors/tiktok.connector';
import { LinkedInConnector } from './connectors/linkedin.connector';
import { AppleBusinessConnector } from './connectors/apple-business.connector';
import { SnapchatConnector } from './connectors/snapchat.connector';
import { TwitterConnector } from './connectors/twitter.connector';
import { FirebaseModule } from '../firebase/firebase.module';
import { TenantsModule } from '../tenants/tenants.module';
import { CrmModule } from '../crm/crm.module';
import { AIProviderModule } from '../orchestrator/ai-provider/ai-provider.module';
import { InboxModule } from '../inbox/inbox.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { MailModule } from '../mail/mail.module';
import { CalendarModule } from '../calendar/calendar.module';
import { UsageModule } from '../usage/usage.module';
import { AgentModule } from '../agents/agent.module';
import { BrandingModule } from '../branding/branding.module';

@Module({
  imports: [
    HttpModule,
    FirebaseModule,
    TenantsModule,
    forwardRef(() => CrmModule),
    AIProviderModule,
    UsageModule,
    MailModule,
    BrandingModule,
    CalendarModule,
    forwardRef(() => InboxModule),
    forwardRef(() => OrchestratorModule),
    forwardRef(() => AgentModule),
  ],
  controllers: [ChannelsController, InboundWebhooksController, WhatsAppCRMAdvancedController, EmailTrackingController, OAuthCallbackController],
  providers: [
    ChannelsService,
    VoiceRelayGateway,
    CallFlowExecutorService,
    ChannelCredentialsService,
    OutboundPollingService,
    WhatsAppQRService,
    EmailOAuthService,
    WhatsAppConnector,
    TelegramConnector,
    SlackConnector,
    EmailConnector,
    GenericConnector,
    TwilioConnector,
    VapiConnector,
    FacebookConnector,
    InstagramConnector,
    TikTokConnector,
    LinkedInConnector,
    AppleBusinessConnector,
    SnapchatConnector,
    TwitterConnector,
  ],
  exports: [ChannelsService, WhatsAppQRService, EmailOAuthService, ChannelCredentialsService],
})
export class ChannelsModule {}
