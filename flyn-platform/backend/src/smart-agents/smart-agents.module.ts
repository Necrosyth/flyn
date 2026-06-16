import { Module, forwardRef } from '@nestjs/common';
import { SmartAgentsController } from './smart-agents.controller';
import { SmartAgentsService } from './smart-agents.service';
import { SocialPublisherService } from './social-publisher.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { OrchestratorModule } from '../orchestrator';
import { CalendarModule } from '../calendar/calendar.module';
import { CrmModule } from '../crm/crm.module';
import { ChannelsModule } from '../channels/channels.module';

@Module({
  imports: [FirebaseModule, OrchestratorModule, CalendarModule, CrmModule, forwardRef(() => ChannelsModule)],
  controllers: [SmartAgentsController],
  providers: [SmartAgentsService, SocialPublisherService],
  exports: [SmartAgentsService],
})
export class SmartAgentsModule {}
