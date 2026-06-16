/**
 * Variable Suggestions Utility
 * ----------------------------
 * Generates dynamic variable suggestions based on upstream nodes in the flow.
 * Supports template syntax like {{node_type.field}}
 *
 * When real test-run data is available, suggestions are built from actual
 * execution output keys instead of static guesses.
 */

import { FlowNode } from '@/hooks/useFlowStore';
import { Edge } from '@xyflow/react';
import { NodeOutputMap, extractOutputPaths } from '@/hooks/useTestRunStore';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface VariableSuggestion {
  value: string;
  label: string;
  description: string;
  category: string;
  nodeId: string;
  nodeLabel: string;
}

export interface NodeOutputField {
  field: string;
  label: string;
  description: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

// ============================================================================
// NODE OUTPUT DEFINITIONS
// ============================================================================

export const NODE_OUTPUTS: Record<string, NodeOutputField[]> = {
  trigger: [
    { field: 'data', label: 'Trigger Payload', description: 'Full data from the trigger event', type: 'object' },
    { field: 'timestamp', label: 'Timestamp', description: 'When the trigger fired', type: 'string' },
    { field: 'source', label: 'Source', description: 'Where this trigger came from', type: 'string' },
  ],
  inbox_trigger: [
    { field: 'conversationId', label: 'Conversation ID', description: 'Inbox conversation ID', type: 'string' },
    { field: 'contactId', label: 'Contact ID', description: 'ID of the contact who sent the message', type: 'string' },
    { field: 'message', label: 'Message Text', description: 'The message content', type: 'string' },
    { field: 'channel', label: 'Channel', description: 'Channel type (whatsapp, email, etc.)', type: 'string' },
    { field: 'senderName', label: 'Sender Name', description: 'Name of the person who sent the message', type: 'string' },
    { field: 'senderPhone', label: 'Sender Phone', description: 'Phone number of the sender', type: 'string' },
    { field: 'senderEmail', label: 'Sender Email', description: 'Email of the sender', type: 'string' },
  ],
  query_records: [
    { field: 'data', label: 'Records Array', description: 'Array of all fetched records', type: 'array' },
    { field: 'count', label: 'Record Count', description: 'Number of records returned', type: 'number' },
    { field: 'first', label: 'First Record', description: 'First record in results', type: 'object' },
    { field: 'first.id', label: 'First → ID', description: 'ID of the first record', type: 'string' },
    { field: 'first.name', label: 'First → Name', description: 'Name field of the first record', type: 'string' },
    { field: 'first.email', label: 'First → Email', description: 'Email of the first record', type: 'string' },
    { field: 'first.phone', label: 'First → Phone', description: 'Phone of the first record', type: 'string' },
    { field: 'first.status', label: 'First → Status', description: 'Status field of the first record', type: 'string' },
  ],
  iterator: [
    { field: 'item', label: 'Current Item', description: 'Current item in the loop', type: 'object' },
    { field: 'item.id', label: 'Item → ID', description: 'ID of current item', type: 'string' },
    { field: 'item.name', label: 'Item → Name', description: 'Name of current item', type: 'string' },
    { field: 'item.email', label: 'Item → Email', description: 'Email of current item', type: 'string' },
    { field: 'item.phone', label: 'Item → Phone', description: 'Phone of current item', type: 'string' },
    { field: 'item.status', label: 'Item → Status', description: 'Status of current item', type: 'string' },
    { field: 'index', label: 'Loop Index', description: 'Current iteration (0-based)', type: 'number' },
    { field: 'total', label: 'Total Items', description: 'Total number of items', type: 'number' },
    { field: 'isFirst', label: 'Is First?', description: 'True on the first iteration', type: 'boolean' },
    { field: 'isLast', label: 'Is Last?', description: 'True on the last iteration', type: 'boolean' },
  ],
  action: [
    { field: 'response', label: 'Response', description: 'Full response from the action', type: 'object' },
    { field: 'success', label: 'Success?', description: 'Whether the action succeeded', type: 'boolean' },
    { field: 'error', label: 'Error', description: 'Error message if failed', type: 'string' },
  ],
  send_whatsapp: [
    { field: 'messageId', label: 'Message ID', description: 'WhatsApp message ID', type: 'string' },
    { field: 'status', label: 'Status', description: 'Delivery status', type: 'string' },
    { field: 'timestamp', label: 'Sent At', description: 'When the message was sent', type: 'string' },
  ],
  send_email: [
    { field: 'messageId', label: 'Message ID', description: 'Email message ID', type: 'string' },
    { field: 'status', label: 'Status', description: 'Delivery status', type: 'string' },
    { field: 'accepted', label: 'Accepted Count', description: 'Number of recipients accepted', type: 'number' },
  ],
  send_sms: [
    { field: 'messageId', label: 'Message ID', description: 'SMS message ID', type: 'string' },
    { field: 'status', label: 'Status', description: 'Delivery status', type: 'string' },
  ],
  send_telegram: [
    { field: 'messageId', label: 'Message ID', description: 'Telegram message ID', type: 'number' },
    { field: 'status', label: 'Status', description: 'Delivery status', type: 'string' },
  ],
  send_instagram: [
    { field: 'messageId', label: 'Message ID', description: 'Instagram DM ID', type: 'string' },
    { field: 'status', label: 'Status', description: 'Delivery status', type: 'string' },
  ],
  send_reply: [
    { field: 'conversationId', label: 'Conversation ID', description: 'ID of the conversation replied to', type: 'string' },
    { field: 'messageId', label: 'Message ID', description: 'ID of the sent reply', type: 'string' },
    { field: 'status', label: 'Status', description: 'Reply delivery status', type: 'string' },
  ],
  ai_action: [
    { field: 'result', label: 'AI Result', description: 'Output from the AI action', type: 'string' },
    { field: 'draft', label: 'Draft Content', description: 'AI-generated draft text', type: 'string' },
    { field: 'confidence', label: 'Confidence', description: 'AI confidence score (0–100)', type: 'number' },
    { field: 'reasoning', label: 'Reasoning', description: 'AI explanation of its output', type: 'string' },
  ],
  ai_decision: [
    { field: 'decision', label: 'Decision', description: 'The AI decision result', type: 'string' },
    { field: 'confidence', label: 'Confidence', description: 'Confidence score (0–100)', type: 'number' },
    { field: 'analysis', label: 'Analysis', description: 'AI analysis text', type: 'string' },
    { field: 'path', label: 'Chosen Path', description: 'Which branch the AI selected', type: 'string' },
  ],
  decision: [
    { field: 'result', label: 'Result', description: 'Condition result (true/false)', type: 'boolean' },
    { field: 'path', label: 'Path Taken', description: 'Which path was taken (true/false)', type: 'string' },
  ],
  wait: [
    { field: 'completed', label: 'Completed', description: 'Wait completed successfully', type: 'boolean' },
    { field: 'duration', label: 'Duration (ms)', description: 'Actual wait duration in ms', type: 'number' },
  ],
  approval: [
    { field: 'approved', label: 'Approved?', description: 'Whether request was approved', type: 'boolean' },
    { field: 'approver', label: 'Approver', description: 'Who approved or rejected', type: 'string' },
    { field: 'comments', label: 'Comments', description: 'Approver comments', type: 'string' },
    { field: 'timestamp', label: 'Decided At', description: 'When the decision was made', type: 'string' },
  ],
  crm: [
    { field: 'contact.id', label: 'Contact ID', description: 'CRM contact ID', type: 'string' },
    { field: 'contact.name', label: 'Contact Name', description: 'Full name', type: 'string' },
    { field: 'contact.email', label: 'Contact Email', description: 'Email address', type: 'string' },
    { field: 'contact.phone', label: 'Contact Phone', description: 'Phone number', type: 'string' },
    { field: 'contact.status', label: 'Contact Status', description: 'Contact status', type: 'string' },
    { field: 'success', label: 'Success?', description: 'Whether the CRM operation succeeded', type: 'boolean' },
  ],
  hr: [
    { field: 'employee.id', label: 'Employee ID', description: 'HR employee ID', type: 'string' },
    { field: 'employee.name', label: 'Employee Name', description: 'Full name', type: 'string' },
    { field: 'employee.email', label: 'Employee Email', description: 'Work email', type: 'string' },
    { field: 'success', label: 'Success?', description: 'Whether the HR operation succeeded', type: 'boolean' },
  ],
  merge: [
    { field: 'merged', label: 'Merged Data', description: 'Combined output from all branches', type: 'object' },
    { field: 'count', label: 'Branch Count', description: 'Number of branches that completed', type: 'number' },
  ],
  mongodb: [
    { field: 'data', label: 'Query Result', description: 'Data returned from MongoDB', type: 'object' },
    { field: 'count', label: 'Count', description: 'Number of documents returned', type: 'number' },
    { field: 'success', label: 'Success?', description: 'Whether the query succeeded', type: 'boolean' },
  ],
  postgresql: [
    { field: 'rows', label: 'Rows', description: 'Rows returned from query', type: 'array' },
    { field: 'rowCount', label: 'Row Count', description: 'Number of rows returned', type: 'number' },
    { field: 'success', label: 'Success?', description: 'Whether the query succeeded', type: 'boolean' },
  ],
};

// ── Trigger-type-specific output shapes ─────────────────────────────────────
// When the upstream node is a `trigger`, the available fields depend on
// which trigger_type is configured. These are injected as `trigger.data.*`.

export const TRIGGER_TYPE_OUTPUTS: Record<string, NodeOutputField[]> = {
  webhook: [
    { field: 'data', label: 'Full Body', description: 'Complete request body', type: 'object' },
    { field: 'headers', label: 'Headers', description: 'HTTP request headers', type: 'object' },
    { field: 'method', label: 'HTTP Method', description: 'GET / POST / PUT etc.', type: 'string' },
    { field: 'queryParams', label: 'Query Params', description: 'URL query parameters', type: 'object' },
  ],
  schedule: [
    { field: 'scheduledAt', label: 'Scheduled At', description: 'When this run was scheduled', type: 'string' },
    { field: 'cron', label: 'Cron Expression', description: 'The cron schedule that fired', type: 'string' },
    { field: 'timezone', label: 'Timezone', description: 'Timezone of the schedule', type: 'string' },
  ],
  manual: [
    { field: 'triggeredBy', label: 'Triggered By', description: 'User who started the run', type: 'string' },
    { field: 'timestamp', label: 'Started At', description: 'When the run was started', type: 'string' },
  ],
  event: [
    { field: 'eventName', label: 'Event Name', description: 'Name of the system event', type: 'string' },
    { field: 'data', label: 'Event Data', description: 'Full event payload', type: 'object' },
    { field: 'data.id', label: 'Record ID', description: 'ID of the affected record', type: 'string' },
    { field: 'data.name', label: 'Record Name', description: 'Name of the affected record', type: 'string' },
    { field: 'data.email', label: 'Email', description: 'Email from the event payload', type: 'string' },
    { field: 'data.phone', label: 'Phone', description: 'Phone from the event payload', type: 'string' },
    { field: 'data.status', label: 'Status', description: 'Status from the event payload', type: 'string' },
  ],
  new_lead: [
    { field: 'data.id', label: 'Lead ID', description: 'New lead\'s ID', type: 'string' },
    { field: 'data.name', label: 'Lead Name', description: 'Full name', type: 'string' },
    { field: 'data.email', label: 'Email', description: 'Email address', type: 'string' },
    { field: 'data.phone', label: 'Phone', description: 'Phone number', type: 'string' },
    { field: 'data.source', label: 'Source', description: 'How this lead came in', type: 'string' },
    { field: 'data.score', label: 'Lead Score', description: 'Lead quality score', type: 'number' },
    { field: 'data.assignedTo', label: 'Assigned To', description: 'Assigned team member', type: 'string' },
  ],
  form_submitted: [
    { field: 'data.name', label: 'Name', description: 'Form submitter\'s name', type: 'string' },
    { field: 'data.email', label: 'Email', description: 'Form submitter\'s email', type: 'string' },
    { field: 'data.phone', label: 'Phone', description: 'Form submitter\'s phone', type: 'string' },
    { field: 'data.message', label: 'Message', description: 'Message/comment field', type: 'string' },
    { field: 'formId', label: 'Form ID', description: 'Which form was submitted', type: 'string' },
    { field: 'submittedAt', label: 'Submitted At', description: 'Submission timestamp', type: 'string' },
  ],
};

// ============================================================================
// GRAPH TRAVERSAL
// ============================================================================

export const getUpstreamNodes = (
  currentNodeId: string,
  nodes: FlowNode[],
  edges: Edge[]
): FlowNode[] => {
  const upstream: FlowNode[] = [];
  const visited = new Set<string>();

  const traverse = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    edges
      .filter((edge) => edge.target === nodeId)
      .forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (sourceNode) {
          upstream.push(sourceNode);
          traverse(sourceNode.id);
        }
      });
  };

  traverse(currentNodeId);
  return upstream;
};

