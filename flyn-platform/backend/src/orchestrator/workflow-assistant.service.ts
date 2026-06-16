import { Injectable, Logger } from '@nestjs/common';
import { WorkflowStorageService } from './workflow-storage';
import { AIProviderService } from './ai-provider';
import { AssistantTool } from './ai-provider/ai-provider.interface';
import { ChannelsService } from '../channels/channels.service';
import { FirebaseService } from '../firebase/firebase.service';
import { buildCapabilitiesBlock } from './platform-capabilities';
import { ApiSpecService } from '../api-spec/api-spec.service';
import { CustomNodeService } from './custom-nodes/custom-node.service';

// ── Dynamic node registry builder ────────────────────────────────────────────
// Converts the frontend nodeRegistry (sent at chat time) into a readable
// node reference block injected into the system prompt.
function buildNodeReferenceBlock(registry: Record<string, { label: string; description: string; category: string; fields: Array<{ name: string; type: string; required?: boolean; options?: string[]; conditionalKeys?: Record<string, string[]> }>; status?: string; statusNote?: string }>): string {
  const byCategory: Record<string, string[]> = {};

  for (const [nodeType, def] of Object.entries(registry)) {
    const cat = def.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];

    const statusIcon = def.status === 'stub' ? '❌' : def.status === 'partial' ? '⚠️ ' : def.status === 'coming_soon' ? '🚧' : '✅';
    const statusLine = def.status && def.status !== 'live'
      ? `\n    STATUS: ${statusIcon} ${def.status.toUpperCase()}${def.statusNote ? ` — ${def.statusNote}` : ''}`
      : '';

    const fieldLines = def.fields.map(f => {
      let line = `    ${f.name} [${f.type}${f.required ? ', required' : ''}]`;
      if (f.options && f.options.length > 0) line += `: ${f.options.join(' | ')}`;
      if (f.conditionalKeys) {
        const cLines = Object.entries(f.conditionalKeys)
          .map(([k, fields]) => `      ${k} → ${fields.join(', ')}`)
          .join('\n');
        line += `\n${cLines}`;
      }
      return line;
    }).join('\n');

    byCategory[cat].push(`  ${nodeType} (${def.label}):${statusLine}\n    ${def.description}\n${fieldLines}`);
  }

  const sections = Object.entries(byCategory)
    .map(([cat, nodes]) => `── ${cat.toUpperCase()} ─────────────────────────────────────────────────────\n${nodes.join('\n\n')}`)
    .join('\n\n');

  return `══════════════════════════════════════════════════════════════
COMPLETE NODE TYPE REFERENCE — ALL AVAILABLE NODES (live from frontend registry)
══════════════════════════════════════════════════════════════
These are ALL the node types you can use. Do not invent nodes not listed here.
Do not tell users a node doesn't exist if it appears in this list.

${sections}`;
}

// Built once at module load — capabilities are static until server restarts.
// This ensures the AI always knows the current implementation status.
const CAPABILITIES_BLOCK = buildCapabilitiesBlock();

