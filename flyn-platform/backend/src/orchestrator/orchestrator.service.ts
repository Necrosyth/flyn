import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    CompiledWorkflow,
    WorkflowRun,
    WorkflowRunStatus,
    NodeResult,
    NodeExecutionContext,
    TokenStatus,
    NodeRunStatus,
    TriggerSource,
    ExecutionToken,
} from './types';
import { WorkflowRuntimeService } from './workflow-runtime';
import { WorkflowStorageService } from './workflow-storage';
import { GraphTraversalService } from './graph-traversal';
import { ExecutorRegistryService, BaseExecutor } from './node-executor';
import { RetryPolicyService } from './retry';
import {
    ActionExecutor,
    ConditionExecutor,
    WaitExecutor,
    ApprovalExecutor,
    TriggerExecutor,
    SplitExecutor,
    JoinExecutor,
    LoopExecutor,
    EndExecutor,
    AIRouterExecutor,
    MongoDBExecutor,
    PostgreSQLExecutor,
    MySQLExecutor,
    MergeExecutor,
} from './node-executor/executors';
import { CRMExecutor } from '../crm/crm.executor';
import { VapiExecutor } from './vapi/vapi.executor';
import { MorganLeadsExecutor } from './vapi/morgan-leads.executor';
import { FlynFeedbackExecutor } from './vapi/flyn-feedback.executor';
import { HRAgentExecutor } from './vapi/hr-agent.executor';
import { FreelancerVoiceAgentExecutor } from './vapi/freelancer-voice-agent.executor';
import { ChurchVoiceAgentExecutor } from './vapi/church-voice-agent.executor';
import { WebRTCExecutor } from './webrtc/webrtc.executor';
import { HRExecutor } from '../hr/hr.executor';
import { ChurchExecutor } from '../church/church.executor';
import { FreelancerExecutor } from '../freelancer/freelancer.executor';
import { CoachesExecutor } from '../coaches/coaches.executor';
import { InboxTriggerExecutor } from './node-executor/executors/inbox-trigger.executor';
import { SendReplyExecutor } from './node-executor/executors/send-reply.executor';
import { DecisionExecutor } from './node-executor/executors/decision.executor';
import { AiActionExecutor } from './node-executor/executors/ai-action.executor';
import { QueryRecordsExecutor } from './node-executor/executors/query-records.executor';
import { AiDecisionExecutor } from './node-executor/executors/ai-decision.executor';
import { DynamicVoiceAgentExecutor } from '../agents';
import { SendWhatsAppExecutor } from './node-executor/executors/send-whatsapp.executor';
import { AccountingExecutor } from '../accounting/accounting.executor';
import { TasksExecutor } from '../tasks/tasks.executor';
import { BillingExecutor } from '../billing/billing.executor';
import { PhonebookExecutor } from '../phonebook/phonebook.executor';
import { CustomCodeExecutor } from './node-executor/executors/custom-code.executor';

/**
 * Main Orchestrator Service
 * 
 * THE BRAIN of the FLYN platform.
 * Coordinates workflow execution by combining:
 * - Workflow Runtime (lifecycle management)
 * - Graph Traversal (token routing)
 * - Node Executors (pluggable node logic)
 */
@Injectable()
export class OrchestratorService implements OnModuleInit {
    private readonly logger = new Logger(OrchestratorService.name);

