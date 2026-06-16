import { BadRequestException, Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import type { BrandingSettings } from './branding.types';

@Injectable()
export class BrandingService {
  private readonly COLLECTION = 'tenant_branding';

  constructor(private readonly firebase: FirebaseService) {}

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialised');
    return db;
  }

  async getBranding(tenantId: string): Promise<BrandingSettings | null> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const doc = await this.db().collection(this.COLLECTION).doc(tenantId).get();
    const branding = doc.exists ? (doc.data() as BrandingSettings) : null;

    // Fall back to tenant.logoUrl for users who uploaded a logo during
    // onboarding before the branding-sync was in place.
    if (!branding?.logoUrl) {
      const tenantDoc = await this.db().collection('tenants').doc(tenantId).get();
      const tenantLogoUrl = tenantDoc.exists ? (tenantDoc.data() as { logoUrl?: string })?.logoUrl : undefined;
      if (tenantLogoUrl) {
        const patched = { ...(branding ?? {}), logoUrl: tenantLogoUrl } as BrandingSettings;
        // Write it back so future reads are fast
        await this.db().collection(this.COLLECTION).doc(tenantId).set(patched, { merge: true });
        return patched;
      }
    }

    return branding;
  }

  async upsertBranding(tenantId: string, patch: Partial<BrandingSettings>): Promise<BrandingSettings> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const ref = this.db().collection(this.COLLECTION).doc(tenantId);
    const existing = await ref.get();
    const current = (existing.exists ? (existing.data() as BrandingSettings) : ({} as BrandingSettings)) || ({} as BrandingSettings);
    const next = { ...current, ...patch } as BrandingSettings;
    await ref.set(next, { merge: true });
    return next;
  }
}
