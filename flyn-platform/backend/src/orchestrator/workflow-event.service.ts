import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WorkflowStorageService } from './workflow-storage';
import { OrchestratorService } from './orchestrator.service';
import { TriggerSource } from './types';
import { CrmService } from '../crm/crm.service';
import { HRService } from '../hr/hr.service';

/**
 * WorkflowEventService — Platform event bus for named workflow triggers.
 *
 * Any backend service (CRM, HR, Accounting, Billing, etc.) calls
 * `fire(tenantId, eventName, data)` when something meaningful happens.
 *
 * This service finds all active workflows whose trigger node is configured
 * with trigger_type: "event" and event_name matching the fired event,
 * then executes each one with the event data as the trigger payload.
 *
 * Event naming convention: module.entity.action
 * Examples:
 *   crm.contact.created   — new CRM contact
 *   crm.deal.won          — deal moved to "won" stage
 *   hr.employee.created   — new HR employee record
 *   billing.payment.received
 *   accounting.invoice.created
 */
@Injectable()
export class WorkflowEventService implements OnModuleInit {
    private readonly logger = new Logger(WorkflowEventService.name);

    constructor(
        private readonly storage: WorkflowStorageService,
        private readonly orchestrator: OrchestratorService,
        private readonly crmService: CrmService,
        private readonly hrService: HRService,
    ) {}

    onModuleInit() {
        // Push ourselves to each service via setter — avoids circular DI.
        // The services store a plain callback so they have no import dependency on us.
        const bus = (tenantId: string, eventName: string, data: Record<string, unknown>) =>
            this.fire(tenantId, eventName, data);

        this.crmService.setEventBus(bus);
        this.hrService.setEventBus(bus);
        this.logger.log('WorkflowEventService wired: crm, hr');
    }

    /**
     * Fire a named platform event. Finds all active workflows listening for this
     * event and executes them in parallel (fire-and-forget per workflow).
     *
     * @param tenantId  - The tenant that owns the data
     * @param eventName - Namespaced event name, e.g. "crm.contact.created"
     * @param data      - Payload passed as trigger data to the workflow
     */
    async fire(
        tenantId: string,
        eventName: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        if (!tenantId || !eventName) return;

        let activeWorkflows: Awaited<ReturnType<WorkflowStorageService['listActiveByTenant']>>;
        try {
            activeWorkflows = await this.storage.listActiveByTenant(tenantId, ['trigger']);
        } catch (err) {
            this.logger.error(`WorkflowEventService.fire — storage error for tenant ${tenantId}: ${(err as Error).message}`);
            return;
        }

        if (activeWorkflows.length === 0) return;

        const matching = activeWorkflows.filter(wf => {
            const triggerNode = wf.compiled_nodes.find(n => n.type === 'trigger');
            if (!triggerNode) return false;
            const cfg = triggerNode.config as { trigger_type?: string; triggerType?: string; event_name?: string; eventName?: string };
            const isEventTrigger = cfg.trigger_type === 'event' || cfg.triggerType === 'event';
            const name = cfg.event_name || cfg.eventName || '';
            return isEventTrigger && name === eventName;
        });

        if (matching.length === 0) {
            this.logger.debug(`No active workflows listening for event "${eventName}" (tenant ${tenantId})`);
            return;
        }

        this.logger.log(`Firing event "${eventName}" → ${matching.length} workflow(s) for tenant ${tenantId}`);

        const triggerSource: TriggerSource = {
            type: 'event',
            metadata: { source: 'platform_event', eventName, tenantId },
        };

        for (const wf of matching) {
            this.orchestrator.executeWorkflow(wf, triggerSource, { ...data, _event: eventName, tenantId })
                .then(run => this.logger.log(`Event "${eventName}" → workflow ${wf.id} → run ${run.id}`))
                .catch(err => this.logger.error(`Event "${eventName}" → workflow ${wf.id} failed: ${(err as Error).message}`));
        }
    }
}