    constructor(
        private readonly runtime: WorkflowRuntimeService,
        private readonly storage: WorkflowStorageService,
        private readonly traversal: GraphTraversalService,
        private readonly executorRegistry: ExecutorRegistryService,
        private readonly retryPolicy: RetryPolicyService,
        // Inject executors for registration
        private readonly actionExecutor: ActionExecutor,
        private readonly conditionExecutor: ConditionExecutor,
        private readonly waitExecutor: WaitExecutor,
        private readonly approvalExecutor: ApprovalExecutor,
        private readonly triggerExecutor: TriggerExecutor,
        private readonly splitExecutor: SplitExecutor,
        private readonly joinExecutor: JoinExecutor,
        private readonly loopExecutor: LoopExecutor,
        private readonly endExecutor: EndExecutor,
        private readonly aiRouterExecutor: AIRouterExecutor,
        private readonly mongoDBExecutor: MongoDBExecutor,
        private readonly postgresqlExecutor: PostgreSQLExecutor,
        private readonly mysqlExecutor: MySQLExecutor,
        private readonly mergeExecutor: MergeExecutor,
        private readonly crmExecutor: CRMExecutor,
        private readonly vapiExecutor: VapiExecutor,
        private readonly morganLeadsExecutor: MorganLeadsExecutor,
        private readonly flynFeedbackExecutor: FlynFeedbackExecutor,
        private readonly hrAgentExecutor: HRAgentExecutor,
        private readonly freelancerVoiceAgentExecutor: FreelancerVoiceAgentExecutor,
        private readonly churchVoiceAgentExecutor: ChurchVoiceAgentExecutor,
        private readonly webrtcExecutor: WebRTCExecutor,
        private readonly hrExecutor: HRExecutor,
        private readonly churchExecutor: ChurchExecutor,
        private readonly freelancerExecutor: FreelancerExecutor,
        private readonly coachesExecutor: CoachesExecutor,
        private readonly inboxTriggerExecutor: InboxTriggerExecutor,
        private readonly sendReplyExecutor: SendReplyExecutor,
        private readonly decisionExecutor: DecisionExecutor,
        private readonly aiActionExecutor: AiActionExecutor,
        private readonly queryRecordsExecutor: QueryRecordsExecutor,
        private readonly aiDecisionExecutor: AiDecisionExecutor,
        private readonly dynamicVoiceAgentExecutor: DynamicVoiceAgentExecutor,
        private readonly sendWhatsAppExecutor: SendWhatsAppExecutor,
        private readonly accountingExecutor: AccountingExecutor,
        private readonly tasksExecutor: TasksExecutor,
        private readonly billingExecutor: BillingExecutor,
        private readonly phonebookExecutor: PhonebookExecutor,
        private readonly customCodeExecutor: CustomCodeExecutor,
    ) { }

    onModuleInit() {
        // Register all executors
        this.registerExecutors();
        this.logger.log('Orchestrator initialized');
    }

    private registerExecutors() {
        this.executorRegistry.register(this.actionExecutor);
        this.executorRegistry.register(this.conditionExecutor);
        this.executorRegistry.register(this.waitExecutor);
        this.executorRegistry.register(this.approvalExecutor);
        this.executorRegistry.register(this.triggerExecutor);
        this.executorRegistry.register(this.splitExecutor);
        this.executorRegistry.register(this.joinExecutor);
        this.executorRegistry.register(this.loopExecutor);
        // 'loop' is the legacy NodeType.LOOP value; register alias so old JSON still works
        this.executorRegistry.registerAlias('loop', this.loopExecutor);
        this.executorRegistry.register(this.endExecutor);
        this.executorRegistry.register(this.aiRouterExecutor);
        this.executorRegistry.register(this.mongoDBExecutor);
        this.executorRegistry.register(this.postgresqlExecutor);
        this.executorRegistry.register(this.mysqlExecutor);
        this.executorRegistry.register(this.mergeExecutor);
        this.executorRegistry.register(this.crmExecutor);
        this.executorRegistry.register(this.vapiExecutor);
        this.executorRegistry.register(this.morganLeadsExecutor);
        this.executorRegistry.register(this.flynFeedbackExecutor);
        this.executorRegistry.register(this.hrAgentExecutor);
        this.executorRegistry.register(this.freelancerVoiceAgentExecutor);
        this.executorRegistry.register(this.churchVoiceAgentExecutor);
        this.executorRegistry.register(this.webrtcExecutor);
        this.executorRegistry.register(this.hrExecutor);
        this.executorRegistry.register(this.churchExecutor);
        this.executorRegistry.register(this.freelancerExecutor);
        this.executorRegistry.register(this.coachesExecutor);
        this.executorRegistry.register(this.inboxTriggerExecutor);
        this.executorRegistry.register(this.sendReplyExecutor);
        this.executorRegistry.register(this.decisionExecutor);
        this.executorRegistry.register(this.aiActionExecutor);
        this.executorRegistry.register(this.queryRecordsExecutor);
        this.executorRegistry.register(this.aiDecisionExecutor);
        this.executorRegistry.register(this.dynamicVoiceAgentExecutor);
        this.executorRegistry.register(this.sendWhatsAppExecutor);
        this.executorRegistry.register(this.accountingExecutor);
        this.executorRegistry.register(this.tasksExecutor);
        this.executorRegistry.register(this.billingExecutor);
        this.executorRegistry.register(this.phonebookExecutor);
        this.executorRegistry.register(this.customCodeExecutor);
    }

