import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { SystemSettings, StripeConfig } from './system-settings.types';

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);
  private readonly COLLECTION = 'platform_settings';
  private readonly DOC_ID = 'global';

  private cachedSettings: SystemSettings | null = null;
  private lastFetch = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(private readonly firebase: FirebaseService) {}

  private db() {
    return this.firebase.firestore();
  }

  async getSettings(): Promise<SystemSettings> {
    const now = Date.now();
    if (this.cachedSettings && (now - this.lastFetch < this.CACHE_TTL)) {
      return this.cachedSettings;
    }

    const doc = await this.db().collection(this.COLLECTION).doc(this.DOC_ID).get();
    if (!doc.exists) {
      // Return defaults if not found
      return this.getDefaultSettings();
    }

    this.cachedSettings = doc.data() as SystemSettings;
    this.lastFetch = now;
    return this.cachedSettings;
  }

  async updateSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
    const ref = this.db().collection(this.COLLECTION).doc(this.DOC_ID);
    const current = await this.getSettings();
    const updated = { ...current, ...patch, updatedAt: Date.now() };
    await ref.set(updated, { merge: true });
    
    this.cachedSettings = updated;
    this.lastFetch = Date.now();
    return updated;
  }

  async getStripeConfig(): Promise<StripeConfig> {
    const settings = await this.getSettings();
    return settings.stripe;
  }

  private getDefaultSettings(): SystemSettings {
    return {
      platformName: 'FLYN AI',
      supportEmail: 'support@myflynai.com',
      updatedAt: Date.now(),
      stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        publicKey: process.env.STRIPE_PUBLIC_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        isEnabled: !!process.env.STRIPE_SECRET_KEY,
      }
    };
  }
}
