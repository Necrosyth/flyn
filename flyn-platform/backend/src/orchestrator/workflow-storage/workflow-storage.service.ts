import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseService } from '../../firebase/firebase.service';
import { CompiledWorkflow, WorkflowMetadata } from '../types';

/**
 * Workflow Storage Service
 * 
 * Manages storage and retrieval of compiled workflow definitions.
 * Used for:
 * - Saving workflows from the frontend builder
 * - Retrieving workflows for execution
 * - Versioning and rollback
 */
@Injectable()
export class WorkflowStorageService {
    private readonly logger = new Logger(WorkflowStorageService.name);
    private readonly COLLECTION_NAME = 'workflows';

    // In-memory storage fallback
    private readonly memoryWorkflows = new Map<string, CompiledWorkflow>();

    constructor(private readonly firebase: FirebaseService) { }

    private collection() {
        const db = this.firebase.firestore();
        if (!db) return undefined;
        return db.collection(this.COLLECTION_NAME);
    }

    private useFirestore(): boolean {
        return !!this.collection();
    }

    /**
     * Save a compiled workflow
     */
    async save(workflow: CompiledWorkflow): Promise<CompiledWorkflow> {
        const savedWorkflow: CompiledWorkflow = {
            ...workflow,
            id: workflow.id || uuidv4(),
            version: workflow.version || 1,
        };

        if (this.useFirestore()) {
            try {
                await this.collection()!.doc(savedWorkflow.id).set(this.serialize(savedWorkflow));
                this.logger.log(`Saved workflow (Firestore): ${savedWorkflow.id} v${savedWorkflow.version}`);
                return savedWorkflow;
            } catch (error) {
                this.logger.warn('Firestore save failed, using memory', error);
            }
        }

        this.memoryWorkflows.set(savedWorkflow.id, savedWorkflow);
        this.logger.log(`Saved workflow (memory): ${savedWorkflow.id} v${savedWorkflow.version}`);
        return savedWorkflow;
    }

    /**
     * Get a workflow by ID
     */
    async get(workflowId: string): Promise<CompiledWorkflow | undefined> {
        if (this.useFirestore()) {
            try {
                const doc = await this.collection()!.doc(workflowId).get();
                if (!doc.exists) return undefined;
                return this.deserialize(doc.id, doc.data()!);
            } catch (error) {
                this.logger.warn('Firestore read failed, checking memory', error);
            }
        }
        return this.memoryWorkflows.get(workflowId);
    }

    /**
     * Get a compiled workflow (backward compatibility)
     */
    async getCompiled(tenantId: string, workflowId: string): Promise<CompiledWorkflow | undefined> {
        const workflow = await this.get(workflowId);
        if (workflow && workflow.tenantId === tenantId) {
            return workflow;
        }
        return undefined;
    }

    /**
     * List workflows for a tenant
     */
    async listByTenant(tenantId: string, limit = 50): Promise<CompiledWorkflow[]> {
        if (this.useFirestore()) {
            try {
                const snapshot = await this.collection()!
                    .where('tenantId', '==', tenantId)
                    .limit(limit)
                    .get();
                return snapshot.docs.map(d => this.deserialize(d.id, d.data()));
            } catch (error) {
                this.logger.warn('Firestore query failed, checking memory', error);
            }
        }
        return Array.from(this.memoryWorkflows.values())
            .filter(w => w.tenantId === tenantId)
            .slice(0, limit);
    }

    /**
     * Delete a workflow
     */
    async delete(workflowId: string): Promise<boolean> {
        if (this.useFirestore()) {
            try {
                await this.collection()!.doc(workflowId).delete();
                this.logger.log(`Deleted workflow (Firestore): ${workflowId}`);
                return true;
            } catch (error) {
                this.logger.warn('Firestore delete failed, trying memory', error);
            }
        }
        return this.memoryWorkflows.delete(workflowId);
    }

    /**
     * Mark a workflow as active (published) or inactive
     */
    async setActive(workflowId: string, isActive: boolean): Promise<CompiledWorkflow | undefined> {
        const existing = await this.get(workflowId);
        if (!existing) return undefined;

        const updated: CompiledWorkflow = {
            ...existing,
            isActive,
            metadata: {
                ...existing.metadata,
                updatedAt: new Date(),
                ...(isActive ? { publishedAt: new Date() } : {}),
            },
        };

        if (this.useFirestore()) {
            try {
                await this.collection()!.doc(workflowId).update({ isActive, 'metadata.updatedAt': new Date(), ...(isActive ? { 'metadata.publishedAt': new Date() } : {}) });
                this.logger.log(`Set workflow ${workflowId} isActive=${isActive} (Firestore)`);
                return updated;
            } catch (error) {
                this.logger.warn('Firestore setActive failed, using memory', error);
            }
        }

        this.memoryWorkflows.set(workflowId, updated);
        this.logger.log(`Set workflow ${workflowId} isActive=${isActive} (memory)`);
        return updated;
    }

    /**
     * List active workflows for a tenant, optionally filtering by trigger node types
     */
    async listActiveByTenant(tenantId: string, triggerNodeTypes?: string[]): Promise<CompiledWorkflow[]> {
        let workflows: CompiledWorkflow[] = [];

        if (this.useFirestore()) {
            try {
                const snapshot = await this.collection()!
                    .where('tenantId', '==', tenantId)
                    .where('isActive', '==', true)
                    .get();
                workflows = snapshot.docs.map(d => this.deserialize(d.id, d.data()));
            } catch (error) {
                this.logger.warn('Firestore listActiveByTenant failed, checking memory', error);
                workflows = Array.from(this.memoryWorkflows.values())
                    .filter(w => w.tenantId === tenantId && w.isActive);
            }
        } else {
            workflows = Array.from(this.memoryWorkflows.values())
                .filter(w => w.tenantId === tenantId && w.isActive);
        }

        if (!triggerNodeTypes || triggerNodeTypes.length === 0) return workflows;

        // Filter to only workflows whose first/trigger nodes match the given types
        return workflows.filter(w =>
            w.compiled_nodes.some(n => triggerNodeTypes.includes(n.type))
        );
    }

    /**
     * Create a new version of a workflow
     */
    async createVersion(workflowId: string, updates: Partial<CompiledWorkflow>): Promise<CompiledWorkflow | undefined> {
        const existing = await this.get(workflowId);
        if (!existing) return undefined;

        const newVersion: CompiledWorkflow = {
            ...existing,
            ...updates,
            version: existing.version + 1,
        };

        return this.save(newVersion);
    }

    // ============================================================================
    // SERIALIZATION HELPERS
    // ============================================================================

    private serialize(workflow: CompiledWorkflow): Record<string, unknown> {
        return { ...workflow };
    }

    private deserialize(id: string, data: Record<string, unknown>): CompiledWorkflow {
        return {
            id,
            name: data.name as string,
            tenantId: data.tenantId as string,
            version: data.version as number,
            compiled_nodes: data.compiled_nodes as CompiledWorkflow['compiled_nodes'],
            compiled_edges: data.compiled_edges as CompiledWorkflow['compiled_edges'],
            execution_plan: data.execution_plan as CompiledWorkflow['execution_plan'],
            metadata: data.metadata as WorkflowMetadata,
            isActive: data.isActive as boolean | undefined,
        };
    }
}
