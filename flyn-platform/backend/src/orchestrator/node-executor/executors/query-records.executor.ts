/**
 * Query Records Executor
 *
 * Handles `query_records` type nodes created via the visual builder.
 * Fetches contacts, deals, leads, or other CRM records based on filter criteria.
 *
 * Config shape:
 *   resource:     'contacts' | 'deals' | 'leads' | 'accounts' | 'tickets' | 'tasks'
 *   operation:    'list' | 'get' | 'create' | 'update' | 'delete'
 *   limit:        number (default 10)
 *   filter_field: string (field to filter by)
 *   filter_value: string (value to filter against)
 *   sort_by:      string (field to sort by)
 *   sort_order:   'asc' | 'desc'
 *
 * Returns:
 *   output.results   – the matching records array
 *   output.count     – number of records returned
 *   output.resource  – the resource type queried
 */

import { Injectable } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../../types';
import { CrmService } from '../../../crm/crm.service';

interface QueryRecordsConfig {
    resource?: string;
    operation?: string;
    limit?: number;
    filter_field?: string;
    filter_value?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}

@Injectable()
export class QueryRecordsExecutor extends BaseExecutor {
    readonly nodeType = 'query_records';
    readonly displayName = 'Query Records';
    readonly description = 'Fetch CRM records (contacts, deals, leads) based on filter criteria';

    constructor(private readonly crmService: CrmService) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as QueryRecordsConfig;
        const resource = config.resource || 'contacts';
        const operation = config.operation || 'list';
        const limit = config.limit || 10;

        // Resolve template variables in filter values
        const filterField = config.filter_field
            ? this.interpolate(config.filter_field, context.previousOutputs)
            : undefined;
        const filterValue = config.filter_value
            ? this.interpolate(config.filter_value, context.previousOutputs)
            : undefined;

        context.services.log('info', `QueryRecords "${node.id}": ${operation} ${resource}${filterField ? ` where ${filterField}=${filterValue}` : ''}`, {
            nodeId: node.id,
        });

        try {
            switch (resource) {
                case 'contacts':
                case 'leads':
                case 'accounts': {
                    const query: Record<string, unknown> = { limit };
                    if (filterField && filterValue) {
                        if (filterField === 'search') {
                            query.search = filterValue;
                        } else if (filterField === 'status') {
                            query.status = filterValue;
                        } else {
                            // For 'leads', filter by status='lead' by default
                            if (resource === 'leads' && !query.status) {
                                query.status = 'lead';
                            }
                            query[filterField] = filterValue;
                        }
                    } else if (resource === 'leads') {
                        query.status = 'lead';
                    }

                    const result = await this.crmService.getContacts(query as any);
                    return this.completed({
                        results: result.data,
                        count: result.data.length,
                        total: result.total,
                        resource,
                        operation,
                    });
                }

                case 'deals': {
                    const deals = await this.crmService.getDeals(
                        filterField === 'stage' ? filterValue : undefined,
                    );
                    const limited = deals.slice(0, limit);
                    return this.completed({
                        results: limited,
                        count: limited.length,
                        total: deals.length,
                        resource,
                        operation,
                    });
                }

                case 'tickets':
                case 'tasks': {
                    // These resources are not fully implemented in the CRM service yet.
                    // Return an empty result with a note.
                    context.services.log('warn', `QueryRecords "${node.id}": resource '${resource}' is not yet implemented — returning empty results`, {
                        nodeId: node.id,
                    });
                    return this.completed({
                        results: [],
                        count: 0,
                        total: 0,
                        resource,
                        operation,
                        note: `Resource '${resource}' is not yet implemented`,
                    });
                }

                default:
                    return this.failed(
                        'UNKNOWN_RESOURCE',
                        `Unknown resource type: ${resource}. Supported: contacts, leads, deals, accounts, tickets, tasks`,
                        false,
                    );
            }
        } catch (error: any) {
            context.services.log('error', `QueryRecords "${node.id}" failed: ${error?.message}`, {
                nodeId: node.id,
            });
            return this.failed(
                'QUERY_FAILED',
                `Failed to query ${resource}: ${error?.message}`,
                true,
                { resource, operation },
            );
        }
    }

    private interpolate(template: string, data: Record<string, unknown>): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = this.getNestedValue(data, path.trim());
            return value !== undefined ? String(value) : `{{${path}}}`;
        });
    }

    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        if (!path) return undefined;
        const tokens = path
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.')
            .filter(Boolean);
        return tokens.reduce((cur: unknown, key: string) => {
            if (cur === undefined || cur === null) return undefined;
            if (Array.isArray(cur)) {
                const idx = Number(key);
                return Number.isInteger(idx) && !isNaN(idx) ? cur[idx] : (cur[0] as any)?.[key];
            }
            return (cur as Record<string, unknown>)[key];
        }, obj as unknown);
    }
}
