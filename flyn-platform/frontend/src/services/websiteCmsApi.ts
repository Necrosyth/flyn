import { authedFetch } from "@/services/authApi";
const BASE = (import.meta.env.VITE_API_BASE_URL as string) || '';

export interface CmsField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'image' | 'number' | 'url' | 'boolean' | 'date';
  required: boolean;
}

export interface CmsCollection {
  id: string;
  websiteId: string;
  sectionId: string;
  name: string;
  slug: string;
  fields: CmsField[];
}

export interface CmsRecord {
  id: string;
  collectionId: string;
  data: Record<string, any>;
  order: number;
}

export const websiteCmsApi = {
  listCollections: (websiteId?: string) =>
    authedFetch(`${BASE}/website-builder/cms/collections${websiteId ? `?websiteId=${websiteId}` : ''}`).then(res => res.json() as Promise<CmsCollection[]>),

  createCollection: (data: Omit<CmsCollection, 'id'>) =>
    authedFetch(`${BASE}/website-builder/cms/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => res.json() as Promise<CmsCollection>),

  deleteCollection: (id: string) =>
    authedFetch(`${BASE}/website-builder/cms/collections/${id}`, { method: 'DELETE' }).then(res => res.json()),

  listRecords: (colId: string) =>
    authedFetch(`${BASE}/website-builder/cms/collections/${colId}/records`).then(res => res.json() as Promise<CmsRecord[]>),

  createRecord: (colId: string, data: Record<string, any>, order = 0) =>
    authedFetch(`${BASE}/website-builder/cms/collections/${colId}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, order }),
    }).then(res => res.json() as Promise<CmsRecord>),

  updateRecord: (id: string, data: Record<string, any>) =>
    authedFetch(`${BASE}/website-builder/cms/records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    }).then(res => res.json()),

  deleteRecord: (id: string) =>
    authedFetch(`${BASE}/website-builder/cms/records/${id}`, { method: 'DELETE' }).then(res => res.json()),
};
