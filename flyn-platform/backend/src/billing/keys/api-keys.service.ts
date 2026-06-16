import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { FirebaseService } from '../../firebase/firebase.service';

export type UserRole = 'owner' | 'admin' | 'manager' | 'agent';

// Scopes each role is permitted to grant on a key they create.
// 'owner' and 'admin' can grant any scope.
const ROLE_ALLOWED_SCOPES: Record<UserRole, string[] | '*'> = {
  owner: '*',
  admin: '*',
  manager: [
    'crm:read', 'crm:write',
    'hr:read',
    'agents:read',
    'automations:run',
    'channels:manage',
    'inbox:read', 'inbox:write',
  ],
  agent: [
    'crm:read',
    'agents:read',
    'inbox:read',
  ],
};

function capScopes(requested: string[], role: UserRole): string[] {
  const allowed = ROLE_ALLOWED_SCOPES[role] ?? [];
  if (allowed === '*') return requested;
  // read:all / write:all shortcuts — only owner/admin may request them
  return requested.filter((s) => allowed.includes(s));
}

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  createdByUid: string;
  creatorRole: UserRole;
  name: string;
  keyHash: string;
  keyPreview: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt?: number;
  status: 'active' | 'revoked';
  revokedAt?: number;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  /** Full key — only populated on creation; empty string on list. */
  key: string;
  keyPreview: string;
  scopes: string[];
  createdByUid: string;
  creatorRole: UserRole;
  createdAt: string;
  lastUsedAt?: string;
  status: 'active' | 'revoked';
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  private readonly COLLECTION = 'api_keys';

  constructor(private readonly firebase: FirebaseService) {}

  /**
   * List keys for the tenant.
   * - owner/admin: see all keys in the org
   * - manager/agent: see only keys they created
   */
  async listKeys(tenantId: string, callerUid: string, callerRole: UserRole): Promise<ApiKeyResponse[]> {
    const db = this.firebase.firestore();
    if (!db) return [];

    // Always filter by tenantId; admins+ see all, others see only their own
    let query = db.collection(this.COLLECTION).where('tenantId', '==', tenantId);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      query = query.where('createdByUid', '==', callerUid) as any;
    }

    const snap = await query.get();

    return snap.docs
      .map((doc) => this.toResponse(doc.data() as ApiKeyRecord, ''))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createKey(
    tenantId: string,
    createdByUid: string,
    creatorRole: UserRole,
    name: string,
    requestedScopes: string[],
  ): Promise<ApiKeyResponse> {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Database not available');

    // Cap scopes to what this role is allowed to grant
    const scopes = capScopes(requestedScopes, creatorRole);
    if (scopes.length === 0) {
      // Fallback: give them the minimum read scope rather than a useless empty key
      scopes.push(...capScopes(['crm:read'], creatorRole));
    }

    const rawKey = `sk_live_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPreview = `sk_live_${'•'.repeat(8)}${rawKey.slice(-4)}`;

    const id = `key_${randomBytes(8).toString('hex')}`;
    const now = Date.now();

    const record: ApiKeyRecord = {
      id,
      tenantId,
      createdByUid,
      creatorRole,
      name,
      keyHash,
      keyPreview,
      scopes,
      createdAt: now,
      status: 'active',
    };

    await db.collection(this.COLLECTION).doc(id).set(record);
    this.logger.log(`API key created by uid=${createdByUid} role=${creatorRole} tenant=${tenantId}: ${id} scopes=${scopes.join(',')}`);

    return this.toResponse(record, rawKey);
  }

  async revokeKey(id: string, tenantId: string, callerUid: string, callerRole: UserRole): Promise<void> {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Database not available');

    const doc = await db.collection(this.COLLECTION).doc(id).get();
    if (!doc.exists) throw new NotFoundException(`API key ${id} not found`);

    const data = doc.data() as ApiKeyRecord;
    if (data.tenantId !== tenantId) {
      throw new ForbiddenException('Cannot revoke a key that does not belong to your organisation');
    }

    // Non-admins can only revoke their own keys
    if (callerRole !== 'owner' && callerRole !== 'admin' && data.createdByUid !== callerUid) {
      throw new ForbiddenException('You can only revoke your own API keys');
    }

    if (data.status === 'revoked') return;

    await db.collection(this.COLLECTION).doc(id).update({
      status: 'revoked',
      revokedAt: Date.now(),
    });

    this.logger.log(`API key ${id} revoked by uid=${callerUid} tenant=${tenantId}`);
  }

  async validateKey(rawKey: string): Promise<ApiKeyRecord | null> {
    const db = this.firebase.firestore();
    if (!db) return null;

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const snap = await db
      .collection(this.COLLECTION)
      .where('keyHash', '==', keyHash)
      .limit(1)
      .get();

    if (snap.empty) return null;

    const doc = snap.docs[0];
    const record = doc.data() as ApiKeyRecord;
    if (record.status !== 'active') return null;

    await doc.ref.update({ lastUsedAt: Date.now() });
    return { ...record, lastUsedAt: Date.now() };
  }

  private toResponse(record: ApiKeyRecord, fullKey: string): ApiKeyResponse {
    return {
      id: record.id,
      name: record.name,
      key: fullKey,
      keyPreview: record.keyPreview,
      scopes: record.scopes,
      createdByUid: record.createdByUid ?? '',
      creatorRole: record.creatorRole ?? 'agent',
      createdAt: new Date(record.createdAt).toISOString(),
      lastUsedAt: record.lastUsedAt
        ? new Date(record.lastUsedAt).toISOString()
        : undefined,
      status: record.status,
    };
  }
}
