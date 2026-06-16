/**
 * Orchestrator Service
 * --------------------
 * Frontend API client for the FSD1 Automation Orchestrator backend.
 * Handles workflow execution, status tracking, and resumption.
 */

import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';
import { CompiledWorkflow } from '@/utils/flowCompiler';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkflowRun {
    id: string;
    workflowId: string;
    status: WorkflowRunStatus;
    currentNodes: string[];
    context: {
        variables: Record<string, unknown>;
        nodeOutputs: Record<string, unknown>;
    };
    startedAt: string;
    completedAt?: string;
    error?: {
        nodeId: string;
        message: string;
        code: string;
    };
}

export type WorkflowRunStatus =
    | 'pending'
    | 'running'
    | 'waiting'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface NodeRunHistory {
    nodeId: string;
    status: string;
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: { code: string; message: string };
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
}

export interface ExecuteWorkflowResponse {
    message: string;
    workflowRunId: string;
    status: WorkflowRunStatus;
    currentNodes?: string[];
    context?: {
        nodeOutputs?: Record<string, unknown>;
        [key: string]: unknown;
    };
}

export interface ExecutionHistoryResponse {
    workflowRunId: string;
    nodeRuns: NodeRunHistory[];
}

// ============================================================================
// API CLIENT
// ============================================================================

class OrchestratorApiClient {
    private baseUrl = `${API_BASE_URL}/orchestrator`;

    /**
     * Execute the test workflow (for debugging)
     */
    async executeTestWorkflow(data?: Record<string, unknown>): Promise<ExecuteWorkflowResponse> {
        const response = await authedFetch(`${this.baseUrl}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || 'Failed to execute test workflow');
        }

        return response.json();
    }

    /**
     * Execute a compiled workflow from the visual builder
     */
    async executeWorkflow(
        workflow: CompiledWorkflow,
        triggerData?: Record<string, unknown>
    ): Promise<ExecuteWorkflowResponse> {
        // Transform frontend CompiledWorkflow to backend format
        const backendWorkflow = this.transformToBackendFormat(workflow);

        const response = await authedFetch(`${this.baseUrl}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                workflow: backendWorkflow,
                triggerData: triggerData || {},
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || 'Failed to execute workflow');
        }

