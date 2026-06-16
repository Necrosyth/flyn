/**
 * FLYN Platform Capabilities Registry
 *
 * This is the single source of truth for what is actually implemented, partial,
 * or a stub in the workflow engine. It is injected into the AI assistant's system
 * prompt at runtime so the AI never confabulates unimplemented features.
 *
 * When you implement a feature: update the status here.
 * When you add a new event: add it to PLATFORM_EVENTS.
 */

export type CapabilityStatus = 'live' | 'partial' | 'stub' | 'mock';

export interface NodeCapability {
  nodeType: string;
  label: string;
  status: CapabilityStatus;
  notes?: string;
  liveOperations?: string[];
  stubOperations?: string[];
}

export interface PlatformEvent {
  eventName: string;
  source: string;
  firedWhen: string;
  triggerSyntax: string;
}

export interface PlatformCapabilities {
  nodes: NodeCapability[];
  events: PlatformEvent[];
  knownStubs: string[];
}

export const PLATFORM_CAPABILITIES: PlatformCapabilities = {

  nodes: [
    // ── Triggers ────────────────────────────────────────────────────────────────
    {
      nodeType: 'inbox_trigger',
      label: 'Inbox Trigger',
      status: 'live',
      notes: 'Fires when an inbound message arrives on a connected channel (WhatsApp, email, SMS, Telegram, etc.)',
      liveOperations: ['whatsapp', 'email', 'sms', 'telegram', 'facebook', 'instagram', 'all'],
    },
    {
      nodeType: 'trigger',
      label: 'Trigger',
      status: 'partial',
      liveOperations: ['webhook', 'schedule', 'manual'],
      stubOperations: ['event'],
      notes: 'trigger_type "event" exists in the schema but requires an event to be fired from a backend service. Only a subset of platform events are currently wired (see PLATFORM EVENTS section below). Do not claim event triggers auto-fire unless the event appears in the PLATFORM EVENTS list.',
    },

    // ── Messaging ────────────────────────────────────────────────────────────────
    {
      nodeType: 'send_whatsapp',
      label: 'Send WhatsApp',
      status: 'live',
      liveOperations: ['plain_text', 'wa_template', 'interactive_buttons', 'interactive_list', 'broadcast'],
    },
    {
      nodeType: 'send_reply',
      label: 'Send Reply',
      status: 'live',
      notes: 'Sends a reply to an active conversation. Requires conversationId from inbox_trigger.',
    },
    {
      nodeType: 'send_email',
      label: 'Send Email',
      status: 'live',
      notes: 'Uses the tenant\'s connected email provider.',
    },
    {
      nodeType: 'send_sms',
      label: 'Send SMS',
      status: 'live',
      notes: 'Requires a connected SMS channel.',
    },
    {
      nodeType: 'send_telegram',
      label: 'Send Telegram',
      status: 'live',
      notes: 'Requires a connected Telegram bot.',
    },
    {
      nodeType: 'send_instagram',
      label: 'Send Instagram',
      status: 'live',
      notes: 'Requires a connected Instagram account.',
    },

    // ── Logic ────────────────────────────────────────────────────────────────────
    {
      nodeType: 'decision',
      label: 'Decision',
      status: 'live',
      liveOperations: ['field_equals', 'field_contains', 'field_greater_than', 'field_less_than', 'field_not_equals'],
    },
    {
      nodeType: 'condition',
      label: 'Condition',
      status: 'live',
      notes: 'In-memory expression evaluator. Supports complex boolean logic.',
    },
    {
      nodeType: 'ai_decision',
      label: 'AI Decision',
      status: 'live',
      liveOperations: ['classify', 'sentiment', 'extract'],
    },
    {
      nodeType: 'split',
      label: 'Split',
      status: 'live',
      notes: 'Forks execution into parallel branches.',
    },
    {
      nodeType: 'join',
      label: 'Join',
      status: 'live',
      notes: 'Waits for all parallel branches to complete before continuing.',
    },
    {
      nodeType: 'merge',
      label: 'Merge',
      status: 'live',
      notes: 'Joins two datasets with left or inner join logic.',
    },
    {
      nodeType: 'wait',
      label: 'Wait',
      status: 'live',
      liveOperations: ['duration', 'until', 'event', 'user_reply', 'call_end'],
      notes: 'Pauses workflow execution. Time-based waits use the timer service.',
    },
    {
      nodeType: 'iterator',
      label: 'Iterator / Loop',
      status: 'live',
      liveOperations: ['forEach', 'while', 'times'],
    },

    // ── AI ────────────────────────────────────────────────────────────────────────
    {
      nodeType: 'ai_action',
      label: 'AI Action',
      status: 'live',
      notes: 'Calls the configured AI provider (Claude/GPT-4o) with a custom instruction.',
    },
    {
      nodeType: 'ai_router',
      label: 'AI Router',
      status: 'live',
      liveOperations: ['classify_intent', 'extract_data', 'analyze_sentiment', 'generate_inbox_reply', 'custom'],
    },

    // ── Data ────────────────────────────────────────────────────────────────────
    {
      nodeType: 'query_records',
      label: 'Query Records',
      status: 'partial',
      liveOperations: ['contacts', 'leads', 'deals'],
      stubOperations: ['tickets', 'tasks'],
      notes: 'Querying tickets and tasks returns an empty result with an internal "not implemented" note. Do not suggest using those resources until they are wired up.',
    },
    {
      nodeType: 'mongodb',
      label: 'MongoDB',
      status: 'live',
      notes: 'Direct MongoDB connection. Supports NLP-to-query generation via AI.',
    },
    {
      nodeType: 'postgresql',
      label: 'PostgreSQL',
      status: 'live',
      notes: 'Direct PostgreSQL connection. Supports NLP-to-query generation via AI.',
    },
    {
      nodeType: 'mysql',
      label: 'MySQL',
      status: 'live',
      notes: 'Direct MySQL connection. Supports NLP-to-query generation via AI.',
    },

    // ── Platform modules ─────────────────────────────────────────────────────────
    {
      nodeType: 'crm',
      label: 'CRM',
      status: 'live',
      liveOperations: ['create_contact', 'update_contact', 'find_contact', 'create_deal', 'update_deal'],
    },
    {
      nodeType: 'accounting',
      label: 'Accounting',
      status: 'live',
      liveOperations: ['create_invoice', 'update_invoice', 'get_invoices', 'create_expense', 'get_stats'],
    },
    {
      nodeType: 'hr',
      label: 'HR',
      status: 'live',
      liveOperations: ['list_employees', 'create_employee', 'update_employee', 'run_payroll', 'get_attendance'],
    },
    {
      nodeType: 'church',
      label: 'Church',
      status: 'live',
      liveOperations: ['list_members', 'create_member', 'get_stats', 'log_attendance'],
    },
    {
      nodeType: 'freelancer',
      label: 'Freelancer',
      status: 'live',
      liveOperations: ['list_projects', 'create_project', 'log_milestone', 'list_clients'],
    },
    {
      nodeType: 'coaches',
      label: 'Coaches',
      status: 'live',
      liveOperations: ['list_clients', 'list_sessions', 'create_session', 'send_reminder'],
    },

    // ── Voice / Vapi ─────────────────────────────────────────────────────────────
    {
      nodeType: 'vapi',
      label: 'Vapi Voice',
      status: 'live',
      notes: 'Initiates or manages Vapi voice calls.',
    },
    {
      nodeType: 'voice_agent',
      label: 'Voice Agent',
      status: 'live',
    },
    {
      nodeType: 'hr_voice_agent',
      label: 'HR Voice Agent',
      status: 'live',
    },
    {
      nodeType: 'freelancer_voice_agent',
      label: 'Freelancer Voice Agent',
      status: 'live',
    },
    {
      nodeType: 'church_voice_agent',
      label: 'Church Voice Agent',
      status: 'live',
    },
    {
      nodeType: 'webrtc',
      label: 'WebRTC',
      status: 'live',
      notes: 'Real-time audio/video streaming node.',
    },

    // ── Special ───────────────────────────────────────────────────────────────────
    {
      nodeType: 'approval',
      label: 'Approval',
      status: 'stub',
      notes: 'Creates a WAIT state but does NOT persist an approval task or notify anyone. The workflow pauses but nobody gets asked to approve. Do not suggest this node for real approval flows — tell users it is coming soon.',
    },
    {
      nodeType: 'action',
      label: 'Action',
      status: 'partial',
      liveOperations: ['http_request', 'email', 'crm_update', 'notification', 'log', 'transform'],
      stubOperations: ['slack'],
      notes: 'The "slack" action type logs a mock message to console but does NOT call any Slack API. All other action types are live.',
    },
    {
      nodeType: 'end',
      label: 'End',
      status: 'live',
    },
    {
      nodeType: 'morgan_leads',
      label: 'Morgan Leads',
      status: 'live',
    },
    {
      nodeType: 'flyn_feedback',
      label: 'Flyn Feedback',
      status: 'live',
    },
  ],

  events: [
    // ── Currently wired (actually fire automatically) ────────────────────────────
    {
      eventName: 'channel.message.received',
      source: 'ChannelsService',
      firedWhen: 'Any inbound message arrives on a connected channel (WhatsApp, email, SMS, Telegram, Facebook, Instagram)',
      triggerSyntax: 'Use inbox_trigger node — NOT a trigger(event) node',
    },

    // ── Newly wired via WorkflowEventService ──────────────────────────────────────
    {
      eventName: 'crm.contact.created',
      source: 'CrmService.createContact()',
      firedWhen: 'A new contact is created in the CRM (via API or UI)',
      triggerSyntax: 'trigger(trigger_type: "event", event_name: "crm.contact.created")',
    },
    {
      eventName: 'crm.deal.created',
      source: 'CrmService.createDeal()',
      firedWhen: 'A new deal is created in the CRM',
      triggerSyntax: 'trigger(trigger_type: "event", event_name: "crm.deal.created")',
    },
    {
      eventName: 'crm.deal.won',
      source: 'CrmService.updateDeal() when stage → "won"',
      firedWhen: 'A deal stage is changed to "won"',
      triggerSyntax: 'trigger(trigger_type: "event", event_name: "crm.deal.won")',
    },
    {
      eventName: 'hr.employee.created',
      source: 'HRService.createEmployee()',
      firedWhen: 'A new employee is added in the HR module',
      triggerSyntax: 'trigger(trigger_type: "event", event_name: "hr.employee.created")',
    },
    {
      eventName: 'hr.employee.updated',
      source: 'HRService.updateEmployee()',
      firedWhen: 'An employee record is updated in the HR module',
      triggerSyntax: 'trigger(trigger_type: "event", event_name: "hr.employee.updated")',
    },
    {
      eventName: 'billing.subscription.created',
      source: 'BillingService (webhook handler)',
      firedWhen: 'A new subscription is activated',
      triggerSyntax: 'trigger(trigger_type: "event", event_name: "billing.subscription.created")',
    },
    {
      eventName: 'billing.payment.received',
      source: 'BillingService (webhook handler)',
      firedWhen: 'A payment is successfully processed',
      triggerSyntax: 'trigger(trigger_type: "event", event_name: "billing.payment.received")',
    },
    {
      eventName: 'accounting.invoice.created',
      source: 'AccountingService.createInvoice()',
      firedWhen: 'A new invoice is created',
      triggerSyntax: 'trigger(trigger_type: "event", event_name: "accounting.invoice.created")',
    },
    {
      eventName: 'accounting.invoice.paid',
      source: 'AccountingService (payment handler)',
      firedWhen: 'An invoice is marked as paid',
      triggerSyntax: 'trigger(trigger_type: "event", event_name: "accounting.invoice.paid")',
    },
  ],

  knownStubs: [
    'approval node — pauses workflow but does not create a real approval task or notify anyone',
    'query_records(resource: "tickets") — returns empty array, not implemented',
    'query_records(resource: "tasks") — returns empty array, not implemented',
    'action(action_type: "slack") — logs to console, no real Slack API call',
    'trigger(event) with any event name NOT in the PLATFORM EVENTS list above — will never auto-fire',
  ],
};

