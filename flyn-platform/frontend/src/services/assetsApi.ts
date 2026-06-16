import { authedFetch } from './authApi';

const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = `${envBase?.trim().replace(/\/$/, '') ?? 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api'}/assets`;

export interface AssetFile {
  tenantId: string;
  id: string;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  fileType: string;
  fileSize?: number;
  module: string;
  subType?: string;
  sourceId?: string;
  uploadedBy: string;
  uploadedAt: string;
  tags?: string[];
}

export const assetsApi = {
  // Step 1: get a presigned S3 URL
  getPresignedUrl: async (
    tenantId: string,
    params: { fileName: string; fileType: string; module: string },
  ): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string }> => {
    const res = await authedFetch(`${BASE}/presigned-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Failed to get upload URL');
    return res.json() as Promise<{ uploadUrl: string; fileKey: string; fileUrl: string }>;
  },

  // Step 2: upload file directly to S3 via presigned URL
  uploadToS3: async (uploadUrl: string, file: File): Promise<void> => {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
  },

  // Step 3: register metadata in DynamoDB
  registerAsset: async (
    tenantId: string,
    data: {
      fileName: string;
      fileKey: string;
      fileUrl: string;
      fileType: string;
      fileSize: number;
      module: string;
      subType?: string;
      sourceId?: string;
      uploadedBy: string;
      tags?: string[];
    },
  ): Promise<AssetFile> => {
    const res = await authedFetch(`${BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
      body: JSON.stringify({ ...data, tenantId }),
    });
    if (!res.ok) throw new Error('Failed to register asset');
    const json = await res.json() as { asset: AssetFile };
    return json.asset;
  },

  // Full upload flow (presign → S3 → register) in one call
  upload: async (
    tenantId: string,
    file: File,
    meta: { module: string; subType?: string; sourceId?: string; uploadedBy: string; tags?: string[] },
  ): Promise<AssetFile> => {
    const { uploadUrl, fileKey, fileUrl } = await assetsApi.getPresignedUrl(tenantId, {
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      module: meta.module,
    });
    await assetsApi.uploadToS3(uploadUrl, file);
    return assetsApi.registerAsset(tenantId, {
      fileName: file.name,
      fileKey,
      fileUrl,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      ...meta,
    });
  },

  listAssets: async (tenantId: string, module?: string): Promise<AssetFile[]> => {
    const url = module
      ? `${BASE}?module=${encodeURIComponent(module)}`
      : BASE;
    const res = await authedFetch(url, { headers: { 'x-tenant-id': tenantId } });
    if (!res.ok) return [];
    const json = await res.json() as { assets: AssetFile[] };
    return json.assets ?? [];
  },

  deleteAsset: async (tenantId: string, id: string): Promise<void> => {
    await authedFetch(`${BASE}/${id}`, {
      method: 'DELETE',
      headers: { 'x-tenant-id': tenantId },
    });
  },
};
