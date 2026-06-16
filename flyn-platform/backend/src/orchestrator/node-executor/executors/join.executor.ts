import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';

/**
 * Join Executor (Parallel Join / "Wait for Both")
 *
 * The orchestrator runs parallel branches sequentially in the same process.
 * All node outputs are accumulated in workflowRun.context.nodeOutputs and
 * surfaced via context.previousOutputs.
 *
 * Strategy:
 *   1. Read the `waitFor` list from config (upstream node IDs to wait for).
 *   2. Check previousOutputs for each ID.
 *   3. If NOT all present → early-arriving token; silently dead-end it
 *      (nextNodeIds: []) so the other branch keeps running.
 *   4. If ALL present → merge all branch outputs and continue downstream.
 *
 * Config:
 *   waitFor: string[]   – upstream node IDs that must have outputs
 *   strategy: 'all'     – always 'all' in this MVP
 */
@Injectable()
export class JoinExecutor extends BaseExecutor {
    private readonly logger = new Logger(JoinExecutor.name);
    readonly nodeType = NodeType.JOIN;
    readonly displayName = 'Parallel Join';
    readonly description = 'Waits for parallel branches to complete';

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const waitFor: string[] = Array.isArray(node.config.waitFor)
            ? (node.config.waitFor as string[])
            : [];

        const prev = context.previousOutputs as Record<string, unknown>;
        const ready   = waitFor.filter((id) => prev[id] !== undefined);
        const missing = waitFor.filter((id) => prev[id] === undefined);

        this.logger.log(
            `Join ${node.id}: ready=[${ready.join(', ')}]  missing=[${missing.join(', ')}]`,
        );

        if (missing.length > 0) {
            // Early arrival — silently consume this token; let other branches run.
            this.logger.log(
                `Join ${node.id}: early arrival, dead-ending token (missing: ${missing.join(', ')})`,
            );
            return {
                status: 'COMPLETED' as const,
                output: { _joinEarlyExit: true, missing },
                nextNodeIds: [],
            };
        }

        // All branches done — collect and continue.
        const branchData: Record<string, unknown> = {};
        for (const id of waitFor) {
            branchData[id] = prev[id];
        }

        this.logger.log(`Join ${node.id}: all branches ready — continuing downstream`);

        return this.completed({
            joinedAt: new Date().toISOString(),
            branchCount: waitFor.length,
            branchData,
            ...branchData, // flatten so downstream nodes can access pg_ai_1, mysql_ai_1, etc.
        });
    }
}
