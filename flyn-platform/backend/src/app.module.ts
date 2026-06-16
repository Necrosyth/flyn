import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './firebase/firebase.module';
import { TenantsModule } from './tenants/tenants.module';
import { OrchestratorModule } from './orchestrator';
import { CrmModule } from './crm';
import { TranslationModule } from './translation/translation.module';
import { DataSourcesModule } from './data-sources';
import { BillingModule } from './billing/billing.module';
import { WalletModule } from './wallet/wallet.module';
import { NocoBaseModule } from './nocobase/nocobase.module';
import { HRModule } from './hr/hr.module';
import { ChurchModule } from './church/church.module';
import { CoachesModule } from './coaches/coaches.module';
import { FreelancerModule } from './freelancer/freelancer.module';
import { EsimModule } from './esim/esim.module';
import { AgentModule } from './agents';
import { DashboardModule } from './dashboard/dashboard.module';
import { TeamModule } from './team/team.module';
import { BrandingModule } from './branding/branding.module';
import { MailboxesModule } from './mailboxes/mailboxes.module';
import { BrevoModule } from './brevo/brevo.module';
import { ChannelsModule } from './channels/channels.module';
import { AccountingModule } from './accounting/accounting.module';
import { OccasionsModule } from './occasions/occasions.module';
import { UsageModule } from './usage/usage.module';
import { ContractsModule } from './contracts/contracts.module';
import { AutomationModule } from './automation/automation.module';
import { SmartAgentsModule } from './smart-agents/smart-agents.module';
import { CalendarModule } from './calendar/calendar.module';
import { TasksModule } from './tasks/tasks.module';
import { PhonebookModule } from './phonebook/phonebook.module';
import { InboxModule } from './inbox/inbox.module';
import { DomainsModule } from './domains/domains.module';
import { WebsiteBuilderModule } from './website-builder/website-builder.module';
import { TelephonyModule } from './telephony/telephony.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { MailModule } from './mail/mail.module';
import { PlansAdminModule } from './admin/plans/plans-admin.module';
import { ContactModule } from './contact/contact.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { AuthMailModule } from './auth-mail/auth-mail.module';
import { ApiSpecModule } from './api-spec/api-spec.module';
import { AssetsModule } from './assets/assets.module';
import { ComparisonModule } from './comparison/comparison.module';
import { CampaignsModule } from './campaigns/campaigns.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    FirebaseModule,
    TenantsModule,
    OrchestratorModule,
    CrmModule,
    DataSourcesModule,
    SystemSettingsModule,
    BillingModule,
    WalletModule,
    TranslationModule,
    HRModule,
    ChurchModule,
    CoachesModule,
    FreelancerModule,
    EsimModule,
    AgentModule,
    DashboardModule,
    TeamModule,
    BrandingModule,
    MailboxesModule,
    BrevoModule,
    ChannelsModule,
    AccountingModule,
    OccasionsModule,
    UsageModule,
    ContractsModule,
    AutomationModule,
    SmartAgentsModule,
    CalendarModule,
    TasksModule,
    PhonebookModule,
    InboxModule,
    CampaignsModule,
    DomainsModule,
    WebsiteBuilderModule,
    TelephonyModule,
    IntegrationsModule,
    MailModule,
    PlansAdminModule,
    ContactModule,
    ChatbotModule,
    AuthMailModule,
    ApiSpecModule,
    AssetsModule,
    ComparisonModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
