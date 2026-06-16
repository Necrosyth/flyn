import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseService } from '../../firebase/firebase.service';
import {
    CompiledWorkflow,
    WorkflowRun,
    WorkflowRunStatus,
    WorkflowNodeRun,
    NodeRunStatus,
    ExecutionContext,
    TriggerSource,
    ExecutionToken,
    TokenStatus,
} from '../types';

/**
 * Workflow Runtime Service
 * 
 * Manages the lifecycle of workflow instances (workflow_runs).
 * Inspired by Temporal's durable execution model.
 * 
 * Features:
 * - Firestore persistence when available
 * - In-memory fallback for development
 * - Automatic recovery after server restart
 * 
 * Responsibilities:
 * - Create workflow runs from compiled workflows
 * - Track execution state
 * - Persist execution history
 * - Handle resume from WAIT states
 */
@Injectable()
export class WorkflowRuntimeService {
    private readonly logger = new Logger(WorkflowRuntimeService.name);
    private readonly COLLECTION_NAME = 'workflow_runs';

    // In-memory storage (fallback when Firebase is not configured)
    private readonly memoryWorkflowRuns = new Map<string, WorkflowRun>();
    private readonly memoryNodeRuns = new Map<string, WorkflowNodeRun[]>();
    private readonly memoryTokens = new Map<string, ExecutionToken[]>();

    constructor(private readonly firebase: FirebaseService) { }

    /**
     * Get Firestore collection reference
     */
    private collection() {
        const db = this.firebase.firestore();
        if (!db) return undefined;
        return db.collection(this.COLLECTION_NAME);
    }

    /**
     * Check if Firestore is available
     */
    private useFirestore(): boolean {
        return !!this.collection();
    }

    /**
     * Start a new workflow run
     */
    async startWorkflow(
        workflow: CompiledWorkflow,
        triggerSource: TriggerSource,
        triggerData: Record<string, unknown>,
    ): Promise<WorkflowRun> {
        const runId = uuidv4();
        const now = new Date();

        const workflowRun: WorkflowRun = {
            id: runId,
            workflowId: workflow.id,
            workflowVersion: workflow.version,
            tenantId: workflow.tenantId,
            status: WorkflowRunStatus.PENDING,
            triggeredBy: triggerSource,
            triggerData,
            currentNodeIds: [workflow.execution_plan.startNodeId],
            context: {
                variables: {},
                nodeOutputs: {},
            },
            startedAt: now,
            lastActivityAt: now,
        };

        // Create initial execution token
        const initialToken: ExecutionToken = {
            id: uuidv4(),
            workflowRunId: runId,
            currentNodeId: workflow.execution_plan.startNodeId,
            status: TokenStatus.ACTIVE,
            data: triggerData,
            visitedNodes: [],
            createdAt: now,
            updatedAt: now,
        };

        // Persist to Firestore or memory
        if (this.useFirestore()) {
            try {
                const col = this.collection()!;
                await col.doc(runId).set(this.serializeWorkflowRun(workflowRun));
                await col.doc(runId).collection('tokens').doc(initialToken.id).set(this.serializeToken(initialToken));
                this.logger.log(`Started workflow run (Firestore): ${runId}`);
            } catch (error) {
                this.logger.error('Failed to persist to Firestore, falling back to memory', error);
                this.persistToMemory(runId, workflowRun, initialToken);
            }
        } else {
            this.persistToMemory(runId, workflowRun, initialToken);
        }

        this.logger.log(`Started workflow run: ${runId}`, {
            workflowId: workflow.id,
            startNodeId: workflow.execution_plan.startNodeId,
        });

        return workflowRun;
    }

    private persistToMemory(runId: string, workflowRun: WorkflowRun, initialToken: ExecutionToken) {
        this.memoryWorkflowRuns.set(runId, workflowRun);
        this.memoryNodeRuns.set(runId, []);
        this.memoryTokens.set(runId, [initialToken]);
    }

    /**
     * Get a workflow run by ID
     */
    async getWorkflowRun(runId: string): Promise<WorkflowRun | undefined> {
        if (this.useFirestore()) {
            try {
                const doc = await this.collection()!.doc(runId).get();
                if (!doc.exists) return undefined;
                return this.deserializeWorkflowRun(doc.id, doc.data()!);
            } catch (error) {
                this.logger.warn('Firestore read failed, checking memory', error);
            }
        }
        return this.memoryWorkflowRuns.get(runId);
    }

