import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FirebaseModule } from '../firebase/firebase.module';
import { OrchestratorService } from './orchestrator.service';
import { OrchestratorController } from './orchestrator.controller';
import { WorkflowController } from './workflow.controller';
import { WebhookController } from './webhook.controller';
import { WorkflowRuntimeService } from './workflow-runtime';
import { WorkflowStorageService } from './workflow-storage';
import { WorkflowValidationService } from './workflow-validation.service';
import { TimerService } from './timer';
import { GraphTraversalService } from './graph-traversal';
import { FirebaseAuthGuard, TenantGuard } from './guards';
import { RetryPolicyService } from './retry';
import { WorkflowLoggerService } from './logging';
import { AIProviderModule, AIProviderService } from './ai-provider';
import {
    ExecutorRegistryService,
    ActionExecutor,
    ConditionExecutor,
    WaitExecutor,
    ApprovalExecutor,
    TriggerExecutor,
    SplitExecutor,
    JoinExecutor,
    LoopExecutor,
    EndExecutor,
    AIRouterExecutor,
    MongoDBExecutor,
    PostgreSQLExecutor,
    MySQLExecutor,
    MergeExecutor,
} from './node-executor';
import { CrmModule } from '../crm/crm.module';
import { CRMExecutor } from '../crm/crm.executor';
import { DataSourcesModule } from '../data-sources';
import { VapiModule } from './vapi/vapi.module';
import { VapiExecutor } from './vapi/vapi.executor';
import { MorganLeadsExecutor } from './vapi/morgan-leads.executor';
import { FlynFeedbackExecutor } from './vapi/flyn-feedback.executor';
import { HRAgentExecutor } from './vapi/hr-agent.executor';
import { FreelancerVoiceAgentExecutor } from './vapi/freelancer-voice-agent.executor';
import { ChurchVoiceAgentExecutor } from './vapi/church-voice-agent.executor';
import { WebRTCModule } from './webrtc/webrtc.module';
import { WebRTCExecutor } from './webrtc/webrtc.executor';
import { HRModule } from '../hr/hr.module';
import { HRExecutor } from '../hr/hr.executor';
import { ChurchModule } from '../church/church.module';
import { ChurchExecutor } from '../church/church.executor';
import { FreelancerModule } from '../freelancer/freelancer.module';
import { FreelancerExecutor } from '../freelancer/freelancer.executor';
import { CoachesModule } from '../coaches/coaches.module';
import { CoachesExecutor } from '../coaches/coaches.executor';
import { TenantsModule } from '../tenants/tenants.module';
import { InboxTriggerExecutor } from './node-executor/executors/inbox-trigger.executor';
import { SendReplyExecutor } from './node-executor/executors/send-reply.executor';
import { DecisionExecutor } from './node-executor/executors/decision.executor';
import { AiActionExecutor } from './node-executor/executors/ai-action.executor';
import { QueryRecordsExecutor } from './node-executor/executors/query-records.executor';
import { AiDecisionExecutor } from './node-executor/executors/ai-decision.executor';
import { AgentModule, DynamicVoiceAgentExecutor } from '../agents';
import { ChannelsModule } from '../channels/channels.module';
import { SendWhatsAppExecutor } from './node-executor/executors/send-whatsapp.executor';
import { AccountingExecutor } from '../accounting/accounting.executor';
import { TasksExecutor } from '../tasks/tasks.executor';
import { BillingExecutor } from '../billing/billing.executor';
import { PhonebookExecutor } from '../phonebook/phonebook.executor';
import { CustomCodeExecutor } from './node-executor/executors/custom-code.executor';
import { CustomNodeDefsService } from './custom-nodes/custom-node-defs.service';
import { CustomNodeService } from './custom-nodes/custom-node.service';
import { CustomNodesController } from './custom-nodes/custom-nodes.controller';
import { ScopedContextService } from './custom-nodes/scoped-context.service';
import { VmSandboxRunner } from './custom-nodes/vm-sandbox-runner';
import { IsolatedVmRunner } from './custom-nodes/isolated-vm-runner';
import { AccountingModule } from '../accounting/accounting.module';
import { TasksModule } from '../tasks/tasks.module';
import { BillingModule } from '../billing/billing.module';
import { PhonebookModule } from '../phonebook/phonebook.module';
import { InboxModule } from '../inbox/inbox.module';
import { WorkflowTriggerDispatchService } from './workflow-trigger-dispatch.service';
import { WorkflowAssistantService } from './workflow-assistant.service';
import { WorkflowEventService } from './workflow-event.service';

