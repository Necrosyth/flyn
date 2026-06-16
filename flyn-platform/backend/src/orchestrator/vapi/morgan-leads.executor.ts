import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../node-executor/base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../types';
import { VapiService } from './vapi.service';

/**
 * Morgan (Leads Agent) Executor
 *
 * Workflow node executor dedicated to triggering calls with the Morgan Lead Qualification agent.
 */
@Injectable()
export class MorganLeadsExecutor extends BaseExecutor {
    private readonly logger = new Logger(MorganLeadsExecutor.name);

    readonly nodeType = 'morgan_leads';
    readonly displayName = 'Morgan (Leads Agent)';
    readonly description = 'Trigger a voice call with Morgan, the Lead Qualification & Nurturing Agent';

    // The hardcoded ID from the AI Agents config
    private readonly MORGAN_ASSISTANT_ID = '6320989a-e507-46ce-8dd4-7a7ff22ba9c3';

    constructor(private readonly vapiService: VapiService) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const { config } = node;

        context.services.log('info', 'Executing Morgan Leads call', {
            nodeId: node.id,
            config,
        });

        try {
            const customerNumber = this.resolveValue(config.customerNumber || config.customer_number, context) as string;
            const phoneNumberId = this.resolveValue(config.phoneNumberId || config.phone_number_id, context) as string;

            if (!customerNumber) {
                throw new Error("Customer phone number is required.");
            }

            const output = await this.vapiService.createCall({
                phoneNumberId: phoneNumberId || process.env.VAPI_PHONE_NUMBER_ID || '',
                customerNumber,
                assistantId: this.MORGAN_ASSISTANT_ID,
            });

            return this.completed({
                success: true,
                result: output,
                executedAt: new Date().toISOString(),
            });
        } catch (error) {
            const err = error as Error;
            context.services.log('error', `Morgan Leads call failed: ${err.message}`, {
                nodeId: node.id,
                error: err.message,
            });

            return this.failed(
                'MORGAN_LEADS_EXECUTION_ERROR',
                err.message,
                true,
                { originalError: err.message },
            );
        }
    }

    /**
     * Resolve {{variable}} references from previous node outputs
     */
    private resolveValue(
        value: unknown,
        context: NodeExecutionContext,
    ): unknown {
        if (typeof value !== 'string') return value;
        return value.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
            const segments = path.trim().split('.');
            let current: unknown = context.previousOutputs;
            for (const seg of segments) {
                if (current == null) return `{{${path}}}`;
                current = (current as Record<string, unknown>)[seg];
            }
            return current != null ? String(current) : `{{${path}}}`;
        });
    }

    validate(node: CompiledNode) {
        const customerNumber = node.config.customerNumber || node.config.customer_number;
        if (!customerNumber) {
            return {
                valid: false,
                errors: [
                    {
                        field: 'customerNumber',
                        message: 'Customer phone number is required',
                        code: 'MISSING_CUSTOMER_NUMBER',
                    },
                ],
            };
        }
        return { valid: true };
    }
}
