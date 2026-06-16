import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Req,
    HttpException,
    HttpStatus,
    Logger,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { TenantFromAuthInterceptor } from '../common/tenant-from-auth.interceptor';
import { WorkflowStorageService } from './workflow-storage';
import { WorkflowRuntimeService } from './workflow-runtime';
import { OrchestratorService } from './orchestrator.service';
import { AIProviderService } from './ai-provider';
import { WorkflowAssistantService } from './workflow-assistant.service';
import { CompiledWorkflow, TriggerSource } from './types';

/**
 * DTOs for workflow operations
 */
interface CreateWorkflowDto {
    name: string;
    tenantId: string;
    compiled_nodes: CompiledWorkflow['compiled_nodes'];
    compiled_edges: CompiledWorkflow['compiled_edges'];
    execution_plan: CompiledWorkflow['execution_plan'];
    metadata?: Partial<CompiledWorkflow['metadata']>;
}

interface UpdateWorkflowDto {
    name?: string;
    compiled_nodes?: CompiledWorkflow['compiled_nodes'];
    compiled_edges?: CompiledWorkflow['compiled_edges'];
    execution_plan?: CompiledWorkflow['execution_plan'];
    metadata?: Partial<CompiledWorkflow['metadata']>;
}

interface ExecuteWorkflowDto {
    triggerData?: Record<string, unknown>;
    triggerType?: string;
}

interface WorkflowListQuery {
    tenantId: string;
    limit?: number;
}

/**
 * Workflow Controller
 * 
 * RESTful API for workflow management.
 * Provides CRUD operations for compiled workflows.
 * 
 * Base path: /api/workflows
 */
@ApiTags('Orchestrator')
@Controller('workflows')
@UseGuards(ApiOrFirebaseAuthGuard)
@UseInterceptors(TenantFromAuthInterceptor)
export class WorkflowController {
    private readonly logger = new Logger(WorkflowController.name);

    constructor(
        private readonly storage: WorkflowStorageService,
        private readonly runtime: WorkflowRuntimeService,
        private readonly orchestrator: OrchestratorService,
        private readonly aiProvider: AIProviderService,
        private readonly workflowAssistant: WorkflowAssistantService,
    ) { }

    // ============================================================================
    // CRUD OPERATIONS
    // ============================================================================

    /**
     * Create a new workflow
     * POST /api/workflows
     */
    @Post()
    async create(@Body() dto: CreateWorkflowDto, @Req() req: Request) {
        this.logger.log(`Creating workflow: ${dto.name}`);

        // Resolve createdBy from auth header, request body metadata, or fallback to 'api'
        const createdBy: string =
            (req.headers['x-user-id'] as string) ||
            (req.headers['x-uid'] as string) ||
            dto.metadata?.createdBy ||
            'api';

        const workflow: CompiledWorkflow = {
            id: '', // Will be generated
            name: dto.name,
            version: 1,
            tenantId: dto.tenantId,
            compiled_nodes: dto.compiled_nodes,
            compiled_edges: dto.compiled_edges,
            execution_plan: dto.execution_plan,
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy,
                ...dto.metadata,
            },
        };

        const saved = await this.storage.save(workflow);

