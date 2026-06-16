import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';

/**
 * End Executor
 * 
 * Marks the termination of a workflow path.
 * Aggregates final outputs and signals workflow completion.
 * 
 * Config:
 * - outputMapping: Record<string, string> - Map final output keys
 * - includeAllOutputs: boolean - Include all previous node outputs (default: false)
 */
@Injectable()
export class EndExecutor extends BaseExecutor {
    private readonly logger = new Logger(EndExecutor.name);
    readonly nodeType = NodeType.END;
    readonly displayName = 'End';
    readonly description = 'Terminates the workflow and produces final output';

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const { config } = node;
        const outputMapping = (config.outputMapping as Record<string, string>) || {};
        const includeAllOutputs = config.includeAllOutputs === true;

        this.logger.log(`End node ${node.id}: Terminating workflow path`);

        // Build final output
        let finalOutput: Record<string, unknown> = {};

        if (includeAllOutputs) {
            // Include all previous outputs
            finalOutput = { ...context.previousOutputs };
        }

        // Apply output mapping
        if (Object.keys(outputMapping).length > 0) {
            for (const [sourceKey, targetKey] of Object.entries(outputMapping)) {
                const value = this.getNestedValue(context.previousOutputs, sourceKey);
                if (value !== undefined) {
                    finalOutput[targetKey] = value;
                }
            }
        }

        // If no mapping and not including all, use last node output
        if (Object.keys(finalOutput).length === 0) {
            const tokenData = context.token.data;
            finalOutput = {
                lastNodeOutput: tokenData,
            };
        }

        context.services.log('info', `Workflow path terminated`, {
            nodeId: node.id,
            outputKeys: Object.keys(finalOutput),
        });

        return this.completed({
            endedAt: new Date().toISOString(),
            finalOutput,
            // Signal that this path has terminated
            _workflowEnd: true,
        });
    }

    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        const tokens = path
            .replace(/\[(\d+)\]/g, '.$1')
            .replace(/\["([^"]+)"\]/g, '.$1')
            .replace(/\['([^']+)'\]/g, '.$1')
            .split('.')
            .filter(Boolean);

        return tokens.reduce((current, key) => {
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
        }, obj as unknown);
    }
}
