import { Injectable, Logger } from '@nestjs/common';
import { CompiledWorkflow, CompiledNode, CompiledEdge, NodeType } from './types';

/**
 * Validation Error
 */
interface ValidationError {
    nodeId?: string;
    edgeId?: string;
    field?: string;
    code: string;
    message: string;
    severity: 'error' | 'warning';
}

/**
 * Validation Result
 */
interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
}

/**
 * Workflow Validation Service
 * 
 * Validates compiled workflows before execution.
 * Checks for:
 * - Graph structure (no orphans, proper connections)
 * - Node configuration completeness
 * - Execution plan validity
 */
@Injectable()
export class WorkflowValidationService {
    private readonly logger = new Logger(WorkflowValidationService.name);

    /**
     * Validate a compiled workflow
     */
    validate(workflow: CompiledWorkflow): ValidationResult {
        const errors: ValidationError[] = [];
        const warnings: ValidationError[] = [];

        // Basic structure validation
        this.validateBasicStructure(workflow, errors);

        // Node validations
        this.validateNodes(workflow, errors, warnings);

        // Edge validations
        this.validateEdges(workflow, errors, warnings);

        // Execution plan validation
        this.validateExecutionPlan(workflow, errors);

        // Graph connectivity
        this.validateConnectivity(workflow, errors, warnings);

        const valid = errors.length === 0;

        if (!valid) {
            this.logger.warn(`Workflow ${workflow.id} validation failed with ${errors.length} error(s)`);
        }

        return { valid, errors, warnings };
    }

    /**
     * Quick validation check - returns boolean only
     */
    isValid(workflow: CompiledWorkflow): boolean {
        return this.validate(workflow).valid;
    }

    private validateBasicStructure(workflow: CompiledWorkflow, errors: ValidationError[]): void {
        if (!workflow.id) {
            errors.push({ code: 'MISSING_ID', message: 'Workflow ID is required', severity: 'error' });
        }

        if (!workflow.name) {
            errors.push({ code: 'MISSING_NAME', message: 'Workflow name is required', severity: 'error' });
        }

        if (!workflow.tenantId) {
            errors.push({ code: 'MISSING_TENANT', message: 'Tenant ID is required', severity: 'error' });
        }

        if (!workflow.compiled_nodes || workflow.compiled_nodes.length === 0) {
            errors.push({ code: 'NO_NODES', message: 'Workflow must have at least one node', severity: 'error' });
        }

        if (!workflow.execution_plan) {
            errors.push({ code: 'NO_EXECUTION_PLAN', message: 'Execution plan is required', severity: 'error' });
        }
    }

    private validateNodes(workflow: CompiledWorkflow, errors: ValidationError[], warnings: ValidationError[]): void {
        const nodeIds = new Set<string>();

        for (const node of workflow.compiled_nodes) {
            // Check for duplicate IDs
            if (nodeIds.has(node.id)) {
                errors.push({
                    nodeId: node.id,
                    code: 'DUPLICATE_NODE_ID',
                    message: `Duplicate node ID: ${node.id}`,
                    severity: 'error',
                });
            }
            nodeIds.add(node.id);

            // Validate node type
            if (!Object.values(NodeType).includes(node.type)) {
                errors.push({
                    nodeId: node.id,
                    code: 'INVALID_NODE_TYPE',
                    message: `Invalid node type: ${node.type}`,
                    severity: 'error',
                });
            }

            // Validate node configuration based on type
            this.validateNodeConfig(node, errors, warnings);
        }
    }

    private validateNodeConfig(node: CompiledNode, errors: ValidationError[], warnings: ValidationError[]): void {
        switch (node.type) {
            case NodeType.TRIGGER:
                if (!node.config.triggerType) {
                    errors.push({
                        nodeId: node.id,
                        field: 'triggerType',
                        code: 'MISSING_TRIGGER_TYPE',
                        message: 'Trigger node requires triggerType',
                        severity: 'error',
                    });
                }
                break;

            case NodeType.ACTION:
                if (!node.config.actionType) {
                    errors.push({
                        nodeId: node.id,
                        field: 'actionType',
                        code: 'MISSING_ACTION_TYPE',
                        message: 'Action node requires actionType',
                        severity: 'error',
                    });
                }
                break;

            case NodeType.CONDITION:
                if (!node.config.conditions && !node.config.expression) {
                    errors.push({
                        nodeId: node.id,
                        field: 'conditions',
                        code: 'MISSING_CONDITION',
                        message: 'Condition node requires conditions or expression',
                        severity: 'error',
                    });
                }
                break;

            case NodeType.WAIT:
                if (!node.config.waitType) {
                    warnings.push({
                        nodeId: node.id,
                        field: 'waitType',
                        code: 'MISSING_WAIT_TYPE',
                        message: 'Wait node should specify waitType',
                        severity: 'warning',
                    });
                }
                break;

            case NodeType.LOOP:
                if (!node.config.loopType) {
                    errors.push({
                        nodeId: node.id,
                        field: 'loopType',
                        code: 'MISSING_LOOP_TYPE',
                        message: 'Loop node requires loopType',
                        severity: 'error',
                    });
                }
                break;
        }
    }

