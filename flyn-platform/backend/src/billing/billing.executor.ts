/**
 * Billing Executor
 *
 * Workflow node executor for billing and payment operations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../orchestrator/node-executor/base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../orchestrator/types';
import { BillingService } from './billing.service';

export interface BillingNodeConfig {
    operation: 'create_checkout' | 'create_subscription' | 'get_subscription' | 'cancel_subscription' | 'list_payments';
    subscriptionId?: string;
    entityData?: string;
    op_fields?: Record<string, unknown>;
}

@Injectable()
export class BillingExecutor extends BaseExecutor {
    private readonly logger = new Logger(BillingExecutor.name);

    readonly nodeType = 'billing';
    readonly displayName = 'Billing Action';
    readonly description = 'Create checkout sessions, manage subscriptions, and track payments';

    constructor(private readonly billingService: BillingService) {
        super();
    }

    async execute(node: CompiledNode, context: NodeExecutionContext): Promise<NodeResult> {
        const config = node.config as unknown as BillingNodeConfig;
        const tenantId = context.tenantId;

        context.services.log('info', `Billing executing operation: ${config.operation}`, { nodeId: node.id });

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
                case 'create_checkout': {
                    const result = await this.billingService.createCheckoutSession({
                        tenantId: tenantId,
                        amount: Number(this.resolveValue(entityData.amount as string, context.previousOutputs)) || 0,
                        currency: (entityData.currency as string) || 'USD',
                        description: this.resolveValue(entityData.description as string, context.previousOutputs) || 'Payment',
                        customerEmail: this.resolveValue(entityData.customer_email as string, context.previousOutputs) || (context.token.data as any)?.customerEmail || 'unknown@example.com',
                        countryCode: (entityData.country_code as string) || 'US',
                        successUrl: (entityData.success_url as string) || 'http://localhost:3000/success',
                        cancelUrl: (entityData.cancel_url as string) || 'http://localhost:3000/cancel',
                        metadata: (entityData.metadata as any) || {},
                    }, tenantId);
                    return this.completed({ operation: 'create_checkout', checkout: result });
                }

                case 'create_subscription': {
                    const email = this.resolveValue(entityData.email as string, context.previousOutputs) || (context.token.data as any)?.customerEmail || (context.previousOutputs as any)?.customer_email || 'unknown@example.com';
                    const result = await this.billingService.createSubscription({
                        tenantId: tenantId,
                        planId: (entityData.plan_id as string) || 'basic',
                        countryCode: (entityData.country_code as string) || 'US',
                        email: email,
                    }, tenantId, email);
                    return this.completed({ operation: 'create_subscription', subscription: result });
                }

                case 'get_subscription': {
                    const id = this.resolveValue(config.subscriptionId, context.previousOutputs) || (entityData.subscriptionId as string);
                    if (!id) return this.failed('MISSING_SUB_ID', 'Subscription ID is required', false);
                    const result = await this.billingService.getSubscription(id, tenantId);
                    return this.completed({ operation: 'get_subscription', subscription: result });
                }

                case 'cancel_subscription': {
                    const id = this.resolveValue(config.subscriptionId, context.previousOutputs) || (entityData.subscriptionId as string);
                    if (!id) return this.failed('MISSING_SUB_ID', 'Subscription ID is required', false);
                    const result = await this.billingService.cancelSubscription(id, tenantId);
                    return this.completed({ operation: 'cancel_subscription', subscription: result });
                }

                case 'list_payments': {
                    const result = await this.billingService.listPayments(tenantId);
                    return this.completed({ operation: 'list_payments', payments: result });
                }

                default:
                    return this.failed('UNKNOWN_OPERATION', `Unknown billing operation: ${config.operation}`, false);
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Billing executor error: ${err.message}`, err.stack);
            return this.failed('BILLING_ERROR', err.message, true);
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
