import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

export type MetricKey =
  | 'messages.sent'
  | 'calls.minutes'
  | 'ai.tokens'
  | 'webchat.sessions'
  | 'storage.gb'
  | 'whatsapp.conversations';

export interface UsageCounter {
  tenantId: string;
  metricKey: MetricKey;
  period: string; // YYYY-MM
  used: number;
  updatedAt: number;
}

/**
 * UsageService
 *
 * Atomic Firestore-backed counters per tenant per metric per billing period.
 * Each document lives at:
 *   usage_counters/{tenantId}_{metricKey}_{period}
 *
 * Increment is performed as a Firestore transaction to prevent race conditions.
 *
 * Designed to be called by other services (ChannelsService, OrchestratorService,
 * etc.) every time a billable action occurs.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);
  private readonly COLLECTION = 'usage_counters';

  constructor(private readonly firebase: FirebaseService) {}

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private docId(tenantId: string, metricKey: MetricKey, period: string): string {
    return `${tenantId}_${metricKey}_${period}`;
  }

  /**
   * Atomically increment a usage counter by `amount`.
   * Returns the new total after increment.
   */
  async increment(
    tenantId: string,
    metricKey: MetricKey,
    amount = 1,
    period?: string,
  ): Promise<number> {
    const db = this.firebase.firestore();
    if (!db) return 0;

    const p = period ?? this.currentPeriod();
    const id = this.docId(tenantId, metricKey, p);
    const ref = db.collection(this.COLLECTION).doc(id);

    let newTotal = 0;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? ((snap.data() as UsageCounter).used ?? 0) : 0;
      newTotal = current + amount;
      tx.set(
        ref,
        {
          tenantId,
          metricKey,
          period: p,
          used: newTotal,
          updatedAt: Date.now(),
        } satisfies UsageCounter,
        { merge: true },
      );
    });

    return newTotal;
  }

  /**
   * Returns all counters for the current billing period.
   */
  async getCounters(tenantId: string, period?: string): Promise<UsageCounter[]> {
    const db = this.firebase.firestore();
    if (!db) return [];

    const p = period ?? this.currentPeriod();
    const prefix = `${tenantId}_`;

    const snap = await db
      .collection(this.COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('period', '==', p)
      .get();

    return snap.docs.map((d) => d.data() as UsageCounter);
  }

  /**
   * Returns the current used value for one metric.
   */
  async getCount(
    tenantId: string,
    metricKey: MetricKey,
    period?: string,
  ): Promise<number> {
    const db = this.firebase.firestore();
    if (!db) return 0;

    const p = period ?? this.currentPeriod();
    const snap = await db
      .collection(this.COLLECTION)
      .doc(this.docId(tenantId, metricKey, p))
      .get();

    if (!snap.exists) return 0;
    return (snap.data() as UsageCounter).used ?? 0;
  }
}
