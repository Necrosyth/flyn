import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PLAN_ENTITLEMENTS, PlanFeature } from '../billing/plan-entitlements';
import type { ResolvedEmailBranding } from './email-branding.util';

export type { ResolvedEmailBranding } from './email-branding.util';

/**
 * The ONE source of truth for tenant email branding. Every outbound send path
 * (campaigns, inbox replies, occasions) resolves branding through here — no path
 * computes branding inline. Reads White-Label settings (tenant_branding), falling
 * back to the tenants doc, and gates "hide Powered by Flyn" behind the white_label
 * entitlement (ENTERPRISE only). Result is cached per-tenant for a short TTL so a
 * broadcast to many recipients hits Firestore once, not per message.
 *
 * Deliverability law: this resolver NEVER returns a tenant custom domain as the
 * envelope sender. customEmailDomain is surfaced only as Reply-To. `usingCustomDomain`
 * is the dormant seam for a future verified-SES "we send for you" mode and is always
 * false today. See email-branding.util.ts.
 */
@Injectable()
export class EmailBrandingService {
  private readonly logger = new Logger(EmailBrandingService.name);
  private readonly cache = new Map<string, { value: ResolvedEmailBranding; expires: number }>();
  private readonly TTL_MS = 60_000;
  /** The platform's SES-verified envelope sender. The ONLY address used when there is no tenant
   *  SMTP to send through. Never a tenant custom domain. Static so non-DI callers can reference it. */
  static readonly PLATFORM_SENDER = 'noreply@myflynai.com';
  private readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  constructor(private readonly firebase: FirebaseService) {}

  async resolveTenantEmailBranding(tenantId: string): Promise<ResolvedEmailBranding> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = await this.compute(tenantId);
    this.cache.set(tenantId, { value, expires: Date.now() + this.TTL_MS });
    return value;
  }

  /** Drop a tenant's cached branding — call after a White-Label save so the next send is fresh. */
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  private fallback(): ResolvedEmailBranding {
    return {
      fromName: 'Flyn',
      replyTo: null,
      footerText: '',
      showPoweredBy: true,
      logoMode: 'logo',
      logoUrl: '',
      logoText: 'Flyn',
      platformSender: EmailBrandingService.PLATFORM_SENDER,
      usingCustomDomain: false,
      customDomainStatus: 'off',
    };
  }

  private async compute(tenantId: string): Promise<ResolvedEmailBranding> {
    if (!tenantId) return this.fallback();
    try {
      const db = this.firebase.firestore();
      if (!db) return this.fallback();

      const [brandingSnap, tenantSnap, subSnap] = await Promise.all([
        db.collection('tenant_branding').doc(tenantId).get(),
        db.collection('tenants').doc(tenantId).get(),
        // Mirror billing.getActiveSubscription() exactly (query, not doc-id) so the plan
        // gate matches the rest of the app without taking a dependency on BillingModule.
        db
          .collection('billing_subscriptions')
          .where('tenantId', '==', tenantId)
          .where('status', 'in', ['active', 'trialing'])
          .limit(1)
          .get(),
      ]);

      const b = (brandingSnap.exists ? brandingSnap.data() : {}) ?? {};
      const t = (tenantSnap.exists ? tenantSnap.data() : {}) ?? {};

      const workspaceName = String(t['workspaceName'] ?? t['name'] ?? 'Flyn');
      const fromName = (String(b['emailFromName'] || workspaceName || 'Flyn').trim()) || 'Flyn';

      // customEmailDomain is an address (placeholder "noreply@yourcompany.com"). Surface it as
      // Reply-To only when it's a valid email — never as the envelope sender.
      const customEmailDomain = String(b['customEmailDomain'] || '').trim();
      const replyTo = this.EMAIL_RE.test(customEmailDomain) ? customEmailDomain : null;

      // May this tenant hide "Powered by Flyn"? white_label is ENTERPRISE-only.
      const planId = subSnap.empty
        ? 'free'
        : String((subSnap.docs[0].data() as { planId?: string })?.planId || 'free').toLowerCase();
      const ents = PLAN_ENTITLEMENTS[planId] || PLAN_ENTITLEMENTS['free'];
      const canHidePoweredBy = ents.features.includes(PlanFeature.WHITE_LABEL);
      const showPoweredBy = canHidePoweredBy ? b['showPoweredBy'] !== false : true;

      return {
        fromName,
        replyTo,
        footerText: String(b['emailFooterText'] ?? '').trim(),
        showPoweredBy,
        logoMode: b['emailLogoMode'] === 'name' ? 'name' : 'logo',
        logoUrl: String(b['logoUrl'] ?? t['logoUrl'] ?? ''),
        logoText: String(b['logoText'] || b['appName'] || fromName),
        platformSender: EmailBrandingService.PLATFORM_SENDER,
        usingCustomDomain: false,
        customDomainStatus: customEmailDomain ? 'unverified' : 'off',
      };
    } catch (err) {
      this.logger.warn(`[email-branding] resolve failed for ${tenantId}: ${(err as Error).message}`);
      return this.fallback();
    }
  }
}
