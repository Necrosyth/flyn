/**
 * Flow Compiler
 * -------------
 * Transforms React Flow state into clean backend-ready JSON.
 * Includes sanitization and pre-flight validation.
 */

import { Edge } from '@xyflow/react';
import { FlowNode } from '@/hooks/useFlowStore';
import { SchemaField } from '@/config/nodeSchemas';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CompiledNode {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface CompiledEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  data?: {
    conditionHandle?: string | null;
    [key: string]: unknown;
  };
}

export interface ExecutionPlan {
  startNodeId: string;
  endNodeIds: string[];
  nodeOrder: string[];
  parallelPaths: any[];
}

export interface CompiledWorkflow {
  workflow_id: string;
  name: string;
  version: number;
  created_at: string;
  nodes: CompiledNode[];
  edges: CompiledEdge[];
  execution_plan: ExecutionPlan;
  metadata: {
    node_count: number;
    edge_count: number;
    has_trigger: boolean;
    has_ai_nodes: boolean;
  };
}

// ============================================================================
// SANITIZATION
// ============================================================================

/**
 * Sanitize nodes - strip React Flow internals, keep only essential data
 */
export const sanitizeNodes = (nodes: FlowNode[]): CompiledNode[] => {
  return nodes.map((node) => ({
    id: node.id,
    type: node.data.nodeType,
    name: node.data.label || node.data.nodeType,
    position: {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    },
    config: node.data.config || {},
  }));
};

/**
 * Sanitize edges - strip React Flow internals
 */
export const sanitizeEdges = (edges: Edge[]): CompiledEdge[] => {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle || 'source',
    data: edge.data as any,
  }));
};

// ============================================================================
// VALIDATION
// ============================================================================

const TRIGGER_TYPES = ['trigger', 'inbox_trigger', 'webhook', 'schedule'];

/**
 * Get required fields from a schema
 */
const getRequiredFields = (fields: SchemaField[]): string[] => {
  const required: string[] = [];
  
  fields.forEach((field) => {
    if (field.required) {
      required.push(field.name);
    }
    // Check nested fields in sections
    if (field.type === 'section' && field.fields) {
      field.fields.forEach((nestedField) => {
        if (nestedField.required) {
          required.push(`${field.name}.${nestedField.name}`);
        }
      });
    }
  });
  
  return required;
};

/**
 * Check if a required field is filled
 */
const isFieldFilled = (config: Record<string, unknown>, fieldPath: string): boolean => {
  const parts = fieldPath.split('.');
  
  if (parts.length === 1) {
    const value = config[parts[0]];
    return value !== undefined && value !== null && value !== '';
  }
  
  // Nested field (e.g., "retry_policy.max_attempts")
  const section = config[parts[0]] as Record<string, unknown> | undefined;
  if (!section) return false;
  
  const value = section[parts[1]];
  return value !== undefined && value !== null && value !== '';
};

/**
 * Validate workflow structure (Pre-Flight Check)
 */