    /**
     * Update workflow run status
     */
    async updateStatus(runId: string, status: WorkflowRunStatus): Promise<void> {
        const now = new Date();
        const updates: Record<string, unknown> = {
            status,
            lastActivityAt: now,
        };

        if (status === WorkflowRunStatus.COMPLETED || status === WorkflowRunStatus.FAILED) {
            updates.completedAt = now;
        }

        if (this.useFirestore()) {
            try {
                await this.collection()!.doc(runId).update(this.serializeDates(updates));
                this.logger.log(`Updated workflow run status (Firestore): ${runId} -> ${status}`);
                return;
            } catch (error) {
                this.logger.warn('Firestore update failed, updating memory', error);
            }
        }

        const run = this.memoryWorkflowRuns.get(runId);
        if (!run) {
            throw new Error(`Workflow run not found: ${runId}`);
        }
        run.status = status;
        run.lastActivityAt = now;
        if (status === WorkflowRunStatus.COMPLETED || status === WorkflowRunStatus.FAILED) {
            run.completedAt = now;
        }
        this.logger.log(`Updated workflow run status: ${runId} -> ${status}`);
    }

    /**
     * Update execution context
     */
    async updateContext(
        runId: string,
        updates: Partial<ExecutionContext>,
    ): Promise<void> {
        if (this.useFirestore()) {
            try {
                const contextUpdates: Record<string, unknown> = {
                    lastActivityAt: new Date(),
                };
                if (updates.variables) {
                    contextUpdates['context.variables'] = updates.variables;
                }
                if (updates.nodeOutputs) {
                    // Merge node outputs
                    const doc = await this.collection()!.doc(runId).get();
                    const existing = doc.data()?.context?.nodeOutputs || {};
                    contextUpdates['context.nodeOutputs'] = { ...existing, ...updates.nodeOutputs };
                }
                if (updates.resumeData) {
                    contextUpdates['context.resumeData'] = updates.resumeData;
                }
                await this.collection()!.doc(runId).update(this.serializeDates(contextUpdates));
                return;
            } catch (error) {
                this.logger.warn('Firestore context update failed, updating memory', error);
            }
        }

        const run = this.memoryWorkflowRuns.get(runId);
        if (!run) {
            throw new Error(`Workflow run not found: ${runId}`);
        }

        if (updates.variables) {
            run.context.variables = { ...run.context.variables, ...updates.variables };
        }
        if (updates.nodeOutputs) {
            run.context.nodeOutputs = { ...run.context.nodeOutputs, ...updates.nodeOutputs };
        }
        if (updates.resumeData) {
            run.context.resumeData = updates.resumeData;
        }
        run.lastActivityAt = new Date();
    }

    /**
     * Get active tokens for a workflow run
     */
    async getActiveTokens(runId: string): Promise<ExecutionToken[]> {
        if (this.useFirestore()) {
            try {
                const snapshot = await this.collection()!
                    .doc(runId)
                    .collection('tokens')
                    .where('status', 'in', [TokenStatus.ACTIVE, TokenStatus.WAITING])
                    .get();
                return snapshot.docs.map(d => this.deserializeToken(d.id, d.data()));
            } catch (error) {
                this.logger.warn('Firestore tokens read failed, checking memory', error);
            }
        }
        const tokens = this.memoryTokens.get(runId) || [];
        return tokens.filter(t => t.status === TokenStatus.ACTIVE || t.status === TokenStatus.WAITING);
    }

    /**
     * Get a specific token
     */
    async getToken(runId: string, tokenId: string): Promise<ExecutionToken | undefined> {
        if (this.useFirestore()) {
            try {
                const doc = await this.collection()!
                    .doc(runId)
                    .collection('tokens')
                    .doc(tokenId)
                    .get();
                if (!doc.exists) return undefined;
                return this.deserializeToken(doc.id, doc.data()!);
            } catch (error) {
                this.logger.warn('Firestore token read failed, checking memory', error);
            }
        }
        const tokens = this.memoryTokens.get(runId) || [];
        return tokens.find(t => t.id === tokenId);
    }

    /**
     * Update token state
     */
    async updateToken(
        runId: string,
        tokenId: string,
        updates: Partial<ExecutionToken>,
    ): Promise<void> {
        const now = new Date();
        const updateData = { ...updates, updatedAt: now };

        if (this.useFirestore()) {
            try {
                await this.collection()!
                    .doc(runId)
                    .collection('tokens')
                    .doc(tokenId)
                    .update(this.serializeDates(updateData));
                return;
            } catch (error) {
                this.logger.warn('Firestore token update failed, updating memory', error);
            }
        }

        const tokens = this.memoryTokens.get(runId);
        if (!tokens) {
            throw new Error(`Workflow run not found: ${runId}`);
        }

        const token = tokens.find(t => t.id === tokenId);
        if (!token) {
            throw new Error(`Token not found: ${tokenId}`);
        }

        Object.assign(token, updateData);
    }

