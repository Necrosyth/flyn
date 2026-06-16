import { Test, TestingModule } from '@nestjs/testing';
import { ConditionExecutor } from '../executors/condition.executor';
import { NodeType, CompiledNode } from '../../types';
import { NodeExecutionContext, ExecutionToken, TokenStatus } from '../../types/execution.types';

describe('ConditionExecutor', () => {
    let executor: ConditionExecutor;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ConditionExecutor],
        }).compile();

        executor = module.get<ConditionExecutor>(ConditionExecutor);
    });

    // Helper to create a mock context matching actual interface
    const createContext = (
        nodeConfig: Record<string, unknown> = {},
        previousOutputs: Record<string, unknown> = {},
    ): NodeExecutionContext => ({
        workflowRunId: 'test-run-id',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        token: {
            id: 'token-1',
            workflowRunId: 'test-run-id',
            currentNodeId: 'condition-1',
            status: TokenStatus.ACTIVE,
            data: {},
            visitedNodes: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        } as ExecutionToken,
        nodeConfig,
        previousOutputs,
        variables: {},
        services: {
            emit: jest.fn(),
            log: jest.fn(),
            getSecret: jest.fn(),
        },
    });

    const createNode = (config: Record<string, unknown>): CompiledNode => ({
        id: 'condition-1',
        type: NodeType.CONDITION,
        name: 'Test Condition',
        config,
    });

    describe('execute', () => {
        it('should return COMPLETED status for valid conditions', async () => {
            const node = createNode({
                conditions: [
                    {
                        type: 'field_comparison',
                        field: 'amount',
                        operator: '>',
                        value: 100,
                        targetNodeId: 'high-branch',
                    },
                ],
                defaultPath: 'low-branch',
            });

            // Pass amount via previousOutputs (trigger node output)
            const context = createContext({}, { trigger: { amount: 150 } });
            const result = await executor.execute(node, context);

            expect(result.status).toBe('COMPLETED');
            if (result.status === 'COMPLETED') {
                expect(result.output).toBeDefined();
            }
        });

        it('should handle equality comparison', async () => {
            const node = createNode({
                conditions: [
                    {
                        type: 'field_comparison',
                        field: 'status',
                        operator: '==',
                        value: 'approved',
                        targetNodeId: 'approved-branch',
                    },
                ],
                defaultPath: 'pending-branch',
            });

            const context = createContext({}, { trigger: { status: 'approved' } });
            const result = await executor.execute(node, context);

            expect(result.status).toBe('COMPLETED');
        });

        it('should handle less than operator', async () => {
            const node = createNode({
                conditions: [
                    {
                        type: 'field_comparison',
                        field: 'count',
                        operator: '<',
                        value: 5,
                        targetNodeId: 'low-count',
                    },
                ],
                defaultPath: 'high-count',
            });

            const context = createContext({}, { trigger: { count: 3 } });
            const result = await executor.execute(node, context);

            expect(result.status).toBe('COMPLETED');
        });
    });
});
