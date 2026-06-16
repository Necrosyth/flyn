/**
 * Freelancer Executor
 *
 * Workflow node executor for freelance business operations.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BaseExecutor } from '../orchestrator/node-executor/base-executor';
import { CompiledNode } from '../orchestrator/types';
import { NodeExecutionContext, NodeResult } from '../orchestrator/types';
import { FreelancerService } from './freelancer.service';
import { CrmService } from '../crm/crm.service';

export interface FreelancerNodeConfig {
    operation: 'create_project' | 'update_project' | 'get_projects' | 'log_time' | 'create_invoice' | 'sync_to_crm';
    projectId?: string;
    entityData?: string;
    op_fields?: Record<string, unknown>;
    filter?: string;
    limit?: number;
}

@Injectable()
export class FreelancerExecutor extends BaseExecutor {
    private readonly logger = new Logger(FreelancerExecutor.name);

    readonly nodeType = 'freelancer';
    readonly displayName = 'Freelancer Action';
    readonly description = 'Perform freelancer operations like project management, time tracking, invoicing, and CRM sync';

    constructor(
        private readonly freelancerService: FreelancerService,
        @Optional() private readonly crmService?: CrmService,
    ) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as unknown as FreelancerNodeConfig;

        context.services.log('info', `Freelancer executing operation: ${config.operation}`, { nodeId: node.id });

        try {
            let entityData: Record<string, unknown> = {};
            if (config.entityData) {
                try {
                    const interpolated = this.interpolateTemplates(config.entityData, context.previousOutputs);
                    entityData = JSON.parse(interpolated);
                } catch {
                    return this.failed('INVALID_ENTITY_DATA', 'Failed to parse entity data JSON', false);
                }
            }
            // Fallback: if no entityData, use form-filled op_fields (PropertyPanel stores values there)
            if (!config.entityData && config.op_fields && typeof config.op_fields === 'object') {
                entityData = config.op_fields as Record<string, unknown>;
            }

            switch (config.operation) {
                case 'create_project': {
                    const project = await this.freelancerService.createProject({
                        title: entityData.title as string,
                        clientName: entityData.client_name as string,
                        clientEmail: entityData.client_email as string,
                        budget: Number(entityData.budget) || undefined,
                        deadline: entityData.deadline as string,
                        status: entityData.status as any,
                        description: entityData.description as string,
                    });
                    return this.completed({ operation: 'create_project', project, message: `Project created: ${project.title}` });
                }

                case 'update_project': {
                    const id = this.resolveValue(config.projectId, context.previousOutputs);
                    if (!id) return this.failed('MISSING_PROJECT_ID', 'Project ID is required', false);
                    const project = await this.freelancerService.updateProject(id, entityData as any);
                    if (!project) return this.failed('PROJECT_NOT_FOUND', `Project ${id} not found`, false);
                    return this.completed({ operation: 'update_project', project, message: `Project updated: ${project.title}` });
                }

                case 'get_projects': {
                    let filter: Record<string, unknown> = {};
                    if (config.filter) {
                        try { filter = JSON.parse(this.interpolateTemplates(config.filter, context.previousOutputs)); } catch { /* empty */ }
                    }
                    const result = await this.freelancerService.getProjects({
                        search: filter.search as string,
                        status: filter.status as string,
                        limit: config.limit || 20,
                    });
                    return this.completed({ operation: 'get_projects', projects: result.data, total: result.total, message: `Retrieved ${result.data.length} projects` });
                }

                case 'log_time': {
                    const entry = await this.freelancerService.logTime({
                        projectId: this.resolveValue(config.projectId, context.previousOutputs) || entityData.projectId as string,
                        hours: Number(entityData.hours) || 1,
                        description: entityData.description as string,
                        date: entityData.date as string,
                        billable: entityData.billable !== false,
                    });
                    return this.completed({ operation: 'log_time', timeEntry: entry, message: `Time logged: ${entry.hours}h` });
                }

                case 'create_invoice': {
                    const invoice = await this.freelancerService.createInvoice({
                        projectId: this.resolveValue(config.projectId, context.previousOutputs) || entityData.projectId as string,
                        amount: Number(entityData.amount) || 0,
                        dueDate: entityData.due_date as string,
                        description: entityData.description as string,
                        status: entityData.status as any,
                    });
                    return this.completed({ operation: 'create_invoice', invoice, message: `Invoice created: $${invoice.amount}` });
                }

                case 'sync_to_crm': {
                    const projId = this.resolveValue(config.projectId, context.previousOutputs) || entityData.projectId as string;
                    if (!projId) return this.failed('MISSING_PROJECT_ID', 'Project ID is required for CRM sync', false);
                    const project = await this.freelancerService.getProjectById(projId);
                    if (!project) return this.failed('PROJECT_NOT_FOUND', `Project ${projId} not found`, false);
                    if (!this.crmService) return this.failed('CRM_NOT_AVAILABLE', 'CRM service not available', false);

                    const contact = await this.crmService.createContact({
                        name: project.clientName,
                        email: project.clientEmail || '',
                        status: (entityData.crm_status as any) || 'customer',
                        source: 'Freelancer Plugin',
                        notes: entityData.notes as string || `Synced from Freelancer - Project: ${project.title}`,
                    });

                    let deal = undefined;
                    if (entityData.create_deal !== false && project.budget) {
                        deal = await this.crmService.createDeal({
                            title: project.title,
                            value: project.budget,
                            stage: project.status === 'completed' ? 'won' : 'qualified',
                            contactId: contact._id,
                            contactName: project.clientName,
                        });
                    }

                    return this.completed({ operation: 'sync_to_crm', contact, deal, project, message: `Project synced to CRM: ${project.clientName}` });
                }

                default:
                    return this.failed('UNKNOWN_OPERATION', `Unknown freelancer operation: ${config.operation}`, false);
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Freelancer executor error: ${err.message}`, err.stack);
            return this.failed('FREELANCER_ERROR', err.message, true);
        }
    }

    private resolveValue(value: string | undefined, data: Record<string, unknown>): string | undefined {
        if (!value) return undefined;
        return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const resolved = this.getNestedValue(data, path.trim());
            return resolved !== undefined ? String(resolved) : '';
        });
    }

    private interpolateTemplates(template: string, data: Record<string, unknown>): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = this.getNestedValue(data, path.trim());
            if (value === undefined) return `{{${path}}}`;
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
        });
    }

    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        const tokens = path.replace(/\[(\d+)\]/g, '.$1').replace(/\["([^"]+)"\]/g, '.$1').replace(/\['([^']+)'\]/g, '.$1').split('.').filter(Boolean);
        return tokens.reduce((current, key) => {
            if (current === undefined || current === null) return undefined;
            if (Array.isArray(current)) {
                const idx = Number(key);
                if (Number.isInteger(idx)) return current[idx];
                const first = current[0];
                if (first && typeof first === 'object') return (first as Record<string, unknown>)[key];
                return undefined;
            }
            if (typeof current === 'object') return (current as Record<string, unknown>)[key];
            return undefined;
        }, obj as unknown);
    }
}