    /**
     * Create a new token (for parallel paths)
     */
    async createToken(
        runId: string,
        nodeId: string,
        parentTokenId?: string,
        data?: Record<string, unknown>,
    ): Promise<ExecutionToken> {
        const now = new Date();
        const newToken: ExecutionToken = {
            id: uuidv4(),
            workflowRunId: runId,
            currentNodeId: nodeId,
            parentTokenId,
            status: TokenStatus.ACTIVE,
            data: data || {},
            visitedNodes: [],
            createdAt: now,
            updatedAt: now,
        };

        if (this.useFirestore()) {
            try {
                await this.collection()!
                    .doc(runId)
                    .collection('tokens')
                    .doc(newToken.id)
                    .set(this.serializeToken(newToken));
                return newToken;
            } catch (error) {
                this.logger.warn('Firestore token create failed, using memory', error);
            }
        }

        const tokens = this.memoryTokens.get(runId);
        if (!tokens) {
            throw new Error(`Workflow run not found: ${runId}`);
        }
        tokens.push(newToken);
        return newToken;
    }

    /**
     * Record a node execution
     */
    async recordNodeRun(nodeRun: Omit<WorkflowNodeRun, 'id'>): Promise<WorkflowNodeRun> {
        const record: WorkflowNodeRun = {
            ...nodeRun,
            id: uuidv4(),
        };

        if (this.useFirestore()) {
            try {
                await this.collection()!
                    .doc(nodeRun.workflowRunId)
                    .collection('node_runs')
                    .doc(record.id)
                    .set(this.serializeNodeRun(record));
                return record;
            } catch (error) {
                this.logger.warn('Firestore node run create failed, using memory', error);
            }
        }

        const runs = this.memoryNodeRuns.get(nodeRun.workflowRunId);
        if (!runs) {
            throw new Error(`Workflow run not found: ${nodeRun.workflowRunId}`);
        }
        runs.push(record);
        return record;
    }

    /**
     * Update a node run record
     */
    async updateNodeRun(
        workflowRunId: string,
        nodeRunId: string,
        updates: Partial<WorkflowNodeRun>,
    ): Promise<void> {
        if (this.useFirestore()) {
            try {
                await this.collection()!
                    .doc(workflowRunId)
                    .collection('node_runs')
                    .doc(nodeRunId)
                    .update(this.serializeDates(updates));
                return;
            } catch (error) {
                this.logger.warn('Firestore node run update failed, updating memory', error);
            }
        }

        const runs = this.memoryNodeRuns.get(workflowRunId);
        if (!runs) {
            throw new Error(`Workflow run not found: ${workflowRunId}`);
        }

        const nodeRun = runs.find(r => r.id === nodeRunId);
        if (!nodeRun) {
            throw new Error(`Node run not found: ${nodeRunId}`);
        }

        Object.assign(nodeRun, updates);
    }

    /**
     * Get execution history for a workflow run
     */
    async getExecutionHistory(runId: string): Promise<WorkflowNodeRun[]> {
        if (this.useFirestore()) {
            try {
                const snapshot = await this.collection()!
                    .doc(runId)
                    .collection('node_runs')
                    .orderBy('startedAt', 'asc')
                    .get();
                return snapshot.docs.map(d => this.deserializeNodeRun(d.id, d.data()));
            } catch (error) {
                this.logger.warn('Firestore execution history read failed, checking memory', error);
            }
        }
        return this.memoryNodeRuns.get(runId) || [];
    }

    /**
     * Get workflow runs by status
     */
    async getRunsByStatus(status: WorkflowRunStatus): Promise<WorkflowRun[]> {
        if (this.useFirestore()) {
            try {
                const snapshot = await this.collection()!
                    .where('status', '==', status)
                    .orderBy('startedAt', 'desc')
                    .limit(100)
                    .get();
                return snapshot.docs.map(d => this.deserializeWorkflowRun(d.id, d.data()));
            } catch (error) {
                this.logger.warn('Firestore status query failed, checking memory', error);
            }
        }
        return Array.from(this.memoryWorkflowRuns.values())
            .filter(run => run.status === status);
    }

    /**
     * Get all waiting runs (for resume processing)
     */
    async getWaitingRuns(): Promise<WorkflowRun[]> {
        return this.getRunsByStatus(WorkflowRunStatus.WAITING);
    }

    /**
     * List workflow runs for a tenant
     */
    async listRunsByTenant(tenantId: string, limit = 50): Promise<WorkflowRun[]> {
        if (this.useFirestore()) {
            try {
                const snapshot = await this.collection()!
                    .where('tenantId', '==', tenantId)
                    .orderBy('startedAt', 'desc')
                    .limit(limit)
                    .get();
                return snapshot.docs.map(d => this.deserializeWorkflowRun(d.id, d.data()));
            } catch (error) {
                this.logger.warn('Firestore tenant query failed, checking memory', error);
            }
        }
        return Array.from(this.memoryWorkflowRuns.values())
            .filter(run => run.tenantId === tenantId)
            .slice(0, limit);
    }

