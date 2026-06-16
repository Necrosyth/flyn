import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { TenantFromAuthInterceptor } from '../common/tenant-from-auth.interceptor';
import { ApiTags } from '@nestjs/swagger';

import { TenantsService } from '../tenants/tenants.service';
import { FirebaseService } from '../firebase/firebase.service';

interface StatItem {
    value: string;
    trend: string;
}

interface DashboardStatsResponse {
    activeConversations: StatItem;
    callsToday: StatItem;
    automationsRun: StatItem;
    responseTime: StatItem;
}

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(ApiOrFirebaseAuthGuard)
@UseInterceptors(TenantFromAuthInterceptor)
export class DashboardController {
    private readonly logger = new Logger(DashboardController.name);

    constructor(
        private readonly tenantsService: TenantsService,
        private readonly firebase: FirebaseService,
    ) { }

    /**
     * GET /api/dashboard/stats
     * Aggregates real-time stats from Chatwoot and the orchestrator.
     */
    @Get('stats')
    async getStats(
        @Headers('x-tenant-id') tenantId?: string,
    ): Promise<DashboardStatsResponse> {
        const [conversations, automationStats] = await Promise.all([
            this.fetchConversations(tenantId),
            this.fetchAutomationStats(),
        ]);

        // ── Active Conversations ───────────────────────────────────────────
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const activeConversations = conversations.filter(
            (c: any) => c.status === 'open' || c.status === 'pending',
        );

        const thisWeekConversations = conversations.filter(
            (c: any) => new Date((c.created_at || 0) * 1000) >= oneWeekAgo,
        );
        const lastWeekConversations = conversations.filter(
            (c: any) => {
                const created = new Date((c.created_at || 0) * 1000);
                return created >= twoWeeksAgo && created < oneWeekAgo;
            },
        );

        // ── Calls Today ────────────────────────────────────────────────────
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

        const callChannels = ['voice', 'phone', 'sms'];
        const callsToday = conversations.filter((c: any) => {
            const channel = (c.meta?.channel || c.channel?.type || '').toLowerCase();
            const created = new Date((c.created_at || 0) * 1000);
            return callChannels.some(ch => channel.includes(ch)) && created >= todayStart;
        });
        const callsYesterday = conversations.filter((c: any) => {
            const channel = (c.meta?.channel || c.channel?.type || '').toLowerCase();
            const created = new Date((c.created_at || 0) * 1000);
            return callChannels.some(ch => channel.includes(ch)) && created >= yesterdayStart && created < todayStart;
        });

        // ── Response Time (avg first-reply in minutes) ─────────────────────
        const avgResponseTime = this.computeAvgResponseTime(conversations);

        return {
            activeConversations: {
                value: String(activeConversations.length),
                trend: this.computeTrend(thisWeekConversations.length, lastWeekConversations.length),
            },
            callsToday: {
                value: String(callsToday.length),
                trend: this.computeTrend(callsToday.length, callsYesterday.length),
            },
            automationsRun: {
                value: String(automationStats.thisWeek),
                trend: this.computeTrend(automationStats.thisWeek, automationStats.lastWeek),
            },
            responseTime: {
                value: avgResponseTime,
                trend: '—', // Trend for response time would need historical data
            },
        };
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private async fetchConversations(tenantId?: string): Promise<any[]> {
        // TODO: Wire up with InboxService when dashboard is fully transitioned to DynamoDB messages
        return [];
    }

    private async fetchAutomationStats(): Promise<{ thisWeek: number; lastWeek: number }> {
        try {
            const db = this.firebase.firestore();
            if (!db) return { thisWeek: 0, lastWeek: 0 };

            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

            const runsRef = db.collection('workflow_runs');

            const thisWeekSnap = await runsRef
                .where('startedAt', '>=', oneWeekAgo)
                .get();

            const lastWeekSnap = await runsRef
                .where('startedAt', '>=', twoWeeksAgo)
                .where('startedAt', '<', oneWeekAgo)
                .get();

            return {
                thisWeek: thisWeekSnap.size,
                lastWeek: lastWeekSnap.size,
            };
        } catch (err) {
            this.logger.warn(`Failed to fetch automation stats: ${(err as Error).message}`);
            return { thisWeek: 0, lastWeek: 0 };
        }
    }

    private computeAvgResponseTime(conversations: any[]): string {
        try {
            const responseTimes: number[] = [];
            for (const conv of conversations) {
                if (!conv.first_reply_created_at || !conv.created_at) continue;
                const created = conv.created_at * 1000;
                const firstReply = conv.first_reply_created_at * 1000;
                const diffMinutes = (firstReply - created) / (1000 * 60);
                if (diffMinutes > 0 && diffMinutes < 60 * 24) {
                    responseTimes.push(diffMinutes);
                }
            }
            if (responseTimes.length === 0) return '—';
            const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
            if (avg < 1) return `${Math.round(avg * 60)}s`;
            if (avg >= 60) return `${(avg / 60).toFixed(1)}h`;
            return `${avg.toFixed(1)}m`;
        } catch {
            return '—';
        }
    }

    private computeTrend(current: number, previous: number): string {
        if (previous === 0 && current === 0) return '0%';
        if (previous === 0) return '+100%';
        const pct = Math.round(((current - previous) / previous) * 100);
        return pct >= 0 ? `+${pct}%` : `${pct}%`;
    }
}
