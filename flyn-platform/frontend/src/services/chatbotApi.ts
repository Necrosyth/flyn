import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';

const base = `${API_BASE_URL}/chatbot`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatbotSession {
  id: string;
  tenantId: string;
  visitorName: string;
  visitorEmail: string;
  status: 'active' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotMessage {
  id: string;
  role: 'visitor' | 'agent';
  content: string;
  createdAt: string;
  isSalesIntent?: boolean;
  isEscalation?: boolean;
}

export interface ChatbotTicket {
  id: string;
  tenantId: string;
  sessionId?: string;
  visitorName: string;
  visitorEmail: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotSalesInquiry {
  id: string;
  tenantId: string;
  visitorName: string;
  visitorEmail: string;
  company?: string;
  inquiryType: string;
  status: string;
  aiSummary?: string;
  leadScore?: number;
  createdAt: string;
}

export interface AdminStats {
  sessionsToday: number;
  openTickets: number;
  salesLeads: number;
  escalations: number;
}

export interface KBArticle {
  id: string;
  tenantId: string;
  title: string;
  category: string;
  content: string;
  excerpt: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as T;
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `Error ${res.status}`);
  return json;
}

/** Fetch tenant chatbot config without auth — used by the public widget. */
export async function getChatbotPublicConfig(tenantId: string): Promise<{ chatbotAgent: string | null; voiceProvider: string | null }> {
  const res = await fetch(`${base}/public-config/${encodeURIComponent(tenantId)}`);
  if (!res.ok) return { chatbotAgent: null, voiceProvider: null };
  return res.json() as Promise<{ chatbotAgent: string | null; voiceProvider: string | null }>;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createChatSession(payload: {
  tenantId: string;
  visitorName: string;
  visitorEmail: string;
  agentType?: string;
}): Promise<{
  sessionId: string;
  session: ChatbotSession;
  greeting: string;
  isResumed?: boolean;
  pastMessages?: ChatbotMessage[];
}> {
  return post('/session', payload);
}

export function sendChatMessage(payload: {
  sessionId: string;
  tenantId: string;
  message: string;
}): Promise<{
  reply: string;
  sessionId: string;
  isSalesIntent: boolean;
  isEscalation: boolean;
  isBillingIntent: boolean;
  billingPlanId: string | null;
  billingInterval: 'monthly' | 'yearly';
}> {
  return post('/message', payload);
}

export function createChatTicket(payload: {
  tenantId: string;
  sessionId?: string;
  visitorName: string;
  visitorEmail: string;
  subject: string;
  description: string;
  priority?: string;
}): Promise<{ ticketId: string }> {
  return post('/ticket', payload);
}

export function createSalesInquiry(payload: {
  tenantId: string;
  sessionId?: string;
  visitorName: string;
  visitorEmail: string;
  company?: string;
  message?: string;
  inquiryType: string;
}): Promise<{ inquiryId: string }> {
  return post('/sales', payload);
}

// ── Admin API (Firebase auth required) ────────────────────────────────────────

export async function adminGetSessions(): Promise<ChatbotSession[]> {
  const res = await authedFetch(`${base}/admin/sessions`);
  const json = await res.json() as { sessions: ChatbotSession[] };
  return json.sessions ?? [];
}

export async function adminGetSessionMessages(sessionId: string): Promise<ChatbotMessage[]> {
  const res = await authedFetch(`${base}/admin/sessions/${sessionId}/messages`);
  const json = await res.json() as { messages: ChatbotMessage[] };
  return json.messages ?? [];
}

export async function adminGetTickets(): Promise<ChatbotTicket[]> {
  const res = await authedFetch(`${base}/admin/tickets`);
  const json = await res.json() as { tickets: ChatbotTicket[] };
  return json.tickets ?? [];
}

export async function adminGetSalesInquiries(): Promise<ChatbotSalesInquiry[]> {
  const res = await authedFetch(`${base}/admin/sales`);
  const json = await res.json() as { inquiries: ChatbotSalesInquiry[] };
  return json.inquiries ?? [];
}

export async function adminGetStats(): Promise<AdminStats> {
  const res = await authedFetch(`${base}/admin/stats`);
  return res.json() as Promise<AdminStats>;
}

// ── Knowledge Base API ─────────────────────────────────────────────────────────

export async function adminGetKBArticles(tenantId?: string): Promise<KBArticle[]> {
  const url = tenantId ? `${base}/knowledge-base?tenantId=${encodeURIComponent(tenantId)}` : `${base}/knowledge-base`;
  const res = await authedFetch(url);
  const json = await res.json() as { articles: KBArticle[] };
  return json.articles ?? [];
}

export async function adminCreateKBArticle(
  tenantId: string,
  data: { title: string; category: string; content: string; excerpt?: string },
): Promise<KBArticle> {
  const res = await authedFetch(`${base}/knowledge-base`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...data }),
  });
  const json = await res.json() as { article: KBArticle };
  return json.article;
}

export async function adminUpdateKBArticle(
  tenantId: string,
  id: string,
  data: Partial<{ title: string; category: string; content: string; excerpt: string; isPublished: boolean }>,
): Promise<KBArticle> {
  const res = await authedFetch(`${base}/knowledge-base/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...data }),
  });
  const json = await res.json() as { article: KBArticle };
  return json.article;
}

export async function adminDeleteKBArticle(tenantId: string, id: string): Promise<void> {
  await authedFetch(`${base}/knowledge-base/${id}?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'DELETE',
  });
}