        return {
            success: true,
            workflow: {
                id: saved.id,
                name: saved.name,
                version: saved.version,
                tenantId: saved.tenantId,
            },
        };
    }

    /**
     * Get a workflow by ID
     * GET /api/workflows/:id
     */
    @Get(':id')
    async findOne(@Param('id') id: string) {
        const workflow = await this.storage.get(id);

        if (!workflow) {
            throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
        }

        return { workflow };
    }

    /**
     * List workflows for a tenant
     * GET /api/workflows?tenantId=xxx&limit=50
     */
    @Get()
    async findAll(@Query() query: WorkflowListQuery) {
        if (!query.tenantId) {
            throw new HttpException('tenantId is required', HttpStatus.BAD_REQUEST);
        }

        const workflows = await this.storage.listByTenant(
            query.tenantId,
            query.limit ? parseInt(String(query.limit), 10) : 50,
        );

        return {
            workflows: workflows.map(w => ({
                id: w.id,
                name: w.name,
                version: w.version,
                tenantId: w.tenantId,
                nodeCount: w.compiled_nodes?.length ?? 0,
                isActive: w.isActive ?? false,
                metadata: w.metadata,
            })),
            total: workflows.length,
        };
    }

    /**
     * Update a workflow (creates new version)
     * PUT /api/workflows/:id
     */
    @Put(':id')
    async update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
        const existing = await this.storage.get(id);

        if (!existing) {
            throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
        }

        this.logger.log(`Updating workflow: ${id} (v${existing.version} -> v${existing.version + 1})`);

        const updates: Partial<CompiledWorkflow> = {};
        if (dto.name) updates.name = dto.name;
        if (dto.compiled_nodes) updates.compiled_nodes = dto.compiled_nodes;
        if (dto.compiled_edges) updates.compiled_edges = dto.compiled_edges;
        if (dto.execution_plan) updates.execution_plan = dto.execution_plan;
        if (dto.metadata) {
            updates.metadata = {
                ...existing.metadata,
                ...dto.metadata,
                updatedAt: new Date(),
            };
        }

        const updated = await this.storage.createVersion(id, updates);

        if (!updated) {
            throw new HttpException('Failed to update workflow', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        return {
            success: true,
            workflow: {
                id: updated.id,
                name: updated.name,
                version: updated.version,
            },
        };
    }

    /**
     * Delete a workflow
     * DELETE /api/workflows/:id
     */
    @Delete(':id')
    async remove(@Param('id') id: string) {
        const existing = await this.storage.get(id);

        if (!existing) {
            throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
        }

        this.logger.log(`Deleting workflow: ${id}`);

        const deleted = await this.storage.delete(id);

        return {
            success: deleted,
            message: deleted ? 'Workflow deleted' : 'Failed to delete workflow',
        };
    }

    // ============================================================================
    // PUBLISH / UNPUBLISH
    // ============================================================================

    /**
     * Publish (activate) a workflow so it responds to real trigger events
     * POST /api/workflows/:id/publish
     */
    @Post(':id/publish')
    async publish(@Param('id') id: string) {
        const existing = await this.storage.get(id);
        if (!existing) {
            throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
        }

        this.logger.log(`Publishing workflow: ${id}`);
        const updated = await this.storage.setActive(id, true);

        return {
            success: true,
            message: `Workflow "${updated?.name}" is now active and will respond to trigger events.`,
            workflow: { id, name: updated?.name, isActive: true },
        };
    }

    /**
     * Unpublish (deactivate) a workflow
     * POST /api/workflows/:id/unpublish
     */
    @Post(':id/unpublish')
    async unpublish(@Param('id') id: string) {
        const existing = await this.storage.get(id);
        if (!existing) {
            throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
        }

        this.logger.log(`Unpublishing workflow: ${id}`);
        const updated = await this.storage.setActive(id, false);

        return {
            success: true,
            message: `Workflow "${updated?.name}" has been deactivated.`,
            workflow: { id, name: updated?.name, isActive: false },
        };
    }

    // ============================================================================
    // EXECUTION OPERATIONS
    // ============================================================================

    /**
     * Execute a workflow
     * POST /api/workflows/:id/execute
     */
    @Post(':id/execute')
    async execute(@Param('id') id: string, @Body() dto: ExecuteWorkflowDto) {
        const workflow = await this.storage.get(id);

        if (!workflow) {
            throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
        }

        this.logger.log(`Executing workflow: ${id}`);

        const triggerSource: TriggerSource = {
            type: (dto.triggerType as TriggerSource['type']) || 'manual',
            metadata: { source: 'api', workflowId: id },
        };

        const run = await this.orchestrator.executeWorkflow(
            workflow,
            triggerSource,
            dto.triggerData || {},
        );

        return {
            success: true,
            runId: run.id,
            status: run.status,
            startedAt: run.startedAt,
        };
    }

    /**
     * Get workflow execution runs
     * GET /api/workflows/:id/runs?limit=10
     */
    @Get(':id/runs')
    async getRuns(@Param('id') id: string, @Query('limit') limit?: string) {
        const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : 20;
        const runs = await this.runtime.getRunsByWorkflowId(id, parsedLimit);
        return {
            workflowId: id,
            runs: runs.map(r => ({
                id: r.id,
                status: r.status,
                startedAt: r.startedAt,
                completedAt: r.completedAt,
                triggeredBy: r.triggeredBy,
                currentNodeIds: r.currentNodeIds,
            })),
            total: runs.length,
        };
    }

    // ============================================================================
    // AI TOOLS
    // ============================================================================

    /**
     * Generate workflow nodes from a plain-language description.
     * POST /api/workflows/ai/generate
     * Body: { description: string }
     */
    @Post('ai/generate')
    async aiGenerate(@Body() body: { description: string }) {
        if (!body.description?.trim()) {
            throw new HttpException('description is required', HttpStatus.BAD_REQUEST);
        }

        const AVAILABLE_NODES = [
            'trigger (start, webhook, schedule, form_submit, message_received)',
            'inbox_trigger (new message arrives in inbox)',
            'action (generic action / HTTP request)',
            'send_whatsapp (send WhatsApp message)',
            'send_email (send email)',
            'send_sms (send SMS)',
            'send_telegram (send Telegram message)',
            'send_reply (reply to conversation in inbox)',
            'wait (pause / delay)',
            'decision (if/else branch based on condition)',
            'ai_decision (AI-powered routing decision)',
            'ai_action (run an AI prompt / LLM step)',
            'crm (CRM operation: create/update contact or deal)',
            'hr (HR operation: create employee, leave request, attendance)',
            'church (Church operation: list members, attendance, donations)',
            'vapi (voice call via Vapi AI)',
            'split (split flow into parallel branches)',
            'join (merge parallel branches)',
            'end (end the workflow)',
        ];

        const prompt = `You are a workflow automation assistant. Generate a workflow node graph based on this description:

"${body.description}"

Available node types:
${AVAILABLE_NODES.join('\n')}

Return a JSON object with this exact structure:
{
  "name": "workflow name",
  "nodes": [
    {
      "id": "node_1",
      "type": "node_type",
      "label": "Human readable label",
      "position": { "x": 100, "y": 100 },
      "config": { "key": "value" }
    }
  ],
  "edges": [
    { "id": "edge_1", "source": "node_1", "target": "node_2" }
  ]
}

Rules:
- Always start with a trigger node at position {x:100, y:200}
- Space nodes vertically ~180px apart (x stays 100 for linear flows, use x:400 for branches)
- Use EXACT field names from the config schemas below — do NOT invent field names

Required config fields per node type (these MUST be present):
- trigger: { "trigger_type": "message_received"|"webhook"|"schedule"|"form_submit" }
- inbox_trigger: { "channelType": "whatsapp"|"email"|"all", "filterStatus": "open" }
- action: { "action_type": "http_request"|"transform"|"log" }
- send_whatsapp: { "message_type": "plain_text", "to": "{{contact.phone}}", "message": "your message text" }
- send_email: { "send_mode": "single", "to": "{{contact.email}}", "subject": "...", "body": "..." }
- send_sms: { "to": "{{contact.phone}}", "message": "your message" }
- send_reply: { "message": "your reply text" }
- wait: { "wait_type": "duration", "duration_value": <number>, "duration_unit": "seconds"|"minutes"|"hours" }
- decision: { "condition_type": "field_compare", "field_name": "status", "operator": "equals", "compare_value": "..." }
- crm: { "resource": "contact", "operation": "create" }
- end: {}

- Generate 3-8 nodes for a complete, meaningful workflow`;

        let result: { name: string; nodes: unknown[]; edges: unknown[] };
        try {
            const response = await this.aiProvider.generateStructured<typeof result>(
                prompt,
                {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        nodes: { type: 'array' },
                        edges: { type: 'array' },
                    },
                },
            );
            result = response.data;
        } catch (err: any) {
            this.logger.error(`AI workflow generate failed: ${err.message}`);
            throw new HttpException(
                `AI generation failed: ${err.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }

        return { success: true, workflow: result };
    }

    /**
     * Multi-turn AI chatbot for building workflows conversationally.
     * POST /api/workflows/ai/chat
     *
     * Three-phase stateful builder:
     *   Phase 1 – PLANNING:   AI identifies which nodes the workflow needs
     *   Phase 2 – GATHERING:  AI asks for missing required config per node
     *   Phase 3 – BUILDING:   AI generates the full workflow JSON
     */
    @Post('ai/chat')
    async aiChat(@Body() body: {
        messages: { role: string; content: string }[];
        mode?: 'current' | 'new';
        currentWorkflow?: { name: string; nodes: any[] };
        plan?: {
            phase: 'planning' | 'gathering' | 'building';
            nodes: Array<{
                id: string;
                type: string;
                label: string;
                fields: Record<string, unknown>;
                fieldsGathered: boolean;
            }>;
            currentNodeIndex: number;
        };
    }) {
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
            throw new HttpException('messages array is required', HttpStatus.BAD_REQUEST);
        }

        if (!this.aiProvider.isAvailable()) {
            throw new HttpException('AI provider not configured', HttpStatus.SERVICE_UNAVAILABLE);
        }

        // ── Detect explicit "build now" commands ────────────────────────────
        const lastUserMsg = body.messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() ?? '';
        const BUILD_KEYWORDS = [
            'make it', 'do it', 'build it', 'create it', 'go ahead', 'just do it',
            'make the workflow', 'build the workflow', 'create the workflow',
            'apply it', 'generate it', 'build now', 'create now', 'make now',
            'yes do it', 'okay do it', 'yes build', 'yes make', 'yes create',
            'please build', 'please make', 'please create', 'okay', 'sure',
            'connect the nodes', 'make the flow', 'build the flow',
        ];
        const isBuildNow = BUILD_KEYWORDS.some(kw => lastUserMsg.includes(kw));

        // ── Determine which phase we're in ──────────────────────────────────
        const plan = body.plan ?? null;
        const phase = plan?.phase ?? 'planning';
        const mode = body.mode || 'new';

        // ── Build full conversation context from prior user messages ────────
        const userContext = body.messages
            .filter(m => m.role === 'user')
            .map(m => m.content)
            .join(' | ');

        // ── NODE CONFIG SCHEMAS (what AI must fill per node type) ────────────
        const NODE_CONFIGS = `
inbox_trigger: { "channelType": "whatsapp"|"email"|"all", "filterStatus": "open" }
trigger: { "trigger_type": "webhook"|"schedule"|"manual"|"event", "event_name": "", "description": "" }
wait: { "wait_type": "duration", "duration_value": <number>, "duration_unit": "minutes"|"seconds"|"hours", "timeout_enabled": true, "timeout_hours": 24 }
send_whatsapp: { "message_type": "plain_text", "to": "{{contact.phone}}", "message": "<ACTUAL message text>", "conversationId": "{{inbox_trigger_0.conversationId}}" }
send_reply: { "message": "<ACTUAL reply text>", "conversationId": "{{inbox_trigger_0.conversationId}}" }
send_email: { "send_mode": "single", "to": "{{contact.email}}", "email_subject": "<subject>", "email_body": "<body>", "from_email": "noreply@company.com" }
send_sms: { "send_mode": "single", "to": "{{contact.phone}}", "sms_message": "<message>" }
send_telegram: { "send_mode": "single", "chat_id": "{{contact.telegram_id}}", "tg_message": "<message>" }
decision: { "condition_type": "field_equals", "field_name": "", "operator": "equals", "compare_value": "", "true_label": "Yes", "false_label": "No" }
ai_decision: { "ai_task": "classify", "prompt": "<what to analyze>", "confidence_threshold": 80 }
ai_action: { "instruction": "<what AI should do>", "target_plugin": "core_crm", "risk_level": "read_only" }
crm: { "operation": "create_contact", "op_fields": { "name": "", "email": "", "phone": "" } }
hr: { "operation": "create_employee", "op_fields": { "name": "", "email": "" } }
church: { "operation": "list_members"|"get_stats"|"create_donation"|"broadcast", "op_fields": {} }
vapi: { "vapi_action": "create_call", "call_config": { "customer_number": "", "assistant_id": "" } }
end: {}`;

        const AVAILABLE_TYPES = 'trigger, inbox_trigger, action, send_whatsapp, send_email, send_sms, send_telegram, send_reply, wait, decision, ai_decision, ai_action, crm, hr, church, vapi, split, join, end';

        // ────────────────────────────────────────────────────────────────────
        // PHASE 1: PLANNING — identify which nodes are needed
        // ────────────────────────────────────────────────────────────────────
        if (phase === 'planning' && !isBuildNow) {
            const currentWorkflowCtx = mode === 'current' && body.currentWorkflow
                ? `\nCURRENT WORKFLOW ON CANVAS: Name: "${body.currentWorkflow.name}", Nodes: ${JSON.stringify(body.currentWorkflow.nodes)}`
                : '';

            const planPrompt = `You are a workflow planner for Flyn Platform. Based on the user's conversation, identify ALL the nodes needed.

AVAILABLE NODE TYPES: ${AVAILABLE_TYPES}
MODE: ${mode} (if "current", prioritize modifying existing nodes)${currentWorkflowCtx}

USER'S FULL CONTEXT: "${userContext}"

RESPOND WITH ONLY THIS JSON (no markdown, no prose):
{
  "type": "plan",
  "summary": "One-line summary of what the workflow does",
  "nodes": [
    { "id": "node_1", "type": "<node_type>", "label": "Human-readable label", "requiredFields": ["field1","field2"], "inferredValues": { "field1": "value if you can infer it" } }
  ],
  "missingInfo": ["list of critical things you still need to know from the user, if any"]
}

RULES:
- Always start with a trigger or inbox_trigger node
- Always end with an end node
- Include 3-8 nodes for a complete workflow
- For WhatsApp auto-reply: inbox_trigger → wait → send_whatsapp/send_reply → end
- Try to infer as many field values as possible from context
- "missingInfo" should ONLY contain truly critical unknowns (like message content if not specified)
- If the user has given enough info, set missingInfo to an empty array []`;

            const aiMessages = [
                { role: 'system' as const, content: planPrompt },
                ...body.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            ];

            try {
                const response = await this.aiProvider.chat(aiMessages);
                let raw = response.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
                const planResult = JSON.parse(raw);

                if (planResult.type === 'plan') {
                    const newPlan = {
                        phase: (planResult.missingInfo?.length > 0 ? 'gathering' : 'building') as 'gathering' | 'building',
                        nodes: (planResult.nodes || []).map((n: any, i: number) => ({
                            id: n.id || `node_${i + 1}`,
                            type: n.type,
                            label: n.label,
                            fields: n.inferredValues || {},
                            fieldsGathered: !n.requiredFields?.length || Object.keys(n.inferredValues || {}).length >= (n.requiredFields?.length || 0),
                        })),
                        currentNodeIndex: 0,
                    };

                    // If no missing info, jump straight to building
                    if (planResult.missingInfo?.length === 0 || newPlan.nodes.every((n: any) => n.fieldsGathered)) {
                        newPlan.phase = 'building';
                    }

                    const summaryMsg = `Here's my plan for your workflow **"${planResult.summary}"**:\n\n` +
                        planResult.nodes.map((n: any, i: number) => `${i + 1}. **${n.label}** (${n.type})`).join('\n') +
                        (planResult.missingInfo?.length > 0
                            ? `\n\nI need a few details:\n${planResult.missingInfo.map((q: string) => `• ${q}`).join('\n')}`
                            : '\n\nI have all the info I need! Say **"build it"** and I\'ll create this workflow.');

                    return {
                        success: true,
                        response: { type: 'question', message: summaryMsg },
                        plan: newPlan,
                    };
                }
            } catch (err: any) {
                this.logger.warn(`Planning phase parse failed: ${err.message}`);
                // Fall through to direct build
            }
        }

        // ────────────────────────────────────────────────────────────────────
        // PHASE 2: GATHERING — ask for missing fields (or skip to build)
        // ────────────────────────────────────────────────────────────────────
        if (phase === 'gathering' && !isBuildNow && plan) {
            // Feed the user's latest answer back into the plan fields
            const gatherPrompt = `You are filling in workflow node configuration. The user just provided more information.

CURRENT PLAN NODES:
${JSON.stringify(plan.nodes, null, 2)}

USER'S LATEST MESSAGE: "${lastUserMsg}"
FULL CONVERSATION CONTEXT: "${userContext}"

NODE CONFIG SCHEMAS:
${NODE_CONFIGS}

UPDATE the node fields with values from the user's answer, then check if any CRITICAL fields are still missing.
If you are updating fields in an existing workflow, return "field_updates" type.

RESPOND WITH ONLY THIS JSON:
{
  "type": "update" | "field_updates",
  "updatedNodes": [
    { "id": "node_1", "fields": { "message": "the value user provided", "to": "{{contact.phone}}" } }
  ],
  "stillMissing": ["any remaining critical questions"],
  "readyToBuild": true/false,
  "message": "Optional message to user if type is field_updates"
}`;

            try {
                const response = await this.aiProvider.chat([
                    { role: 'system', content: gatherPrompt },
                    ...body.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
                ]);
                let raw = response.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
                const gatherResult = JSON.parse(raw);

                if (gatherResult.type === 'update' || gatherResult.type === 'field_updates') {
                    // Merge updated fields into plan
                    const updatedPlan = { ...plan };
                    const fieldUpdates: any[] = [];

                    for (const update of (gatherResult.updatedNodes || [])) {
                        const node = updatedPlan.nodes.find(n => n.id === update.id);
                        if (node) {
                            node.fields = { ...node.fields, ...update.fields };
                            node.fieldsGathered = true;
                            
                            // Track for frontend immediate application
                            Object.entries(update.fields).forEach(([field, value]) => {
                                fieldUpdates.push({ nodeId: update.id, field, value });
                            });
                        }
                    }

                    if (gatherResult.type === 'field_updates') {
                        return {
                            success: true,
                            response: { 
                                type: 'field_updates', 
                                updates: fieldUpdates, 
                                message: gatherResult.message || `I've updated ${fieldUpdates.length} fields in your workflow.` 
                            },
                            plan: updatedPlan
                        };
                    }

                    if (gatherResult.readyToBuild || gatherResult.stillMissing?.length === 0) {
                        updatedPlan.phase = 'building';
                        return {
                            success: true,
                            response: { type: 'question', message: 'Got it! All details collected. Say **"build it"** to generate your workflow, or add more details.' },
                            plan: updatedPlan,
                        };
                    } else {
                        const questions = gatherResult.stillMissing.map((q: string) => `• ${q}`).join('\n');
                        return {
                            success: true,
                            response: { type: 'question', message: `Almost there! I still need:\n${questions}` },
                            plan: updatedPlan,
                        };
                    }
                }
            } catch (err: any) {
                this.logger.warn(`Gathering phase parse failed: ${err.message}, falling through to build`);
            }
        }

        // ────────────────────────────────────────────────────────────────────
        // PHASE 3: BUILDING — generate the complete workflow JSON
        // ────────────────────────────────────────────────────────────────────
        const planContext = plan?.nodes
            ? `\nPLAN (use these nodes and their gathered config):\n${JSON.stringify(plan.nodes, null, 2)}`
            : '';

        const buildPrompt = `You are a workflow builder for Flyn Platform. Generate the COMPLETE workflow NOW.

CONVERSATION CONTEXT: "${userContext}"
${planContext}

AVAILABLE NODE TYPES: ${AVAILABLE_TYPES}

NODE CONFIG SCHEMAS (fill ALL fields):
${NODE_CONFIGS}

RESPOND WITH ONLY THIS JSON — NO markdown, NO prose:
{"type":"workflow","workflow":{"name":"Workflow Name","nodes":[{"id":"node_1","type":"<type>","label":"Label","position":{"x":100,"y":200},"config":{...ALL fields filled...}}],"edges":[{"id":"edge_1","source":"node_1","target":"node_2"}]}}

RULES:
1. Start with trigger/inbox_trigger at y:200, space nodes 180px vertically
2. EVERY config field MUST be filled with real values from the conversation or smart defaults
3. For WhatsApp: default message = "Hi! Thanks for reaching out. We'll get back to you shortly."
4. For wait nodes: default = 5 minutes
5. Always end with an "end" node
6. Generate 3-8 nodes
7. For WhatsApp auto-reply workflows: inbox_trigger → wait → send_whatsapp → end`;

        const aiMessages = [
            { role: 'system' as const, content: buildPrompt },
            ...body.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ];

        let rawResponse: string;
        try {
            const response = await this.aiProvider.chat(aiMessages);
            rawResponse = response.content.trim();
            this.logger.debug(`AI build response: ${rawResponse.substring(0, 300)}`);
        } catch (err: any) {
            this.logger.error(`AI chat build failed: ${err.message}`);
            throw new HttpException(`AI chat failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
        }

        let parsed: { type: 'question' | 'workflow'; message?: string; workflow?: unknown };

        // Strip markdown fences
        let cleaned = rawResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

        try {
            parsed = JSON.parse(cleaned);
            if (!parsed.type) throw new Error('Missing type');
        } catch {
            // Try extracting the largest JSON object
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch {
                    parsed = { type: 'question', message: "I couldn't generate that workflow. Could you describe it in one sentence? Example: \"When a WhatsApp message arrives, wait 5 minutes, then reply with a welcome message.\"" };
                }
            } else {
                parsed = {
                    type: 'question',
                    message: cleaned.length > 300
                        ? "I didn't understand that. Could you describe the workflow in one sentence?"
                        : cleaned,
                };
            }
            this.logger.warn(`AI build returned non-JSON (len=${cleaned.length}). Fallback to question.`);
        }

        // Reset plan after successful build
        const returnPlan = parsed.type === 'workflow' ? null : (plan ? { ...plan, phase: 'building' as const } : null);

        return { success: true, response: parsed, plan: returnPlan };
    }

    /**
     * Get AI chat history for a workflow.
     * GET /api/workflows/ai/history/:workflowId?tenantId=xxx
     */
    @Get('ai/history/:workflowId')
    async getAiChatHistory(
        @Param('workflowId') workflowId: string,
        @Query('tenantId') tenantId: string,
    ) {
        if (!tenantId) throw new HttpException('tenantId is required', HttpStatus.BAD_REQUEST);
        const messages = await this.workflowAssistant.getChatHistory(tenantId, workflowId);
        return { success: true, messages };
    }

    /**
     * AI Assistant with tool use — context-aware, can query workflows and channels live.
     * POST /api/workflows/ai/assistant
     */
    @Post('ai/assistant')
    async aiAssistant(@Body() body: {
        tenantId: string;
        messages: Array<{ role: string; content: string; timestamp?: number }>;
        workflowId?: string;
        workflowContext?: { name: string; nodes: any[]; edges?: any[] };
        nodeRegistry?: Record<string, { label: string; description: string; category: string; fields: any[] }>;
    }) {
        if (!body.tenantId) throw new HttpException('tenantId is required', HttpStatus.BAD_REQUEST);
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
            throw new HttpException('messages array is required', HttpStatus.BAD_REQUEST);
        }
        if (!this.aiProvider.isAvailable()) {
            throw new HttpException('AI provider not configured', HttpStatus.SERVICE_UNAVAILABLE);
        }

        const messages = body.messages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.timestamp ?? Date.now(),
        }));

        try {
            const result = await this.workflowAssistant.chat({
                tenantId: body.tenantId,
                messages,
                workflowId: body.workflowId,
                workflowContext: body.workflowContext,
                nodeRegistry: body.nodeRegistry,
            });

            return {
                success: true,
                reply: result.reply,
                proposedWorkflow: result.proposedWorkflow,
                toolCallLog: result.toolCallLog,
            };
        } catch (err: any) {
            const msg = err?.message || 'Unknown AI error';
            this.logger.error(`AI Assistant error: ${msg}`);

            // Return a user-friendly error instead of 500
            if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('denied access')) {
                throw new HttpException(
                    'Your Gemini API key has been revoked or the project is locked. Please update the GEMINI_API_KEY in your .env file with a valid key from https://aistudio.google.com/apikey',
                    HttpStatus.SERVICE_UNAVAILABLE,
                );
            }
            if (msg.includes('404') || msg.includes('not found')) {
                throw new HttpException(
                    `The configured AI model is not available. Set GEMINI_MODEL in your .env to a valid model (e.g. gemini-2.5-flash). Error: ${msg}`,
                    HttpStatus.SERVICE_UNAVAILABLE,
                );
            }
            throw new HttpException(
                `AI Assistant failed: ${msg}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Analyze existing nodes and return optimization suggestions.
     * POST /api/workflows/ai/optimize
     * Body: { nodes: FlowNode[], edges: Edge[] }
     */
    @Post('ai/optimize')
    async aiOptimize(@Body() body: { nodes: unknown[]; edges: unknown[] }) {
        if (!Array.isArray(body.nodes) || body.nodes.length === 0) {
            throw new HttpException('nodes array is required', HttpStatus.BAD_REQUEST);
        }

        const nodesSummary = (body.nodes as Array<{ data?: { nodeType?: string; label?: string }; type?: string }>)
            .map((n, i) => `${i + 1}. [${n.data?.nodeType || n.type}] ${n.data?.label || ''}`)
            .join('\n');

        const prompt = `You are a workflow automation expert. Analyze this workflow and suggest improvements:

Current nodes:
${nodesSummary}

Return a JSON object:
{
  "score": 75,
  "summary": "One sentence overall assessment",
  "suggestions": [
    {
      "type": "warning|improvement|tip",
      "title": "Short title",
      "description": "What to do and why"
    }
  ]
}

Focus on:
- Missing error handling nodes
- Inefficient node ordering
- Missing wait/delay before follow-ups
- Redundant steps
- Better trigger configuration
- Missing end nodes
Provide 2-5 actionable suggestions.`;

        let result: { score: number; summary: string; suggestions: unknown[] };
        try {
            const response = await this.aiProvider.generateStructured<typeof result>(
                prompt,
                { type: 'object', properties: { score: { type: 'number' }, summary: { type: 'string' }, suggestions: { type: 'array' } } },
            );
            result = response.data;
        } catch (err: any) {
            this.logger.error(`AI workflow optimize failed: ${err.message}`);
            throw new HttpException(
                `AI optimization failed: ${err.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }

        return { success: true, analysis: result };
    }

    /**
     * Apply AI optimization suggestions to produce an improved workflow.
     * POST /api/workflows/ai/optimize/apply
     * Body: { nodes: FlowNode[], edges: Edge[], suggestions: { type, title, description }[] }
     */
    @Post('ai/optimize/apply')
    async aiOptimizeApply(@Body() body: {
        nodes: Array<{ id: string; type?: string; position?: { x: number; y: number }; data?: { nodeType?: string; label?: string; config?: Record<string, unknown> } }>;
        edges: Array<{ id: string; source: string; target: string }>;
        suggestions: Array<{ type: string; title: string; description: string }>;
    }) {
        if (!Array.isArray(body.nodes) || body.nodes.length === 0) {
            throw new HttpException('nodes array is required', HttpStatus.BAD_REQUEST);
        }
        if (!this.aiProvider.isAvailable()) {
            throw new HttpException('AI provider not configured', HttpStatus.SERVICE_UNAVAILABLE);
        }

        // Describe current workflow
        const nodesSummary = body.nodes
            .map((n, i) => {
                const type = n.data?.nodeType || n.type || 'unknown';
                const label = n.data?.label || '';
                const config = n.data?.config ? JSON.stringify(n.data.config) : '{}';
                return `${i + 1}. id="${n.id}" type="${type}" label="${label}" config=${config}`;
            })
            .join('\n');

        const edgesSummary = body.edges
            .map(e => `${e.source} → ${e.target}`)
            .join('\n');

        const suggestionsList = body.suggestions
            .map((s, i) => `${i + 1}. [${s.type}] ${s.title}: ${s.description}`)
            .join('\n');

        const prompt = `You are a workflow automation expert for Flyn Platform. 
Your job: apply the listed improvements to the existing workflow and return a FULLY REBUILT, OPTIMIZED workflow JSON.

CURRENT WORKFLOW NODES:
${nodesSummary}

CURRENT EDGES (connections):
${edgesSummary}

IMPROVEMENTS TO APPLY:
${suggestionsList}

RULES:
1. Apply ALL the improvements listed above — reorder nodes, add missing nodes (error handlers, notifications, etc.), fix configs.
2. Preserve the existing nodes and their configs — only reorder or add new ones.
3. Every node config must be fully filled (no blank fields). Use smart defaults.
4. Positions: start at x:100,y:100 and space nodes 180px apart vertically.
5. Always end with an "end" node.
6. For error handling: add a decision node after risky actions that branches on success/failure, with a send_whatsapp or send_email notification on the failure path.
7. Return ONLY the JSON below — no prose, no markdown, no code fences.

Return this exact shape:
{
  "name": "Optimized Workflow Name",
  "nodes": [
    { "id": "node_id", "type": "node_type", "label": "Human Label", "position": {"x": 100, "y": 100}, "config": { ...all fields filled... } }
  ],
  "edges": [
    { "id": "edge_id", "source": "source_node_id", "target": "target_node_id" }
  ]
}

Available node types: inbox_trigger, wait, send_whatsapp, send_reply, send_email, send_sms, decision, ai_decision, ai_action, crm, approval, end

Config schema (fill ALL fields):
- inbox_trigger: { "channelType": "whatsapp"|"email"|"all", "filterStatus": "open" }
- wait: { "wait_type": "duration", "duration_value": <number>, "duration_unit": "minutes"|"hours"|"seconds", "timeout_enabled": true, "timeout_hours": 24 }
- send_whatsapp: { "message_type": "plain_text", "to": "{{contact.phone}}", "message": "<actual message>", "conversationId": "{{inbox_trigger_0.conversationId}}" }
- send_reply: { "message": "<actual message>", "conversationId": "{{inbox_trigger_0.conversationId}}" }
- send_email: { "send_mode": "single", "to": "{{contact.email}}", "subject": "<subject>", "body": "<body>", "from": "noreply@company.com" }
- decision: { "condition_type": "field_equals", "field_name": "status", "operator": "equals", "compare_value": "success", "true_label": "Success", "false_label": "Failed" }
- end: {}`;

        let rawResponse: string;
        try {
            const response = await this.aiProvider.chat([
                // System message with JSON keywords → triggers responseMimeType:'application/json' in Gemini provider
                { role: 'system', content: 'You are a workflow builder. ALWAYS respond with ONLY valid JSON. respond with ONLY the JSON object — no markdown, no code fences, no prose.' },
                { role: 'user', content: prompt },
            ]);
            rawResponse = response.content.trim();
            this.logger.debug(`optimize/apply raw: ${rawResponse.substring(0, 200)}`);
        } catch (err: any) {
            this.logger.error(`AI optimize/apply failed: ${err.message}`);
            throw new HttpException(`AI optimization apply failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Parse the workflow out of the response
        let workflow: { name: string; nodes: unknown[]; edges: unknown[] };
        try {
            let clean = rawResponse
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/\s*```\s*$/i, '')
                .trim();
            workflow = JSON.parse(clean);
            if (!workflow.nodes || !workflow.edges) throw new Error('Missing nodes or edges');
        } catch {
            // Try extracting largest JSON object
            const match = rawResponse.match(/\{[\s\S]*\}/);
            if (!match) throw new HttpException('AI returned invalid workflow JSON', HttpStatus.INTERNAL_SERVER_ERROR);
            try {
                workflow = JSON.parse(match[0]);
            } catch {
                throw new HttpException('AI returned invalid workflow JSON', HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }

        return { success: true, workflow };
    }
}