    /**
     * Start executing a compiled workflow
     */
    async executeWorkflow(
        workflow: CompiledWorkflow,
        triggerSource: TriggerSource,
        triggerData: Record<string, unknown>,
    ): Promise<WorkflowRun> {
        this.logger.log(`Starting workflow execution: ${workflow.id}`);

        // Create the workflow run
        const workflowRun = await this.runtime.startWorkflow(
            workflow,
            triggerSource,
            triggerData,
        );

        // Update status to running
        await this.runtime.updateStatus(workflowRun.id, WorkflowRunStatus.RUNNING);

        // Start execution from the initial token
        const tokens = await this.runtime.getActiveTokens(workflowRun.id);

        for (const token of tokens) {
            await this.executeFromToken(workflow, workflowRun, token);
        }

        return this.runtime.getWorkflowRun(workflowRun.id) as Promise<WorkflowRun>;
    }

    /**
     * Execute workflow from a specific token
     */
    private async executeFromToken(
        workflow: CompiledWorkflow,
        workflowRun: WorkflowRun,
        token: ExecutionToken,
    ): Promise<void> {
        let currentToken = token;

        while (currentToken.status === TokenStatus.ACTIVE) {
            const nodeId = currentToken.currentNodeId;
            this.logger.debug(`Token ${currentToken.id.substring(0, 8)} executing node: ${nodeId} (visited: ${currentToken.visitedNodes.join(', ')})`);
            const node = this.traversal.getNode(workflow, nodeId);

            if (!node) {
                this.logger.error(`Node not found: ${nodeId}`);
                await this.handleExecutionFailure(workflowRun.id, nodeId, {
                    code: 'NODE_NOT_FOUND',
                    message: `Node ${nodeId} not found in workflow`,
                });
                return;
            }

            // ── Dependency gate ───────────────────────────────────────────────
            // If this node has multiple incoming edges (e.g. a Merge node fed by
            // parallel PostgreSQL + MongoDB branches), only execute it once ALL
            // upstream source nodes have produced outputs.  When the FIRST branch
            // arrives the missing dependency causes a silent skip; the SECOND
            // branch arrives with every source ready and executes properly.
            const incomingEdges = this.traversal.getIncomingEdges(workflow, nodeId);
            if (incomingEdges.length > 1) {
                const nodeOutputs = workflowRun.context.nodeOutputs as Record<string, unknown>;
                const missingDeps = incomingEdges
                    .map(e => e.source)
                    .filter(srcId => nodeOutputs[srcId] === undefined);

                if (missingDeps.length > 0) {
                    this.logger.debug(
                        `Dependency gate: node "${nodeId}" is waiting for [${missingDeps.join(', ')}] — skipping this pass`
                    );
                    // Complete this token silently; the other branch will re-trigger
                    await this.runtime.updateToken(workflowRun.id, currentToken.id, {
                        status: TokenStatus.COMPLETED,
                    });
                    return;
                }
            }

            // Execute the node
            const result = await this.executeNode(workflow, workflowRun, currentToken, node);

            // Handle the result
            if (result.status === 'COMPLETED') {
                // Record the output
                await this.runtime.updateContext(workflowRun.id, {
                    nodeOutputs: { [nodeId]: result.output },
                });

                // ── Persist loop state so next iteration reads the right index ──
                // The CRM (or other body) node overwrites token.data, so we
                // stash the next index in context.variables keyed by loop node ID.
                if (
                    result.output._loopContinue === true &&
                    result.output._nextLoopIndex !== undefined
                ) {
                    await this.runtime.updateContext(workflowRun.id, {
                        variables: { [`_loopIdx_${nodeId}`]: result.output._nextLoopIndex },
                    });
                }

                // Get next nodes (use enriched outputs so edge conditions can resolve type aliases)
                const outputsWithCurrent = { ...workflowRun.context.nodeOutputs, [nodeId]: result.output };
                const enrichedForTraversal = this.buildEnrichedOutputs(workflow, outputsWithCurrent);
                const nextNodeIds = this.traversal.getNextNodes(
                    workflow,
                    nodeId,
                    result,
                    enrichedForTraversal,
                );

                this.logger.debug(`Node ${nodeId} → next: [${nextNodeIds.join(', ')}] (result.nextNodeIds: ${result.nextNodeIds?.join(', ') || 'none'})`);

                // Mark token visited
                currentToken.visitedNodes.push(nodeId);

                if (nextNodeIds.length === 0) {
                    // End of workflow path
                    await this.runtime.updateToken(workflowRun.id, currentToken.id, {
                        status: TokenStatus.COMPLETED,
                    });
                    await this.checkWorkflowCompletion(workflowRun.id);
                    return;
                }

                if (nextNodeIds.length === 1) {
                    // Simple forward - update token
                    currentToken.currentNodeId = nextNodeIds[0];
                    currentToken.data = result.output;
                    await this.runtime.updateToken(workflowRun.id, currentToken.id, currentToken);
                } else {
                    // Parallel execution - create new tokens
                    await this.handleParallelExecution(
                        workflow,
                        workflowRun,
                        currentToken,
                        nextNodeIds,
                        result.output,
                    );
                    return;
                }
            } else if (result.status === 'WAIT') {
                // Pause execution
                await this.runtime.updateToken(workflowRun.id, currentToken.id, {
                    status: TokenStatus.WAITING,
                });
                await this.runtime.updateStatus(workflowRun.id, WorkflowRunStatus.WAITING);

                // Store resume condition (would trigger event bus registration in production)
                this.logger.log(`Workflow paused at node ${nodeId}`, {
                    resumeCondition: result.resumeCondition,
                });
                return;
            } else if (result.status === 'FAILED') {
                await this.handleExecutionFailure(workflowRun.id, nodeId, result.error);
                return;
            }
        }
    }