    private validateEdges(workflow: CompiledWorkflow, errors: ValidationError[], warnings: ValidationError[]): void {
        const nodeIds = new Set(workflow.compiled_nodes.map(n => n.id));
        const edgeIds = new Set<string>();

        for (const edge of workflow.compiled_edges) {
            // Check for duplicate edge IDs
            if (edgeIds.has(edge.id)) {
                errors.push({
                    edgeId: edge.id,
                    code: 'DUPLICATE_EDGE_ID',
                    message: `Duplicate edge ID: ${edge.id}`,
                    severity: 'error',
                });
            }
            edgeIds.add(edge.id);

            // Check source node exists
            if (!nodeIds.has(edge.source)) {
                errors.push({
                    edgeId: edge.id,
                    code: 'INVALID_SOURCE',
                    message: `Edge source node not found: ${edge.source}`,
                    severity: 'error',
                });
            }

            // Check target node exists
            if (!nodeIds.has(edge.target)) {
                errors.push({
                    edgeId: edge.id,
                    code: 'INVALID_TARGET',
                    message: `Edge target node not found: ${edge.target}`,
                    severity: 'error',
                });
            }
        }
    }

    private validateExecutionPlan(workflow: CompiledWorkflow, errors: ValidationError[]): void {
        const plan = workflow.execution_plan;
        if (!plan) return;

        const nodeIds = new Set(workflow.compiled_nodes.map(n => n.id));

        // Check start node exists
        if (!nodeIds.has(plan.startNodeId)) {
            errors.push({
                code: 'INVALID_START_NODE',
                message: `Start node not found: ${plan.startNodeId}`,
                severity: 'error',
            });
        }

        // Check end nodes exist
        for (const endNodeId of plan.endNodeIds) {
            if (!nodeIds.has(endNodeId)) {
                errors.push({
                    code: 'INVALID_END_NODE',
                    message: `End node not found: ${endNodeId}`,
                    severity: 'error',
                });
            }
        }

        // Check node order references valid nodes
        for (const nodeId of plan.nodeOrder) {
            if (!nodeIds.has(nodeId)) {
                errors.push({
                    code: 'INVALID_NODE_ORDER',
                    message: `Node in execution order not found: ${nodeId}`,
                    severity: 'error',
                });
            }
        }
    }

    private validateConnectivity(workflow: CompiledWorkflow, errors: ValidationError[], warnings: ValidationError[]): void {
        const nodeIds = new Set(workflow.compiled_nodes.map(n => n.id));
        const connectedNodes = new Set<string>();
        const startNodeId = workflow.execution_plan?.startNodeId;

        if (!startNodeId) return;

        // Build adjacency list
        const adjacency = new Map<string, string[]>();
        for (const edge of workflow.compiled_edges) {
            if (!adjacency.has(edge.source)) {
                adjacency.set(edge.source, []);
            }
            adjacency.get(edge.source)!.push(edge.target);
        }

        // BFS from start node
        const queue = [startNodeId];
        while (queue.length > 0) {
            const nodeId = queue.shift()!;
            if (connectedNodes.has(nodeId)) continue;
            connectedNodes.add(nodeId);

            const neighbors = adjacency.get(nodeId) || [];
            queue.push(...neighbors);
        }

        // Check for orphan nodes
        for (const nodeId of nodeIds) {
            if (!connectedNodes.has(nodeId) && nodeId !== startNodeId) {
                warnings.push({
                    nodeId,
                    code: 'ORPHAN_NODE',
                    message: `Node is not reachable from start: ${nodeId}`,
                    severity: 'warning',
                });
            }
        }

        // Check trigger node is the start
        const triggerNodes = workflow.compiled_nodes.filter(n => n.type === NodeType.TRIGGER);
        if (triggerNodes.length > 0 && triggerNodes[0].id !== startNodeId) {
            warnings.push({
                nodeId: triggerNodes[0].id,
                code: 'TRIGGER_NOT_START',
                message: 'Trigger node should typically be the start node',
                severity: 'warning',
            });
        }
    }
}
