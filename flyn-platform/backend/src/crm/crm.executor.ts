/**
 * CRM Executor
 * 
 * Workflow node executor for CRM operations.
 * Enables CRM actions (create/update contacts, create deals, etc.) 
 * to be used as nodes in the visual workflow builder.
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../orchestrator/node-executor/base-executor';
import { CompiledNode } from '../orchestrator/types';
import { NodeExecutionContext, NodeResult } from '../orchestrator/types';
import { CrmService } from './crm.service';

export interface CRMNodeConfig {
    operation: 'create_contact' | 'update_contact' | 'get_contacts' | 'create_deal' | 'update_deal_stage' | 'log_activity';
    contactId?: string;
    dealId?: string;
    entityData?: string;     // JSON string of entity data (legacy)
    op_fields?: Record<string, unknown>;  // Dynamic group fields from the UI schema
    filter?: string;         // JSON string of filter criteria
    limit?: number;
}

@Injectable()
export class CRMExecutor extends BaseExecutor {
    private readonly logger = new Logger(CRMExecutor.name);

    readonly nodeType = 'crm';
    readonly displayName = 'CRM Action';
    readonly description = 'Perform CRM operations like creating contacts, updating deals, or logging activities';

    constructor(private readonly crmService: CrmService) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as unknown as CRMNodeConfig;

        context.services.log('info', `CRM executing operation: ${config.operation}`, {
            nodeId: node.id,
        });

        try {
            // Parse entity data — prefer op_fields (from UI schema) over entityData (legacy JSON string)
            let entityData: Record<string, unknown> = {};
            if (config.op_fields && typeof config.op_fields === 'object') {
                // op_fields comes from the dynamic_group schema — interpolate template variables
                entityData = this.interpolateObjectTemplates(config.op_fields, context.previousOutputs);
                this.logger.debug(`Using op_fields: ${JSON.stringify(entityData)}`);
            } else if (config.entityData) {
                try {
                    const interpolated = this.interpolateTemplates(config.entityData, context.previousOutputs);
                    entityData = JSON.parse(interpolated);
                } catch (e) {
                    return this.failed('INVALID_ENTITY_DATA', 'Failed to parse entity data JSON', false);
                }
            }

            switch (config.operation) {
                case 'create_contact': {
                    const contact = await this.crmService.createContact({
                        name: entityData.name as string || 'Unknown',
                        email: entityData.email as string || '',
                        phone: entityData.phone as string,
                        company: entityData.company as string,
                        status: (entityData.status as any) || 'lead',
                        source: entityData.source as string,
                        tags: entityData.tags as string[],
                        notes: entityData.notes as string,
                    });
                    return this.completed({
                        operation: 'create_contact',
                        contact,
                        message: `Contact created: ${contact.name}`,
                    });
                }

                case 'update_contact': {
                    const contactId = this.resolveValue(config.contactId, context.previousOutputs);
                    if (!contactId) {
                        return this.failed('MISSING_CONTACT_ID', 'Contact ID is required for update', false);
                    }
                    const contact = await this.crmService.updateContact(contactId, entityData);
                    if (!contact) {
                        return this.failed('CONTACT_NOT_FOUND', `Contact ${contactId} not found`, false);
                    }
                    return this.completed({
                        operation: 'update_contact',
                        contact,
                        message: `Contact updated: ${contact.name}`,
                    });
                }

                case 'get_contacts': {
                    let filter: Record<string, unknown> = {};
                    if (config.filter) {
                        try {
                            const interpolated = this.interpolateTemplates(config.filter, context.previousOutputs);
                            filter = JSON.parse(interpolated);
                        } catch (e) {
                            // Use empty filter on parse failure
                        }
                    }
                    const result = await this.crmService.getContacts({
                        search: filter.search as string,
                        status: filter.status as any,
                        limit: config.limit || 20,
                    });
                    return this.completed({
                        operation: 'get_contacts',
                        contacts: result.data,
                        total: result.total,
                        message: `Retrieved ${result.data.length} contacts`,
                    });
                }

                case 'create_deal': {
                    const deal = await this.crmService.createDeal({
                        title: entityData.title as string || 'Untitled Deal',
                        value: (entityData.value as number) || 0,
                        stage: (entityData.stage as any) || 'new',
                        contactId: entityData.contactId as string || '',
                        contactName: entityData.contactName as string,
                        probability: entityData.probability as number,
                        owner: entityData.owner as string,
                        notes: entityData.notes as string,
                    });
                    return this.completed({
                        operation: 'create_deal',
                        deal,
                        message: `Deal created: ${deal.title} ($${deal.value})`,
                    });
                }

                case 'update_deal_stage': {
                    const dealId = this.resolveValue(config.dealId, context.previousOutputs);
                    if (!dealId) {
                        return this.failed('MISSING_DEAL_ID', 'Deal ID is required for stage update', false);
                    }
                    const deal = await this.crmService.updateDeal(dealId, {
                        stage: entityData.stage as any,
                        probability: entityData.probability as number,
                        notes: entityData.notes as string,
                    });
                    if (!deal) {
                        return this.failed('DEAL_NOT_FOUND', `Deal ${dealId} not found`, false);
                    }
                    return this.completed({
                        operation: 'update_deal_stage',
                        deal,
                        message: `Deal stage updated: ${deal.title} → ${deal.stage}`,
                    });
                }

                case 'log_activity': {
                    const activity = await this.crmService.createActivity({
                        type: (entityData.type as any) || 'note',
                        contactId: entityData.contactId as string || this.resolveValue(config.contactId, context.previousOutputs),
                        dealId: entityData.dealId as string || this.resolveValue(config.dealId, context.previousOutputs),
                        description: entityData.description as string || 'Activity logged via workflow',
                        actor: entityData.actor as string || 'Workflow',
                    });
                    return this.completed({
                        operation: 'log_activity',
                        activity,
                        message: `Activity logged: ${activity.type}`,
                    });
                }

                default:
                    return this.failed(
                        'UNKNOWN_OPERATION',
                        `Unknown CRM operation: ${config.operation}`,
                        false,
                    );
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`CRM executor error: ${err.message}`, err.stack);
            return this.failed('CRM_ERROR', err.message, true);
        }
    }

    /**
     * Resolve a value that may contain template variables
     */
    private resolveValue(value: string | undefined, data: Record<string, unknown>): string | undefined {
        if (!value) return undefined;
        return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const resolved = this.getNestedValue(data, path.trim());
            return resolved !== undefined ? String(resolved) : '';
        });
    }

    /**
     * Interpolate template variables in a string
     */
    private interpolateTemplates(template: string, data: Record<string, unknown>): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = this.getNestedValue(data, path.trim());
            if (value === undefined) return `{{${path}}}`;
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
        });
    }

    /**
     * Interpolate template variables in all string values of an object
     */
    private interpolateObjectTemplates(obj: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = this.interpolateTemplates(value, data);
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                result[key] = this.interpolateObjectTemplates(value as Record<string, unknown>, data);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Get a nested value from an object using dot/bracket notation.
     * Supports: a.b.c, a.b[0].c, a[0], a["key"]
     */
    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        // Tokenise path into keys/indices: "a.b[0].c" → ['a','b','0','c']
        const tokens = path
            .replace(/\[(\d+)\]/g, '.$1')   // result[0] → result.0
            .replace(/\["([^"]+)"\]/g, '.$1') // result["key"] → result.key
            .replace(/\['([^']+)'\]/g, '.$1') // result['key'] → result.key
            .split('.')
            .filter(Boolean);

        return tokens.reduce((current, key) => {
            if (current === undefined || current === null) return undefined;
            if (Array.isArray(current)) {
                const idx = Number(key);
                if (Number.isInteger(idx)) return current[idx];
                // Non-numeric key on array → fall through to [0]
                const first = current[0];
                if (first && typeof first === 'object') {
                    return (first as Record<string, unknown>)[key];
                }
                return undefined;
            }
            if (typeof current === 'object') {
                return (current as Record<string, unknown>)[key];
            }
            return undefined;
        }, obj as unknown);
    }
}
