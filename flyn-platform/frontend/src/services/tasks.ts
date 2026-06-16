import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";

export interface Task {
    id: string;
    title: string;
    status: 'todo' | 'in-progress' | 'review' | 'done';
    priority: 'low' | 'medium' | 'high';
    dueDate: string;
    assignee: string;
    category: string;
    contactId?: string;
    contactName?: string;
    dealId?: string;
    dealTitle?: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
}

export type CreateTaskDto = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateTaskDto = Partial<CreateTaskDto>;

const base = `${API_BASE_URL}/tasks`;

async function parseError(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  return text || resp.statusText;
}

export const tasksService = {
  async getTasks(): Promise<Task[]> {
    const resp = await authedFetch(base);
    if (!resp.ok) throw new Error(`[Tasks GET] ${await parseError(resp)}`);
    const result = await resp.json();
    return result.data || [];
  },

  async createTask(dto: CreateTaskDto): Promise<Task> {
    const resp = await authedFetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    });
    if (!resp.ok) throw new Error(`[Tasks POST] ${await parseError(resp)}`);
    return resp.json();
  },

  async updateTask(id: string, dto: UpdateTaskDto): Promise<Task> {
    const resp = await authedFetch(`${base}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    });
    if (!resp.ok) throw new Error(`[Tasks PATCH] ${await parseError(resp)}`);
    return resp.json();
  },

  async deleteTask(id: string): Promise<{ success: boolean }> {
    const resp = await authedFetch(`${base}/${id}`, { method: "DELETE" });
    if (!resp.ok) throw new Error(`[Tasks DELETE] ${await parseError(resp)}`);
    return resp.json();
  },
};
