/**
 * Node Schema Registry
 * ---------------------
 * This is the "Mock Database" for node type definitions.
 * In Phase 2, this will be replaced with an API hook: useNodeSchemas()
 * 
 * Schema Structure:
 * - type: Unique identifier for the node type
 * - label: Display name shown in UI
 * - icon: Lucide icon name
 * - color: Tailwind gradient classes
 * - category: Grouping for the node palette
 * - fields: Configuration fields for the PropertyPanel
 */

import { LucideIcon, Zap, Send, Clock, GitBranch, Bot, CheckCircle, Mail, MessageSquare, Webhook, Calendar, UserCheck, Database, Repeat, Sparkles, GitMerge, StopCircle, SplitSquareHorizontal, Users, Table2, CircleDot, Phone, Radio, Briefcase, Heart, Wrench, GraduationCap, Inbox, Reply, MessageCircle, SmartphoneNfc, GitFork, DollarSign } from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface FieldOption {
  value: string;
  label: string;
}

export interface SchemaField {
  name: string;
  label: string;
  type:
    | 'text' | 'select' | 'textarea' | 'toggle' | 'checkbox'
    | 'number' | 'slider' | 'section' | 'dynamic_group'
    // ── Smart dynamic types ──────────────────────────────────────────────────
    | 'channel_select'      // Dropdown populated with the user's connected channels
    | 'module_table_select' // Module + table picker (CRM/Events/HR/…)
    | 'module_column_select'// Column picker for the selected module table
    | 'batch_config'        // Single-row vs batch-N toggle + count
    | 'condition_builder';  // Inline [variable ▼] [operator ▼] [value] row
  required?: boolean;
  placeholder?: string;
  options?: FieldOption[];
  fields?: SchemaField[];
  watchField?: string;
  conditionalFields?: Record<string, SchemaField[]>;
  min?: number;
  max?: number;
  step?: number;
  default?: string | number | boolean;
  // channel_select — filter to specific channel types (e.g. ['whatsapp','sms'])
  channelFilter?: string[];
}

export type NodeStatus = 'live' | 'partial' | 'stub' | 'coming_soon';

export interface NodeSchema {
  type: string;
  label: string;
  icon: string;
  iconComponent: LucideIcon;
  color: string;
  category: 'triggers' | 'actions' | 'logic' | 'ai' | 'data' | 'plugins';
  description: string;
  fields: SchemaField[];
  /**
   * Implementation status — shown as a badge in the node palette and canvas.
   * 'live'        — fully implemented, safe to use in production
   * 'partial'     — some operations work, others don't (see notes)
   * 'stub'        — UI exists but backend does nothing meaningful
   * 'coming_soon' — not yet available
   * Omitting this field defaults to 'live'.
   */
  status?: NodeStatus;
  /** Human-readable caveat shown in UI when status !== 'live' */
  statusNote?: string;
  /** Plain-language aliases for non-technical search (e.g. "call lead", "follow up") */
  aliases?: string[];
}

// ============================================================================
// NODE SCHEMAS
// ============================================================================

