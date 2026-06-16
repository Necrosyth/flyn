/**
 * Execution types for the FLYN Automation Orchestrator
 * These types handle runtime execution state, tokens, and results
 */

// ============================================================================
// EXECUTION TOKEN TYPES (Graph Traversal)
// ============================================================================

/**
 * An execution token represents one active path through the workflow
 * Inspired by bpmn-engine's token-based execution model
 */
export interface ExecutionToken {
    id: string;
    workflowRunId: string;
    currentNodeId: string;
    parentTokenId?: string;     // For tracking parallel branches

    // Token state
    status: TokenStatus;
    data: Record<string, unknown>;  // Data passed to the current node

    // Tracking
    visitedNodes: string[];
    createdAt: Date;
    updatedAt: Date;
}

export enum TokenStatus {
    ACTIVE = 'active',
    WAITING = 'waiting',
    COMPLETED = 'completed',
    FAILED = 'failed',
    MERGED = 'merged',          // Token was merged at a join node
}

// ============================================================================
// NODE EXECUTION TYPES
// ============================================================================

/**
 * Result of executing a node
 * Every node executor must return one of these states
 */
export type NodeResult =
    | NodeResultCompleted
    | NodeResultWait
    | NodeResultFailed;

export interface NodeResultCompleted {
    status: 'COMPLETED';
    output: Record<string, unknown>;
    nextNodeIds?: string[];     // Override for conditional routing
}

export interface NodeResultWait {
    status: 'WAIT';
    resumeCondition: ResumeCondition;
    partialOutput?: Record<string, unknown>;
}

export interface NodeResultFailed {
    status: 'FAILED';
    error: {
        code: string;
        message: string;
        retryable: boolean;
        details?: Record<string, unknown>;
    };
}

// ============================================================================
// RESUME CONDITION TYPES (WAIT/RESUME System)
// ============================================================================

/**
 * Conditions that can trigger workflow resumption
 */
export type ResumeCondition =
    | TimeResumeCondition
    | EventResumeCondition
    | ApprovalResumeCondition
    | WebhookResumeCondition;

export interface TimeResumeCondition {
    type: 'time';
    resumeAt: Date;
    timerId?: string;
}

export interface EventResumeCondition {
    type: 'event';
    eventType: string;
    eventFilter?: Record<string, unknown>;  // Match criteria for the event
    timeout?: number;                        // Timeout in ms
    timeoutAction?: 'fail' | 'continue';
}

export interface ApprovalResumeCondition {
    type: 'approval';
    approvalTaskId: string;
    assignedTo: string[];       // User IDs or role names
    timeout?: number;
    timeoutAction?: 'fail' | 'escalate' | 'auto_approve' | 'auto_reject';
    escalateTo?: string[];
}

export interface WebhookResumeCondition {
    type: 'webhook';
    webhookId: string;
    expectedPayloadSchema?: Record<string, unknown>;
    timeout?: number;
    timeoutAction?: 'fail' | 'continue';
}

// ============================================================================
// NODE RUN TRACKING (Execution History)
// ============================================================================

/**
 * Record of a single node execution
 * Used for replay, audit, and debugging
 */
export interface WorkflowNodeRun {
    id: string;
    workflowRunId: string;
    nodeId: string;
    tokenId: string;

    // Execution details
    status: NodeRunStatus;
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: {
        code: string;
        message: string;
        stack?: string;
    };

    // Timing
    startedAt: Date;
    completedAt?: Date;
    durationMs?: number;

    // Retry tracking
    attemptNumber: number;
    maxAttempts: number;

    // Resume tracking (for WAIT nodes)
    resumeCondition?: ResumeCondition;
    resumedAt?: Date;
    resumeData?: Record<string, unknown>;
}

export enum NodeRunStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    WAITING = 'waiting',
    FAILED = 'failed',
    SKIPPED = 'skipped',
    RETRYING = 'retrying',
}

// ============================================================================
// EXECUTION CONTEXT (Shared State)
// ============================================================================

/**
 * Context passed to each node executor
 */
export interface NodeExecutionContext {
    workflowRunId: string;
    workflowId: string;
    tenantId: string;

    // Current execution state
    token: ExecutionToken;
    nodeConfig: Record<string, unknown>;

    // Historical data
    previousOutputs: Record<string, unknown>;  // Outputs by nodeId
    variables: Record<string, unknown>;        // Workflow-level variables

    // Services (injected by orchestrator)
    services: {
        emit: (event: string, data: unknown) => Promise<void>;
        log: (level: string, message: string, data?: unknown) => void;
        getSecret: (key: string) => Promise<string | undefined>;
    };
}

// ============================================================================
// APPROVAL TYPES
// ============================================================================

export interface ApprovalTask {
    id: string;
    workflowRunId: string;
    nodeId: string;

    // Task details
    title: string;
    description?: string;
    data: Record<string, unknown>;

    // Assignment
    assignedTo: string[];
    escalateTo?: string[];

    // Status
    status: ApprovalStatus;
    decision?: 'approved' | 'rejected';
    decidedBy?: string;
    decidedAt?: Date;
    comments?: string;

    // Timing
    createdAt: Date;
    dueAt?: Date;
    escalatedAt?: Date;
}

export enum ApprovalStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    ESCALATED = 'escalated',
    EXPIRED = 'expired',
}