        return response.json();
    }

    /**
     * Get workflow run status
     */
    async getWorkflowRun(runId: string): Promise<WorkflowRun> {
        const response = await authedFetch(`${this.baseUrl}/run/${runId}`);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || 'Failed to get workflow run');
        }

        return response.json();
    }

    /**
     * Get execution history for a workflow run
     */
    async getExecutionHistory(runId: string): Promise<ExecutionHistoryResponse> {
        const response = await authedFetch(`${this.baseUrl}/run/${runId}/history`);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || 'Failed to get execution history');
        }

        return response.json();
    }

    /**
     * Resume a waiting workflow
     */
    async resumeWorkflow(
        runId: string,
        resumeData?: Record<string, unknown>
    ): Promise<{ message: string; workflowRunId: string; status: string }> {
        const response = await authedFetch(`${this.baseUrl}/run/${runId}/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resumeData }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || 'Failed to resume workflow');
        }

        return response.json();
    }

    /**
     * Transform frontend CompiledWorkflow to backend CompiledWorkflow format
     */
    private transformToBackendFormat(frontendWorkflow: CompiledWorkflow) {
        // Find trigger nodes and end nodes
        const triggerNodes = frontendWorkflow.nodes.filter(n => n.type === 'trigger');
        const startNodeId = triggerNodes.length > 0 ? triggerNodes[0].id : frontendWorkflow.nodes[0]?.id;

        // Nodes with no outgoing edges are end nodes
        const nodesWithOutgoing = new Set(frontendWorkflow.edges.map(e => e.source));
        const endNodeIds = frontendWorkflow.nodes
            .filter(n => !nodesWithOutgoing.has(n.id))
            .map(n => n.id);

        return {
            id: frontendWorkflow.workflow_id,
            name: `Workflow ${frontendWorkflow.workflow_id}`,
            version: frontendWorkflow.version,
            tenantId: localStorage.getItem('tenantId') || 'default-tenant',
            compiled_nodes: frontendWorkflow.nodes.map(node => ({
                id: node.id,
                type: this.mapNodeType(node.type),
                name: node.type.charAt(0).toUpperCase() + node.type.slice(1),
                config: this.transformNodeConfig(node.type, node.config, node.id, frontendWorkflow.edges),
                position: node.position,
            })),
            compiled_edges: frontendWorkflow.edges.map(edge => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                // Prefer the logical routing handle stored on import (conditionHandle)
                // over the visual sourceHandle, which is always null on generic nodes.
                sourceHandle: (edge.data as { conditionHandle?: string } | null | undefined)?.conditionHandle ?? edge.sourceHandle ?? undefined,
            })),
            execution_plan: {
                startNodeId,
                endNodeIds,
                nodeOrder: frontendWorkflow.nodes.map(n => n.id),
                parallelPaths: [],
            },
            metadata: {
                createdAt: new Date(frontendWorkflow.created_at),
                updatedAt: new Date(),
                createdBy: 'visual-builder',
                description: 'Created from Visual Workflow Builder',
            },
        };
    }

    /**
     * Map frontend node types to backend node types
     */
    private mapNodeType(frontendType: string): string {
        const typeMap: Record<string, string> = {
            'decision': 'condition',
            'iterator': 'loop',
            // ai_decision has its own backend executor — no remapping needed
        };
        return typeMap[frontendType] || frontendType;
    }

    /**
     * Transform node config from frontend snake_case to backend camelCase
     */
    private transformNodeConfig(
        nodeType: string,
        config: Record<string, unknown>,
        nodeId?: string,
        edges?: Array<{ source: string; target: string; sourceHandle: string | null }>
    ): Record<string, unknown> {
        switch (nodeType) {
            case 'trigger':
                return {
                    triggerType: config.trigger_type || 'manual',
                    eventName: config.event_name,
                    description: config.description,
                };

            case 'action': {
                // Map frontend action types to backend action types
                let actionType = config.action_type || 'log';
                if (actionType === 'webhook') {
                    actionType = 'http_request'; // Backend expects 'http_request'
                }

                // For HTTP requests, map 'target' to 'url' and 'payload' to 'body'
                if (actionType === 'http_request') {
                    let body: unknown = undefined;
                    if (config.payload) {
                        try {
                            body = JSON.parse(config.payload as string);
                        } catch {
                            body = { message: config.payload };
                        }
                    }

                    let headers: Record<string, string> = {};
                    if (config.headers) {
                        try {
                            headers = JSON.parse(config.headers as string);
                        } catch {
                            console.warn('Invalid headers JSON, ignoring');
                        }
                    }

                    let queryParams: Record<string, string> = {};
                    if (config.query_params) {
                        try {
                            queryParams = JSON.parse(config.query_params as string);
                        } catch {
                            console.warn('Invalid query params JSON, ignoring');
                        }
                    }

                    return {
                        actionType,
                        url: config.target,
                        method: config.method || 'GET',
                        body,
                        headers,
                        queryParams,
                        subject: config.subject,
                        retryPolicy: config.retry_policy,
                    };
                }

                if (actionType === 'transform') {
                    return {
                        actionType: 'transform',
                        transformType: config.transform_type || 'script',
                        keys: typeof config.transform_keys === 'string'
                            ? (config.transform_keys as string).split(',').map(s => s.trim())
                            : [],
                        script: config.script,
                        retryPolicy: config.retry_policy,
                    };
                }

                return {
                    actionType,
                    to: config.target,        // Backend expects 'to', frontend uses 'target'
                    from: config.from,        // Sender email (email action)
                    isHtml: config.is_html || false,
                    subject: config.subject,
                    body: config.payload,      // Backend expects 'body', frontend uses 'payload'
                    message: config.payload,   // Slack uses 'message'
                    channel: config.target,    // Slack uses 'channel'
                    retryPolicy: config.retry_policy,
                    script: config.script,     // Transform actions use custom JS script
                };

            }

            case 'wait': {
                const waitType = (config.wait_type as string) || 'duration';
                
                // Map frontend wait types to backend
                let backendWaitType = waitType;
                if (waitType === 'signal') {
                    backendWaitType = 'event';
                } else if (waitType === 'datetime') {
                    backendWaitType = 'until';
                }

                return {
                    waitType: backendWaitType,
                    // duration
                    duration: config.duration_value || 5,
                    unit: config.duration_unit || 'seconds',
                    // event/signal
                    eventType: config.signal_name,
                    // until — executor reads `until`, not `datetime`
                    until: config.datetime,
                    // user_reply
                    channel: config.channel,
                    contactId: config.contact_id,     // executor reads contactId, not conversationId
                    // call_end
                    callId: config.call_id,
                    // timeout — executor reads timeoutAction, not onTimeout
                    timeout: config.timeout_enabled ? ((config.timeout_hours as number) || 24) * 60 * 60 * 1000 : undefined,
                    timeoutAction: config.timeout_enabled ? (config.timeout_action || 'fail') : undefined,
                };
            }

            case 'decision': {
                // Map frontend operator names to backend symbols
                const operatorMap: Record<string, string> = {
                    'equals': '==',
                    'not_equals': '!=',
                    'greater_than': '>',
                    'less_than': '<',
                    'greater_or_equal': '>=',
                    'less_or_equal': '<=',
                    'contains': 'contains',
                    'starts_with': 'startsWith',
                };
                const backendOperator = operatorMap[config.operator as string] || config.operator || '==';

                // Resolve targetNodeId from edges:
                // The 'true' sourceHandle edge target = where the condition routes on match
                // The 'false' sourceHandle edge target = defaultPath (fallback)
                let trueTargetNodeId: string | undefined;
                let falseTargetNodeId: string | null = null;

                if (nodeId && edges) {
                    const nodeEdges = edges.filter(e => e.source === nodeId);
                    const trueEdge = nodeEdges.find(e => e.sourceHandle === 'true');
                    const falseEdge = nodeEdges.find(e => e.sourceHandle === 'false');
                    trueTargetNodeId = trueEdge?.target;
                    falseTargetNodeId = falseEdge?.target || null;
                }

                return {
                    conditionType: config.condition_type || 'expression',
                    conditions: [
                        {
                            type: config.condition_type === 'field_exists' ? 'exists' : 'field_comparison',
                            field: config.field_name,
                            operator: backendOperator,
                            value: config.compare_value,
                            targetNodeId: trueTargetNodeId,
                        },
                    ],
                    defaultPath: falseTargetNodeId,
                };
            }

            case 'ai_decision': {
                // AI Decision uses its own executor (AiDecisionExecutor) — not remapped to condition.
                // The executor returns output.matched (boolean) so graph traversal can pick
                // the 'true' or 'false' edge just like a standard Decision node.
                return {
                    prompt: config.prompt,
                    aiTask: config.ai_task,
                    // Convert 0-100 range to 0-100 (executor expects 0-100, not 0-1)
                    confidenceThreshold: config.confidence_threshold ?? 80,
                    fallbackAction: config.fallback_action || 'human_review',
                    model: config.model,
                };
            }

            case 'query_records': {
                return {
                    resource: config.resource || 'contacts',
                    operation: config.operation || 'list',
                    limit: config.limit || 10,
                    filter_field: config.filter_field,
                    filter_value: config.filter_value,
                    sort_by: config.sort_by,
                    sort_order: config.sort_order || 'desc',
                };
            }

            case 'approval': {
                // Backend reads config.assignedTo as a flat string[]
                let assignedTo: string[] = [];

                if (config.approvers) {
                    assignedTo = typeof config.approvers === 'string'
                        ? (config.approvers as string).split(',').map((s: string) => s.trim())
                        : (config.approvers as string[]);
                }

                // Add roles to assignedTo as well (backend treats them all the same)
                if (config.approver_roles) {
                    const roles = typeof config.approver_roles === 'string'
                        ? (config.approver_roles as string).split(',').map((s: string) => s.trim())
                        : (config.approver_roles as string[]);
                    assignedTo = [...assignedTo, ...roles];
                }

                // Map approval_type to requiredApprovals number
                let requiredApprovals = 1;
                if (config.approval_type === 'all') {
                    requiredApprovals = assignedTo.length || 1;
                } else if (config.approval_type === 'majority') {
                    requiredApprovals = Math.ceil((assignedTo.length || 1) / 2);
                } else if (config.approval_type === 'any') {
                    requiredApprovals = 1;
                }

                // Parse timeout from hours to milliseconds
                const timeoutConfig = config.timeout_config as Record<string, unknown> | undefined;
                let timeout: number | undefined;
                let timeoutAction: string | undefined;
                if (timeoutConfig?.timeout_enabled) {
                    timeout = ((timeoutConfig.timeout_hours as number) || 24) * 60 * 60 * 1000;
                    timeoutAction = (timeoutConfig.timeout_action as string) || 'fail';
                }

                return {
                    title: config.title,
                    description: config.message,
                    assignedTo,
                    requiredApprovals,
                    timeout,
                    timeoutAction,
                };
            }

            case 'ai_router': {
                // Parse JSON fields
                let outputSchema;
                if (config.output_schema) {
                    try {
                        outputSchema = JSON.parse(config.output_schema as string);
                    } catch {
                        console.warn('Invalid output_schema JSON');
                    }
                }

                let nextNodeMapping;
                if (config.routing_map) {
                    try {
                        nextNodeMapping = JSON.parse(config.routing_map as string);
                    } catch {
                        console.warn('Invalid routing_map JSON');
                    }
                }

                return {
                    task: config.task || config.ai_task || 'custom',
                    prompt: config.prompt,
                    confidenceThreshold: (config.confidence_threshold as number) / 100,
                    outputSchema,
                    fallbackAction: config.fallback_action || 'ask_human',
                    nextNodeMapping,
                    systemPrompt: config.system_prompt,
                    contextCollections: config.context_collections,
                };
            }

            case 'mongodb': {
                // Parse JSON string fields into objects
                let query, projection, sort;

                if (config.query) {
                    try {
                        query = JSON.parse(config.query as string);
                    } catch {
                        console.warn('Invalid MongoDB query JSON');
                    }
                }

                if (config.projection) {
                    try {
                        projection = JSON.parse(config.projection as string);
                    } catch {
                        console.warn('Invalid projection JSON');
                    }
                }

                if (config.sort) {
                    try {
                        sort = JSON.parse(config.sort as string);
                    } catch {
                        console.warn('Invalid sort JSON');
                    }
                }

                return {
                    dataSourceId: config.data_source_id,
                    connectionString: config.connection_string,
                    database: config.database,
                    operation: config.operation || 'find',
                    collection: config.collection,
                    query,
                    projection,
                    sort,
                    limit: config.limit,
                    skip: config.skip,
                    // If AI query is enabled, send the prompt text directly
                    // (unless it looks like a {{node.path}} reference)
                    ...(config.use_ai_query && config.ai_query_source ? (
                        (config.ai_query_source as string).trim().startsWith('{{')
                            ? { useQueryFrom: config.ai_query_source }
                            : { aiQueryPrompt: config.ai_query_source }
                    ) : {}),
                };
            }

            case 'iterator': {
                // Maps to backend 'loop' type (handled by mapNodeType)
                let loopType = config.loop_type as string;
                if (loopType === 'for_each') loopType = 'forEach';

                return {
                    loopType: loopType || 'forEach',
                    // Use 'collection' (the field the loop executor reads) AND keep
                    // 'list_source' so both camelCase-legacy and snake_case paths work.
                    collection: config.list_source,
                    list_source: config.list_source,
                    itemVariable: config.item_variable || 'item',
                    item_variable: config.item_variable || 'item',
                    indexVariable: config.index_variable || 'index',
                    index_variable: config.index_variable || 'index',
                    iterations: config.iterations,
                    condition: config.condition,
                    maxIterations: config.max_iterations || 1000,
                    parallel: config.parallel_execution || false,
                    batchSize: config.batch_size,
                    continueOnError: config.continue_on_error !== false,
                };
            }

            case 'split':
                return {
                    branches: [], // Orchestrator resolves branches from outgoing edges
                };

            case 'join':
                return {
                    // Preserve waitFor array so the backend JoinExecutor knows which upstream
                    // node IDs to wait for. If not set directly, fall back to an empty array
                    // (caller must consider this via the node config's waitFor field).
                    waitFor: Array.isArray(config.waitFor) ? config.waitFor : [],
                    expectedBranches: config.expected_branches || 2,
                    strategy: config.merge_strategy || 'all',
                    requiredCount: config.merge_strategy === 'any' ? (config.required_count || 1) : undefined,
                };

            case 'end': {
                let outputMapping;
                if (config.output_mapping) {
                    try {
                        outputMapping = JSON.parse(config.output_mapping as string);
                    } catch {
                        console.warn('Invalid output_mapping JSON');
                    }
                }

                return {
                    outputMapping,
                    includeAllOutputs: config.include_all_outputs !== false,
                };
            }

            case 'crm': {
                // Build entityData from individual op_fields (new dynamic form),
                // falling back to raw entity_data textarea (legacy / manual JSON).
                // Accept both snake_case (entity_data) and camelCase (entityData) from pasted JSON.
                let entityData: string | undefined = (config.entity_data || config.entityData) as string | undefined;

                if (config.op_fields && typeof config.op_fields === 'object') {
                    const raw = config.op_fields as Record<string, unknown>;
                    // Strip empty / undefined / 'all' (placeholder) values so we don't send noise
                    const clean = Object.fromEntries(
                        Object.entries(raw).filter(([, v]) => v !== undefined && v !== '' && v !== null && v !== 'all')
                    );
                    if (Object.keys(clean).length > 0) {
                        entityData = JSON.stringify(clean);
                    }
                }

                const opFields = (config.op_fields || {}) as Record<string, unknown>;

                return {
                    operation: config.operation || 'create_contact',
                    entityData,
                    // contactId / dealId can come from dedicated op_fields sub-keys
                    contactId: (opFields.contactId as string) || config.contact_id,
                    dealId: (opFields.dealId as string) || config.deal_id,
                    filter: config.filter,
                    limit: (opFields.limit as number) || config.limit || 20,
                };
            }

            case 'voice_agent': {
                return {
                    agentId: config.agent_id,
                    customerNumber: config.customer_number,
                    phoneNumberId: config.phone_number_id,
                };
            }

            case 'hr':
            case 'church':
            case 'coaches':
            case 'freelancer': {
                // Build entityData from individual op_fields (dynamic form),
                // falling back to raw entityData string (pasted JSON / legacy).
                let entityData: string | undefined = (config.entity_data || config.entityData) as string | undefined;

                if (config.op_fields && typeof config.op_fields === 'object') {
                    const raw = config.op_fields as Record<string, unknown>;
                    const clean = Object.fromEntries(
                        Object.entries(raw).filter(([, v]) => v !== undefined && v !== '' && v !== null)
                    );
                    if (Object.keys(clean).length > 0) {
                        entityData = JSON.stringify(clean);
                    }
                }

                const opFields = (config.op_fields || {}) as Record<string, unknown>;

                return {
                    operation: config.operation,
                    entityData,
                    // Pass op_fields through so backend can use as fallback
                    op_fields: config.op_fields,
                    // Hoist ID fields so executors can read them at top-level config
                    employeeId: (opFields.employeeId as string) || config.employeeId,
                    entityId: (opFields.entityId as string) || config.entityId,
                    memberId: (opFields.memberId as string) || config.memberId,
                    clientId: (opFields.clientId as string) || config.clientId,
                    projectId: (opFields.projectId as string) || config.projectId,
                    filter: config.filter,
                    limit: (opFields.limit as number) || config.limit || 20,
                };
            }

            default:
                // Return config as-is for unknown types
                return config;
        }
    }

    // =========================================================================
    // ISOLATED NODE TESTING
    // =========================================================================

    /**
     * Test a Vapi action in isolation (no full workflow needed)
     */
    async testVapiNode(
        action: string,
        config: Record<string, unknown>,
    ): Promise<{ success: boolean; action: string; result?: Record<string, unknown>; error?: string; durationMs: number }> {
        const response = await authedFetch(`${this.baseUrl}/test/vapi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, config }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || 'Failed to test Vapi node');
        }

        return response.json();
    }

    /**
     * Test a WebRTC action in isolation (no full workflow needed)
     */
    async testWebRTCNode(
        action: string,
        config: Record<string, unknown>,
    ): Promise<{ success: boolean; action: string; result?: Record<string, unknown>; error?: string; durationMs: number }> {
        const response = await authedFetch(`${this.baseUrl}/test/webrtc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, config }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || 'Failed to test WebRTC node');
        }

        return response.json();
    }
}

// Export singleton instance
export const orchestratorService = new OrchestratorApiClient();
