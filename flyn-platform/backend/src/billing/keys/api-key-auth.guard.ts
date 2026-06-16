import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Request } from 'express';
import { FirebaseService } from '../../firebase/firebase.service';
import type { ApiKeyRecord } from './api-keys.service';

/**
 * ApiKeyAuthGuard
 *
 * Accepts developer API keys (sk_live_*) issued via the Developer Portal.
 *
 * Usage: @UseGuards(ApiKeyAuthGuard) on routes that should allow both
 * Firebase-authenticated users AND external apps using developer API keys.
 *
 * The guard reads the Authorization header:
 *   Authorization: Bearer sk_live_<hex>
 *
 * It hashes the key with SHA-256 and looks up the `api_keys` Firestore
 * collection. If the key is found, active, and belongs to a tenant, the
 * tenantId is attached to the request as `req.apiKeyTenantId`.
 *
 * Security notes:
 *  - Only the SHA-256 hash is stored in Firestore; the raw key is never saved.
 *  - A revoked key is rejected immediately.
 *  - lastUsedAt is updated on each successful validation.
 */
export interface ApiKeyRequest extends Request {
  apiKeyTenantId?: string;
  apiKeyScopes?: string[];
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyAuthGuard.name);
  private readonly COLLECTION = 'api_keys';

  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiKeyRequest>();
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7).trim();

    // Only handle developer API keys; Firebase tokens are handled by FirebaseAuthGuard
    if (!token.startsWith('sk_live_')) {
      throw new UnauthorizedException('Invalid API key format. Developer keys start with sk_live_');
    }

    const keyHash = createHash('sha256').update(token).digest('hex');

    const db = this.firebase.firestore();
    if (!db) {
      this.logger.error('Firestore not available — cannot validate API key');
      throw new UnauthorizedException('Service temporarily unavailable');
    }

    const snap = await db
      .collection(this.COLLECTION)
      .where('keyHash', '==', keyHash)
      .limit(1)
      .get();

    if (snap.empty) {
      throw new UnauthorizedException('Invalid API key');
    }

    const keyDoc = snap.docs[0];
    const record = keyDoc.data() as ApiKeyRecord;

    if (record.status !== 'active') {
      throw new UnauthorizedException('API key has been revoked');
    }

    // Attach tenant context to the request
    req.apiKeyTenantId = record.tenantId;
    req.apiKeyScopes = record.scopes;

    // Update lastUsedAt asynchronously — don't block the request
    keyDoc.ref.update({ lastUsedAt: Date.now() }).catch((err: Error) => {
      this.logger.warn(`Failed to update lastUsedAt for key ${record.id}: ${err.message}`);
    });

    this.logger.debug(`API key ${record.id} authenticated for tenant ${record.tenantId}`);
    return true;
  }
}
