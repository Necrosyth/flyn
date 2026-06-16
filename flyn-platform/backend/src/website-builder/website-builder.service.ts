import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseService } from '../firebase/firebase.service';
import { WebsiteCmsService } from './website-cms.service';
import { WebsiteBuilderCreditsService } from './website-builder-credits.service';
import { WalletService } from '../wallet/wallet.service';
import { generateWebsite, regenerateSection, chatRevise, generateForm, syncCmsData, inferCmsSchema } from './website-ai';
import { getAllTemplates } from './template-library';
import type { WebsiteInput } from './website-ai';

export interface SavedWebsite {
  id:           string;
  businessName: string;
  industry:     string;
  purpose:      string;
  description:  string;
  html:         string;
  pageType:     string;
  title:        string;
  status:       'draft' | 'published';
  publishedUrl: string | null;
  domainId:     string | null;
  templateId:   string | null;
  tokensUsed:   number;
  costUsd:      number;
  cmsMapping?:  Record<string, { collection: string; fieldMap: Record<string, string> }>;
  generatedAt:  string;
  createdAt:    any;
  updatedAt:    any;
}

export interface GenerateInput {
  businessName:       string;
  industry:           string;
  purpose:            string;
  description:        string;
  location?:          string;
  colorScheme?:       string;
  fontStyle?:         string;
  features:           Record<string, boolean>;
  templateId?:        string;
  pageType?:          string;
  quality?:           'standard' | 'premium';
  additionalContext?: string;
}

export interface RegenerateSectionInput {
  sectionType:  string;
  sectionLabel: string;
  instruction:  string;
  businessName: string;
  industry:     string;
  cssVariables: string;
}

@Injectable()
export class WebsiteBuilderService {
  private readonly logger = new Logger(WebsiteBuilderService.name);
  private readonly WB_WEBSITES = 'wb_websites';
  private readonly PUBLIC_WEBSITES = 'public_websites';
  private readonly ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

  constructor(
    private readonly firebase: FirebaseService,
    private readonly cmsService: WebsiteCmsService,
    private readonly creditsService: WebsiteBuilderCreditsService,
    private readonly walletService: WalletService,
  ) {}

  private db() {
    return this.firebase.firestore();
  }

  /** Call Claude API for AI-powered content generation */
  private async callClaude(
    system: string,
    userPrompt: string,
    maxTokens = 4000,
  ): Promise<string> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY env var is not set');

    const res = await fetch(this.ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    return data.content.find(b => b.type === 'text')?.text ?? '';
  }

  private websitesRef(tenantId: string) {
    return this.db()
      .collection('tenants')
      .doc(tenantId)
      .collection(this.WB_WEBSITES);
  }

  /** Synchronize website HTML with its dedicated CMS content */
  async syncWebsiteCMS(tenantId: string, websiteId: string): Promise<{ success: boolean; html: string }> {
    const website = await this.getWebsite(tenantId, websiteId);
    
    // 1. Get all content from dedicated CMS collections
    const cmsContent = await this.cmsService.getWebsiteCmsContent(tenantId, websiteId);
    
    if (Object.keys(cmsContent).length === 0) {
      return { success: false, html: website.html };
    }

    // 2. Use AI to inject CMS data into the HTML
    const updatedHtml = await syncCmsData({
      html: website.html,
      cmsData: cmsContent,
      businessName: website.businessName,
    });

    // 3. Save updated HTML back to Firestore
    await this.updateWebsite(tenantId, websiteId, { html: updatedHtml });

    return { success: true, html: updatedHtml };
  }

