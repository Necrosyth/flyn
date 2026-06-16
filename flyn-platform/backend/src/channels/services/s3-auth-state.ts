import { Logger } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

const logger = new Logger('S3AuthState');

/**
 * Creates a Baileys-compatible auth state backed by AWS S3.
 *
 * This replaces `useMultiFileAuthState` for production so that
 * WhatsApp QR sessions survive container restarts, ECS deployments,
 * and auto-scaling events.
 *
 * Each credential file is stored as:
 *   s3://{bucket}/{prefix}/{filename}.json
 *
 * Required AWS permissions on the ECS Task Role:
 *   - s3:GetObject
 *   - s3:PutObject
 *   - s3:DeleteObject
 *   - s3:ListObjectsV2
 * on the bucket/prefix.
 */
export async function useS3AuthState(
  s3: S3Client,
  bucket: string,
  prefix: string,
): Promise<{
  state: { creds: any; keys: any };
  saveCreds: () => Promise<void>;
}> {
  // ── Helpers ─────────────────────────────────────────────────────────────

  const keyFor = (file: string) => `${prefix}/${file}.json`;

  const readFile = async (file: string): Promise<any | null> => {
    try {
      const res = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: keyFor(file) }),
      );
      const body = await res.Body?.transformToString();
      return body ? JSON.parse(body) : null;
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      logger.warn(`[S3AuthState] read ${file}: ${err.message}`);
      return null;
    }
  };

  const writeFile = async (file: string, data: any): Promise<void> => {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: keyFor(file),
          Body: JSON.stringify(data),
          ContentType: 'application/json',
        }),
      );
    } catch (err: any) {
      logger.error(`[S3AuthState] write ${file}: ${err.message}`);
    }
  };

  const deleteFile = async (file: string): Promise<void> => {
    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: keyFor(file) }),
      );
    } catch { /* non-fatal */ }
  };

  // ── Load existing creds from S3 ──────────────────────────────────────────

  // Dynamically import Baileys to get the correct initAuthCreds shape
  const {
    initAuthCreds,
    BufferJSON,
    proto,
  } = await import('@whiskeysockets/baileys') as any;

  let creds = await readFile('creds');
  if (!creds) {
    creds = initAuthCreds();
    logger.log(`[S3AuthState] No existing creds at ${prefix} — created fresh`);
  } else {
    // Baileys creds may contain Buffer-encoded values — deserialise them
    try {
      creds = JSON.parse(JSON.stringify(creds), BufferJSON.reviver);
    } catch { /* use as-is */ }
    logger.log(`[S3AuthState] Loaded existing creds from s3://${bucket}/${prefix}/creds.json`);
  }

  // ── Keys store ───────────────────────────────────────────────────────────
  // Baileys uses a key-value store for pre-keys, session keys, etc.
  // We implement the same interface but backed by S3.

  const keys: Record<string, Record<string, any>> = {};

  const keysState = {
    get: async (type: string, ids: string[]) => {
      const data: Record<string, any> = {};
      await Promise.all(
        ids.map(async (id) => {
          let value = keys[type]?.[id];
          if (!value) {
            value = await readFile(`keys/${type}-${id}`);
            if (value) {
              try {
                value = JSON.parse(JSON.stringify(value), BufferJSON.reviver);
              } catch { /* use as-is */ }
              if (!keys[type]) keys[type] = {};
              keys[type][id] = value;
            }
          }
          if (value) data[id] = value;
        }),
      );
      return data;
    },
    set: async (dataMap: Record<string, Record<string, any>>) => {
      const tasks: Promise<void>[] = [];
      for (const [type, typeData] of Object.entries(dataMap)) {
        for (const [id, value] of Object.entries(typeData)) {
          if (value) {
            if (!keys[type]) keys[type] = {};
            keys[type][id] = value;
            tasks.push(writeFile(`keys/${type}-${id}`, JSON.parse(JSON.stringify(value, BufferJSON.replacer))));
          } else {
            if (keys[type]) delete keys[type][id];
            tasks.push(deleteFile(`keys/${type}-${id}`));
          }
        }
      }
      await Promise.all(tasks);
    },
  };

  // ── saveCreds ────────────────────────────────────────────────────────────

  const saveCreds = async () => {
    await writeFile('creds', JSON.parse(JSON.stringify(creds, BufferJSON.replacer)));
    logger.debug(`[S3AuthState] Saved creds to s3://${bucket}/${prefix}/creds.json`);
  };

  return {
    state: { creds, keys: keysState },
    saveCreds,
  };
}

/**
 * Delete all auth files for a session from S3 (called on logout/disconnect).
 */
export async function deleteS3AuthState(
  s3: S3Client,
  bucket: string,
  prefix: string,
): Promise<void> {
  try {
    const list = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/` }),
    );
    if (!list.Contents?.length) return;
    await Promise.all(
      list.Contents.map((obj) =>
        s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key! })),
      ),
    );
    logger.log(`[S3AuthState] Deleted session files at s3://${bucket}/${prefix}/`);
  } catch (err: any) {
    logger.warn(`[S3AuthState] cleanup error: ${err.message}`);
  }
}
