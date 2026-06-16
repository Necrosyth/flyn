import { Injectable } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';

/**
 * Trigger Executor
 * 
 * Entry point for workflows. Triggers don't "execute" in the
 * traditional sense - they validate the trigger event and
 * set up initial context.
 */
@Injectable()
export class TriggerExecutor extends BaseExecutor {
    readonly nodeType = NodeType.TRIGGER;
    readonly displayName = 'Trigger';
    readonly description = 'Entry point that starts workflow execution';

    readonly defaultRetryPolicy = {
        maxAttempts: 1,
        backoffType: 'fixed' as const,
        initialDelayMs: 0,
        maxDelayMs: 0,
    };

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const { config } = node;
        const triggerType = config.triggerType as string;

        context.services.log('info', `Processing trigger: ${triggerType}`, {
            nodeId: node.id,
            triggerData: context.token.data,
        });

        // Validate trigger data based on trigger type
        const validationResult = this.validateTriggerData(triggerType, context.token.data);

        if (!validationResult.valid) {
            return this.failed(
                'TRIGGER_VALIDATION_ERROR',
                validationResult.message || 'Invalid trigger data',
                false,
                { triggerType, errors: validationResult.errors },
            );
        }

        // Transform trigger data to a consistent format
        const normalizedData = this.normalizeTriggerData(triggerType, context.token.data);

        return this.completed({
            triggerType,
            triggeredAt: new Date().toISOString(),
            data: normalizedData,
        });
    }

    private validateTriggerData(
        triggerType: string,
        data: Record<string, unknown>,
    ): { valid: boolean; message?: string; errors?: string[] } {
        switch (triggerType) {
            case 'webhook':
                return this.validateWebhookTrigger(data);
            case 'schedule':
                return { valid: true }; // Schedule triggers are always valid
            case 'manual':
                return { valid: true }; // Manual triggers are always valid
            case 'event':
                return this.validateEventTrigger(data);
            default:
                return { valid: true }; // Allow unknown triggers to pass through
        }
    }

    private validateWebhookTrigger(data: Record<string, unknown>): { valid: boolean; message?: string } {
        // Basic webhook validation
        if (!data) {
            return { valid: false, message: 'Webhook data is required' };
        }
        return { valid: true };
    }

    private validateEventTrigger(data: Record<string, unknown>): { valid: boolean; message?: string } {
        if (!data.eventType) {
            return { valid: false, message: 'Event type is required' };
        }
        return { valid: true };
    }

    private normalizeTriggerData(
        triggerType: string,
        data: Record<string, unknown>,
    ): Record<string, unknown> {
        return {
            _triggerType: triggerType,
            _receivedAt: new Date().toISOString(),
            ...data,
        };
    }
}