export const validateWorkflow = (nodes: FlowNode[], edges: Edge[]): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: Empty workflow
  if (nodes.length === 0) {
    errors.push('Workflow is empty. Add at least one node.');
    return { valid: false, errors, warnings };
  }

  // Build connection maps
  const outgoingEdges = new Map<string, Edge[]>();
  const incomingEdges = new Map<string, Edge[]>();

  edges.forEach((edge) => {
    if (!outgoingEdges.has(edge.source)) {
      outgoingEdges.set(edge.source, []);
    }
    outgoingEdges.get(edge.source)!.push(edge);

    if (!incomingEdges.has(edge.target)) {
      incomingEdges.set(edge.target, []);
    }
    incomingEdges.get(edge.target)!.push(edge);
  });

  // Check nodes
  let hasTrigger = false;

  nodes.forEach((node) => {
    const nodeType = node.data.nodeType;
    const nodeLabel = node.data.label || node.id;
    const hasIncoming = incomingEdges.has(node.id) && incomingEdges.get(node.id)!.length > 0;
    const hasOutgoing = outgoingEdges.has(node.id) && outgoingEdges.get(node.id)!.length > 0;

    // Check 2: Trigger node validation
    if (TRIGGER_TYPES.includes(nodeType)) {
      hasTrigger = true;
      if (hasIncoming) {
        warnings.push(`Trigger "${nodeLabel}" should not have incoming connections.`);
      }
      if (!hasOutgoing) {
        warnings.push(`Trigger "${nodeLabel}" has no outgoing connections.`);
      }
    }

    // Check 3: Orphan nodes (no connections at all)
    if (!hasIncoming && !hasOutgoing && !TRIGGER_TYPES.includes(nodeType)) {
      warnings.push(`Node "${nodeLabel}" is disconnected (no connections).`);
    }

    // Check 4: Dead ends (non-terminal nodes without outgoing)
    // Action, Wait, AI nodes should typically have outgoing edges
    if (!hasOutgoing && ['action', 'wait', 'ai_decision', 'ai_router'].includes(nodeType)) {
      warnings.push(`Node "${nodeLabel}" may be a dead end (no outgoing connection).`);
    }

    // Check 5: Decision nodes should have both branches connected
    if (nodeType === 'decision' || nodeType === 'ai_decision') {
      const outgoing = outgoingEdges.get(node.id) || [];
      const hasTrueBranch = outgoing.some((e) => e.sourceHandle === 'true');
      const hasFalseBranch = outgoing.some((e) => e.sourceHandle === 'false');
      
      if (!hasTrueBranch || !hasFalseBranch) {
        warnings.push(`Decision "${nodeLabel}" should have both True and False branches connected.`);
      }
    }

    // Check 6: Required fields
    if (node.data.schema?.fields) {
      const requiredFields = getRequiredFields(node.data.schema.fields);
      const config = node.data.config || {};

      requiredFields.forEach((fieldPath) => {
        if (!isFieldFilled(config, fieldPath)) {
          const fieldName = fieldPath.split('.').pop() || fieldPath;
          errors.push(`Node "${nodeLabel}" is missing required field: ${fieldName}`);
        }
      });
    }
  });

  // Check 7: No trigger
  if (!hasTrigger) {
    warnings.push('Workflow has no trigger. It cannot be started automatically.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

// ============================================================================
// COMPILATION
// ============================================================================

/**
 * Compile workflow into final JSON format
 */
export const compileWorkflow = (
  nodes: FlowNode[],
  edges: Edge[],
  options?: { workflowId?: string; version?: number; name?: string }
): CompiledWorkflow => {
  const compiledNodes = sanitizeNodes(nodes);
  const compiledEdges = sanitizeEdges(edges);

  // Simple execution plan generation
  // 1. Start node is the first trigger, or the first node if no trigger
  const triggerNode = nodes.find(n => TRIGGER_TYPES.includes(n.data.nodeType));
  const startNodeId = triggerNode?.id || nodes[0]?.id || '';

  // 2. End nodes are nodes with no outgoing edges
  const sourceNodeIds = new Set(edges.map(e => e.source));
  const endNodeIds = nodes.filter(n => !sourceNodeIds.has(n.id)).map(n => n.id);

  return {
    workflow_id: options?.workflowId || `wf_${Date.now()}`,
    name: options?.name || 'Untitled Workflow',
    version: options?.version || 1,
    created_at: new Date().toISOString(),
    nodes: compiledNodes,
    edges: compiledEdges,
    execution_plan: {
      startNodeId,
      endNodeIds,
      nodeOrder: nodes.map(n => n.id),
      parallelPaths: [],
    },
    metadata: {
      node_count: compiledNodes.length,
      edge_count: compiledEdges.length,
      has_trigger: compiledNodes.some((n) => TRIGGER_TYPES.includes(n.type)),
      has_ai_nodes: compiledNodes.some((n) => n.type === 'ai_decision' || n.type === 'ai_router'),
    },
  };
};

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

export interface CompileResult {
  success: boolean;
  workflow?: CompiledWorkflow;
  validation: ValidationResult;
}

/**
 * Main function: Validate and compile workflow
 */
export const compileAndValidate = (
  nodes: FlowNode[],
  edges: Edge[],
  options?: { workflowId?: string; name?: string; version?: number; allowWarnings?: boolean }
): CompileResult => {
  // Validate first
  const validation = validateWorkflow(nodes, edges);

  // If there are errors, don't compile
  if (!validation.valid) {
    return {
      success: false,
      validation,
    };
  }

  // Compile
  const workflow = compileWorkflow(nodes, edges, options);

  return {
    success: true,
    workflow,
    validation,
  };
};

export default compileAndValidate;
