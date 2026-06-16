/**
 * Phonebook Executor
 *
 * Workflow node executor for Phonebook operations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../orchestrator/node-executor/base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../orchestrator/types';
import { PhonebookService } from './phonebook.service';

export interface PhonebookNodeConfig {
    operation: 'create_contact' | 'update_contact' | 'get_contacts' | 'delete_contact';
    contactId?: string;
    entityData?: string;
    op_fields?: Record<string, unknown>;
}

@Injectable()
export class PhonebookExecutor extends BaseExecutor {
    private readonly logger = new Logger(PhonebookExecutor.name);

    readonly nodeType = 'phonebook';
    readonly displayName = 'Phonebook Action';
    readonly description = 'Manage contacts and phonebook records';

    constructor(private readonly phonebookService: PhonebookService) {
        super();
    }

    async execute(node: CompiledNode, context: NodeExecutionContext): Promise<NodeResult> {
        const config = node.config as unknown as PhonebookNodeConfig;
        const tenantId = context.tenantId;

        context.services.log('info', `Phonebook executing operation: ${config.operation}`, { nodeId: node.id });

        try {
            let entityData: Record<string, unknown> = {};
            if (config.entityData) {
                try {
                    const interpolated = this.interpolateTemplates(config.entityData, context.previousOutputs);
                    entityData = JSON.parse(interpolated);
                } catch {
                    return this.failed('INVALID_ENTITY_DATA', 'Failed to parse entity data JSON', false);
                }
            } else if (config.op_fields && typeof config.op_fields === 'object') {
                entityData = config.op_fields as Record<string, unknown>;
            }

            switch (config.operation) {
                case 'create_contact': {
                    const contact = await this.phonebookService.createContact(tenantId, {
                        firstName: this.resolveValue(entityData.firstName as string, context.previousOutputs) || '',
                        lastName: this.resolveValue(entityData.lastName as string, context.previousOutputs) || '',
                        phone: this.resolveValue(entityData.phone as string, context.previousOutputs) || '',
                        email: this.resolveValue(entityData.email as string, context.previousOutputs) || '',
                        group: (entityData.group as string) || 'General',
                        notes: this.resolveValue(entityData.notes as string, context.previousOutputs),
                    });
                    return this.completed({ operation: 'create_contact', contact, message: `Contact created: ${contact.firstName} ${contact.lastName}` });
                }

                case 'update_contact': {
                    const id = this.resolveValue(config.contactId, context.previousOutputs) || (entityData.contactId as string);
                    if (!id) return this.failed('MISSING_CONTACT_ID', 'Contact ID is required', false);
                    const contact = await this.phonebookService.updateContact(tenantId, id, entityData as any);
                    return this.completed({ operation: 'update_contact', contact, message: `Contact updated: ${contact.firstName} ${contact.lastName}` });
                }

                case 'get_contacts': {
                    const contacts = await this.phonebookService.getContacts(tenantId);
                    return this.completed({ operation: 'get_contacts', contacts });
                }

                case 'delete_contact': {
                    const id = this.resolveValue(config.contactId, context.previousOutputs) || (entityData.contactId as string);
                    if (!id) return this.failed('MISSING_CONTACT_ID', 'Contact ID is required', false);
                    await this.phonebookService.deleteContact(tenantId, id);
                    return this.completed({ operation: 'delete_contact', success: true, contactId: id });
                }

                default:
                    return this.failed('UNKNOWN_OPERATION', `Unknown phonebook operation: ${config.operation}`, false);
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Phonebook executor error: ${err.message}`, err.stack);
            return this.failed('PHONEBOOK_ERROR', err.message, true);
        }
    }

    private resolveValue(value: string | undefined, data: Record<string, unknown>): string | undefined {
        if (!value || typeof value !== 'string') return value;
        return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const resolved = this.getNestedValue(data, path.trim());
            return resolved !== undefined ? String(resolved) : '';
        });
    }

    private interpolateTemplates(template: string, data: Record<string, unknown>): string {
        if (typeof template !== 'string') return template;
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
                return undefined;
            }
            if (typeof current === 'object') return (current as Record<string, unknown>)[key];
            return undefined;
        }, obj as unknown);
    }
}