    /**
     * Execute a single node
     */
    private async executeNode(
        workflow: CompiledWorkflow,
        workflowRun: WorkflowRun,
        token: ExecutionToken,
        node: { id: string; type: string; name: string; config: Record<string, unknown> },
    ): Promise<NodeResult> {
        this.logger.debug(`Executing node: ${node.id} (${node.type})`);

        // Record node run start
        const nodeRun = await this.runtime.recordNodeRun({
            workflowRunId: workflowRun.id,
            nodeId: node.id,
            tokenId: token.id,
            status: NodeRunStatus.RUNNING,
            input: token.data,
            startedAt: new Date(),
            attemptNumber: 1,
            maxAttempts: 3,
        });

        try {
            // Get executor
            const executor = this.executorRegistry.get(node.type);

            // Build enriched previousOutputs with type-based aliases
            // This allows expressions like "trigger.data.lead_score" to resolve
            // by mapping node types (trigger, action, etc.) to their outputs
            const enrichedOutputs = this.buildEnrichedOutputs(
                workflow,
                workflowRun.context.nodeOutputs,
            );

            // Build execution context
            const context: NodeExecutionContext = {
                workflowRunId: workflowRun.id,
                workflowId: workflow.id,
                tenantId: workflowRun.tenantId,
                token,
                nodeConfig: node.config,
                previousOutputs: enrichedOutputs,
                variables: workflowRun.context.variables,
                services: {
                    emit: async (event, data) => {
                        this.logger.debug(`Event emitted: ${event}`, data);
                        // In production, this would publish to event bus
                    },
                    log: (level, message, data) => {
                        this.logger.log(`[${node.id}] ${message}`, data);
                    },
                    getSecret: async (key) => {
                        // In production, this would fetch from secret manager
                        return undefined;
                    },
                },
            };

            // Execute with retry for transient failures
            const retryConfig = executor.defaultRetryPolicy;
            let result: NodeResult | undefined;
            let lastError: Error | undefined;

            for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
                try {
                    result = await executor.execute(node as any, context);
                    if (result.status !== 'FAILED' || !result.error?.retryable) break;
                    // Retryable failure — log and wait before next attempt
                    if (attempt < retryConfig.maxAttempts) {
                        const delayMs = Math.min(
                            retryConfig.initialDelayMs * Math.pow(2, attempt - 1),
                            retryConfig.maxDelayMs,
                        );
                        this.logger.warn(`Node ${node.id} retryable failure (attempt ${attempt}/${retryConfig.maxAttempts}), retrying in ${delayMs}ms: ${result.error.message}`);
                        await new Promise(r => setTimeout(r, delayMs));
                    }
                } catch (execErr) {
                    lastError = execErr as Error;
                    if (attempt < retryConfig.maxAttempts) {
                        const delayMs = Math.min(
                            retryConfig.initialDelayMs * Math.pow(2, attempt - 1),
                            retryConfig.maxDelayMs,
                        );
                        this.logger.warn(`Node ${node.id} threw on attempt ${attempt}/${retryConfig.maxAttempts}, retrying in ${delayMs}ms`);
                        await new Promise(r => setTimeout(r, delayMs));
                    }
                }
            }

            if (!result) {
                // All attempts threw exceptions
                throw lastError || new Error(`Node ${node.id} failed after ${retryConfig.maxAttempts} attempts`);
            }

            // Update node run record
            const now = new Date();
            await this.runtime.updateNodeRun(workflowRun.id, nodeRun.id, {
                status: result.status === 'COMPLETED' ? NodeRunStatus.COMPLETED :
                    result.status === 'WAIT' ? NodeRunStatus.WAITING :
                        NodeRunStatus.FAILED,
                output: result.status === 'COMPLETED' ? result.output :
                    result.status === 'WAIT' ? result.partialOutput : undefined,
                completedAt: now,
                durationMs: now.getTime() - nodeRun.startedAt.getTime(),
                resumeCondition: result.status === 'WAIT' ? result.resumeCondition : undefined,
                error: result.status === 'FAILED' ? {
                    code: result.error.code,
                    message: result.error.message,
                } : undefined,
            });

            return result;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Node execution error: ${err.message}`, err.stack);

            await this.runtime.updateNodeRun(workflowRun.id, nodeRun.id, {
                status: NodeRunStatus.FAILED,
                error: {
                    code: 'EXECUTION_ERROR',
                    message: err.message,
                    stack: err.stack,
                },
                completedAt: new Date(),
            });

            return {
                status: 'FAILED',
                error: {
                    code: 'EXECUTION_ERROR',
                    message: err.message,
                    retryable: true,
                },
            };
        }
    }

    /**
     * Build enriched outputs that include type-based aliases
     * Maps node types (trigger, action, etc.) to their outputs
     * so expressions like "trigger.data.lead_score" resolve correctly.
     * 
     * Creates aliases like:
     *   - "trigger" → output of the trigger node
     *   - "trigger_0" → output of the first trigger node (if multiple)
     *   - keeps original nodeId keys intact
     */
    private buildEnrichedOutputs(
        workflow: CompiledWorkflow,
        nodeOutputs: Record<string, unknown>,
    ): Record<string, unknown> {
        const enriched: Record<string, unknown> = { ...nodeOutputs };

        // Track type counts for disambiguation (trigger_0, action_0, action_1, etc.)
        const typeCounts: Record<string, number> = {};

        for (const node of workflow.compiled_nodes) {
            const output = nodeOutputs[node.id];
            if (output === undefined) continue;

            const nodeType = node.type;
            const count = typeCounts[nodeType] || 0;
            typeCounts[nodeType] = count + 1;

            // Always add indexed alias: trigger_0, action_0, action_1, etc.
            // IMPORTANT: only write the alias if it doesn't clash with a real
            // node ID that's already in enriched (e.g. a node literally named
            // "hr_1" must not be overwritten by the alias for the 2nd hr-type node).
            const aliasKey = `${nodeType}_${count}`;
            if (!(aliasKey in nodeOutputs)) {
                enriched[aliasKey] = output;
            }

            // For the FIRST node of each type, also add the plain type alias
            // e.g., "trigger" → first trigger node's output
            if (count === 0) {
                enriched[nodeType] = output;
            }

            // Also add by node name (sanitized) for human-readable references
            if (node.name) {
                const safeName = node.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                if (!enriched[safeName]) {
                    enriched[safeName] = output;
                }
            }

            // ── Loop / Iterator — flatten current item variables to root ────
            // When a loop node returns _loopContinue:true, it holds the current
            // item as e.g. { customer: {...}, index: 0, _loopContinue: true }.
            // Flatten every non-underscore-prefixed key to root so that
            // {{customer.name}} resolves directly instead of needing {{loop_1.customer.name}}.
            if (
                output &&
                typeof output === 'object' &&
                !Array.isArray(output) &&
                (output as Record<string, unknown>)._loopContinue === true
            ) {
                for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
                    if (!k.startsWith('_')) {
                        enriched[k] = v; // e.g. enriched['customer'] = currentItem
                    }
                }
            }
        }

        return enriched;
    }

    /**
     * Handle parallel execution paths
     */
    private async handleParallelExecution(
        workflow: CompiledWorkflow,
        workflowRun: WorkflowRun,
        parentToken: ExecutionToken,
        nextNodeIds: string[],
        data: Record<string, unknown>,
    ): Promise<void> {
        this.logger.debug(`Creating ${nextNodeIds.length} parallel tokens`);

        // Complete the parent token
        await this.runtime.updateToken(workflowRun.id, parentToken.id, {
            status: TokenStatus.MERGED,
        });

        // Create child tokens for each path
        for (const nodeId of nextNodeIds) {
            const newToken = await this.runtime.createToken(
                workflowRun.id,
                nodeId,
                parentToken.id,
                data,
            );

            // Execute each parallel path
            await this.executeFromToken(workflow, workflowRun, newToken);
        }
    }

    /**
     * Check if the workflow has completed
     */
    private async checkWorkflowCompletion(runId: string): Promise<void> {
        const activeTokens = await this.runtime.getActiveTokens(runId);

        if (activeTokens.length === 0) {
            await this.runtime.updateStatus(runId, WorkflowRunStatus.COMPLETED);
            this.logger.log(`Workflow completed: ${runId}`);
        }
    }

    /**
     * Handle execution failure
     */
    private async handleExecutionFailure(
        runId: string,
        nodeId: string,
        error: { code: string; message: string },
    ): Promise<void> {
        this.logger.error(`Workflow failed at node ${nodeId}: ${error.message}`);

        const workflowRun = await this.runtime.getWorkflowRun(runId);
        if (workflowRun) {
            workflowRun.error = {
                nodeId,
                message: error.message,
                code: error.code,
                timestamp: new Date(),
            };
        }

        await this.runtime.updateStatus(runId, WorkflowRunStatus.FAILED);
    }

    /**
     * Resume a waiting workflow
     */
    async resumeWorkflow(
        runId: string,
        resumeData: Record<string, unknown>,
    ): Promise<WorkflowRun | undefined> {
        const workflowRun = await this.runtime.getWorkflowRun(runId);
        if (!workflowRun || workflowRun.status !== WorkflowRunStatus.WAITING) {
            this.logger.warn(`Cannot resume workflow ${runId}: not in WAITING state`);
            return undefined;
        }

        this.logger.log(`Resuming workflow: ${runId}`);

        // Update context with resume data
        await this.runtime.updateContext(runId, { resumeData });
        await this.runtime.updateStatus(runId, WorkflowRunStatus.RUNNING);

        // Get waiting tokens and resume execution
        const tokens = await this.runtime.getActiveTokens(runId);
        const waitingTokens = tokens.filter(t => t.status === TokenStatus.WAITING);

        if (waitingTokens.length === 0) {
            this.logger.warn(`Resume workflow ${runId}: no waiting tokens found`);
            return this.runtime.getWorkflowRun(runId);
        }

        // Load workflow definition from storage and continue execution
        const workflow = await this.storage.get(workflowRun.workflowId);
        if (!workflow) {
            this.logger.error(`Resume workflow ${runId}: workflow definition not found for id ${workflowRun.workflowId}`);
            await this.runtime.updateStatus(runId, WorkflowRunStatus.FAILED);
            return this.runtime.getWorkflowRun(runId);
        }

        // Inject resume data into each waiting token and continue execution
        for (const token of waitingTokens) {
            await this.runtime.updateToken(runId, token.id, {
                status: TokenStatus.ACTIVE,
                data: { ...token.data, ...resumeData, _resumedAt: new Date().toISOString() },
            });
            const activeToken = { ...token, status: TokenStatus.ACTIVE, data: { ...token.data, ...resumeData } };
            // Run async — do not await to avoid blocking the HTTP response
            this.executeFromToken(workflow, workflowRun, activeToken).catch(err => {
                this.logger.error(`Error resuming token ${token.id}: ${err.message}`);
            });
        }

        return this.runtime.getWorkflowRun(runId);
    }

    /**
     * Get workflow run status
     */
    async getWorkflowRun(runId: string): Promise<WorkflowRun | undefined> {
        return this.runtime.getWorkflowRun(runId);
    }

    /**
     * Get execution history
     */
    async getExecutionHistory(runId: string) {
        return this.runtime.getExecutionHistory(runId);
    }
}
