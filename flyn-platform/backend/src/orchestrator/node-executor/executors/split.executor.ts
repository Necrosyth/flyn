import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';

/**
 * Split Executor
 * 
 * Creates parallel execution paths (fork).
 * Each branch runs independently and creates its own token.
 * 
 * Config:
 * - branches: string[] - IDs of the branch nodes to execute in parallel
 * - waitForAll: boolean - Whether to wait for all branches (handled by Join node)
 */
@Injectable()
export class SplitExecutor extends BaseExecutor {
    private readonly logger = new Logger(SplitExecutor.name);
    readonly nodeType = NodeType.SPLIT;
    readonly displayName = 'Split';
    readonly description = 'Forks execution into parallel paths';

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const { config } = node;
        const branches = (config.branches as string[]) || [];

        this.logger.log(`Split node ${node.id}: Creating ${branches.length} parallel branches`);

        context.services.log('info', `Forking into ${branches.length} parallel branches`, {
            nodeId: node.id,
            branches,
        });

        // The Split node completes immediately
        // The orchestrator will handle creating tokens for each branch
        // by looking at the outgoing edges
        return this.completed({
            splitAt: new Date().toISOString(),
            branchCount: branches.length,
            branches,
            // Signal to orchestrator that this is a parallel fork
            _parallelFork: true,
        });
    }

    validate(node: CompiledNode) {
        // Split node should have multiple outgoing edges
        // This is validated at the workflow level, not here
        return { valid: true };
    }
}
