import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';
import { CompiledWorkflow } from '@/utils/flowCompiler';

export interface WorkflowSummary {
  id: string;
  name: string;
  version: number;
  tenantId: string;
  nodeCount: number;
  isActive: boolean;
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    description?: string;
  };
}

export interface ListWorkflowsResponse {
  workflows: WorkflowSummary[];
  total: number;
}

class WorkflowService {
  private baseUrl = `${API_BASE_URL}/workflows`;

  /**
   * List workflows for the current tenant
   */
  async listWorkflows(limit = 50): Promise<ListWorkflowsResponse> {
    const tenantId = localStorage.getItem('tenantId') || 'default-tenant';
    const response = await authedFetch(`${this.baseUrl}?tenantId=${tenantId}&limit=${limit}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to list workflows' }));
      throw new Error(error.message || 'Failed to list workflows');
    }

    return response.json();
  }

  /**
   * Get a workflow by ID
   */
  async getWorkflow(id: string): Promise<{ workflow: any }> {
    const response = await authedFetch(`${this.baseUrl}/${id}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch workflow' }));
      throw new Error(error.message || 'Failed to fetch workflow');
    }

    return response.json();
  }

  /**
   * Create or update a workflow
   */
  async saveWorkflow(workflow: any): Promise<{ success: boolean; workflow: { id: string; name: string } }> {
    const tenantId = localStorage.getItem('tenantId') || 'default-tenant';
    
    const body = {
      name: workflow.name || 'Untitled Workflow',
      tenantId: tenantId,
      compiled_nodes: workflow.nodes || [],
      compiled_edges: workflow.edges || [],
      execution_plan: workflow.execution_plan || {
        startNodeId: workflow.nodes?.[0]?.id || '',
        endNodeIds: [],
        nodeOrder: workflow.nodes?.map((n: any) => n.id) || [],
        parallelPaths: []
      },
      metadata: workflow.metadata || {}
    };

    const method = workflow.id ? 'PUT' : 'POST';
    const url = workflow.id ? `${this.baseUrl}/${workflow.id}` : this.baseUrl;

    const response = await authedFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to save workflow' }));
      throw new Error(error.message || 'Failed to save workflow');
    }

    return response.json();
  }

  /**
   * Publish (activate) a workflow so it responds to real trigger events
   */
  async publishWorkflow(id: string): Promise<{ success: boolean; message: string; workflow: { id: string; name: string; isActive: boolean } }> {
    const response = await authedFetch(`${this.baseUrl}/${id}/publish`, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to publish workflow' }));
      throw new Error(error.message || 'Failed to publish workflow');
    }
    return response.json();
  }

  /**
   * Unpublish (deactivate) a workflow
   */
  async unpublishWorkflow(id: string): Promise<{ success: boolean; message: string }> {
    const response = await authedFetch(`${this.baseUrl}/${id}/unpublish`, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to unpublish workflow' }));
      throw new Error(error.message || 'Failed to unpublish workflow');
    }
    return response.json();
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(id: string): Promise<{ success: boolean; message: string }> {
    const response = await authedFetch(`${this.baseUrl}/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete workflow' }));
      throw new Error(error.message || 'Failed to delete workflow');
    }

    return response.json();
  }

  /**
   * List past execution runs for a workflow
   */
  async listRuns(workflowId: string, limit = 20): Promise<{
    workflowId: string;
    total: number;
    runs: Array<{
      id: string;
      status: string;
      startedAt: string;
      completedAt?: string;
      triggeredBy?: string;
    }>;
  }> {
    const response = await authedFetch(`${this.baseUrl}/${workflowId}/runs?limit=${limit}`);
    if (!response.ok) return { workflowId, total: 0, runs: [] };
    return response.json();
  }

  /**
   * Get AI chat history for a workflow
   */
  async getChatHistory(workflowId: string): Promise<{ role: 'user' | 'assistant'; content: string; timestamp: number }[]> {
    const tenantId = localStorage.getItem('tenantId') || '';
    const response = await authedFetch(`${this.baseUrl}/ai/history/${encodeURIComponent(workflowId)}?tenantId=${encodeURIComponent(tenantId)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.messages || [];
  }
}

export const workflowService = new WorkflowService();
