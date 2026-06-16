import { Module } from '@nestjs/common';
import { VapiService } from './vapi.service';
import { VapiExecutor } from './vapi.executor';
import { MorganLeadsExecutor } from './morgan-leads.executor';
import { FlynFeedbackExecutor } from './flyn-feedback.executor';
import { HRAgentExecutor } from './hr-agent.executor';
import { FreelancerVoiceAgentExecutor } from './freelancer-voice-agent.executor';
import { ChurchVoiceAgentExecutor } from './church-voice-agent.executor';

/**
 * Vapi Module
 *
 * Provides the Vapi voice AI service and workflow executor.
 */
@Module({
    providers: [
        VapiService,
        VapiExecutor,
        MorganLeadsExecutor,
        FlynFeedbackExecutor,
        HRAgentExecutor,
        FreelancerVoiceAgentExecutor,
        ChurchVoiceAgentExecutor,
    ],
    exports: [
        VapiService,
        VapiExecutor,
        MorganLeadsExecutor,
        FlynFeedbackExecutor,
        HRAgentExecutor,
        FreelancerVoiceAgentExecutor,
        ChurchVoiceAgentExecutor,
    ],
})
export class VapiModule { }
