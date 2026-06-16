import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ActionExecutor } from '../executors/action.executor';
import { NodeType, CompiledNode } from '../../types';
import { NodeExecutionContext, ExecutionToken, TokenStatus } from '../../types/execution.types';

describe('ActionExecutor', () => {
    let executor: ActionExecutor;
    let httpService: jest.Mocked<HttpService>;

    beforeEach(async () => {
        const mockHttpService = {
            request: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ActionExecutor,
                { provide: HttpService, useValue: mockHttpService },
            ],
        }).compile();

        executor = module.get<ActionExecutor>(ActionExecutor);
        httpService = module.get(HttpService);
    });

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
            currentNodeId: 'action-1',
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
        id: 'action-1',
        type: NodeType.ACTION,
        name: 'Test Action',
        config,
    });

    describe('log action', () => {
        it('should log message and return completed', async () => {
            const node = createNode({
                actionType: 'log',
                message: 'Test log message',
            });

            const context = createContext();
            const result = await executor.execute(node, context);

            expect(result.status).toBe('COMPLETED');
            if (result.status === 'COMPLETED') {
                // Output is wrapped: { success, actionType, result: {...} }
                expect(result.output?.success).toBe(true);
                expect(result.output?.actionType).toBe('log');
                const innerResult = result.output?.result as Record<string, unknown>;
                expect(innerResult?.logged).toBe(true);
            }
        });
    });

    describe('http_request action', () => {
        it('should make HTTP request and return response', async () => {
            httpService.request.mockReturnValue(of({
                data: { id: 1, name: 'Test' },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as never,
            }) as never);

            const node = createNode({
                actionType: 'http_request',
                url: 'https://api.example.com/data',
                method: 'GET',
            });

            const context = createContext();
            const result = await executor.execute(node, context);

            expect(result.status).toBe('COMPLETED');
            if (result.status === 'COMPLETED') {
                expect(result.output?.success).toBe(true);
                const innerResult = result.output?.result as Record<string, unknown>;
                expect(innerResult?.statusCode).toBe(200);
            }
        });

        it('should handle HTTP errors gracefully', async () => {
            httpService.request.mockReturnValue(throwError(() => ({
                response: {
                    status: 404,
                    statusText: 'Not Found',
                    data: { error: 'Resource not found' },
                },
            })) as never);

            const node = createNode({
                actionType: 'http_request',
                url: 'https://api.example.com/missing',
                method: 'GET',
            });

            const context = createContext();
            const result = await executor.execute(node, context);

            expect(result.status).toBe('FAILED');
        });
    });

    describe('email action (mock)', () => {
        it('should return mock email sent response', async () => {
            const node = createNode({
                actionType: 'email',
                to: ['test@example.com'],
                subject: 'Test Email',
                body: 'Hello World',
            });

            const context = createContext();
            const result = await executor.execute(node, context);

            expect(result.status).toBe('COMPLETED');
            if (result.status === 'COMPLETED') {
                expect(result.output?.success).toBe(true);
                const innerResult = result.output?.result as Record<string, unknown>;
                expect(innerResult?.sent).toBe(true);
            }
        });
    });
});
