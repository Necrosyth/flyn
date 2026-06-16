import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BaseExecutor } from './base-executor';
import { NodeType } from '../types';

/**
 * Central registry for all node executors
 * 
 * Inspired by n8n's node registry pattern.
 * This is the single source of truth for:
 * - What node types are available
 * - Which executor handles each type
 * 
 * Executors register themselves via dependency injection.
 */
@Injectable()
export class ExecutorRegistryService implements OnModuleInit {
    private readonly logger = new Logger(ExecutorRegistryService.name);
    private readonly registry = new Map<string, BaseExecutor>();

    onModuleInit() {
        this.logger.log(
            `Executor Registry initialized with ${this.registry.size} executors`,
        );
        this.logRegisteredExecutors();
    }

    /**
     * Register an executor for a node type
     * Called by executor modules during initialization
     */
    register(executor: BaseExecutor): void {
        if (this.registry.has(executor.nodeType)) {
            this.logger.warn(
                `Overwriting executor for node type: ${executor.nodeType}`,
            );
        }
        this.registry.set(executor.nodeType, executor);
        this.logger.debug(
            `Registered executor: ${executor.displayName} (${executor.nodeType})`,
        );
    }

    /**
     * Register an executor under an additional alias type string.
     * Used for backward-compat when a node type was renamed.
     */
    registerAlias(alias: string, executor: BaseExecutor): void {
        this.registry.set(alias, executor);
        this.logger.debug(`Registered alias '${alias}' → ${executor.displayName}`);
    }

    /**
     * Get the executor for a specific node type
     * @throws Error if no executor is registered for the type
     */
    get(nodeType: string): BaseExecutor {
        const executor = this.registry.get(nodeType);
        if (!executor) {
            throw new Error(
                `No executor registered for node type: ${nodeType}. ` +
                `Available types: ${this.getAvailableTypes().join(', ')}`,
            );
        }
        return executor;
    }

    /**
     * Check if an executor exists for a node type
     */
    has(nodeType: string): boolean {
        return this.registry.has(nodeType);
    }

    /**
     * Get all registered node types
     */
    getAvailableTypes(): string[] {
        return Array.from(this.registry.keys());
    }

    /**
     * Get all registered executors
     */
    getAllExecutors(): BaseExecutor[] {
        return Array.from(this.registry.values());
    }

    /**
     * Get executor metadata for UI/documentation
     */
    getExecutorMetadata(): ExecutorMetadata[] {
        return this.getAllExecutors().map((executor) => ({
            nodeType: executor.nodeType,
            displayName: executor.displayName,
            description: executor.description,
            retryPolicy: executor.defaultRetryPolicy,
        }));
    }

    private logRegisteredExecutors(): void {
        const executors = this.getAllExecutors();
        if (executors.length === 0) {
            this.logger.warn('No executors registered!');
            return;
        }

        this.logger.log('Registered executors:');
        executors.forEach((executor) => {
            this.logger.log(`  - ${executor.nodeType}: ${executor.displayName}`);
        });
    }
}

/**
 * Executor metadata for external use
 */
export interface ExecutorMetadata {
    nodeType: string;
    displayName: string;
    description: string;
    retryPolicy: {
        maxAttempts: number;
        backoffType: string;
        initialDelayMs: number;
        maxDelayMs: number;
    };
}
