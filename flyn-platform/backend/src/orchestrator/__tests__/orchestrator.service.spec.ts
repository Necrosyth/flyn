import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule } from '@nestjs/axios';
import { OrchestratorService } from '../orchestrator.service';
import { WorkflowRuntimeService } from '../workflow-runtime';
import { GraphTraversalService } from '../graph-traversal';
import { ExecutorRegistryService } from '../node-executor';
import { FirebaseService } from '../../firebase/firebase.service';
import {
    CompiledWorkflow,
    NodeType,
    TriggerSource,
    WorkflowRunStatus,
} from '../types';

// Mock executors
import {
    TriggerExecutor,
    ActionExecutor,
    ConditionExecutor,
    WaitExecutor,
    EndExecutor,
} from '../node-executor';

describe('OrchestratorService Integration', () => {
    let orchestrator: OrchestratorService;
    let runtime: WorkflowRuntimeService;

    beforeEach(async () => {
        const mockFirebaseService = {
            firestore: jest.fn().mockReturnValue(null), // Use in-memory storage
            auth: jest.fn().mockReturnValue(null),
        };

        const module: TestingModule = await Test.createTestingModule({
            imports: [HttpModule],
            providers: [
                OrchestratorService,
                WorkflowRuntimeService,
                GraphTraversalService,
                ExecutorRegistryService,
                TriggerExecutor,
                ActionExecutor,
                ConditionExecutor,
                WaitExecutor,
                EndExecutor,
                { provide: FirebaseService, useValue: mockFirebaseService },
            ],
        }).compile();

        orchestrator = module.get<OrchestratorService>(OrchestratorService);
        runtime = module.get<WorkflowRuntimeService>(WorkflowRuntimeService);

        // Initialize the module
        await orchestrator.onModuleInit();
    });

    const createSimpleWorkflow = (): CompiledWorkflow => ({
        id: 'test-workflow-1',
        name: 'Simple Test Workflow',
        version: 1,
        tenantId: 'test-tenant',
        compiled_nodes: [
            {
                id: 'trigger-1',
                type: NodeType.TRIGGER,
                name: 'Start',
                config: { triggerType: 'manual' },
            },
            {
                id: 'action-1',
                type: NodeType.ACTION,
                name: 'Log Action',
                config: {
                    actionType: 'log',
                    message: 'Hello from test!',
                },
            },
        ],
        compiled_edges: [
            { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
        ],
        execution_plan: {
            startNodeId: 'trigger-1',
            endNodeIds: ['action-1'],
            nodeOrder: ['trigger-1', 'action-1'],
            parallelPaths: [],
        },
        metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test',
        },
    });

    const createConditionWorkflow = (): CompiledWorkflow => ({
        id: 'test-workflow-condition',
        name: 'Condition Test Workflow',
        version: 1,
        tenantId: 'test-tenant',
        compiled_nodes: [
            {
                id: 'trigger-1',
                type: NodeType.TRIGGER,
                name: 'Start',
                config: { triggerType: 'manual' },
            },
            {
                id: 'condition-1',
                type: NodeType.CONDITION,
                name: 'Check Amount',
                config: {
                    conditions: [
                        {
                            type: 'field_comparison',
                            field: 'amount',
                            operator: '>',
                            value: 100,
                            targetNodeId: 'action-high',
                        },
                    ],
                    defaultPath: 'action-low',
                },
            },
            {
                id: 'action-high',
                type: NodeType.ACTION,
                name: 'High Amount',
                config: { actionType: 'log', message: 'High amount!' },
            },
            {
                id: 'action-low',
                type: NodeType.ACTION,
                name: 'Low Amount',
                config: { actionType: 'log', message: 'Low amount' },
            },
        ],
        compiled_edges: [
            { id: 'edge-1', source: 'trigger-1', target: 'condition-1' },
            { id: 'edge-2', source: 'condition-1', target: 'action-high' },
            { id: 'edge-3', source: 'condition-1', target: 'action-low' },
        ],
        execution_plan: {
            startNodeId: 'trigger-1',
            endNodeIds: ['action-high', 'action-low'],
            nodeOrder: ['trigger-1', 'condition-1', 'action-high', 'action-low'],
            parallelPaths: [],
        },
        metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test',
        },
    });

    describe('executeWorkflow', () => {
        it('should execute a simple workflow to completion', async () => {
            const workflow = createSimpleWorkflow();
            const triggerSource: TriggerSource = { type: 'manual' };

            const result = await orchestrator.executeWorkflow(
                workflow,
                triggerSource,
                { testData: 'value' },
            );

            expect(result).toBeDefined();
            expect(result.id).toBeDefined();
            expect(result.workflowId).toBe('test-workflow-1');
            expect(result.status).toBe(WorkflowRunStatus.COMPLETED);
        });

        it('should store workflow run in runtime', async () => {
            const workflow = createSimpleWorkflow();
            const triggerSource: TriggerSource = { type: 'manual' };

            const result = await orchestrator.executeWorkflow(
                workflow,
                triggerSource,
                {},
            );

            const storedRun = await runtime.getWorkflowRun(result.id);
            expect(storedRun).toBeDefined();
            expect(storedRun?.id).toBe(result.id);
        });

        it('should execute condition workflow and take correct branch', async () => {
            const workflow = createConditionWorkflow();
            const triggerSource: TriggerSource = { type: 'manual' };

            // High amount should take high branch
            const result = await orchestrator.executeWorkflow(
                workflow,
                triggerSource,
                { amount: 150 },
            );

            expect(result.status).toBe(WorkflowRunStatus.COMPLETED);

            // Check execution history
            const history = await orchestrator.getExecutionHistory(result.id);
            const nodeIds = history.map(h => h.nodeId);
            expect(nodeIds).toContain('action-high');
            expect(nodeIds).not.toContain('action-low');
        });

        it('should take default branch when condition not met', async () => {
            const workflow = createConditionWorkflow();
            const triggerSource: TriggerSource = { type: 'manual' };

            // Low amount should take low branch
            const result = await orchestrator.executeWorkflow(
                workflow,
                triggerSource,
                { amount: 50 },
            );

            expect(result.status).toBe(WorkflowRunStatus.COMPLETED);

            const history = await orchestrator.getExecutionHistory(result.id);
            const nodeIds = history.map(h => h.nodeId);
            expect(nodeIds).toContain('action-low');
            expect(nodeIds).not.toContain('action-high');
        });
    });

    describe('getWorkflowRun', () => {
        it('should return workflow run by ID', async () => {
            const workflow = createSimpleWorkflow();
            const result = await orchestrator.executeWorkflow(
                workflow,
                { type: 'manual' },
                {},
            );

            const fetched = await orchestrator.getWorkflowRun(result.id);

            expect(fetched).toBeDefined();
            expect(fetched?.id).toBe(result.id);
            expect(fetched?.workflowId).toBe(workflow.id);
        });

        it('should return undefined for non-existent ID', async () => {
            const fetched = await orchestrator.getWorkflowRun('non-existent-id');
            expect(fetched).toBeUndefined();
        });
    });

    describe('getExecutionHistory', () => {
        it('should return execution history for workflow run', async () => {
            const workflow = createSimpleWorkflow();
            const result = await orchestrator.executeWorkflow(
                workflow,
                { type: 'manual' },
                {},
            );

            const history = await orchestrator.getExecutionHistory(result.id);

            expect(history).toBeDefined();
            expect(history.length).toBeGreaterThan(0);
            expect(history[0].workflowRunId).toBe(result.id);
        });
    });
});
