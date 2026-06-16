import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../firebase/firebase.service';
import { CustomNodeDef } from './custom-node.types';

/**
 * Persistence for AI-authored / AI-patched node definitions.
 * Path: custom_node_defs/{tenantId}/defs/{nodeId}
 * Every save snapshots to custom_node_defs/{tenantId}/defs/{nodeId}/revisions/{version}
 * so the builder can show history and roll back with one click.
 */
@Injectable()
export class CustomNodeDefsService {
  private readonly logger = new Logger(CustomNodeDefsService.name);
  private readonly ROOT = 'custom_node_defs';

  constructor(private readonly firebase: FirebaseService) {}

  private defsCol(tenantId: string) {
    const db = this.firebase.firestore();
    if (!db) return undefined;
    return db.collection(this.ROOT).doc(tenantId).collection('defs');
  }

  /** Fetch a single def for a tenant (used by the executor at run time). */
  async get(tenantId: string, nodeId: string): Promise<CustomNodeDef | null> {
    const col = this.defsCol(tenantId);
    if (!col) return null;
    const doc = await col.doc(nodeId).get();
    return doc.exists ? (doc.data() as CustomNodeDef) : null;
  }

  /** All live defs for a tenant — feeds the frontend useNodeSchemas() merge. */
  async listLive(tenantId: string): Promise<CustomNodeDef[]> {
    const col = this.defsCol(tenantId);
    if (!col) return [];
    const snap = await col.where('status', '==', 'live').limit(500).get();
    return snap.docs.map((d) => d.data() as CustomNodeDef);
  }

  /** Create/replace a def + snapshot the new version into revisions. */
  async save(def: CustomNodeDef): Promise<CustomNodeDef> {
    const col = this.defsCol(def.tenantId);
    if (!col) throw new Error('Firestore unavailable');
    const prev = await this.get(def.tenantId, def.nodeId);
    const version = (prev?.version ?? 0) + 1;
    const next: CustomNodeDef = { ...def, version, updatedAt: Date.now(), createdAt: prev?.createdAt ?? Date.now() };
    await col.doc(def.nodeId).set(next, { merge: true });
    await col.doc(def.nodeId).collection('revisions').doc(String(version)).set(next);
    return next;
  }

  /** List revision numbers (newest first) for the rollback UI. */
  async listRevisions(tenantId: string, nodeId: string): Promise<number[]> {
    const col = this.defsCol(tenantId);
    if (!col) return [];
    const snap = await col.doc(nodeId).collection('revisions').get();
    return snap.docs.map((d) => Number(d.id)).sort((a, b) => b - a);
  }

  /** Roll back: re-point the live def to a prior revision (itself a new version). */
  async rollback(tenantId: string, nodeId: string, toVersion: number): Promise<CustomNodeDef> {
    const col = this.defsCol(tenantId);
    if (!col) throw new Error('Firestore unavailable');
    const rev = await col.doc(nodeId).collection('revisions').doc(String(toVersion)).get();
    if (!rev.exists) throw new Error(`Revision ${toVersion} not found`);
    return this.save(rev.data() as CustomNodeDef);
  }
}
