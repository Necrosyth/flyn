import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET = process.env.ASSETS_S3_BUCKET || 'flyn-assets-786150347998';
const TABLE  = process.env.ASSETS_DYNAMO_TABLE || 'flyn-asset-files';

export interface AssetFile {
  tenantId: string;
  id: string;
  fileName: string;
  fileKey: string;       // S3 object key
  fileUrl: string;       // public/presigned URL
  fileType: string;      // MIME type
  fileSize?: number;     // bytes
  module: string;        // 'Accounting' | 'HR' | 'Contracts' | etc.
  subType?: string;      // 'invoice' | 'cv' | 'contract' | 'receipt' | etc.
  sourceId?: string;     // ID of the linked record (e.g. invoiceId)
  uploadedBy: string;    // user displayName or email
  uploadedAt: string;    // ISO timestamp
  tags?: string[];
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  // requestChecksumCalculation: WHEN_REQUIRED keeps the SDK from injecting an
  // x-amz-checksum-crc32 into presigned PUT URLs, which browser-direct uploads can't satisfy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private s3 = new S3Client({ region: REGION, requestChecksumCalculation: 'WHEN_REQUIRED' } as any) as any;

  private ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  // ── Presigned Upload URL ───────────────────────────────────────────────────

  async getPresignedUploadUrl(params: {
    tenantId: string;
    fileName: string;
    fileType: string;
    module: string;
  }): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string }> {
    const ext = params.fileName.split('.').pop() ?? 'bin';
    const fileKey = `${params.tenantId}/${params.module.toLowerCase()}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;

    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileKey,
      ContentType: params.fileType,
    });

    const uploadUrl = await getSignedUrl(this.s3, cmd, { expiresIn: 300 }); // 5 min
    const fileUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${fileKey}`;

    return { uploadUrl, fileKey, fileUrl };
  }

  /**
   * Server-side upload of bytes already in memory (e.g. an email attachment Buffer from
   * mailparser, which the browser-direct presigned-PUT flow can't handle). Returns the S3 key +
   * private bucket URL; serve it later via presignDownload/getFetchableUrl. Mirrors the key shape
   * of getPresignedUploadUrl so deleteByUrl / getFetchableUrl work identically.
   */
  async uploadBuffer(params: {
    tenantId: string;
    fileName: string;
    contentType: string;
    body: Buffer | Uint8Array;
    module: string;
  }): Promise<{ fileKey: string; fileUrl: string; fileSize: number }> {
    const ext = params.fileName.split('.').pop() ?? 'bin';
    const fileKey = `${params.tenantId}/${params.module.toLowerCase()}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    await this.s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileKey,
      Body: params.body,
      ContentType: params.contentType,
    }));
    const fileUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${fileKey}`;
    return { fileKey, fileUrl, fileSize: (params.body as any)?.length ?? 0 };
  }

  /**
   * Presigned GET for a known S3 KEY (not a URL). Used by the inbox attachment-download endpoint;
   * the caller MUST verify the key belongs to the tenant first (key is prefixed with `${tenantId}/`).
   */
  async presignDownload(fileKey: string, expiresIn = 600): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: BUCKET, Key: fileKey }), { expiresIn });
  }

  /**
   * Turn a private S3 object URL (from getPresignedUploadUrl().fileUrl) into a
   * short-lived presigned GET URL that an external consumer (e.g. WhatsApp/Baileys)
   * can actually fetch. Non-bucket URLs are passed through unchanged.
   */
  async getFetchableUrl(fileUrl: string, expiresIn = 600): Promise<string> {
    try {
      const u = new URL(fileUrl);
      if (!u.hostname.startsWith(`${BUCKET}.s3`)) return fileUrl; // already-public / external URL
      const key = decodeURIComponent(u.pathname.replace(/^\//, ''));
      if (!key) return fileUrl;
      return await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
    } catch {
      return fileUrl;
    }
  }

  /**
   * Delete an S3 object given its bucket URL (the fileUrl stored on a message). Used by
   * conversation-delete to remove attachments. No-op for non-bucket/external URLs. Best-effort.
   */
  async deleteByUrl(fileUrl: string): Promise<void> {
    const u = new URL(fileUrl);
    if (!u.hostname.startsWith(`${BUCKET}.s3`)) return; // external URL — nothing of ours to delete
    const key = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (!key) return;
    await this.s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    this.logger.log(`Asset deleted by URL: ${key}`);
  }

  // ── Register asset after upload ────────────────────────────────────────────

  async registerAsset(data: Omit<AssetFile, 'id' | 'uploadedAt'>): Promise<AssetFile> {
    const asset: AssetFile = {
      ...data,
      id: `af_${Date.now()}_${randomUUID().slice(0, 8)}`,
      uploadedAt: new Date().toISOString(),
    };

    await this.ddb.send(new PutCommand({ TableName: TABLE, Item: asset }));
    this.logger.log(`Asset registered: ${asset.id} (${asset.module} / ${asset.fileName})`);
    return asset;
  }

  // ── List assets for tenant ─────────────────────────────────────────────────

  async listAssets(tenantId: string, module?: string): Promise<AssetFile[]> {
    if (module) {
      const res = await this.ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'module-uploadedAt-index',
        KeyConditionExpression: 'tenantId = :t AND #mod = :m',
        ExpressionAttributeNames: { '#mod': 'module' },
        ExpressionAttributeValues: { ':t': tenantId, ':m': module },
        ScanIndexForward: false,
        Limit: 500,
      }));
      return (res.Items ?? []) as AssetFile[];
    }

    const res = await this.ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'uploadedAt-index',
      KeyConditionExpression: 'tenantId = :t',
      ExpressionAttributeValues: { ':t': tenantId },
      ScanIndexForward: false,
      Limit: 500,
    }));
    return (res.Items ?? []) as AssetFile[];
  }

  // ── Get single asset ───────────────────────────────────────────────────────

  async getAsset(tenantId: string, id: string): Promise<AssetFile> {
    const res = await this.ddb.send(new GetCommand({ TableName: TABLE, Key: { tenantId, id } }));
    if (!res.Item) throw new NotFoundException(`Asset ${id} not found`);
    return res.Item as AssetFile;
  }

  // ── Fetch text content of a file from S3 ──────────────────────────────────

  async fetchTextContent(asset: AssetFile): Promise<string | null> {
    const isText = asset.fileType.startsWith('text/') ||
                   asset.fileType.includes('markdown') ||
                   asset.fileType === 'application/json';
    if (!isText) return null;

    try {
      const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: asset.fileKey });
      const url = await getSignedUrl(this.s3, cmd, { expiresIn: 60 });
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      return text.slice(0, 20_000); // cap at 20KB per doc
    } catch (err) {
      this.logger.warn(`fetchTextContent failed for ${asset.id}: ${(err as Error).message}`);
      return null;
    }
  }

  // ── Build AI Training Docs context block for chatbot ──────────────────────

  async getAITrainingDocsContext(tenantId: string): Promise<string> {
    let docs: AssetFile[];
    try {
      docs = await this.listAssets(tenantId, 'ai-training-docs');
    } catch {
      return '';
    }
    if (docs.length === 0) return '';

    const parts: string[] = [];
    for (const doc of docs.slice(0, 10)) {
      const content = await this.fetchTextContent(doc);
      if (content) {
        parts.push(`### ${doc.fileName}\n${content}`);
      } else {
        parts.push(`### ${doc.fileName} [${doc.fileType}]`);
      }
    }

    return `[CUSTOM BUSINESS DOCUMENTS — Use these when answering questions about this business's specific policies, procedures, FAQs, or services]\n${parts.join('\n\n')}`;
  }

  // ── Delete asset ───────────────────────────────────────────────────────────

  async deleteAsset(tenantId: string, id: string): Promise<void> {
    const asset = await this.getAsset(tenantId, id);

    // Delete from S3
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: asset.fileKey }));
    } catch (err) {
      this.logger.warn(`S3 delete failed for ${asset.fileKey}: ${(err as Error).message}`);
    }

    // Delete metadata from DynamoDB
    await this.ddb.send(new DeleteCommand({ TableName: TABLE, Key: { tenantId, id } }));
    this.logger.log(`Asset deleted: ${id}`);
  }
}
