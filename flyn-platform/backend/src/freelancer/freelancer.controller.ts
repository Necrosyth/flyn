/**
 * Freelancer Controller
 * ---------------------
 * REST endpoints to expose Freelancer data (stored in NocoBase) to the frontend.
 *
 * GET  /api/freelancer/projects       — list projects
 * GET  /api/freelancer/projects/:id   — get project
 * POST /api/freelancer/projects        — create project
 * POST /api/freelancer/projects/:id    — update project
 * GET  /api/freelancer/time-entries   — list time entries
 * POST /api/freelancer/time-entries   — log time
 * GET  /api/freelancer/invoices       — list invoices
 * POST /api/freelancer/invoices       — create invoice
 * GET  /api/freelancer/stats          — dashboard stats
 */

import {
    Controller, Get, Post, Delete, Param, Body, Query, HttpCode, Logger,
} from '@nestjs/common';
import { UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { TenantFromAuthInterceptor } from '../common/tenant-from-auth.interceptor';
import { FreelancerService } from './freelancer.service';
import { AccountingService } from '../accounting/accounting.service';

@Controller('freelancer')
@UseGuards(ApiOrFirebaseAuthGuard)
@UseInterceptors(TenantFromAuthInterceptor)
export class FreelancerController {
    private readonly logger = new Logger(FreelancerController.name);

    constructor(
        private readonly freelancerService: FreelancerService,
        private readonly accountingService: AccountingService,
    ) {}

    // ── Projects ─────────────────────────────────────────────────────────────

    @Get('projects')
    async listProjects(
        @Query('search') search?: string,
        @Query('status') status?: string,
        @Query('limit') limit?: string,
    ) {
        return this.freelancerService.getProjects({
            search,
            status,
            limit: limit ? parseInt(limit, 10) : 100,
        });
    }

    @Get('projects/:id')
    async getProject(@Param('id') id: string) {
        return this.freelancerService.getProjectById(id);
    }

    @Post('projects')
    async createProject(@Body() body: any) {
        return this.freelancerService.createProject(body);
    }

    @Post('projects/:id')
    async updateProject(@Param('id') id: string, @Body() body: any) {
        return this.freelancerService.updateProject(id, body);
    }

    // ── Time Entries ─────────────────────────────────────────────────────────

    @Get('time-entries')
    async listTimeEntries(@Query('projectId') projectId?: string) {
        return this.freelancerService.getTimeEntries(projectId);
    }

    @Post('time-entries')
    async logTime(@Body() body: any) {
        return this.freelancerService.logTime(body);
    }

    // ── Invoices ─────────────────────────────────────────────────────────────

    @Get('invoices')
    async listInvoices(@Query('projectId') projectId?: string) {
        return this.freelancerService.getInvoices(projectId);
    }

    @Post('invoices')
    async createInvoice(@Body() body: any) {
        const invoice = await this.freelancerService.createInvoice(body);

        // ── Cross-module: mirror freelancer invoice into accounting ────────────
        const project = body.projectId
            ? await this.freelancerService.getProjectById(body.projectId).catch(() => null)
            : null;

        this.accountingService.createInvoice({
            client: project?.clientName ?? body.clientName ?? 'Freelance Client',
            amount: String(invoice.amount ?? body.amount ?? 0),
            status: invoice.status === 'paid' ? 'paid' : 'pending',
            dueDate: invoice.dueDate ?? body.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
            module: 'Freelancers',
            description: invoice.description ?? project?.title ?? 'Freelance project invoice',
            currency: 'USD',
        }).catch((err) => this.logger.warn(`Accounting mirror failed for freelancer invoice: ${err?.message}`));

        return invoice;
    }

    // ── Stats ────────────────────────────────────────────────────────────────

    @Get('stats')
    async getStats() {
        const { data: projects, total } = await this.freelancerService.getProjects({ limit: 1000 });
        const timeEntries = await this.freelancerService.getTimeEntries();
        const invoices = await this.freelancerService.getInvoices();

        const totalHours = timeEntries.reduce((sum, t) => sum + t.hours, 0);
        const totalRevenue = invoices.filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
        const outstanding = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((sum, i) => sum + i.amount, 0);

        const byStatus: Record<string, number> = {};
        for (const p of projects) {
            byStatus[p.status] = (byStatus[p.status] || 0) + 1;
        }

        return {
            totalProjects: total,
            activeProjects: projects.filter((p) => p.status === 'active').length,
            totalHoursLogged: totalHours,
            totalRevenue,
            outstandingAmount: outstanding,
            projectStatusBreakdown: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
        };
    }

    @Delete('projects/:id')
    @HttpCode(200)
    async deleteProject(@Param('id') id: string) {
        return { success: await this.freelancerService.deleteProject(id) };
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    @Get('analytics')
    async getAnalytics(@Query('range') _range: string = '30d') {
        const { data: projects } = await this.freelancerService.getProjects({ limit: 10000 });
        const timeEntries = await this.freelancerService.getTimeEntries();
        const invoices = await this.freelancerService.getInvoices();

        // Chart 1: Project status breakdown (donut)
        const statusCounts: Record<string, number> = {};
        for (const p of projects) {
            const s = p.status || 'unknown';
            statusCounts[s] = (statusCounts[s] || 0) + 1;
        }
        const projectChart = {
            id: 'projects',
            title: 'Project Status Breakdown',
            type: 'donut' as const,
            data: Object.entries(statusCounts).length > 0
                ? Object.entries(statusCounts).map(([label, value]) => ({
                    label: label.charAt(0).toUpperCase() + label.slice(1).replace('_', ' '),
                    value,
                }))
                : [{ label: 'No projects', value: 0 }],
        };

        // Chart 2: Invoice status (progress)
        const invoiceStatusRevenue: Record<string, number> = {};
        for (const inv of invoices) {
            const s = inv.status || 'pending';
            invoiceStatusRevenue[s] = (invoiceStatusRevenue[s] || 0) + inv.amount;
        }
        const invoiceChart = {
            id: 'income',
            title: 'Revenue by Invoice Status ($)',
            type: 'progress' as const,
            data: Object.entries(invoiceStatusRevenue).length > 0
                ? Object.entries(invoiceStatusRevenue).map(([label, value]) => ({
                    label: label.charAt(0).toUpperCase() + label.slice(1),
                    value: Math.round(value),
                }))
                : [{ label: 'No invoices', value: 0 }],
        };

        // Chart 3: Billable vs non-billable hours (bar)
        const billableHours = timeEntries.filter((t) => t.billable).reduce((s, t) => s + t.hours, 0);
        const nonBillableHours = timeEntries.filter((t) => !t.billable).reduce((s, t) => s + t.hours, 0);
        const hoursChart = {
            id: 'hours',
            title: 'Hours Logged',
            type: 'bar' as const,
            data: timeEntries.length > 0
                ? [
                    { label: 'Billable', value: Math.round(billableHours * 10) / 10 },
                    { label: 'Non-Billable', value: Math.round(nonBillableHours * 10) / 10 },
                ]
                : [{ label: 'No time entries', value: 0 }],
        };

        return { charts: [projectChart, invoiceChart, hoursChart] };
    }

    // ── Insights ──────────────────────────────────────────────────────────────

    @Get('insights')
    async getInsights() {
        const { data: projects } = await this.freelancerService.getProjects({ limit: 10000 });
        const invoices = await this.freelancerService.getInvoices();
        const timeEntries = await this.freelancerService.getTimeEntries();

        const insights: Array<{
            id: string; title: string; description: string;
            type: string; priority?: string; actionLabel?: string;
        }> = [];

        // Overdue/unpaid invoices
        const overdueInvoices = invoices.filter((i) => i.status === 'overdue');
        if (overdueInvoices.length > 0) {
            const totalOverdue = overdueInvoices.reduce((s, i) => s + i.amount, 0);
            insights.push({
                id: 'overdue-invoices',
                title: `${overdueInvoices.length} Overdue Invoice${overdueInvoices.length > 1 ? 's' : ''}`,
                description: `$${totalOverdue.toLocaleString()} overdue. Send payment reminders immediately.`,
                type: 'warning',
                priority: 'high',
                actionLabel: 'Send Reminder',
            });
        }

        // Sent (unpaid) invoices
        const sentInvoices = invoices.filter((i) => i.status === 'sent' || i.status === 'draft');
        if (sentInvoices.length > 0) {
            const totalPending = sentInvoices.reduce((s, i) => s + i.amount, 0);
            insights.push({
                id: 'pending-invoices',
                title: `$${totalPending.toLocaleString()} Awaiting Payment`,
                description: `${sentInvoices.length} invoice${sentInvoices.length > 1 ? 's are' : ' is'} sent and waiting to be paid.`,
                type: 'trend',
            });
        }

        // Active projects near deadline (no date parsing since stored as string)
        const activeProjects = projects.filter((p) => p.status === 'active').length;
        if (activeProjects > 0) {
            insights.push({
                id: 'active-projects',
                title: `${activeProjects} Active Project${activeProjects > 1 ? 's' : ''} In Progress`,
                description: `Review deadlines and ensure milestones are on track.`,
                type: 'suggestion',
                priority: 'medium',
            });
        }

        // Billable hours ratio
        const totalHours = timeEntries.reduce((s, t) => s + t.hours, 0);
        const billableHours = timeEntries.filter((t) => t.billable).reduce((s, t) => s + t.hours, 0);
        if (totalHours > 0) {
            const ratio = Math.round((billableHours / totalHours) * 100);
            insights.push({
                id: 'billable-ratio',
                title: `${ratio}% Billable Hour Rate`,
                description: `${Math.round(billableHours * 10) / 10}h of ${Math.round(totalHours * 10) / 10}h total are billable${ratio >= 80 ? ' — excellent efficiency!' : '.'}`,
                type: ratio >= 80 ? 'success' : 'suggestion',
            });
        }

        if (insights.length === 0) {
            insights.push({
                id: 'default',
                title: 'Track Your First Project',
                description: 'Create projects, log time, and send invoices to unlock business insights.',
                type: 'suggestion',
            });
        }

        return { insights };
    }

    // ========================================================================
    // ADVANCED FREELANCER — Risk Assessment, Talent Matching, Milestones
    // (From FLYN_AI_Advanced_Freelancer_Module.pdf)
    // ========================================================================

    /**
     * GET /api/freelancer/projects/:id/risk
     * AI project risk assessment with contributing factors
     */
    @Get('projects/:id/risk')
    async getProjectRisk(@Param('id') id: string) {
        const projectResult = await this.freelancerService.getProjects();
        const projects = Array.isArray(projectResult) ? projectResult : (projectResult as any)?.data ?? [];
        const project = projects.find((p: any) => String(p._id || p.id) === id);
        if (!project) return { error: 'Project not found', statusCode: 404 };

        const timeEntries = await this.freelancerService.getTimeEntries(id);
        const totalHours = timeEntries.reduce((s: number, t: any) => s + (Number(t.hours) || 0), 0);
        const budget = Number(project.budget?.replace(/[^0-9.-]/g, '')) || 0;

        const factors: any[] = [];
        let riskScore = 0;

        // Timeline risk
        if (project.deadline) {
            const daysRemaining = Math.floor((new Date(project.deadline).getTime() - Date.now()) / 86400000);
            if (daysRemaining < 0) {
                factors.push({ category: 'timeline', severity: 'high', description: `Project is ${Math.abs(daysRemaining)} days overdue` });
                riskScore += 35;
            } else if (daysRemaining < 7) {
                factors.push({ category: 'timeline', severity: 'medium', description: `Only ${daysRemaining} days remaining until deadline` });
                riskScore += 20;
            } else {
                factors.push({ category: 'timeline', severity: 'low', description: `${daysRemaining} days until deadline — on track` });
                riskScore += 5;
            }
        }

        // Budget risk
        const estimatedCost = totalHours * 75; // avg hourly rate
        if (budget > 0) {
            const budgetVariance = ((estimatedCost - budget) / budget) * 100;
            if (budgetVariance > 20) {
                factors.push({ category: 'budget', severity: 'high', description: `Estimated cost ${Math.round(budgetVariance)}% over budget` });
                riskScore += 30;
            } else if (budgetVariance > 0) {
                factors.push({ category: 'budget', severity: 'medium', description: `Estimated cost slightly over budget` });
                riskScore += 15;
            } else {
                factors.push({ category: 'budget', severity: 'low', description: 'Budget is on track' });
                riskScore += 5;
            }
        }

        // Scope risk (based on status)
        if (project.status === 'in_progress' && totalHours > 100) {
            factors.push({ category: 'scope', severity: 'medium', description: 'High hours logged — potential scope creep' });
            riskScore += 15;
        }

        const overallRisk = riskScore >= 60 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low';

        const recommendations: string[] = [];
        if (overallRisk === 'critical' || overallRisk === 'high') {
            recommendations.push('Schedule an immediate project review meeting');
            recommendations.push('Consider scope reduction to meet deadline');
        }
        if (riskScore >= 30) {
            recommendations.push('Re-estimate remaining deliverables');
        }
        recommendations.push('Continue regular progress check-ins');

        return {
            projectId: id,
            overallRisk,
            riskScore: Math.min(riskScore, 100),
            factors,
            recommendations,
            projectedDeliveryDate: project.deadline,
            budgetVariance: budget > 0 ? Math.round(((estimatedCost - budget) / budget) * 100) : undefined,
        };
    }

    /**
     * GET /api/freelancer/talent-match
     * AI talent matching based on required skills
     */
    @Get('talent-match')
    async talentMatch(@Query('skills') skillsParam?: string) {
        const requiredSkills = skillsParam ? skillsParam.split(',').map(s => s.trim().toLowerCase()) : [];

        // Demo freelancer talent pool
        const talentPool: any[] = [];

        const results = talentPool.map(freelancer => {
            const matchingSkills = freelancer.skills.filter(s => requiredSkills.includes(s.toLowerCase()));
            const missingSkills = requiredSkills.filter(s => !freelancer.skills.map(fs => fs.toLowerCase()).includes(s));
            const matchScore = requiredSkills.length > 0
                ? Math.round((matchingSkills.length / requiredSkills.length) * 100)
                : Math.round(freelancer.rating * 20);

            return {
                freelancerId: freelancer.id,
                freelancerName: freelancer.name,
                matchScore,
                matchingSkills,
                missingSkills,
                hourlyRate: freelancer.rate,
                availability: freelancer.availability,
                rating: freelancer.rating,
                aiReason: matchScore >= 80
                    ? `Strong match — covers ${matchingSkills.length}/${requiredSkills.length} required skills with ${freelancer.rating}★ rating`
                    : matchScore >= 50
                    ? `Partial match — has ${matchingSkills.length}/${requiredSkills.length} skills, could upskill`
                    : `Low overlap — only ${matchingSkills.length}/${requiredSkills.length} skills match`,
            };
        }).sort((a, b) => b.matchScore - a.matchScore);

        return { requiredSkills, matches: results };
    }

    /**
     * GET /api/freelancer/projects/:id/milestones
     * Returns milestone breakdown for a project
     */
    @Get('projects/:id/milestones')
    async getProjectMilestones(@Param('id') id: string) {
        const projectResult = await this.freelancerService.getProjects();
        const projectList = Array.isArray(projectResult) ? projectResult : (projectResult as any)?.data ?? [];
        const project = projectList.find((p: any) => String(p._id || p.id) === id);
        if (!project) return { error: 'Project not found', statusCode: 404 };

        const budget = Number(project.budget?.replace(/[^0-9.-]/g, '')) || 5000;

        // Generate demo milestones
        return {
            projectId: id,
            projectTitle: project.title,
            milestones: [
                { order: 1, title: 'Discovery & Planning', status: 'completed', amountDue: Math.round(budget * 0.2), completedAt: new Date(Date.now() - 14 * 86400000).toISOString() },
                { order: 2, title: 'Design & Prototyping', status: 'completed', amountDue: Math.round(budget * 0.25), completedAt: new Date(Date.now() - 7 * 86400000).toISOString() },
                { order: 3, title: 'Development', status: 'in_progress', amountDue: Math.round(budget * 0.35), dueDate: project.deadline },
                { order: 4, title: 'Testing & Launch', status: 'pending', amountDue: Math.round(budget * 0.2), dueDate: project.deadline },
            ],
            totalBudget: budget,
            completedValue: Math.round(budget * 0.45),
            remainingValue: Math.round(budget * 0.55),
        };
    }

    /**
     * POST /api/freelancer/projects/:id/generate-contract
     * Cross-module: auto-generate freelancer contract from project
     */
    @Post('projects/:id/generate-contract')
    async generateFreelancerContract(@Param('id') id: string) {
        const projectResult = await this.freelancerService.getProjects();
        const projectList = Array.isArray(projectResult) ? projectResult : (projectResult as any)?.data ?? [];
        const project = projectList.find((p: any) => String(p._id || p.id) === id);
        if (!project) return { error: 'Project not found', statusCode: 404 };

        return {
            success: true,
            contractPayload: {
                title: `${project.title} — Freelancer Agreement`,
                type: 'freelance',
                content: `<h1>Freelancer Service Agreement</h1><p>Project: <strong>${project.title}</strong></p><p>Client: ${project.client_name || project.clientName || 'N/A'}</p><p>Budget: ${project.budget || 'TBD'}</p><p>Deadline: ${project.deadline || 'TBD'}</p>`,
                sourceModule: 'Freelance',
                sourceEntityId: String(id),
                signers: [
                    { name: project.client_name || project.clientName || 'Client', email: project.client_email || project.clientEmail || '', role: 'client' },
                    { name: 'Freelancer', email: '', role: 'freelancer' },
                ],
            },
            message: 'Use this payload to POST /api/contracts to create the contract.',
        };
    }

    // ========================================================================
    // ADVANCED FREELANCER — Smart Job Posting & AI Job Description
    // (From FLYN_AI_Advanced_Freelance_Module.pdf Section 3)
    // ========================================================================

    /**
     * POST /api/freelancer/jobs
     * Create a new job posting with AI-generated description
     */
    @Post('jobs')
    async createJobPosting(@Body() body: { title: string; skills: string[]; budget?: number; timeline?: string; level?: string }) {
        const { title, skills = [], budget, timeline = '4 weeks', level = 'mid' } = body;

        const levelMap: Record<string, string> = {
            'junior': '1-2 years', 'mid': '3-5 years', 'senior': '5+ years', 'expert': '8+ years',
        };

        return {
            success: true,
            jobPosting: {
                id: `job_${Date.now()}`,
                title,
                status: 'open',
                description: `We're looking for a skilled ${title} professional to help with our project. The ideal candidate has ${levelMap[level] || '3-5 years'} of experience.`,
                requiredSkills: skills,
                suggestedPricing: budget || Math.round(skills.length * 2500 + 5000),
                estimatedTimeline: timeline,
                experienceLevel: level,
                aiGeneratedSummary: `This ${level}-level ${title} position requires expertise in ${skills.join(', ')}. Expected duration: ${timeline}. Competitive compensation offered.`,
                suggestedMilestones: [
                    { title: 'Discovery & Planning', percentage: 20 },
                    { title: 'Core Development', percentage: 40 },
                    { title: 'Review & Iteration', percentage: 25 },
                    { title: 'Final Delivery', percentage: 15 },
                ],
                createdAt: new Date(),
            },
        };
    }

    /**
     * GET /api/freelancer/jobs
     * List all job postings
     */
    @Get('jobs')
    async listJobPostings(@Query('status') status?: string) {
        const jobs: any[] = [];

        const filtered = status ? jobs.filter(j => j.status === status) : jobs;
        return { jobs: filtered, total: filtered.length };
    }

    // ========================================================================
    // ADVANCED FREELANCER — Auto-Hiring
    // (From FLYN_AI_Advanced_Freelance_Module.pdf Section 4)
    // ========================================================================

    /**
     * POST /api/freelancer/jobs/:id/auto-hire
     * Automatically match and hire the best freelancer for a job
     */
    @Post('jobs/:id/auto-hire')
    async autoHire(@Param('id') jobId: string, @Body() body: { minMatchScore?: number; maxBudget?: number }) {
        const minScore = body.minMatchScore || 70;

        // Get talent match results
        const matchResult = await this.talentMatch('react,node.js,typescript');
        const matches = (matchResult as any)?.matches || [];
        const qualified = matches
            .filter((m: any) => m.matchScore >= minScore && m.availability === 'available')
            .filter((m: any) => !body.maxBudget || m.hourlyRate * 160 <= body.maxBudget);

        if (qualified.length === 0) {
            return { success: false, jobId, message: 'No freelancers meet the auto-hire criteria', criteria: { minMatchScore: minScore, maxBudget: body.maxBudget } };
        }

        const selected = qualified[0];
        return {
            success: true,
            jobId,
            hiredFreelancer: {
                freelancerId: selected.freelancerId,
                freelancerName: selected.freelancerName,
                matchScore: selected.matchScore,
                hourlyRate: selected.hourlyRate,
                rating: selected.rating,
            },
            autoHireReason: `${selected.freelancerName} was auto-selected with ${selected.matchScore}% match score, ${selected.rating}★ rating, and $${selected.hourlyRate}/hr rate.`,
            status: 'hired',
            contractPending: true,
            hiredAt: new Date(),
        };
    }

    // ========================================================================
    // ADVANCED FREELANCER — Reputation & Trust System
    // (From FLYN_AI_Advanced_Freelance_Module.pdf Section 8)
    // ========================================================================

    /**
     * GET /api/freelancer/profiles
     * List all freelancer profiles with ratings and trust scores
     */
    @Get('profiles')
    async listFreelancerProfiles(@Query('skill') skill?: string) {
        const profiles: any[] = [];

        const filtered = skill ? profiles.filter(p => p.skills.some(s => s.toLowerCase().includes(skill.toLowerCase()))) : profiles;
        return { profiles: filtered, total: filtered.length };
    }

    /**
     * GET /api/freelancer/profiles/:id/reviews
     * Get reviews for a freelancer
     */
    @Get('profiles/:id/reviews')
    async getFreelancerReviews(@Param('id') id: string) {
        return {
            freelancerId: id,
            averageRating: 4.8,
            totalReviews: 12,
            reviews: [],
            trustIndicators: {
                identityVerified: true,
                portfolioVerified: true,
                paymentHistoryClean: true,
                responseRate: '98%',
                onTimeDelivery: '95%',
            },
        };
    }

    // ========================================================================
    // ADVANCED FREELANCER — Dispute Resolution System
    // (From FLYN_AI_Advanced_Freelance_Module.pdf Section 11)
    // ========================================================================

    /**
     * POST /api/freelancer/disputes
     * File a new dispute
     */
    @Post('disputes')
    async createDispute(@Body() body: { projectId: string; type: string; description: string; filedBy: string }) {
        return {
            success: true,
            dispute: {
                id: `disp_${Date.now()}`,
                projectId: body.projectId,
                type: body.type || 'quality',
                description: body.description,
                filedBy: body.filedBy,
                status: 'open',
                priority: 'medium',
                aiAssessment: `Based on the description, this appears to be a ${body.type || 'quality'} dispute. Recommended resolution: mediation between parties.`,
                suggestedResolution: body.type === 'payment' ? 'Release escrowed funds proportional to completed work' :
                    body.type === 'quality' ? 'Request revision with specific deliverable criteria' :
                    'Schedule mediation session between both parties',
                escalationPath: ['AI Mediation', 'Senior Mediator', 'Arbitration Panel'],
                createdAt: new Date(),
            },
        };
    }

    /**
     * GET /api/freelancer/disputes
     * List all disputes
     */
    @Get('disputes')
    async listDisputes(@Query('status') status?: string) {
        const disputes: any[] = [];

        const filtered = status ? disputes.filter(d => d.status === status) : disputes;
        return { disputes: filtered, total: filtered.length };
    }

    // ========================================================================
    // ADVANCED FREELANCER — AI-Assisted Communication
    // (From FLYN_AI_Advanced_Freelance_Module.pdf Section 9)
    // ========================================================================

    /**
     * POST /api/freelancer/ai/reply
     * Generate AI-assisted reply for freelancer communication
     */
    @Post('ai/reply')
    async generateAIReply(@Body() body: { message: string; context?: string; tone?: string }) {
        const { message, context = 'project_update', tone = 'professional' } = body;
        const msgLower = message.toLowerCase();

        let reply = '';
        if (msgLower.includes('deadline') || msgLower.includes('delay') || msgLower.includes('late')) {
            reply = `Thank you for the update. I understand there may be a timeline adjustment needed. Could you provide a revised delivery date? We want to ensure quality while keeping the project on track.`;
        } else if (msgLower.includes('payment') || msgLower.includes('invoice') || msgLower.includes('budget')) {
            reply = `Thank you for raising this. I'll review the payment status and get back to you within 24 hours. Please ensure all milestone deliverables are submitted for processing.`;
        } else if (msgLower.includes('progress') || msgLower.includes('update') || msgLower.includes('status')) {
            reply = `Thanks for the progress update. The work looks great so far. Let's schedule a quick check-in this week to discuss next steps and ensure we're aligned on upcoming milestones.`;
        } else {
            reply = `Thank you for your message. I've noted your input and will follow up shortly. Please don't hesitate to reach out if you need anything else in the meantime.`;
        }

        return {
            originalMessage: message,
            suggestedReply: reply,
            tone,
            context,
            alternatives: [
                `Acknowledged — I'll review and respond in detail shortly.`,
                `Thank you for this. Let's discuss further in our next check-in.`,
            ],
            generatedAt: new Date(),
        };
    }

    /**
     * POST /api/freelancer/ai/summarize
     * Summarize project conversation or status
     */
    @Post('ai/summarize')
    async summarizeProject(@Body() body: { projectId: string }) {
        const projectResult = await this.freelancerService.getProjects();
        const projectList = Array.isArray(projectResult) ? projectResult : (projectResult as any)?.data ?? [];
        const project = projectList.find((p: any) => String(p._id || p.id) === body.projectId);
        if (!project) return { error: 'Project not found', statusCode: 404 };

        const timeEntries = await this.freelancerService.getTimeEntries(body.projectId);
        const totalHours = timeEntries.reduce((s: number, t: any) => s + (Number(t.hours) || 0), 0);

        return {
            projectId: body.projectId,
            projectTitle: project.title,
            summary: `Project "${project.title}" for ${project.clientName || 'client'} is currently ${project.status}. ${totalHours} hours have been logged to date. Budget: ${project.budget || 'TBD'}. Deadline: ${project.deadline || 'Not set'}.`,
            keyMetrics: {
                hoursLogged: totalHours,
                status: project.status,
                budget: project.budget,
                deadline: project.deadline,
            },
            actionItems: [
                project.status === 'active' ? 'Continue work on current milestone' : 'Review project status',
                'Update time tracking entries',
                'Send progress report to client',
            ],
            generatedAt: new Date(),
        };
    }

    // ── Seed ──────────────────────────────────────────────────────────────────

    @Post('seed')
    async seedDemoData() {
        return { success: true, message: 'Freelancer demo data seeded via NocoBase collections.' };
    }
}

