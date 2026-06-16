import { Injectable, Logger } from '@nestjs/common';
import {
    CompiledWorkflow,
    CompiledNode,
    CompiledEdge,
    ExecutionToken,
    TokenStatus,
    NodeResult,
    EdgeCondition,
    NodeType,
} from '../types';

/**
 * Graph Traversal Service
 * 
 * Handles moving execution tokens through the workflow graph.
 * Inspired by bpmn-engine's token-based execution model.
 * 
 * Responsibilities:
 * - Route tokens to next nodes based on edge conditions
 * - Handle parallel paths (split/join)
 * - Manage token lifecycle
 */
@Injectable()
export class GraphTraversalService {
    private readonly logger = new Logger(GraphTraversalService.name);

    /**
     * Get the next nodes to execute based on current node and result
     */
    getNextNodes(
        workflow: CompiledWorkflow,
        currentNodeId: string,
        result: NodeResult,
        context: Record<string, unknown>,
    ): string[] {
        // If the result specifies next nodes, use those (for condition nodes)
        if (result.status === 'COMPLETED' && result.nextNodeIds) {
            this.logger.debug(`Using result-specified next nodes: ${result.nextNodeIds.join(', ')}`);
            return result.nextNodeIds;
        }

        // Otherwise, find outgoing edges from current node
        const outgoingEdges = this.getOutgoingEdges(workflow, currentNodeId);

        if (outgoingEdges.length === 0) {
            this.logger.debug(`No outgoing edges from node: ${currentNodeId}`);
            return [];
        }

        // ── Iterator / Loop special routing by sourceHandle ────────────────
        // Loop nodes have two outgoing edges tagged by sourceHandle:
        //   loop_body      → execute for this iteration
        //   loop_complete  → all iterations done
        // We filter here so both edges aren't fired simultaneously.
        const currentNode = this.getNode(workflow, currentNodeId);
        if (
            result.status === 'COMPLETED' &&
            (currentNode?.type === 'iterator' || currentNode?.type === 'loop')
        ) {
            const output = result.output as Record<string, unknown>;
            if (output._loopContinue) {
                const bodyEdge = outgoingEdges.find(
                    (e) => e.sourceHandle === 'loop_body' || (!e.sourceHandle && e.target !== this.findLoopCompleteTarget(outgoingEdges)),
                );
                if (bodyEdge) return [bodyEdge.target];
            }
            if (output._loopEnd) {
                const doneEdge = outgoingEdges.find((e) => e.sourceHandle === 'loop_complete');
                if (doneEdge) return [doneEdge.target];
            }
        }

        // ── Decision node routing by sourceHandle ──────────────────────────
        // Decision nodes have two outgoing edges tagged by sourceHandle:
        //   true   → condition matched
        //   false  → condition did not match
        if (result.status === 'COMPLETED' && currentNode?.type === NodeType.DECISION) {
            const output = result.output as Record<string, unknown>;
            const handle = output.matched ? 'true' : 'false';
            const edge = outgoingEdges.find((e) => e.sourceHandle === handle);
            if (edge) return [edge.target];
            // No sourceHandle-tagged edge — fall through to normal edge evaluation
        }

        // Evaluate edge conditions
        const matchingEdges = this.evaluateEdgeConditions(outgoingEdges, context);
        const nextNodeIds = matchingEdges.map(edge => edge.target);

        this.logger.debug(`Next nodes from ${currentNodeId}: ${nextNodeIds.join(', ') || 'none'}`);
        return nextNodeIds;
    }

    /**
     * Helper: find the target of the loop_complete edge so we can exclude it when
     * picking the loop_body edge (when sourceHandle might not be set).
     */
    private findLoopCompleteTarget(edges: CompiledEdge[]): string | undefined {
        return edges.find((e) => e.sourceHandle === 'loop_complete')?.target;
    }

    /**
     * Get all outgoing edges from a node
     */
    getOutgoingEdges(workflow: CompiledWorkflow, nodeId: string): CompiledEdge[] {
        return workflow.compiled_edges.filter(edge => edge.source === nodeId);
    }

    /**
     * Get all incoming edges to a node
     */
    getIncomingEdges(workflow: CompiledWorkflow, nodeId: string): CompiledEdge[] {
        return workflow.compiled_edges.filter(edge => edge.target === nodeId);
    }

    /**
     * Get a node by ID
     */
    getNode(workflow: CompiledWorkflow, nodeId: string): CompiledNode | undefined {
        return workflow.compiled_nodes.find(node => node.id === nodeId);
    }

    /**
     * Check if a node is an end node
     */
    isEndNode(workflow: CompiledWorkflow, nodeId: string): boolean {
        const outgoingEdges = this.getOutgoingEdges(workflow, nodeId);
        return outgoingEdges.length === 0 ||
            workflow.execution_plan.endNodeIds.includes(nodeId);
    }

    /**
     * Check if a node is a join node (multiple incoming edges)
     */
    isJoinNode(workflow: CompiledWorkflow, nodeId: string): boolean {
        const incomingEdges = this.getIncomingEdges(workflow, nodeId);
        return incomingEdges.length > 1;
    }

