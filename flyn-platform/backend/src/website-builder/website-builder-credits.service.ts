import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

export interface UserCredits {
  tenantId: string;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  planTier: 'free' | 'starter' | 'growth' | 'pro' | 'enterprise';
  lastRefillDate: string | null;
  transactions: CreditTransaction[];
}

export interface CreditTransaction {
  id: string;
  type: 'purchase' | 'usage' | 'refund';
  amount: number;
  reason?: string;
  websiteId?: string;
  timestamp: string;
}

@Injectable()
export class WebsiteBuilderCreditsService {
  private readonly logger = new Logger(WebsiteBuilderCreditsService.name);
  private readonly CREDITS_COLLECTION = 'website_builder_credits';

  // Token conversion: actual_claude_tokens / TOKEN_DIVISOR = display_units
  // E.g., 8000 tokens / 1600 = 5 display units
  private readonly TOKEN_DIVISOR = 1600;

  // Charge multiplier: display_units * CHARGE_MULTIPLIER = actual_credits_to_charge
  // E.g., 5 units * 10 = 50 credits
  private readonly CHARGE_MULTIPLIER = 10;

  // Credit allocation by plan tier (first-time refill)
  private readonly PLAN_CREDITS: Record<string, number> = {
    free: 10,
    starter: 50,
    growth: 150,
    pro: 500,
    enterprise: 2000,
  };

  constructor(private readonly firebase: FirebaseService) {}

  private db() {
    return this.firebase.firestore();
  }

  private creditsRef(tenantId: string) {
    return this.db().collection(this.CREDITS_COLLECTION).doc(tenantId);
  }

  /** Get or initialize user credits balance */
  async getBalance(tenantId: string): Promise<UserCredits> {
    try {
      const doc = await this.creditsRef(tenantId).get();
      if (doc.exists) {
        return doc.data() as UserCredits;
      }
      // First access: initialize with 0 credits
      const initial: UserCredits = {
        tenantId,
        balance: 0,
        totalPurchased: 0,
        totalUsed: 0,
        planTier: 'free',
        lastRefillDate: null,
        transactions: [],
      };
      await this.creditsRef(tenantId).set(initial);
      return initial;
    } catch (err: any) {
      this.logger.error(`Failed to get balance for ${tenantId}: ${err.message}`);
      throw err;
    }
  }

  /** Convert actual Claude tokens to display units */
  tokensToDisplayUnits(actualTokens: number): number {
    return Math.ceil(actualTokens / this.TOKEN_DIVISOR);
  }

  /** Convert display units to credits to charge */
  unitsToCredits(displayUnits: number): number {
    return displayUnits * this.CHARGE_MULTIPLIER;
  }

  /** Predict token cost (returns display units and credits) */
  predictCost(actualTokens: number): { displayUnits: number; credits: number } {
    const displayUnits = this.tokensToDisplayUnits(actualTokens);
    const credits = this.unitsToCredits(displayUnits);
    return { displayUnits, credits };
  }

  /** Deduct credits from balance. Returns new balance. Throws if insufficient. */
  async deductCredits(tenantId: string, credits: number, websiteId?: string, reason?: string): Promise<number> {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialized');

    try {
      let newBalance = 0;
      await db.runTransaction(async (transaction) => {
        const docRef = this.creditsRef(tenantId);
        const snap = await transaction.get(docRef);
        const data = snap.data() as UserCredits;

        if (!data || data.balance < credits) {
          throw new Error(
            `Insufficient credits. Need ${credits}, but only have ${data?.balance || 0}. Please purchase more credits.`
          );
        }

        newBalance = data.balance - credits;
        const transaction_record: CreditTransaction = {
          id: Math.random().toString(36).substring(2, 9),
          type: 'usage',
          amount: credits,
          reason: reason || 'Website generation',
          websiteId,
          timestamp: new Date().toISOString(),
        };

        transaction.update(docRef, {
          balance: newBalance,
          totalUsed: (data.totalUsed || 0) + credits,
          transactions: [...(data.transactions || []), transaction_record],
          updatedAt: new Date().toISOString(),
        });
      });

      return newBalance;
    } catch (err: any) {
      this.logger.error(`Failed to deduct credits for ${tenantId}: ${err.message}`);
      throw err;
    }
  }

  /** Add credits to balance (e.g., from payment). Returns new balance. */
  async addCredits(tenantId: string, credits: number, reason: string = 'Purchase'): Promise<number> {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialized');

    try {
      let newBalance = 0;
      await db.runTransaction(async (transaction) => {
        const docRef = this.creditsRef(tenantId);
        const snap = await transaction.get(docRef);
        const data = (snap.data() as UserCredits) || {
          tenantId,
          balance: 0,
          totalPurchased: 0,
          totalUsed: 0,
          planTier: 'free',
          lastRefillDate: null,
          transactions: [],
        };

        newBalance = data.balance + credits;
        const transaction_record: CreditTransaction = {
          id: Math.random().toString(36).substring(2, 9),
          type: 'purchase',
          amount: credits,
          reason,
          timestamp: new Date().toISOString(),
        };

        transaction.set(docRef, {
          ...data,
          balance: newBalance,
          totalPurchased: (data.totalPurchased || 0) + credits,
          lastRefillDate: new Date().toISOString(),
          transactions: [...(data.transactions || []), transaction_record],
          updatedAt: new Date().toISOString(),
        });
      });

      return newBalance;
    } catch (err: any) {
      this.logger.error(`Failed to add credits for ${tenantId}: ${err.message}`);
      throw err;
    }
  }

  /** Set user's plan tier (used when plan changes) */
  async setPlanTier(tenantId: string, planTier: string): Promise<void> {
    try {
      const credits = await this.getBalance(tenantId);
      await this.creditsRef(tenantId).update({ planTier });
    } catch (err: any) {
      this.logger.error(`Failed to set plan tier for ${tenantId}: ${err.message}`);
      throw err;
    }
  }

  /** Get credits to allocate based on plan tier (for first refill) */
  getInitialCreditsForPlan(planTier: string): number {
    return this.PLAN_CREDITS[planTier] || this.PLAN_CREDITS['free'];
  }
}