export const NODE_SCHEMAS: Record<string, NodeSchema> = {
  // ---------------------------------------------------------------------------
  // TRIGGER NODES - Entry points for workflows
  // ---------------------------------------------------------------------------
  trigger: {
    type: 'trigger',
    label: 'When This Happens',
    icon: 'Zap',
    iconComponent: Zap,
    color: 'from-emerald-500 to-teal-500',
    category: 'triggers',
    description: 'Start your automation when something occurs — a form is submitted, a message arrives, or a schedule fires',
    fields: [
      {
        name: 'trigger_type',
        label: 'What starts this automation?',
        type: 'select',
        required: true,
        options: [
          { value: 'webhook', label: 'An external service calls in (Webhook)' },
          { value: 'schedule', label: 'On a recurring schedule' },
          { value: 'manual', label: 'Run manually' },
          { value: 'event', label: 'Something happened in the system' },
        ],
      },
      {
        name: 'event_name',
        label: 'Which event',
        type: 'text',
        placeholder: 'e.g., new_lead, form_submitted',
      },
      {
        name: 'description',
        label: 'Notes',
        type: 'textarea',
        placeholder: 'Describe what starts this automation...',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // ACTION NODES - Perform operations
  // ---------------------------------------------------------------------------
  action: {
    type: 'action',
    label: 'Do Something',
    icon: 'Send',
    iconComponent: Send,
    color: 'from-violet-500 to-purple-600',
    category: 'actions',
    description: 'Send a message, update a record, call an external service, or reshape your data',
    status: 'partial',
    statusNote: 'Slack action is a mock (logs only). All other action types are live.',
    fields: [
      {
        name: 'action_type',
        label: 'What do you want to do?',
        type: 'select',
        required: true,
        options: [
          { value: 'email', label: 'Send an email' },
          { value: 'slack', label: 'Send a Slack message' },
          { value: 'webhook', label: 'Call a web service (Webhook)' },
          { value: 'crm_update', label: 'Update CRM' },
          { value: 'notification', label: 'Send a notification' },
          { value: 'log', label: 'Log for debugging' },
          { value: 'transform', label: 'Reshape my data' },
        ],
      },
      {
        name: 'method',
        label: 'Request type',
        type: 'select',
        default: 'GET',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'DELETE', label: 'DELETE' },
          { value: 'PATCH', label: 'PATCH' },
        ],
      },
      {
        name: 'target',
        label: 'Who or where to send',
        type: 'text',
        placeholder: 'e.g., user@email.com or #channel (not needed for Log)',
      },
      {
        name: 'subject',
        label: 'Subject',
        type: 'text',
        placeholder: 'Email subject or message title',
      },
      {
        name: 'payload',
        label: 'Message Body',
        type: 'textarea',
        placeholder: 'Enter your message content...',
      },
      {
        name: 'from',
        label: 'From (sender email)',
        type: 'text',
        placeholder: 'noreply@yourdomain.com',
      },
      {
        name: 'is_html',
        label: 'Body is HTML',
        type: 'toggle',
        default: false,
      },
      {
        name: 'headers',
        label: 'Extra headers (advanced)',
        type: 'textarea',
        placeholder: '{"Authorization": "Bearer {{token}}"}',
      },
      {
        name: 'query_params',
        label: 'URL parameters (advanced)',
        type: 'textarea',
        placeholder: '{"page": "1", "limit": "10"}',
      },
      {
        name: 'transform_config',
        label: 'Transform Script',
        type: 'dynamic_group',
        watchField: 'action_type',
        conditionalFields: {
          transform: [
            {
              name: 'transform_type',
              label: 'Transform Type',
              type: 'select',
              options: [
                { value: 'merge', label: 'Merge Objects' },
                { value: 'pick', label: 'Pick Fields' },
                { value: 'map', label: 'Map Fields' },
                { value: 'script', label: 'Custom Script' },
              ],
              default: 'script',
            },
            {
              name: 'transform_keys',
              label: 'Keys (comma-separated)',
              type: 'text',
              placeholder: 'name, email, status',
            },
            {
              name: 'script',
              label: 'Data transform script (advanced)',
              type: 'textarea',
              placeholder:
                `// Available: inputs — an object keyed by upstream node IDs
// Must end with a return statement

const customers = inputs['pg_ai_1'].result || [];
const orderMap = {};
for (const o of (inputs['mysql_ai_1'].result || [])) {
  orderMap[String(o.customer_id)] = o;
}
return customers.map(c => ({
  ...c,
  total_orders:   orderMap[String(c.id)]?.total_orders  || 0,
  total_revenue:  orderMap[String(c.id)]?.total_revenue || 0,
  last_order_date: orderMap[String(c.id)]?.last_order_date || null,
  lead_score: Math.min(100, Math.round(
    parseFloat(orderMap[String(c.id)]?.total_revenue || 0) / 1000
  ))
}));`,
            },
          ],
        },
      },
      {
        name: 'retry_policy',
        label: 'Retry on failure',
        type: 'section',
        fields: [
          {
            name: 'enabled',
            label: 'Retry if it fails',
            type: 'toggle',
            default: false,
          },
          {
            name: 'max_attempts',
            label: 'How many retries',
            type: 'number',
            min: 1,
            max: 10,
            default: 3,
          },
          {
            name: 'backoff_seconds',
            label: 'Wait between retries (seconds)',
            type: 'number',
            min: 1,
            max: 3600,
            default: 60,
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // WAIT NODES - Pause execution
  // ---------------------------------------------------------------------------
  wait: {
    type: 'wait',
    label: 'Pause & Wait',
    icon: 'Clock',
    iconComponent: Clock,
    color: 'from-blue-500 to-cyan-500',
    category: 'logic',
    description: 'Hold here until a set time passes, someone replies, or a specific event occurs',
    fields: [
      {
        name: 'wait_type',
        label: 'Wait until...',
        type: 'select',
        required: true,
        options: [
          { value: 'duration', label: 'After a set amount of time' },
          { value: 'signal', label: 'When something happens (event)' },
          { value: 'datetime', label: 'On a specific date and time' },
          { value: 'user_reply', label: 'When the customer replies' },
          { value: 'call_end', label: 'When the phone call ends' },
        ],
      },
      {
        name: 'duration_value',
        label: 'Duration',
        type: 'number',
        min: 1,
        placeholder: 'Enter duration...',
      },
      {
        name: 'duration_unit',
        label: 'Unit',
        type: 'select',
        options: [
          { value: 'seconds', label: 'Seconds' },
          { value: 'minutes', label: 'Minutes' },
          { value: 'hours', label: 'Hours' },
          { value: 'days', label: 'Days' },
        ],
        default: 'hours',
      },
      {
        name: 'datetime',
        label: 'Date & Time',
        type: 'text',
        placeholder: '2025-12-31T23:59:00Z (ISO 8601)',
      },
      {
        name: 'signal_name',
        label: 'Event to wait for',
        type: 'text',
        placeholder: 'e.g., user_replied, payment_received',
      },
      {
        name: 'conversation_id',
        label: 'Conversation ID',
        type: 'text',
        placeholder: '{{trigger.conversationId}}',
      },
      {
        name: 'call_id',
        label: 'Call ID',
        type: 'text',
        placeholder: '{{trigger.callId}}',
      },
      {
        name: 'channel',
        label: 'Channel',
        type: 'select',
        options: [
          { value: 'any', label: 'Any Channel' },
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'sms', label: 'SMS' },
          { value: 'email', label: 'Email' },
        ],
        default: 'any',
      },
      {
        name: 'contact_id',
        label: 'Contact ID',
        type: 'text',
        placeholder: '{{trigger.contactId}}',
      },
      {
        name: 'timeout_enabled',
        label: 'Enable Timeout',
        type: 'toggle',
        default: true,
      },
      {
        name: 'timeout_hours',
        label: 'Give up after (hours)',
        type: 'number',
        min: 1,
        max: 720,
        default: 24,
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // DECISION NODES - Conditional branching (if/else)
  // ---------------------------------------------------------------------------
  decision: {
    type: 'decision',
    label: 'Check a Condition',
    icon: 'GitBranch',
    iconComponent: GitBranch,
    color: 'from-amber-500 to-orange-500',
    category: 'logic',
    description: 'Go different ways depending on whether something is true or false',
    fields: [
      {
        name: 'condition',
        label: 'Condition',
        type: 'condition_builder',
        required: true,
      },
      {
        name: 'true_label',
        label: 'Label for YES path',
        type: 'text',
        default: 'Yes',
        placeholder: 'Label for true branch',
      },
      {
        name: 'false_label',
        label: 'Label for NO path',
        type: 'text',
        default: 'No',
        placeholder: 'Label for false branch',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // AI DECISION NODES - AI-powered routing with confidence
  // ---------------------------------------------------------------------------
  ai_decision: {
    type: 'ai_decision',
    label: 'Ask AI to Decide',
    icon: 'Bot',
    iconComponent: Bot,
    color: 'from-pink-500 to-rose-500',
    category: 'ai',
    description: 'Let AI analyze the situation and pick which path to take',
    fields: [
      {
        name: 'ai_task',
        label: 'What should AI do?',
        type: 'select',
        required: true,
        options: [
          { value: 'classify', label: 'Understand what the person wants' },
          { value: 'sentiment', label: 'Check how they feel (sentiment)' },
          { value: 'extract', label: 'Pull out key details' },
          { value: 'generate', label: 'Write a reply' },
          { value: 'custom', label: 'Custom instructions' },
        ],
      },
      {
        name: 'prompt',
        label: 'What should AI analyze or decide?',
        type: 'textarea',
        required: true,
        placeholder: 'Describe what the AI should analyze or decide...',
      },
      {
        name: 'confidence_threshold',
        label: 'Certainty needed (0–100)',
        type: 'slider',
        min: 0,
        max: 100,
        step: 5,
        default: 80,
      },
      {
        name: 'fallback_action',
        label: 'When AI isn\'t sure enough',
        type: 'select',
        options: [
          { value: 'human_review', label: 'Send to a person' },
          { value: 'retry', label: 'Try again with a different prompt' },
          { value: 'default_path', label: 'Continue normally' },
        ],
        default: 'human_review',
      },
      {
        name: 'model',
        label: 'Which AI to use',
        type: 'select',
        options: [
          { value: 'gpt-4', label: 'GPT-4 (High Quality)' },
          { value: 'gpt-3.5-turbo', label: 'GPT-3.5 (Fast)' },
          { value: 'claude-3', label: 'Claude 3' },
        ],
        default: 'gpt-4',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // APPROVAL NODES - Human-in-the-loop gates
  // ---------------------------------------------------------------------------
  approval: {
    type: 'approval',
    label: 'Ask for Approval',
    icon: 'CheckCircle',
    iconComponent: CheckCircle,
    color: 'from-indigo-500 to-violet-500',
    category: 'logic',
    description: 'Pause until someone on your team approves or rejects before moving on',
    status: 'stub',
    statusNote: 'Pauses the workflow but does not notify anyone or create an approval task yet. Coming soon.',
    fields: [
      {
        name: 'approval_type',
        label: 'Who needs to approve?',
        type: 'select',
        required: true,
        options: [
          { value: 'single', label: 'One person' },
          { value: 'any', label: 'Any one of a group' },
          { value: 'all', label: 'Everyone must agree' },
          { value: 'majority', label: 'More than half' },
        ],
      },
      {
        name: 'approvers',
        label: 'Approvers (email addresses)',
        type: 'text',
        required: true,
        placeholder: 'Email addresses (comma-separated)',
      },
      {
        name: 'approver_roles',
        label: 'Or by role',
        type: 'text',
        placeholder: 'admin, manager, reviewer (comma-separated)',
      },
      {
        name: 'title',
        label: 'What needs approving',
        type: 'text',
        required: true,
        placeholder: 'e.g., Review Marketing Campaign',
      },
      {
        name: 'message',
        label: 'Message to the approver',
        type: 'textarea',
        placeholder: 'Provide context for the approver...',
      },
      {
        name: 'timeout_config',
        label: 'Auto-expire settings',
        type: 'section',
        fields: [
          {
            name: 'timeout_enabled',
            label: 'Auto-expire if no response',
            type: 'toggle',
            default: true,
          },
          {
            name: 'timeout_hours',
            label: 'Expire after (hours)',
            type: 'number',
            min: 1,
            max: 168,
            default: 24,
          },
          {
            name: 'timeout_action',
            label: 'If nobody responds',
            type: 'select',
            options: [
              { value: 'auto_approve', label: 'Approve automatically' },
              { value: 'auto_reject', label: 'Reject automatically' },
              { value: 'escalate', label: 'Escalate to manager' },
            ],
            default: 'escalate',
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // QUERY RECORDS NODE - Fetch data from Business OS database
  // ---------------------------------------------------------------------------
  query_records: {
    type: 'query_records',
    label: 'Find Records',
    icon: 'Database',
    status: 'partial',
    statusNote: 'contacts, leads, deals are fully live. tickets and tasks return empty results (not yet implemented).',
    iconComponent: Database,
    color: 'from-cyan-500 to-blue-600',
    category: 'data',
    description: 'Look up records from any module — CRM, Events, HR, Church, and more',
    fields: [
      {
        name: 'data_source',
        label: 'Module & Table',
        type: 'module_table_select',
        required: true,
      },
      {
        name: 'columns',
        label: 'Columns to use',
        type: 'module_column_select',
      },
      {
        name: 'operation',
        label: 'What to do',
        type: 'select',
        required: true,
        options: [
          { value: 'list', label: 'List all' },
          { value: 'get', label: 'Get one' },
          { value: 'create', label: 'Create new' },
          { value: 'update', label: 'Update existing' },
          { value: 'delete', label: 'Delete' },
        ],
      },
      {
        name: 'batch',
        label: 'Processing mode',
        type: 'batch_config',
      },
      {
        name: 'filter_field',
        label: 'Filter by column',
        type: 'text',
        placeholder: 'e.g., status, assignedTo',
      },
      {
        name: 'filter_value',
        label: 'Filter value',
        type: 'text',
        placeholder: 'Value to match',
      },
      {
        name: 'sort_by',
        label: 'Sort by column',
        type: 'text',
        placeholder: 'e.g., createdAt, name',
      },
      {
        name: 'sort_order',
        label: 'Sort direction',
        type: 'select',
        options: [
          { value: 'asc', label: 'Oldest first (A → Z)' },
          { value: 'desc', label: 'Newest first (Z → A)' },
        ],
        default: 'desc',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // ITERATOR NODE - Loop through a list of items
  // ---------------------------------------------------------------------------
  iterator: {
    type: 'iterator',
    label: 'Repeat for Each',
    icon: 'Repeat',
    iconComponent: Repeat,
    color: 'from-orange-500 to-amber-500',
    category: 'logic',
    description: 'Run these steps for every item in a list — one contact, one order, one row at a time',
    fields: [
      {
        name: 'loop_type',
        label: 'How to repeat',
        type: 'select',
        required: true,
        default: 'forEach',
        options: [
          { value: 'forEach', label: 'For each item in a list' },
          { value: 'times', label: 'A set number of times' },
          { value: 'while', label: 'While a condition is true' },
        ],
      },
      {
        name: 'data_source',
        label: 'Module table to loop over (optional)',
        type: 'module_table_select',
      },
      {
        name: 'list_source',
        label: 'Or use a variable list',
        type: 'text',
        placeholder: '{{query_node.data}}',
      },
      {
        name: 'item_variable',
        label: 'Name for each item (advanced)',
        type: 'text',
        default: 'item',
        placeholder: 'Variable name for each item',
      },
      {
        name: 'index_variable',
        label: 'Item number variable (advanced)',
        type: 'text',
        default: 'index',
        placeholder: 'Variable name for index',
      },
      {
        name: 'iterations',
        label: 'How many times',
        type: 'number',
        min: 1,
        max: 10000,
        default: 10,
        placeholder: 'Number of times to repeat',
      },
      {
        name: 'condition',
        label: 'Keep going while...',
        type: 'text',
        placeholder: '{{counter}} < {{total}}',
      },
      {
        name: 'max_iterations',
        label: 'Max runs (safety limit)',
        type: 'number',
        min: 1,
        max: 10000,
        default: 100,
        placeholder: 'Safety limit for iterations',
      },
      {
        name: 'continue_on_error',
        label: 'Keep going if one item fails',
        type: 'toggle',
        default: true,
      },
      {
        name: 'parallel_execution',
        label: 'Process all at the same time',
        type: 'toggle',
        default: false,
      },
      {
        name: 'batch_size',
        label: 'Items per batch',
        type: 'number',
        min: 1,
        max: 50,
        default: 5,
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // AI ACTION NODE - AI converts text to plugin actions
  // ---------------------------------------------------------------------------
  ai_action: {
    type: 'ai_action',
    label: 'Tell AI What to Do',
    icon: 'Sparkles',
    iconComponent: Sparkles,
    color: 'from-purple-500 to-pink-600',
    category: 'ai',
    description: 'Describe a task in plain words and AI will figure out how to carry it out',
    fields: [
      {
        name: 'instruction',
        label: 'What should AI do?',
        type: 'textarea',
        required: true,
        placeholder: 'Describe the action in natural language...\n\nExample: "Send a follow-up email to this lead with a personalized discount offer based on their browsing history"',
      },
      {
        name: 'target_plugin',
        label: 'Which area to act in',
        type: 'select',
        required: true,
        options: [
          { value: 'core_crm', label: 'Core CRM' },
          { value: 'hr_module', label: 'HR Module' },
          { value: 'gmail_plugin', label: 'Gmail Plugin' },
          { value: 'slack_plugin', label: 'Slack Plugin' },
          { value: 'calendar_plugin', label: 'Calendar Plugin' },
          { value: 'analytics_plugin', label: 'Analytics Plugin' },
          { value: 'billing_plugin', label: 'Billing Plugin' },
        ],
      },
      {
        name: 'risk_level',
        label: 'What AI is allowed to do',
        type: 'select',
        required: true,
        options: [
          { value: 'read_only', label: 'Can only read data' },
          { value: 'allow_actions', label: 'Can make changes' },
          { value: 'full_access', label: 'Full access (admin level)' },
        ],
        default: 'read_only',
      },
      {
        name: 'context_data',
        label: 'Extra info to give AI',
        type: 'textarea',
        placeholder: 'Additional context or variables to pass to AI...\n\nExample: {{lead.name}}, {{lead.email}}, {{previous_interactions}}',
      },
      {
        name: 'require_confirmation',
        label: 'Ask me before AI acts',
        type: 'toggle',
        default: true,
      },
      {
        name: 'fallback_behavior',
        label: 'When AI isn\'t sure what to do',
        type: 'select',
        options: [
          { value: 'ask_human', label: 'Ask me what to do' },
          { value: 'skip', label: 'Skip this step' },
          { value: 'use_default', label: 'Use the default action' },
          { value: 'retry', label: 'Try again with more context' },
        ],
        default: 'ask_human',
      },
      {
        name: 'max_retries',
        label: 'Max retry attempts',
        type: 'number',
        min: 0,
        max: 5,
        default: 2,
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // MONGODB QUERY NODE - Execute MongoDB queries in workflows
  // ---------------------------------------------------------------------------
  mongodb: {
    type: 'mongodb',
    label: 'Search Your Database',
    icon: 'Database',
    iconComponent: Database,
    color: 'from-green-500 to-emerald-600',
    category: 'data',
    description: 'Find records in your connected database — describe what you want in plain English or use filters',
    fields: [
      {
        name: 'database',
        label: 'Database name',
        type: 'text',
        required: true,
        placeholder: 'e.g., my_database',
      },
      {
        name: 'collection',
        label: 'Table / Collection',
        type: 'text',
        required: true,
        placeholder: 'e.g., users, orders',
      },
      {
        name: 'operation',
        label: 'What to do',
        type: 'select',
        required: true,
        options: [
          { value: 'find', label: 'Find matching records' },
          { value: 'findOne', label: 'Find one record' },
          { value: 'aggregate', label: 'Group & summarize records' },
          { value: 'count', label: 'Count records' },
        ],
        default: 'find',
      },
      {
        name: 'use_ai_query',
        label: 'Let AI write the search for me',
        type: 'toggle',
        default: false,
      },
      {
        name: 'ai_query_source',
        label: 'What are you looking for?',
        type: 'text',
        placeholder: 'e.g., users living in India above age 45',
      },
      {
        name: 'query',
        label: 'Filter (advanced — JSON format)',
        type: 'textarea',
        placeholder: '{ "country": "India", "age": { "$gt": 20 } }',
      },
      {
        name: 'projection',
        label: 'Which fields to include (advanced)',
        type: 'textarea',
        placeholder: '{ "email": 1, "name": 1, "_id": 0 }',
      },
      {
        name: 'sort',
        label: 'Sort order (advanced)',
        type: 'textarea',
        placeholder: '{ "createdAt": -1 }',
      },
      {
        name: 'limit',
        label: 'Max records to return',
        type: 'number',
        min: 1,
        max: 10000,
        default: 100,
        placeholder: 'Max documents to return',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // POSTGRESQL QUERY NODE - Execute PostgreSQL queries in workflows
  // ---------------------------------------------------------------------------
  postgresql: {
    type: 'postgresql',
    label: 'Search Table Data',
    icon: 'Table2',
    iconComponent: Table2,
    color: 'from-blue-500 to-indigo-600',
    category: 'data',
    description: 'Look up rows from your connected database table — describe what you want or write your own query',
    fields: [
      {
        name: 'connectionString',
        label: 'Database address',
        type: 'text',
        placeholder: 'postgresql://user:password@localhost:5434/flyn_data',
      },
      {
        name: 'host',
        label: 'Server address',
        type: 'text',
        placeholder: 'localhost (used if Database address is empty)',
      },
      {
        name: 'port',
        label: 'Port number',
        type: 'number',
        default: 5434,
        placeholder: '5434',
      },
      {
        name: 'database',
        label: 'Database name',
        type: 'text',
        placeholder: 'e.g., flyn_data',
      },
      {
        name: 'user',
        label: 'Username',
        type: 'text',
        placeholder: 'flyn',
      },
      {
        name: 'password',
        label: 'Password',
        type: 'text',
        placeholder: 'password',
      },
      {
        name: 'table',
        label: 'Table name',
        type: 'text',
        placeholder: 'e.g., users, orders',
      },
      {
        name: 'useAiQuery',
        label: 'Let AI write the query for me',
        type: 'toggle',
        default: false,
      },
      {
        name: 'aiQueryPrompt',
        label: 'What are you looking for?',
        type: 'text',
        placeholder: 'e.g., all users older than 30 sorted by name',
      },
      {
        name: 'query',
        label: 'Custom SQL (advanced users)',
        type: 'textarea',
        placeholder: 'SELECT * FROM users WHERE age > $1',
      },
      {
        name: 'params',
        label: 'Query values (advanced)',
        type: 'textarea',
        placeholder: '[30]',
      },
      {
        name: 'limit',
        label: 'Max rows to return',
        type: 'number',
        min: 1,
        max: 10000,
        default: 100,
        placeholder: 'Max rows to return',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // MYSQL QUERY NODE - Execute MySQL queries in workflows
  // ---------------------------------------------------------------------------
  mysql: {
    type: 'mysql',
    label: 'Search MySQL Table',
    icon: 'CircleDot',
    iconComponent: CircleDot,
    color: 'from-orange-500 to-amber-600',
    category: 'data',
    description: 'Find records in your connected MySQL database — describe what you want or write your own query',
    fields: [
      {
        name: 'connectionString',
        label: 'Database address',
        type: 'text',
        placeholder: 'mysql://user:password@localhost:3307/flyn_data',
      },
      {
        name: 'host',
        label: 'Server address',
        type: 'text',
        placeholder: 'localhost (used if Database address is empty)',
      },
      {
        name: 'port',
        label: 'Port number',
        type: 'number',
        default: 3307,
        placeholder: '3307',
      },
      {
        name: 'database',
        label: 'Database name',
        type: 'text',
        placeholder: 'e.g., flyn_data',
      },
      {
        name: 'user',
        label: 'Username',
        type: 'text',
        placeholder: 'flyn',
      },
      {
        name: 'password',
        label: 'Password',
        type: 'text',
        placeholder: 'password',
      },
      {
        name: 'table',
        label: 'Table name',
        type: 'text',
        placeholder: 'e.g., users, orders',
      },
      {
        name: 'useAiQuery',
        label: 'Let AI write the query for me',
        type: 'toggle',
        default: false,
      },
      {
        name: 'aiQueryPrompt',
        label: 'What are you looking for?',
        type: 'text',
        placeholder: 'e.g., all orders placed this month above $100',
      },
      {
        name: 'query',
        label: 'Custom SQL (advanced users)',
        type: 'textarea',
        placeholder: 'SELECT * FROM orders WHERE total > ?',
      },
      {
        name: 'params',
        label: 'Query values (advanced)',
        type: 'textarea',
        placeholder: '[100]',
      },
      {
        name: 'limit',
        label: 'Max rows to return',
        type: 'number',
        min: 1,
        max: 10000,
        default: 100,
        placeholder: 'Max rows to return',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // MERGE NODE — visual join of two upstream datasets, no scripting needed
  // ---------------------------------------------------------------------------
  merge: {
    type: 'merge',
    label: 'Combine Two Lists',
    icon: 'GitMerge',
    iconComponent: GitMerge,
    color: 'from-teal-500 to-cyan-600',
    category: 'data',
    description: 'Match and merge two sets of data together using a shared field — no code needed',
    fields: [
      // ── Left dataset ──────────────────────────────────────────────────────
      {
        name: 'leftSourceId',
        label: 'First list — node ID',
        type: 'text',
        required: true,
        placeholder: 'e.g.  pg_ai_1  (copy from the upstream node)',
      },
      {
        name: 'leftPath',
        label: 'Data field in first list',
        type: 'text',
        placeholder: 'result  (the field inside the node output that holds the array)',
        default: 'result',
      },
      {
        name: 'leftKey',
        label: 'Match on field (first list)',
        type: 'text',
        required: true,
        placeholder: 'e.g.  id',
      },
      // ── Right dataset ─────────────────────────────────────────────────────
      {
        name: 'rightSourceId',
        label: 'Second list — node ID',
        type: 'text',
        required: true,
        placeholder: 'e.g.  mysql_ai_1',
      },
      {
        name: 'rightPath',
        label: 'Data field in second list',
        type: 'text',
        placeholder: 'result',
        default: 'result',
      },
      {
        name: 'rightKey',
        label: 'Match on field (second list)',
        type: 'text',
        required: true,
        placeholder: 'e.g.  customer_id',
      },
      // ── Join type ─────────────────────────────────────────────────────────
      {
        name: 'joinType',
        label: 'How to combine',
        type: 'select',
        default: 'left',
        options: [
          { value: 'left', label: 'Keep all from first list (even if no match)' },
          { value: 'inner', label: 'Only where both lists match' },
        ],
      },
      // ── Computed fields ───────────────────────────────────────────────────
      {
        name: 'computedFields',
        label: 'Add calculated fields (optional)',
        type: 'textarea',
        placeholder:
          `// One line per field:  fieldName = expression
// Use left.FIELD and right.FIELD to access joined row values

lead_score = Math.min(100, Math.round(right.total_revenue / 1000))
total_orders = right.total_orders
total_revenue = right.total_revenue
last_order_date = right.last_order_date`,
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // AI ROUTER NODE - Natural language to MongoDB query + routing
  // ---------------------------------------------------------------------------
  ai_router: {
    type: 'ai_router',
    label: 'AI Smart Search',
    icon: 'Bot',
    iconComponent: Bot,
    color: 'from-rose-500 to-pink-600',
    category: 'ai',
    description: 'Describe what you want to find or do in plain words — AI figures out the rest',
    fields: [
      {
        name: 'prompt',
        label: 'What are you looking for?',
        type: 'textarea',
        required: true,
        placeholder: 'e.g., "Find all users in India above age 20 and get their emails"',
      },
      {
        name: 'task',
        label: 'What should AI do?',
        type: 'select',
        required: true,
        options: [
          { value: 'generate_mongo_query', label: 'Search database records' },
          { value: 'classify_intent', label: 'Figure out what someone wants' },
          { value: 'extract_data', label: 'Pull out key info' },
          { value: 'custom', label: 'Custom instructions' },
          { value: 'generate_inbox_reply', label: 'Write an inbox reply' },
          { value: 'analyze_sentiment', label: 'Analyze how someone feels' },
        ],
        default: 'generate_mongo_query',
      },
      {
        name: 'confidence_threshold',
        label: 'Certainty needed (0–100)',
        type: 'slider',
        min: 0,
        max: 100,
        step: 5,
        default: 80,
      },
      {
        name: 'fallback_action',
        label: 'If AI isn\'t sure enough',
        type: 'select',
        options: [
          { value: 'human_review', label: 'Send to a person to review' },
          { value: 'default_path', label: 'Continue normally' },
          { value: 'error', label: 'Stop with an error' },
        ],
        default: 'human_review',
      },
      {
        name: 'system_prompt',
        label: 'Custom AI instructions (optional)',
        type: 'textarea',
        placeholder: 'Custom instructions for the AI model...',
      },
      {
        name: 'context_collections',
        label: 'Available data tables',
        type: 'text',
        placeholder: 'users, orders, products (comma-separated)',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // MORGAN LEADS NODE - Dedicated AI Agent Node
  // ---------------------------------------------------------------------------
  morgan_leads: {
    type: 'morgan_leads',
    label: 'Call a Lead (Morgan)',
    icon: 'Phone',
    iconComponent: Phone,
    color: 'from-pink-500 to-rose-600',
    category: 'ai',
    description: 'Have Morgan, your AI sales agent, call and qualify a lead automatically',
    fields: [
      {
        name: 'customer_number',
        label: 'Customer Phone Number',
        type: 'text',
        required: true,
        placeholder: '+1234567890 or {{trigger.phone}}',
      },
      {
        name: 'phone_number_id',
        label: 'Caller phone ID (optional)',
        type: 'text',
        placeholder: 'Overrides default Vapi phone number',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // FLYN FEEDBACK NODE - Dedicated AI Agent Node
  // ---------------------------------------------------------------------------
  flyn_feedback: {
    type: 'flyn_feedback',
    label: 'Collect Feedback by Phone',
    icon: 'MessageSquareStar',
    iconComponent: MessageSquare,
    color: 'from-amber-500 to-orange-600',
    category: 'ai',
    description: 'Automatically call a customer to gather their rating, NPS score, or testimonial',
    fields: [
      {
        name: 'customer_number',
        label: 'Customer Phone Number',
        type: 'text',
        required: true,
        placeholder: '+1234567890 or {{trigger.phone}}',
      },
      {
        name: 'phone_number_id',
        label: 'Caller phone ID (optional)',
        type: 'text',
        placeholder: 'Overrides default Vapi phone number',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // HR VOICE AGENT NODE - Dedicated AI Agent Node
  // ---------------------------------------------------------------------------
  hr_voice_agent: {
    type: 'hr_voice_agent',
    label: 'Call an Employee (HR)',
    icon: 'Phone',
    iconComponent: Phone,
    color: 'from-yellow-400 to-yellow-600',
    category: 'ai',
    description: 'Have your AI HR agent call an employee about PTO, benefits, payroll, or company policies',
    fields: [
      {
        name: 'customer_number',
        label: 'Employee Phone Number',
        type: 'text',
        required: true,
        placeholder: '+1234567890 or {{trigger.phone}}',
      },
      {
        name: 'phone_number_id',
        label: 'Caller phone ID (optional)',
        type: 'text',
        placeholder: 'Overrides default Vapi phone number',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // FREELANCER VOICE AGENT NODE - Dedicated AI Agent Node
  // ---------------------------------------------------------------------------
  freelancer_voice_agent: {
    type: 'freelancer_voice_agent',
    label: 'Call a Freelancer',
    icon: 'Phone',
    iconComponent: Phone,
    color: 'from-teal-400 to-teal-600',
    category: 'ai',
    description: 'Have your AI agent call a freelancer to onboard or manage them',
    fields: [
      {
        name: 'customer_number',
        label: 'Freelancer Phone Number',
        type: 'text',
        required: true,
        placeholder: '+1234567890 or {{trigger.phone}}',
      },
      {
        name: 'phone_number_id',
        label: 'Caller phone ID (optional)',
        type: 'text',
        placeholder: 'Overrides default Vapi phone number',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // CHURCH VOICE AGENT NODE - Dedicated AI Agent Node
  // ---------------------------------------------------------------------------
  church_voice_agent: {
    type: 'church_voice_agent',
    label: 'Call a Member',
    icon: 'Phone',
    iconComponent: Phone,
    color: 'from-pink-400 to-pink-600',
    category: 'ai',
    description: 'Have your AI agent call a church member for onboarding or pastoral support',
    fields: [
      {
        name: 'customer_number',
        label: 'Member Phone Number',
        type: 'text',
        required: true,
        placeholder: '+1234567890 or {{trigger.phone}}',
      },
      {
        name: 'phone_number_id',
        label: 'Caller phone ID (optional)',
        type: 'text',
        placeholder: 'Overrides default Vapi phone number',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // VOICE AGENT NODE - Dynamic (user-created) AI Voice Agent
  // ---------------------------------------------------------------------------
  voice_agent: {
    type: 'voice_agent',
    label: 'Make an AI Phone Call',
    icon: 'Bot',
    iconComponent: Bot,
    color: 'from-indigo-500 to-purple-600',
    category: 'ai',
    description: 'Use one of your saved AI agents to automatically call someone',
    fields: [
      {
        name: 'agent_id',
        label: 'Select Agent',
        type: 'select',
        required: true,
        options: [], // Populated dynamically from useAgentStore
        placeholder: 'Choose a saved agent…',
      },
      {
        name: 'customer_number',
        label: 'Customer Phone Number',
        type: 'text',
        required: true,
        placeholder: '+1234567890 or {{trigger.phone}}',
      },
      {
        name: 'phone_number_id',
        label: 'Caller phone ID (optional)',
        type: 'text',
        placeholder: 'Overrides default Vapi phone number',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // SPLIT NODE - Fork into parallel branches
  // ---------------------------------------------------------------------------
  split: {
    type: 'split',
    label: 'Do Multiple Things at Once',
    icon: 'SplitSquareHorizontal',
    iconComponent: SplitSquareHorizontal,
    color: 'from-violet-500 to-purple-500',
    category: 'logic',
    description: 'Split into parallel paths that all run at the same time',
    fields: [
      {
        name: 'description',
        label: 'Description',
        type: 'text',
        placeholder: 'Why split into parallel branches?',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // JOIN NODE - Wait for parallel branches to complete
  // ---------------------------------------------------------------------------
  join: {
    type: 'join',
    label: 'Wait for All to Finish',
    icon: 'GitMerge',
    iconComponent: GitMerge,
    color: 'from-violet-500 to-purple-500',
    category: 'logic',
    description: 'Hold here until all parallel paths above have completed',
    fields: [
      {
        name: 'merge_strategy',
        label: 'When to continue',
        type: 'select',
        required: true,
        default: 'all',
        options: [
          { value: 'all', label: 'Wait for all paths to finish' },
          { value: 'first', label: 'Continue as soon as one finishes' },
          { value: 'any', label: 'Continue when N paths finish' },
        ],
      },
      {
        name: 'expected_branches',
        label: 'Number of paths needed',
        type: 'number',
        default: 2,
        min: 1,
        max: 20,
      },
      {
        name: 'required_count',
        label: 'Required Count',
        type: 'number',
        min: 1,
        max: 10,
        default: 2,
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // END NODE - Explicit workflow termination
  // ---------------------------------------------------------------------------
  end: {
    type: 'end',
    label: 'Finish',
    icon: 'StopCircle',
    iconComponent: StopCircle,
    color: 'from-red-500 to-rose-500',
    category: 'logic',
    description: 'Mark the end of this automation',
    fields: [
      {
        name: 'output_mapping',
        label: 'Final output mapping (advanced)',
        type: 'textarea',
        placeholder: '{"finalResult": "action-1.result", "status": "trigger.data.status"}',
      },
      {
        name: 'include_all_outputs',
        label: 'Include all step results',
        type: 'toggle',
        default: true,
      },
    ],
  },

  // ========================================================================
  // PLUGIN NODES
  // ========================================================================

  crm: {
    type: 'crm',
    label: 'Update Your CRM',
    icon: 'Users',
    iconComponent: Users,
    color: 'from-emerald-500 to-teal-500',
    category: 'plugins',
    description: 'Add or update contacts, create deals, log calls, or look up people in your CRM',
    fields: [
      {
        name: 'operation',
        label: 'Operation',
        type: 'select',
        required: true,
        options: [
          { value: 'create_contact', label: 'Create Contact' },
          { value: 'update_contact', label: 'Update Contact' },
          { value: 'get_contacts', label: 'Get Contacts' },
          { value: 'create_deal', label: 'Create Deal' },
          { value: 'update_deal_stage', label: 'Update Deal Stage' },
          { value: 'log_activity', label: 'Log Activity' },
        ],
        default: 'create_contact',
      },
      {
        // dynamic_group: switches input fields based on the selected operation
        name: 'op_fields',
        label: 'Operation Fields',
        type: 'dynamic_group',
        watchField: 'operation',
        conditionalFields: {
          create_contact: [
            { name: 'name', label: 'Name', type: 'text', required: true, placeholder: '{{mongodb_0.result.name}} or {{trigger.data.name}}' },
            { name: 'email', label: 'Email', type: 'text', placeholder: '{{mongodb_0.result.email}}' },
            { name: 'phone', label: 'Phone', type: 'text', placeholder: '{{mongodb_0.result.phone}}' },
            { name: 'company', label: 'Company', type: 'text', placeholder: '{{mongodb_0.result.company}}' },
            {
              name: 'status', label: 'Status', type: 'select', default: 'lead',
              options: [
                { value: 'lead', label: 'Lead' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'customer', label: 'Customer' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
            { name: 'source', label: 'Source', type: 'text', placeholder: '{{mongodb_0.result.source}} or Website' },
            { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Any additional notes...' },
          ],
          update_contact: [
            { name: 'contactId', label: 'Contact ID', type: 'text', required: true, placeholder: '{{crm_0.contact._id}}' },
            { name: 'name', label: 'Name', type: 'text', placeholder: 'Updated name' },
            { name: 'email', label: 'Email', type: 'text', placeholder: 'Updated email' },
            { name: 'phone', label: 'Phone', type: 'text', placeholder: 'Updated phone' },
            { name: 'company', label: 'Company', type: 'text', placeholder: 'Updated company' },
            {
              name: 'status', label: 'Status', type: 'select',
              options: [
                { value: 'lead', label: 'Lead' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'customer', label: 'Customer' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
            { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Updated notes...' },
          ],
          get_contacts: [
            { name: 'search', label: 'Search', type: 'text', placeholder: 'Search by name or email' },
            {
              name: 'status', label: 'Filter by Status', type: 'select', default: 'all',
              options: [
                { value: 'all', label: 'All' },
                { value: 'lead', label: 'Lead' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'customer', label: 'Customer' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
            { name: 'limit', label: 'Limit', type: 'number', default: 20, min: 1, max: 100 },
          ],
          create_deal: [
            { name: 'title', label: 'Deal Title', type: 'text', required: true, placeholder: '{{mongodb_0.result.company}} - New Deal' },
            { name: 'value', label: 'Deal Value ($)', type: 'text', placeholder: '{{mongodb_0.result.deal_value}} or 5000' },
            {
              name: 'stage', label: 'Stage', type: 'select', default: 'new',
              options: [
                { value: 'new', label: 'New' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'proposal', label: 'Proposal' },
                { value: 'negotiation', label: 'Negotiation' },
                { value: 'won', label: 'Won' },
                { value: 'lost', label: 'Lost' },
              ],
            },
            { name: 'contactId', label: 'Contact ID', type: 'text', placeholder: '{{crm_0.contact._id}}' },
            { name: 'probability', label: 'Probability (%)', type: 'number', min: 0, max: 100 },
            { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Deal notes...' },
          ],
          update_deal_stage: [
            { name: 'dealId', label: 'Deal ID', type: 'text', required: true, placeholder: '{{crm_0.deal._id}}' },
            {
              name: 'stage', label: 'New Stage', type: 'select', required: true,
              options: [
                { value: 'new', label: 'New' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'proposal', label: 'Proposal' },
                { value: 'negotiation', label: 'Negotiation' },
                { value: 'won', label: 'Won' },
                { value: 'lost', label: 'Lost' },
              ],
            },
          ],
          log_activity: [
            {
              name: 'type', label: 'Activity Type', type: 'select', required: true, default: 'call',
              options: [
                { value: 'call', label: 'Call' },
                { value: 'email', label: 'Email' },
                { value: 'meeting', label: 'Meeting' },
                { value: 'note', label: 'Note' },
                { value: 'task', label: 'Task' },
              ],
            },
            { name: 'description', label: 'Description', type: 'textarea', placeholder: 'What happened? e.g. Initial outreach call' },
            { name: 'actor', label: 'Actor', type: 'text', placeholder: 'AI Workflow', default: 'AI Workflow' },
            { name: 'contactId', label: 'Contact ID', type: 'text', placeholder: '{{crm_0.contact._id}}' },
          ],
        },
      },
    ],
  },

  accounting: {
    type: 'accounting',
    label: 'Accounting & Billing',
    icon: 'DollarSign',
    iconComponent: DollarSign,
    color: 'from-emerald-500 to-teal-600',
    category: 'plugins',
    description: 'Create invoices, record expenses, or track financial KPIs automatically across all modules',
    fields: [
      {
        name: 'operation',
        label: 'Operation',
        type: 'select',
        required: true,
        options: [
          { value: 'create_invoice', label: 'Create Invoice' },
          { value: 'update_invoice', label: 'Update Invoice' },
          { value: 'get_invoices', label: 'Search Invoices' },
          { value: 'create_expense', label: 'Record Expense' },
          { value: 'get_stats', label: 'Get Financial Stats' },
        ],
        default: 'create_invoice',
      },
      {
        name: 'op_fields',
        label: 'Operation Fields',
        type: 'dynamic_group',
        watchField: 'operation',
        conditionalFields: {
          create_invoice: [
            { name: 'client', label: 'Client Name', type: 'text', required: true, placeholder: '{{trigger.data.name}} or {{crm_0.contact.name}}' },
            { name: 'amount', label: 'Amount', type: 'text', required: true, placeholder: '500.00' },
            {
              name: 'currency', label: 'Currency', type: 'select', default: 'USD',
              options: [
                { value: 'USD', label: 'USD - US Dollar' },
                { value: 'AED', label: 'AED - UAE Dirham' },
                { value: 'SAR', label: 'SAR - Saudi Riyal' },
                { value: 'GHS', label: 'GHS - Ghana Cedi' },
                { value: 'KES', label: 'KES - Kenyan Shilling' },
                { value: 'ZAR', label: 'ZAR - SA Rand' },
                { value: 'INR', label: 'INR - Indian Rupee' },
                { value: 'PHP', label: 'PHP - Philippine Peso' },
                { value: 'EUR', label: 'EUR - Euro' },
                { value: 'GBP', label: 'GBP - British Pound' },
              ],
            },
            { name: 'due_date', label: 'Due Date', type: 'text', placeholder: 'YYYY-MM-DD (defaults to 30 days)' },
            {
              name: 'module', label: 'Source Module', type: 'select', default: 'Workflow',
              options: [
                { value: 'CRM', label: 'CRM' },
                { value: 'Events', label: 'Events' },
                { value: 'eSIM', label: 'eSIM' },
                { value: 'Church', label: 'Church' },
                { value: 'HR', label: 'HR' },
                { value: 'Coaches', label: 'Coaches' },
                { value: 'Workflow', label: 'AI Workflow' },
              ],
            },
            { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Services rendered...' },
          ],
          update_invoice: [
            { name: 'invoiceId', label: 'Invoice ID', type: 'text', required: true, placeholder: '{{accounting_0.invoice._id}}' },
            {
              name: 'status', label: 'New Status', type: 'select',
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'pending', label: 'Pending / Sent' },
                { value: 'paid', label: 'Paid' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'cancelled', label: 'Cancelled' },
              ],
            },
            { name: 'amount', label: 'Update Amount', type: 'text' },
          ],
          get_invoices: [
            { name: 'search', label: 'Search Client', type: 'text' },
            {
              name: 'status', label: 'Filter by Status', type: 'select', default: 'all',
              options: [
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'paid', label: 'Paid' },
                { value: 'overdue', label: 'Overdue' },
              ],
            },
            { name: 'limit', label: 'Limit', type: 'number', default: 20 },
          ],
          create_expense: [
            { name: 'description', label: 'Description', type: 'text', required: true, placeholder: 'Office supplies' },
            { name: 'amount', label: 'Amount', type: 'text', required: true },
            {
              name: 'category', label: 'Category', type: 'select', default: 'General',
              options: [
                { value: 'Travel', label: 'Travel' },
                { value: 'Software', label: 'Software' },
                { value: 'Marketing', label: 'Marketing' },
                { value: 'Payroll', label: 'Payroll' },
                { value: 'General', label: 'General' },
              ],
            },
            { name: 'date', label: 'Date', type: 'text', placeholder: 'YYYY-MM-DD' },
          ],
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // VAPI VOICE CALL NODE - AI Voice calls via Vapi
  // ---------------------------------------------------------------------------
  vapi: {
    type: 'vapi',
    label: 'Make a Phone Call',
    icon: 'Phone',
    iconComponent: Phone,
    color: 'from-purple-600 to-indigo-700',
    category: 'actions',
    description: 'Place an AI-powered outbound call — call someone, set up a voice assistant, or check recent calls',
    fields: [
      {
        name: 'vapi_action',
        label: 'What to do',
        type: 'select',
        required: true,
        options: [
          { value: 'create_call', label: 'Call someone' },
          { value: 'create_assistant', label: 'Set up a voice assistant' },
          { value: 'list_calls', label: 'See recent calls' },
        ],
      },
      {
        name: 'call_config',
        label: 'Call Configuration',
        type: 'dynamic_group',
        watchField: 'vapi_action',
        conditionalFields: {
          create_call: [
            {
              name: 'phone_number_id',
              label: 'Your caller phone ID',
              type: 'text',
              required: true,
              placeholder: 'Your Vapi phone number ID',
            },
            {
              name: 'customer_number',
              label: 'Who to call',
              type: 'text',
              required: true,
              placeholder: '+1234567890 or {{trigger.phone}}',
            },
            {
              name: 'assistant_id',
              label: 'Which AI assistant to use',
              type: 'text',
              required: true,
              placeholder: 'Your Vapi assistant ID',
            },
          ],
          create_assistant: [
            {
              name: 'assistant_name',
              label: 'Assistant name',
              type: 'text',
              required: true,
              placeholder: 'e.g., Sales Assistant',
            },
            {
              name: 'first_message',
              label: 'First Message',
              type: 'textarea',
              required: true,
              placeholder: 'Hi! How can I help you today?',
            },
            {
              name: 'system_prompt',
              label: 'AI personality and instructions',
              type: 'textarea',
              placeholder: 'You are a friendly sales representative...',
            },
            {
              name: 'model_provider',
              label: 'AI provider',
              type: 'select',
              options: [
                { value: 'openai', label: 'OpenAI' },
                { value: 'anthropic', label: 'Anthropic' },
                { value: 'google', label: 'Google (Gemini)' },
              ],
              default: 'openai',
            },
            {
              name: 'model_name',
              label: 'Model',
              type: 'select',
              options: [
                { value: 'gpt-4o', label: 'GPT-4o' },
                { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
                { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
              ],
              default: 'gpt-4o',
            },
            {
              name: 'voice_provider',
              label: 'Voice service',
              type: 'select',
              options: [
                { value: '11labs', label: 'ElevenLabs' },
                { value: 'deepgram', label: 'Deepgram' },
                { value: 'playht', label: 'PlayHT' },
              ],
              default: '11labs',
            },
            {
              name: 'voice_id',
              label: 'Voice ID',
              type: 'text',
              placeholder: '21m00Tcm4TlvDq8ikWAM',
            },
          ],
          list_calls: [
            {
              name: 'limit',
              label: 'Max Results',
              type: 'number',
              min: 1,
              max: 100,
              default: 10,
            },
          ],
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // WEBRTC VOICE NODE — Real-time audio via WebRTC + AWS Lambda
  // ---------------------------------------------------------------------------
  webrtc: {
    type: 'webrtc',
    label: 'Live Voice Stream',
    icon: 'Radio',
    iconComponent: Radio,
    color: 'from-sky-500 to-cyan-500',
    category: 'plugins',
    description: 'Start a real-time voice call session and process audio with AI',
    fields: [
      {
        name: 'webrtc_action',
        label: 'What to do',
        type: 'select',
        required: true,
        options: [
          { value: 'start_session', label: 'Start Voice Session' },
          { value: 'end_session', label: 'End Voice Session' },
          { value: 'get_status', label: 'Get Session Status' },
          { value: 'process_audio', label: 'Process Audio Chunk' },
        ],
      },
      {
        name: 'session_fields',
        label: 'Session Configuration',
        type: 'dynamic_group',
        watchField: 'webrtc_action',
        conditionalFields: {
          end_session: [
            {
              name: 'session_id',
              label: 'Session ID',
              type: 'text',
              required: true,
              placeholder: '{{webrtc_start.result.sessionId}}',
            },
          ],
          get_status: [
            {
              name: 'session_id',
              label: 'Session ID',
              type: 'text',
              required: true,
              placeholder: '{{webrtc_start.result.sessionId}}',
            },
          ],
          process_audio: [
            {
              name: 'session_id',
              label: 'Session ID',
              type: 'text',
              required: true,
              placeholder: '{{webrtc_start.result.sessionId}}',
            },
            {
              name: 'audio_data',
              label: 'Audio data (encoded)',
              type: 'textarea',
              required: true,
              placeholder: 'Base64-encoded audio data',
            },
          ],
        },
      },
      {
        name: 'lambda_config',
        label: 'Processing settings (advanced)',
        type: 'section',
        fields: [
          {
            name: 'lambda_function',
            label: 'Processing function name',
            type: 'text',
            placeholder: 'flyn-audio-processor (uses .env default if empty)',
          },
          {
            name: 'aws_region',
            label: 'Server region',
            type: 'text',
            placeholder: 'us-east-1 (uses .env default if empty)',
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // HR NODE — Human Resources management
  // ---------------------------------------------------------------------------
  hr: {
    type: 'hr',
    label: 'HR Tasks',
    icon: 'Briefcase',
    iconComponent: Briefcase,
    color: 'from-amber-500 to-orange-600',
    category: 'plugins',
    description: 'Add employees, approve leave, log attendance, or sync with your CRM',
    fields: [
      {
        name: 'operation',
        label: 'Operation',
        type: 'select',
        required: true,
        options: [
          { value: 'create_employee', label: 'Create Employee' },
          { value: 'update_employee', label: 'Update Employee' },
          { value: 'get_employees', label: 'Get Employees' },
          { value: 'get_employee', label: 'Get Single Employee' },
          { value: 'create_leave_request', label: 'Create Leave Request' },
          { value: 'log_attendance', label: 'Log Attendance' },
          { value: 'sync_to_crm', label: 'Sync to CRM' },
        ],
        default: 'create_employee',
      },
      {
        name: 'op_fields',
        label: 'Operation Fields',
        type: 'dynamic_group',
        watchField: 'operation',
        conditionalFields: {
          create_employee: [
            { name: 'name', label: 'Full Name', type: 'text', required: true, placeholder: '{{trigger.data.name}}' },
            { name: 'email', label: 'Email', type: 'text', required: true, placeholder: '{{trigger.data.email}}' },
            { name: 'phone', label: 'Phone', type: 'text', placeholder: '+1234567890' },
            {
              name: 'department', label: 'Department', type: 'select', default: 'general',
              options: [
                { value: 'general', label: 'General' },
                { value: 'engineering', label: 'Engineering' },
                { value: 'sales', label: 'Sales' },
                { value: 'marketing', label: 'Marketing' },
                { value: 'hr', label: 'Human Resources' },
                { value: 'finance', label: 'Finance' },
                { value: 'operations', label: 'Operations' },
              ],
            },
            { name: 'position', label: 'Position / Title', type: 'text', placeholder: 'e.g., Software Engineer' },
            { name: 'start_date', label: 'Start Date', type: 'text', placeholder: 'YYYY-MM-DD' },
            { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes...' },
          ],
          get_employee: [
            { name: 'entityId', label: 'Employee ID', type: 'text', required: true, placeholder: 'e.g., emp_001 or {{upstream.id}}' },
          ],
          update_employee: [
            { name: 'employeeId', label: 'Employee ID', type: 'text', required: true, placeholder: '{{hr_0.employee._id}}' },
            { name: 'name', label: 'Full Name', type: 'text', placeholder: 'Updated name' },
            { name: 'email', label: 'Email', type: 'text', placeholder: 'Updated email' },
            { name: 'phone', label: 'Phone', type: 'text', placeholder: 'Updated phone' },
            {
              name: 'department', label: 'Department', type: 'select',
              options: [
                { value: 'general', label: 'General' },
                { value: 'engineering', label: 'Engineering' },
                { value: 'sales', label: 'Sales' },
                { value: 'marketing', label: 'Marketing' },
                { value: 'hr', label: 'Human Resources' },
                { value: 'finance', label: 'Finance' },
                { value: 'operations', label: 'Operations' },
              ],
            },
            { name: 'position', label: 'Position / Title', type: 'text', placeholder: 'Updated position' },
            {
              name: 'status', label: 'Status', type: 'select',
              options: [
                { value: 'active', label: 'Active' },
                { value: 'on_leave', label: 'On Leave' },
                { value: 'terminated', label: 'Terminated' },
              ],
            },
          ],
          get_employees: [
            { name: 'search', label: 'Search', type: 'text', placeholder: 'Search by name or email' },
            {
              name: 'department', label: 'Filter by Department', type: 'select', default: 'all',
              options: [
                { value: 'all', label: 'All' },
                { value: 'engineering', label: 'Engineering' },
                { value: 'sales', label: 'Sales' },
                { value: 'marketing', label: 'Marketing' },
                { value: 'hr', label: 'Human Resources' },
                { value: 'finance', label: 'Finance' },
                { value: 'operations', label: 'Operations' },
              ],
            },
            { name: 'limit', label: 'Limit', type: 'number', default: 20, min: 1, max: 100 },
          ],
          create_leave_request: [
            { name: 'employeeId', label: 'Employee ID', type: 'text', required: true, placeholder: '{{hr_0.employee._id}}' },
            {
              name: 'leave_type', label: 'Leave Type', type: 'select', required: true, default: 'vacation',
              options: [
                { value: 'vacation', label: 'Vacation' },
                { value: 'sick', label: 'Sick Leave' },
                { value: 'personal', label: 'Personal' },
                { value: 'maternity', label: 'Maternity/Paternity' },
              ],
            },
            { name: 'start_date', label: 'Start Date', type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
            { name: 'end_date', label: 'End Date', type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
            { name: 'reason', label: 'Reason', type: 'textarea', placeholder: 'Reason for leave...' },
          ],
          log_attendance: [
            { name: 'employeeId', label: 'Employee ID', type: 'text', required: true, placeholder: '{{hr_0.employee._id}}' },
            {
              name: 'type', label: 'Type', type: 'select', required: true, default: 'check_in',
              options: [
                { value: 'check_in', label: 'Check In' },
                { value: 'check_out', label: 'Check Out' },
              ],
            },
            { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Optional notes' },
          ],
          sync_to_crm: [
            { name: 'employeeId', label: 'Employee ID', type: 'text', required: true, placeholder: '{{hr_0.employee._id}}' },
            {
              name: 'crm_status', label: 'CRM Contact Status', type: 'select', default: 'customer',
              options: [
                { value: 'lead', label: 'Lead' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'customer', label: 'Customer' },
              ],
            },
            { name: 'notes', label: 'CRM Notes', type: 'textarea', placeholder: 'Notes to attach to CRM contact...' },
          ],
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // CHURCH NODE — Church management
  // ---------------------------------------------------------------------------
  church: {
    type: 'church',
    label: 'Church Management',
    icon: 'Heart',
    iconComponent: Heart,
    color: 'from-pink-500 to-rose-600',
    category: 'plugins',
    description: 'Add members, record donations, create events, or sync members to your CRM',
    fields: [
      {
        name: 'operation',
        label: 'Operation',
        type: 'select',
        required: true,
        options: [
          { value: 'add_member', label: 'Add Member' },
          { value: 'update_member', label: 'Update Member' },
          { value: 'get_members', label: 'Search Members' },
          { value: 'list_members', label: 'List All Members' },
          { value: 'get_stats', label: 'Get Church Stats' },
          { value: 'get_attendance_ai', label: 'Analyze Attendance (AI)' },
          { value: 'get_volunteer_blockouts', label: 'Get Volunteer Availability' },
          { value: 'create_volunteer_blockout', label: 'Assign Volunteer Role' },
          { value: 'record_donation', label: 'Record Donation' },
          { value: 'create_event', label: 'Create Event' },
          { value: 'sync_to_crm', label: 'Sync to CRM' },
        ],
        default: 'add_member',
      },
      {
        name: 'op_fields',
        label: 'Operation Fields',
        type: 'dynamic_group',
        watchField: 'operation',
        conditionalFields: {
          add_member: [
            { name: 'name', label: 'Full Name', type: 'text', required: true, placeholder: '{{trigger.data.name}}' },
            { name: 'email', label: 'Email', type: 'text', placeholder: '{{trigger.data.email}}' },
            { name: 'phone', label: 'Phone', type: 'text', placeholder: '+1234567890' },
            { name: 'family_id', label: 'Family ID', type: 'text', placeholder: 'Optional family group ID' },
            {
              name: 'membership_type', label: 'Membership Type', type: 'select', default: 'member',
              options: [
                { value: 'visitor', label: 'Visitor' },
                { value: 'member', label: 'Member' },
                { value: 'leader', label: 'Leader' },
                { value: 'pastor', label: 'Pastor' },
              ],
            },
            { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes...' },
          ],
          update_member: [
            { name: 'memberId', label: 'Member ID', type: 'text', required: true, placeholder: '{{church_0.member._id}}' },
            { name: 'name', label: 'Full Name', type: 'text', placeholder: 'Updated name' },
            { name: 'email', label: 'Email', type: 'text', placeholder: 'Updated email' },
            { name: 'phone', label: 'Phone', type: 'text', placeholder: 'Updated phone' },
            {
              name: 'membership_type', label: 'Membership Type', type: 'select',
              options: [
                { value: 'visitor', label: 'Visitor' },
                { value: 'member', label: 'Member' },
                { value: 'leader', label: 'Leader' },
                { value: 'pastor', label: 'Pastor' },
              ],
            },
            {
              name: 'status', label: 'Status', type: 'select',
              options: [
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
          ],
          get_members: [
            { name: 'search', label: 'Search', type: 'text', placeholder: 'Search by name or email' },
            {
              name: 'membership_type', label: 'Filter by Type', type: 'select', default: 'all',
              options: [
                { value: 'all', label: 'All' },
                { value: 'visitor', label: 'Visitor' },
                { value: 'member', label: 'Member' },
                { value: 'leader', label: 'Leader' },
                { value: 'pastor', label: 'Pastor' },
              ],
            },
            { name: 'limit', label: 'Limit', type: 'number', default: 20, min: 1, max: 100 },
          ],
          record_donation: [
            { name: 'memberId', label: 'Member ID', type: 'text', required: true, placeholder: '{{church_0.member._id}}' },
            { name: 'amount', label: 'Amount ($)', type: 'text', required: true, placeholder: '100.00' },
            {
              name: 'donation_type', label: 'Donation Type', type: 'select', default: 'tithe',
              options: [
                { value: 'tithe', label: 'Tithe' },
                { value: 'offering', label: 'Offering' },
                { value: 'building_fund', label: 'Building Fund' },
                { value: 'missions', label: 'Missions' },
                { value: 'other', label: 'Other' },
              ],
            },
            { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Donation notes...' },
          ],
          create_event: [
            { name: 'title', label: 'Event Title', type: 'text', required: true, placeholder: 'Sunday Service' },
            { name: 'date', label: 'Date', type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
            { name: 'time', label: 'Time', type: 'text', placeholder: 'HH:MM' },
            { name: 'location', label: 'Location', type: 'text', placeholder: 'Main Hall' },
            {
              name: 'event_type', label: 'Event Type', type: 'select', default: 'service',
              options: [
                { value: 'service', label: 'Service' },
                { value: 'small_group', label: 'Small Group' },
                { value: 'outreach', label: 'Outreach' },
                { value: 'conference', label: 'Conference' },
                { value: 'youth', label: 'Youth Event' },
              ],
            },
            { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Event details...' },
          ],
          sync_to_crm: [
            { name: 'memberId', label: 'Member ID', type: 'text', required: true, placeholder: '{{church_0.member._id}}' },
            {
              name: 'crm_status', label: 'CRM Contact Status', type: 'select', default: 'customer',
              options: [
                { value: 'lead', label: 'Lead' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'customer', label: 'Customer' },
              ],
            },
            { name: 'notes', label: 'CRM Notes', type: 'textarea', placeholder: 'Notes to attach to CRM contact...' },
          ],
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // FREELANCER NODE — Freelance business management
  // ---------------------------------------------------------------------------
  freelancer: {
    type: 'freelancer',
    label: 'Freelancer Projects',
    icon: 'Wrench',
    iconComponent: Wrench,
    color: 'from-teal-500 to-cyan-600',
    category: 'plugins',
    description: 'Create projects, log time, generate invoices, or sync clients to your CRM',
    fields: [
      {
        name: 'operation',
        label: 'Operation',
        type: 'select',
        required: true,
        options: [
          { value: 'create_project', label: 'Create Project' },
          { value: 'update_project', label: 'Update Project' },
          { value: 'get_projects', label: 'Get Projects' },
          { value: 'log_time', label: 'Log Time Entry' },
          { value: 'create_invoice', label: 'Create Invoice' },
          { value: 'sync_to_crm', label: 'Sync to CRM' },
        ],
        default: 'create_project',
      },
      {
        name: 'op_fields',
        label: 'Operation Fields',
        type: 'dynamic_group',
        watchField: 'operation',
        conditionalFields: {
          create_project: [
            { name: 'title', label: 'Project Title', type: 'text', required: true, placeholder: 'Website Redesign' },
            { name: 'client_name', label: 'Client Name', type: 'text', required: true, placeholder: '{{trigger.data.client}}' },
            { name: 'client_email', label: 'Client Email', type: 'text', placeholder: '{{trigger.data.email}}' },
            { name: 'budget', label: 'Budget ($)', type: 'text', placeholder: '5000' },
            { name: 'deadline', label: 'Deadline', type: 'text', placeholder: 'YYYY-MM-DD' },
            {
              name: 'status', label: 'Status', type: 'select', default: 'active',
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'completed', label: 'Completed' },
              ],
            },
            { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Project details...' },
          ],
          update_project: [
            { name: 'projectId', label: 'Project ID', type: 'text', required: true, placeholder: '{{freelancer_0.project._id}}' },
            { name: 'title', label: 'Title', type: 'text', placeholder: 'Updated title' },
            { name: 'budget', label: 'Budget ($)', type: 'text', placeholder: 'Updated budget' },
            { name: 'deadline', label: 'Deadline', type: 'text', placeholder: 'YYYY-MM-DD' },
            {
              name: 'status', label: 'Status', type: 'select',
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'completed', label: 'Completed' },
              ],
            },
            { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Update notes...' },
          ],
          get_projects: [
            { name: 'search', label: 'Search', type: 'text', placeholder: 'Search by title or client' },
            {
              name: 'status', label: 'Filter by Status', type: 'select', default: 'all',
              options: [
                { value: 'all', label: 'All' },
                { value: 'draft', label: 'Draft' },
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'completed', label: 'Completed' },
              ],
            },
            { name: 'limit', label: 'Limit', type: 'number', default: 20, min: 1, max: 100 },
          ],
          log_time: [
            { name: 'projectId', label: 'Project ID', type: 'text', required: true, placeholder: '{{freelancer_0.project._id}}' },
            { name: 'hours', label: 'Hours', type: 'number', required: true, min: 0.25, max: 24, default: 1 },
            { name: 'description', label: 'Work Description', type: 'textarea', required: true, placeholder: 'What did you work on?' },
            { name: 'date', label: 'Date', type: 'text', placeholder: 'YYYY-MM-DD (defaults to today)' },
            { name: 'billable', label: 'Billable', type: 'toggle', default: true },
          ],
          create_invoice: [
            { name: 'projectId', label: 'Project ID', type: 'text', required: true, placeholder: '{{freelancer_0.project._id}}' },
            { name: 'amount', label: 'Amount ($)', type: 'text', required: true, placeholder: '1500.00' },
            { name: 'due_date', label: 'Due Date', type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
            { name: 'description', label: 'Invoice Description', type: 'textarea', placeholder: 'Services rendered...' },
            {
              name: 'status', label: 'Status', type: 'select', default: 'draft',
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent' },
                { value: 'paid', label: 'Paid' },
                { value: 'overdue', label: 'Overdue' },
              ],
            },
          ],
          sync_to_crm: [
            { name: 'projectId', label: 'Project ID', type: 'text', required: true, placeholder: '{{freelancer_0.project._id}}' },
            {
              name: 'crm_status', label: 'CRM Contact Status', type: 'select', default: 'customer',
              options: [
                { value: 'lead', label: 'Lead' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'customer', label: 'Customer' },
              ],
            },
            { name: 'create_deal', label: 'Also Create CRM Deal', type: 'toggle', default: true },
            { name: 'notes', label: 'CRM Notes', type: 'textarea', placeholder: 'Notes to attach to CRM contact...' },
          ],
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // COACHES NODE — Coaching and mentoring platform
  // ---------------------------------------------------------------------------
  coaches: {
    type: 'coaches',
    label: 'Coaching Clients',
    icon: 'GraduationCap',
    iconComponent: GraduationCap,
    color: 'from-violet-500 to-purple-600',
    category: 'plugins',
    description: 'Add clients, schedule sessions, log progress, or sync to your CRM',
    fields: [
      {
        name: 'operation',
        label: 'Operation',
        type: 'select',
        required: true,
        options: [
          { value: 'add_client', label: 'Add Client' },
          { value: 'update_client', label: 'Update Client' },
          { value: 'get_clients', label: 'Get Clients' },
          { value: 'create_session', label: 'Create Session' },
          { value: 'log_progress', label: 'Log Progress' },
          { value: 'sync_to_crm', label: 'Sync to CRM' },
        ],
        default: 'add_client',
      },
      {
        name: 'op_fields',
        label: 'Operation Fields',
        type: 'dynamic_group',
        watchField: 'operation',
        conditionalFields: {
          add_client: [
            { name: 'name', label: 'Full Name', type: 'text', required: true, placeholder: '{{trigger.data.name}}' },
            { name: 'email', label: 'Email', type: 'text', required: true, placeholder: '{{trigger.data.email}}' },
            { name: 'phone', label: 'Phone', type: 'text', placeholder: '+1234567890' },
            {
              name: 'program', label: 'Coaching Program', type: 'select', default: 'individual',
              options: [
                { value: 'individual', label: 'Individual Coaching' },
                { value: 'group', label: 'Group Coaching' },
                { value: 'executive', label: 'Executive Coaching' },
                { value: 'career', label: 'Career Coaching' },
                { value: 'life', label: 'Life Coaching' },
              ],
            },
            { name: 'goals', label: 'Goals', type: 'textarea', placeholder: 'Client goals and objectives...' },
            { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes...' },
          ],
          update_client: [
            { name: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: '{{coaches_0.client._id}}' },
            { name: 'name', label: 'Full Name', type: 'text', placeholder: 'Updated name' },
            { name: 'email', label: 'Email', type: 'text', placeholder: 'Updated email' },
            { name: 'phone', label: 'Phone', type: 'text', placeholder: 'Updated phone' },
            {
              name: 'program', label: 'Coaching Program', type: 'select',
              options: [
                { value: 'individual', label: 'Individual Coaching' },
                { value: 'group', label: 'Group Coaching' },
                { value: 'executive', label: 'Executive Coaching' },
                { value: 'career', label: 'Career Coaching' },
                { value: 'life', label: 'Life Coaching' },
              ],
            },
            {
              name: 'status', label: 'Status', type: 'select',
              options: [
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'completed', label: 'Completed' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
          ],
          get_clients: [
            { name: 'search', label: 'Search', type: 'text', placeholder: 'Search by name or email' },
            {
              name: 'program', label: 'Filter by Program', type: 'select', default: 'all',
              options: [
                { value: 'all', label: 'All' },
                { value: 'individual', label: 'Individual Coaching' },
                { value: 'group', label: 'Group Coaching' },
                { value: 'executive', label: 'Executive Coaching' },
                { value: 'career', label: 'Career Coaching' },
                { value: 'life', label: 'Life Coaching' },
              ],
            },
            { name: 'limit', label: 'Limit', type: 'number', default: 20, min: 1, max: 100 },
          ],
          create_session: [
            { name: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: '{{coaches_0.client._id}}' },
            { name: 'date', label: 'Session Date', type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
            { name: 'time', label: 'Session Time', type: 'text', placeholder: 'HH:MM' },
            { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 60, min: 15, max: 240 },
            {
              name: 'session_type', label: 'Session Type', type: 'select', default: 'one_on_one',
              options: [
                { value: 'one_on_one', label: 'One-on-One' },
                { value: 'group', label: 'Group Session' },
                { value: 'assessment', label: 'Assessment' },
                { value: 'follow_up', label: 'Follow-Up' },
              ],
            },
            { name: 'agenda', label: 'Agenda', type: 'textarea', placeholder: 'Session agenda and topics...' },
          ],
          log_progress: [
            { name: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: '{{coaches_0.client._id}}' },
            { name: 'milestone', label: 'Milestone', type: 'text', required: true, placeholder: 'e.g., Completed Module 3' },
            { name: 'rating', label: 'Progress Rating (1-10)', type: 'number', min: 1, max: 10, default: 5 },
            { name: 'notes', label: 'Progress Notes', type: 'textarea', placeholder: 'Detailed progress notes...' },
          ],
          sync_to_crm: [
            { name: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: '{{coaches_0.client._id}}' },
            {
              name: 'crm_status', label: 'CRM Contact Status', type: 'select', default: 'customer',
              options: [
                { value: 'lead', label: 'Lead' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'customer', label: 'Customer' },
              ],
            },
            { name: 'notes', label: 'CRM Notes', type: 'textarea', placeholder: 'Notes to attach to CRM contact...' },
          ],
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // INBOX TRIGGER NODE — Unified Inbox message trigger
  // ---------------------------------------------------------------------------
  inbox_trigger: {
    type: 'inbox_trigger',
    label: 'New Message Arrives',
    icon: 'Inbox',
    iconComponent: Inbox,
    color: 'from-sky-500 to-cyan-600',
    category: 'triggers',
    description: 'Start this automation when a new message arrives — email, WhatsApp, web chat, Telegram, or Instagram',
    fields: [
      {
        name: 'conversationId',
        label: 'Specific conversation (optional)',
        type: 'text',
        placeholder: 'Leave blank to auto-pick latest matching conversation',
      },
      {
        name: 'inboxId',
        label: 'Listen on channel',
        type: 'channel_select',
        placeholder: 'All connected inboxes',
      },
      {
        name: 'filterStatus',
        label: 'Message status',
        type: 'select',
        options: [
          { value: 'open', label: 'Open' },
          { value: 'pending', label: 'Pending' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'snoozed', label: 'Snoozed' },
          { value: 'all', label: 'All Statuses' },
        ],
        default: 'open',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // CHANNEL NODES — Full channel-native outbound messaging
  // Each node exposes the complete feature set of its channel:
  //   WhatsApp  → WA Business API templates, interactive buttons/lists, broadcast
  //   Email     → Single / bulk / BCC, HTML body, CRM list targeting
  //   SMS       → Single / broadcast, sender ID, opt-out handling
  //   Telegram  → Inline keyboards, broadcast, Markdown/HTML
  //   Instagram → DM, quick replies, generic card templates
  // ---------------------------------------------------------------------------

  send_whatsapp: {
    type: 'send_whatsapp',
    label: 'Send WhatsApp',
    icon: 'MessageCircle',
    iconComponent: MessageCircle,
    color: 'from-green-500 to-emerald-600',
    category: 'actions',
    description: 'Full WhatsApp Business API node — send approved template messages, interactive buttons/lists, or broadcast to a CRM segment.',
    fields: [
      // ── Message type ──────────────────────────────────────────────────────
      {
        name: 'message_type',
        label: 'Message Type',
        type: 'select',
        required: true,
        default: 'wa_template',
        options: [
          { value: 'wa_template', label: 'WA Business Template (pre-approved)' },
          { value: 'interactive_buttons', label: 'Interactive — Reply Buttons' },
          { value: 'interactive_list', label: 'Interactive — List Menu' },
          { value: 'broadcast', label: 'Broadcast to CRM Segment' },
          { value: 'plain_text', label: 'Plain Text (within 24h window)' },
        ],
      },

      // ── Audience (single vs broadcast) ────────────────────────────────────
      {
        name: 'audience',
        label: 'Audience',
        type: 'dynamic_group',
        watchField: 'message_type',
        conditionalFields: {
          wa_template: [
            { name: 'to', label: 'Recipient Phone', type: 'text', required: true, placeholder: '{{contact.phone}} or +1234567890' },
          ],
          interactive_buttons: [
            { name: 'to', label: 'Recipient Phone', type: 'text', required: true, placeholder: '{{contact.phone}}' },
          ],
          interactive_list: [
            { name: 'to', label: 'Recipient Phone', type: 'text', required: true, placeholder: '{{contact.phone}}' },
          ],
          plain_text: [
            { name: 'to', label: 'Recipient Phone', type: 'text', required: true, placeholder: '{{contact.phone}}' },
          ],
          broadcast: [
            {
              name: 'audience_source',
              label: 'Audience Source',
              type: 'select',
              required: true,
              default: 'crm_segment',
              options: [
                { value: 'crm_segment', label: 'CRM Segment / Filter' },
                { value: 'crm_all', label: 'All CRM Contacts' },
                { value: 'manual_list', label: 'Manual Phone List' },
              ],
            },
            { name: 'crm_filter', label: 'CRM Filter (JSON)', type: 'textarea', placeholder: '{"tag": "lead", "status": "active"} — leave blank for all' },
            { name: 'manual_phones', label: 'Manual Phones (comma-separated)', type: 'textarea', placeholder: '+1234567890, +0987654321' },
            { name: 'send_delay_ms', label: 'Delay Between Sends (ms)', type: 'number', default: 1000, min: 200, max: 10000 },
            { name: 'skip_opted_out', label: 'Skip Opted-Out Contacts', type: 'toggle', default: true },
          ],
        },
      },

      // ── WA Business API Template ───────────────────────────────────────────
      {
        name: 'wa_biz_config',
        label: 'Template Configuration',
        type: 'dynamic_group',
        watchField: 'message_type',
        conditionalFields: {
          wa_template: [
            { name: 'template_name', label: 'Template Name', type: 'text', required: true, placeholder: 'e.g. order_confirmation (from WA Business Manager)' },
            { name: 'template_language', label: 'Language', type: 'select', required: true, default: 'en',
              options: [
                { value: 'en', label: 'English' },
                { value: 'en_US', label: 'English (US)' },
                { value: 'ar', label: 'Arabic' },
                { value: 'es', label: 'Spanish' },
                { value: 'pt_BR', label: 'Portuguese (Brazil)' },
                { value: 'fr', label: 'French' },
                { value: 'de', label: 'German' },
                { value: 'hi', label: 'Hindi' },
                { value: 'id', label: 'Indonesian' },
                { value: 'tr', label: 'Turkish' },
              ],
            },
            { name: 'header_type', label: 'Header Type', type: 'select', default: 'none',
              options: [
                { value: 'none', label: 'None' },
                { value: 'text', label: 'Text' },
                { value: 'image', label: 'Image URL' },
                { value: 'video', label: 'Video URL' },
                { value: 'document', label: 'Document URL' },
              ],
            },
            { name: 'header_value', label: 'Header Content', type: 'text', placeholder: 'Text or media URL for the header component' },
            { name: 'body_variables', label: 'Body Variables (JSON)', type: 'textarea', placeholder: '{"1": "{{contact.name}}", "2": "{{order_id}}", "3": "{{amount}}"}' },
            { name: 'footer_text', label: 'Footer Text', type: 'text', placeholder: 'Optional footer line' },
          ],
        },
      },

      // ── Interactive Buttons (body + all 3 button configs in one block) ───────
      {
        name: 'interactive_btn_config',
        label: 'Interactive Message',
        type: 'dynamic_group',
        watchField: 'message_type',
        conditionalFields: {
          interactive_buttons: [
            { name: 'header_text', label: 'Header Text (optional)', type: 'text', placeholder: 'Bold header above the message' },
            { name: 'body_text', label: 'Body Message', type: 'textarea', required: true, placeholder: 'Main message body — max 1024 chars' },
            { name: 'footer_text', label: 'Footer Text (optional)', type: 'text', placeholder: 'Italic footer below the message' },
            { name: 'btn_1_label', label: 'Button 1 Label', type: 'text', placeholder: 'e.g. Confirm' },
            { name: 'btn_1_type', label: 'Button 1 Type', type: 'select', default: 'quick_reply',
              options: [{ value: 'quick_reply', label: 'Quick Reply' }, { value: 'url', label: 'Open URL' }, { value: 'phone', label: 'Call Phone' }] },
            { name: 'btn_1_value', label: 'Button 1 URL / Phone', type: 'text', placeholder: 'https://… or +1234567890 (for URL/phone types only)' },
            { name: 'btn_2_label', label: 'Button 2 Label', type: 'text', placeholder: 'e.g. Reschedule' },
            { name: 'btn_2_type', label: 'Button 2 Type', type: 'select', default: 'quick_reply',
              options: [{ value: 'quick_reply', label: 'Quick Reply' }, { value: 'url', label: 'Open URL' }, { value: 'phone', label: 'Call Phone' }] },
            { name: 'btn_2_value', label: 'Button 2 URL / Phone', type: 'text', placeholder: 'URL or phone (leave blank for quick reply)' },
            { name: 'btn_3_label', label: 'Button 3 Label (optional)', type: 'text', placeholder: 'e.g. Learn More' },
            { name: 'btn_3_type', label: 'Button 3 Type', type: 'select', default: 'quick_reply',
              options: [{ value: 'quick_reply', label: 'Quick Reply' }, { value: 'url', label: 'Open URL' }, { value: 'phone', label: 'Call Phone' }] },
            { name: 'btn_3_value', label: 'Button 3 URL / Phone', type: 'text', placeholder: 'URL or phone (leave blank for quick reply)' },
          ],
        },
      },

      // ── Interactive List ───────────────────────────────────────────────────
      {
        name: 'interactive_list_config',
        label: 'List Menu',
        type: 'dynamic_group',
        watchField: 'message_type',
        conditionalFields: {
          interactive_list: [
            { name: 'header_text', label: 'Header Text (optional)', type: 'text', placeholder: 'Bold header' },
            { name: 'body_text', label: 'Body Message', type: 'textarea', required: true, placeholder: 'Describe the list options to the user' },
            { name: 'footer_text', label: 'Footer Text (optional)', type: 'text', placeholder: 'Italic footer' },
            { name: 'list_button_label', label: 'Menu Button Label', type: 'text', required: true, placeholder: 'e.g. Choose an option' },
            {
              name: 'list_sections',
              label: 'List Sections (JSON)',
              type: 'textarea',
              required: true,
              placeholder: '[{"title":"Plans","rows":[{"id":"basic","title":"Basic","description":"$10/mo"},{"id":"pro","title":"Pro","description":"$30/mo"}]}]',
            },
          ],
        },
      },

      // ── Plain text (24h window) ───────────────────────────────────────────
      {
        name: 'plain_text_config',
        label: 'Message',
        type: 'dynamic_group',
        watchField: 'message_type',
        conditionalFields: {
          plain_text: [
            { name: 'body_text', label: 'Message Body', type: 'textarea', required: true, placeholder: 'Free-form message (only valid within the 24h customer service window)' },
          ],
          broadcast: [
            { name: 'body_text', label: 'Broadcast Message', type: 'textarea', required: true, placeholder: 'Message sent to every recipient in the audience. Use {{contact.name}} etc.' },
          ],
        },
      },

      // ── Channel / Advanced ────────────────────────────────────────────────
      {
        name: 'advanced',
        label: 'Advanced',
        type: 'section',
        fields: [
          { name: 'channel_id', label: 'Send from channel', type: 'channel_select', channelFilter: ['whatsapp'] },
          { name: 'link_to_crm', label: 'Link Conversation to CRM Contact', type: 'toggle', default: true },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  send_email: {
    type: 'send_email',
    label: 'Send Email',
    icon: 'Mail',
    iconComponent: Mail,
    color: 'from-blue-500 to-indigo-600',
    category: 'actions',
    description: 'Full email marketing node — single send, bulk BCC blast, or individual broadcast to a CRM list. Supports plain text and raw HTML bodies.',
    fields: [
      // ── Send mode ──────────────────────────────────────────────────────────
      {
        name: 'send_mode',
        label: 'Send Mode',
        type: 'select',
        required: true,
        default: 'single',
        options: [
          { value: 'single', label: 'Single Email' },
          { value: 'broadcast_individual', label: 'Broadcast — Individual (one per contact)' },
          { value: 'broadcast_bcc', label: 'Broadcast — BCC Blast (one email, all BCC)' },
        ],
      },

      // ── Target (changes per send mode) ────────────────────────────────────
      {
        name: 'target_config',
        label: 'Recipients',
        type: 'dynamic_group',
        watchField: 'send_mode',
        conditionalFields: {
          single: [
            { name: 'to', label: 'To', type: 'text', required: true, placeholder: '{{contact.email}} or user@example.com' },
            { name: 'cc', label: 'CC (comma-separated)', type: 'text', placeholder: 'cc@example.com, cc2@example.com' },
            { name: 'bcc', label: 'BCC (comma-separated)', type: 'text', placeholder: 'bcc@example.com' },
          ],
          broadcast_individual: [
            { name: 'audience_source', label: 'Audience Source', type: 'select', required: true, default: 'crm_segment',
              options: [
                { value: 'crm_segment', label: 'CRM Segment / Filter' },
                { value: 'crm_all', label: 'All CRM Contacts' },
                { value: 'manual_list', label: 'Manual Email List' },
              ],
            },
            { name: 'crm_filter', label: 'CRM Filter (JSON)', type: 'textarea', placeholder: '{"tag": "newsletter", "status": "active"}' },
            { name: 'manual_emails', label: 'Manual Email List (comma-separated)', type: 'textarea', placeholder: 'a@ex.com, b@ex.com' },
            { name: 'send_delay_ms', label: 'Delay Between Sends (ms)', type: 'number', default: 500, min: 100, max: 10000 },
          ],
          broadcast_bcc: [
            { name: 'audience_source', label: 'Audience Source', type: 'select', required: true, default: 'crm_segment',
              options: [
                { value: 'crm_segment', label: 'CRM Segment / Filter' },
                { value: 'crm_all', label: 'All CRM Contacts' },
                { value: 'manual_list', label: 'Manual Email List' },
              ],
            },
            { name: 'crm_filter', label: 'CRM Filter (JSON)', type: 'textarea', placeholder: '{"tag": "newsletter"}' },
            { name: 'manual_emails', label: 'Manual BCC List (comma-separated)', type: 'textarea', placeholder: 'a@ex.com, b@ex.com' },
            { name: 'bcc_batch_size', label: 'BCC Batch Size', type: 'number', default: 50, min: 1, max: 500 },
          ],
        },
      },

      // ── From / Reply-To ────────────────────────────────────────────────────
      {
        name: 'from_config',
        label: 'Sender',
        type: 'section',
        fields: [
          { name: 'from_name', label: 'From Name', type: 'text', placeholder: '{{company_name}} or your name' },
          { name: 'from_email', label: 'From Email', type: 'text', placeholder: 'noreply@yourdomain.com (uses connected channel default if blank)' },
          { name: 'reply_to', label: 'Reply-To', type: 'text', placeholder: 'support@yourdomain.com' },
        ],
      },

      // ── Subject ────────────────────────────────────────────────────────────
      {
        name: 'email_subject',
        label: 'Subject Line',
        type: 'text',
        required: true,
        placeholder: 'Hey {{contact.name}}, here\'s your update',
      },

      // ── Body format + content ──────────────────────────────────────────────
      {
        name: 'body_format',
        label: 'Body Format',
        type: 'select',
        required: true,
        default: 'plain_text',
        options: [
          { value: 'plain_text', label: 'Plain Text' },
          { value: 'html', label: 'HTML' },
        ],
      },
      {
        name: 'body_content',
        label: 'Email Body',
        type: 'dynamic_group',
        watchField: 'body_format',
        conditionalFields: {
          plain_text: [
            { name: 'email_body', label: 'Body (plain text)', type: 'textarea', required: true, placeholder: 'Hi {{contact.name}},\n\nYour message here…' },
          ],
          html: [
            { name: 'email_body', label: 'Body (HTML)', type: 'textarea', required: true, placeholder: '<h1>Hello {{contact.name}}</h1>\n<p>Your content here…</p>\n<a href="{{cta_link}}">Click here</a>' },
          ],
        },
      },

      // ── Tracking & compliance ──────────────────────────────────────────────
      {
        name: 'tracking',
        label: 'Tracking & Compliance',
        type: 'section',
        fields: [
          { name: 'track_opens', label: 'Track Opens', type: 'toggle', default: true },
          { name: 'track_clicks', label: 'Track Clicks', type: 'toggle', default: true },
          { name: 'include_unsubscribe', label: 'Include Unsubscribe Link', type: 'toggle', default: true },
          { name: 'skip_unsubscribed', label: 'Skip Unsubscribed Contacts', type: 'toggle', default: true },
        ],
      },

      // ── Channel ────────────────────────────────────────────────────────────
      {
        name: 'channel_id',
        label: 'Send from email account',
        type: 'channel_select',
        channelFilter: ['email'],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  send_sms: {
    type: 'send_sms',
    label: 'Send SMS',
    icon: 'SmartphoneNfc',
    iconComponent: SmartphoneNfc,
    color: 'from-amber-500 to-orange-600',
    category: 'actions',
    description: 'Send SMS — single message or broadcast to a CRM segment. Supports custom sender IDs and opt-out handling.',
    fields: [
      // ── Send mode ──────────────────────────────────────────────────────────
      {
        name: 'send_mode',
        label: 'Send Mode',
        type: 'select',
        required: true,
        default: 'single',
        options: [
          { value: 'single', label: 'Single SMS' },
          { value: 'broadcast', label: 'Broadcast to CRM Segment' },
        ],
      },

      // ── Target ────────────────────────────────────────────────────────────
      {
        name: 'sms_target',
        label: 'Recipients',
        type: 'dynamic_group',
        watchField: 'send_mode',
        conditionalFields: {
          single: [
            { name: 'to', label: 'Recipient Phone', type: 'text', required: true, placeholder: '{{contact.phone}} or +1234567890' },
          ],
          broadcast: [
            { name: 'audience_source', label: 'Audience Source', type: 'select', required: true, default: 'crm_segment',
              options: [
                { value: 'crm_segment', label: 'CRM Segment / Filter' },
                { value: 'crm_all', label: 'All CRM Contacts with Phone' },
                { value: 'manual_list', label: 'Manual Phone List' },
              ],
            },
            { name: 'crm_filter', label: 'CRM Filter (JSON)', type: 'textarea', placeholder: '{"tag": "promo_subscriber"}' },
            { name: 'manual_phones', label: 'Manual Phones (comma-separated)', type: 'textarea', placeholder: '+1234567890, +0987654321' },
            { name: 'send_delay_ms', label: 'Delay Between Sends (ms)', type: 'number', default: 500, min: 100, max: 5000 },
            { name: 'skip_opted_out', label: 'Skip Opted-Out Contacts', type: 'toggle', default: true },
          ],
        },
      },

      // ── Message ────────────────────────────────────────────────────────────
      {
        name: 'sms_message',
        label: 'Message (160 chars = 1 SMS segment)',
        type: 'textarea',
        required: true,
        placeholder: 'Hi {{contact.name}}, your message here… Keep under 160 chars to avoid multi-part billing.',
      },

      // ── Sender & advanced ─────────────────────────────────────────────────
      {
        name: 'sms_advanced',
        label: 'Advanced',
        type: 'section',
        fields: [
          { name: 'sender_id', label: 'Sender ID / From', type: 'text', placeholder: 'Custom alphanumeric sender ID or leave blank for default' },
          { name: 'channel_id', label: 'Send from SMS channel', type: 'channel_select', channelFilter: ['sms'] },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  send_telegram: {
    type: 'send_telegram',
    label: 'Send Telegram',
    icon: 'Send',
    iconComponent: Send,
    color: 'from-sky-500 to-blue-600',
    category: 'actions',
    description: 'Send Telegram messages — plain text, Markdown/HTML, inline keyboard buttons, or broadcast to a CRM segment.',
    fields: [
      // ── Send mode ──────────────────────────────────────────────────────────
      {
        name: 'send_mode',
        label: 'Send Mode',
        type: 'select',
        required: true,
        default: 'single',
        options: [
          { value: 'single', label: 'Single Message' },
          { value: 'broadcast', label: 'Broadcast to CRM Segment' },
        ],
      },

      // ── Target ────────────────────────────────────────────────────────────
      {
        name: 'tg_target',
        label: 'Recipient',
        type: 'dynamic_group',
        watchField: 'send_mode',
        conditionalFields: {
          single: [
            { name: 'chat_id', label: 'Chat ID / Username', type: 'text', required: true, placeholder: '{{contact.telegram_id}} or @username' },
          ],
          broadcast: [
            { name: 'audience_source', label: 'Audience Source', type: 'select', required: true, default: 'crm_segment',
              options: [
                { value: 'crm_segment', label: 'CRM Segment / Filter' },
                { value: 'crm_all', label: 'All CRM Contacts with Telegram' },
                { value: 'manual_list', label: 'Manual Chat ID List' },
              ],
            },
            { name: 'crm_filter', label: 'CRM Filter (JSON)', type: 'textarea', placeholder: '{"tag": "telegram_subscriber"}' },
            { name: 'manual_chat_ids', label: 'Manual Chat IDs (comma-separated)', type: 'textarea', placeholder: '123456789, 987654321' },
            { name: 'send_delay_ms', label: 'Delay Between Sends (ms)', type: 'number', default: 500, min: 200, max: 5000 },
          ],
        },
      },

      // ── Format & body ─────────────────────────────────────────────────────
      {
        name: 'parse_mode',
        label: 'Text Format',
        type: 'select',
        default: 'Markdown',
        options: [
          { value: 'Markdown', label: 'Markdown (*bold*, _italic_, `code`)' },
          { value: 'HTML', label: 'HTML (<b>, <i>, <a>)' },
          { value: 'plain', label: 'Plain Text' },
        ],
      },
      {
        name: 'tg_message',
        label: 'Message Body',
        type: 'textarea',
        required: true,
        placeholder: 'Hi {{contact.name}}, your message here…\n\nUse *bold*, _italic_, [link text](https://…) with Markdown.',
      },

      // ── Inline keyboard buttons ────────────────────────────────────────────
      {
        name: 'inline_keyboard',
        label: 'Inline Keyboard Buttons',
        type: 'section',
        fields: [
          { name: 'btn_1_label', label: 'Button 1 Label', type: 'text', placeholder: 'e.g. View Order' },
          { name: 'btn_1_url', label: 'Button 1 URL', type: 'text', placeholder: 'https://… (leave blank for callback-only)' },
          { name: 'btn_1_callback', label: 'Button 1 Callback Data', type: 'text', placeholder: 'btn_view_order' },
          { name: 'btn_2_label', label: 'Button 2 Label', type: 'text', placeholder: 'e.g. Contact Support' },
          { name: 'btn_2_url', label: 'Button 2 URL', type: 'text', placeholder: 'https://…' },
          { name: 'btn_2_callback', label: 'Button 2 Callback Data', type: 'text', placeholder: 'btn_support' },
          { name: 'disable_web_preview', label: 'Disable Link Preview', type: 'toggle', default: false },
          { name: 'silent', label: 'Send Silently (no notification sound)', type: 'toggle', default: false },
        ],
      },

      // ── Channel ───────────────────────────────────────────────────────────
      {
        name: 'channel_id',
        label: 'Send from Telegram bot',
        type: 'channel_select',
        channelFilter: ['telegram'],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  send_instagram: {
    type: 'send_instagram',
    label: 'Send Instagram DM',
    icon: 'MessageSquare',
    iconComponent: MessageSquare,
    color: 'from-pink-500 to-rose-600',
    category: 'actions',
    description: 'Send Instagram Direct Messages — plain text, quick-reply buttons, or generic card templates. Requires Instagram Messaging API access.',
    fields: [
      // ── Message type ──────────────────────────────────────────────────────
      {
        name: 'message_type',
        label: 'Message Type',
        type: 'select',
        required: true,
        default: 'text',
        options: [
          { value: 'text', label: 'Text Message' },
          { value: 'quick_replies', label: 'Quick Replies' },
          { value: 'generic_card', label: 'Generic Card (title + image + CTA)' },
          { value: 'ice_breakers', label: 'Ice Breakers (FAQ buttons)' },
        ],
      },

      // ── Recipient ─────────────────────────────────────────────────────────
      { name: 'recipient_id', label: 'Recipient IGSID', type: 'text', required: true, placeholder: '{{contact.instagram_id}} — Instagram-scoped user ID' },

      // ── Message body + type-specific buttons (all in one conditional block) ─
      {
        name: 'ig_text_config',
        label: 'Message',
        type: 'dynamic_group',
        watchField: 'message_type',
        conditionalFields: {
          text: [
            { name: 'ig_message', label: 'Message Text', type: 'textarea', required: true, placeholder: 'Hi {{contact.name}}, thanks for your interest! How can we help?' },
          ],
          quick_replies: [
            { name: 'ig_message', label: 'Message Text', type: 'textarea', required: true, placeholder: 'What can we help you with today?' },
            { name: 'qr_1_title', label: 'Button 1 Label', type: 'text', placeholder: 'e.g. Track my order' },
            { name: 'qr_1_payload', label: 'Button 1 Payload', type: 'text', placeholder: 'TRACK_ORDER' },
            { name: 'qr_2_title', label: 'Button 2 Label', type: 'text', placeholder: 'e.g. Talk to support' },
            { name: 'qr_2_payload', label: 'Button 2 Payload', type: 'text', placeholder: 'SUPPORT' },
            { name: 'qr_3_title', label: 'Button 3 Label (optional)', type: 'text', placeholder: 'e.g. See our products' },
            { name: 'qr_3_payload', label: 'Button 3 Payload', type: 'text', placeholder: 'PRODUCTS' },
          ],
          generic_card: [
            { name: 'card_title', label: 'Card Title', type: 'text', required: true, placeholder: '{{product_name}}' },
            { name: 'card_subtitle', label: 'Card Subtitle', type: 'text', placeholder: '{{product_description}}' },
            { name: 'card_image_url', label: 'Card Image URL', type: 'text', placeholder: 'https://… (1:1 or 1.91:1 ratio)' },
            { name: 'card_btn_1_title', label: 'CTA Button 1', type: 'text', placeholder: 'e.g. Shop Now' },
            { name: 'card_btn_1_type', label: 'Button 1 Type', type: 'select', default: 'web_url',
              options: [{ value: 'web_url', label: 'Open URL' }, { value: 'postback', label: 'Postback' }] },
            { name: 'card_btn_1_value', label: 'Button 1 URL / Payload', type: 'text', placeholder: 'https://… or POSTBACK_PAYLOAD' },
            { name: 'card_btn_2_title', label: 'CTA Button 2 (optional)', type: 'text', placeholder: 'e.g. Learn More' },
            { name: 'card_btn_2_type', label: 'Button 2 Type', type: 'select', default: 'web_url',
              options: [{ value: 'web_url', label: 'Open URL' }, { value: 'postback', label: 'Postback' }] },
            { name: 'card_btn_2_value', label: 'Button 2 URL / Payload', type: 'text', placeholder: 'https://…' },
          ],
          ice_breakers: [
            { name: 'ig_message', label: 'Greeting Message', type: 'textarea', required: true, placeholder: 'Welcome! Here are some common questions:' },
            { name: 'qr_1_title', label: 'FAQ Button 1', type: 'text', placeholder: 'What are your hours?' },
            { name: 'qr_2_title', label: 'FAQ Button 2', type: 'text', placeholder: 'How do I track my order?' },
            { name: 'qr_3_title', label: 'FAQ Button 3 (optional)', type: 'text', placeholder: 'Do you offer returns?' },
          ],
        },
      },

      // ── Channel ───────────────────────────────────────────────────────────
      {
        name: 'channel_id',
        label: 'Send from Instagram account',
        type: 'channel_select',
        channelFilter: ['instagram'],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // SEND REPLY NODE — Replies to a conversation via unified inbox
  // ---------------------------------------------------------------------------
  send_reply: {
    type: 'send_reply',
    label: 'Send Reply',
    icon: 'Reply',
    iconComponent: Reply,
    color: 'from-teal-500 to-emerald-600',
    category: 'actions',
    description: 'Sends a reply to a conversation in the unified inbox. Can use an AI-generated draft from an upstream AI node, or a static message template.',
    fields: [
      {
        name: 'conversationId',
        label: 'Conversation ID',
        type: 'text',
        placeholder: '{{inbox_trigger_0.conversationId}} — auto-filled from Inbox Trigger',
      },
      {
        name: 'useAiReply',
        label: 'Use AI-generated reply',
        type: 'toggle',
        default: true,
      },
      {
        name: 'messageContent',
        label: 'Static Message (if not using AI reply)',
        type: 'textarea',
        placeholder: 'Hello {{contact.name}}, thanks for reaching out…',
      },
      {
        name: 'updateStatusAfterSend',
        label: 'Update Conversation Status After Send',
        type: 'select',
        options: [
          { value: 'none', label: 'Keep unchanged' },
          { value: 'resolved', label: 'Mark as Resolved' },
          { value: 'pending', label: 'Mark as Pending' },
          { value: 'snoozed', label: 'Snooze' },
          { value: 'open', label: 'Keep Open' },
        ],
        default: 'none',
      },
    ],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all node schemas as an array (useful for mapping in UI)
 */
export const getNodeSchemasList = (): NodeSchema[] => {
  return Object.values(NODE_SCHEMAS);
};

/**
 * Get node schemas grouped by category
 */
export const getNodeSchemasByCategory = (): Record<string, NodeSchema[]> => {
  const grouped: Record<string, NodeSchema[]> = {
    triggers: [],
    actions: [],
    logic: [],
    ai: [],
    data: [],
    plugins: [],
  };

  Object.values(NODE_SCHEMAS).forEach((schema) => {
    if (grouped[schema.category]) {
      grouped[schema.category].push(schema);
    }
  });

  return grouped;
};

/**
 * Get a specific node schema by type
 */
export const getNodeSchema = (type: string): NodeSchema | undefined => {
  return NODE_SCHEMAS[type];
};

/**
 * Check if a node type exists
 */
export const isValidNodeType = (type: string): boolean => {
  return type in NODE_SCHEMAS;
};

// ============================================================================
// AI-AUTHORED / CUSTOM NODES (dynamic, per-tenant)
// See Exchanged_docs/AI_Custom_Nodes_Design.md
// ============================================================================

/** Minimal shape of a live custom node def returned by /api/custom-nodes. */
export interface LiveCustomNodeDef {
  nodeId: string;
  label: string;
  description?: string;
  kind: 'custom' | 'override';
  schema: SchemaField[];
}

const CUSTOM_NODE_TYPES = new Set<string>();

// Tiny external store so the palette re-renders when custom nodes load.
let schemaVersion = 0;
const schemaListeners = new Set<() => void>();
export const subscribeSchemas = (cb: () => void): (() => void) => {
  schemaListeners.add(cb);
  return () => schemaListeners.delete(cb);
};
export const getSchemaVersion = (): number => schemaVersion;

/** Whether a node type is an AI-authored custom node (for badges/affordances). */
export const isCustomNodeType = (type: string): boolean => CUSTOM_NODE_TYPES.has(type);

/**
 * Merge live custom-node defs into the shared NODE_SCHEMAS map. Because every
 * consumer (palette list, by-category, NODE_SCHEMAS[type] lookups, PropertyPanel)
 * reads from this map, registering here surfaces custom nodes everywhere with no
 * call-site changes. Idempotent; bumps the version so subscribers re-render.
 */
export const registerCustomNodeSchemas = (defs: LiveCustomNodeDef[]): void => {
  for (const d of defs) {
    // Custom nodes execute via the backend 'custom' executor; the canvas node
    // carries its own type and a customNodeId in config.
    NODE_SCHEMAS[d.nodeId] = {
      type: d.nodeId,
      label: d.label,
      icon: 'sparkles',
      iconComponent: Sparkles,
      color: 'from-fuchsia-500 to-purple-600',
      category: 'ai',
      description: d.description || 'AI-authored custom node',
      fields: Array.isArray(d.schema) ? d.schema : [],
      status: 'live',
      aliases: ['custom', 'ai node', d.label.toLowerCase()],
    };
    CUSTOM_NODE_TYPES.add(d.nodeId);
  }
  schemaVersion += 1;
  schemaListeners.forEach((cb) => cb());
};

// Category labels for display
export const CATEGORY_LABELS: Record<string, string> = {
  triggers: '⚡ Start Here',
  actions: '📤 Send & Do',
  logic: '🔀 Logic & Control',
  ai: '🤖 AI Tools',
  data: '🗄 Data & Databases',
  plugins: '🔌 Apps & Plugins',
};

// ============================================================================
// NODE ALIASES — Plain-language search terms for non-technical users
// Each array is a list of natural phrases someone might type to find this node.
// These are merged into NODE_SCHEMAS at module load.
// ============================================================================

const NODE_ALIASES: Record<string, string[]> = {
  // ── Triggers
  trigger: [
    'start flow', 'start here', 'entry point', 'webhook', 'schedule',
    'new lead', 'form submitted', 'form filled', 'run at time', 'cron',
    'on event', 'when something happens',
  ],
  inbox_trigger: [
    'new message', 'incoming message', 'customer writes in', 'chat received',
    'whatsapp received', 'inbox message', 'inbound message', 'message arrives',
    'customer contacts', 'support ticket',
  ],

  // ── Actions (generic)
  action: [
    'generic action', 'http request', 'api call', 'api request',
    'webhook call', 'update crm', 'send notification', 'log message',
    'transform data', 'rest api',
  ],
  send_reply: [
    'reply to customer', 'reply in inbox', 'respond to message', 'answer customer',
    'ai reply', 'chatwoot reply', 'inbox reply', 'auto respond',
  ],

  // ── Messaging channels
  send_whatsapp: [
    'whatsapp message', 'wa message', 'message lead', 'notify customer',
    'whatsapp follow up', 'welcome message', 'whatsapp template',
    'send wa', 'message on whatsapp', 'whatsapp notification',
  ],
  send_email: [
    'email lead', 'send email', 'email customer', 'mail customer',
    'email follow up', 'email notification', 'gmail', 'email campaign',
    'drip email', 'newsletter', 'outreach email',
  ],
  send_sms: [
    'text message', 'sms', 'text lead', 'sms follow up',
    'phone text', 'text reminder', 'sms notification', 'mobile message',
  ],
  send_telegram: [
    'telegram message', 'telegram bot', 'send telegram',
    'telegram notification', 'telegram channel',
  ],
  send_instagram: [
    'instagram dm', 'ig message', 'instagram direct', 'instagram reply',
    'ig dm', 'reply on instagram', 'instagram follow up',
  ],

  // ── Voice / Calls
  vapi: [
    'voice call', 'ai phone call', 'call lead', 'automated call',
    'phone agent', 'vapi call', 'phone follow up', 'ai voice',
    'outbound call', 'cold call', 'voice ai',
  ],
  webrtc: [
    'browser call', 'web call', 'live call', 'voice chat',
    'in-app call', 'webrtc call', 'video call', 'real-time call',
  ],
  voice_agent: [
    'ai call', 'voice ai', 'phone bot', 'ai phone agent',
    'automated voice call', 'voice assistant', 'phone assistant',
  ],
  hr_voice_agent: [
    'hr phone call', 'recruitment call', 'interview bot', 'hr call',
    'hiring call', 'onboarding call', 'hr automation',
  ],
  freelancer_voice_agent: [
    'freelancer call', 'contractor agent', 'project call',
    'client call', 'freelancer automation',
  ],
  church_voice_agent: [
    'church call', 'congregation agent', 'ministry call',
    'church member call', 'pastoral call',
  ],

  // ── Logic & Flow
  wait: [
    'pause', 'delay', 'sleep', 'wait for reply', 'hold',
    'timer', 'schedule delay', 'wait a moment', 'wait for response',
    'pause before next step',
  ],
  decision: [
    'if else', 'if condition', 'check if', 'condition', 'branch',
    'split logic', 'true false', 'yes no', 'filter leads',
    'check replied', 'check status', 'conditional',
  ],
  approval: [
    'human review', 'manual approval', 'needs approval', 'gate',
    'human in the loop', 'manager approve', 'review step',
    'pause for review', 'sign off',
  ],
  iterator: [
    'loop', 'for each', 'repeat', 'iterate', 'bulk send',
    'batch', 'run for every', 'loop through list',
  ],
  split: [
    'parallel', 'fork', 'split path', 'run at same time',
    'run both', 'parallel branches',
  ],
  join: [
    'merge paths', 'synchronize', 'wait for all', 'combine',
    'join paths', 'sync branches', 'rejoin',
  ],
  end: [
    'stop', 'finish', 'terminate', 'end flow', 'complete',
    'workflow done', 'end automation',
  ],

  // ── AI & Intelligence
  ai_decision: [
    'classify', 'ai route', 'sentiment', 'smart branch', 'ai check',
    'ai condition', 'ai classify', 'ai if else', 'analyze intent',
    'smart routing', 'detect intent',
  ],
  ai_action: [
    'ai task', 'ai instruction', 'natural language action', 'smart action',
    'ai do something', 'ai perform', 'ai automate', 'ai execute',
  ],
  ai_router: [
    'smart routing', 'multi-path ai', 'ai categorize', 'ai classify route',
    'route by ai', 'ai sort', 'ai decision tree',
  ],
  morgan_leads: [
    'lead scoring', 'morgan', 'qualify lead', 'ai lead agent',
    'score lead', 'lead qualification', 'lead quality',
  ],
  flyn_feedback: [
    'feedback', 'survey response', 'collect review', 'get feedback',
    'customer survey', 'nps', 'review handler',
  ],

  // ── Data & Integration
  query_records: [
    'fetch leads', 'get contacts', 'lookup data', 'find records',
    'database query', 'list customers', 'search contacts',
    'get deals', 'fetch data', 'query database',
  ],
  mongodb: [
    'mongo', 'mongodb', 'document database', 'nosql query',
    'mongo query', 'find documents',
  ],
  postgresql: [
    'postgres', 'postgresql', 'sql query', 'relational database',
    'pg query', 'postgres query',
  ],
  mysql: [
    'mysql', 'sql', 'sql database', 'relational db',
    'mysql query',
  ],
  merge: [
    'join data', 'combine data', 'merge objects', 'aggregate results',
    'merge outputs', 'combine node results', 'join inputs',
  ],

  // ── Plugins
  accounting: [
    'invoice', 'billing', 'bill client', 'record expense', 'money',
    'payment', 'financial stats', 'revenue', 'bookkeeping',
    'charge customer', 'create bill',
  ],
  crm: [
    'update lead', 'set stage', 'add tag', 'crm update',
    'manage contact', 'deal pipeline', 'update contact',
    'add note', 'change status', 'update deal',
  ],
  hr: [
    'hr system', 'employee', 'onboarding', 'payroll', 'staff management',
    'hr module', 'team management', 'personnel',
  ],
  church: [
    'congregation', 'ministry', 'church management', 'member',
    'giving', 'church member', 'church plugin',
  ],
  freelancer: [
    'freelancer', 'contractor', 'project management', 'invoice',
    'client management', 'gig', 'freelance plugin',
  ],
  coaches: [
    'coaching', 'session booking', 'client management', 'coach',
    'training', 'coaching plugin', 'book session', 'coaching client',
  ],
};

// Merge aliases into schemas at module load
Object.entries(NODE_ALIASES).forEach(([type, aliases]) => {
  if (NODE_SCHEMAS[type]) {
    NODE_SCHEMAS[type].aliases = aliases;
  }
});

/**
 * Build a compact node registry for the AI workflow assistant.
 * Sent with every chat request so the AI always knows all available nodes.
 */
export interface CompactNodeField {
  name: string;
  type: string;
  required?: boolean;
  options?: string[];
  conditionalKeys?: Record<string, string[]>;
}

export interface CompactNodeDef {
  label: string;
  description: string;
  category: string;
  fields: CompactNodeField[];
  /** Implementation status — AI uses this to know what's actually safe to suggest */
  status?: NodeStatus;
  statusNote?: string;
}

export function buildNodeRegistry(): Record<string, CompactNodeDef> {
  const registry: Record<string, CompactNodeDef> = {};

  for (const [key, schema] of Object.entries(NODE_SCHEMAS)) {
    const fields: CompactNodeField[] = (schema.fields || []).map((f) => {
      const compact: CompactNodeField = { name: f.name, type: f.type };
      if (f.required) compact.required = true;
      if (f.options && f.options.length > 0) {
        compact.options = f.options.map((o) => o.value);
      }
      if (f.conditionalFields) {
        compact.conditionalKeys = {};
        for (const [k, subFields] of Object.entries(f.conditionalFields)) {
          compact.conditionalKeys[k] = subFields.map((sf) => sf.name);
        }
      }
      return compact;
    });

    registry[key] = {
      label: schema.label,
      description: schema.description,
      category: schema.category,
      fields,
      ...(schema.status && schema.status !== 'live' ? { status: schema.status } : {}),
      ...(schema.statusNote ? { statusNote: schema.statusNote } : {}),
    };
  }

  return registry;
}

export default NODE_SCHEMAS;