const SYSTEM_PROMPT_BASE = `You are the Flyn AI Workflow Assistant — an expert automation engineer embedded inside the Flyn Platform.

Your job is to help users build, understand, and edit workflow automations. Users range from experienced developers to first-time non-technical users. Always communicate clearly, explain things in plain English, and be proactive about filling in every required field.

══════════════════════════════════════════════════════════════
HONESTY RULES — READ THESE FIRST
══════════════════════════════════════════════════════════════
These rules override everything else. Violating them erodes user trust.

1. NEVER invent event names, field names, operation types, or capabilities that are not in the NODE REGISTRY or PLATFORM CAPABILITIES blocks below. If you don't know, say so clearly.
2. NEVER claim a trigger will "automatically fire" unless the event appears in the PLATFORM EVENTS list in the PLATFORM CAPABILITIES block. If the event isn't listed, tell the user: "This event isn't wired up yet — the workflow won't auto-start from that action."
3. NEVER suggest using a ❌ stub node (like approval) as if it works in production. Always surface the limitation.
4. NEVER suggest using a stub operation (like query_records for tickets, or action with slack) without warning the user it returns empty results or is a mock.
5. If a user asks about something you don't know — say "I'm not sure about that" and tell them where to look (the Flyn platform settings or the API Reference tab in the Developer Portal).
6. When a user wants to call a Flyn API endpoint inside a workflow, use the search_api_endpoints tool to find the correct path, then use a flyn_api node with the exact method and path from the spec.
6. It is BETTER to say "that feature isn't wired up yet" than to give a confident wrong answer.

══════════════════════════════════════════════════════════════
CORE RULE — ALWAYS FILL ALL REQUIRED FIELDS
══════════════════════════════════════════════════════════════
When you propose or generate ANY workflow, every node config MUST have ALL required fields filled with real, meaningful values.
NEVER leave a field as an empty string "" or null unless explicitly instructed.
NEVER output a node with only one or two fields if the schema requires more.
If the user hasn't specified a value, use a smart default and tell them: "I've used [value] as a default — let me know if you'd like to change it."

{{CAPABILITIES_BLOCK}}

══════════════════════════════════════════════════════════════
DYNAMIC VARIABLES — USE THESE IN NODE CONFIGS
══════════════════════════════════════════════════════════════
Use {{variable}} syntax in string fields:
• {{contact.name}}          — the contact's full name
• {{contact.phone}}         — the contact's phone number (for WhatsApp/SMS)
• {{contact.email}}         — the contact's email address
• {{contact.company}}       — the contact's company/organisation
• {{inbox_trigger_0.conversationId}} — the active conversation ID (use in send_whatsapp/send_reply)
• {{inbox_trigger_0.message_body}}   — the text of the incoming message
• {{trigger.data.field}}    — any data field from a generic trigger (e.g. {{trigger.data.name}})
• {{workflow.id}}           — the unique ID of this workflow run
• {{workflow.timestamp}}    — when the workflow started (ISO format)
• {{church_member.name}}    — the church member's name (from church node output)
• {{church_member.email}}   — the church member's email
• {{crm_contact.name}}      — a CRM contact's name
• {{hr_employee.name}}      — an HR employee's name

{{NODE_REGISTRY}}

══════════════════════════════════════════════════════════════
VERIFIED WORKFLOW TEMPLATES
══════════════════════════════════════════════════════════════
These templates use ONLY nodes and events that are confirmed live in the PLATFORM CAPABILITIES block.

1. WhatsApp Auto-Reply (Inbox)
   Trigger: inbox_trigger(channelType: "whatsapp")
   Nodes: inbox_trigger → wait(5 min) → send_reply → end
   ✅ Works automatically when a WhatsApp message arrives.

2. New CRM Contact Welcome (CRM event)
   Trigger: trigger(trigger_type: "event", event_name: "crm.contact.created")
   Nodes: trigger → send_whatsapp(welcome message) → wait(1 day) → send_email(follow-up) → end
   ✅ Auto-fires when a new contact is created in CRM.

3. New Employee Onboarding (HR event)
   Trigger: trigger(trigger_type: "event", event_name: "hr.employee.created")
   Nodes: trigger → send_email(welcome to the team) → wait(1 day) → send_whatsapp(onboarding checklist) → end
   ✅ Auto-fires when a new employee is added in HR.

4. Deal Won Follow-Up (CRM event)
   Trigger: trigger(trigger_type: "event", event_name: "crm.deal.won")
   Nodes: trigger → send_whatsapp(congratulations / next steps) → crm(create_contact if needed) → send_email(onboarding info) → end
   ✅ Auto-fires when a deal is moved to "won".

5. Weekly Member Follow-Up (Church)
   Trigger: trigger(trigger_type: "schedule", cron_expression: "0 9 * * 0")
   Nodes: trigger → church(list_members/active) → iterator → ai_action(compose personalised message) → send_whatsapp → end
   ✅ Runs every Sunday at 9am.

6. Monthly Payroll Notification (HR)
   Trigger: trigger(trigger_type: "schedule", cron_expression: "0 9 28 * *")
   Nodes: trigger → hr(run_payroll) → send_email(payroll complete notification) → end
   ✅ Runs on the 28th of each month.

7. AI Lead Scoring (CRM)
   Trigger: trigger(trigger_type: "schedule", cron_expression: "0 8 * * 1")
   Nodes: trigger → query_records(resource: "leads") → iterator → ai_decision(score lead) → crm(update_contact) → end
   ✅ Runs every Monday. NOTE: query_records only works for "contacts", "leads", "deals" — not tickets/tasks.

8. Invoice Created Notification (Accounting)
   Trigger: trigger(trigger_type: "event", event_name: "accounting.invoice.created")
   Nodes: trigger → send_email(invoice created confirmation) → end
   ✅ Auto-fires when a new invoice is created.

9. Client Session Reminder (Coaches)
   Trigger: trigger(trigger_type: "schedule", cron_expression: "0 10 * * *")
   Nodes: trigger → coaches(list_clients) → iterator → wait(until 24h before session) → send_whatsapp(reminder) → end
   ✅ Daily check for upcoming sessions.

10. Contractor Milestone Update (Freelancer)
    Trigger: Use a webhook trigger — freelancer events not yet auto-wired.
    Nodes: trigger(trigger_type: "webhook") → freelancer(log_milestone) → send_email(milestone update to client) → end
    ⚠️  milestone_logged is not a platform event yet. Use webhook trigger instead.

══════════════════════════════════════════════════════════════
CALLING FLYN API ENDPOINTS IN WORKFLOWS
══════════════════════════════════════════════════════════════
Use the flyn_api node when a user wants to call an internal Flyn API endpoint inside a workflow.
Always call search_api_endpoints FIRST to find the correct path and method before proposing a flyn_api node.
Example flyn_api node config:
  { method: "GET", path: "/contacts", description: "Fetch all contacts" }
  { method: "POST", path: "/team/invite", body: { email: "{{contact.email}}" }, description: "Invite a team member" }

═══════════════════════════════════════════════════════════════
COMMUNICATION STYLE
══════════════════════════════════════════════════════════════
• Talk to users in plain English. Do NOT use technical jargon unless they ask.
• When explaining a workflow, say things like: "Step 1 starts the automation every Sunday morning. Step 2 fetches all your active members. Step 3 uses AI to write a personalised message for each one."
• When a node or feature is not yet implemented, say it clearly and suggest the closest working alternative.
• When proposing workflow changes, ALWAYS use the propose_workflow_changes tool.
• After proposing a workflow, summarise what you built in 2-3 sentences in plain English.

Be conversational, helpful, specific, and concise. Ensure all node IDs are unique (node_1, node_2, node_3...).`;



