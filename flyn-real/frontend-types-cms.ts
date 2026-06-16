// frontend/src/types/cms.ts
export interface CMSCollection {
  id: string;
  name: string;
  displayName: string;
  fields: CMSField[];
  entries: CMSEntry[];
}

export interface CMSField {
  name: string;
  type: 'string' | 'text' | 'number' | 'boolean' | 'date' | 'json';
  required: boolean;
  description?: string;
}

export interface CMSEntry {
  id: string;
  data: Record<string, any>;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdAt?: string;
  updatedAt?: string;
}

export interface CMSSyncStatus {
  lastSync?: Date;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  message?: string;
}