/**
 * Builds the capabilities block injected into the AI system prompt.
 * Called once at chat time — same pattern as the node registry injection.
 */
export function buildCapabilitiesBlock(): string {
  const { nodes, events, knownStubs } = PLATFORM_CAPABILITIES;

  const liveNodes = nodes.filter(n => n.status === 'live').map(n => `  ✅ ${n.nodeType} (${n.label})`).join('\n');
  const partialNodes = nodes.filter(n => n.status === 'partial').map(n => {
    const live = n.liveOperations ? `live: ${n.liveOperations.join(', ')}` : '';
    const stub = n.stubOperations ? `NOT IMPLEMENTED: ${n.stubOperations.join(', ')}` : '';
    return `  ⚠️  ${n.nodeType} (${n.label}) — ${[live, stub].filter(Boolean).join(' | ')}${n.notes ? `\n     NOTE: ${n.notes}` : ''}`;
  }).join('\n');
  const stubNodes = nodes.filter(n => n.status === 'stub' || n.status === 'mock').map(n =>
    `  ❌ ${n.nodeType} (${n.label}) — ${n.notes ?? 'Not yet implemented'}`
  ).join('\n');

  const eventList = events.map(e =>
    `  • ${e.eventName}\n    Source: ${e.source}\n    Fires when: ${e.firedWhen}\n    Usage: ${e.triggerSyntax}`
  ).join('\n\n');

  const stubList = knownStubs.map(s => `  ⚠️  ${s}`).join('\n');

  return `══════════════════════════════════════════════════════════════
PLATFORM CAPABILITIES — WHAT IS ACTUALLY IMPLEMENTED
══════════════════════════════════════════════════════════════
IMPORTANT: This is authoritative. Do not claim something works if it is not listed as live here.
If a user asks about something marked ❌ or ⚠️, say it clearly: "That feature isn't fully wired up yet."

── FULLY LIVE NODES ────────────────────────────────────────
${liveNodes}

── PARTIALLY IMPLEMENTED NODES ─────────────────────────────
${partialNodes}

── STUB / NOT YET IMPLEMENTED ──────────────────────────────
${stubNodes}

── PLATFORM EVENTS THAT ACTUALLY AUTO-FIRE WORKFLOWS ────────
These are the ONLY event names that work with trigger(trigger_type: "event").
Any other event name will NEVER fire unless wired up in the backend.

${eventList}

── KNOWN STUB BEHAVIOURS TO WARN USERS ABOUT ────────────────
${stubList}
══════════════════════════════════════════════════════════════`;
}
