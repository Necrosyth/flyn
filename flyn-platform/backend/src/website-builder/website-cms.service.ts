import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseService } from '../firebase/firebase.service';
import { CmsCollection, CmsRecord, CmsField } from './website-cms.types';

@Injectable()
export class WebsiteCmsService {
  private readonly logger = new Logger(WebsiteCmsService.name);
  private readonly COL_COLLECTIONS = 'wb_cms_collections';
  private readonly COL_RECORDS = 'wb_cms_records';

  constructor(private readonly firebase: FirebaseService) {}

  private db() {
    return this.firebase.firestore();
  }

  // ── Collections ────────────────────────────────────────────────────────────

  async listCollections(tenantId: string, websiteId?: string): Promise<CmsCollection[]> {
    let query = this.db().collection(this.COL_COLLECTIONS).where('tenantId', '==', tenantId);
    if (websiteId) {
      query = query.where('websiteId', '==', websiteId);
    }
    const snap = await query.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CmsCollection));
  }

  async createCollection(tenantId: string, data: Omit<CmsCollection, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>): Promise<CmsCollection> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const collection: CmsCollection = {
      ...data,
      id,
      tenantId,
      createdAt: now,
      updatedAt: now,
    };
    await this.db().collection(this.COL_COLLECTIONS).doc(id).set(collection);
    return collection;
  }

  async deleteCollection(tenantId: string, id: string): Promise<void> {
    const doc = await this.db().collection(this.COL_COLLECTIONS).doc(id).get();
    if (!doc.exists || doc.data()?.tenantId !== tenantId) throw new NotFoundException('Collection not found');
    
    // Delete all records in this collection first
    const records = await this.db().collection(this.COL_RECORDS).where('collectionId', '==', id).get();
    const batch = this.db().batch();
    records.docs.forEach(r => batch.delete(r.ref));
    batch.delete(doc.ref);
    await batch.commit();
  }

  // ── Records ────────────────────────────────────────────────────────────────

  async listRecords(tenantId: string, collectionId: string): Promise<CmsRecord[]> {
    const snap = await this.db()
      .collection(this.COL_RECORDS)
      .where('tenantId', '==', tenantId)
      .where('collectionId', '==', collectionId)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CmsRecord)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async createRecord(tenantId: string, collectionId: string, data: Record<string, any>, order = 0): Promise<CmsRecord> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const record: CmsRecord = {
      id,
      tenantId,
      collectionId,
      data,
      order,
      createdAt: now,
      updatedAt: now,
    };
    await this.db().collection(this.COL_RECORDS).doc(id).set(record);
    return record;
  }

  async updateRecord(tenantId: string, id: string, data: Record<string, any>): Promise<void> {
    const doc = await this.db().collection(this.COL_RECORDS).doc(id).get();
    if (!doc.exists || doc.data()?.tenantId !== tenantId) throw new NotFoundException('Record not found');
    await doc.ref.update({ data, updatedAt: new Date().toISOString() });
  }

  async deleteRecord(tenantId: string, id: string): Promise<void> {
    const doc = await this.db().collection(this.COL_RECORDS).doc(id).get();
    if (!doc.exists || doc.data()?.tenantId !== tenantId) throw new NotFoundException('Record not found');
    await doc.ref.delete();
  }

  // ── Sync Integration ───────────────────────────────────────────────────────

  /** Get all CMS content for a website, grouped by sectionId */
  async getWebsiteCmsContent(tenantId: string, websiteId: string): Promise<Record<string, any[]>> {
    const collections = await this.listCollections(tenantId, websiteId);
    const result: Record<string, any[]> = {};

    for (const col of collections) {
      const records = await this.listRecords(tenantId, col.id);
      result[col.sectionId] = records.map(r => r.data);
    }

    return result;
  }
}
