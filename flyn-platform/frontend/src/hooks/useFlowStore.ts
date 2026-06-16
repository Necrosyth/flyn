/**
 * Flow Store - Zustand State Management
 * --------------------------------------
 * Central state management for the workflow builder.
 * Manages nodes, edges, selection state, and config updates.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  NodeChange,
  EdgeChange,
} from '@xyflow/react';
import { NodeSchema } from '@/config/nodeSchemas';
import { getNodeColor } from '@/config/nodeColors';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface NodeData {
  [key: string]: unknown;
  label: string;
  nodeType: string;
  schema: NodeSchema;
  config: Record<string, unknown>;
}

export interface FlowNode extends Node<NodeData> {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

export interface FlowState {
  // State
  nodes: FlowNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  isDirty: boolean; // Track unsaved changes

  // Node Actions
  setNodes: (nodes: FlowNode[]) => void;
  addNode: (node: FlowNode) => void;
  removeNode: (nodeId: string) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  
  // Config Actions
  updateNodeConfig: (nodeId: string, fieldName: string, value: unknown) => void;
  updateNestedNodeConfig: (nodeId: string, sectionName: string, fieldName: string, value: unknown) => void;
  
  // Edge Actions
  setEdges: (edges: Edge[]) => void;
  addEdge: (edge: Edge) => void;
  removeEdge: (edgeId: string) => void;

  /**
   * Atomically replace both nodes and edges in a single Zustand set() call.
   * This prevents React Flow from firing spurious onEdgesChange "remove" events
   * between separate setNodes / setEdges calls, which was dropping multi-
   * outgoing edges on JSON import.
   */
  loadFlow: (nodes: FlowNode[], edges: Edge[]) => void;
  
  // Selection Actions
  setSelectedNode: (nodeId: string | null) => void;
  clearSelection: () => void;
  
  // React Flow Handlers
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  
  // Utility Actions
  resetFlow: () => void;
  setDirty: (isDirty: boolean) => void;
  getSelectedNode: () => FlowNode | undefined;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialNodes: FlowNode[] = [];
