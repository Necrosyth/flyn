/**
 * Coaches Executor
 *
 * Workflow node executor for coaching and mentoring operations.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BaseExecutor } from '../orchestrator/node-executor/base-executor';
import { CompiledNode } from '../orchestrator/types';
import { NodeExecutionContext, NodeResult } from '../orchestrator/types';
import { CoachesService } from './coaches.service';
import { CrmService } from '../crm/crm.service';

export interface CoachesNodeConfig {
    operation: 'add_client' | 'update_client' | 'get_clients' | 'create_session' | 'log_progress' | 'sync_to_crm';
    clientId?: string;
    entityData?: string;
    op_fields?: Record<string, unknown>;
    filter?: string;
    limit?: number;
}

@Injectable()
export class CoachesExecutor extends BaseExecutor {
    private readonly logger = new Logger(CoachesExecutor.name);

    readonly nodeType = 'coaches';
    readonly displayName = 'Coaches Action';
    readonly description = 'Perform coaching operations like client management, sessions, progress tracking, and CRM sync';

    constructor(
        private readonly coachesService: CoachesService,
        @Optional() private readonly crmService?: CrmService,
    ) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as unknown as CoachesNodeConfig;

        context.services.log('info', `Coaches executing operation: ${config.operation}`, { nodeId: node.id });

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
                case 'add_client': {
                    const client = await this.coachesService.addClient({
                        name: entityData.name as string,
                        email: entityData.email as string,
                        phone: entityData.phone as string,
                        program: entityData.program as any,
                        goals: entityData.goals as string,
                        notes: entityData.notes as string,
                    });
                    return this.completed({ operation: 'add_client', client, message: `Client added: ${client.name}` });
                }

                case 'update_client': {
                    const id = this.resolveValue(config.clientId, context.previousOutputs);
                    if (!id) return this.failed('MISSING_CLIENT_ID', 'Client ID is required', false);
                    const client = await this.coachesService.updateClient(id, entityData as any);
                    if (!client) return this.failed('CLIENT_NOT_FOUND', `Client ${id} not found`, false);
                    return this.completed({ operation: 'update_client', client, message: `Client updated: ${client.name}` });
                }

                case 'get_clients': {
                    let filter: Record<string, unknown> = {};
                    if (config.filter) {
                        try { filter = JSON.parse(this.interpolateTemplates(config.filter, context.previousOutputs)); } catch { /* empty */ }
                    }
                    const result = await this.coachesService.getClients({
                        search: filter.search as string,
                        program: filter.program as string,
                        limit: config.limit || 20,
                    });
                    return this.completed({ operation: 'get_clients', clients: result.data, total: result.total, message: `Retrieved ${result.data.length} clients` });
                }

                case 'create_session': {
                    const session = await this.coachesService.createSession({
                        clientId: this.resolveValue(config.clientId, context.previousOutputs) || entityData.clientId as string,
                        date: entityData.date as string,
                        time: entityData.time as string,
                        duration: Number(entityData.duration) || 60,
                        sessionType: entityData.session_type as any,
                        agenda: entityData.agenda as string,
                    });
                    return this.completed({ operation: 'create_session', session, message: `Session created: ${session.sessionType}` });
                }

                case 'log_progress': {
                    const progress = await this.coachesService.logProgress({
                        clientId: this.resolveValue(config.clientId, context.previousOutputs) || entityData.clientId as string,
                        milestone: entityData.milestone as string,
                        rating: Number(entityData.rating) || 5,
                        notes: entityData.notes as string,
                    });
                    return this.completed({ operation: 'log_progress', progress, message: `Progress logged: ${progress.milestone}` });
                }

                case 'sync_to_crm': {
                    const cId = this.resolveValue(config.clientId, context.previousOutputs) || entityData.clientId as string;
                    if (!cId) return this.failed('MISSING_CLIENT_ID', 'Client ID is required for CRM sync', false);
                    const client = await this.coachesService.getClientById(cId);
                    if (!client) return this.failed('CLIENT_NOT_FOUND', `Client ${cId} not found`, false);
                    if (!this.crmService) return this.failed('CRM_NOT_AVAILABLE', 'CRM service not available', false);

                    const contact = await this.crmService.createContact({
                        name: client.name,
                        email: client.email,
                        phone: client.phone,
                        company: `Coaching - ${client.program}`,
                        status: (entityData.crm_status as any) || 'customer',
                        source: 'Coaches Plugin',
                        notes: entityData.notes as string || `Synced from Coaches - Program: ${client.program}`,
                    });
                    return this.completed({ operation: 'sync_to_crm', contact, client, message: `Client synced to CRM: ${client.name}` });
                }

                default:
                    return this.failed('UNKNOWN_OPERATION', `Unknown coaches operation: ${config.operation}`, false);
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Coaches executor error: ${err.message}`, err.stack);
            return this.failed('COACHES_ERROR', err.message, true);
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
