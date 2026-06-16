/**
 * Smart Agents API client
 * All calls hit: /api/smart-agents/...
 */

import { API_BASE_URL } from './api';
import { authedFetch } from '@/services/authApi';

const BASE = `${API_BASE_URL}/smart-agents`;

/**
 * Resolve the active tenant ID.
 * Priority: localStorage (set by auth flow) → 'default' fallback.
 * Components can override by passing tenantId explicitly to any agentsApi method.
 */
function getActiveTenant(): string {
  return localStorage.getItem('tenantId') || 'default';
}

const TENANT = getActiveTenant;

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  // authedFetch attaches the Firebase token; the backend derives the tenant from
  // auth (not the path param), so a stale localStorage tenantId can't misroute data.
  const res = await authedFetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export const agentsApi = {
  getAllConfigs: (tenantId = TENANT()) =>
    call<any[]>(`/configs/${tenantId}`),

  getConfig: (agentType: string, tenantId = TENANT()) =>
    call<any>(`/config/${tenantId}/${agentType}`),

  toggleAgent: (agentType: string, active: boolean, tenantId = TENANT()) =>
    call<any>(`/config/${tenantId}/${agentType}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),

  updateCompanyData: (agentType: string, data: Record<string, string>, tenantId = TENANT()) =>
    call<any>(`/config/${tenantId}/${agentType}/company-data`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateModel: (agentType: string, model: string, tenantId = TENANT()) =>
    call<any>(`/config/${tenantId}/${agentType}/model`, {
      method: 'PATCH',
      body: JSON.stringify({ model }),
    }),

  getSystemPrompt: (agentType: string, tenantId = TENANT()) =>
    call<{ prompt: string }>(`/prompt/${tenantId}/${agentType}`),

  // ─── Activity & Metrics ──────────────────────────────────────────────────

  getActivity: (agentType?: string, limit = 50, tenantId = TENANT()) => {
    const q = new URLSearchParams();
    if (agentType) q.set('agentType', agentType);
    q.set('limit', String(limit));
    return call<any[]>(`/activity/${tenantId}?${q}`);
  },

  getMetrics: (tenantId = TENANT()) =>
    call<any[]>(`/metrics/${tenantId}`),

  getWeeklyReport: (tenantId = TENANT()) =>
    call<{ summary: string; metrics: Record<string, number> }>(`/report/${tenantId}`),

  // ─── Marketing ───────────────────────────────────────────────────────────

  scoreLead: (leadInfo: Record<string, any>, tenantId = TENANT()) =>
    call<any>('/marketing/score-lead', {
      method: 'POST',
      body: JSON.stringify({ tenantId, leadInfo }),
    }),

  getDripSequence: (tier: 'hot' | 'warm' | 'cold', tenantId = TENANT()) =>
    call<any[]>('/marketing/drip-sequence', {
      method: 'POST',
      body: JSON.stringify({ tenantId, tier }),
    }),

  detectObjection: (text: string) =>
    call<any>('/marketing/detect-objection', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  getCampaigns: (tenantId = TENANT()) =>
    call<any[]>(`/marketing/campaigns/${tenantId}`),

  saveCampaign: (campaign: Record<string, any>, tenantId = TENANT()) =>
    call<any>('/marketing/campaigns', {
      method: 'POST',
      body: JSON.stringify({ tenantId, ...campaign }),
    }),

  // ─── Content ─────────────────────────────────────────────────────────────

  generateCalendar: (tenantId = TENANT()) =>
    call<any[]>('/content/calendar', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    }),

  generateCaption: (platform: string, topic: string, tone?: string, tenantId = TENANT()) =>
    call<{ caption: string }>('/content/caption', {
      method: 'POST',
      body: JSON.stringify({ tenantId, platform, topic, tone }),
    }),

  generateBlogOutline: (topic: string, tenantId = TENANT()) =>
    call<{ outline: string }>('/content/blog-outline', {
      method: 'POST',
      body: JSON.stringify({ tenantId, topic }),
    }),

  generateABVariants: (topic: string, channel: string, tenantId = TENANT()) =>
    call<{ versionA: string; versionB: string; topic: string }>('/content/ab-variants', {
      method: 'POST',
      body: JSON.stringify({ tenantId, topic, channel }),
    }),

  generateFAQAnswer: (question: string, tenantId = TENANT()) =>
    call<{ answer: string }>('/content/faq-answer', {
      method: 'POST',
      body: JSON.stringify({ tenantId, question }),
    }),

  getContentLibrary: (type?: string, tenantId = TENANT()) => {
    const q = type ? `?type=${type}` : '';
    return call<any[]>(`/content/library/${tenantId}${q}`);
  },

  saveContent: (contentType: string, title: string, body: string, tenantId = TENANT()) =>
    call<any>('/content/library', {
      method: 'POST',
      body: JSON.stringify({ tenantId, contentType, title, body }),
    }),

  approveContent: (contentId: string, tenantId = TENANT()) =>
    call<any>(`/content/library/${tenantId}/${contentId}/approve`, { method: 'PATCH' }),

  // Content → Calendar: push a generated 30-day calendar onto the Calendar module
  syncCalendarToCalendar: (entries: any[], tenantId = TENANT()) =>
    call<{ synced: number }>('/content/calendar/sync', {
      method: 'POST',
      body: JSON.stringify({ tenantId, entries }),
    }),

  // Content library → Social: create a draft social post from a library item
  contentToSocial: (contentId: string, platform?: string, tenantId = TENANT()) =>
    call<any>(`/content/library/${tenantId}/${contentId}/to-social`, {
      method: 'POST',
      body: JSON.stringify({ platform }),
    }),

  // Content library → Campaign Manager: create a draft campaign from a library item
  contentToCampaign: (contentId: string, channel?: string, tenantId = TENANT()) =>
    call<any>(`/content/library/${tenantId}/${contentId}/to-campaign`, {
      method: 'POST',
      body: JSON.stringify({ channel }),
    }),

  // ─── Social ──────────────────────────────────────────────────────────────

  generateSocialPost: (platform: string, topic: string, tenantId = TENANT()) =>
    call<any>('/social/generate-post', {
      method: 'POST',
      body: JSON.stringify({ tenantId, platform, topic }),
    }),

  analyzeSentiment: (text: string, tenantId = TENANT()) =>
    call<any>('/social/sentiment', {
      method: 'POST',
      body: JSON.stringify({ tenantId, text }),
    }),

  schedulePost: (post: Record<string, any>, tenantId = TENANT()) =>
    call<any>('/social/schedule', {
      method: 'POST',
      body: JSON.stringify({ tenantId, ...post }),
    }),

  getPosts: (tenantId = TENANT()) =>
    call<any[]>(`/social/posts/${tenantId}`),

  // Social → Calendar: push scheduled posts onto the Calendar module
  syncSocialToCalendar: (tenantId = TENANT()) =>
    call<{ synced: number }>('/social/calendar/sync', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    }),

  // Which platforms have a connected channel we can publish to
  getConnectedSocialChannels: (tenantId = TENANT()) =>
    call<{ platforms: string[] }>(`/social/connected-channels/${tenantId}`),

  // Publish a stored post to its platform right now
  publishNow: (postId: string, tenantId = TENANT()) =>
    call<any>(`/social/posts/${tenantId}/${postId}/publish-now`, { method: 'POST' }),

  // Re-queue a failed post
  retryPost: (postId: string, tenantId = TENANT()) =>
    call<{ success: boolean }>(`/social/posts/${tenantId}/${postId}/retry`, { method: 'POST' }),

  generateTrendAlert: (topic: string, tenantId = TENANT()) =>
    call<any>('/social/trend-alert', {
      method: 'POST',
      body: JSON.stringify({ tenantId, topic }),
    }),

  // ─── Front Desk ──────────────────────────────────────────────────────────

  answerFAQ: (question: string, tenantId = TENANT()) =>
    call<{ answer: string }>('/frontdesk/faq', {
      method: 'POST',
      body: JSON.stringify({ tenantId, question }),
    }),

  saveFAQ: (question: string, answer: string, category: string, tenantId = TENANT()) =>
    call<any>('/frontdesk/faqs', {
      method: 'POST',
      body: JSON.stringify({ tenantId, question, answer, category }),
    }),

  getFAQs: (tenantId = TENANT()) =>
    call<any[]>(`/frontdesk/faqs/${tenantId}`),

  deleteFAQ: (faqId: string, tenantId = TENANT()) =>
    call<void>(`/frontdesk/faqs/${tenantId}/${faqId}`, { method: 'DELETE' }),

  createBooking: (booking: Record<string, any>, tenantId = TENANT()) =>
    call<any>('/frontdesk/bookings', {
      method: 'POST',
      body: JSON.stringify({ tenantId, ...booking }),
    }),

  getBookings: (tenantId = TENANT()) =>
    call<any[]>(`/frontdesk/bookings/${tenantId}`),

  updateBookingStatus: (bookingId: string, status: string, tenantId = TENANT()) =>
    call<any>(`/frontdesk/bookings/${tenantId}/${bookingId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  createCase: (caseType: string, summary: string, tenantId = TENANT()) =>
    call<any>('/frontdesk/cases', {
      method: 'POST',
      body: JSON.stringify({ tenantId, caseType, summary }),
    }),

  getCases: (tenantId = TENANT()) =>
    call<any[]>(`/frontdesk/cases/${tenantId}`),

  escalateCase: (caseId: string, tenantId = TENANT()) =>
    call<any>(`/frontdesk/cases/${tenantId}/${caseId}/escalate`, { method: 'PATCH' }),

  resolveCase: (caseId: string, tenantId = TENANT()) =>
    call<any>(`/frontdesk/cases/${tenantId}/${caseId}/resolve`, { method: 'PATCH' }),
};
