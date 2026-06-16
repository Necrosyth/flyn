// ─── FLYN AI Website Builder — Frontend API Client ───────────────────────────

import { auth } from '@/lib/firebase';

const BASE = (import.meta.env.VITE_API_BASE_URL as string) || '';

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const u = auth.currentUser;
  if (!u) throw new Error('Not authenticated');
  const token = await u.getIdToken();

  // Use a longer timeout for website builder calls as AI generation can take time
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers as Record<string, string> ?? {})
      },
      signal: controller.signal,
      ...opts,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const e = await res.json().catch(() => ({})) as { message?: string; error?: string };
      throw new Error(e.message ?? e.error ?? `Error ${res.status}`);
    }
    return res.json() as Promise<T>;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('The operation timed out. AI generation is taking longer than expected. Please wait a moment and check "My Websites".');
    }
    throw err;
  }
}

export interface WebsiteTemplate {
  id:              string;
  name:            string;
  category:        string;
  industry:        string;
  purpose:         string;
  description:     string;
  defaultFeatures: Record<string, boolean>;
  colorHint:       string;
  fontHint:        string;
  pages:           string[];
  tags:            string[];
  popular?:        boolean;
  new?:            boolean;
}

export interface SavedWebsite {
  id:           string;
  businessName: string;
  industry:     string;
  purpose:      string;
  description:  string;
  html:         string;
  pageType:     string;
  title:        string;
  status:       'draft' | 'published';
  publishedUrl: string | null;
  publishedAt?: string;
  domainId:     string | null;
  templateId:   string | null;
  tokensUsed:   number;
  costUsd:      number;
  cmsMapping?:  Record<string, { collection: string; fieldMap: Record<string, string> }>;
  generatedAt:  string;
  createdAt:    { _seconds: number } | string;
  updatedAt:    { _seconds: number } | string;
}

export interface GenerateInput {
  businessName:  string;
  industry:      string;
  purpose:       string;
  description:   string;
  location?:     string;
  colorScheme?:  string;
  fontStyle?:    string;
  features:      Record<string, boolean>;
  templateId?:   string;
  pageType?:     string;
  quality?:      'standard' | 'premium';
  additionalContext?: string;
  // for regeneration
  websiteId?:    string;
  action?:       'generate' | 'regenerate_section' | 'add_page';
  sectionId?:    string;
  instruction?:  string;
  cssVariables?: string;
}

export interface GenerateResult {
  success:         boolean;
  websiteId:       string;
  html:            string;
  title:           string;
  tokensUsed:      number;
  costUsd:         number;
  remainingBalance?: number;
}

export interface ProposeResult {
  proposal:        string;
  credits:         number;
  currentBalance:  number;
  proposalId:      string;
}

export interface RefineProposalResult {
  proposal:        string;
  credits:         number;
  currentBalance:  number;
}

export interface CreditsBalance {
  balance:         number;
  totalPurchased:  number;
  totalUsed:       number;
  planTier:        string;
  transactions:    Array<{
    id:            string;
    type:          'purchase' | 'usage' | 'refund';
    amount:        number;
    reason?:       string;
    websiteId?:    string;
    timestamp:     string;
  }>;
}

// ── Website Builder API ───────────────────────────────────────────────────────
// NOTE: BASE already includes /api (VITE_API_BASE_URL=https://...apprunner.com/api)
// so paths here must NOT start with /api
export const websiteBuilderApi = {
  // Templates
  listTemplates: (params?: { q?: string; category?: string; popular?: boolean }) =>
    req<{ templates: WebsiteTemplate[]; total: number; categories: string[]; pageTypes: string[] }>(
      `/website-builder/templates?${new URLSearchParams(params as Record<string, string> ?? {})}`
    ),

  // Credits
  getCredits: () => req<CreditsBalance>('/website-builder/credits'),

  // Website CRUD
  listWebsites: () => req<{ websites: SavedWebsite[]; total: number }>('/website-builder'),
  getWebsite:   (id: string) => req<SavedWebsite>(`/website-builder/${id}`),
  updateWebsite:(id: string, data: Partial<SavedWebsite>) =>
    req<{ success: boolean }>(`/website-builder/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteWebsite:(id: string) =>
    req<{ success: boolean }>(`/website-builder/${id}`, { method: 'DELETE' }),

  // AI Proposal (shows what will be created + cost, no generation)
  propose: (input: GenerateInput) =>
    req<ProposeResult>('/website-builder/propose', { method: 'POST', body: JSON.stringify(input) }),

  // Get draft proposal (if exists)
  getDraftProposal: () =>
    req<ProposeResult | null>('/website-builder/drafts'),

  // Refine proposal with AI chat
  refineProposal: (proposalId: string, message: string) =>
    req<RefineProposalResult>(`/website-builder/proposals/${proposalId}/refine`, { method: 'POST', body: JSON.stringify({ message }) }),

  // AI Generation (~$0.02–0.04 per call with Haiku) — deducts credits
  generate: (input: GenerateInput) =>
    req<GenerateResult>('/website-builder/generate', { method: 'POST', body: JSON.stringify(input) }),

  // Publish
  publish: (websiteId: string) =>
    req<{ success: boolean; url: string; message?: string }>(
      '/website-builder/publish', { method: 'POST', body: JSON.stringify({ websiteId }) }
    ),

  // Sync with CMS
  syncCms: (websiteId: string) =>
    req<{ success: boolean; html: string }> (
      `/website-builder/${websiteId}/sync-cms`, { method: 'POST' }
    ),

  // AI chat revision
  chat: (body: { messages: any[]; html: string; websiteId?: string; selectedId?: string }) =>
    req<{ success: boolean; html: string; reply: string }>(
      `/website-builder/chat`, { method: 'POST', body: JSON.stringify(body) }
    ),

  // AI Form Creator
  generateForm: (input: { prompt: string; businessName?: string; style?: string }) =>
    req<{ success: boolean; html: string; fields: any[] }>('/website-builder/generate-form', { method: 'POST', body: JSON.stringify(input) }),

  // Publish a form so it has a public shareable URL
  publishForm: (formId: string, html: string, name?: string) =>
    req<{ url: string }>('/website-builder/forms/publish', { method: 'POST', body: JSON.stringify({ formId, html, name }) }),

  // List form submissions
  listFormSubmissions: (formId: string) =>
    req<any[]>(`/website-builder/forms/${formId}/submissions`),
};