const TOOLS: AssistantTool[] = [
    {
        name: 'list_workflows',
        description: 'List all saved workflows for the tenant. Use this to find a workflow by name or to show the user what workflows exist.',
        input_schema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max workflows to return (default 20)' },
            },
        },
    },
    {
        name: 'get_workflow',
        description: 'Get the full details of a workflow by its ID, including all nodes, edges, and configuration. Use this before answering any question about a specific workflow.',
        input_schema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'string', description: 'The workflow ID to fetch' },
            },
            required: ['workflow_id'],
        },
    },
    {
        name: 'get_node_schema',
        description: 'Get the configuration schema for a specific node type. Use this to explain what fields a node needs or to check if a config is valid.',
        input_schema: {
            type: 'object',
            properties: {
                node_type: { type: 'string', description: 'The node type e.g. inbox_trigger, send_whatsapp, decision, ai_action' },
            },
            required: ['node_type'],
        },
    },
    {
        name: 'list_channels',
        description: 'List the communication channels connected for this tenant (WhatsApp, email, SMS, Telegram, etc.) including their status.',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'search_api_endpoints',
        description: 'Search the Flyn API spec to find endpoints by keyword or module. Use this when the user wants to call an API endpoint in a workflow (e.g. "call my CRM API", "trigger a webhook", "make an HTTP request to the plans endpoint").',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Keyword to search for (e.g. "contacts", "invoice", "message", "webhook")' },
                module: { type: 'string', description: 'Optional: filter by module/tag name (e.g. "admin", "team", "plans")' },
            },
            required: ['query'],
        },
    },
    {
        name: 'propose_workflow_changes',
        description: 'Propose a new or modified workflow for the user to preview and apply. Use this when the user wants to create or edit a workflow. Always include all nodes and edges.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Workflow name' },
                summary: { type: 'string', description: 'One-sentence description of what this workflow does' },
                nodes: {
                    type: 'array',
                    description: 'Array of workflow nodes',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            type: { type: 'string' },
                            name: { type: 'string', description: 'Display name/label for the node' },
                            position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
                            config: { type: 'object' },
                        },
                        required: ['id', 'type', 'name', 'position'],
                    },
                },
                edges: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { id: { type: 'string' }, source: { type: 'string' }, target: { type: 'string' }, sourceHandle: { type: 'string' } },
                        required: ['id', 'source', 'target'],
                    },
                },
            },
            required: ['name', 'summary', 'nodes', 'edges'],
        },
    },
    {
        name: 'author_custom_node',
        description: 'Author (or revise) a custom AI-coded node for THIS tenant. Provide the schema (config fields shown in the right-side panel), the code (an async body that receives `ctx` and returns the node output), and test cases. The node is saved as a sandbox DRAFT — it is NOT live until tests pass and the user promotes it. The code may ONLY use the scoped ctx: ctx.inputs, ctx.db.collection(name).{find,get,add,update}, ctx.secrets.get, ctx.httpFetch, ctx.callFlynApi, ctx.log. ctx is locked to this tenant.',
        input_schema: {
            type: 'object',
            properties: {
                node_id: { type: 'string', description: 'Stable id for the node (kebab-case). Reuse the same id to revise.' },
                kind: { type: 'string', description: '"custom" for a new node, or "override" to patch an existing node type' },
                target_type: { type: 'string', description: 'For kind="override": the built-in node type being patched (e.g. "loop")' },
                label: { type: 'string', description: 'Display name in the palette + panel' },
                description: { type: 'string' },
                schema: {
                    type: 'array', description: 'Config fields rendered in the right-side panel',
                    items: { type: 'object', properties: {
                        name: { type: 'string' }, label: { type: 'string' },
                        type: { type: 'string', description: 'text | select | textarea | toggle | number' },
                        required: { type: 'boolean' }, placeholder: { type: 'string' },
                    }, required: ['name', 'label', 'type'] },
                },
                code: { type: 'string', description: 'Async JS body. Receives `ctx`. Use `return <output>`. No imports/require/process.' },
                test_cases: {
                    type: 'array', description: 'Tests the node must pass before it can go live',
                    items: { type: 'object', properties: {
                        name: { type: 'string' },
                        inputs: { type: 'object', description: 'Becomes ctx.inputs' },
                        expect: { type: 'string', description: 'JS expression on `output`, e.g. "output.total === 3". Omit to assert "ran without error".' },
                    }, required: ['name', 'inputs'] },
                },
            },
            required: ['node_id', 'kind', 'label', 'code'],
        },
    },
    {
        name: 'run_node_tests',
        description: 'Run a custom node\'s test suite in the sandbox and return pass/fail per case. Call this after author_custom_node. If any fail, read the errors, call author_custom_node again with fixed code, and re-run — loop until all green.',
        input_schema: {
            type: 'object',
            properties: { node_id: { type: 'string' } },
            required: ['node_id'],
        },
    },
    {
        name: 'list_custom_nodes',
        description: 'List the tenant\'s live custom nodes.',
        input_schema: { type: 'object', properties: {} },
    },
];

