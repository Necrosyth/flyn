import { Injectable } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import {
    CompiledNode,
    NodeExecutionContext,
    NodeResult,
    NodeType,
    ApprovalResumeCondition,
} from '../../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Approval Executor
 * 
 * Human-in-the-loop workflow step.
 * Creates an approval task and waits for human decision.
 * 
 * This is a special case of WAIT that:
 * - Creates an approval task record
 * - Assigns it to specific users/roles
 * - Supports escalation on timeout
 * - Resumes with approve/reject decision
 */
@Injectable()
export class ApprovalExecutor extends BaseExecutor {
    readonly nodeType = NodeType.APPROVAL;
    readonly displayName = 'Approval';
    readonly description = 'Waits for human approval before continuing';

    // No retries for approval nodes
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

        context.services.log('info', `Creating approval task`, {
            nodeId: node.id,
            config,
        });

        try {
            // Create the approval task
            const approvalTask = this.createApprovalTask(node, config, context);

            // In production, this would persist the approval task
            // and send notifications to assignees
            await this.notifyAssignees(approvalTask, context);

            const resumeCondition: ApprovalResumeCondition = {
                type: 'approval',
                approvalTaskId: approvalTask.id,
                assignedTo: approvalTask.assignedTo,
                timeout: config.timeout as number | undefined,
                timeoutAction: config.timeoutAction as 'fail' | 'escalate' | 'auto_approve' | 'auto_reject' || 'fail',
                escalateTo: config.escalateTo as string[] | undefined,
            };

            context.services.log('info', `Approval task created`, {
                nodeId: node.id,
                approvalTaskId: approvalTask.id,
                assignedTo: approvalTask.assignedTo,
            });

            return {
                status: 'WAIT',
                resumeCondition,
                partialOutput: {
                    approvalTaskId: approvalTask.id,
                    title: approvalTask.title,
                    assignedTo: approvalTask.assignedTo,
                    createdAt: new Date().toISOString(),
                },
            };
        } catch (error) {
            const err = error as Error;
            context.services.log('error', `Failed to create approval task: ${err.message}`, {
                nodeId: node.id,
            });

            return this.failed(
                'APPROVAL_SETUP_ERROR',
                err.message,
                false,
                { config },
            );
        }
    }

    private createApprovalTask(
        node: CompiledNode,
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): ApprovalTaskData {
        const taskId = uuidv4();

        // Build approval task data
        const task: ApprovalTaskData = {
            id: taskId,
            workflowRunId: context.workflowRunId,
            nodeId: node.id,

            // Task content
            title: config.title as string || `Approval Required: ${node.name}`,
            description: config.description as string || '',
            data: this.buildApprovalData(config, context),

            // Assignment
            assignedTo: this.resolveAssignees(config.assignedTo as string[], context),
            escalateTo: config.escalateTo as string[] | undefined,

            // Timing
            createdAt: new Date(),
            dueAt: config.timeout
                ? new Date(Date.now() + (config.timeout as number))
                : undefined,
        };

        return task;
    }

    private buildApprovalData(
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Record<string, unknown> {
        // Include relevant context data for the approver
        const includeFields = config.includeFields as string[] || [];
        const data: Record<string, unknown> = {};

        // Add specified fields from previous outputs
        for (const field of includeFields) {
            const value = this.getNestedValue(context.previousOutputs, field);
            if (value !== undefined) {
                data[field] = value;
            }
        }

        // Add any additional static data from config
        if (config.additionalData) {
            Object.assign(data, config.additionalData);
        }

        return data;
    }

    private resolveAssignees(
        assignees: string[],
        context: NodeExecutionContext,
    ): string[] {
        // In production, this would resolve role names to user IDs
        // and handle dynamic assignment based on context

        if (!assignees || assignees.length === 0) {
            // Default to workflow creator if no assignees specified
            return [context.variables.createdBy as string || 'admin'];
        }

        return assignees.map(assignee => {
            // Check if it's a variable reference
            if (assignee.startsWith('$')) {
                const varName = assignee.slice(1);
                return context.variables[varName] as string || assignee;
            }
            return assignee;
        });
    }

    private async notifyAssignees(
        task: ApprovalTaskData,
        context: NodeExecutionContext,
    ): Promise<void> {
        // In production, this would send notifications via:
        // - Email
        // - Push notifications
        // - Slack/Teams
        // - In-app notifications

        await context.services.emit('approval.created', {
            taskId: task.id,
            title: task.title,
            assignedTo: task.assignedTo,
            dueAt: task.dueAt,
        });
    }

    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        const tokens = path
            .replace(/\[(\d+)\]/g, '.$1')
            .replace(/\["([^"]+)"\]/g, '.$1')
            .replace(/\['([^']+)'\]/g, '.$1')
            .split('.')
            .filter(Boolean);

        return tokens.reduce((current: unknown, key) => {
            if (current === undefined || current === null) return undefined;
            if (Array.isArray(current)) {
                const idx = Number(key);
                if (Number.isInteger(idx)) return current[idx];
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
        }, obj);
    }
}

interface ApprovalTaskData {
    id: string;
    workflowRunId: string;
    nodeId: string;
    title: string;
    description: string;
    data: Record<string, unknown>;
    assignedTo: string[];
    escalateTo?: string[];
    createdAt: Date;
    dueAt?: Date;
}
