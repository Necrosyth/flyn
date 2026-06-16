/**
 * Accounting Executor
 *
 * Workflow node executor for accounting operations (Invoices/Expenses).
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../orchestrator/node-executor/base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../orchestrator/types';
import { AccountingService } from './accounting.service';
import { Invoice } from './accounting.types';

export interface AccountingNodeConfig {
    operation: 'create_invoice' | 'update_invoice' | 'get_invoices' | 'create_expense' | 'get_stats';
    invoiceId?: string;
    entityData?: string;
    op_fields?: Record<string, unknown>;
    limit?: number;
}

@Injectable()
export class AccountingExecutor extends BaseExecutor {
    private readonly logger = new Logger(AccountingExecutor.name);

    readonly nodeType = 'accounting';
    readonly displayName = 'Accounting Action';
    readonly description = 'Manage invoices, expenses, and track financial stats';

    constructor(private readonly accountingService: AccountingService) {
        super();
    }

    async execute(node: CompiledNode, context: NodeExecutionContext): Promise<NodeResult> {
        const config = node.config as unknown as AccountingNodeConfig;

        context.services.log('info', `Accounting executing operation: ${config.operation}`, { nodeId: node.id });

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
                case 'create_invoice': {
                    const invoice = await this.accountingService.createInvoice({
                        client: this.resolveValue(entityData.client as string, context.previousOutputs),
                        amount: this.resolveValue(entityData.amount as string, context.previousOutputs),
                        status: (entityData.status as any) || 'draft',
                        dueDate: this.resolveValue(entityData.due_date as string, context.previousOutputs),
                        module: (entityData.module as string) || 'Workflow',
                        description: this.resolveValue(entityData.description as string, context.previousOutputs),
                        currency: (entityData.currency as string) || 'USD',
                    });
                    return this.completed({ operation: 'create_invoice', invoice, message: `Invoice ${invoice.invoice} created for ${invoice.client}` });
                }

                case 'update_invoice': {
                    const id = this.resolveValue(config.invoiceId, context.previousOutputs) || (entityData.invoiceId as string);
                    if (!id) return this.failed('MISSING_INVOICE_ID', 'Invoice ID is required', false);
                    const invoice = await this.accountingService.updateInvoice(id, entityData as Partial<Invoice>);
                    if (!invoice) return this.failed('INVOICE_NOT_FOUND', `Invoice ${id} not found`, false);
                    return this.completed({ operation: 'update_invoice', invoice, message: `Invoice ${invoice.invoice} updated` });
                }

                case 'get_invoices': {
                    const result = await this.accountingService.getInvoices({
                        limit: config.limit || 20,
                        status: entityData.status as string,
                        module: entityData.module as string,
                    });
                    return this.completed({ operation: 'get_invoices', invoices: result.data, total: result.total });
                }

                case 'create_expense': {
                    const expense = await this.accountingService.createExpense({
                        description: this.resolveValue(entityData.description as string, context.previousOutputs),
                        amount: this.resolveValue(entityData.amount as string, context.previousOutputs),
                        category: (entityData.category as string) || 'General',
                        status: (entityData.status as any) || 'pending',
                    });
                    return this.completed({ operation: 'create_expense', expense, message: `Expense recorded: ${expense.description}` });
                }

                case 'get_stats': {
                    const stats = await this.accountingService.getStats();
                    return this.completed({ operation: 'get_stats', stats });
                }

                default:
                    return this.failed('UNKNOWN_OPERATION', `Unknown accounting operation: ${config.operation}`, false);
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Accounting executor error: ${err.message}`, err.stack);
            return this.failed('ACCOUNTING_ERROR', err.message, true);
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
