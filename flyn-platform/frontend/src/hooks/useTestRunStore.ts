/**
 * Test Run Store — Zustand State Management
 * ------------------------------------------
 * Stores REAL backend execution outputs from "Test" runs.
 * These outputs power the variable picker so users can select
 * actual data keys from upstream nodes when configuring downstream nodes.
 *
 * n8n-style: click Test → execute flow → real data populates variable dropdowns.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

/** Flat map of nodeId → whatever the backend returned as that node's output */
export type NodeOutputMap = Record<string, unknown>;

export interface TestRunState {
  /** Whether a test run has been completed at least once */
  hasTestData: boolean;
  /** The run ID from the last test execution */
  lastRunId: string | null;
  /** The overall status of the last test run */
  lastRunStatus: 'idle' | 'running' | 'completed' | 'failed';
  /** Per-node real outputs from the last test execution, keyed by frontend node ID */
  nodeOutputs: NodeOutputMap;
  /** Per-node execution status */
  nodeStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed'>;
  /** Optional error message from the last run */
  lastError: string | null;

  // Actions
  /** Mark a test run as started */
  startTestRun: () => void;
  /** Store all node outputs from a completed test run */
  setTestResults: (runId: string, nodeOutputs: NodeOutputMap) => void;
  /** Set a node's individual status during execution */
  setNodeStatus: (nodeId: string, status: 'pending' | 'running' | 'completed' | 'failed') => void;
  /** Set all nodes to pending at once */
  initNodeStatuses: (nodeIds: string[]) => void;
  /** Mark the test run as failed */
  setTestFailed: (error: string) => void;
  /** Clear all test data */
  clearTestData: () => void;
  /** Get the output for a specific node */
  getNodeOutput: (nodeId: string) => unknown;
  /** Inject a sample output for a single node (for manual/schema-based testing) */
  setNodeOutput: (nodeId: string, output: unknown) => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useTestRunStore = create<TestRunState>()(
  devtools(
    (set, get) => ({
      hasTestData: false,
      lastRunId: null,
      lastRunStatus: 'idle',
      nodeOutputs: {},
      nodeStatuses: {},
      lastError: null,

      startTestRun: () => {
        set(
          {
            lastRunStatus: 'running',
            lastError: null,
          },
          false,
          'startTestRun',
        );
      },

      initNodeStatuses: (nodeIds: string[]) => {
        const statuses: Record<string, 'pending'> = {};
        nodeIds.forEach((id) => (statuses[id] = 'pending'));
        set({ nodeStatuses: statuses }, false, 'initNodeStatuses');
      },

      setNodeStatus: (nodeId, status) => {
        set(
          (state) => ({
            nodeStatuses: { ...state.nodeStatuses, [nodeId]: status },
          }),
          false,
          'setNodeStatus',
        );
      },

      setTestResults: (runId, nodeOutputs) => {
        // Mark all nodes with outputs as completed
        const statuses: Record<string, 'completed'> = {};
        Object.keys(nodeOutputs).forEach((id) => (statuses[id] = 'completed'));

        set(
          {
            hasTestData: true,
            lastRunId: runId,
            lastRunStatus: 'completed',
            nodeOutputs,
            nodeStatuses: statuses,
            lastError: null,
          },
          false,
          'setTestResults',
        );
      },

      setTestFailed: (error) => {
        set(
          { lastRunStatus: 'failed', lastError: error },
          false,
          'setTestFailed',
        );
      },

      clearTestData: () => {
        set(
          {
            hasTestData: false,
            lastRunId: null,
            lastRunStatus: 'idle',
            nodeOutputs: {},
            nodeStatuses: {},
            lastError: null,
          },
          false,
          'clearTestData',
        );
      },

      getNodeOutput: (nodeId) => {
        return get().nodeOutputs[nodeId];
      },

      setNodeOutput: (nodeId, output) => {
        set(
          (state) => ({
            hasTestData: true,
            nodeOutputs: { ...state.nodeOutputs, [nodeId]: output },
            nodeStatuses: { ...state.nodeStatuses, [nodeId]: 'completed' },
          }),
          false,
          'setNodeOutput',
        );
      },
    }),
    { name: 'TestRunStore' },
  ),
);

// ============================================================================
// HELPER: Extract all variable paths from a real output object
// ============================================================================

/**
 * Recursively walk an object and produce a flat list of dot-separated paths
 * together with the leaf value.  Arrays produce items like `result[0].name`.
 *
 * @param obj - The output object from a node execution.
 * @param prefix - Current key path prefix (used for recursion).
 * @param maxDepth - Prevent infinite recursion on deeply-nested structures.
 * @returns Array of { path, value, type } for every reachable leaf.
 */
export interface OutputPath {
  path: string;
  value: unknown;
  type: string; // 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
}

export function extractOutputPaths(
  obj: unknown,
  prefix = '',
  maxDepth = 4,
): OutputPath[] {
  if (maxDepth <= 0) return [];

  const paths: OutputPath[] = [];

  if (obj === null || obj === undefined) {
    if (prefix) paths.push({ path: prefix, value: obj, type: 'null' });
    return paths;
  }

  if (Array.isArray(obj)) {
    // Add the array itself
    paths.push({ path: prefix || 'root', value: `Array(${obj.length})`, type: 'array' });

    // Add a few items (first 3 max) with index access
    obj.slice(0, 3).forEach((item, idx) => {
      const itemPrefix = prefix ? `${prefix}[${idx}]` : `[${idx}]`;
      if (typeof item === 'object' && item !== null) {
        paths.push(...extractOutputPaths(item, itemPrefix, maxDepth - 1));
      } else {
        paths.push({ path: itemPrefix, value: item, type: typeof item });
      }
    });

    // If it has more, add an indicator
    if (obj.length > 3) {
      paths.push({
        path: prefix ? `${prefix}[...]` : '[...]',
        value: `…${obj.length - 3} more`,
        type: 'string',
      });
    }

    return paths;
  }

  if (typeof obj === 'object') {
    // Add the object itself at top level only
    if (prefix) {
      paths.push({ path: prefix, value: '{…}', type: 'object' });
    }

    for (const [key, val] of Object.entries(obj)) {
      // Skip internal fields
      if (key.startsWith('_')) continue;

      const fullPath = prefix ? `${prefix}.${key}` : key;

      if (val === null || val === undefined) {
        paths.push({ path: fullPath, value: val, type: 'null' });
      } else if (Array.isArray(val)) {
        paths.push(...extractOutputPaths(val, fullPath, maxDepth - 1));
      } else if (typeof val === 'object') {
        paths.push(...extractOutputPaths(val, fullPath, maxDepth - 1));
      } else {
        paths.push({ path: fullPath, value: val, type: typeof val });
      }
    }

    return paths;
  }

  // Primitives
  if (prefix) {
    paths.push({ path: prefix, value: obj, type: typeof obj });
  }

  return paths;
}

export default useTestRunStore;