    /**
     * Check if a node is a split node (multiple outgoing edges without conditions)
     */
    isSplitNode(workflow: CompiledWorkflow, nodeId: string): boolean {
        const outgoingEdges = this.getOutgoingEdges(workflow, nodeId);
        const node = this.getNode(workflow, nodeId);

        // It's a split if there are multiple outgoing edges and it's a SPLIT node type
        return outgoingEdges.length > 1 && node?.type === 'split';
    }

    /**
     * Evaluate edge conditions and return matching edges
     */
    private evaluateEdgeConditions(
        edges: CompiledEdge[],
        context: Record<string, unknown>,
    ): CompiledEdge[] {
        // Separate conditional and default edges
        const conditionalEdges = edges.filter(e => e.condition && e.condition.type !== 'default');
        const defaultEdge = edges.find(e => !e.condition || e.condition.type === 'default');

        // If no conditions, return all edges (parallel execution)
        if (conditionalEdges.length === 0) {
            return edges;
        }

        // Evaluate conditional edges
        const matchingEdges = conditionalEdges.filter(edge =>
            this.evaluateCondition(edge.condition!, context)
        );

        // If no conditions matched and there's a default, use it
        if (matchingEdges.length === 0 && defaultEdge) {
            return [defaultEdge];
        }

        return matchingEdges;
    }

    /**
     * Evaluate a single edge condition
     */
    private evaluateCondition(
        condition: EdgeCondition,
        context: Record<string, unknown>,
    ): boolean {
        switch (condition.type) {
            case 'expression':
                return this.evaluateExpression(condition.expression || '', context);

            case 'ai_confidence':
                return this.evaluateAiConfidence(condition, context);

            case 'approval_result':
                return this.evaluateApprovalResult(condition, context);

            case 'default':
                return true;

            default:
                this.logger.warn(`Unknown condition type: ${condition.type}`);
                return false;
        }
    }

    private evaluateExpression(expression: string, context: Record<string, unknown>): boolean {
        try {
            // Very basic expression evaluation
            // In production, use a proper expression engine
            const match = expression.match(/^(\w+(?:\.\w+)*)\s*(===?|!==?|>=?|<=?)\s*(.+)$/);

            if (match) {
                const [, path, op, valueStr] = match;
                let fieldValue = this.getNestedValue(context, path);
                let compareValue: unknown;

                try {
                    compareValue = JSON.parse(valueStr);
                } catch {
                    compareValue = valueStr.replace(/^["']|["']$/g, '');
                }

                // Type coercion for numeric comparisons
                if (['>', '>=', '<', '<='].includes(op)) {
                    if (typeof fieldValue === 'string' && !isNaN(Number(fieldValue))) {
                        fieldValue = Number(fieldValue);
                    }
                    if (typeof compareValue === 'string' && !isNaN(Number(compareValue))) {
                        compareValue = Number(compareValue);
                    }
                }

                return this.compare(fieldValue, op, compareValue);
            }

            return false;
        } catch (error) {
            this.logger.error(`Expression evaluation failed: ${expression}`, error);
            return false;
        }
    }

    private evaluateAiConfidence(condition: EdgeCondition, context: Record<string, unknown>): boolean {
        const confidence = this.getNestedValue(context, 'confidence') as number;
        const threshold = condition.threshold || 0.8;
        const op = condition.comparisonOperator || '>=';

        if (typeof confidence !== 'number') {
            return false;
        }

        return this.compare(confidence, op, threshold);
    }

    private evaluateApprovalResult(condition: EdgeCondition, context: Record<string, unknown>): boolean {
        const approvalResult = this.getNestedValue(context, 'approval.decision');
        return approvalResult === condition.value;
    }

    private compare(left: unknown, op: string, right: unknown): boolean {
        switch (op) {
            case '==':
            case '===':
                return left === right;
            case '!=':
            case '!==':
                return left !== right;
            case '>':
                return (left as number) > (right as number);
            case '>=':
                return (left as number) >= (right as number);
            case '<':
                return (left as number) < (right as number);
            case '<=':
                return (left as number) <= (right as number);
            default:
                return false;
        }
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

    /**
     * Check if all incoming tokens have arrived at a join node
     */
    shouldExecuteJoinNode(
        workflow: CompiledWorkflow,
        nodeId: string,
        arrivedTokens: ExecutionToken[],
    ): boolean {
        const incomingEdges = this.getIncomingEdges(workflow, nodeId);
        const expectedSourceNodes = incomingEdges.map(e => e.source);

        const arrivedSourceNodes = arrivedTokens
            .filter(t => t.status === TokenStatus.ACTIVE || t.status === TokenStatus.WAITING)
            .map(t => t.visitedNodes[t.visitedNodes.length - 1])
            .filter(Boolean);

        // Check if we have a token from each incoming edge source
        return expectedSourceNodes.every(source =>
            arrivedSourceNodes.includes(source)
        );
    }
}