  /** Internal helper to update CMS collections based on HTML structure */
  private async autoUpdateCMSCollections(tenantId: string, websiteId: string, html: string, businessName: string) {
    try {
      const inferred = await inferCmsSchema({ html, businessName });
      const existing = await this.cmsService.listCollections(tenantId, websiteId);
      
      for (const item of inferred) {
        const exists = existing.find(e => e.sectionId === item.sectionId);
        if (!exists) {
          await this.cmsService.createCollection(tenantId, {
            websiteId,
            sectionId: item.sectionId,
            name: item.name,
            slug: item.sectionId,
            fields: item.fields,
          });
          this.logger.log(`[AutoCMS] Created collection for section "${item.sectionId}"`);
        }
      }
    } catch (err) {
      this.logger.warn(`[AutoCMS] Failed to update CMS schema: ${err.message}`);
    }
  }

  async listWebsites(tenantId: string): Promise<{ websites: SavedWebsite[]; total: number }> {
    try {
      const snap = await this.websitesRef(tenantId)
        .orderBy('createdAt', 'desc')
        .get();
      const websites = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as SavedWebsite));
      return { websites, total: websites.length };
    } catch (err: any) {
      this.logger.warn(`listWebsites failed for tenant ${tenantId}: ${err.message}`);
      return { websites: [], total: 0 };
    }
  }

  async getWebsite(tenantId: string, websiteId: string): Promise<SavedWebsite> {
    const doc = await this.websitesRef(tenantId).doc(websiteId).get();
    if (!doc.exists) throw new NotFoundException(`Website ${websiteId} not found`);
    return { id: doc.id, ...(doc.data() as any) } as SavedWebsite;
  }

  /** Publicly fetch a website by ID — uses a top-level index doc to avoid collectionGroup index requirements */
  async getWebsiteByIdPublic(websiteId: string): Promise<SavedWebsite | null> {
    this.logger.log(`[getWebsiteByIdPublic] Looking up public_websites/${websiteId}`);

    if (!websiteId) {
      this.logger.warn(`[getWebsiteByIdPublic] websiteId is empty!`);
      return null;
    }

    try {
      const indexDoc = await this.db().collection(this.PUBLIC_WEBSITES).doc(websiteId).get();
      this.logger.log(`[getWebsiteByIdPublic] Index doc exists=${indexDoc.exists}, data=${JSON.stringify(indexDoc.data()).substring(0, 200)}`);

      if (indexDoc.exists) {
        const data = indexDoc.data() as any;
        const { tenantId, html } = data;
        this.logger.log(`[getWebsiteByIdPublic] tenantId=${tenantId}, cachedHtmlLen=${html?.length ?? 0}`);

        if (tenantId && html) {
          this.logger.log(`[getWebsiteByIdPublic] Returning cached HTML from public_websites`);
          return { id: websiteId, ...data } as SavedWebsite;
        }

        if (tenantId) {
          try {
            const snap = await this.websitesRef(tenantId).doc(websiteId).get();
            this.logger.log(`[getWebsiteByIdPublic] Tenant doc exists=${snap.exists}, htmlLen=${(snap.data() as any)?.html?.length ?? 0}`);
            if (snap.exists) {
              this.logger.log(`[getWebsiteByIdPublic] Returning HTML from tenant websites`);
              return { id: snap.id, ...(snap.data() as any) } as SavedWebsite;
            }
          } catch (err: any) {
            this.logger.warn(`[getWebsiteByIdPublic] Tenant doc fetch failed: ${err.message} — using cached html`);
          }
        }

        if (html) {
          this.logger.log(`[getWebsiteByIdPublic] Returning cached HTML only`);
          return { id: websiteId, ...data } as SavedWebsite;
        }
      }

      this.logger.warn(`[getWebsiteByIdPublic] No doc found or no HTML in collection ${this.PUBLIC_WEBSITES}/${websiteId}`);
    } catch (err: any) {
      this.logger.error(`[getWebsiteByIdPublic] Exception: ${err.message}`, err.stack);
    }

    return null;
  }

  /** Resolve a website by domain name (registered or custom) */
  async resolveWebsiteByDomain(domain: string): Promise<SavedWebsite | null> {
    this.logger.log(`[resolveWebsiteByDomain] Looking up website for domain: ${domain}`);

    // 1. Check custom hostnames
    const customSnap = await this.db()
      .collection('custom_hostnames')
      .where('hostname', '==', domain.toLowerCase())
      .limit(1)
      .get();

    this.logger.log(`[resolveWebsiteByDomain] Custom hostname search: found=${!customSnap.empty}, domain=${domain.toLowerCase()}`);
    if (!customSnap.empty) {
      const data = customSnap.docs[0].data();
      this.logger.log(`[resolveWebsiteByDomain] Custom hostname data:`, { id: customSnap.docs[0].id, ...data });
      const websiteId = data.websiteId;
      if (websiteId) {
        this.logger.log(`[resolveWebsiteByDomain] Found websiteId: ${websiteId}`);
        return this.getWebsiteByIdPublic(websiteId);
      } else {
        this.logger.warn(`[resolveWebsiteByDomain] Custom hostname found but no websiteId`);
      }
    }

    // 2. Check registered domains
    const domainSnap = await this.db()
      .collection('domains')
      .where('domain', '==', domain.toLowerCase())
      .limit(1)
      .get();

    this.logger.log(`[resolveWebsiteByDomain] Registered domain search: found=${!domainSnap.empty}`);
    if (!domainSnap.empty) {
      const websiteId = domainSnap.docs[0].data().websiteId;
      if (websiteId) return this.getWebsiteByIdPublic(websiteId);
    }

    this.logger.warn(`[resolveWebsiteByDomain] No website found for domain: ${domain}`);
    return null;
  }

  async updateWebsite(
    tenantId: string,
    websiteId: string,
    data: Partial<SavedWebsite>,
  ): Promise<{ success: boolean }> {
    await this.websitesRef(tenantId)
      .doc(websiteId)
      .set({ ...data, updatedAt: new Date().toISOString() }, { merge: true });
    return { success: true };
  }

  async deleteWebsite(tenantId: string, websiteId: string): Promise<{ success: boolean }> {
    await this.websitesRef(tenantId).doc(websiteId).delete();
    return { success: true };
  }

  /** Generate detailed AI proposal describing what the website will look like */
  private async generateProposalDescription(body: GenerateInput): Promise<string> {
    const selectedFeatures = Object.entries(body.features || {})
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');

    const systemPrompt = `You are an expert web designer. Generate an exciting, detailed proposal for what the website will actually look like and contain. Focus on:
- What sections and pages will be included
- Layout and visual hierarchy
- Content structure and key messaging
- How features will be implemented (e.g., how contact form appears, where testimonials are shown, etc.)
- User experience flow
Be specific and descriptive about the website design and layout. Keep it concise but compelling.`;

    const userPrompt = `Create a website proposal for:
Business: ${body.businessName}
Industry: ${body.industry}
Purpose: ${body.purpose}
Description: ${body.description}
Location: ${body.location || 'Not specified'}
Color Scheme: ${body.colorScheme || 'Modern professional colors'}
Typography: ${body.fontStyle || 'Professional sans-serif'}
Quality: ${body.quality === 'premium' ? 'Premium design' : 'Standard design'}
Features: ${selectedFeatures || 'Basic pages'}
${body.additionalContext ? `Special Requests: ${body.additionalContext}` : ''}

Write a compelling proposal describing what the website will look like and its key sections. Be specific about layout and design.`;

    try {
      const proposalText = await this.callClaude(systemPrompt, userPrompt, 4000);
      return proposalText;
    } catch (err) {
      this.logger.warn(`Failed to generate AI proposal: ${err.message}, using fallback`);
      const featureList = Object.entries(body.features || {})
        .filter(([, v]) => v)
        .map(([k]) => `- ${k.charAt(0).toUpperCase() + k.slice(1)}`)
        .join('\n');
      return `Professional website for "${body.businessName}"

A ${body.quality === 'premium' ? 'premium' : 'professional'} ${body.industry} website designed to ${body.purpose}.

**Pages & Sections:**
- Homepage with hero section
${featureList || '- About/Contact pages'}

**Design:**
- Color Scheme: ${body.colorScheme || 'Modern professional'}
- Typography: ${body.fontStyle || 'Clean sans-serif'}
- Responsive design for all devices`;
    }
  }

  /** Propose a website design and predict credit cost (no generation yet) */
  async getDraftProposal(tenantId: string): Promise<{ proposal: string; credits: number; currentBalance: number; proposalId: string; buildState: any } | null> {
    try {
      const snap = await this.db()
        .collection('tenants')
        .doc(tenantId)
        .collection('wb_proposals')
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (snap.empty) return null;

      const draft = snap.docs[0].data() as any;
      const walletBalance = await this.walletService.getBalance(tenantId);

      return {
        proposal: draft.proposalText,
        credits: draft.estimatedCredits,
        currentBalance: walletBalance.balance,
        proposalId: draft.id,
        buildState: {
          businessName: draft.businessName,
          industry: draft.industry,
          purpose: draft.purpose,
          description: draft.description,
          colorScheme: draft.colorScheme,
          fontStyle: draft.fontStyle,
          features: draft.features,
          quality: draft.quality,
          additionalContext: draft.additionalContext,
        },
      };
    } catch (err) {
      this.logger.warn(`Failed to fetch draft proposal: ${err.message}`);
      return null;
    }
  }

  async proposeWebsite(
    tenantId: string,
    body: GenerateInput,
  ): Promise<{ proposal: string; credits: number; currentBalance: number; proposalId: string }> {
    this.logger.log(`[WebsiteBuilder] Proposing website for tenant ${tenantId}: ${body.businessName}`);

    // Generate detailed AI proposal
    const aiProposal = await this.generateProposalDescription(body);

    // Unified wallet pricing: 10 credits (standard), 20 credits (premium)
    const credits = body.quality === 'premium' ? 20 : 10;

    // Get current balance from unified wallet
    const walletBalance = await this.walletService.getBalance(tenantId);

    // Generate proposal ID for draft saving
    const proposalId = uuidv4();

    // Save proposal draft to Firestore
    try {
      await this.db()
        .collection('tenants')
        .doc(tenantId)
        .collection('wb_proposals')
        .doc(proposalId)
        .set({
          id: proposalId,
          businessName: body.businessName,
          industry: body.industry,
          purpose: body.purpose,
          description: body.description,
          colorScheme: body.colorScheme,
          fontStyle: body.fontStyle,
          features: body.features,
          quality: body.quality,
          additionalContext: body.additionalContext,
          proposalText: aiProposal,
          estimatedCredits: credits,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
    } catch (err) {
      this.logger.warn(`Failed to save proposal draft: ${err.message}`);
    }

    return {
      proposal: aiProposal,
      credits,
      currentBalance: walletBalance.balance,
      proposalId,
    };
  }

  /** Refine proposal through chat — user provides feedback, AI updates proposal */
  async refineProposal(
    tenantId: string,
    proposalId: string,
    userMessage: string,
  ): Promise<{ proposal: string; credits: number; currentBalance: number }> {
    this.logger.log(`[WebsiteBuilder] Refining proposal ${proposalId} for tenant ${tenantId}`);

    // Load existing proposal
    const proposalRef = this.db()
      .collection('tenants')
      .doc(tenantId)
      .collection('wb_proposals')
      .doc(proposalId);

    const proposalDoc = await proposalRef.get();
    if (!proposalDoc.exists) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }

    const proposal = proposalDoc.data() as any;

    const systemPrompt = `You are an expert web designer. The user is refining their website proposal.
Update the proposal based on their feedback. Keep it detailed and compelling, describing what the website will look like.
Maintain the original vision but incorporate their requested changes.`;

    const userPrompt = `Current proposal:
${proposal.proposalText}

User feedback/changes requested:
${userMessage}

Update the proposal incorporating their feedback while keeping it detailed and professional.`;

    try {
      const updatedProposal = await this.callClaude(systemPrompt, userPrompt, 4000);

      // Update draft
      await proposalRef.update({
        proposalText: updatedProposal,
        updatedAt: new Date().toISOString(),
      });

      const walletBalance = await this.walletService.getBalance(tenantId);

      return {
        proposal: updatedProposal,
        credits: proposal.estimatedCredits,
        currentBalance: walletBalance.balance,
      };
    } catch (err) {
      this.logger.error(`Failed to refine proposal: ${err.message}`);
      throw err;
    }
  }

  async generateWebsite(
    tenantId: string,
    body: GenerateInput,
  ): Promise<{ success: boolean; websiteId: string; html: string; title: string; tokensUsed: number; costUsd: number; remainingBalance: number }> {
    this.logger.log(`[WebsiteBuilder] Generating website for tenant ${tenantId}: ${body.businessName}`);

    const input: WebsiteInput = {
      businessName:       body.businessName,
      industry:           body.industry,
      purpose:            body.purpose,
      description:        body.description,
      location:           body.location,
      colorScheme:        body.colorScheme,
      fontStyle:          body.fontStyle,
      features:           body.features,
      templateId:         body.templateId,
      pageType:           body.pageType,
      quality:            body.quality,
      additionalContext:  body.additionalContext,
    };

    const result = await generateWebsite(input);

    // Unified wallet pricing: 10 credits (standard), 20 credits (premium)
    const credits = body.quality === 'premium' ? 20 : 10;

    // Deduct from unified wallet
    await this.walletService.debit(
      tenantId,
      credits,
      `Website generation: ${body.businessName}`,
      'website_builder',
    );
    const { balance: remainingBalance } = await this.walletService.getBalance(tenantId);

    const websiteId = uuidv4();
    const now = new Date().toISOString();

    const website: SavedWebsite = {
      id:           websiteId,
      businessName: body.businessName,
      industry:     body.industry,
      purpose:      body.purpose,
      description:  body.description,
      html:         result.html,
      pageType:     result.pageType,
      title:        result.title,
      status:       'draft',
      publishedUrl: null,
      domainId:     null,
      templateId:   body.templateId ?? null,
      tokensUsed:   result.tokensUsed,
      costUsd:      result.costUsd,
      generatedAt:  now,
      createdAt:    now,
      updatedAt:    now,
    };

    await this.websitesRef(tenantId).doc(websiteId).set(website);
    this.logger.log(`[WebsiteBuilder] Saved website ${websiteId} for tenant ${tenantId}`);

    // Auto-create CMS collections
    await this.autoUpdateCMSCollections(tenantId, websiteId, result.html, body.businessName);

    return {
      success: true,
      websiteId,
      html: result.html,
      title: result.title,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
      remainingBalance,
    };
  }

  async regenerateSection(
    tenantId: string,
    body: RegenerateSectionInput,
  ): Promise<{ html: string; fields: Record<string, any> }> {
    this.logger.log(`[WebsiteBuilder] Regenerating section for tenant ${tenantId}`);
    return regenerateSection(body);
  }

  async publishWebsite(
    tenantId: string,
    websiteId: string,
  ): Promise<{ success: boolean; url: string; message?: string }> {
    const url = `https://api.myflynai.com/api/website-builder/p/${websiteId}`;
    const updatedAt = new Date().toISOString();

    // Fetch the current html so we can cache it in the public index
    let html = '';
    try {
      const snap = await this.websitesRef(tenantId).doc(websiteId).get();
      html = snap.exists ? (snap.data() as any)?.html ?? '' : '';
      this.logger.log(`[publishWebsite] Fetched html length=${html?.length || 0} bytes for ${websiteId}`);
    } catch (err: any) {
      this.logger.error(`[publishWebsite] Error fetching html: ${err.message}`);
    }

    if (!html) {
      this.logger.warn(`[publishWebsite] WARNING: No HTML found for website ${websiteId}, publishing with empty HTML`);
    }

    // Write both the tenant record and a top-level index doc in parallel
    await Promise.all([
      this.websitesRef(tenantId).doc(websiteId).set(
        { status: 'published', publishedUrl: url, publishedAt: updatedAt, updatedAt },
        { merge: true },
      ),
      // Top-level index: lets getWebsiteByIdPublic find it without collectionGroup
      this.db().collection(this.PUBLIC_WEBSITES).doc(websiteId).set({
        tenantId,
        websiteId,
        html,
        publishedUrl: url,
        publishedAt: updatedAt,
        updatedAt,
      }),
    ]);

    this.logger.log(`[WebsiteBuilder] Published website ${websiteId} for tenant ${tenantId}: ${url}, htmlLen=${html?.length || 0}`);
    return { success: true, url };
  }

  listTemplates(params?: { q?: string; category?: string }) {
    return getAllTemplates(params);
  }

  async chat(
    tenantId: string,
    body: { messages: any[]; html: string; websiteId?: string; selectedId?: string },
  ): Promise<{ success: boolean; html: string; reply: string }> {
    const result = await chatRevise({
      messages: body.messages.map(m => ({ role: m.role === 'ai' ? 'ai' : 'user', content: m.text })),
      html: body.html,
      selectedId: body.selectedId,
    });

    if (body.websiteId && result.html !== body.html) {
      await this.websitesRef(tenantId)
        .doc(body.websiteId)
        .set({ html: result.html, updatedAt: new Date().toISOString() }, { merge: true });
      
      const website = await this.getWebsite(tenantId, body.websiteId);
      await this.autoUpdateCMSCollections(tenantId, body.websiteId, result.html, website.businessName);
    }

    return { success: true, html: result.html, reply: result.reply };
  }

  async generateForm(body: { prompt: string; businessName?: string; style?: string }) {
    return generateForm(body);
  }

  async publishForm(
    tenantId: string,
    formId: string,
    html: string,
    name: string,
  ): Promise<{ url: string }> {
    const url = `https://api.myflynai.com/api/website-builder/forms/p/${formId}`;
    await this.db().collection('public_forms').doc(formId).set({
      tenantId,
      formId,
      html,
      name,
      publishedUrl: url,
      updatedAt: new Date().toISOString(),
    });
    this.logger.log(`[publishForm] Published form ${formId} for tenant ${tenantId}`);
    return { url };
  }

  async getFormByIdPublic(formId: string): Promise<{ html: string; name: string } | null> {
    const doc = await this.db().collection('public_forms').doc(formId).get();
    if (!doc.exists) return null;
    const data = doc.data() as any;
    return { html: data.html ?? '', name: data.name ?? 'Form' };
  }

  async saveFormSubmission(
    formId: string,
    formData: Record<string, string>,
    submittedAt?: string,
  ): Promise<void> {
    await this.db()
      .collection('public_forms')
      .doc(formId)
      .collection('submissions')
      .add({
        formData,
        submittedAt: submittedAt ?? new Date().toISOString(),
        createdAt: Date.now(),
      });
    this.logger.log(`[saveFormSubmission] New submission for form ${formId}`);
  }

  async listFormSubmissions(tenantId: string, formId: string) {
    // Verify ownership
    const doc = await this.db().collection('public_forms').doc(formId).get();
    if (!doc.exists) throw new NotFoundException('Form not found');
    if (doc.data()?.tenantId !== tenantId) throw new BadRequestException('Unauthorized');

    const snap = await this.db()
      .collection('public_forms')
      .doc(formId)
      .collection('submissions')
      .orderBy('createdAt', 'desc')
      .get();

    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}
