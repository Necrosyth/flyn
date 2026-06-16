/**
 * Church Executor
 *
 * Workflow node executor for church management operations.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BaseExecutor } from '../orchestrator/node-executor/base-executor';
import { CompiledNode } from '../orchestrator/types';
import { NodeExecutionContext, NodeResult } from '../orchestrator/types';
import { ChurchService } from './church.service';
import { CrmService } from '../crm/crm.service';

export interface ChurchNodeConfig {
    operation: 'add_member' | 'update_member' | 'get_members' | 'record_donation' | 'create_event' | 'sync_to_crm';
    memberId?: string;
    entityData?: string;
    op_fields?: Record<string, unknown>;
    filter?: string;
    limit?: number;
}

@Injectable()
export class ChurchExecutor extends BaseExecutor {
    private readonly logger = new Logger(ChurchExecutor.name);

    readonly nodeType = 'church';
    readonly displayName = 'Church Action';
    readonly description = 'Perform church operations like managing members, donations, events, and syncing to CRM';

    constructor(
        private readonly churchService: ChurchService,
        @Optional() private readonly crmService?: CrmService,
    ) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as unknown as ChurchNodeConfig;

        context.services.log('info', `Church executing operation: ${config.operation}`, { nodeId: node.id });

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
                case 'add_member': {
                    const member = await this.churchService.addMember({
                        name: entityData.name as string,
                        email: entityData.email as string,
                        phone: entityData.phone as string,
                        familyId: entityData.family_id as string,
                        membershipType: entityData.membership_type as any,
                        notes: entityData.notes as string,
                    });
                    return this.completed({ operation: 'add_member', member, message: `Member added: ${member.name}` });
                }

                case 'update_member': {
                    const id = this.resolveValue(config.memberId, context.previousOutputs);
                    if (!id) return this.failed('MISSING_MEMBER_ID', 'Member ID is required', false);
                    const member = await this.churchService.updateMember(id, entityData as any);
                    if (!member) return this.failed('MEMBER_NOT_FOUND', `Member ${id} not found`, false);
                    return this.completed({ operation: 'update_member', member, message: `Member updated: ${member.name}` });
                }

                case 'get_members': {
                    let filter: Record<string, unknown> = {};
                    if (config.filter) {
                        try { filter = JSON.parse(this.interpolateTemplates(config.filter, context.previousOutputs)); } catch { /* empty */ }
                    }
                    const result = await this.churchService.getMembers({
                        search: filter.search as string,
                        membershipType: filter.membership_type as string,
                        limit: config.limit || 20,
                    });
                    return this.completed({ operation: 'get_members', members: result.data, total: result.total, message: `Retrieved ${result.data.length} members` });
                }

                case 'record_donation': {
                    const donation = await this.churchService.recordDonation({
                        memberId: this.resolveValue(config.memberId, context.previousOutputs) || entityData.memberId as string,
                        amount: Number(entityData.amount) || 0,
                        donationType: entityData.donation_type as any,
                        notes: entityData.notes as string,
                    });
                    return this.completed({ operation: 'record_donation', donation, message: `Donation recorded: $${donation.amount}` });
                }

                case 'create_event': {
                    const event = await this.churchService.createEvent({
                        title: entityData.title as string,
                        date: entityData.date as string,
                        time: entityData.time as string,
                        location: entityData.location as string,
                        eventType: entityData.event_type as any,
                        description: entityData.description as string,
                    });
                    return this.completed({ operation: 'create_event', event, message: `Event created: ${event.title}` });
                }

                case 'sync_to_crm': {
                    const memId = this.resolveValue(config.memberId, context.previousOutputs) || entityData.memberId as string;
                    if (!memId) return this.failed('MISSING_MEMBER_ID', 'Member ID is required for CRM sync', false);
                    const member = await this.churchService.getMemberById(memId);
                    if (!member) return this.failed('MEMBER_NOT_FOUND', `Member ${memId} not found`, false);
                    if (!this.crmService) return this.failed('CRM_NOT_AVAILABLE', 'CRM service not available', false);

                    const contact = await this.crmService.createContact({
                        name: member.name,
                        email: member.email || '',
                        phone: member.phone,
                        company: 'Church',
                        status: (entityData.crm_status as any) || 'customer',
                        source: 'Church Plugin',
                        notes: entityData.notes as string || `Synced from Church - ${member.membershipType}`,
                    });
                    return this.completed({ operation: 'sync_to_crm', contact, member, message: `Member synced to CRM: ${member.name}` });
                }

                default:
                    return this.failed('UNKNOWN_OPERATION', `Unknown church operation: ${config.operation}`, false);
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Church executor error: ${err.message}`, err.stack);
            return this.failed('CHURCH_ERROR', err.message, true);
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