export const getNodeReferenceName = (node: FlowNode): string => {
  const nodeType = node.data.nodeType;
  const shortId = node.id.replace('node_', '').slice(-4);
  return `${nodeType}_${shortId}`;
};

// ============================================================================
// MAIN SUGGESTION GENERATOR
// ============================================================================

export const getVariableSuggestions = (
  currentNodeId: string,
  nodes: FlowNode[],
  edges: Edge[]
): VariableSuggestion[] => {
  const suggestions: VariableSuggestion[] = [];
  const upstreamNodes = getUpstreamNodes(currentNodeId, nodes, edges);

  upstreamNodes.forEach((node) => {
    const nodeType = node.data.nodeType;
    const nodeLabel = node.data.label || nodeType;
    const refName = getNodeReferenceName(node);

    // For trigger nodes, use trigger_type-specific outputs if available
    let outputs: NodeOutputField[];
    if (nodeType === 'trigger') {
      const triggerType = (node.data.config?.trigger_type as string) || '';
      outputs = TRIGGER_TYPE_OUTPUTS[triggerType] ?? NODE_OUTPUTS['trigger'] ?? [];
      // Always include the base trigger fields
      const baseOutputs = NODE_OUTPUTS['trigger'] ?? [];
      outputs = [
        ...outputs,
        ...baseOutputs.filter((b) => !outputs.some((o) => o.field === b.field)),
      ];
    } else {
      outputs = NODE_OUTPUTS[nodeType] ?? [];
    }

    outputs.forEach((output) => {
      suggestions.push({
        value: `{{${refName}.${output.field}}}`,
        label: `${nodeLabel} → ${output.label}`,
        description: output.description,
        category: nodeLabel,
        nodeId: node.id,
        nodeLabel,
      });
    });

    // For iterator: if it has a data_source with known columns, add those too
    if (nodeType === 'iterator') {
      const ds = node.data.config?.data_source as { module?: string; table?: string } | undefined;
      if (ds?.module && ds?.table) {
        try {
          const { getTableByKey } = require('@/config/moduleTableSchemas');
          const table = getTableByKey(ds.module, ds.table);
          if (table) {
            table.columns.forEach((col: { key: string; label: string }) => {
              suggestions.push({
                value: `{{${refName}.item.${col.key}}}`,
                label: `${nodeLabel} → Item ${col.label}`,
                description: `${col.label} field of the current row (${ds.table})`,
                category: `${nodeLabel} — Row Fields`,
                nodeId: node.id,
                nodeLabel,
              });
            });
          }
        } catch { /* no-op if module not found */ }
      }
    }
  });

  // Global context
  suggestions.push(
    { value: '{{workflow.id}}', label: 'Workflow Run ID', description: 'Unique ID for this workflow run', category: 'Global', nodeId: '', nodeLabel: 'Global' },
    { value: '{{workflow.timestamp}}', label: 'Started At', description: 'When this workflow run started', category: 'Global', nodeId: '', nodeLabel: 'Global' },
    { value: '{{env.current_user}}', label: 'Current User', description: 'The user who triggered this workflow', category: 'Environment', nodeId: '', nodeLabel: 'Environment' },
    { value: '{{env.tenant_id}}', label: 'Workspace ID', description: 'Your workspace / tenant ID', category: 'Environment', nodeId: '', nodeLabel: 'Environment' },
    { value: '{{env.timezone}}', label: 'Timezone', description: 'Workspace timezone setting', category: 'Environment', nodeId: '', nodeLabel: 'Environment' },
  );

  return suggestions;
};