const NODE_SCHEMAS: Record<string, object> = {
    inbox_trigger: { channelType: '"whatsapp" | "email" | "all"', filterStatus: '"open"' },
    trigger: { trigger_type: '"webhook" | "schedule" | "manual" | "event"', event_name: 'string', description: 'string' },
    wait: { wait_type: '"duration"', duration_value: 'number', duration_unit: '"minutes" | "seconds" | "hours"', timeout_enabled: 'boolean', timeout_hours: 'number (default 24)' },
    send_whatsapp: { message_type: '"plain_text"', to: '{{contact.phone}}', message: 'string', conversationId: '{{inbox_trigger.conversationId}}' },
    send_reply: { message: 'string', conversationId: '{{inbox_trigger.conversationId}}' },
    send_email: { send_mode: '"single"', to: '{{contact.email}}', email_subject: 'string', email_body: 'string', from_email: 'string' },
    send_sms: { send_mode: '"single"', to: '{{contact.phone}}', sms_message: 'string' },
    send_telegram: { send_mode: '"single"', chat_id: '{{contact.telegram_id}}', tg_message: 'string' },
    decision: { condition_type: '"field_equals"', field_name: 'string', operator: '"equals" | "not_equals" | "contains" | "greater_than" | "less_than"', compare_value: 'string', true_label: '"Yes"', false_label: '"No"' },
    ai_decision: { ai_task: '"classify"', prompt: 'string describing what to analyze', confidence_threshold: 'number (0-100)' },
    ai_action: { instruction: 'string describing what AI should do', target_plugin: '"core_crm"', risk_level: '"read_only" | "read_write"' },
    crm: { operation: '"create_contact" | "update_contact" | "find_contact"', op_fields: { name: 'string', email: 'string', phone: 'string' } },
    iterator: { list_source: 'string (e.g. {{query_records.data}})', loop_type: '"forEach"', item_variable: 'string' },
    query_records: { resource: '"leads" | "contacts" | "tasks"', operation: '"list"', limit: 'number' },
    accounting: { operation: '"create_invoice" | "update_invoice" | "get_invoices" | "create_expense" | "get_stats"', op_fields: { client: 'string', amount: 'number', currency: '"USD" | "EUR" | "GBP"', description: 'string', due_date: 'string', provider: '"xero" | "quickbooks" | "internal"' } },
    end: {},
    flyn_api: { method: '"GET" | "POST" | "PUT" | "PATCH" | "DELETE"', path: 'string (e.g. /contacts, /team/members)', body: 'object (optional, for POST/PUT)', query: 'object (optional query params)', description: 'string (what this API call does)' },
};

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