/**
 * Orchestrator Module
 * 
 * The core workflow automation module for FLYN.
 * Provides the "brain" of the platform - executing workflows
 * built by the visual builder (FSD2).
 */
@Module({
    imports: [
        FirebaseModule,
        CrmModule,
        DataSourcesModule,
        VapiModule,
        WebRTCModule,
        forwardRef(() => HRModule),
        forwardRef(() => ChurchModule),
        forwardRef(() => FreelancerModule),
        forwardRef(() => CoachesModule),
        TenantsModule,
        forwardRef(() => ChannelsModule),
        forwardRef(() => AgentModule),
        AIProviderModule,
        forwardRef(() => AccountingModule),
        TasksModule,
        BillingModule,
        PhonebookModule,
        InboxModule,
        HttpModule.register({
            timeout: 30000,
            maxRedirects: 5,
        }),
    ],
    controllers: [OrchestratorController, WorkflowController, WebhookController, CustomNodesController],
    providers: [
        // Core services
        OrchestratorService,
        WorkflowRuntimeService,
        WorkflowStorageService,
        WorkflowTriggerDispatchService,
        WorkflowEventService,
        WorkflowValidationService,
        WorkflowAssistantService,
        TimerService,
        GraphTraversalService,
        ExecutorRegistryService,

        // Production services
        FirebaseAuthGuard,
        TenantGuard,
        RetryPolicyService,
        WorkflowLoggerService,

        // Node executors
        ActionExecutor,
        ConditionExecutor,
        WaitExecutor,
        ApprovalExecutor,
        TriggerExecutor,
        SplitExecutor,
        JoinExecutor,
        LoopExecutor,
        EndExecutor,
        AIRouterExecutor,
        MongoDBExecutor,
        PostgreSQLExecutor,
        MySQLExecutor,
        MergeExecutor,
        CRMExecutor,
        VapiExecutor,
        MorganLeadsExecutor,
        FlynFeedbackExecutor,
        HRAgentExecutor,
        FreelancerVoiceAgentExecutor,
        ChurchVoiceAgentExecutor,
        WebRTCExecutor,
        HRExecutor,
        ChurchExecutor,
        FreelancerExecutor,
        CoachesExecutor,
        InboxTriggerExecutor,
        SendReplyExecutor,
        DecisionExecutor,
        AiActionExecutor,
        QueryRecordsExecutor,
        AiDecisionExecutor,
        DynamicVoiceAgentExecutor,
        SendWhatsAppExecutor,
        AccountingExecutor,
        TasksExecutor,
        BillingExecutor,
        PhonebookExecutor,

        // AI custom nodes (see Exchanged_docs/AI_Custom_Nodes_Design.md)
        CustomCodeExecutor,
        CustomNodeDefsService,
        CustomNodeService,
        ScopedContextService,
        VmSandboxRunner,
        IsolatedVmRunner,
    ],
    exports: [
        OrchestratorService,
        ExecutorRegistryService,
        TimerService,
        WorkflowValidationService,
        RetryPolicyService,
        WorkflowLoggerService,
        AIProviderModule,
        WorkflowTriggerDispatchService,
        WorkflowEventService,
        WorkflowStorageService,
        WorkflowAssistantService,
    ],
})
export class OrchestratorModule { }

