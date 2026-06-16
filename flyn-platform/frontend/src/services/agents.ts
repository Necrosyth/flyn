/**
 * Agent API Service
 * -----------------
 * Frontend API client for the AI Agents backend (/api/agents).
 * Used by both the AIAgents page and the Workflow Builder's
 * voice_agent node to list / create / update agents.
 */

import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';

// ============================================================================
// TYPES  (mirrors backend Agent interface, camelCase)
// ============================================================================

export type AgentStatus = 'active' | 'idle' | 'draft' | 'archived';
export type AgentChannel = 'Voice' | 'Web Chat' | 'SMS' | 'Email' | 'WhatsApp';

export interface AgentTool {
  type: 'function' | 'transferCall' | 'endCall';
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  avatar?: string;
  role?: string;
  vapiAssistantId?: string;
  firstMessage: string;
  systemPrompt?: string;
  modelProvider: string;
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  voiceProvider: string;
  voiceId: string;
  twilioVoice?: string;
  language?: string;
  supportedLanguages?: string[];
  multiLanguage?: boolean;
  endCallOnSilence?: boolean;
  silenceTimeoutSeconds?: number;
  maxDurationSeconds?: number;
  interruptionsEnabled?: boolean;
  knowledgeBaseIds?: string[];
  tools?: AgentTool[];
  customVapiConfig?: Record<string, unknown>;
  channels: AgentChannel[];
  skills?: string[];
  status: AgentStatus;
  enableCalendarBooking?: boolean;
  calendarId?: string;
  voiceEngine?: 'gather' | 'relay';
  voiceModel?: string;
  transcriptTurnLimit?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface CreateAgentPayload {
  name: string;
  description?: string;
  avatar?: string;
  role?: string;
  firstMessage: string;
  systemPrompt?: string;
  modelProvider?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  voiceProvider?: string;
  voiceId?: string;
  twilioVoice?: string;
  language?: string;
  supportedLanguages?: string[];
  multiLanguage?: boolean;
  endCallOnSilence?: boolean;
  silenceTimeoutSeconds?: number;
  maxDurationSeconds?: number;
  interruptionsEnabled?: boolean;
  knowledgeBaseIds?: string[];
  tools?: AgentTool[];
  customVapiConfig?: Record<string, unknown>;
  channels?: AgentChannel[];
  skills?: string[];
  status?: AgentStatus;
  enableCalendarBooking?: boolean;
  calendarId?: string;
  voiceEngine?: 'gather' | 'relay';
  voiceModel?: string;
  transcriptTurnLimit?: number;
  tenantId?: string;
}

export type UpdateAgentPayload = Partial<CreateAgentPayload>;

// ============================================================================
// API CLIENT
// ============================================================================

class AgentApiClient {
  private baseUrl = `${API_BASE_URL}/agents`;

  /**
   * Returns true when the error is a 404 or network failure,
   * meaning the backend hasn't deployed the agents module yet.
   */
  private isEndpointMissing(res: Response): boolean {
    return res.status === 404 || res.status === 502 || res.status === 503;
  }

  // tenantId is derived server-side from the auth token — never sent by the client.
  async list(limit?: number): Promise<Agent[]> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    const res = await authedFetch(`${this.baseUrl}${params.toString() ? `?${params}` : ''}`);

    // Backend not deployed yet — tolerate with an empty list (not a runtime error).
    if (this.isEndpointMissing(res)) {
      console.warn('[AgentAPI] /api/agents returned', res.status, '— backend not deployed; empty list');
      return [];
    }
    if (!res.ok) throw new Error(`Failed to fetch agents (HTTP ${res.status})`);
    const data = await res.json();
    return data.agents as Agent[];
  }

  async getById(id: string): Promise<Agent> {
    const res = await authedFetch(`${this.baseUrl}/${id}`);
    if (!res.ok) throw new Error('Agent not found');
    const data = await res.json();
    return data.agent as Agent;
  }

  async create(payload: CreateAgentPayload): Promise<Agent> {
    const { tenantId: _ignored, ...body } = payload; // never send tenantId — server uses the token
    const res = await authedFetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (this.isEndpointMissing(res)) {
      throw new Error('Agent backend not deployed yet. Please deploy the backend first or run it locally.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(err.message || 'Failed to create agent');
    }
    const data = await res.json();
    return data.agent as Agent;
  }

  async update(id: string, payload: UpdateAgentPayload): Promise<Agent> {
    const { tenantId: _ignored, ...body } = payload;
    const res = await authedFetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (this.isEndpointMissing(res)) {
      throw new Error('Agent backend not deployed yet. Please deploy the backend first or run it locally.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(err.message || 'Failed to update agent');
    }
    const data = await res.json();
    return data.agent as Agent;
  }

  async delete(id: string): Promise<void> {
    const res = await authedFetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    if (this.isEndpointMissing(res)) {
      throw new Error('Agent backend not deployed yet. Please deploy the backend first or run it locally.');
    }
    if (!res.ok) throw new Error('Failed to delete agent');
  }
}

export const agentApi = new AgentApiClient();
export default agentApi;
