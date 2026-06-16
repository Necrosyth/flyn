import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';
import { PLAN_ENTITLEMENTS } from '../billing/plan-entitlements';

export interface Usage {
  messages: number;
  tokens: number;
  minutes: number;
}

@Injectable()
export class UsageMeterService {
  private readonly logger = new Logger(UsageMeterService.name);
  private readonly COLLECTION = 'usage_meters';

  constructor(private readonly firebase: FirebaseService) {}

  private db() {
    return this.firebase.firestore();
  }

  private getDocId(tenantId: string): string {
    const now = new Date();
    const month = now.toISOString().slice(0, 7); // YYYY-MM
    return `${tenantId}_${month}`;
  }

  async getUsage(tenantId: string): Promise<Usage> {
    const docId = this.getDocId(tenantId);
    const doc = await this.db().collection(this.COLLECTION).doc(docId).get();
    
    if (!doc.exists) {
      return { messages: 0, tokens: 0, minutes: 0 };
    }

    const data = doc.data();
    return {
      messages: data?.messages || 0,
      tokens: data?.tokens || 0,
      minutes: data?.minutes || 0,
    };
  }

  async trackUsage(tenantId: string, type: keyof Usage, amount: number = 1): Promise<void> {
    const docId = this.getDocId(tenantId);
    const ref = this.db().collection(this.COLLECTION).doc(docId);

    // Atomic increment to handle concurrency
    await ref.set({
      [type]: admin.firestore.FieldValue.increment(amount),
      updatedAt: Date.now(),
      tenantId,
    }, { merge: true });
  }

  async checkLimit(tenantId: string, planId: string, type: keyof Usage): Promise<{ allowed: boolean; current: number; limit: number }> {
    const usage = await this.getUsage(tenantId);
    const entitlements = PLAN_ENTITLEMENTS[planId.toLowerCase()] || PLAN_ENTITLEMENTS['free'];
    
    let current = 0;
    let limit = 0;

    switch (type) {
      case 'messages':
        current = usage.messages;
        limit = entitlements.limits.messagesPerMonth;
        break;
      case 'tokens':
        current = usage.tokens;
        limit = entitlements.limits.aiTokensPerMonth;
        break;
      case 'minutes':
        current = usage.minutes;
        limit = entitlements.limits.telephonyMinutesPerMonth;
        break;
    }

    return {
      allowed: current < limit,
      current,
      limit,
    };
  }
}
