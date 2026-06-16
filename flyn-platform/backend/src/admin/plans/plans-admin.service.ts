import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { FirebaseService } from '../../firebase/firebase.service';
import { SystemSettingsService } from '../../system-settings/system-settings.service';
import type {
  PlanDefinition, PlanId, CreatePlanDto, UpdatePlanDto, EnforcePlanDto,
  PlanComparison, PlanComparisonDto, PlanImpactAnalysis, PlanTemplate, PlanChange, PlanFeatures,
  PricingTableSchema,
} from './plan-definitions.types';

@Injectable()
export class PlansAdminService {
  private readonly logger = new Logger(PlansAdminService.name);
  private readonly COLLECTION = 'plan_definitions';
  private readonly SCHEMA_DOC_ID = '_schema_';
  private readonly SUBSCRIPTIONS_COLLECTION = 'billing_subscriptions';
  private readonly PLAN_HISTORY_COLLECTION = 'plan_history';
  private readonly PLAN_TEMPLATES_COLLECTION = 'plan_templates';

  constructor(
    private readonly firebase: FirebaseService,
    private readonly settingsService: SystemSettingsService,
  ) {}

  private async getStripeClient(): Promise<Stripe | null> {
    try {
      const config = await this.settingsService.getStripeConfig();
      if (!config.isEnabled || !config.secretKey) return null;
      return new Stripe(config.secretKey, {
        apiVersion: '2026-02-25.clover',
        appInfo: { name: 'FLYN Platform', version: '1.0.0' },
      });
    } catch {
      return null;
    }
  }

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialized');
    return db;
  }

  async getAllPlans(): Promise<PlanDefinition[]> {
    const snap = await this.db().collection(this.COLLECTION).get();
    return snap.docs
      .filter(doc => doc.id !== this.SCHEMA_DOC_ID && doc.id !== '__schema__')
      .map((doc) => ({ ...doc.data(), id: doc.id } as PlanDefinition))
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  }

  async getPlanById(planId: PlanId): Promise<PlanDefinition> {
    const doc = await this.db().collection(this.COLLECTION).doc(planId).get();
    if (!doc.exists) throw new NotFoundException(`Plan '${planId}' not found`);
    return { ...doc.data(), id: doc.id } as PlanDefinition;
  }

  async createPlan(planId: PlanId, dto: CreatePlanDto, userId: string): Promise<PlanDefinition> {
    const existingDoc = await this.db().collection(this.COLLECTION).doc(planId).get();
    if (existingDoc.exists) {
      throw new ConflictException(`Plan '${planId}' already exists`);
    }

    const now = new Date().toISOString();
    const plan: PlanDefinition = {
      id: planId,
      version: 1,
      name: dto.name,
      description: dto.description,
      tagline: dto.tagline,
      icon: dto.icon,
      pricing: dto.pricing,
      features: dto.features,
      limits: dto.limits,
      color: dto.color,
      position: dto.position ?? 999,
      recommended: dto.recommended ?? false,
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
      changeLog: [],
    };

    await this.db().collection(this.COLLECTION).doc(planId).set(plan);
    await this.recordPlanChange(planId, 1, {}, plan, userId, 'Initial plan creation');
    this.logger.log(`Plan '${planId}' created by ${userId}`);

    // Async Stripe sync — non-blocking; failures are logged but don't affect the save
    this.syncNewPlanToStripe(planId, plan).catch(err =>
      this.logger.error(`Stripe sync failed for new plan '${planId}': ${err.message}`),
    );

    return plan;
  }

  private async syncNewPlanToStripe(planId: string, plan: PlanDefinition): Promise<void> {
    const monthly = plan.pricing?.monthly ?? 0;
    const yearly  = plan.pricing?.yearly  ?? 0;
    if (monthly === 0 && yearly === 0) return; // free/enterprise — no Stripe product needed

    const stripe = await this.getStripeClient();
    if (!stripe) return;

    const currency = (plan.pricing?.currency || 'USD').toLowerCase();

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description || plan.name,
      metadata: { planId },
    });

    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(monthly * 100),
      currency,
      recurring: { interval: 'month' },
      metadata: { planId, interval: 'monthly' },
    });

    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(yearly * 100),
      currency,
      recurring: { interval: 'year' },
      metadata: { planId, interval: 'yearly' },
    });

    await this.db().collection(this.COLLECTION).doc(planId).update({
      stripeProductId: product.id,
      'pricing.stripeMonthlyPriceId': monthlyPrice.id,
      'pricing.stripeYearlyPriceId': yearlyPrice.id,
    });

    this.logger.log(`Stripe product created for '${planId}': ${product.id} (monthly=${monthlyPrice.id}, yearly=${yearlyPrice.id})`);
  }

  async updatePlan(planId: PlanId, dto: UpdatePlanDto, userId: string): Promise<PlanDefinition> {
    const plan = await this.getPlanById(planId);
    const now = new Date().toISOString();
    const nextVersion = plan.version + 1;

    const changes: Record<string, { before: any; after: any }> = {};
    Object.keys(dto).forEach((key) => {
      if (JSON.stringify(plan[key]) !== JSON.stringify((dto as any)[key])) {
        changes[key] = { before: plan[key], after: (dto as any)[key] };
      }
    });

    const updated = {
      ...plan,
      ...dto,
      pricing: dto.pricing ? { ...plan.pricing, ...dto.pricing } : plan.pricing,
      version: nextVersion,
      updatedAt: now,
      updatedBy: userId,
    };

    await this.db().collection(this.COLLECTION).doc(planId).update(updated);
    await this.recordPlanChange(planId, nextVersion, changes, updated, userId);
    this.logger.log(`Plan '${planId}' updated to v${nextVersion} by ${userId}`);

    // Sync Stripe prices when monthly or yearly pricing changes
    if (dto.pricing) {
      const monthlyChanged = dto.pricing.monthly !== undefined && dto.pricing.monthly !== plan.pricing?.monthly;
      const yearlyChanged  = dto.pricing.yearly  !== undefined && dto.pricing.yearly  !== plan.pricing?.yearly;
      if (monthlyChanged || yearlyChanged) {
        this.syncUpdatedPricingToStripe(planId, plan, updated, monthlyChanged, yearlyChanged).catch(err =>
          this.logger.error(`Stripe price sync failed for '${planId}': ${err.message}`),
        );
      }
    }

    return updated;
  }

  private async syncUpdatedPricingToStripe(
    planId: string,
    oldPlan: PlanDefinition,
    newPlan: PlanDefinition,
    monthlyChanged: boolean,
    yearlyChanged: boolean,
  ): Promise<void> {
    const stripe = await this.getStripeClient();
    if (!stripe) return;

    const currency = (newPlan.pricing?.currency || 'USD').toLowerCase();

    // Ensure a Stripe product exists (create if missing)
    let productId = oldPlan.stripeProductId;
    if (!productId) {
      const product = await stripe.products.create({
        name: newPlan.name,
        description: newPlan.description || newPlan.name,
        metadata: { planId },
      });
      productId = product.id;
      this.logger.log(`Stripe product created on-demand for '${planId}': ${productId}`);
    }

    const updates: Record<string, string> = { stripeProductId: productId };

    if (monthlyChanged && (newPlan.pricing?.monthly ?? 0) > 0) {
      // Archive old monthly price
      const oldMonthlyId = oldPlan.pricing?.stripeMonthlyPriceId;
      if (oldMonthlyId) {
        await stripe.prices.update(oldMonthlyId, { active: false }).catch(err =>
          this.logger.warn(`Could not archive old monthly price ${oldMonthlyId}: ${err.message}`),
        );
      }
      // Create new monthly price
      const newMonthly = await stripe.prices.create({
        product: productId,
        unit_amount: Math.round((newPlan.pricing!.monthly) * 100),
        currency,
        recurring: { interval: 'month' },
        metadata: { planId, interval: 'monthly' },
      });
      updates['pricing.stripeMonthlyPriceId'] = newMonthly.id;
      this.logger.log(`New Stripe monthly price for '${planId}': ${newMonthly.id}`);
    }

    if (yearlyChanged && (newPlan.pricing?.yearly ?? 0) > 0) {
      // Archive old yearly price
      const oldYearlyId = oldPlan.pricing?.stripeYearlyPriceId;
      if (oldYearlyId) {
        await stripe.prices.update(oldYearlyId, { active: false }).catch(err =>
          this.logger.warn(`Could not archive old yearly price ${oldYearlyId}: ${err.message}`),
        );
      }
      // Create new yearly price
      const newYearly = await stripe.prices.create({
        product: productId,
        unit_amount: Math.round((newPlan.pricing!.yearly) * 100),
        currency,
        recurring: { interval: 'year' },
        metadata: { planId, interval: 'yearly' },
      });
      updates['pricing.stripeYearlyPriceId'] = newYearly.id;
      this.logger.log(`New Stripe yearly price for '${planId}': ${newYearly.id}`);
    }

    if (Object.keys(updates).length > 1) { // more than just stripeProductId
      await this.db().collection(this.COLLECTION).doc(planId).update(updates);
    }
  }

  async enforcePlanUpdate(planId: PlanId, dto: EnforcePlanDto, userId: string): Promise<{ updated: number; scheduled: number }> {
    await this.getPlanById(planId);

    if (!dto.applyToExisting) {
      this.logger.log(`Plan '${planId}' enforcement skipped (future_only mode)`);
      return { updated: 0, scheduled: 0 };
    }

    const subs = await this.db()
      .collection(this.SUBSCRIPTIONS_COLLECTION)
      .where('planId', '==', planId)
      .where('status', 'in', ['active', 'trialing'])
      .get();

    if (subs.empty) {
      this.logger.log(`No active subscriptions found for plan '${planId}'`);
      return { updated: 0, scheduled: 0 };
    }

    const batch = this.db().batch();
    const now = new Date().toISOString();
    const rolloutPercentage = dto.rolloutPercentage ?? 100;
    const affectedCount = Math.ceil(subs.docs.length * (rolloutPercentage / 100));

    subs.docs.slice(0, affectedCount).forEach((doc) => {
      batch.update(doc.ref, {
        planVersionUpdate: admin.firestore.FieldValue.increment(1),
        lastEnforcedAt: now,
      });
    });

    await batch.commit();
    this.logger.log(`Enforced plan '${planId}' on ${affectedCount}/${subs.docs.length} subscriptions by ${userId}`);
    return { updated: affectedCount, scheduled: subs.docs.length - affectedCount };
  }

  async getPlanComparison(dto: PlanComparisonDto): Promise<PlanComparison> {
    const plansData = await Promise.all(dto.plans.map((id) => this.getPlanById(id)));
    const plans = Object.fromEntries(plansData.map((p) => [p.id, p])) as Record<PlanId, PlanDefinition>;

    const featureDifferences: Record<string, Record<string, boolean>> = {};
    const limitDifferences: Record<string, Record<string, number>> = {};

    // Collect all features
    const allFeatures = new Set<string>();
    Object.values(plans).forEach((plan) => {
      Object.values(plan.features).forEach((category) => {
        Object.keys(category || {}).forEach((f) => allFeatures.add(f));
      });
    });

    // Build feature comparison
    allFeatures.forEach((feature) => {
      featureDifferences[feature] = {};
      dto.plans.forEach((planId) => {
        const plan = plans[planId];
        let hasFeature = false;
        Object.values(plan.features).forEach((category) => {
          const val = category?.[feature];
          if (typeof val === 'boolean') {
            hasFeature = hasFeature || val;
          } else if (val?.enabled) {
            hasFeature = true;
          }
        });
        featureDifferences[feature][planId] = hasFeature;
      });
    });

    // Build limit comparison
    const allLimits = new Set<string>();
    Object.values(plans).forEach((plan) => {
      Object.keys(plan.limits).forEach((l) => allLimits.add(l));
    });

    allLimits.forEach((limit) => {
      limitDifferences[limit] = {};
      dto.plans.forEach((planId) => {
        const val = (plans[planId].limits as any)[limit];
        limitDifferences[limit][planId] = typeof val === 'number' ? val : 0;
      });
    });

    return { plans, featureDifferences: featureDifferences as any, limitDifferences: limitDifferences as any };
  }

  async analyzePlanImpact(planId: PlanId): Promise<PlanImpactAnalysis> {
    const subs = await this.db()
      .collection(this.SUBSCRIPTIONS_COLLECTION)
      .where('planId', '==', planId)
      .get();

    const breakdown: Record<'active' | 'trialing' | 'paused', number> = {
      active: 0,
      trialing: 0,
      paused: 0,
    };

    subs.docs.forEach((doc) => {
      const status = (doc.data() as any).status as 'active' | 'trialing' | 'paused';
      if (status in breakdown) breakdown[status]++;
    });

    return {
      planId,
      affectedSubscriptions: subs.docs.length,
      breakdownByStatus: breakdown,
    };
  }

  private async recordPlanChange(planId: PlanId, version: number, changes: Record<string, any>, plan: PlanDefinition, userId: string, reason?: string): Promise<void> {
    const change: PlanChange = {
      version,
      timestamp: new Date().toISOString(),
      changes,
      changedBy: userId,
      reason,
    };

    await this.db().collection(this.PLAN_HISTORY_COLLECTION).add({
      planId,
      ...change,
    });

    // Update plan's changeLog (keep last 10)
    const changeLog = [change, ...(plan.changeLog || [])].slice(0, 10);
    await this.db().collection(this.COLLECTION).doc(planId).update({ changeLog });
  }

  async getPlanHistory(planId: PlanId): Promise<PlanChange[]> {
    try { await this.getPlanById(planId); } catch { return []; }
    const snap = await this.db()
      .collection(this.PLAN_HISTORY_COLLECTION)
      .where('planId', '==', planId)
      .limit(50)
      .get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        version: data.version,
        timestamp: data.timestamp,
        changes: data.changes,
        changedBy: data.changedBy,
        reason: data.reason,
      };
    });
  }

  async createPlanTemplate(template: Omit<PlanTemplate, 'createdAt'>, userId: string): Promise<PlanTemplate> {
    const id = template.id || `template_${Date.now()}`;
    const created: PlanTemplate = {
      ...template,
      id,
      createdAt: new Date().toISOString(),
    };
    await this.db().collection(this.PLAN_TEMPLATES_COLLECTION).doc(id).set(created);
    return created;
  }

  async getPlanTemplates(): Promise<PlanTemplate[]> {
    const snap = await this.db().collection(this.PLAN_TEMPLATES_COLLECTION).get();
    return snap.docs.map((d) => d.data() as PlanTemplate);
  }

  async clonePlanFromTemplate(planId: PlanId, templateId: string, userId: string): Promise<PlanDefinition> {
    const templateDoc = await this.db().collection(this.PLAN_TEMPLATES_COLLECTION).doc(templateId).get();
    if (!templateDoc.exists) throw new NotFoundException(`Template '${templateId}' not found`);

    const template = templateDoc.data() as PlanTemplate;
    return this.createPlan(planId, {
      name: template.baseDefinition.name,
      description: template.baseDefinition.description,
      tagline: template.baseDefinition.tagline,
      pricing: template.baseDefinition.pricing,
      features: template.baseDefinition.features,
      limits: template.baseDefinition.limits,
      icon: template.baseDefinition.icon,
      color: template.baseDefinition.color,
    }, userId);
  }

  // ─── Pricing Table Schema ──────────────────────────────────────────────────

  async getSchema(): Promise<PricingTableSchema> {
    try {
      const doc = await this.db().collection(this.COLLECTION).doc(this.SCHEMA_DOC_ID).get();
      if (doc.exists) return doc.data() as PricingTableSchema;
    } catch (err) {
      this.logger.warn(`getSchema failed: ${(err as Error).message}`);
    }
    return this.defaultSchema();
  }

  async updateSchema(schema: PricingTableSchema, userId: string): Promise<PricingTableSchema> {
    const updated: PricingTableSchema = {
      ...schema,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };
    await this.db().collection(this.COLLECTION).doc(this.SCHEMA_DOC_ID).set(updated);
    return updated;
  }

  private defaultSchema(): PricingTableSchema {
    return {
      categories: [
        {
          key: 'core_modules', label: 'CORE MODULES', order: 0,
          features: [
            { key: 'crm.contacts', label: 'CRM (Customer Relationship Mgmt)', order: 0, type: 'boolean' },
            { key: 'channels.inbox', label: 'Unified Inboxes', order: 1, type: 'boolean' },
            { key: 'modules.phonebook', label: 'PhoneBook / Contacts', order: 2, type: 'boolean' },
            { key: 'modules.events', label: 'Events Management', order: 3, type: 'boolean' },
            { key: 'modules.hr', label: 'HR Module', order: 4, type: 'boolean' },
            { key: 'modules.accounting', label: 'Accounting Module', order: 5, type: 'boolean' },
            { key: 'channels.whatsapp', label: 'WhatsApp CRM', order: 6, type: 'boolean' },
            { key: 'channels.telegram', label: 'Telegram CRM', order: 7, type: 'boolean' },
          ],
        },
        {
          key: 'communication', label: 'COMMUNICATION & MARKETING', order: 1,
          features: [
            { key: 'channels.email', label: 'Email Marketing', order: 0, type: 'boolean' },
            { key: 'ai.agent.deploy', label: 'ChatBot', order: 1, type: 'boolean' },
            { key: 'ai.frontdesk', label: 'AI Front Desk / Support Agent', order: 2, type: 'boolean' },
            { key: 'ai.marketing', label: 'AI Marketing Agent', order: 3, type: 'boolean' },
            { key: 'ai.content', label: 'AI Content Creator Agent', order: 4, type: 'boolean' },
            { key: 'seo.tools', label: 'SEO + Growth Tools', order: 5, type: 'boolean' },
            { key: 'website.builder', label: 'Website Builder', order: 6, type: 'boolean' },
          ],
        },
        {
          key: 'automation', label: 'AUTOMATION & PRODUCTIVITY', order: 2,
          features: [
            { key: 'automation.publish', label: 'Automation Workflows', order: 0, type: 'boolean' },
            { key: 'calendar.sync', label: 'Calendar Sync', order: 1, type: 'boolean' },
            { key: 'telephony.ivr.deploy', label: 'Telephony / IVR', order: 2, type: 'boolean' },
            { key: 'modules.freelancers', label: 'Freelance Module', order: 3, type: 'boolean' },
            { key: 'sla.management', label: 'SLA Management', order: 4, type: 'boolean' },
            { key: 'modules.contracts', label: 'Contracts', order: 5, type: 'boolean' },
          ],
        },
        {
          key: 'platform', label: 'PLATFORM & SUPPORT', order: 3,
          features: [
            { key: 'limits.teamMembers', label: 'Team Members', order: 0, type: 'limit', limitKey: 'teamMembers' },
            { key: 'limits.messagesPerMonth', label: 'Messages / Month', order: 1, type: 'limit', limitKey: 'messagesPerMonth' },
            { key: 'api.keys.issue', label: 'API Access', order: 2, type: 'boolean' },
            { key: 'api.integrations', label: 'Custom Integrations', order: 3, type: 'boolean' },
            { key: 'branding.full_white_label', label: 'White-label', order: 4, type: 'boolean' },
            { key: 'support.dedicated_manager', label: 'Dedicated Account Manager', order: 5, type: 'boolean' },
            { key: 'support.sla_guarantee', label: 'SLA Guarantee', order: 6, type: 'boolean' },
            { key: 'support.priority', label: 'Priority Support', order: 7, type: 'boolean' },
            { key: 'support.24_7_phone', label: '24/7 Phone Support', order: 8, type: 'boolean' },
          ],
        },
      ],
    };
  }

  async seedInitialPlans(userId: string = 'system'): Promise<void> {
    const now = new Date().toISOString();
    // Tier rename: FREE→STARTER, old STARTER→PRO, GROWTH same, PRO removed, ENTERPRISE same
    const plans: Record<string, any> = {
      starter: {
        version: 1,
        name: 'Starter',
        description: 'Get started',
        tagline: 'For individuals & solopreneurs',
        position: 1,
        recommended: false,
        highlights: [
          'Up to 500 messages/mo',
          '1 team member',
          'CRM + Inbox',
          'Email support',
        ],
        pricing: { monthly: 29.99, yearly: 287.9, currency: 'USD', ctaText: 'Get Started' },
        features: {
          core_modules: {
            'crm.contacts': true, 'channels.inbox': true, 'modules.phonebook': true,
            'modules.events': false, 'modules.hr': false, 'modules.accounting': false,
            'channels.whatsapp': false, 'channels.telegram': false,
          },
          communication: {
            'channels.email': true, 'ai.agent.deploy': false, 'ai.frontdesk': false,
            'ai.marketing': false, 'ai.content': false, 'seo.tools': false, 'website.builder': false,
          },
          automation: {
            'automation.publish': false, 'calendar.sync': true, 'telephony.ivr.deploy': false,
            'modules.freelancers': false, 'sla.management': false, 'modules.contracts': false,
          },
          platform: {
            'api.keys.issue': false, 'api.integrations': false, 'branding.full_white_label': false,
            'support.dedicated_manager': false, 'support.sla_guarantee': false,
            'support.priority': false, 'support.24_7_phone': false,
          },
        },
        limits: { messagesPerMonth: 500, aiTokensPerMonth: 1000, telephonyMinutesPerMonth: 0, teamMembers: 1, apiCallsPerMonth: 0, storageGb: 1, customDomainsCount: 0 },
      },
      growth: {
        version: 1,
        name: 'Growth',
        description: 'Most Popular',
        tagline: 'For growing teams',
        position: 2,
        recommended: true,
        highlights: [
          'Up to 5,000 messages/mo',
          '5 team members',
          'All channels',
          'AI automation',
          'Priority support',
        ],
        pricing: { monthly: 49, yearly: 529, currency: 'USD', discountYearly: 10, trialDays: 14, ctaText: 'Start Free Trial' },
        features: {
          core_modules: {
            'crm.contacts': true, 'channels.inbox': true, 'modules.phonebook': true,
            'modules.events': true, 'modules.hr': true, 'modules.accounting': false,
            'channels.whatsapp': true, 'channels.telegram': true,
          },
          communication: {
            'channels.email': true, 'ai.agent.deploy': true, 'ai.frontdesk': true,
            'ai.marketing': false, 'ai.content': false, 'seo.tools': false, 'website.builder': true,
          },
          automation: {
            'automation.publish': true, 'calendar.sync': true, 'telephony.ivr.deploy': false,
            'modules.freelancers': true, 'sla.management': false, 'modules.contracts': false,
          },
          platform: {
            'api.keys.issue': true, 'api.integrations': false, 'branding.full_white_label': false,
            'support.dedicated_manager': false, 'support.sla_guarantee': true,
            'support.priority': true, 'support.24_7_phone': false,
          },
        },
        limits: { messagesPerMonth: 5000, aiTokensPerMonth: 50000, telephonyMinutesPerMonth: 30, teamMembers: 5, apiCallsPerMonth: 10000, storageGb: 50, customDomainsCount: 1 },
      },
      professional: {
        version: 1,
        name: 'Professional',
        description: 'Scale fast',
        tagline: 'For scaling businesses',
        position: 3,
        recommended: false,
        highlights: [
          'Up to 50,000 messages/mo',
          '15 team members',
          'AI Agents suite',
          'Telephony/IVR',
          'Dedicated manager',
        ],
        pricing: { monthly: 99, yearly: 1069, currency: 'USD', discountYearly: 10, trialDays: 14, ctaText: 'Start Free Trial' },
        features: {
          core_modules: {
            'crm.contacts': true, 'channels.inbox': true, 'modules.phonebook': true,
            'modules.events': true, 'modules.hr': true, 'modules.accounting': true,
            'channels.whatsapp': true, 'channels.telegram': true,
          },
          communication: {
            'channels.email': true, 'ai.agent.deploy': true, 'ai.frontdesk': true,
            'ai.marketing': true, 'ai.content': true, 'seo.tools': true, 'website.builder': true,
          },
          automation: {
            'automation.publish': true, 'calendar.sync': true, 'telephony.ivr.deploy': true,
            'modules.freelancers': true, 'sla.management': true, 'modules.contracts': true,
          },
          platform: {
            'api.keys.issue': true, 'api.integrations': true, 'branding.full_white_label': false,
            'support.dedicated_manager': true, 'support.sla_guarantee': true,
            'support.priority': true, 'support.24_7_phone': false,
          },
        },
        limits: { messagesPerMonth: 50000, aiTokensPerMonth: 500000, telephonyMinutesPerMonth: 200, teamMembers: 15, apiCallsPerMonth: 100000, storageGb: 500, customDomainsCount: 3 },
      },
      enterprise: {
        version: 1,
        name: 'Enterprise',
        description: 'Full power',
        tagline: 'For large organisations',
        position: 4,
        recommended: false,
        highlights: [
          'Unlimited messages',
          'Unlimited members',
          'Custom integrations',
          'White-label',
          'SLA + 24/7 support',
        ],
        pricing: { monthly: 0, yearly: 0, currency: 'USD', ctaText: 'Contact us for pricing' },
        features: {
          core_modules: {
            'crm.contacts': true, 'channels.inbox': true, 'modules.phonebook': true,
            'modules.events': true, 'modules.hr': true, 'modules.accounting': true,
            'channels.whatsapp': true, 'channels.telegram': true,
          },
          communication: {
            'channels.email': true, 'ai.agent.deploy': true, 'ai.frontdesk': true,
            'ai.marketing': true, 'ai.content': true, 'seo.tools': true, 'website.builder': true,
          },
          automation: {
            'automation.publish': true, 'calendar.sync': true, 'telephony.ivr.deploy': true,
            'modules.freelancers': true, 'sla.management': true, 'modules.contracts': true,
          },
          platform: {
            'api.keys.issue': true, 'api.integrations': true, 'branding.full_white_label': true,
            'support.dedicated_manager': true, 'support.sla_guarantee': true,
            'support.priority': true, 'support.24_7_phone': true,
          },
        },
        limits: { messagesPerMonth: 9999999, aiTokensPerMonth: 9999999, telephonyMinutesPerMonth: 9999, teamMembers: 999999, apiCallsPerMonth: 9999999, storageGb: 9999, customDomainsCount: 999 },
      },
    };

    const batch = this.db().batch();
    Object.entries(plans).forEach(([planId, data]) => {
      const ref = this.db().collection(this.COLLECTION).doc(planId);
      batch.set(ref, {
        id: planId,
        ...data,
        createdAt: now,
        updatedAt: now,
        updatedBy: userId,
        changeLog: [],
      } as PlanDefinition);
    });

    await batch.commit();

    // Seed comparison table schema
    const schema = this.defaultSchema();
    await this.db().collection(this.COLLECTION).doc(this.SCHEMA_DOC_ID).set({
      ...schema,
      updatedAt: now,
      updatedBy: userId,
    });

    this.logger.log('Initial plans + schema seeded successfully');
  }
}
