/**
 * Agent Store — Zustand
 * ---------------------
 * Global state for AI agents, shared between:
 *   - AIAgents page
 *   - Workflow Builder (voice_agent node selector)
 *
 * Calling `fetchAgents()` from either context populates the same store,
 * guaranteeing cross-visibility.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import agentApi, { Agent, CreateAgentPayload, UpdateAgentPayload } from '@/services/agents';

interface AgentState {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  // Actions — tenant is derived server-side from the auth token.
  fetchAgents: () => Promise<void>;
  createAgent: (payload: CreateAgentPayload) => Promise<Agent>;
  updateAgent: (id: string, payload: UpdateAgentPayload) => Promise<Agent>;
  deleteAgent: (id: string) => Promise<void>;
  getAgentById: (id: string) => Agent | undefined;
}

export const useAgentStore = create<AgentState>()(
  devtools(
    (set, get) => ({
      agents: [],
      loading: false,
      error: null,
      lastFetchedAt: null,

      fetchAgents: async () => {
        set({ loading: true, error: null }, false, 'fetchAgents/start');
        try {
          const agents = await agentApi.list();
          set({ agents, loading: false, lastFetchedAt: Date.now() }, false, 'fetchAgents/done');
        } catch (err) {
          set({ error: (err as Error).message, loading: false }, false, 'fetchAgents/error');
        }
      },

      createAgent: async (payload) => {
        const agent = await agentApi.create(payload);
        set(
          (state) => ({ agents: [agent, ...state.agents] }),
          false,
          'createAgent',
        );
        return agent;
      },

      updateAgent: async (id, payload) => {
        const agent = await agentApi.update(id, payload);
        set(
          (state) => ({
            agents: state.agents.map((a) => (a.id === id ? agent : a)),
          }),
          false,
          'updateAgent',
        );
        return agent;
      },

      deleteAgent: async (id) => {
        await agentApi.delete(id);
        set(
          (state) => ({ agents: state.agents.filter((a) => a.id !== id) }),
          false,
          'deleteAgent',
        );
      },

      getAgentById: (id) => get().agents.find((a) => a.id === id),
    }),
    { name: 'AgentStore' },
  ),
);
