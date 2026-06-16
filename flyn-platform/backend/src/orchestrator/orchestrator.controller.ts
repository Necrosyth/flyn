import { Controller, Post, Get, Body, Param, Logger } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { CompiledWorkflow, NodeType, TriggerSource } from './types';
import { VapiService } from './vapi/vapi.service';
import { WebRTCService } from './webrtc/webrtc.service';

/**
 * Test Controller for Orchestrator
 * 
 * Provides endpoints to test workflow execution during development.
 * Use these endpoints to verify the orchestrator is working correctly.
 */
@Controller('orchestrator')
export class OrchestratorController {
    private readonly logger = new Logger(OrchestratorController.name);

    constructor(
        private readonly orchestrator: OrchestratorService,
        private readonly vapiService: VapiService,
        private readonly webrtcService: WebRTCService,
    ) { }

    /**
     * Execute a test workflow
     * POST /orchestrator/test
     */
    @Post('test')
    async executeTestWorkflow(@Body() body: { data?: Record<string, unknown> }) {
        // Create a simple test workflow
        const testWorkflow: CompiledWorkflow = {
            id: 'test-workflow-001',
            name: 'Test Workflow',
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
                        message: 'Hello from the orchestrator!'
                    },
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
                    name: 'High Amount Action',
                    config: {
                        actionType: 'log',
                        message: 'High amount detected!'
                    },
                },
                {
                    id: 'action-low',
                    type: NodeType.ACTION,
                    name: 'Low Amount Action',
                    config: {
                        actionType: 'log',
                        message: 'Low amount detected'
                    },
                },
            ],
            compiled_edges: [
                { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
                { id: 'edge-2', source: 'action-1', target: 'condition-1' },
                { id: 'edge-3', source: 'condition-1', target: 'action-high' },
                { id: 'edge-4', source: 'condition-1', target: 'action-low' },
            ],
            execution_plan: {
                startNodeId: 'trigger-1',
                endNodeIds: ['action-high', 'action-low'],
                nodeOrder: ['trigger-1', 'action-1', 'condition-1', 'action-high', 'action-low'],
                parallelPaths: [],
            },
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: 'test-user',
                description: 'A simple test workflow for development',
            },
        };

        const triggerSource: TriggerSource = {
            type: 'manual',
            metadata: { source: 'test-controller' },
        };

        const triggerData = body.data || { amount: 150, orderId: 'TEST-001' };

        const result = await this.orchestrator.executeWorkflow(
            testWorkflow,
            triggerSource,
            triggerData,
        );

        return {
            message: 'Workflow executed',
            workflowRunId: result.id,
            status: result.status,
            currentNodes: result.currentNodeIds,
        };
    }

    /**
     * Execute a custom workflow
     * POST /orchestrator/execute
     */
    @Post('execute')
    async executeWorkflow(
        @Body() body: {
            workflow: CompiledWorkflow;
            triggerData?: Record<string, unknown>;
        },
    ) {
        const triggerSource: TriggerSource = {
            type: 'manual',
            metadata: { source: 'api' },
        };

        const result = await this.orchestrator.executeWorkflow(
            body.workflow,
            triggerSource,
            body.triggerData || {},
        );

        return {
            workflowRunId: result.id,
            status: result.status,
            currentNodes: result.currentNodeIds,
            context: result.context,
        };
    }

    /**
     * Get workflow run status
     * GET /orchestrator/run/:id
     */
    @Get('run/:id')
    async getWorkflowRun(@Param('id') id: string) {
        this.logger.log(`Fetching workflow run: ${id}`);
        const run = await this.orchestrator.getWorkflowRun(id);

        if (!run) {
            this.logger.warn(`Workflow run not found in runtime service: ${id}`);
            return { error: 'Workflow run not found', id };
        }

        return {
            id: run.id,
            workflowId: run.workflowId,
            status: run.status,
            currentNodes: run.currentNodeIds,
            context: run.context,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            error: run.error,
        };
    }

    /**
     * Get execution history for a workflow run
     * GET /orchestrator/run/:id/history
     */
    @Get('run/:id/history')
    async getExecutionHistory(@Param('id') id: string) {
        const history = await this.orchestrator.getExecutionHistory(id);

        return {
            workflowRunId: id,
            nodeRuns: history.map(run => ({
                nodeId: run.nodeId,
                status: run.status,
                input: run.input,
                output: run.output,
                error: run.error,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
                durationMs: run.durationMs,
            })),
        };
    }

    /**
     * Test WAIT workflow (for testing pause/resume)
     * POST /orchestrator/test-wait
     */
    @Post('test-wait')
    async executeWaitWorkflow(@Body() body: { data?: Record<string, unknown> }) {
        const waitWorkflow: CompiledWorkflow = {
            id: 'wait-test-workflow',
            name: 'Wait Test Workflow',
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
                    name: 'Before Wait',
                    config: { actionType: 'log', message: 'Before wait...' },
                },
                {
                    id: 'wait-1',
                    type: NodeType.WAIT,
                    name: 'Wait for Event',
                    config: {
                        waitType: 'duration',
                        duration: 5,
                        unit: 'seconds',
                    },
                },
                {
                    id: 'action-2',
                    type: NodeType.ACTION,
                    name: 'After Wait',
                    config: { actionType: 'log', message: 'After wait!' },
                },
            ],
            compiled_edges: [
                { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
                { id: 'edge-2', source: 'action-1', target: 'wait-1' },
                { id: 'edge-3', source: 'wait-1', target: 'action-2' },
            ],
            execution_plan: {
                startNodeId: 'trigger-1',
                endNodeIds: ['action-2'],
                nodeOrder: ['trigger-1', 'action-1', 'wait-1', 'action-2'],
                parallelPaths: [],
            },
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: 'test-user',
            },
        };

        const result = await this.orchestrator.executeWorkflow(
            waitWorkflow,
            { type: 'manual' },
            body.data || {},
        );

        return {
            message: 'Wait workflow executed - should be in WAITING status',
            workflowRunId: result.id,
            status: result.status,
            note: 'Use GET /orchestrator/run/:id to check status',
        };
    }

    /**
     * Resume a waiting workflow
     * POST /orchestrator/run/:id/resume
     */
    @Post('run/:id/resume')
    async resumeWorkflow(
        @Param('id') id: string,
        @Body() body: { resumeData?: Record<string, unknown> },
    ) {
        const result = await this.orchestrator.resumeWorkflow(id, body.resumeData || {});

        if (!result) {
            return { error: 'Could not resume workflow', id };
        }

        return {
            message: 'Workflow resumed',
            workflowRunId: result.id,
            status: result.status,
        };
    }

    /**
     * AI-Powered Customer Support Ticket Router — DEMO FLOW
     * POST /orchestrator/demo-ai-router
     * 
     * A realistic multi-node flow that showcases:
     *   1. Trigger (manual / API)
     *   2. Action – Log the incoming ticket
     *   3. AI Router – Classify intent & urgency via Gemini
     *   4. Condition – Branch on AI confidence score
     *   5a. High-confidence path → Action (auto-respond to customer)
     *   5b. Low-confidence path → Action (escalate to human agent)
     *   6a/6b. End nodes that summarize what happened
     * 
     * Pass your own ticket text via the body:
     *   { "data": { "ticket_text": "...", "customer_name": "...", "customer_email": "..." } }
     */
    @Post('demo-ai-router')
    async executeDemoAIRouter(
        @Body() body: {
            data?: Record<string, unknown>;
            mock?: boolean; // Set to true to bypass real AI and use deterministic mock
        },
    ) {
        const useMock = body.mock !== false; // Default: mock=true for reliable demos
        const ticketData = {
            ticket_text:
                'I have been charged twice for my subscription this month. ' +
                'Please refund the duplicate charge immediately. My account ID is ACC-29481.',
            customer_name: 'Sarah Johnson',
            customer_email: 'sarah.johnson@example.com',
            priority: 'high',
            channel: 'email',
            ...body.data, // allow caller to override
        };

        // ── Determine mock AI classification from ticket keywords ───
        const text = (ticketData.ticket_text as string).toLowerCase();
        let mockIntent = 'general';
        let mockConfidence = 0.92;
        let mockClassification = 'general';
        if (text.includes('charge') || text.includes('refund') || text.includes('billing') || text.includes('payment') || text.includes('invoice')) {
            mockIntent = 'billing_issue'; mockClassification = 'billing'; mockConfidence = 0.95;
        } else if (text.includes('login') || text.includes('password') || text.includes('error') || text.includes('bug') || text.includes('crash')) {
            mockIntent = 'technical_issue'; mockClassification = 'technical'; mockConfidence = 0.88;
        } else if (text.includes('cancel') || text.includes('unsubscribe') || text.includes('close account')) {
            mockIntent = 'cancellation_request'; mockClassification = 'cancellation'; mockConfidence = 0.91;
        } else if (text.includes('angry') || text.includes('terrible') || text.includes('worst') || text.includes('sue')) {
            mockIntent = 'complaint'; mockClassification = 'complaint'; mockConfidence = 0.60; // low = escalate
        }

        // If mock mode, replace AI Router node with an Action that produces the same output shape
        const aiNode = useMock
            ? {
                id: 'ai-classify',
                type: NodeType.AI_ROUTER,
                name: 'AI: Classify Ticket (Mock)',
                config: {
                    task: 'classify_intent',
                    prompt: 'mock — no real AI call',
                    // Special mock config: the executor will check for _mockResult
                    // and return it directly instead of calling the AI provider
                    _mockResult: {
                        intent: mockIntent,
                        confidence: mockConfidence,
                        task: 'classify_intent',
                        classification: mockClassification,
                        routing: {
                            path: mockConfidence >= 0.75 ? 'high_confidence' : 'low_confidence',
                            reason: `Mock classification: ${mockClassification} (${(mockConfidence * 100).toFixed(1)}% confidence)`,
                        },
                        executedAt: new Date().toISOString(),
                        _mock: true,
                    },
                    confidenceThreshold: 0.75,
                    fallbackAction: 'human_review',
                },
                position: { x: 250, y: 260 },
            }
            : {
                id: 'ai-classify',
                type: NodeType.AI_ROUTER,
                name: 'AI: Classify Ticket',
                config: {
                    task: 'classify_intent',
                    prompt:
                        'Classify this customer support ticket and determine urgency.\n\n' +
                        'Customer: {{trigger.data.customer_name}}\n' +
                        'Channel: {{trigger.data.channel}}\n' +
                        'Message: "{{trigger.data.ticket_text}}"\n\n' +
                        'Classify intent (billing, technical, general, complaint, cancellation) ' +
                        'and provide a confidence score between 0 and 1.',
                    systemPrompt:
                        'You are a customer-support intent classifier for a SaaS company. ' +
                        'Classify the ticket intent into one of: billing, technical, general, complaint, cancellation. ' +
                        'Provide a confidence between 0.0 and 1.0.',
                    confidenceThreshold: 0.75,
                    fallbackAction: 'human_review',
                },
                position: { x: 250, y: 260 },
            };

        const demoWorkflow: CompiledWorkflow = {
            id: 'demo-ai-router-001',
            name: 'AI Customer Support Ticket Router',
            version: 1,
            tenantId: 'demo-tenant',
            compiled_nodes: [
                // ── 1. TRIGGER ──────────────────────────────────
                {
                    id: 'trigger-ticket',
                    type: NodeType.TRIGGER,
                    name: 'New Support Ticket',
                    config: { triggerType: 'manual' },
                    position: { x: 250, y: 0 },
                },
                // ── 2. ACTION – Log the incoming ticket ─────────
                {
                    id: 'action-log-ticket',
                    type: NodeType.ACTION,
                    name: 'Log Incoming Ticket',
                    config: {
                        actionType: 'log',
                        message: `📩 New ticket from {{trigger.data.customer_name}}: "{{trigger.data.ticket_text}}"`,
                    },
                    position: { x: 250, y: 120 },
                },
                // ── 3. AI ROUTER – Classify with Gemini (or mock) ──
                aiNode as any,
                // ── 4. CONDITION – Check confidence ─────────────
                {
                    id: 'condition-confidence',
                    type: NodeType.CONDITION,
                    name: 'Confidence Check',
                    config: {
                        conditions: [
                            {
                                type: 'field_comparison',
                                field: 'ai_router.confidence',
                                operator: '>=',
                                value: 0.75,
                                targetNodeId: 'action-auto-respond',
                            },
                        ],
                        defaultPath: 'action-escalate',
                    },
                    position: { x: 250, y: 400 },
                },
                // ── 5a. HIGH CONFIDENCE – Auto-respond ──────────
                {
                    id: 'action-auto-respond',
                    type: NodeType.ACTION,
                    name: 'Auto-Respond to Customer',
                    config: {
                        actionType: 'log',
                        message:
                            '✅ AUTO-RESPONSE sent to {{trigger.data.customer_email}}:\n' +
                            'Intent: {{ai_router.classification}} ({{ai_router.confidence}} confidence)\n' +
                            'Routing: {{ai_router.routing.path}}\n' +
                            'Thank you {{trigger.data.customer_name}}, your {{ai_router.classification}} request has been received. ' +
                            'A specialist will follow up within 24 hours.',
                    },
                    position: { x: 80, y: 540 },
                },
                // ── 5b. LOW CONFIDENCE – Escalate ───────────────
                {
                    id: 'action-escalate',
                    type: NodeType.ACTION,
                    name: 'Escalate to Human Agent',
                    config: {
                        actionType: 'log',
                        message:
                            '🚨 ESCALATED to human agent:\n' +
                            'Ticket from {{trigger.data.customer_name}} could not be confidently classified.\n' +
                            'AI said: {{ai_router.classification}} (confidence: {{ai_router.confidence}})\n' +
                            'Reason: {{ai_router.routing.reason}}\n' +
                            'Please review manually.',
                    },
                    position: { x: 420, y: 540 },
                },
                // ── 6a. END – Auto-response path ────────────────
                {
                    id: 'end-auto',
                    type: NodeType.END,
                    name: 'End: Auto-Resolved',
                    config: { includeAllOutputs: true },
                    position: { x: 80, y: 680 },
                },
                // ── 6b. END – Escalation path ───────────────────
                {
                    id: 'end-escalate',
                    type: NodeType.END,
                    name: 'End: Escalated',
                    config: { includeAllOutputs: true },
                    position: { x: 420, y: 680 },
                },
            ],
            compiled_edges: [
                { id: 'e1', source: 'trigger-ticket', target: 'action-log-ticket' },
                { id: 'e2', source: 'action-log-ticket', target: 'ai-classify' },
                { id: 'e3', source: 'ai-classify', target: 'condition-confidence' },
                // Condition routes via nextNodeIds inside the executor result,
                // but we still need edges so the graph knows the structure:
                { id: 'e4', source: 'condition-confidence', target: 'action-auto-respond' },
                { id: 'e5', source: 'condition-confidence', target: 'action-escalate' },
                { id: 'e6', source: 'action-auto-respond', target: 'end-auto' },
                { id: 'e7', source: 'action-escalate', target: 'end-escalate' },
            ],
            execution_plan: {
                startNodeId: 'trigger-ticket',
                endNodeIds: ['end-auto', 'end-escalate'],
                nodeOrder: [
                    'trigger-ticket',
                    'action-log-ticket',
                    'ai-classify',
                    'condition-confidence',
                    'action-auto-respond',
                    'action-escalate',
                    'end-auto',
                    'end-escalate',
                ],
                parallelPaths: [],
            },
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: 'demo',
                description:
                    'Demonstrates AI-powered ticket classification → confidence-based routing → auto-response or human escalation.',
                tags: ['demo', 'ai-router', 'support'],
            },
        };

        const triggerSource: TriggerSource = {
            type: 'manual',
            metadata: { source: 'demo-ai-router' },
        };

        const result = await this.orchestrator.executeWorkflow(
            demoWorkflow,
            triggerSource,
            ticketData,
        );

        // Fetch execution history immediately so the caller can see everything
        const history = await this.orchestrator.getExecutionHistory(result.id);

        return {
            message: '🤖 AI Customer Support Router — Demo Complete',
            workflowRunId: result.id,
            status: result.status,
            currentNodes: result.currentNodeIds,
            ticketInput: ticketData,
            workflow: {
                name: demoWorkflow.name,
                nodeCount: demoWorkflow.compiled_nodes.length,
                edgeCount: demoWorkflow.compiled_edges.length,
                description: demoWorkflow.metadata.description,
            },
            executionHistory: history.map((run) => ({
                nodeId: run.nodeId,
                status: run.status,
                input: run.input,
                output: run.output,
                error: run.error,
                durationMs: run.durationMs,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
            })),
            context: result.context,
        };
    }

    // =========================================================================
    // ISOLATED NODE TEST ENDPOINTS
    // =========================================================================

    /**
     * Test a Vapi action in isolation
     * POST /orchestrator/test/vapi
     */
    @Post('test/vapi')
    async testVapiNode(
        @Body() body: { action: string; config: Record<string, unknown> },
    ) {
        const { action, config } = body;
        const startTime = Date.now();

        try {
            let result: Record<string, unknown>;

            switch (action) {
                case 'create_call':
                    result = await this.vapiService.createCall({
                        phoneNumberId: (config.phone_number_id || config.phoneNumberId) as string,
                        customerNumber: (config.customer_number || config.customerNumber) as string,
                        assistantId: (config.assistant_id || config.assistantId) as string,
                    });
                    break;
                case 'create_assistant':
                    result = await this.vapiService.createAssistant({
                        name: (config.assistant_name || config.name || 'Test Assistant') as string,
                        firstMessage: (config.first_message || config.firstMessage || 'Hello!') as string,
                        systemPrompt: (config.system_prompt || config.systemPrompt) as string,
                        modelProvider: config.model_provider as string,
                        modelName: config.model_name as string,
                        voiceProvider: config.voice_provider as string,
                        voiceId: config.voice_id as string,
                    });
                    break;
                case 'list_calls':
                    result = await this.vapiService.listCalls({
                        limit: (config.limit as number) || 10,
                    });
                    break;
                default:
                    return {
                        success: false,
                        error: `Unknown Vapi action: ${action}`,
                        durationMs: Date.now() - startTime,
                    };
            }

            return { success: true, action, result, durationMs: Date.now() - startTime };
        } catch (error) {
            const err = error as Error;
            return { success: false, action, error: err.message, durationMs: Date.now() - startTime };
        }
    }

    /**
     * Test a WebRTC action in isolation
     * POST /orchestrator/test/webrtc
     */
    @Post('test/webrtc')
    async testWebRTCNode(
        @Body() body: { action: string; config: Record<string, unknown> },
    ) {
        const { action, config } = body;
        const startTime = Date.now();

        try {
            let result: Record<string, unknown>;

            switch (action) {
                case 'start_session':
                    result = this.webrtcService.createSession();
                    break;
                case 'end_session':
                    result = this.webrtcService.endSession(
                        (config.session_id || config.sessionId) as string,
                    );
                    break;
                case 'get_status': {
                    const status = this.webrtcService.getSessionStatus(
                        (config.session_id || config.sessionId) as string,
                    );
                    result = status || { error: 'Session not found' };
                    break;
                }
                case 'process_audio':
                    result = await this.webrtcService.processAudio(
                        (config.session_id || config.sessionId) as string,
                        (config.audio_data || config.audio || config.audioData) as string,
                    );
                    break;
                default:
                    return {
                        success: false,
                        error: `Unknown WebRTC action: ${action}`,
                        durationMs: Date.now() - startTime,
                    };
            }

            return { success: true, action, result, durationMs: Date.now() - startTime };
        } catch (error) {
            const err = error as Error;
            return { success: false, action, error: err.message, durationMs: Date.now() - startTime };
        }
    }
}
