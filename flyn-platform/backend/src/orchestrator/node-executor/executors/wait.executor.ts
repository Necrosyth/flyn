import { Injectable } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import {
    CompiledNode,
    NodeExecutionContext,
    NodeResult,
    NodeType,
    TimeResumeCondition,
    EventResumeCondition,
} from '../../types';

/**
 * Wait Executor
 * 
 * Pauses workflow execution and registers a resume condition.
 * This is the core of Temporal-inspired durable execution.
 * 
 * The workflow will resume when:
 * - A specific time is reached
 * - An external event is received
 * - A timeout occurs
 * 
 * NO POLLING - event-driven resumption only.
 */
@Injectable()
export class WaitExecutor extends BaseExecutor {
    readonly nodeType = NodeType.WAIT;
    readonly displayName = 'Wait';
    readonly description = 'Pauses workflow until a condition is met';

    // No retries for wait nodes - they just pause
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
        const waitType = config.waitType as WaitType;

        context.services.log('info', `Setting up wait condition: ${waitType}`, {
            nodeId: node.id,
            config,
        });

        try {
            const resumeCondition = this.buildResumeCondition(waitType, config, context);

            context.services.log('info', `Wait condition registered`, {
                nodeId: node.id,
                resumeCondition,
            });

            return {
                status: 'WAIT',
                resumeCondition,
                partialOutput: {
                    waitType,
                    registeredAt: new Date().toISOString(),
                    nodeId: node.id,
                },
            };
        } catch (error) {
            const err = error as Error;
            context.services.log('error', `Failed to set up wait condition: ${err.message}`, {
                nodeId: node.id,
            });

            return this.failed(
                'WAIT_SETUP_ERROR',
                err.message,
                false,
                { waitType, config },
            );
        }
    }

    private buildResumeCondition(
        waitType: WaitType,
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): TimeResumeCondition | EventResumeCondition {
        switch (waitType) {
            case 'duration':
                return this.buildDurationCondition(config);

            case 'until':
                return this.buildUntilCondition(config);

            case 'event':
                return this.buildEventCondition(config);

            case 'user_reply':
                return this.buildUserReplyCondition(config, context);

            case 'call_end':
                return this.buildCallEndCondition(config, context);

            default:
                throw new Error(`Unknown wait type: ${waitType}`);
        }
    }

    /**
     * Wait for a duration (e.g., "wait 2 hours")
     */
    private buildDurationCondition(config: Record<string, unknown>): TimeResumeCondition {
        const duration = config.duration as number; // in milliseconds
        const unit = config.unit as string || 'ms';

        let durationMs = duration;
        switch (unit) {
            case 'seconds':
            case 's':
                durationMs = duration * 1000;
                break;
            case 'minutes':
            case 'm':
                durationMs = duration * 60 * 1000;
                break;
            case 'hours':
            case 'h':
                durationMs = duration * 60 * 60 * 1000;
                break;
            case 'days':
            case 'd':
                durationMs = duration * 24 * 60 * 60 * 1000;
                break;
        }

        const resumeAt = new Date(Date.now() + durationMs);

        return {
            type: 'time',
            resumeAt,
            timerId: `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        };
    }

    /**
     * Wait until a specific time (e.g., "wait until 9am tomorrow")
     */
    private buildUntilCondition(config: Record<string, unknown>): TimeResumeCondition {
        const untilTime = config.until as string; // ISO date string
        const resumeAt = new Date(untilTime);

        if (resumeAt <= new Date()) {
            throw new Error('Resume time must be in the future');
        }

        return {
            type: 'time',
            resumeAt,
            timerId: `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        };
    }

    /**
     * Wait for an event (generic event type)
     */
    private buildEventCondition(config: Record<string, unknown>): EventResumeCondition {
        const eventType = config.eventType as string;
        const eventFilter = config.eventFilter as Record<string, unknown> | undefined;
        const timeout = config.timeout as number | undefined;
        const timeoutAction = config.timeoutAction as 'fail' | 'continue' || 'fail';

        return {
            type: 'event',
            eventType,
            eventFilter,
            timeout,
            timeoutAction,
        };
    }

    /**
     * Wait for user reply (WhatsApp, SMS, etc.)
     */
    private buildUserReplyCondition(
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): EventResumeCondition {
        const channel = config.channel as string || 'any';
        const contactId = config.contactId as string || context.variables.contactId as string;
        const timeout = config.timeout as number; // in milliseconds
        const timeoutAction = config.timeoutAction as 'fail' | 'continue' || 'continue';

        return {
            type: 'event',
            eventType: 'message.received',
            eventFilter: {
                channel,
                contactId,
            },
            timeout,
            timeoutAction,
        };
    }

    /**
     * Wait for voice call to end
     */
    private buildCallEndCondition(
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): EventResumeCondition {
        const callId = config.callId as string || context.variables.callId as string;
        const timeout = config.timeout as number || 3600000; // Default 1 hour

        return {
            type: 'event',
            eventType: 'call.ended',
            eventFilter: {
                callId,
            },
            timeout,
            timeoutAction: 'fail',
        };
    }
}

type WaitType = 'duration' | 'until' | 'event' | 'user_reply' | 'call_end';
