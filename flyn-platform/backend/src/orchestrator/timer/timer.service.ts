import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseService } from '../../firebase/firebase.service';
import { WorkflowRuntimeService } from '../workflow-runtime';
import { WorkflowRunStatus, TimeResumeCondition } from '../types';

/**
 * Timer entry stored in Firestore or memory
 */
interface TimerEntry {
    id: string;
    workflowRunId: string;
    nodeId: string;
    tokenId: string;
    resumeAt: Date;
    status: 'pending' | 'fired' | 'cancelled';
    createdAt: Date;
}

/**
 * Timer Service
 * 
 * Manages scheduled workflow resume operations.
 * Handles time-based resume conditions for WAIT nodes.
 * 
 * Features:
 * - Schedule timers for future resume
 * - Persist timers in Firestore
 * - Poll and fire due timers
 * - In-memory fallback for development
 */
@Injectable()
export class TimerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TimerService.name);
    private readonly COLLECTION_NAME = 'workflow_timers';
    private readonly POLL_INTERVAL_MS = 10000; // 10 seconds

    // In-memory storage fallback
    private readonly memoryTimers = new Map<string, TimerEntry>();
    private pollInterval: NodeJS.Timeout | null = null;

    constructor(
        private readonly firebase: FirebaseService,
        private readonly runtime: WorkflowRuntimeService,
    ) { }

    onModuleInit() {
        // Start polling for due timers
        this.startPolling();
        this.logger.log('Timer service initialized');
    }

    onModuleDestroy() {
        this.stopPolling();
    }

    private collection() {
        const db = this.firebase.firestore();
        if (!db) return undefined;
        return db.collection(this.COLLECTION_NAME);
    }

    private useFirestore(): boolean {
        return !!this.collection();
    }

    /**
     * Schedule a timer for workflow resume
     */
    async scheduleTimer(
        workflowRunId: string,
        nodeId: string,
        tokenId: string,
        resumeAt: Date,
    ): Promise<string> {
        const timerId = uuidv4();
        const now = new Date();

        const timer: TimerEntry = {
            id: timerId,
            workflowRunId,
            nodeId,
            tokenId,
            resumeAt,
            status: 'pending',
            createdAt: now,
        };

        if (this.useFirestore()) {
            try {
                await this.collection()!.doc(timerId).set({
                    ...timer,
                    resumeAt: timer.resumeAt,
                    createdAt: timer.createdAt,
                });
                this.logger.log(`Scheduled timer (Firestore): ${timerId} for ${resumeAt.toISOString()}`);
                return timerId;
            } catch (error) {
                this.logger.warn('Firestore timer create failed, using memory', error);
            }
        }

        this.memoryTimers.set(timerId, timer);
        this.logger.log(`Scheduled timer (memory): ${timerId} for ${resumeAt.toISOString()}`);
        return timerId;
    }

    /**
     * Cancel a scheduled timer
     */
    async cancelTimer(timerId: string): Promise<boolean> {
        if (this.useFirestore()) {
            try {
                await this.collection()!.doc(timerId).update({ status: 'cancelled' });
                this.logger.log(`Cancelled timer (Firestore): ${timerId}`);
                return true;
            } catch (error) {
                this.logger.warn('Firestore timer cancel failed, trying memory', error);
            }
        }

        const timer = this.memoryTimers.get(timerId);
        if (timer) {
            timer.status = 'cancelled';
            return true;
        }
        return false;
    }

    /**
     * Start polling for due timers
     */
    private startPolling() {
        if (this.pollInterval) return;

        this.pollInterval = setInterval(async () => {
            try {
                await this.processDueTimers();
            } catch (error) {
                this.logger.error('Error processing due timers', error);
            }
        }, this.POLL_INTERVAL_MS);

        this.logger.log(`Timer polling started (every ${this.POLL_INTERVAL_MS}ms)`);
    }

    /**
     * Stop polling
     */
    private stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            this.logger.log('Timer polling stopped');
        }
    }

    /**
     * Process all due timers
     */
    private async processDueTimers(): Promise<void> {
        const now = new Date();
        const dueTimers = await this.getDueTimers(now);

        for (const timer of dueTimers) {
            await this.fireTimer(timer);
        }

        if (dueTimers.length > 0) {
            this.logger.log(`Processed ${dueTimers.length} due timer(s)`);
        }
    }

    /**
     * Get timers that are due
     */
    private async getDueTimers(now: Date): Promise<TimerEntry[]> {
        if (this.useFirestore()) {
            try {
                const snapshot = await this.collection()!
                    .where('status', '==', 'pending')
                    .where('resumeAt', '<=', now)
                    .limit(50)
                    .get();

                return snapshot.docs.map(d => this.deserializeTimer(d.id, d.data()));
            } catch (error) {
                this.logger.warn('Firestore due timers query failed, checking memory', error);
            }
        }

        return Array.from(this.memoryTimers.values())
            .filter(t => t.status === 'pending' && t.resumeAt <= now);
    }

    /**
     * Fire a timer (resume the workflow)
     */
    private async fireTimer(timer: TimerEntry): Promise<void> {
        this.logger.log(`Firing timer: ${timer.id} for workflow ${timer.workflowRunId}`);

        try {
            // Mark timer as fired
            if (this.useFirestore()) {
                await this.collection()!.doc(timer.id).update({ status: 'fired' });
            } else {
                timer.status = 'fired';
            }

            // Get the workflow run
            const workflowRun = await this.runtime.getWorkflowRun(timer.workflowRunId);
            if (!workflowRun) {
                this.logger.warn(`Workflow run not found for timer: ${timer.workflowRunId}`);
                return;
            }

            // Check if still waiting
            if (workflowRun.status !== WorkflowRunStatus.WAITING) {
                this.logger.log(`Workflow ${timer.workflowRunId} no longer waiting, skipping timer`);
                return;
            }

            // Resume the workflow
            // Note: Full resume requires the OrchestratorService, 
            // which would create a circular dependency
            // For now, we update the status and emit an event
            this.logger.log(`Timer fired - workflow ${timer.workflowRunId} ready to resume at node ${timer.nodeId}`);

            // Update context with timer data
            await this.runtime.updateContext(timer.workflowRunId, {
                resumeData: {
                    timerFired: true,
                    timerId: timer.id,
                    firedAt: new Date(),
                },
            });

        } catch (error) {
            this.logger.error(`Failed to fire timer ${timer.id}`, error);
        }
    }

    /**
     * Get timer by ID
     */
    async getTimer(timerId: string): Promise<TimerEntry | undefined> {
        if (this.useFirestore()) {
            try {
                const doc = await this.collection()!.doc(timerId).get();
                if (!doc.exists) return undefined;
                return this.deserializeTimer(doc.id, doc.data()!);
            } catch (error) {
                this.logger.warn('Firestore timer read failed, checking memory', error);
            }
        }
        return this.memoryTimers.get(timerId);
    }

    /**
     * Get pending timers for a workflow run
     */
    async getTimersForWorkflow(workflowRunId: string): Promise<TimerEntry[]> {
        if (this.useFirestore()) {
            try {
                const snapshot = await this.collection()!
                    .where('workflowRunId', '==', workflowRunId)
                    .where('status', '==', 'pending')
                    .get();
                return snapshot.docs.map(d => this.deserializeTimer(d.id, d.data()));
            } catch (error) {
                this.logger.warn('Firestore timers query failed, checking memory', error);
            }
        }
        return Array.from(this.memoryTimers.values())
            .filter(t => t.workflowRunId === workflowRunId && t.status === 'pending');
    }

    // ============================================================================
    // SERIALIZATION
    // ============================================================================

    private deserializeTimer(id: string, data: Record<string, unknown>): TimerEntry {
        return {
            id,
            workflowRunId: data.workflowRunId as string,
            nodeId: data.nodeId as string,
            tokenId: data.tokenId as string,
            resumeAt: this.toDate(data.resumeAt),
            status: data.status as TimerEntry['status'],
            createdAt: this.toDate(data.createdAt),
        };
    }

    private toDate(value: unknown): Date {
        if (value instanceof Date) return value;
        if (typeof value === 'string' || typeof value === 'number') return new Date(value);
        if (value && typeof value === 'object' && 'toDate' in value) {
            return (value as { toDate: () => Date }).toDate();
        }
        return new Date();
    }
}
