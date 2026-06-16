import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WorkflowStorageService } from './workflow-storage';
import { OrchestratorService } from './orchestrator.service';
import { ChannelsService } from '../channels/channels.service';
import { TriggerSource } from './types';

/**
 * WorkflowTriggerDispatchService
 *
 * Finds all published (isActive=true) workflows for a tenant whose trigger
 * node matches the incoming event, then executes each one.
 *
 * On module init it registers itself with ChannelsService via a setter —
 * this avoids any circular DI between OrchestratorModule and ChannelsModule.
 */
@Injectable()
export class WorkflowTriggerDispatchService implements OnModuleInit {
    private readonly logger = new Logger(WorkflowTriggerDispatchService.name);

    constructor(
        private readonly storage: WorkflowStorageService,
        private readonly orchestrator: OrchestratorService,
        private readonly channelsService: ChannelsService,
    ) {}

    onModuleInit() {
        // Register so ChannelsService can call us when a message arrives.
        // ChannelsService never imports us — we push a reference to it.
        this.channelsService.setWorkflowDispatch(this);
        this.logger.log('WorkflowTriggerDispatchService registered with ChannelsService');
    }

    /**
     * Dispatch an incoming channel event to matching active workflows.
     *
     * @param tenantId    - Tenant that owns the channel
     * @param channelType - 'whatsapp' | 'email' | 'sms' | 'telegram' | etc.
     * @param triggerData - Raw inbound message data (conversationId, from, message, …)
     */
    async dispatchInboxEvent(
        tenantId: string,
        channelType: string,
        triggerData: Record<string, unknown>,
    ): Promise<void> {
        if (!tenantId) return;

        let activeWorkflows: Awaited<ReturnType<WorkflowStorageService['listActiveByTenant']>>;
        try {
            activeWorkflows = await this.storage.listActiveByTenant(tenantId, [
                'inbox_trigger',
                'trigger',
            ]);
        } catch (err) {
            this.logger.error(`Failed to list active workflows for tenant ${tenantId}: ${(err as Error).message}`);
            return;
        }

        if (activeWorkflows.length === 0) {
            this.logger.debug(`No active workflows for tenant ${tenantId} — skipping dispatch`);
            return;
        }

        this.logger.log(`Dispatching ${channelType} event to ${activeWorkflows.length} active workflow(s) for tenant ${tenantId}`);

        for (const workflow of activeWorkflows) {
            const triggerNode = workflow.compiled_nodes.find(n =>
                n.type === 'inbox_trigger' || n.type === 'trigger'
            );
            if (!triggerNode) continue;

            // inbox_trigger: match channelType or 'all'
            if (triggerNode.type === 'inbox_trigger') {
                const cfg = triggerNode.config as { channelType?: string };
                if (cfg.channelType && cfg.channelType !== 'all' && cfg.channelType.toLowerCase() !== channelType.toLowerCase()) {
                    this.logger.debug(`Workflow ${workflow.id} inbox_trigger channelType="${cfg.channelType}" ≠ "${channelType}" — skipping`);
                    continue;
                }
            }

            // trigger: only fire for message_received / webhook / manual trigger types
            if (triggerNode.type === 'trigger') {
                const cfg = triggerNode.config as { triggerType?: string };
                if (cfg.triggerType && !['message_received', 'webhook', 'manual'].includes(cfg.triggerType)) {
                    continue;
                }
            }

            const triggerSource: TriggerSource = {
                type: 'event',
                metadata: { source: 'channel', channelType, tenantId },
            };

            try {
                const run = await this.orchestrator.executeWorkflow(workflow, triggerSource, {
                    ...triggerData,
                    channel: channelType,
                    tenantId,
                });
                this.logger.log(`Triggered workflow ${workflow.id} → run ${run.id} (status: ${run.status})`);
            } catch (err) {
                this.logger.error(`Failed to execute workflow ${workflow.id}: ${(err as Error).message}`);
            }
        }
    }
}
