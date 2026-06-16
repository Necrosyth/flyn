import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

export interface WalletBalance {
  tenantId: string;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  type: 'topup' | 'usage' | 'refund';
  amount: number;
  description: string;
  feature: 'website_builder' | 'ai_credits' | 'domain' | 'calls' | 'manual';
  paymentId?: string;
  websiteId?: string;
  timestamp: string;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  private get firestore() { return this.firebase.firestore(); }

  constructor(private readonly firebase: FirebaseService) {}

  async getBalance(tenantId: string): Promise<WalletBalance> {
    const walletRef = this.firestore.collection('wallet').doc(tenantId);
    const walletSnap = await walletRef.get();

    if (!walletSnap.exists) {
      // Try to migrate from old website_builder_credits system
      const migratedBalance = await this.migrateFromOldSystem(tenantId);
      if (migratedBalance > 0) {
        return this.createWallet(tenantId, migratedBalance);
      }
      // Create new wallet with zero balance
      return this.createWallet(tenantId, 0);
    }

    return walletSnap.data() as WalletBalance;
  }

  async credit(
    tenantId: string,
    amount: number,
    description: string,
    feature: 'topup' | 'refund' | 'manual' = 'topup',
    paymentId?: string,
  ): Promise<void> {
    const walletRef = this.firestore.collection('wallet').doc(tenantId);
    const balance = await this.getBalance(tenantId);

    const newBalance = balance.balance + amount;
    const newTotalPurchased = balance.totalPurchased + amount;

    await this.firestore.runTransaction(async (transaction) => {
      // Update wallet balance
      transaction.set(
        walletRef,
        {
          tenantId,
          balance: newBalance,
          totalPurchased: newTotalPurchased,
          totalUsed: balance.totalUsed,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      // Add transaction record
      const txnRef = walletRef.collection('transactions').doc();
      transaction.set(txnRef, {
        id: txnRef.id,
        type: feature === 'topup' ? 'topup' : feature === 'refund' ? 'refund' : 'usage',
        amount,
        description,
        feature: feature === 'manual' ? 'manual' : feature,
        paymentId: paymentId || null,
        timestamp: new Date().toISOString(),
      });
    });

    this.logger.log(
      `Credited ${amount} credits to tenant ${tenantId}: ${description} (payment: ${paymentId})`,
    );
  }

  async debit(
    tenantId: string,
    amount: number,
    description: string,
    feature: 'website_builder' | 'ai_credits' | 'domain' | 'calls' = 'website_builder',
    websiteId?: string,
  ): Promise<void> {
    const walletRef = this.firestore.collection('wallet').doc(tenantId);
    const balance = await this.getBalance(tenantId);

    if (balance.balance < amount) {
      throw new Error(`Insufficient balance. Required: ${amount}, Available: ${balance.balance}`);
    }

    const newBalance = balance.balance - amount;
    const newTotalUsed = balance.totalUsed + amount;

    await this.firestore.runTransaction(async (transaction) => {
      // Update wallet balance
      transaction.set(
        walletRef,
        {
          tenantId,
          balance: newBalance,
          totalPurchased: balance.totalPurchased,
          totalUsed: newTotalUsed,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      // Add transaction record
      const txnRef = walletRef.collection('transactions').doc();
      transaction.set(txnRef, {
        id: txnRef.id,
        type: 'usage',
        amount: -amount,
        description,
        feature,
        websiteId: websiteId || null,
        timestamp: new Date().toISOString(),
      });
    });

    this.logger.log(
      `Debited ${amount} credits from tenant ${tenantId}: ${description} (website: ${websiteId})`,
    );
  }

  async getTransactions(
    tenantId: string,
    limit: number = 50,
    startAfter?: string,
  ): Promise<{ transactions: WalletTransaction[]; nextStartAfter?: string }> {
    const walletRef = this.firestore.collection('wallet').doc(tenantId);
    let query = walletRef.collection('transactions').orderBy('timestamp', 'desc').limit(limit + 1);

    if (startAfter) {
      const startDoc = await walletRef.collection('transactions').doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > limit;
    const docs = snap.docs.slice(0, limit);

    const transactions = docs.map((doc) => doc.data() as WalletTransaction);
    return {
      transactions,
      nextStartAfter: hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined,
    };
  }

  private async createWallet(tenantId: string, initialBalance: number): Promise<WalletBalance> {
    const walletRef = this.firestore.collection('wallet').doc(tenantId);
    const wallet: WalletBalance = {
      tenantId,
      balance: initialBalance,
      totalPurchased: initialBalance > 0 ? initialBalance : 0,
      totalUsed: 0,
      updatedAt: new Date().toISOString(),
    };

    await walletRef.set(wallet, { merge: true });
    return wallet;
  }

  private async migrateFromOldSystem(tenantId: string): Promise<number> {
    try {
      const oldRef = this.firestore.collection('website_builder_credits').doc(tenantId);
      const oldSnap = await oldRef.get();

      if (oldSnap.exists) {
        const oldData = oldSnap.data() as any;
        if (oldData?.internalTokens) {
          // Convert internal tokens to display credits (divide by 2)
          const migratedCredits = Math.floor(oldData.internalTokens / 2);
          this.logger.log(`Migrated ${migratedCredits} credits from old system for tenant ${tenantId}`);
          return migratedCredits;
        }
      }
    } catch (err) {
      this.logger.error(`Error migrating old system credits for ${tenantId}`, err);
    }

    return 0;
  }
}
