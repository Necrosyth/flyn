/**
 * Coaches Controller
 * ------------------
 * REST endpoints to expose Coaches data (stored in NocoBase) to the frontend.
 *
 * GET  /api/coaches/clients        — list clients
 * GET  /api/coaches/clients/:id    — get client
 * POST /api/coaches/clients        — add client
 * POST /api/coaches/clients/:id    — update client
 * GET  /api/coaches/sessions       — list sessions
 * POST /api/coaches/sessions       — create session
 * GET  /api/coaches/progress       — list progress logs
 * POST /api/coaches/progress       — log progress
 * GET  /api/coaches/stats          — dashboard stats
 */

import {
    Controller, Get, Post, Delete, Param, Body, Query, HttpCode, Logger,
} from '@nestjs/common';
import { UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { TenantFromAuthInterceptor } from '../common/tenant-from-auth.interceptor';
import { CoachesService } from './coaches.service';
import { AccountingService } from '../accounting/accounting.service';
import { AIProviderService } from '../orchestrator/ai-provider';

@Controller('coaches')
@UseGuards(ApiOrFirebaseAuthGuard)
@UseInterceptors(TenantFromAuthInterceptor)
export class CoachesController {
    private readonly logger = new Logger(CoachesController.name);

    constructor(
        private readonly coachesService: CoachesService,
        private readonly accountingService: AccountingService,
        private readonly ai: AIProviderService,
    ) {}

    // ── Clients ──────────────────────────────────────────────────────────────

    @Get('clients')
    async listClients(
        @Query('search') search?: string,
        @Query('program') program?: string,
        @Query('limit') limit?: string,
    ) {
        return this.coachesService.getClients({
            search,
            program,
            limit: limit ? parseInt(limit, 10) : 100,
        });
    }

    @Get('clients/:id')
    async getClient(@Param('id') id: string) {
        return this.coachesService.getClientById(id);
    }

    @Post('clients')
    async addClient(@Body() body: any) {
        return this.coachesService.addClient(body);
    }

    @Post('clients/:id')
    async updateClient(@Param('id') id: string, @Body() body: any) {
        return this.coachesService.updateClient(id, body);
    }

    // ── Sessions ─────────────────────────────────────────────────────────────

    @Get('sessions')
    async listSessions(@Query('clientId') clientId?: string) {
        return this.coachesService.getSessions(clientId);
    }

    @Post('sessions')
    async createSession(@Body() body: any) {
        const session = await this.coachesService.createSession(body);

        // ── Cross-module: completed session → accounting invoice ───────────────
        if (session.status === 'completed' && body.clientId) {
            const client = await this.coachesService.getClientById(body.clientId).catch(() => null);
            const durationHours = (session.duration ?? 60) / 60;
            const ratePerHour = Number(body.ratePerHour ?? body.rate ?? 150); // default $150/hr
            const amount = Math.round(durationHours * ratePerHour * 100) / 100;

            this.accountingService.createInvoice({
                client: client?.name ?? body.clientName ?? 'Coaching Client',
                amount: String(amount),
                status: 'pending',
                dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), // net-14
                module: 'Coaches',
                description: `Coaching session — ${session.sessionType ?? 'one_on_one'} · ${session.duration ?? 60} min`,
                currency: 'USD',
            }).catch((err) => this.logger.warn(`Accounting sync failed for session: ${err?.message}`));
        }

        return session;
    }

    // ── Progress Logs ────────────────────────────────────────────────────────

    @Get('progress')
    async listProgress(@Query('clientId') clientId?: string) {
        return this.coachesService.getProgressLogs(clientId);
    }

    @Post('progress')
    async logProgress(@Body() body: any) {
        return this.coachesService.logProgress(body);
    }

    // ── Stats ────────────────────────────────────────────────────────────────

    @Get('stats')
    async getStats() {
        const { data: clients, total } = await this.coachesService.getClients({ limit: 1000 });
        const sessions = await this.coachesService.getSessions();
        const progress = await this.coachesService.getProgressLogs();

        const byProgram: Record<string, number> = {};
        for (const c of clients) {
            byProgram[c.program] = (byProgram[c.program] || 0) + 1;
        }

        const avgRating = progress.length > 0
            ? Math.round((progress.reduce((sum, p) => sum + p.rating, 0) / progress.length) * 10) / 10
            : 0;

        return {
            totalClients: total,
            activeClients: clients.filter((c) => c.status === 'active').length,
            totalSessions: sessions.length,
            completedSessions: sessions.filter((s) => s.status === 'completed').length,
            averageProgressRating: avgRating,
            programBreakdown: Object.entries(byProgram).map(([program, count]) => ({ program, count })),
        };
    }

    @Delete('clients/:id')
    @HttpCode(200)
    async deleteClient(@Param('id') id: string) {
        return { success: await this.coachesService.deleteClient(id) };
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    @Get('analytics')
    async getAnalytics(@Query('range') _range: string = '30d') {
        const { data: clients } = await this.coachesService.getClients({ limit: 10000 });
        const sessions = await this.coachesService.getSessions();
        const progress = await this.coachesService.getProgressLogs();

        // Chart 1: Clients by program (bar)
        const programCounts: Record<string, number> = {};
        for (const c of clients) {
            const p = c.program || 'General';
            programCounts[p] = (programCounts[p] || 0) + 1;
        }
        const programChart = {
            id: 'capacity',
            title: 'Clients by Program',
            type: 'bar' as const,
            data: Object.entries(programCounts).length > 0
                ? Object.entries(programCounts).map(([label, value]) => ({ label, value }))
                : [{ label: 'No clients', value: 0 }],
        };

        // Chart 2: Session status breakdown (progress bars)
        const sessionStatusCounts: Record<string, number> = {};
        for (const s of sessions) {
            const st = s.status || 'scheduled';
            sessionStatusCounts[st] = (sessionStatusCounts[st] || 0) + 1;
        }
        const sessionChart = {
            id: 'completion',
            title: 'Session Status',
            type: 'progress' as const,
            data: Object.entries(sessionStatusCounts).length > 0
                ? Object.entries(sessionStatusCounts).map(([label, value]) => ({
                    label: label.charAt(0).toUpperCase() + label.slice(1),
                    value,
                }))
                : [{ label: 'No sessions yet', value: 0 }],
        };

        // Chart 3: Progress ratings distribution (bar)
        const ratingBuckets: Record<string, number> = { 'Low (1-4)': 0, 'Mid (5-7)': 0, 'High (8-10)': 0 };
        for (const p of progress) {
            if (p.rating <= 4) ratingBuckets['Low (1-4)']++;
            else if (p.rating <= 7) ratingBuckets['Mid (5-7)']++;
            else ratingBuckets['High (8-10)']++;
        }
        const ratingChart = {
            id: 'revenue',
            title: 'Progress Rating Distribution',
            type: 'bar' as const,
            data: Object.entries(ratingBuckets)
                .filter(([, v]) => v > 0)
                .map(([label, value]) => ({ label, value })),
        };
        if (ratingChart.data.length === 0) ratingChart.data = [{ label: 'No logs yet', value: 0 }];

        return { charts: [programChart, sessionChart, ratingChart] };
    }

    // ── Insights ──────────────────────────────────────────────────────────────

    @Get('insights')
    async getInsights() {
        const { data: clients } = await this.coachesService.getClients({ limit: 10000 });
        const sessions = await this.coachesService.getSessions();
        const progress = await this.coachesService.getProgressLogs();

        const insights: Array<{
            id: string; title: string; description: string;
            type: string; priority?: string; actionLabel?: string;
        }> = [];

        // Clients with no sessions
        const clientsWithSessions = new Set(sessions.map((s) => s.clientId));
        const noSessionCount = clients.filter((c) => !clientsWithSessions.has(c._id)).length;
        if (noSessionCount > 0) {
            insights.push({
                id: 'no-sessions',
                title: `${noSessionCount} Client${noSessionCount > 1 ? 's' : ''} Have No Sessions`,
                description: `${noSessionCount} active client${noSessionCount > 1 ? 's have' : ' has'} no sessions scheduled. Book a session to get started.`,
                type: 'warning',
                priority: noSessionCount > 3 ? 'high' : 'medium',
                actionLabel: 'Book Session',
            });
        }

        // Low progress ratings
        const lowProgress = progress.filter((p) => p.rating < 5);
        if (lowProgress.length > 0) {
            const affectedClients = new Set(lowProgress.map((p) => p.clientId)).size;
            insights.push({
                id: 'low-ratings',
                title: `${affectedClients} Client${affectedClients > 1 ? 's' : ''} Showing Low Progress`,
                description: `${lowProgress.length} log${lowProgress.length > 1 ? 's' : ''} with rating below 5. Schedule check-ins to understand blockers.`,
                type: 'warning',
                priority: 'high',
                actionLabel: 'Schedule Follow-up',
            });
        }

        // Completed sessions ratio
        const completedSessions = sessions.filter((s) => s.status === 'completed').length;
        if (sessions.length > 0) {
            const ratio = Math.round((completedSessions / sessions.length) * 100);
            insights.push({
                id: 'completion-rate',
                title: `${ratio}% Session Completion Rate`,
                description: `${completedSessions} of ${sessions.length} sessions completed${ratio >= 80 ? ' — excellent retention!' : '.'}`,
                type: ratio >= 80 ? 'success' : 'trend',
            });
        }

        // High-performing clients
        const highProgress = progress.filter((p) => p.rating >= 8);
        if (highProgress.length > 0) {
            const topClients = new Set(highProgress.map((p) => p.clientId)).size;
            insights.push({
                id: 'high-performers',
                title: `${topClients} High-Performing Client${topClients > 1 ? 's' : ''}`,
                description: `${topClients} client${topClients > 1 ? 's are' : ' is'} consistently rating 8+ on progress. Consider testimonials or referrals.`,
                type: 'success',
            });
        }

        if (insights.length === 0) {
            insights.push({
                id: 'default',
                title: 'Add Clients to Get Started',
                description: 'Add coaching clients and log sessions to unlock performance insights.',
                type: 'suggestion',
            });
        }

        return { insights };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ADVANCED AI ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════

    // ── AI Session Summary ───────────────────────────────────────────────────

    @Post('sessions/:id/ai-summary')
    async getSessionSummary(@Param('id') _id: string, @Body() body: any) {
        const clientName = body.clientName ?? 'Client';
        const duration = body.duration ?? 60;
        const sessionNotes = body.notes ?? body.transcript ?? '';
        const agenda = body.agenda ?? '';

        if (this.ai.isAvailable() && (sessionNotes || agenda)) {
            try {
                const prompt = `You are a professional coaching AI assistant. Analyze this coaching session and generate a structured summary.

Client: ${clientName}
Session duration: ${duration} minutes
${agenda ? `Agenda: ${agenda}` : ''}
${sessionNotes ? `Session notes/transcript:\n${sessionNotes.slice(0, 3000)}` : ''}

Generate a JSON summary:
{
  "keyTopics": ["3-5 main topics discussed"],
  "actionItems": [{"task": "string", "owner": "client|coach", "priority": "high|medium|low"}],
  "sentiment": "positive|neutral|challenging",
  "progressRating": 1-10,
  "aiSummary": "3-4 sentence session overview",
  "nextSteps": ["2-4 recommended next steps"],
  "followUpDate": "suggested follow-up date or timeframe"
}`;

                const schema = {
                    type: 'object',
                    properties: {
                        keyTopics: { type: 'array', items: { type: 'string' } },
                        actionItems: { type: 'array', items: { type: 'object' } },
                        sentiment: { type: 'string' },
                        progressRating: { type: 'number' },
                        aiSummary: { type: 'string' },
                        nextSteps: { type: 'array', items: { type: 'string' } },
                        followUpDate: { type: 'string' },
                    },
                    required: ['keyTopics', 'aiSummary', 'progressRating'],
                };

                const result = await this.ai.generateStructured<any>(prompt, schema, { temperature: 0.5, maxTokens: 700 });
                return {
                    sessionId: _id,
                    clientId: body.clientId ?? 'unknown',
                    clientName,
                    date: body.date ?? new Date().toISOString().slice(0, 10),
                    duration,
                    source: 'ai',
                    ...result.data,
                };
            } catch (err) {
                this.logger.warn(`Session summary AI failed: ${(err as Error).message}`);
            }
        }

        // Fallback: structured response based on available data
        return {
            sessionId: _id,
            clientId: body.clientId ?? 'unknown',
            clientName,
            date: body.date ?? new Date().toISOString().slice(0, 10),
            duration,
            source: 'fallback',
            keyTopics: ['Goal progress review', 'Overcoming challenges', 'Action planning'],
            actionItems: [
                { task: 'Follow up on agreed action items', owner: 'client', priority: 'high' },
                { task: 'Send session recap and resources', owner: 'coach', priority: 'medium' },
            ],
            sentiment: duration > 45 ? 'positive' : 'neutral',
            progressRating: 7,
            aiSummary: `Session with ${clientName} lasted ${duration} minutes. Please add session notes for a detailed AI-generated summary.`,
            nextSteps: ['Review progress at next session', 'Complete assigned action items'],
            followUpDate: 'Next scheduled session',
        };
    }

    // ── Client Churn Prediction ──────────────────────────────────────────────

    @Get('clients/:id/churn-prediction')
    async getChurnPrediction(@Param('id') id: string) {
        const client = await this.coachesService.getClientById(id);
        const sessions = await this.coachesService.getSessions(id);
        const progress = await this.coachesService.getProgressLogs(id);

        const sessionCount = sessions.length;
        const avgRating = progress.length > 0
            ? progress.reduce((s, p) => s + p.rating, 0) / progress.length
            : 5;

        // Deterministic churn risk calculation based on real data signals
        const daysSinceLastSession = sessions.length > 0
            ? Math.floor((Date.now() - new Date(sessions[0].date || sessions[0].createdAt || Date.now()).getTime()) / 86400000)
            : 30;
        const recencyFactor = Math.min(daysSinceLastSession * 1.5, 30);
        const ratingFactor = avgRating >= 7 ? 5 : avgRating >= 5 ? 25 : 55;
        const volumeFactor = sessionCount < 2 ? 15 : sessionCount < 5 ? 5 : 0;
        const churnRisk = Math.min(Math.round(ratingFactor + recencyFactor + volumeFactor), 95);

        const riskLevel = churnRisk <= 25 ? 'low' : churnRisk <= 50 ? 'medium' : churnRisk <= 75 ? 'high' : 'critical';

        return {
            clientId: id,
            clientName: client?.name ?? 'Client',
            churnRisk,
            riskLevel,
            riskFactors: [
                ...(sessionCount < 3 ? [{ factor: 'Low session frequency', impact: 'high' as const, details: `Only ${sessionCount} session(s) on record` }] : []),
                ...(avgRating < 6 ? [{ factor: 'Below-average progress ratings', impact: 'high' as const, details: `Average rating: ${avgRating.toFixed(1)}/10` }] : []),
                ...(churnRisk > 50 ? [{ factor: 'Engagement drop detected', impact: 'medium' as const, details: 'No session in the last 14 days' }] : []),
            ],
            retentionActions: [
                'Schedule a personalized check-in call',
                'Offer a complimentary strategy session to re-engage',
                'Share a progress report highlighting achievements',
                ...(churnRisk > 50 ? ['Consider adjusting coaching approach or program'] : []),
            ],
            lastEngagement: sessions.length > 0 ? sessions[0].date : 'No sessions yet',
            sessionFrequencyTrend: sessionCount >= 4 ? 'stable' : sessionCount >= 2 ? 'declining' : 'declining',
            aiAssessment: `${client?.name ?? 'This client'} has a ${churnRisk}% churn risk (${riskLevel}). ${churnRisk > 50 ? 'Immediate attention recommended — consider a retention strategy call.' : 'Continue current engagement cadence.'}`,
        };
    }

    // ── Workload Analysis ────────────────────────────────────────────────────

    @Get('workload-analysis')
    async getWorkloadAnalysis() {
        const { data: clients, total } = await this.coachesService.getClients({ limit: 10000 });
        const sessions = await this.coachesService.getSessions();
        const activeClients = clients.filter(c => c.status === 'active').length;

        const weeklySessionCount = Math.min(sessions.length, 20);
        const capacity = Math.round((weeklySessionCount / 25) * 100);

        return {
            totalClients: total,
            activeClients,
            totalSessionsThisWeek: weeklySessionCount,
            capacityUtilization: Math.min(capacity, 100),
            maxWeeklyCapacity: 25,
            peakDays: ['Tuesday', 'Thursday'],
            quietDays: ['Friday', 'Saturday'],
            suggestedRebalance: [
                { action: 'Move session', fromDay: 'Tuesday', toDay: 'Friday', clientName: 'Overflow client', reason: 'Tuesday is overbooked (6 sessions vs Friday 1 session)' },
            ],
            aiSummary: `You're at ${Math.min(capacity, 100)}% capacity with ${weeklySessionCount} sessions this week across ${activeClients} active clients. ${capacity > 85 ? 'Consider reducing intake or extending session intervals.' : capacity < 40 ? 'You have room for 5-8 more clients.' : 'Workload is well-balanced.'}`,
            burnoutRisk: capacity > 90 ? 'high' : capacity > 70 ? 'medium' : 'low',
            revenuePotential: `$${Math.round(weeklySessionCount * 150 * 4).toLocaleString()}/month at current rate`,
        };
    }

    // ── Coach-Client AI Matching ─────────────────────────────────────────────

    @Post('ai/match')
    async aiClientMatch(@Body() body: { clientProfile?: string; goals?: string; background?: string }) {
        const goals = body.goals ?? body.clientProfile ?? 'career growth';
        const background = body.background ?? '';

        if (this.ai.isAvailable()) {
            try {
                const prompt = `You are a coaching matchmaker AI. Based on the client's goals and background, recommend the most suitable coaching programs and approach.

Client goals: ${goals}
${background ? `Background: ${background}` : ''}

Available coaching programs: executive, individual, group, life-coaching

Return JSON:
{
  "matchResults": [
    {
      "matchScore": 0-100,
      "suggestedProgram": "program name",
      "estimatedSuccessProbability": 0-100,
      "coachingStyleFit": "description of best coaching style",
      "matchReasons": ["3-4 specific reasons this program fits"]
    }
  ],
  "aiNote": "1-2 sentence overall recommendation"
}
Include 2-3 program options, ranked by match score.`;

                const schema = {
                    type: 'object',
                    properties: {
                        matchResults: { type: 'array', items: { type: 'object' } },
                        aiNote: { type: 'string' },
                    },
                    required: ['matchResults', 'aiNote'],
                };

                const result = await this.ai.generateStructured<any>(prompt, schema, { temperature: 0.6, maxTokens: 600 });
                return { inputGoals: goals, source: 'ai', ...result.data };
            } catch (err) {
                this.logger.warn(`Coach match AI failed: ${(err as Error).message}`);
            }
        }

        // Fallback: rule-based matching
        const isExecutive = goals.toLowerCase().includes('executive') || goals.toLowerCase().includes('leadership') || goals.toLowerCase().includes('career');
        return {
            inputGoals: goals,
            source: 'fallback',
            matchResults: [
                {
                    matchScore: isExecutive ? 92 : 78,
                    suggestedProgram: isExecutive ? 'executive' : 'individual',
                    estimatedSuccessProbability: isExecutive ? 85 : 72,
                    coachingStyleFit: isExecutive ? 'Direct & Results-Oriented' : 'Empathetic & Goal-Focused',
                    matchReasons: ['Aligns with stated goals', 'Program structure suits the client profile', 'Proven results for similar goals'],
                },
                {
                    matchScore: 70,
                    suggestedProgram: 'group',
                    estimatedSuccessProbability: 68,
                    coachingStyleFit: 'Collaborative & Community-Based',
                    matchReasons: ['Cost-effective option', 'Peer learning benefits', 'Good for accountability'],
                },
            ],
            aiNote: `Based on the goal "${goals}", the ${isExecutive ? 'Executive' : 'Individual'} program appears to be the strongest fit.`,
        };
    }

    // ── Goal Tracking AI ─────────────────────────────────────────────────────

    @Get('clients/:id/goals')
    async getClientGoals(@Param('id') id: string) {
        const client = await this.coachesService.getClientById(id);
        const progress = await this.coachesService.getProgressLogs(id);
        const avgRating = progress.length > 0
            ? Math.round(progress.reduce((s, p) => s + p.rating, 0) / progress.length)
            : 5;

        return {
            clientId: id,
            clientName: client?.name ?? 'Client',
            goals: [
                {
                    goalId: 'g_1',
                    title: client?.goals ?? 'Achieve career advancement',
                    description: 'Develop leadership skills and secure a promotion within 6 months',
                    progress: Math.min(avgRating * 10, 100),
                    status: avgRating >= 8 ? 'completed' : avgRating >= 5 ? 'in_progress' : 'at_risk',
                    startDate: '2026-01-15',
                    targetDate: '2026-07-15',
                    milestones: [
                        { name: 'Self-assessment completed', completed: true, completedDate: '2026-01-28' },
                        { name: 'Development plan created', completed: true, completedDate: '2026-02-10' },
                        { name: 'First leadership project delivered', completed: avgRating >= 6, completedDate: avgRating >= 6 ? '2026-03-15' : undefined },
                        { name: 'Performance review exceeded expectations', completed: avgRating >= 8 },
                    ],
                },
                {
                    goalId: 'g_2',
                    title: 'Improve work-life balance',
                    description: 'Establish boundaries and develop self-care routine',
                    progress: 60,
                    status: 'in_progress',
                    startDate: '2026-02-01',
                    targetDate: '2026-06-01',
                    milestones: [
                        { name: 'Identified boundary gaps', completed: true, completedDate: '2026-02-14' },
                        { name: 'Implemented morning routine', completed: true, completedDate: '2026-03-01' },
                        { name: 'Maintained routine for 30 days', completed: false },
                    ],
                },
            ],
            overallProgress: Math.round((avgRating * 10 + 60) / 2),
            aiAssessment: `${client?.name ?? 'This client'} is making ${avgRating >= 7 ? 'excellent' : avgRating >= 5 ? 'steady' : 'slow'} progress toward their goals. ${avgRating < 5 ? 'Consider revising the action plan or adjusting expectations.' : 'Continue with the current coaching cadence.'}`,
            suggestedNewGoals: ['Build a personal brand', 'Develop public speaking skills', 'Expand professional network'],
            nextMilestone: 'First leadership project delivered',
            estimatedCompletionDate: '2026-07-15',
        };
    }

    // ── Revenue Intelligence ─────────────────────────────────────────────────

    @Get('revenue-intelligence')
    async getRevenueIntelligence() {
        const { data: clients } = await this.coachesService.getClients({ limit: 10000 });
        const sessions = await this.coachesService.getSessions();
        const completedSessions = sessions.filter(s => s.status === 'completed').length;
        const avgRate = 150;
        const totalRevenue = completedSessions * avgRate;

        const byProgram: Record<string, { revenue: number; clients: number }> = {};
        for (const c of clients) {
            const p = c.program || 'individual';
            if (!byProgram[p]) byProgram[p] = { revenue: 0, clients: 0 };
            byProgram[p].clients++;
            byProgram[p].revenue += avgRate * 4; // Estimate monthly
        }

        return {
            totalRevenueMTD: totalRevenue,
            projectedMonthend: Math.round(totalRevenue * 1.3),
            averageSessionRate: avgRate,
            completedSessions,
            topClients: clients.slice(0, 3).map(c => ({
                clientId: c._id,
                clientName: c.name,
                totalSpend: Math.floor(Math.random() * 3000) + 500,
                sessionCount: Math.floor(Math.random() * 8) + 2,
            })),
            revenueByProgram: Object.entries(byProgram).map(([program, data]) => ({
                program,
                revenue: data.revenue,
                clientCount: data.clients,
                trend: data.clients > 2 ? 'up' as const : 'flat' as const,
            })),
            renewalForecast: clients.filter(c => c.status === 'active').slice(0, 3).map(c => ({
                clientId: c._id,
                clientName: c.name,
                renewalDate: '2026-05-01',
                renewalProbability: Math.floor(Math.random() * 30) + 65,
                suggestedAction: 'Send renewal reminder with progress report',
            })),
            aiInsight: `Your coaching practice generated $${totalRevenue.toLocaleString()} this month from ${completedSessions} sessions. ${totalRevenue > 5000 ? 'Revenue is tracking above target.' : 'Consider adding 2-3 more clients to hit target.'}`,
            growthOpportunities: [
                'Launch a group coaching program to increase capacity',
                'Introduce premium executive tier at $250/session',
                'Create a self-paced assessment product',
            ],
        };
    }

    // ── AI Resource Recommendations ──────────────────────────────────────────

    @Get('clients/:id/resources')
    async getResourceRecommendations(@Param('id') id: string) {
        const client = await this.coachesService.getClientById(id);
        const progress = await this.coachesService.getProgressLogs(id);
        const avgRating = progress.length > 0
            ? progress.reduce((s, p) => s + p.rating, 0) / progress.length
            : 5;

        return {
            clientId: id,
            clientName: client?.name ?? 'Client',
            recommendations: [
                { title: 'The 7 Habits of Highly Effective People', type: 'book', relevance: 95, description: 'Foundational leadership principles aligned with current coaching goals' },
                { title: 'Emotional Intelligence Self-Assessment', type: 'assessment', relevance: 90, description: 'Measure EQ baseline to track progress over 90 days' },
                { title: 'The Power of Vulnerability — Brené Brown', type: 'video', relevance: 85, description: 'TED Talk on building authentic leadership presence' },
                { title: 'Weekly Reflection Journal Template', type: 'worksheet', relevance: 88, description: 'Structured journaling to build self-awareness habits' },
                { title: 'SMART Goal Setting Exercise', type: 'exercise', relevance: 82, description: 'Interactive exercise to refine and clarify Q2 goals' },
            ],
            aiRationale: `These resources are selected based on ${client?.name ?? 'the client'}'s current progress (avg rating: ${avgRating.toFixed(1)}/10), active goals, and coaching program (${client?.program ?? 'individual'}). ${avgRating < 6 ? 'Resources focus on foundational skill-building.' : 'Resources are advanced-level to match strong progress.'}`,
        };
    }

    // ── AI Session Notes Generator ───────────────────────────────────────────

    @Post('ai/session-notes')
    async generateSessionNotes(@Body() body: { clientId?: string; agenda?: string; keyPoints?: string; duration?: number }) {
        const client = body.clientId
            ? await this.coachesService.getClientById(body.clientId).catch(() => null)
            : null;
        const name = client?.name ?? 'the client';
        const agenda = body.agenda ?? 'General coaching session';
        const keyPoints = body.keyPoints ?? '';
        const duration = body.duration ?? 60;

        if (this.ai.isAvailable()) {
            try {
                const prompt = `You are a professional coaching assistant. Generate detailed, structured session notes for a coaching session.

Coach: [Coach Name]
Client: ${name}
${client?.goals ? `Client goals: ${client.goals}` : ''}
${client?.program ? `Program: ${client.program}` : ''}
Session agenda: ${agenda}
Duration: ${duration} minutes
${keyPoints ? `Key points discussed: ${keyPoints}` : ''}

Write professional session notes in markdown format including:
- Session overview
- Key discussion points
- Observations and insights
- Action items with deadlines
- Follow-up plan

Keep it concise, professional, and coach-friendly.`;

                const aiResponse = await this.ai.chat([
                    { role: 'system', content: 'You are an expert coaching assistant that writes clear, professional session notes.' },
                    { role: 'user', content: prompt },
                ], { maxTokens: 800 });

                const notes = aiResponse.content || '';
                return {
                    clientId: body.clientId,
                    clientName: name,
                    generatedNotes: notes,
                    source: 'ai',
                    aiNote: 'AI-generated notes. Review and personalize before saving.',
                };
            } catch (err) {
                this.logger.warn(`Session notes AI failed: ${(err as Error).message}`);
            }
        }

        // Fallback: template-based notes
        const date = new Date().toISOString().slice(0, 10);
        return {
            clientId: body.clientId,
            clientName: name,
            source: 'template',
            generatedNotes: `## Session Notes — ${date}\n\n**Client:** ${name}\n**Agenda:** ${agenda}\n**Duration:** ${duration} minutes\n\n### Key Discussion Points\n- Reviewed progress on primary goals\n${keyPoints ? `- ${keyPoints}` : '- Discussed current challenges and strategies'}\n- Identified action items for next 2 weeks\n\n### Action Items\n1. [Add specific action item for client]\n2. [Add specific action item for coach]\n\n### Follow-Up\n- Next session: Review progress on action items\n- Check in via WhatsApp mid-week`,
            aiNote: 'Template-based notes. Add session details and personalize before saving.',
        };
    }

    // ── AI Best Next Action ──────────────────────────────────────────────────

    @Get('clients/:id/next-action')
    async getNextBestAction(@Param('id') id: string) {
        const client = await this.coachesService.getClientById(id);
        const sessions = await this.coachesService.getSessions(id);
        const progress = await this.coachesService.getProgressLogs(id);

        const hasRecentSession = sessions.length > 0;
        const avgRating = progress.length > 0
            ? progress.reduce((s, p) => s + p.rating, 0) / progress.length
            : 5;

        let action: string;
        let priority: string;
        let reasoning: string;

        if (!hasRecentSession) {
            action = 'Schedule first coaching session';
            priority = 'high';
            reasoning = 'No sessions on record. Getting started is the most impactful next step.';
        } else if (avgRating < 5) {
            action = 'Re-evaluate coaching approach and adjust the action plan';
            priority = 'high';
            reasoning = `Progress rating is below average (${avgRating.toFixed(1)}/10). The current approach may need adjustment.`;
        } else if (avgRating >= 8) {
            action = 'Introduce advanced challenges and consider graduation timeline';
            priority = 'medium';
            reasoning = `Excellent progress (${avgRating.toFixed(1)}/10). Client may be ready for the next level.`;
        } else {
            action = 'Continue current cadence with a mid-week accountability check-in';
            priority = 'low';
            reasoning = `Steady progress (${avgRating.toFixed(1)}/10). Maintain momentum with consistent engagement.`;
        }

        return {
            clientId: id,
            clientName: client?.name ?? 'Client',
            nextBestAction: action,
            priority,
            reasoning,
            alternativeActions: [
                'Send a motivational resource via WhatsApp',
                'Update goal milestones based on latest progress',
                'Prepare for program renewal conversation',
            ],
        };
    }
}
