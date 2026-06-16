import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../firebase/firebase.service';
import { ScopedNodeContext, ScopedDb, ScopedCollection } from './custom-node.types';

/**
 * Builds the capability-scoped ScopedNodeContext handed to AI-authored code.
 * This is the PRIMARY security boundary: the returned object only exposes
 * operations bound to a single tenant + acting user. Generated code cannot
 * address another tenant because no capability to do so exists on the object.
 */
@Injectable()
export class ScopedContextService {
  private readonly logger = new Logger(ScopedContextService.name);

  // Deny-by-default outbound allow-list for ctx.httpFetch. Tighten per-tenant later.
  private readonly EGRESS_DENY_BY_DEFAULT = true;
  private readonly ALLOWED_HOSTS = new Set<string>([]); // populate per policy

  constructor(private readonly firebase: FirebaseService) {}

  build(params: {
    tenantId: string;
    actorUserId?: string;
    inputs: Record<string, unknown>;
    log: (level: string, message: string, data?: unknown) => void;
    getSecret: (key: string) => Promise<string | undefined>;
  }): ScopedNodeContext {
    const { tenantId, actorUserId, inputs, log, getSecret } = params;

    return {
      inputs,
      tenantId,
      actorUserId,
      db: this.buildScopedDb(tenantId),
      secrets: { get: (key) => getSecret(key) },
      httpFetch: (url, init) => this.scopedHttpFetch(tenantId, url, init),
      callFlynApi: async () => {
        // Wired in a later phase to an internal, tenant/user-scope-checked caller.
        throw new Error('callFlynApi not yet provisioned');
      },
      log: (level, message, data) => log(level, message, data),
    };
  }

  /** Firestore handle whose every read/write is forced into the tenant namespace. */
  private buildScopedDb(tenantId: string): ScopedDb {
    const db = this.firebase.firestore();
    return {
      collection: (name: string): ScopedCollection => {
        if (!db) {
          // No Firestore → inert collection (reads empty, writes throw).
          return {
            find: async () => [],
            get: async () => null,
            add: async () => { throw new Error('Firestore unavailable'); },
            update: async () => { throw new Error('Firestore unavailable'); },
          };
        }
        const col = db.collection(name);
        return {
          find: async (where = {}, limit = 100) => {
            let q: FirebaseFirestore.Query = col.where('tenantId', '==', tenantId);
            for (const [k, v] of Object.entries(where)) {
              if (k === 'tenantId') continue; // cannot override the tenant filter
              q = q.where(k, '==', v as any);
            }
            const snap = await q.limit(Math.min(limit, 500)).get();
            return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
          },
          get: async (id: string) => {
            const doc = await col.doc(id).get();
            if (!doc.exists) return null;
            const data = doc.data() as Record<string, unknown>;
            // Enforce tenant ownership on single-doc reads.
            if (data.tenantId && data.tenantId !== tenantId) return null;
            return { id: doc.id, ...data };
          },
          add: async (docData: Record<string, unknown>) => {
            // tenantId is force-stamped; a doc-supplied tenantId is ignored.
            const ref = await col.add({ ...docData, tenantId, createdAt: Date.now() });
            return { id: ref.id };
          },
          update: async (id: string, patch: Record<string, unknown>) => {
            const doc = await col.doc(id).get();
            const data = doc.data() as Record<string, unknown> | undefined;
            if (!doc.exists || (data?.tenantId && data.tenantId !== tenantId)) {
              throw new Error('Not found in tenant scope');
            }
            const { tenantId: _ignore, ...safe } = patch; // cannot reassign tenant
            await col.doc(id).update({ ...safe, updatedAt: Date.now() });
          },
        };
      },
    };
  }

  private async scopedHttpFetch(
    tenantId: string,
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<{ status: number; body: string }> {
    let host: string;
    try { host = new URL(url).host; } catch { throw new Error(`Invalid URL: ${url}`); }
    if (this.EGRESS_DENY_BY_DEFAULT && !this.ALLOWED_HOSTS.has(host)) {
      throw new Error(`Egress to ${host} is not allow-listed`);
    }
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: init?.method || 'GET',
        headers: init?.headers,
        body: init?.body,
        signal: ac.signal,
      });
      return { status: res.status, body: await res.text() };
    } finally {
      clearTimeout(t);
    }
  }
}
