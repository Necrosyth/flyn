import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { promises as fsp } from 'fs';
import { dirname } from 'path';
import { randomUUID } from 'crypto';


export interface Tenant {
  id: string;
  name: string;
  domain?: string;
  createdAt: number;
  updatedAt: number;

  // ===== PLAN & SUBSCRIPTION =====
  currentPlan?: 'free' | 'starter' | 'growth' | 'professional' | 'enterprise';
  subscriptionId?: string;
  subscriptionStatus?: 'active' | 'trialing' | 'past_due' | 'canceled';
  subscriptionStartDate?: string; // ISO date
  subscriptionEndDate?: string;   // ISO date (when trial/subscription ends)
  planEnforcedAt?: string;        // ISO date (when plan features last updated)

  integrations?: {
    whatsapp?: {
      type: 'api_connector' | 'native_chatwoot';
      status: 'connected' | 'disconnected' | 'pending' | 'error';
      name?: string;
      inboxId?: string;
      callbackUrl?: string;
      createdAt?: number;
      updatedAt?: number;
    } | null;
    facebook?: {
      type: 'api_connector' | 'native_chatwoot';
      status: 'connected' | 'disconnected' | 'pending' | 'error';
      name?: string;
      inboxId?: string;
      callbackUrl?: string;
      createdAt?: number;
      updatedAt?: number;
    } | null;
    api?: {
      type: 'api_connector';
      status: 'connected' | 'disconnected' | 'pending' | 'error';
      name?: string;
      inboxId?: string;
      callbackUrl?: string;
      createdAt?: number;
      updatedAt?: number;
    } | null;
    calendar?: {
      google?: {
        accessToken: string;
        refreshToken: string;
        expiryDate: number;
        email: string;
        name: string;
      } | null;
      microsoft?: {
        accessToken: string;
        refreshToken: string;
        expiryDate: number;
        email: string;
        name: string;
      } | null;
    } | null;
    accounting?: {
      xero?: {
        accessToken: string;
        refreshToken: string;
        expiryDate: number;
        xeroTenantId: string;
        connectedAt: number;
      } | null;
      quickbooks?: {
        accessToken: string;
        refreshToken: string;
        expiryDate: number;
        realmId: string;
        connectedAt: number;
        needsReconnect?: boolean;
      } | null;
      stripe?: {
        stripeUserId: string;
        accessToken: string;
        connectedAt: number;
      } | null;
    } | null;
  } | null;
  /** Links between modules and specific calendars */
  calendarLinks?: Record<string, 'google' | 'microsoft' | 'none'>;

  /**
   * Flyn-managed telephony provisioning.
   * Populated by TelephonyService — never edited directly by tenants.
   * Internal fields (_twilioSid, _vapiAssistantId, etc.) are stored here but
   * stripped before any response reaches the frontend.
   */
  telephony?: Record<string, any> | null;

