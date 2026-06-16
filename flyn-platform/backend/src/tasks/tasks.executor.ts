/**
 * Tasks Executor
 *
 * Workflow node executor for task management operations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../orchestrator/node-executor/base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../orchestrator/types';
import { TasksService, CreateTaskDto } from './tasks.service';

export interface TasksNodeConfig {
    operation: 'create_task' | 'update_task' | 'get_tasks' | 'delete_task';
    taskId?: string;
    entityData?: string;
    op_fields?: Record<string, unknown>;
}

@Injectable()
export class TasksExecutor extends BaseExecutor {
    private readonly logger = new Logger(TasksExecutor.name);

    readonly nodeType = 'tasks';
    readonly displayName = 'Tasks Action';
    readonly description = 'Create, update, and manage tasks and to-do lists';

    constructor(private readonly tasksService: TasksService) {
        super();
    }

    async execute(node: CompiledNode, context: NodeExecutionContext): Promise<NodeResult> {
        const config = node.config as unknown as TasksNodeConfig;
        const tenantId = context.tenantId;

        context.services.log('info', `Tasks executing operation: ${config.operation}`, { nodeId: node.id });

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
                case 'create_task': {
                    const task = await this.tasksService.createTask(tenantId, {
                        title: this.resolveValue(entityData.title as string, context.previousOutputs) || 'New Task',
                        status: (entityData.status as any) || 'todo',
                        priority: (entityData.priority as any) || 'medium',
                        dueDate: this.resolveValue(entityData.due_date as string, context.previousOutputs) || '',
                        assignee: this.resolveValue(entityData.assignee as string, context.previousOutputs) || '',
                        category: this.resolveValue(entityData.category as string, context.previousOutputs) || 'General',
                    });
                    return this.completed({ operation: 'create_task', task, message: `Task created: ${task.title}` });
                }

                case 'update_task': {
                    const id = this.resolveValue(config.taskId, context.previousOutputs) || (entityData.taskId as string);
                    if (!id) return this.failed('MISSING_TASK_ID', 'Task ID is required', false);
                    const task = await this.tasksService.updateTask(tenantId, id, entityData as any);
                    return this.completed({ operation: 'update_task', task, message: `Task updated: ${task.title}` });
                }

                case 'get_tasks': {
                    const result = await this.tasksService.getTasks(tenantId);
                    return this.completed({ operation: 'get_tasks', tasks: result.data });
                }

                case 'delete_task': {
                    const id = this.resolveValue(config.taskId, context.previousOutputs) || (entityData.taskId as string);
                    if (!id) return this.failed('MISSING_TASK_ID', 'Task ID is required', false);
                    await this.tasksService.deleteTask(tenantId, id);
                    return this.completed({ operation: 'delete_task', success: true, taskId: id });
                }

                default:
                    return this.failed('UNKNOWN_OPERATION', `Unknown tasks operation: ${config.operation}`, false);
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Tasks executor error: ${err.message}`, err.stack);
            return this.failed('TASKS_ERROR', err.message, true);
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