    /**
     * Get workflow runs by workflow ID
     */
    async getRunsByWorkflowId(workflowId: string, limit = 20): Promise<WorkflowRun[]> {
        if (this.useFirestore()) {
            try {
                const snapshot = await this.collection()!
                    .where('workflowId', '==', workflowId)
                    .orderBy('startedAt', 'desc')
                    .limit(limit)
                    .get();
                return snapshot.docs.map(d => this.deserializeWorkflowRun(d.id, d.data()));
            } catch (error) {
                this.logger.warn('Firestore workflowId query failed, checking memory', error);
            }
        }
        return Array.from(this.memoryWorkflowRuns.values())
            .filter(run => run.workflowId === workflowId)
            .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
            .slice(0, limit);
    }

    // ============================================================================
    // SERIALIZATION HELPERS
    // ============================================================================

    private serializeWorkflowRun(run: WorkflowRun): Record<string, unknown> {
        return {
            ...run,
            startedAt: run.startedAt,
            lastActivityAt: run.lastActivityAt,
            completedAt: run.completedAt || null,
        };
    }

    private deserializeWorkflowRun(id: string, data: Record<string, unknown>): WorkflowRun {
        return {
            id,
            workflowId: data.workflowId as string,
            workflowVersion: data.workflowVersion as number,
            tenantId: data.tenantId as string,
            status: data.status as WorkflowRunStatus,
            triggeredBy: data.triggeredBy as TriggerSource,
            triggerData: data.triggerData as Record<string, unknown>,
            currentNodeIds: data.currentNodeIds as string[],
            context: data.context as ExecutionContext,
            startedAt: this.toDate(data.startedAt),
            lastActivityAt: this.toDate(data.lastActivityAt),
            completedAt: data.completedAt ? this.toDate(data.completedAt) : undefined,
            error: data.error as WorkflowRun['error'],
        };
    }

    private serializeToken(token: ExecutionToken): Record<string, unknown> {
        return {
            ...token,
            createdAt: token.createdAt,
            updatedAt: token.updatedAt,
        };
    }

    private deserializeToken(id: string, data: Record<string, unknown>): ExecutionToken {
        return {
            id,
            workflowRunId: data.workflowRunId as string,
            currentNodeId: data.currentNodeId as string,
            parentTokenId: data.parentTokenId as string | undefined,
            status: data.status as TokenStatus,
            data: data.data as Record<string, unknown>,
            visitedNodes: data.visitedNodes as string[],
            createdAt: this.toDate(data.createdAt),
            updatedAt: this.toDate(data.updatedAt),
        };
    }

    private serializeNodeRun(nodeRun: WorkflowNodeRun): Record<string, unknown> {
        return {
            ...nodeRun,
            startedAt: nodeRun.startedAt,
            completedAt: nodeRun.completedAt || null,
            resumedAt: nodeRun.resumedAt || null,
        };
    }

    private deserializeNodeRun(id: string, data: Record<string, unknown>): WorkflowNodeRun {
        return {
            id,
            workflowRunId: data.workflowRunId as string,
            nodeId: data.nodeId as string,
            tokenId: data.tokenId as string,
            status: data.status as NodeRunStatus,
            input: data.input as Record<string, unknown>,
            output: data.output as Record<string, unknown> | undefined,
            error: data.error as WorkflowNodeRun['error'],
            startedAt: this.toDate(data.startedAt),
            completedAt: data.completedAt ? this.toDate(data.completedAt) : undefined,
            durationMs: data.durationMs as number | undefined,
            attemptNumber: data.attemptNumber as number,
            maxAttempts: data.maxAttempts as number,
            resumeCondition: data.resumeCondition as WorkflowNodeRun['resumeCondition'],
            resumedAt: data.resumedAt ? this.toDate(data.resumedAt) : undefined,
            resumeData: data.resumeData as Record<string, unknown> | undefined,
        };
    }

    private serializeDates(obj: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value instanceof Date) {
                result[key] = value;
            } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this.serializeDates(value as Record<string, unknown>);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    private toDate(value: unknown): Date {
        if (value instanceof Date) return value;
        if (typeof value === 'string' || typeof value === 'number') return new Date(value);
        // Handle Firestore Timestamp
        if (value && typeof value === 'object' && 'toDate' in value) {
            return (value as { toDate: () => Date }).toDate();
        }
        return new Date();
    }
}
