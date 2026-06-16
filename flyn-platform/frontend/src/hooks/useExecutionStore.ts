/**
 * Execution Store - Zustand State Management
 * -------------------------------------------
 * Manages workflow execution visualization state.
 * Separates runtime logic from editing logic for cleaner architecture.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { FlowNode } from './useFlowStore';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type NodeExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ExecutionState {
  // State
  isRunning: boolean;
  nodeStatuses: Record<string, NodeExecutionStatus>;
  logs: Record<string, string[]>;
  currentNodeIndex: number;

  // Actions
  setNodeStatus: (nodeId: string, status: NodeExecutionStatus) => void;
  addLog: (nodeId: string, message: string) => void;
  startSimulation: (nodes: FlowNode[]) => void;
  stopSimulation: () => void;
  resetExecution: () => void;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useExecutionStore = create<ExecutionState>()(
  devtools(
    (set, get) => ({
      // ------------------------------------
      // STATE
      // ------------------------------------
      isRunning: false,
      nodeStatuses: {},
      logs: {},
      currentNodeIndex: 0,

      // ------------------------------------
      // ACTIONS
      // ------------------------------------

      /**
       * Set the execution status for a specific node
       */
      setNodeStatus: (nodeId: string, status: NodeExecutionStatus) => {
        set(
          (state) => ({
            nodeStatuses: {
              ...state.nodeStatuses,
              [nodeId]: status,
            },
          }),
          false,
          'setNodeStatus'
        );
      },

      /**
       * Add a log entry for a specific node
       */
      addLog: (nodeId: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        set(
          (state) => ({
            logs: {
              ...state.logs,
              [nodeId]: [...(state.logs[nodeId] || []), `[${timestamp}] ${message}`],
            },
          }),
          false,
          'addLog'
        );
      },

      /**
       * Start simulation - mock a backend workflow run
       * Iterates through nodes sequentially with delays
       */
      startSimulation: (nodes: FlowNode[]) => {
        const { isRunning, setNodeStatus, addLog, stopSimulation } = get();

        // Prevent multiple simultaneous runs
        if (isRunning) {
          console.warn('Simulation already running');
          return;
        }

        // Filter out any non-executable nodes and sort by position (top to bottom)
        const executableNodes = [...nodes].sort((a, b) => a.position.y - b.position.y);

        if (executableNodes.length === 0) {
          console.warn('No nodes to execute');
          return;
        }

        // Initialize all nodes to pending
        const initialStatuses: Record<string, NodeExecutionStatus> = {};
        const initialLogs: Record<string, string[]> = {};
        
        executableNodes.forEach((node) => {
          initialStatuses[node.id] = 'pending';
          initialLogs[node.id] = [];
        });

        set({
          isRunning: true,
          nodeStatuses: initialStatuses,
          logs: initialLogs,
          currentNodeIndex: 0,
        });

        // Simulate execution with delays
        const executeNode = (index: number) => {
          if (index >= executableNodes.length) {
            // All nodes completed
            set({ isRunning: false });
            console.log('🎉 Simulation completed!');
            return;
          }

          const node = executableNodes[index];
          const nodeLabel = node.data.label || node.id;

          // Set node to running
          setNodeStatus(node.id, 'running');
          addLog(node.id, `Starting execution of "${nodeLabel}"...`);

          // Simulate execution time (1-3 seconds)
          const executionTime = 1000 + Math.random() * 2000;

          setTimeout(() => {
            // Check if simulation was stopped
            if (!get().isRunning) {
              return;
            }

            // Simulate occasional failures (10% chance, except for triggers)
            const shouldFail = node.data.nodeType !== 'trigger' && Math.random() < 0.1;

            if (shouldFail) {
              setNodeStatus(node.id, 'failed');
              addLog(node.id, `❌ Execution failed for "${nodeLabel}"`);
              addLog(node.id, `Error: Simulated failure for demo purposes`);
              
              // Stop simulation on failure
              setTimeout(() => {
                stopSimulation();
              }, 500);
              return;
            }

            // Mark as completed
            setNodeStatus(node.id, 'completed');
            addLog(node.id, `✅ "${nodeLabel}" completed successfully`);

            // Add mock output logs based on node type
            switch (node.data.nodeType) {
              case 'trigger':
                addLog(node.id, `📥 Received trigger event`);
                break;
              case 'action':
                addLog(node.id, `📤 Action executed: ${node.data.config?.action_type || 'send'}`);
                break;
              case 'wait':
                addLog(node.id, `⏱️ Wait condition satisfied`);
                break;
              case 'decision':
                addLog(node.id, `🔀 Condition evaluated: true`);
                break;
              case 'ai_decision':
                addLog(node.id, `🤖 AI confidence: ${85 + Math.floor(Math.random() * 15)}%`);
                break;
              case 'approval':
                addLog(node.id, `👤 Approval received`);
                break;
              case 'query_records':
                addLog(node.id, `📊 Fetched ${Math.floor(Math.random() * 50) + 1} records`);
                break;
              case 'iterator':
                addLog(node.id, `🔄 Iterating over ${Math.floor(Math.random() * 10) + 1} items`);
                break;
              case 'ai_action':
                addLog(node.id, `🧠 AI action completed via plugin`);
                break;
              default:
                addLog(node.id, `📝 Output: success`);
            }

            // Move to next node
            set({ currentNodeIndex: index + 1 });
            
            // Small delay before next node
            setTimeout(() => {
              executeNode(index + 1);
            }, 300);
          }, executionTime);
        };

        // Start execution from first node
        console.log('🚀 Starting simulation...');
        executeNode(0);
      },

      /**
       * Stop the current simulation
       */
      stopSimulation: () => {
        set({
          isRunning: false,
        });
        console.log('⏹️ Simulation stopped');
      },

      /**
       * Reset all execution state
       */
      resetExecution: () => {
        set({
          isRunning: false,
          nodeStatuses: {},
          logs: {},
          currentNodeIndex: 0,
        });
      },
    }),
    { name: 'ExecutionStore' }
  )
);

export default useExecutionStore;
