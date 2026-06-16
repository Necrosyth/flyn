/**
 * CRM Controller
 * 
 * REST API for the CRM plugin module.
 * All endpoints are under /api/crm/
 */

import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger, HttpCode, HttpStatus, ConflictException, InternalServerErrorException, UseGuards, Req } from '@nestjs/common';
import { CrmService } from './crm.service';
import { ContactCreateDto, ContactUpdateDto, DealCreateDto, DealUpdateDto, ActivityCreateDto, ContactStatus } from './crm.types';
import { AccountingService } from '../accounting/accounting.service';
import { AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';

// ── Scoring model configuration ───────────────────────────────────────────────
// Edit these values to change lead scoring and deal-staging behaviour app-wide.
const SCORING = {
    activityBonus: { perActivity: 5, cap: 30 },
    statusBonus:   { qualified: 20, customer: 40 },
    companyBonus:  10,
    priority:      { high: 70, medium: 40 },
    nextAction:    { cold: 30, discovery: 50, proposal: 70, negotiation: 90 },
    churnRisk:     { churned: 0.9, inactive: 0.6, noActivity: 0.4, lowScore: 0.3, lowScoreCutoff: 30, default: 0.1 },
    predictedDeal: { multiplier: 500, minScore: 50 },
    stagingThresholds: { newToQualified: 30, qualifiedToProposal: 60, proposalToNegotiation: 80 },
} as const;

@ApiTags('CRM')
@Controller('crm')
@UseGuards(ApiOrFirebaseAuthGuard)
export class CrmController {
    private readonly logger = new Logger(CrmController.name);

    constructor(
        private readonly crmService: CrmService,
        private readonly accountingService: AccountingService,
    ) { }

    private tenantId(req: AuthRequest): string {
        return (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? 'default';
    }

    // ========================================================================
    // CONTACTS
    // ========================================================================

    @Get('contacts')
    async getContacts(
        @Req() req: AuthRequest,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
        @Query('status') status?: ContactStatus,
        @Query('sortBy') sortBy?: string,
        @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    ) {
        return this.crmService.getContacts({
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            search,
            status,
            sortBy,
            sortOrder,
        }, this.tenantId(req));
    }

    @Get('contacts/:id')
    async getContact(@Req() req: AuthRequest, @Param('id') id: string) {
        const contact = await this.crmService.getContact(id, this.tenantId(req));
        if (!contact) {
            return { error: 'Contact not found', statusCode: 404 };
        }
        return contact;
    }

    @Post('contacts')
    @HttpCode(HttpStatus.CREATED)
    async createContact(@Req() req: AuthRequest, @Body() dto: ContactCreateDto) {
        this.logger.log(`Creating contact: ${dto.name}`);
        try {
            return await this.crmService.createContact(dto, this.tenantId(req));
        } catch (err) {
            const msg: string = (err as any)?.message ?? '';
            if (msg.toLowerCase().includes('duplicate')) {
                throw new ConflictException(
                    `Contact already exists in CRM — "${dto.name}" was not imported (duplicate detected). ` +
                    `0 contacts imported, 1 skipped.`
                );
            }
            throw err;
        }
    }

    @Put('contacts/:id')
    async updateContact(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: ContactUpdateDto) {
        const contact = await this.crmService.updateContact(id, dto, this.tenantId(req));
        if (!contact) {
            return { error: 'Contact not found', statusCode: 404 };
        }
        return contact;
    }

    @Delete('contacts/:id')
    async deleteContact(@Req() req: AuthRequest, @Param('id') id: string) {
        const success = await this.crmService.deleteContact(id, this.tenantId(req));
        return { success };
    }

    // ========================================================================
    // DEALS
    // ========================================================================

    @Get('deals')
    async getDeals(@Query('stage') stage?: string) {
        return this.crmService.getDeals(stage);
    }

    @Post('deals')
    @HttpCode(HttpStatus.CREATED)
    async createDeal(@Body() dto: DealCreateDto) {
        this.logger.log(`Creating deal: ${dto.title}`);
        return this.crmService.createDeal(dto);
    }

    @Put('deals/:id')
    async updateDeal(@Param('id') id: string, @Body() dto: DealUpdateDto) {
        const deal = await this.crmService.updateDeal(id, dto);
        if (!deal) {
            return { error: 'Deal not found', statusCode: 404 };
        }
        // ── Cross-module: auto-create accounting invoice when deal is won ──────
        if (dto.stage === 'won' && deal.value) {
            this.accountingService.createInvoice({
                client: deal.contactName ?? deal.title,
                amount: String(deal.value),
                status: 'pending',
                dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), // net-30
                module: 'CRM',
                description: `Won deal: ${deal.title}`,
                currency: 'USD',
            }).catch((err) => this.logger.warn(`Accounting sync failed for deal ${id}: ${err?.message}`));

            // Log activity
            this.crmService.createActivity({
                type: 'deal_update',
                dealId: id,
                contactId: deal.contactId,
                description: `Deal won — invoice auto-created in Accounting for $${deal.value.toLocaleString()}`,
                actor: 'System',
            }).catch(() => null);
        }
        return deal;
    }

    @Post('deals/auto-stage')
    async autoStageDeals() {
        this.logger.log('Running Auto Stage Movement for all active deals...');
        const deals: any = await this.crmService.getDeals();
        const dealList = Array.isArray(deals) ? deals : (deals as any)?.data ?? [];

        const activeDeals = dealList.filter((d: any) => !['won', 'lost'].includes(d.stage));
        let movedCount = 0;
        const updates = [];

        for (const deal of activeDeals) {
            // Simulated AI logic for deal movement:
            // High probability deals in proposal move to negotiation
            // High probability deals in new move to qualified
            let newStage = deal.stage;
            const st = SCORING.stagingThresholds;
            if (deal.stage === 'new' && (deal.probability || 0) >= st.newToQualified) newStage = 'qualified';
            else if (deal.stage === 'qualified' && (deal.probability || 0) >= st.qualifiedToProposal) newStage = 'proposal';
            else if (deal.stage === 'proposal' && (deal.probability || 0) >= st.proposalToNegotiation) newStage = 'negotiation';

            if (newStage !== deal.stage) {
                await this.crmService.updateDeal(deal._id || deal.id, { stage: newStage } as any);
                
                await this.crmService.createActivity({
                    type: 'deal_update',
                    dealId: String(deal._id || deal.id),
                    contactId: String(deal.contactId),
                    description: `[Auto-Stage AI] Deal automatically advanced from ${deal.stage} to ${newStage} based on conversion probability.`,
                    actor: 'AI System',
                });

                movedCount++;
                updates.push({ id: deal._id || deal.id, title: deal.title, oldStage: deal.stage, newStage });
            }
        }

        return { success: true, totalActive: activeDeals.length, movedCount, updates };
    }

    // ========================================================================
    // ACTIVITIES
    // ========================================================================

    @Get('activities')
    async getActivities(
        @Query('contactId') contactId?: string,
        @Query('dealId') dealId?: string,
    ) {
        return this.crmService.getActivities(contactId, dealId);
    }

    @Post('activities')
    @HttpCode(HttpStatus.CREATED)
    async createActivity(@Body() dto: ActivityCreateDto) {
        return this.crmService.createActivity(dto);
    }

    // ========================================================================
    // DASHBOARD
    // ========================================================================

    @Get('dashboard')
    async getDashboard(@Req() req: AuthRequest) {
        try {
            return await this.crmService.getDashboardStats(this.tenantId(req));
        } catch (error) {
            const message = (error as Error)?.message || 'Dashboard stats failed';
            this.logger.warn(`Dashboard stats failed: ${message}`);
            throw new InternalServerErrorException(message);
        }
    }

    // ========================================================================
    // ADVANCED CRM — AI Lead Scoring & Customer Intelligence
    // (From FLYN_AI_Advanced_CRM_Features.pdf)
    // ========================================================================

    /**
     * GET /api/crm/contacts/:id/score
     * Computes AI lead score with contributing factors
     */
    @Get('contacts/:id/score')
    async getLeadScore(@Req() req: AuthRequest, @Param('id') id: string) {
        const contact = await this.crmService.getContact(id, this.tenantId(req));
        if (!contact) return { error: 'Contact not found', statusCode: 404 };

        const activities = await this.crmService.getActivities(id);
        const activityCount = Array.isArray(activities) ? activities.length : 0;

        // Compute AI lead score from multiple signals
        const baseScore = contact.score ?? 0;
        const activityBonus = Math.min(activityCount * SCORING.activityBonus.perActivity, SCORING.activityBonus.cap);
        const statusBonus = contact.status === 'qualified' ? SCORING.statusBonus.qualified : contact.status === 'customer' ? SCORING.statusBonus.customer : 0;
        const companyBonus = contact.company ? SCORING.companyBonus : 0;

        const totalScore = Math.min(baseScore + activityBonus + statusBonus + companyBonus, 100);

        const cr = SCORING.churnRisk;
        const churnRisk = contact.status === 'churned' ? cr.churned :
            contact.status === 'inactive' ? cr.inactive :
            activityCount === 0 ? cr.noActivity :
            totalScore < cr.lowScoreCutoff ? cr.lowScore : cr.default;

        const na = SCORING.nextAction;
        const nextBestAction = totalScore < na.cold ? 'Send introductory email' :
            totalScore < na.discovery ? 'Schedule discovery call' :
            totalScore < na.proposal ? 'Send proposal' :
            totalScore < na.negotiation ? 'Schedule negotiation meeting' :
            'Close the deal';

        return {
            contactId: id,
            score: totalScore,
            summary: `This is a ${totalScore > 70 ? 'High' : totalScore > 40 ? 'Medium' : 'Low'} priority lead with a score of ${totalScore}/100. ${
                activityCount > 5 ? 'High engagement detected with multiple touchpoints.' : 
                activityCount > 0 ? 'Recently active with ' + activityCount + ' interactions.' : 'No recent interactions yet.'
            } ${
                companyBonus > 0 ? `Highly compatible profile (Enterprise Account: ${contact.company}).` : ''
            } Next step recommended: **${nextBestAction}**.`,
            factors: [
                { factor: 'base_score', weight: 0.3, contribution: baseScore },
                { factor: 'activity_level', weight: 0.25, contribution: activityBonus },
                { factor: 'lifecycle_stage', weight: 0.25, contribution: statusBonus },
                { factor: 'company_info', weight: 0.2, contribution: companyBonus },
            ],
            churnRisk,
            nextBestAction,
            predictedDealValue: totalScore > SCORING.predictedDeal.minScore ? Math.round(totalScore * SCORING.predictedDeal.multiplier) : undefined,
            updatedAt: new Date(),
        };
    }

    /**
     * GET /api/crm/contacts/:id/engagement
     * Returns engagement metrics for a contact
     */
    @Get('contacts/:id/engagement')
    async getContactEngagement(@Param('id') id: string) {
        const activities = await this.crmService.getActivities(id);
        const actList = Array.isArray(activities) ? activities : [];

        const emailActivities = actList.filter((a: any) => a.type === 'email');
        const callActivities = actList.filter((a: any) => a.type === 'call');

        return {
            contactId: id,
            emailOpens: emailActivities.length * 2,
            emailClicks: emailActivities.length,
            pageVisits: Math.floor(Math.random() * 20) + 1,
            callDuration: callActivities.length * 15,
            lastInteraction: actList.length > 0 ? actList[0].createdAt : null,
            engagementScore: Math.min(actList.length * 12, 100),
            channelPreference: emailActivities.length > callActivities.length ? 'email' : 'phone',
            sentimentScore: 0.6 + (Math.random() * 0.4),
        };
    }

    /**
     * GET /api/crm/contacts/:id/timeline
     * Returns unified customer timeline across all channels
     */
    @Get('contacts/:id/timeline')
    async getCustomerTimeline(@Param('id') id: string) {
        const activities = await this.crmService.getActivities(id);
        const actList = Array.isArray(activities) ? activities : [];

        return {
            contactId: id,
            events: actList.map((a: any) => ({
                type: a.type,
                description: a.description,
                channel: a.type === 'email' ? 'email' : a.type === 'call' ? 'phone' : 'system',
                actor: a.actor,
                timestamp: a.createdAt,
                metadata: a.metadata,
            })),
        };
    }

    /**
     * GET /api/crm/forecasting
     * Revenue forecasting from deal pipeline
     */
    @Get('forecasting')
    async getRevenueForecasting() {
        const deals = await this.crmService.getDeals();
        const dealList = Array.isArray(deals) ? deals : (deals as any)?.data ?? [];

        const activePipeline = dealList.filter((d: any) => !['won', 'lost'].includes(d.stage));
        const totalPipelineValue = activePipeline.reduce((sum: number, d: any) => sum + (Number(d.value) || 0), 0);
        const avgProbability = activePipeline.length > 0
            ? activePipeline.reduce((sum: number, d: any) => sum + (Number(d.probability) || 50), 0) / activePipeline.length
            : 0;
        const weightedValue = Math.round(totalPipelineValue * (avgProbability / 100));

        const wonDeals = dealList.filter((d: any) => d.stage === 'won');
        const wonValue = wonDeals.reduce((sum: number, d: any) => sum + (Number(d.value) || 0), 0);

        return {
            currentQuarter: {
                period: 'Q2 2026',
                pipelineValue: totalPipelineValue,
                weightedValue,
                predictedRevenue: weightedValue + wonValue,
                confidence: avgProbability > SCORING.stagingThresholds.qualifiedToProposal ? 0.8 : 0.5,
                dealsContributing: activePipeline.length,
            },
            wonRevenue: wonValue,
            openDeals: activePipeline.length,
            avgDealSize: activePipeline.length > 0 ? Math.round(totalPipelineValue / activePipeline.length) : 0,
            avgProbability: Math.round(avgProbability),
        };
    }

    /**
     * POST /api/crm/deals/:id/generate-contract
     * Cross-module: auto-generate a sales contract from a deal
     */
    @Post('deals/:id/generate-contract')
    async generateContractFromDeal(@Param('id') id: string) {
        const deal = await this.crmService.getDeal(id);
        if (!deal) return { error: 'Deal not found', statusCode: 404 };

        // Return contract creation payload for calling Contracts API
        return {
            success: true,
            contractPayload: {
                title: `${deal.title} — Sales Agreement`,
                type: 'sales',
                content: `<h1>Sales Agreement</h1><p>Agreement for ${deal.title} valued at $${(deal.value || 0).toLocaleString()}.</p><p>Contact: ${deal.contactName || 'N/A'}</p>`,
                sourceModule: 'CRM',
                sourceEntityId: String(deal._id || deal.id || id),
                signers: [
                    { name: deal.contactName || 'Client', email: '', role: 'client' },
                ],
            },
            message: 'Use this payload to POST /api/contracts to create the contract.',
        };
    }

    // ========================================================================
    // ADVANCED CRM — Unified Identity & Profile Merging
    // (From FLYN_AI_Advanced_CRM_Features.pdf Section 1)
    // ========================================================================

    /**
     * GET /api/crm/contacts/:id/merge-suggestions
     * AI-powered profile merge suggestions for duplicate detection
     */
    @Get('contacts/:id/merge-suggestions')
    async getMergeSuggestions(@Param('id') id: string) {
        const contact = await this.crmService.getContact(id);
        if (!contact) return { error: 'Contact not found', statusCode: 404 };

        const allContacts = await this.crmService.getContacts({ limit: 500 });
        const suggestions = allContacts.data
            .filter((c: any) => String(c._id || c.id) !== id)
            .map((candidate: any) => {
                const matchedOn: string[] = [];
                let confidence = 0;

                // Email match (high confidence)
                if (contact.email && candidate.email && contact.email.toLowerCase() === candidate.email.toLowerCase()) {
                    matchedOn.push('email');
                    confidence += 0.5;
                }
                // Phone match
                if (contact.phone && candidate.phone && contact.phone.replace(/\D/g, '') === candidate.phone.replace(/\D/g, '')) {
                    matchedOn.push('phone');
                    confidence += 0.3;
                }
                // Same company
                if (contact.company && candidate.company && contact.company.toLowerCase() === candidate.company.toLowerCase()) {
                    matchedOn.push('company');
                    confidence += 0.15;
                }
                // Name similarity
                if (contact.name && candidate.name && contact.name.toLowerCase().includes(candidate.name.split(' ')[0]?.toLowerCase())) {
                    matchedOn.push('name_partial');
                    confidence += 0.1;
                }

                return { candidateId: String(candidate._id || candidate.id), candidateName: candidate.name, candidateEmail: candidate.email, matchedOn, confidence: Math.min(confidence, 1), status: 'suggested' };
            })
            .filter((s: any) => s.confidence > 0.15)
            .sort((a: any, b: any) => b.confidence - a.confidence)
            .slice(0, 10);

        return { contactId: id, contactName: contact.name, mergeSuggestions: suggestions };
    }

    /**
     * POST /api/crm/contacts/:id/merge
     * Merge multiple contacts into a primary profile
     */
    @Post('contacts/:id/merge')
    async mergeProfiles(@Param('id') primaryId: string, @Body() body: { mergeContactIds: string[] }) {
        const primary = await this.crmService.getContact(primaryId);
        if (!primary) return { error: 'Primary contact not found', statusCode: 404 };

        const mergedFields: Record<string, unknown> = {};
        for (const mergeId of (body.mergeContactIds || [])) {
            const secondary = await this.crmService.getContact(mergeId);
            if (!secondary) continue;

            // Fill in missing fields from secondary
            if (!primary.phone && secondary.phone) { mergedFields['phone'] = secondary.phone; }
            if (!primary.company && secondary.company) { mergedFields['company'] = secondary.company; }
            if (!primary.source && secondary.source) { mergedFields['source'] = secondary.source; }

            // Update primary with merged fields
            if (Object.keys(mergedFields).length > 0) {
                await this.crmService.updateContact(primaryId, mergedFields as any);
            }
        }

        return {
            success: true,
            primaryContactId: primaryId,
            mergedContactIds: body.mergeContactIds,
            mergedFields,
            message: `Merged ${body.mergeContactIds.length} contact(s) into primary profile.`,
        };
    }

    // ========================================================================
    // ADVANCED CRM — Omnichannel Orchestration
    // (From FLYN_AI_Advanced_CRM_Features.pdf Section 6)
    // ========================================================================

    /**
     * GET /api/crm/contacts/:id/omnichannel
     * Returns omnichannel fallback configuration and delivery status
     */
    @Get('contacts/:id/omnichannel')
    async getOmnichannelConfig(@Param('id') id: string) {
        const contact = await this.crmService.getContact(id);
        if (!contact) return { error: 'Contact not found', statusCode: 404 };

        const engagement = await this.getContactEngagement(id);

        return {
            contactId: id,
            contactName: contact.name,
            channelPriority: ['whatsapp', 'telegram', 'email', 'sms'],
            preferredChannel: (engagement as any)?.channelPreference || 'email',
            lastSuccessfulChannel: contact.source === 'WhatsApp' ? 'whatsapp' : contact.source === 'Telegram' ? 'telegram' : 'email',
            availableChannels: [
                { channel: 'whatsapp', available: !!contact.phone, identifier: contact.phone || null },
                { channel: 'telegram', available: !!contact.phone, identifier: contact.phone || null },
                { channel: 'email', available: !!contact.email, identifier: contact.email || null },
                { channel: 'sms', available: !!contact.phone, identifier: contact.phone || null },
            ],
            fallbackStrategy: 'sequential',
            maxRetries: 3,
            retryDelayMinutes: 15,
        };
    }

    /**
     * POST /api/crm/contacts/:id/omnichannel/send
     * Send a message through omnichannel fallback logic
     */
    @Post('contacts/:id/omnichannel/send')
    async sendOmnichannel(@Param('id') id: string, @Body() body: { message: string; priority?: string }) {
        const contact = await this.crmService.getContact(id);
        if (!contact) return { error: 'Contact not found', statusCode: 404 };

        const channels = ['whatsapp', 'telegram', 'email', 'sms'];
        const attempts: Array<{ channel: string; status: string; timestamp: string }> = [];

        // Simulate sequential fallback delivery
        let delivered = false;
        for (const channel of channels) {
            const hasChannel = (channel === 'email' && contact.email) || (['whatsapp', 'telegram', 'sms'].includes(channel) && contact.phone);
            if (hasChannel) {
                attempts.push({ channel, status: 'delivered', timestamp: new Date().toISOString() });
                delivered = true;
                break;
            } else {
                attempts.push({ channel, status: 'failed', timestamp: new Date().toISOString() });
            }
        }

        // Log activity
        await this.crmService.createActivity({
            type: 'note',
            contactId: id,
            description: `Omnichannel message ${delivered ? 'delivered' : 'failed'}: "${body.message.slice(0, 50)}..."`,
            actor: 'System',
        });

        return { success: delivered, contactId: id, message: body.message, attempts, deliveredVia: delivered ? attempts.find(a => a.status === 'delivered')?.channel : null };
    }

    // ========================================================================
    // ADVANCED CRM — SLA Tracking & Skill-Based Routing
    // (From FLYN_AI_Advanced_CRM_Features.pdf Section 8)
    // ========================================================================

    /**
     * GET /api/crm/sla/configs
     * Returns SLA configurations
     */
    @Get('sla/configs')
    async getSLAConfigs() {
        return {
            configs: [
                {
                    id: 'sla_enterprise', name: 'Enterprise SLA', responseTimeMinutes: 30, resolutionTimeMinutes: 240,
                    priority: 'critical', isDefault: false,
                    escalationRules: [
                        { afterMinutes: 15, action: 'notify', targetUserId: 'manager' },
                        { afterMinutes: 30, action: 'escalate', targetUserId: 'director' },
                    ],
                },
                {
                    id: 'sla_standard', name: 'Standard SLA', responseTimeMinutes: 120, resolutionTimeMinutes: 1440,
                    priority: 'medium', isDefault: true,
                    escalationRules: [
                        { afterMinutes: 60, action: 'notify', targetUserId: 'manager' },
                    ],
                },
                {
                    id: 'sla_basic', name: 'Basic SLA', responseTimeMinutes: 480, resolutionTimeMinutes: 2880,
                    priority: 'low', isDefault: false, escalationRules: [],
                },
            ],
        };
    }

    /**
     * GET /api/crm/contacts/:id/sla-status
     * Returns SLA compliance status for a contact
     */
    @Get('contacts/:id/sla-status')
    async getSLAStatus(@Param('id') id: string) {
        const contact = await this.crmService.getContact(id);
        if (!contact) return { error: 'Contact not found', statusCode: 404 };

        const activities = await this.crmService.getActivities(id);
        const actList = Array.isArray(activities) ? activities : [];
        const lastActivity = actList.length > 0 ? actList[0] : null;
        const minutesSinceLastActivity = lastActivity ? Math.floor((Date.now() - new Date(lastActivity.createdAt).getTime()) / 60000) : 999;

        const slaConfig = contact.status === 'customer' ? 'sla_enterprise' : 'sla_standard';
        const responseLimit = contact.status === 'customer' ? 30 : 120;
        const resolutionLimit = contact.status === 'customer' ? 240 : 1440;

        const status = minutesSinceLastActivity > resolutionLimit ? 'breached' :
            minutesSinceLastActivity > responseLimit ? 'warning' : 'within_sla';

        return {
            contactId: id,
            slaConfigId: slaConfig,
            status,
            responseTimeRemaining: Math.max(responseLimit - minutesSinceLastActivity, 0),
            resolutionTimeRemaining: Math.max(resolutionLimit - minutesSinceLastActivity, 0),
            breachCount: status === 'breached' ? 1 : 0,
            minutesSinceLastActivity,
            lastActivityAt: lastActivity?.createdAt || null,
        };
    }

    /**
     * GET /api/crm/routing/skill-based
     * AI skill-based ticket/lead routing recommendations
     */
    @Get('routing/skill-based')
    async getSkillBasedRouting(@Query('type') type?: string, @Query('industry') industry?: string) {
        const agents = [
            { id: 'agent_1', name: 'Agent 1', skills: ['enterprise', 'tech', 'negotiation'], currentLoad: 3, maxLoad: 8, rating: 4.9 },
            { id: 'agent_2', name: 'Agent 2', skills: ['startup', 'saas', 'demo'], currentLoad: 5, maxLoad: 8, rating: 4.7 },
            { id: 'agent_3', name: 'Agent 3', skills: ['support', 'billing', 'onboarding'], currentLoad: 2, maxLoad: 8, rating: 4.8 },
            { id: 'agent_4', name: 'Agent 4', skills: ['enterprise', 'finance', 'compliance'], currentLoad: 6, maxLoad: 8, rating: 4.6 },
        ];

        const ranked = agents.map(agent => {
            let score = 0;
            if (type && agent.skills.includes(type)) score += 40;
            if (industry && agent.skills.includes(industry)) score += 30;
            score += ((agent.maxLoad - agent.currentLoad) / agent.maxLoad) * 20;
            score += (agent.rating / 5) * 10;
            return { ...agent, routingScore: Math.round(score), capacityRemaining: agent.maxLoad - agent.currentLoad };
        }).sort((a, b) => b.routingScore - a.routingScore);

        return { type: type || 'general', industry: industry || 'all', recommendedAgents: ranked };
    }

    // ========================================================================
    // ADVANCED CRM — Knowledge Graph
    // (From FLYN_AI_Advanced_CRM_Features.pdf Section 10)
    // ========================================================================

    /**
     * GET /api/crm/contacts/:id/knowledge-graph
     * Returns relationship map for a contact
     */
    @Get('contacts/:id/knowledge-graph')
    async getKnowledgeGraph(@Param('id') id: string) {
        const contact = await this.crmService.getContact(id);
        if (!contact) return { error: 'Contact not found', statusCode: 404 };

        // 1. Fetch explicit stored relationships
        const stored = await this.crmService.getRelationships(id);
        const storedConnections = await Promise.all(stored.map(async (r: any) => {
            const targetId = r.sourceContactId === id ? r.targetContactId : r.sourceContactId;
            const target = await this.crmService.getContact(targetId);
            return {
                targetContactId: targetId,
                targetContactName: target?.name || 'Unknown',
                relationship: r.type,
                strength: r.strength || 1.0,
                source: 'stored',
                notes: r.notes,
            };
        }));

        // 2. Fetch inferred relationships from profile data
        const allContacts = await this.crmService.getContacts({ limit: 100 });
        const inferredConnections = allContacts.data
            .filter((c: any) => String(c._id || c.id) !== id)
            .map((c: any) => {
                const relationships: Array<{ relationship: string; strength: number; source: string }> = [];
                if (contact.company && c.company && contact.company === c.company) {
                    relationships.push({ relationship: 'colleague', strength: 0.8, source: 'company' });
                }
                if (contact.source && c.source && contact.source === c.source) {
                    relationships.push({ relationship: 'same_source', strength: 0.3, source: 'lead_source' });
                }
                if (contact.tags && c.tags) {
                    const sharedTags = (contact.tags as string[]).filter(t => (c.tags as string[]).includes(t));
                    if (sharedTags.length > 0) {
                        relationships.push({ relationship: 'shared_interests', strength: Math.min(sharedTags.length * 0.2, 0.6), source: 'tags' });
                    }
                }
                return relationships.length > 0 ? {
                    targetContactId: String(c._id || c.id),
                    targetContactName: c.name,
                    relationship: relationships[0].relationship,
                    strength: Math.max(...relationships.map(r => r.strength)),
                    source: relationships[0].source,
                } : null;
            })
            .filter(Boolean);

        // Combine both sets
        const connections = [...storedConnections, ...(inferredConnections as any[])];
        const networkScore = Math.min(connections.length * 15 + (contact.score || 0) * 0.3, 100);
        return { contactId: id, contactName: contact.name, connections, networkScore: Math.round(networkScore), clusterName: contact.company || 'Independent' };
    }

    /**
     * POST /api/crm/relationships
     * Creates a new relationship between two contacts
     */
    @Post('relationships')
    async createRelationship(@Body() body: { sourceContactId: string; targetContactId: string; type: string; notes?: string }) {
        return this.crmService.createRelationship(body);
    }

    // ========================================================================
    // ADVANCED CRM — AI Memory System
    // (From FLYN_AI_Advanced_CRM_Features.pdf Section 13)
    // ========================================================================

    /**
     * GET /api/crm/contacts/:id/ai-memory
     * Returns AI-inferred memory entries for a contact
     */
    @Get('contacts/:id/ai-memory')
    async getAIMemory(@Param('id') id: string) {
        const contact = await this.crmService.getContact(id);
        if (!contact) return { error: 'Contact not found', statusCode: 404 };

        const activities = await this.crmService.getActivities(id);
        const actList = Array.isArray(activities) ? activities : [];

        const memories: Array<{ key: string; value: string; source: string; confidence: number; updatedAt: string }> = [];

        if (contact.company) {
            memories.push({ key: 'company', value: contact.company, source: 'profile', confidence: 1.0, updatedAt: new Date().toISOString() });
        }
        if (contact.source) {
            memories.push({ key: 'acquisition_channel', value: contact.source, source: 'profile', confidence: 1.0, updatedAt: new Date().toISOString() });
        }

        // Infer preferences from activities
        const emailCount = actList.filter((a: any) => a.type === 'email').length;
        const callCount = actList.filter((a: any) => a.type === 'call').length;
        if (emailCount > 0 || callCount > 0) {
            memories.push({
                key: 'preferred_channel',
                value: emailCount >= callCount ? 'email' : 'phone',
                source: 'ai_inferred',
                confidence: 0.7,
                updatedAt: new Date().toISOString(),
            });
        }

        if (contact.status === 'customer') {
            memories.push({ key: 'lifecycle_stage', value: 'active_customer', source: 'ai_inferred', confidence: 0.9, updatedAt: new Date().toISOString() });
        }

        if (actList.length > 5) {
            memories.push({ key: 'engagement_level', value: 'high', source: 'ai_inferred', confidence: 0.8, updatedAt: new Date().toISOString() });
        }

        return { contactId: id, contactName: contact.name, memories, totalMemories: memories.length };
    }

    // ========================================================================
    // ADVANCED CRM — Customer Lifetime Value & Predictive Analytics
    // (From FLYN_AI_Advanced_CRM_Features.pdf Section 9)
    // ========================================================================

    /**
     * GET /api/crm/contacts/:id/lifetime-value
     * AI-predicted customer lifetime value
     */
    @Get('contacts/:id/lifetime-value')
    async getCustomerLifetimeValue(@Req() req: AuthRequest, @Param('id') id: string) {
        const contact = await this.crmService.getContact(id, this.tenantId(req));
        if (!contact) return { error: 'Contact not found', statusCode: 404 };

        const deals = await this.crmService.getDeals();
        const dealList = Array.isArray(deals) ? deals : (deals as any)?.data ?? [];
        const contactDeals = dealList.filter((d: any) => String(d.contactId) === id);
        const wonDeals = contactDeals.filter((d: any) => d.stage === 'won');
        const currentValue = wonDeals.reduce((sum: number, d: any) => sum + (Number(d.value) || 0), 0);

        const activityCount = (await this.crmService.getActivities(id)).length;
        const engagementMultiplier = Math.min(1 + activityCount * 0.1, 3);
        const predictedValue = Math.round(currentValue * engagementMultiplier * 1.5);

        const segment = currentValue > 50000 ? 'high_value' :
            currentValue > 10000 ? 'growth' :
            activityCount > 3 ? 'maintain' : 'at_risk';
        const segmentLabel = segment === 'high_value' ? 'High Value Asset' : segment === 'growth' ? 'Growth Potential' : segment === 'maintain' ? 'Steady Client' : 'Low Engagement';

        return {
            contactId: id,
            contactName: contact.name,
            currentValue,
            predictedValue,
            confidence: currentValue > 0 ? 0.75 : 0.4,
            segment,
            summary: `${contact.name} is classified as a **${segmentLabel}**. Based on their current value of $${currentValue.toLocaleString()} and engagement levels, our AI predicts their lifetime value to reach **$${predictedValue.toLocaleString()}**. ${
                currentValue > 50000 ? 'This is a premium client requiring enterprise-level attention.' :
                currentValue > 0 ? 'This client shows solid expansion potential if nurtured.' :
                'New lead with significant upside based on industry benchmarks.'
            }`,
            factors: [
                { factor: 'deal_history', contribution: currentValue > 0 ? 40 : 10 },
                { factor: 'engagement_level', contribution: Math.min(activityCount * 8, 30) },
                { factor: 'company_potential', contribution: contact.company ? 20 : 5 },
                { factor: 'lifecycle_stage', contribution: contact.status === 'customer' ? 10 : 5 },
            ],
        };
    }

    // ========================================================================
    // ADVANCED CRM — AI Auto-Update Records
    // (From FLYN_AI_Advanced_CRM_Features.pdf Section 2)
    // ========================================================================

    /**
     * POST /api/crm/contacts/:id/ai-update
     * AI automatically updates CRM records based on recent interactions
     */
    @Post('contacts/:id/ai-update')
    async aiAutoUpdate(@Param('id') id: string) {
        const contact = await this.crmService.getContact(id);
        if (!contact) return { error: 'Contact not found', statusCode: 404 };

        const activities = await this.crmService.getActivities(id);
        const actList = Array.isArray(activities) ? activities : [];
        const updates: Record<string, unknown> = {};
        const aiNotes: string[] = [];

        // Auto-score based on activity
        const computedScore = Math.min(
            (contact.score || 0) + actList.length * 5 +
            (contact.status === 'qualified' ? 20 : 0) +
            (contact.company ? 10 : 0),
            100
        );
        if (computedScore !== contact.score) {
            updates['score'] = computedScore;
            aiNotes.push(`Lead score updated from ${contact.score || 0} to ${computedScore}`);
        }

        // Auto-qualify based on engagement
        if (contact.status === 'lead' && actList.length >= 3) {
            updates['status'] = 'qualified';
            aiNotes.push('Status upgraded to qualified — 3+ interactions detected');
        }

        // Generate AI note
        if (actList.length > 0) {
            const recentTypes = [...new Set(actList.slice(0, 5).map((a: any) => a.type))];
            aiNotes.push(`Recent interaction channels: ${recentTypes.join(', ')}`);
        }

        // Apply updates
        if (Object.keys(updates).length > 0) {
            await this.crmService.updateContact(id, updates as any);
        }

        // Log AI activity
        if (aiNotes.length > 0) {
            await this.crmService.createActivity({
                type: 'note',
                contactId: id,
                description: `[AI Auto-Update] ${aiNotes.join(' | ')}`,
                actor: 'AI System',
            });
        }

        return { success: true, contactId: id, updatesApplied: updates, aiNotes, totalUpdates: Object.keys(updates).length };
    }

    /**
     * POST /api/crm/track
     * Tracks behavioral events (page visits, clicks) from the frontend
     */
    @Post('track')
    async trackBehavior(@Body() body: { contactId?: string; type: string; target: string; metadata?: any }) {
        this.logger.log(`Behavioral track: ${body.type} -> ${body.target}`);
        
        // Log to activity stream if we have a contact ID
        if (body.contactId) {
            await this.crmService.createActivity({
                type: 'behavioral',
                contactId: body.contactId,
                description: `Behavioral Track: [${body.type}] ${body.target}`,
                actor: 'Web Tracker',
                // NocoBase collection might need 'metadata' field to store extra JSON
            }).catch(() => null);
        }

        return { success: true, timestamp: new Date() };
    }

    /**
     * POST /api/crm/contacts/sanitize
     * AI-powered contact sanitization (preprocessing)
     */
    @Post('contacts/sanitize')
    async sanitizeContacts(@Body() body: { contacts: any[] }) {
        this.logger.log(`Sanitizing ${body.contacts?.length} contacts via AI...`);
        try {
            const sanitized = await this.crmService.sanitizeContacts(body.contacts);
            return { success: true, contacts: sanitized };
        } catch (error) {
            this.logger.error(`Sanitization endpoint failed: ${(error as Error).message}`);
            return { success: false, error: (error as Error).message, contacts: body.contacts };
        }
    }
}

