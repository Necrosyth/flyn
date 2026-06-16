// frontend/src/types/api.ts
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role: string;
  emailVerified?: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  platform: string;
  domain?: string;
  customDomain?: string;
  status: DeploymentStatus;
  deploymentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export enum DeploymentStatus {
  PENDING = 'PENDING',
  DEPLOYING = 'DEPLOYING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface CMSCollection {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  fields: CMSField[];
  entries: CMSEntry[];
}

export interface CMSField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface CMSEntry {
  id: string;
  data: Record<string, any>;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}
