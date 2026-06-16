export type CmsFieldType = 'text' | 'textarea' | 'image' | 'number' | 'url' | 'boolean' | 'date';

export interface CmsField {
  name: string;        // e.g. "fullName"
  label: string;       // e.g. "Full Name"
  type: CmsFieldType;
  required: boolean;
}

export interface CmsCollection {
  id: string;
  tenantId: string;
  websiteId: string;   // Linked to specific site
  sectionId: string;   // Linked to specific <section id="...">
  name: string;        // e.g. "Our Team"
  slug: string;        // e.g. "team"
  fields: CmsField[];
  createdAt: string;
  updatedAt: string;
}

export interface CmsRecord {
  id: string;
  tenantId: string;
  collectionId: string;
  data: Record<string, any>; // JSON data matching collection fields
  order: number;
  createdAt: string;
  updatedAt: string;
}
