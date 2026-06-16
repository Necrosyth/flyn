import { NodeExecutionContext, NodeResult } from '../types';
import { CompiledNode } from '../types';

/**
 * Base abstract class for all node executors
 * 
 * Inspired by n8n's node execution model.
 * Every node type must implement this contract.
 * 
 * The executor is responsible ONLY for:
 * - Executing the node's logic
 * - Returning a result (COMPLETED, WAIT, or FAILED)
 * 
 * The executor is NOT responsible for:
 * - Deciding the next node (handled by Graph Traversal Engine)
 * - Persisting state (handled by Workflow Runtime)
 * - Retry logic (handled by Orchestrator)
 */
export abstract class BaseExecutor {
    /**
     * The node type this executor handles
     * Must match NodeType enum value
     */
    abstract readonly nodeType: string;

    /**
     * Human-readable name for this executor
     */
    abstract readonly displayName: string;

    /**
     * Description of what this executor does
     */
    abstract readonly description: string;

    /**
     * Default retry policy for this executor type
     */
    readonly defaultRetryPolicy: RetryPolicy = {
        maxAttempts: 3,
        backoffType: 'exponential',
        initialDelayMs: 1000,
        maxDelayMs: 30000,
    };

    /**
     * Execute the node logic
     * 
     * @param node - The compiled node definition
     * @param context - Execution context with inputs and services
     * @returns Promise<NodeResult> - COMPLETED, WAIT, or FAILED
     */
    abstract execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult>;

    /**
     * Validate node configuration before execution
     * Override this to add custom validation
     * 
     * @param node - The compiled node definition
     * @returns Validation result with errors if invalid
     */
    validate(node: CompiledNode): ValidationResult {
        return { valid: true };
    }

    /**
     * Clean up resources after execution (if needed)
     * Override this for executors that need resource cleanup
     */
    async cleanup(context: NodeExecutionContext): Promise<void> {
        // Default: no cleanup needed
    }

    /**
     * Helper to create a COMPLETED result
     */
    protected completed(output: Record<string, unknown>): NodeResult {
        return {
            status: 'COMPLETED',
            output,
        };
    }

    /**
     * Helper to create a WAIT result
     */
    protected wait(
        resumeCondition: NodeResult extends { status: 'WAIT' } ? NodeResult['resumeCondition'] : never,
        partialOutput?: Record<string, unknown>,
    ): NodeResult {
        return {
            status: 'WAIT',
            resumeCondition,
            partialOutput,
        };
    }

    /**
     * Helper to create a FAILED result
     */
    protected failed(
        code: string,
        message: string,
        retryable: boolean = true,
        details?: Record<string, unknown>,
    ): NodeResult {
        return {
            status: 'FAILED',
            error: {
                code,
                message,
                retryable,
                details,
            },
        };
    }
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
    maxAttempts: number;
    backoffType: 'fixed' | 'exponential' | 'linear';
    initialDelayMs: number;
    maxDelayMs: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors?: ValidationError[];
}

export interface ValidationError {
    field: string;
    message: string;
    code: string;
}
