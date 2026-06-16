import { Module, forwardRef } from '@nestjs/common';
import { FirebaseModule } from '../firebase/firebase.module';
import { ChannelsModule } from '../channels/channels.module';
import { VapiModule } from '../orchestrator/vapi/vapi.module';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { VapiProxyController } from './vapi-proxy.controller';
import { DynamicVoiceAgentExecutor } from './dynamic-voice-agent.executor';
import { AgentGroundingService } from './agent-grounding.service';

@Module({
  imports: [FirebaseModule, forwardRef(() => ChannelsModule), forwardRef(() => VapiModule)],
  controllers: [AgentController, VapiProxyController],
  providers: [AgentService, DynamicVoiceAgentExecutor, AgentGroundingService],
  exports: [AgentService, DynamicVoiceAgentExecutor, AgentGroundingService],
})
export class AgentModule {}