  // ===== ONBOARDING & BRANDING =====
  onboardingComplete?: boolean;  // true once user completes mandatory setup
  logoUrl?: string;              // company/organization logo URL
  companyStartDate?: string;     // ISO date when company was founded/started
  companyAddress?: string;       // company physical address
  companyEmail?: string;         // company email address
  country?: string;              // ISO 3166-1 alpha-2 country code (e.g. "US")
  // ===== USER PROFILE =====
  profilePictureUrl?: string;    // user profile picture URL
  dateOfBirth?: string;          // ISO date of birth
  gender?: string;               // gender identity
  verifiedIps?: string[];
  ipVerificationEnabled?: boolean;   // "Suspicious Login Block" — hard block unknown IPs (default OFF)
  newIpAlertEnabled?: boolean;       // notify-only on unknown IP (default OFF)
  ipWhitelist?: string[];            // exact IPs or CIDR ranges that bypass the IP check
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);
  private collectionName = 'tenants';
  private fsPath = process.env.TENANTS_JSON_PATH || `${process.cwd()}/tenants.dev.json`;

  constructor(
    private readonly firebase: FirebaseService,
  ) {}

  /** Wraps a Firestore promise with a timeout to prevent indefinite hangs. */
  private firestoreTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Firestore operation timed out')), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }

  private col() {
    const db = this.firebase.firestore();
    if (!db) return undefined;
    return db.collection(this.collectionName);
  }

  // -------- Filesystem fallback helpers --------
  private async readAllFromFs(): Promise<Tenant[]> {
    try {
      const buf = await fsp.readFile(this.fsPath, 'utf-8');
      const data = JSON.parse(buf);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private async writeAllToFs(items: Tenant[]): Promise<void> {
    const payload = JSON.stringify(items, null, 2);

    // Attempt primary path
    try {
      await fsp.mkdir(dirname(this.fsPath), { recursive: true });
      await fsp.writeFile(this.fsPath, payload, 'utf-8');
      return;
    } catch (err) {
      // fall through
    }

    // Fallback to a safe local path under current working directory
    const fallbackPath = `${process.cwd()}/tenants.dev.json`;
    if (fallbackPath !== this.fsPath) {
      try {
        await fsp.mkdir(dirname(fallbackPath), { recursive: true });
        await fsp.writeFile(fallbackPath, payload, 'utf-8');
        this.fsPath = fallbackPath;
        return;
      } catch (err) {
        // fall through
      }
    }

    // Final attempt: rethrow a meaningful error
    throw new Error(`Failed to persist tenants to filesystem at ${this.fsPath}`);
  }

  async createTenant(input: { name: string; domain?: string }): Promise<Tenant> {
    const now = Date.now();
    const col = this.col();

    
    let tenant: Tenant;
    if (col) {
      try {
        const ref = await this.firestoreTimeout(col.add({
          name: input.name,
          domain: input.domain || null,
          createdAt: now,
          updatedAt: now,
        }));
        const doc = await this.firestoreTimeout(ref.get());
        tenant = { id: doc.id, ...(doc.data() as any) } as Tenant;
      } catch (err: any) {
        this.logger.error(`Firestore createTenant error: ${err?.message || String(err)}`);
        tenant = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
      }
    } else {
      const items = await this.readAllFromFs();
      tenant = {
        id: randomUUID(),
        name: input.name,
        domain: input.domain,
        createdAt: now,
        updatedAt: now,
      };
      items.unshift(tenant);
      await this.writeAllToFs(items);
    }

    return tenant;
  }


  async getTenant(id: string): Promise<Tenant> {
    const col = this.col();
    if (col) {
      try {
        const doc = await this.firestoreTimeout(col.doc(id).get());
        if (!doc.exists) throw new NotFoundException('Tenant not found');
        return { id: doc.id, ...(doc.data() as any) } as Tenant;
      } catch (err) {
        // Don't swallow NotFoundException — tenant genuinely doesn't exist
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Firestore getTenant error: ${(err as Error).message}; falling back to filesystem.`);
      }
    }
    const items = await this.readAllFromFs();
    const found = items.find((t) => t.id === id);
    if (!found) throw new NotFoundException('Tenant not found');
    return found;
  }

  async updateTenant(id: string, patch: Partial<Omit<Tenant, 'id' | 'createdAt'>>) {
    const now = Date.now();
    const col = this.col();
    if (col) {
      try {
        await this.firestoreTimeout(col.doc(id).set({ ...patch, updatedAt: now }, { merge: true }));
        const doc = await this.firestoreTimeout(col.doc(id).get());
        return { id: doc.id, ...(doc.data() as any) } as Tenant;
      } catch (err) {
        this.logger.warn(`Firestore updateTenant error: ${(err as Error).message}; falling back to filesystem.`);
      }
    }
    // Filesystem fallback — create the tenant if it doesn't exist yet
    const items = await this.readAllFromFs();
    const idx = items.findIndex((t) => t.id === id);
    if (idx === -1) {
      const created: Tenant = { id, name: '', createdAt: now, updatedAt: now, ...patch } as Tenant;
      items.unshift(created);
      await this.writeAllToFs(items);
      return created;
    }
    items[idx] = { ...items[idx], ...patch, updatedAt: now } as Tenant;
    await this.writeAllToFs(items);
    return items[idx];
  }

  async deleteTenant(id: string): Promise<void> {
    const col = this.col();
    if (col) {
      try {
        await this.firestoreTimeout(col.doc(id).delete());
        return;
      } catch (err) {
        this.logger.warn(`Firestore deleteTenant error: ${(err as Error).message}; falling back to filesystem.`);
      }
    }
    const items = await this.readAllFromFs();
    const filtered = items.filter((t) => t.id !== id);
    await this.writeAllToFs(filtered);
  }

  async listTenants(): Promise<Tenant[]> {
    const col = this.col();
    if (col) {
      try {
        const snap = await this.firestoreTimeout(col.orderBy('createdAt', 'desc').get());
        return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Tenant));
      } catch (err) {
        this.logger.warn(`Firestore listTenants error: ${(err as Error).message}; falling back to filesystem.`);
      }
    }
    const items = await this.readAllFromFs();
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  /**
   * Sync subscription data from billing_subscriptions to tenant record.
   * Called by billing webhook when subscription changes.
   */
  async syncSubscriptionToTenant(
    tenantId: string,
    subscription: {
      id: string;
      planId: string;
      status: 'active' | 'trialing' | 'past_due' | 'canceled';
      startDate?: string;
      endDate?: string;
    },
  ): Promise<Tenant> {
    const now = new Date().toISOString();
    const updates = {
      currentPlan: subscription.planId.toLowerCase() as Tenant['currentPlan'],
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionStartDate: subscription.startDate,
      subscriptionEndDate: subscription.endDate,
      planEnforcedAt: now,
      updatedAt: Date.now(),
    };

    return this.updateTenant(tenantId, updates);
  }

  /**
   * Get tenant's current plan (from cached tenant record)
   */
  async getTenantPlan(
    tenantId: string,
  ): Promise<{ plan: Tenant['currentPlan']; status: Tenant['subscriptionStatus'] }> {
    const tenant = await this.getTenant(tenantId);
    return {
      plan: tenant.currentPlan || 'free',
      status: tenant.subscriptionStatus || 'canceled',
    };
  }

  async findByXeroTenantId(xeroTenantId: string): Promise<Tenant | null> {
    const col = this.col();
    if (col) {
      try {
        const snap = await col.where('integrations.accounting.xero.xeroTenantId', '==', xeroTenantId).limit(1).get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          return { id: doc.id, ...(doc.data() as any) } as Tenant;
        }
      } catch {
        this.logger.warn('Firestore findByXeroTenantId failed; falling back to filesystem.');
      }
    }
    const items = await this.readAllFromFs();
    return items.find(t => t.integrations?.accounting?.xero?.xeroTenantId === xeroTenantId) || null;
  }

  async findByCalendlyUri(calendlyUri: string): Promise<Tenant | null> {
    const col = this.col();
    if (col) {
      try {
        const snap = await col.where('integrations.calendly.calendlyUri', '==', calendlyUri).limit(1).get();
        if (!snap.empty) { const doc = snap.docs[0]; return { id: doc.id, ...(doc.data() as any) } as Tenant; }
      } catch { this.logger.warn('Firestore findByCalendlyUri failed.'); }
    }
    const items = await this.readAllFromFs();
    return items.find(t => (t.integrations as any)?.calendly?.calendlyUri === calendlyUri) || null;
  }

  async findByZoomAccountId(zoomUserId: string): Promise<Tenant | null> {
    const col = this.col();
    if (col) {
      try {
        const snap = await col.where('integrations.zoom.zoomUserId', '==', zoomUserId).limit(1).get();
        if (!snap.empty) { const doc = snap.docs[0]; return { id: doc.id, ...(doc.data() as any) } as Tenant; }
      } catch { this.logger.warn('Firestore findByZoomAccountId failed.'); }
    }
    const items = await this.readAllFromFs();
    return items.find(t => (t.integrations as any)?.zoom?.zoomUserId === zoomUserId) || null;
  }

  async findByQuickBooksRealmId(realmId: string): Promise<Tenant | null> {
    const col = this.col();
    if (col) {
      try {
        const snap = await col.where('integrations.accounting.quickbooks.realmId', '==', realmId).limit(1).get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          return { id: doc.id, ...(doc.data() as any) } as Tenant;
        }
      } catch {
        this.logger.warn('Firestore findByQuickBooksRealmId failed; falling back to filesystem.');
      }
    }
    const items = await this.readAllFromFs();
    return items.find(t => t.integrations?.accounting?.quickbooks?.realmId === realmId) || null;
  }

  async findByStripeAccountId(stripeUserId: string): Promise<Tenant | null> {
    const col = this.col();
    if (col) {
      try {
        const snap = await col.where('integrations.accounting.stripe.stripeUserId', '==', stripeUserId).limit(1).get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          return { id: doc.id, ...(doc.data() as any) } as Tenant;
        }
      } catch {
        this.logger.warn('Firestore findByStripeAccountId failed; falling back to filesystem.');
      }
    }
    const items = await this.readAllFromFs();
    return items.find(t => t.integrations?.accounting?.stripe?.stripeUserId === stripeUserId) || null;
  }
}