@Injectable()
export class WorkflowAssistantService {
    private readonly logger = new Logger(WorkflowAssistantService.name);

    constructor(
        private readonly storage: WorkflowStorageService,
        private readonly aiProvider: AIProviderService,
        private readonly channelsService: ChannelsService,
        private readonly firebase: FirebaseService,
        private readonly apiSpec: ApiSpecService,
        private readonly customNodes: CustomNodeService,
    ) {}

    async chat(params: {
        tenantId: string;
        messages: ChatMessage[];
        workflowId?: string;
        workflowContext?: { name: string; nodes: any[]; edges?: any[] };
        nodeRegistry?: Record<string, { label: string; description: string; category: string; fields: any[] }>;
    }): Promise<{ reply: string; proposedWorkflow?: any; toolCallLog: string[] }> {
        const { tenantId, messages, workflowId, workflowContext, nodeRegistry } = params;

        // Build the node reference block — use live registry from frontend if provided
        const nodeReferenceBlock = nodeRegistry && Object.keys(nodeRegistry).length > 0
            ? buildNodeReferenceBlock(nodeRegistry)
            : '══════════════════════════════════════════════════════════════\nNODE REGISTRY NOT PROVIDED — ask the user to refresh the page.\n══════════════════════════════════════════════════════════════';

        // Inject capabilities block + node registry into system prompt
        const systemPromptWithNodes = SYSTEM_PROMPT_BASE
            .replace('{{CAPABILITIES_BLOCK}}', CAPABILITIES_BLOCK)
            .replace('{{NODE_REGISTRY}}', nodeReferenceBlock);

        // Build system prompt with workflow context
        let contextBlock = '';
        if (workflowContext) {
            contextBlock = `\n\nSELECTED WORKFLOW CONTEXT:\nName: "${workflowContext.name}"\nNodes: ${JSON.stringify(workflowContext.nodes, null, 2)}`;
        } else if (workflowId) {
            contextBlock = `\n\nThe user is working on workflow ID: ${workflowId}. Use get_workflow to fetch its details when relevant.`;
        }

        const systemPrompt = systemPromptWithNodes + contextBlock;

        // Convert ChatMessage[] to Anthropic format
        const anthropicMessages = messages.map(m => ({
            role: m.role,
            content: m.content,
        }));

        // Tool executor
        let proposedWorkflow: any = null;
        const toolExecutor = async (name: string, input: Record<string, unknown>): Promise<string> => {
            switch (name) {
                case 'list_workflows': {
                    const limit = (input.limit as number) ?? 20;
                    const workflows = await this.storage.listByTenant(tenantId, limit);
                    return JSON.stringify(workflows.map(w => ({
                        id: w.id,
                        name: w.name,
                        isActive: w.isActive ?? false,
                        nodeCount: w.compiled_nodes?.length ?? 0,
                        updatedAt: w.metadata?.updatedAt,
                    })));
                }
                case 'get_workflow': {
                    const wf = await this.storage.get(input.workflow_id as string);
                    if (!wf) return JSON.stringify({ error: 'Workflow not found' });
                    return JSON.stringify({
                        id: wf.id,
                        name: wf.name,
                        isActive: wf.isActive,
                        nodes: wf.compiled_nodes,
                        edges: wf.compiled_edges,
                        metadata: wf.metadata,
                    });
                }
                case 'get_node_schema': {
                    const nodeType = input.node_type as string;
                    const schema = NODE_SCHEMAS[nodeType];
                    if (!schema) return `Unknown node type "${nodeType}". Available types: ${Object.keys(NODE_SCHEMAS).join(', ')}`;
                    return JSON.stringify({ nodeType, configSchema: schema });
                }
                case 'list_channels': {
                    try {
                        const channels = await this.channelsService.getTenantChannels(tenantId);
                        return JSON.stringify(channels.map((c: any) => ({
                            id: c.id,
                            type: c.type,
                            status: c.status,
                            name: c.name,
                        })));
                    } catch {
                        return JSON.stringify({ error: 'Could not fetch channels' });
                    }
                }
                case 'search_api_endpoints': {
                    const results = this.apiSpec.searchEndpoints(input.query as string, input.module as string | undefined);
                    if (results.length === 0) return JSON.stringify({ message: 'No endpoints found matching your query.' });
                    return JSON.stringify(results.map(ep => ({
                        method: ep.method,
                        path: ep.path,
                        category: ep.category,
                        summary: ep.summary || ep.description,
                        parameters: ep.parameters?.map(p => ({ name: p.name, in: p.in, required: p.required, description: p.description })),
                    })));
                }
                case 'propose_workflow_changes': {
                    proposedWorkflow = {
                        name: input.name,
                        nodes: input.nodes,
                        edges: input.edges,
                        summary: input.summary,
                    };
                    return JSON.stringify({ status: 'proposal_ready', message: 'Workflow proposal has been sent to the user interface.' });
                }
                case 'author_custom_node': {
                    try {
                        const def = await this.customNodes.authorDraft({
                            tenantId,
                            createdByUid: 'ai-assistant',
                            nodeId: input.node_id as string,
                            kind: (input.kind as any) === 'override' ? 'override' : 'custom',
                            targetType: input.target_type as string | undefined,
                            label: input.label as string,
                            description: input.description as string | undefined,
                            schema: (input.schema as any[]) ?? [],
                            code: input.code as string,
                            testCases: (input.test_cases as any[]) ?? [],
                        });
                        return JSON.stringify({ status: 'draft_saved', nodeId: def.nodeId, version: def.version, note: 'Now call run_node_tests to validate.' });
                    } catch (e) {
                        return JSON.stringify({ error: (e as Error).message });
                    }
                }
                case 'run_node_tests': {
                    try {
                        const r = await this.customNodes.runTests(tenantId, input.node_id as string);
                        return JSON.stringify({ passed: r.passed, total: r.total, allGreen: r.total > 0 && r.passed === r.total, results: r.results });
                    } catch (e) {
                        return JSON.stringify({ error: (e as Error).message });
                    }
                }
                case 'list_custom_nodes': {
                    try {
                        const nodes = await this.customNodes.list(tenantId);
                        return JSON.stringify(nodes.map((n) => ({ nodeId: n.nodeId, label: n.label, kind: n.kind, status: n.status, environment: n.environment, version: n.version })));
                    } catch (e) {
                        return JSON.stringify({ error: (e as Error).message });
                    }
                }
                default:
                    return JSON.stringify({ error: `Unknown tool: ${name}` });
            }
        };

        const { content, toolCallLog } = await this.aiProvider.chatWithTools(
            systemPrompt,
            anthropicMessages as any,
            TOOLS,
            toolExecutor,
            { maxTokens: 2048, maxIterations: 8 },
        );

        // Persist chat history
        await this.saveChatHistory(tenantId, workflowId ?? 'general', [
            ...messages,
            { role: 'assistant', content, timestamp: Date.now() },
        ]).catch(err => this.logger.warn(`Chat history save failed: ${err.message}`));

        return { reply: content, proposedWorkflow: proposedWorkflow ?? undefined, toolCallLog };
    }

    async getChatHistory(tenantId: string, workflowId: string): Promise<ChatMessage[]> {
        const db = this.firebase.firestore();
        if (!db) return [];
        try {
            const docRef = db.collection('workflowChatHistory').doc(`${tenantId}:${workflowId}`);
            const snap = await docRef.get();
            if (!snap.exists) return [];
            return (snap.data()?.messages ?? []) as ChatMessage[];
        } catch (err: any) {
            this.logger.warn(`getChatHistory failed: ${err.message}`);
            return [];
        }
    }

    async saveChatHistory(tenantId: string, workflowId: string, messages: ChatMessage[]): Promise<void> {
        const db = this.firebase.firestore();
        if (!db) return;
        const trimmed = messages.slice(-60); // keep last 60 messages
        await db.collection('workflowChatHistory').doc(`${tenantId}:${workflowId}`).set({
            tenantId,
            workflowId,
            messages: trimmed,
            updatedAt: Date.now(),
        });
    }
}
