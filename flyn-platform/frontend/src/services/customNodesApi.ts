/**
 * Custom (AI) Nodes API client → /api/custom-nodes.
 * Backs the palette merge, revision history, and the promote-to-production gate.
 */
import { authedFetch } from '@/services/authApi';
import { API_BASE_URL } from '@/lib/api';

const BASE = `${API_BASE_URL}/custom-nodes`;

export interface CustomNodeField {
  name: string;
  label: string;
  type: 'text' | 'select' | 'textarea' | 'toggle' | 'number';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  default?: string | number | boolean;
}

export interface CustomNodeDef {
  nodeId: string;
  tenantId: string;
  kind: 'custom' | 'override';
  targetType?: string;
  label: string;
  description?: string;
  icon?: string;
  category?: string;
  schema: CustomNodeField[];
  status: 'draft' | 'testing' | 'tested' | 'live' | 'failed';
  environment: 'sandbox' | 'production';
  version: number;
  testSuite?: { cases: any[]; lastRun?: { at: string; passed: number; total: number; results: any[] } };
  publishedAt?: number;
  updatedAt: number;
}

const tid = () => localStorage.getItem('tenantId') || '';

export const customNodesApi = {
  listLive: () => authedFetch(`${BASE}?tenantId=${encodeURIComponent(tid())}`).then(r => r.json() as Promise<CustomNodeDef[]>),
  get: (nodeId: string) => authedFetch(`${BASE}/${nodeId}?tenantId=${encodeURIComponent(tid())}`).then(r => r.json() as Promise<CustomNodeDef>),
  revisions: (nodeId: string) => authedFetch(`${BASE}/${nodeId}/revisions?tenantId=${encodeURIComponent(tid())}`).then(r => r.json() as Promise<{ versions: number[] }>),
  runTests: (nodeId: string) => authedFetch(`${BASE}/${nodeId}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: tid() }) }).then(r => r.json()),
  /** The production gate — server refuses unless tested + a production-grade sandbox exists. */
  promote: (nodeId: string) => authedFetch(`${BASE}/${nodeId}/promote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: tid() }) }),
  rollback: (nodeId: string, version: number) => authedFetch(`${BASE}/${nodeId}/rollback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: tid(), version }) }).then(r => r.json()),
};
