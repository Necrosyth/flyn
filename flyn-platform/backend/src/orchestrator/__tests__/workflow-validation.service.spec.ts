import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowValidationService } from '../workflow-validation.service';
import { CompiledWorkflow, NodeType } from '../types';

describe('WorkflowValidationService', () => {
    let service: WorkflowValidationService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [WorkflowValidationService],
        }).compile();

        service = module.get<WorkflowValidationService>(WorkflowValidationService);
    });

    const createValidWorkflow = (): CompiledWorkflow => ({
        id: 'valid-workflow',
        name: 'Valid Workflow',
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
                name: 'Action',
                config: { actionType: 'log', message: 'test' },
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

    describe('validate', () => {
        it('should return valid for a correct workflow', () => {
            const workflow = createValidWorkflow();
            const result = service.validate(workflow);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect missing workflow ID', () => {
            const workflow = createValidWorkflow();
            workflow.id = '';

            const result = service.validate(workflow);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === 'MISSING_ID')).toBe(true);
        });

        it('should detect missing workflow name', () => {
            const workflow = createValidWorkflow();
            workflow.name = '';

            const result = service.validate(workflow);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === 'MISSING_NAME')).toBe(true);
        });

        it('should detect missing tenant ID', () => {
            const workflow = createValidWorkflow();
            workflow.tenantId = '';

            const result = service.validate(workflow);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === 'MISSING_TENANT')).toBe(true);
        });

        it('should detect duplicate node IDs', () => {
            const workflow = createValidWorkflow();
            workflow.compiled_nodes.push({
                id: 'trigger-1', // Duplicate!
                type: NodeType.ACTION,
                name: 'Duplicate',
                config: { actionType: 'log' },
            });

            const result = service.validate(workflow);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === 'DUPLICATE_NODE_ID')).toBe(true);
        });

        it('should detect invalid edge source', () => {
            const workflow = createValidWorkflow();
            workflow.compiled_edges.push({
                id: 'edge-2',
                source: 'non-existent',
                target: 'action-1',
            });

            const result = service.validate(workflow);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === 'INVALID_SOURCE')).toBe(true);
        });

        it('should detect invalid edge target', () => {
            const workflow = createValidWorkflow();
            workflow.compiled_edges.push({
                id: 'edge-2',
                source: 'trigger-1',
                target: 'non-existent',
            });

            const result = service.validate(workflow);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === 'INVALID_TARGET')).toBe(true);
        });

        it('should detect missing trigger type', () => {
            const workflow = createValidWorkflow();
            workflow.compiled_nodes[0].config = {}; // Missing triggerType

            const result = service.validate(workflow);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === 'MISSING_TRIGGER_TYPE')).toBe(true);
        });

        it('should detect missing action type', () => {
            const workflow = createValidWorkflow();
            workflow.compiled_nodes[1].config = {}; // Missing actionType

            const result = service.validate(workflow);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === 'MISSING_ACTION_TYPE')).toBe(true);
        });

        it('should warn about orphan nodes', () => {
            const workflow = createValidWorkflow();
            workflow.compiled_nodes.push({
                id: 'orphan-node',
                type: NodeType.ACTION,
                name: 'Orphan',
                config: { actionType: 'log' },
            });

            const result = service.validate(workflow);

            // Orphan nodes are warnings, not errors
            expect(result.valid).toBe(true);
            expect(result.warnings.some(w => w.code === 'ORPHAN_NODE')).toBe(true);
        });
    });

    describe('isValid', () => {
        it('should return true for valid workflow', () => {
            const workflow = createValidWorkflow();
            expect(service.isValid(workflow)).toBe(true);
        });

        it('should return false for invalid workflow', () => {
            const workflow = createValidWorkflow();
            workflow.id = '';
            expect(service.isValid(workflow)).toBe(false);
        });
    });
});