export const groupSuggestionsByCategory = (
  suggestions: VariableSuggestion[]
): Record<string, VariableSuggestion[]> => {
  const grouped: Record<string, VariableSuggestion[]> = {};
  suggestions.forEach((s) => {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });
  return grouped;
};

// ============================================================================
// TEST-DATA-POWERED SUGGESTIONS (with schema fallback)
// ============================================================================

export const getVariableSuggestionsWithTestData = (
  currentNodeId: string,
  nodes: FlowNode[],
  edges: Edge[],
  nodeOutputs: NodeOutputMap,
): VariableSuggestion[] => {
  const suggestions: VariableSuggestion[] = [];
  const upstreamNodes = getUpstreamNodes(currentNodeId, nodes, edges);

  upstreamNodes.forEach((node) => {
    const nodeLabel = node.data.label || node.data.nodeType;
    const output = nodeOutputs[node.id];

    if (output != null) {
      const paths = extractOutputPaths(output);
      const category = `✅ ${nodeLabel} (Live Data)`;
      paths.forEach((p) => {
        if (p.type === 'object') return;
        const displayValue =
          p.value === null ? 'null'
          : p.type === 'array' ? String(p.value)
          : String(p.value).length > 50 ? String(p.value).slice(0, 50) + '…'
          : String(p.value);
        suggestions.push({
          value: `{{${node.id}.${p.path}}}`,
          label: `${nodeLabel} → ${p.path}`,
          description: `= ${displayValue}`,
          category,
          nodeId: node.id,
          nodeLabel,
        });
      });
    } else {
      // ── Schema-based fallback (no test run needed) ──
      const refName = getNodeReferenceName(node);
      let outputs: NodeOutputField[];
      if (node.data.nodeType === 'trigger') {
        const triggerType = (node.data.config?.trigger_type as string) || '';
        outputs = [
          ...(TRIGGER_TYPE_OUTPUTS[triggerType] ?? []),
          ...(NODE_OUTPUTS['trigger'] ?? []),
        ];
      } else {
        outputs = NODE_OUTPUTS[node.data.nodeType] ?? [];
      }
      outputs.forEach((o) => {
        suggestions.push({
          value: `{{${refName}.${o.field}}}`,
          label: `${nodeLabel} → ${o.label}`,
          description: o.description,
          category: `${nodeLabel}`,
          nodeId: node.id,
          nodeLabel,
        });
      });
    }
  });

  suggestions.push(
    { value: '{{workflow.id}}', label: 'Workflow Run ID', description: 'Unique ID for this run', category: 'Global', nodeId: '', nodeLabel: 'Global' },
    { value: '{{workflow.timestamp}}', label: 'Started At', description: 'When this run started', category: 'Global', nodeId: '', nodeLabel: 'Global' },
    { value: '{{env.current_user}}', label: 'Current User', description: 'User who triggered this workflow', category: 'Environment', nodeId: '', nodeLabel: 'Environment' },
    { value: '{{env.tenant_id}}', label: 'Workspace ID', description: 'Your workspace / tenant ID', category: 'Environment', nodeId: '', nodeLabel: 'Environment' },
  );

  return suggestions;
};

export default getVariableSuggestions;