const initialEdges: Edge[] = [];

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useFlowStore = create<FlowState>()(
  devtools(
    (set, get) => ({
      // ------------------------------------
      // STATE
      // ------------------------------------
      nodes: initialNodes,
      edges: initialEdges,
      selectedNodeId: null,
      isDirty: false,

      // ------------------------------------
      // NODE ACTIONS
      // ------------------------------------
      setNodes: (nodes) => {
        set({ nodes, isDirty: true }, false, 'setNodes');
      },

      addNode: (node) => {
        set(
          (state) => ({
            nodes: [...state.nodes, node],
            isDirty: true,
          }),
          false,
          'addNode'
        );
      },

      removeNode: (nodeId) => {
        set(
          (state) => ({
            nodes: state.nodes.filter((n) => n.id !== nodeId),
            edges: state.edges.filter(
              (e) => e.source !== nodeId && e.target !== nodeId
            ),
            selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
            isDirty: true,
          }),
          false,
          'removeNode'
        );
      },

      updateNodePosition: (nodeId, position) => {
        set(
          (state) => ({
            nodes: state.nodes.map((node) =>
              node.id === nodeId ? { ...node, position } : node
            ),
          }),
          false,
          'updateNodePosition'
        );
      },

      // ------------------------------------
      // CONFIG ACTIONS
      // ------------------------------------
      updateNodeConfig: (nodeId, fieldName, value) => {
        set(
          (state) => ({
            nodes: state.nodes.map((node) =>
              node.id === nodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      config: {
                        ...node.data.config,
                        [fieldName]: value,
                      },
                    },
                  }
                : node
            ),
            isDirty: true,
          }),
          false,
          'updateNodeConfig'
        );
      },

      updateNestedNodeConfig: (nodeId, sectionName, fieldName, value) => {
        set(
          (state) => ({
            nodes: state.nodes.map((node) =>
              node.id === nodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      config: {
                        ...node.data.config,
                        [sectionName]: {
                          ...(node.data.config[sectionName] as Record<string, unknown> || {}),
                          [fieldName]: value,
                        },
                      },
                    },
                  }
                : node
            ),
            isDirty: true,
          }),
          false,
          'updateNestedNodeConfig'
        );
      },

      // ------------------------------------
      // EDGE ACTIONS
      // ------------------------------------
      setEdges: (edges) => {
        set({ edges, isDirty: true }, false, 'setEdges');
      },

      loadFlow: (nodes, edges) => {
        set({ nodes, edges, isDirty: false, selectedNodeId: null }, false, 'loadFlow');
      },

      addEdge: (edge) => {
        set(
          (state) => ({
            edges: [...state.edges, edge],
            isDirty: true,
          }),
          false,
          'addEdge'
        );
      },

      removeEdge: (edgeId) => {
        set(
          (state) => ({
            edges: state.edges.filter((e) => e.id !== edgeId),
            isDirty: true,
          }),
          false,
          'removeEdge'
        );
      },

      // ------------------------------------
      // SELECTION ACTIONS
      // ------------------------------------
      setSelectedNode: (nodeId) => {
        set({ selectedNodeId: nodeId }, false, 'setSelectedNode');
      },

      clearSelection: () => {
        set({ selectedNodeId: null }, false, 'clearSelection');
      },

      // ------------------------------------
      // REACT FLOW HANDLERS
      // ------------------------------------
      onNodesChange: (changes: NodeChange[]) => {
        set(
          (state) => ({
            nodes: applyNodeChanges(changes, state.nodes) as FlowNode[],
            isDirty: true,
          }),
          false,
          'onNodesChange'
        );
      },

      onEdgesChange: (changes: EdgeChange[]) => {
        set(
          (state) => ({
            edges: applyEdgeChanges(changes, state.edges),
            isDirty: true,
          }),
          false,
          'onEdgesChange'
        );
      },

      onConnect: (connection: Connection) => {
        const state = get();
        // Find the source node to get its type and color
        const sourceNode = state.nodes.find((n) => n.id === connection.source);
        const sourceNodeType = sourceNode?.data?.nodeType || '';
        const edgeColor = getNodeColor(sourceNodeType);
        
        set(
          (state) => ({
            edges: addEdge(
              {
                ...connection,
                id: `edge_${Date.now()}`,
                type: 'colored', // Use our custom colored edge
                animated: false, // We handle animation in the edge component
                data: {
                  sourceNodeType,
                  animated: true,
                },
                style: {
                  stroke: edgeColor,
                  strokeWidth: 2,
                },
              },
              state.edges
            ),
            isDirty: true,
          }),
          false,
          'onConnect'
        );
      },

      // ------------------------------------
      // UTILITY ACTIONS
      // ------------------------------------
      resetFlow: () => {
        set(
          {
            nodes: [],
            edges: [],
            selectedNodeId: null,
            isDirty: false,
          },
          false,
          'resetFlow'
        );
      },

      setDirty: (isDirty) => {
        set({ isDirty }, false, 'setDirty');
      },

      getSelectedNode: () => {
        const state = get();
        return state.nodes.find((n) => n.id === state.selectedNodeId);
      },
    }),
    { name: 'FlowStore' }
  )
);

// ============================================================================
// SELECTOR HOOKS (for optimized re-renders)
// ============================================================================

export const useNodes = () => useFlowStore((state) => state.nodes);
export const useEdges = () => useFlowStore((state) => state.edges);
export const useSelectedNodeId = () => useFlowStore((state) => state.selectedNodeId);
export const useIsDirty = () => useFlowStore((state) => state.isDirty);

export const useSelectedNode = () => {
  const nodes = useFlowStore((state) => state.nodes);
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  return nodes.find((n) => n.id === selectedNodeId);
};

export default useFlowStore;
