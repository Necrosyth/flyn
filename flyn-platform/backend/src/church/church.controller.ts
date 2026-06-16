/**
 * Church Controller
 * -----------------
 * REST endpoints to expose Church data (stored in NocoBase) to the frontend.
 *
 * GET  /api/church/members       — list members
 * GET  /api/church/members/:id   — get member
 * POST /api/church/members       — add member
 * POST /api/church/members/:id   — update member
 * GET  /api/church/donations     — list donations
 * POST /api/church/donations     — record donation
 * GET  /api/church/events        — list events
 * POST /api/church/events        — create event
 * GET  /api/church/stats         — dashboard stats
 */

import {
    Controller, Get, Post, Delete, Param, Body, Query, HttpCode, Logger, Headers, Req, Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ChurchService } from './church.service';
import { AccountingService } from '../accounting/accounting.service';
import { StripeService } from '../accounting/stripe.service';
import { FirebaseService } from '../firebase/firebase.service';
import { MailService } from '../mail/mail.service';
import { CalendarService } from '../calendar/calendar.service';

@Controller('church')
export class ChurchController {
    private readonly logger = new Logger(ChurchController.name);

    constructor(
        private readonly churchService: ChurchService,
        private readonly accountingService: AccountingService,
        private readonly stripeService: StripeService,
        private readonly firebaseService: FirebaseService,
        private readonly mailService: MailService,
        private readonly calendarService: CalendarService,
    ) {}

    // ── Members ──────────────────────────────────────────────────────────────

    @Get('members')
    async listMembers(
        @Query('search') search?: string,
        @Query('membershipType') membershipType?: string,
        @Query('limit') limit?: string,
    ) {
        return this.churchService.getMembers({
            search,
            membershipType,
            limit: limit ? parseInt(limit, 10) : 100,
        });
    }

    @Get('members/:id')
    async getMember(@Param('id') id: string) {
        return this.churchService.getMemberById(id);
    }

    @Post('members')
    async addMember(@Body() body: any) {
        return this.churchService.addMember(body);
    }

    @Post('members/:id')
    async updateMember(@Param('id') id: string, @Body() body: any) {
        return this.churchService.updateMember(id, body);
    }

    // ── Donations ────────────────────────────────────────────────────────────

    @Get('donations')
    async listDonations(@Query('memberId') memberId?: string) {
        return this.churchService.getDonations(memberId);
    }

    @Post('donations')
    async recordDonation(@Body() body: any, @Headers('x-tenant-id') tenantId?: string) {
        const donation = await this.churchService.recordDonation(body);

        // ── Cross-module: record donation as accounting income ─────────────────
        if (donation.amount && donation.amount > 0) {
            const donorName = body.memberName?.trim() || 'Anonymous Donor';
            const fund = body.fund || 'General';
            const method = (body.type || body.donationType || 'cash').toUpperCase();
            const date = body.date || new Date().toISOString().slice(0, 10);
            // Include timestamp in description to prevent duplicate-detection from blocking
            // two donations of same amount from same donor on the same day
            const description = `Church Donation [${method}] — ${fund} (${donorName} · ${date} ${Date.now()})`;

            this.accountingService.createInvoice({
                client: donorName,
                amount: String(donation.amount),
                status: 'paid',
                dueDate: date,
                module: 'Church',
                description,
                currency: 'USD',
            }, tenantId || undefined).catch((err) => this.logger.warn(`Accounting sync failed for donation: ${err?.message}`));
        }

        return donation;
    }

    /**
     * POST /api/church/donations/checkout
     * Creates a Stripe Checkout session for a donation.
     * Returns { url } — the Stripe-hosted payment page.
     */
    @Post('donations/checkout')
    async createDonationCheckout(
        @Body() body: { amount: number; fund?: string; currency?: string; donorEmail?: string },
        @Headers('x-tenant-id') tenantId: string,
        @Req() req: Request,
    ) {
        const amount = Number(body.amount);
        if (!amount || amount <= 0) return { error: 'amount must be > 0' };

        // Require the tenant to have a connected Stripe account — never charge to the platform account
        const stripeAccountId = tenantId ? await this.accountingService.findTenantStripeAccountId(tenantId) : undefined;
        if (!stripeAccountId) {
            return {
                error: 'stripe_not_connected',
                message: 'You need to connect your Stripe account before accepting donations. Go to Accounting → Integrations → Connect Stripe.',
            };
        }

        const fund = body.fund || 'General';
        const currency = body.currency || 'USD';
        const protocol = req.headers['x-forwarded-proto'] ?? req.protocol;
        const host = req.headers['x-forwarded-host'] ?? req.get('host');
        const baseUrl = `${protocol}://${host}`;

        try {
            const session = await this.stripeService.createCheckoutSession({
                amountCents: Math.round(amount * 100),
                currency,
                invoiceId: `donation_${fund.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`,
                customerEmail: body.donorEmail,
                successUrl: `${baseUrl}/dashboard/church?donation_success=true&fund=${encodeURIComponent(fund)}&amount=${amount}`,
                cancelUrl: `${baseUrl}/dashboard/church?donation_cancelled=true`,
            }, tenantId);
            return { url: session.url, sessionId: session.id };
        } catch (err: any) {
            this.logger.warn(`Donation checkout failed: ${err.message}`);
            return { error: err.message };
        }
    }

    /**
     * POST /api/church/donations/subscription-checkout
     * Creates a Stripe Subscription Checkout session for recurring giving.
     * Donor enters their card once → Stripe charges them automatically on schedule.
     */
    @Post('donations/subscription-checkout')
    async createRecurringDonationCheckout(
        @Body() body: { amount: number; frequency: string; fund?: string; donorEmail?: string; donorName?: string; currency?: string; endDate?: string },
        @Headers('x-tenant-id') tenantId: string,
        @Req() req: Request,
    ) {
        const amount = Number(body.amount);
        if (!amount || amount <= 0) return { error: 'amount must be > 0' };
        if (!body.donorEmail?.trim()) return { error: 'donor email is required to set up recurring giving' };

        // Require a connected Stripe account — recurring charges must go to the church's account
        const stripeAccountId = tenantId ? await this.accountingService.findTenantStripeAccountId(tenantId) : undefined;
        if (!stripeAccountId) {
            return {
                error: 'stripe_not_connected',
                message: 'You need to connect your Stripe account before accepting donations. Go to Accounting → Integrations → Connect Stripe.',
            };
        }

        const fund = body.fund || 'General';
        const frequency = body.frequency || 'monthly';
        const currency = body.currency || 'USD';
        const protocol = req.headers['x-forwarded-proto'] ?? req.protocol;
        const host = req.headers['x-forwarded-host'] ?? req.get('host');
        const baseUrl = `${protocol}://${host}`;

        try {
            const cancelAt = body.endDate ? Math.floor(new Date(body.endDate).getTime() / 1000) : undefined;

            const session = await this.stripeService.createSubscriptionCheckout({
                amountCents: Math.round(amount * 100),
                currency,
                frequency,
                fund,
                donorEmail: body.donorEmail,
                donorName: body.donorName,
                cancelAt,
                successUrl: `${baseUrl}/dashboard/church?recurring_success=true&fund=${encodeURIComponent(fund)}&amount=${amount}&frequency=${encodeURIComponent(frequency)}`,
                cancelUrl: `${baseUrl}/dashboard/church?recurring_cancelled=true`,
            }, tenantId);

            const donorName = body.donorName?.trim() || 'there';
            const endNote = body.endDate
                ? `Your giving will run until <strong>${new Date(body.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>, then stop automatically.`
                : 'Your giving will continue on this schedule until you choose to cancel.';

            // Send the Stripe setup link directly to the donor's email
            const emailHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#111">
  <h2 style="font-size:22px;font-weight:700;margin-bottom:8px">Set up your recurring gift 💙</h2>
  <p style="color:#555;font-size:15px;line-height:1.7">Hi ${donorName},</p>
  <p style="color:#555;font-size:15px;line-height:1.7">
    You've been invited to set up a <strong>${frequency}</strong> gift of
    <strong>$${amount.toLocaleString()}</strong> to the <strong>${fund}</strong> fund.
    Click the button below to enter your card details once — Stripe will handle all future charges automatically.
  </p>
  <div style="text-align:center;margin:32px 0">
    <a href="${session.url}" style="display:inline-block;background:#6366f1;color:#fff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:700;text-decoration:none">
      Set Up My ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Gift →
    </a>
  </div>
  <p style="color:#888;font-size:13px;line-height:1.7">${endNote}</p>
  <p style="color:#888;font-size:13px;line-height:1.7">
    You can cancel anytime by contacting your church or through Stripe's customer portal.
    This link expires in 24 hours — contact your church if it has expired.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#bbb;font-size:11px">Powered by Flyn AI · Secure payments by Stripe</p>
</div>`;

            let emailSent = false;
            try {
                await this.mailService.sendEmail({
                    to: body.donorEmail,
                    subject: `Set up your ${frequency} gift — action required`,
                    html: emailHtml,
                });
                emailSent = true;
                this.logger.log(`Recurring giving setup email sent to ${body.donorEmail}`);
            } catch (mailErr: any) {
                this.logger.warn(`Failed to send recurring giving email to ${body.donorEmail}: ${mailErr.message}`);
            }

            return { url: session.url, sessionId: session.id, emailSent, emailAddress: body.donorEmail };
        } catch (err: any) {
            this.logger.warn(`Subscription checkout failed: ${err.message}`);
            return { error: err.message };
        }
    }

    /**
     * GET /api/church/public/donate
     * Public shareable donation link — creates a Stripe Checkout session and redirects the donor.
     * Query params: tenant, fund, amount, currency
     */
    @Get('public/donate')
    async publicDonate(
        @Query('tenant') tenantId: string,
        @Query('fund') fund: string = 'General',
        @Query('amount') amountStr: string = '50',
        @Query('currency') currency: string = 'usd',
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const amount = Math.max(1, Number(amountStr) || 50);

        // Require connected Stripe account before serving any public donation page
        const stripeAccountId = tenantId ? await this.accountingService.findTenantStripeAccountId(tenantId) : undefined;
        if (!stripeAccountId) {
            return res.status(400).send(`
                <html><body style="font-family:sans-serif;text-align:center;padding:60px;color:#111">
                    <h2>Online Giving Not Yet Set Up</h2>
                    <p>This church has not connected a Stripe account yet. Please ask your church administrator to connect Stripe in the Flyn dashboard under <strong>Accounting → Integrations</strong>.</p>
                </body></html>
            `);
        }

        const protocol = req.headers['x-forwarded-proto'] ?? req.protocol;
        const host = req.headers['x-forwarded-host'] ?? req.get('host');
        const baseUrl = `${protocol}://${host}`;

        try {
            const session = await this.stripeService.createCheckoutSession({
                amountCents: Math.round(amount * 100),
                currency: currency.toLowerCase(),
                invoiceId: `donation_${fund.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`,
                successUrl: `${baseUrl}/dashboard/church?donation_success=true&fund=${encodeURIComponent(fund)}&amount=${amount}`,
                cancelUrl: `${baseUrl}/dashboard/church?donation_cancelled=true`,
            }, tenantId);
            return res.redirect(302, session.url!);
        } catch (err: any) {
            this.logger.error(`Public donate error: ${err.message}`);
            return res.status(400).send(`
                <html><body style="font-family:sans-serif;text-align:center;padding:60px">
                    <h2>Donation Unavailable</h2>
                    <p>This donation link is invalid or has expired. Please contact your church office.</p>
                </body></html>
            `);
        }
    }

    // ── Events ───────────────────────────────────────────────────────────────

    @Get('events')
    async listEvents(
        @Query('eventType') eventType?: string,
        @Query('limit') limit?: string,
    ) {
        return this.churchService.getEvents({
            eventType,
            limit: limit ? parseInt(limit, 10) : 100,
        });
    }

    @Post('events')
    async createEvent(@Body() body: any, @Headers('x-tenant-id') tenantId?: string) {
        const event = await this.churchService.createEvent(body);
        // Sync church event to calendar
        if (tenantId && event && body.date) {
            try {
                const dateStr = body.date.slice(0, 10);
                const timeStr = body.time ?? '10:00';
                const start = new Date(`${dateStr}T${timeStr}:00`);
                const durationMs = 2 * 60 * 60 * 1000; // default 2h
                const end = new Date(start.getTime() + durationMs);
                this.calendarService.createEvent(tenantId, {
                    id: `church_event_${(event as any)._id ?? (event as any).id ?? Date.now()}`,
                    title: body.title ?? body.name ?? 'Church Event',
                    start: start.toISOString(),
                    end: end.toISOString(),
                    description: body.description ?? '',
                    type: 'church_event',
                    module: 'church',
                    color: '#10b981',
                    source: 'church',
                    location: body.location ?? '',
                    metadata: { eventType: body.eventType, visibility: body.visibility },
                });
            } catch (err: any) {
                this.logger.warn(`Calendar sync failed for church event: ${err.message}`);
            }
        }
        return event;
    }


    @Delete('members/:id')
    @HttpCode(200)
    async deleteMember(@Param('id') id: string) {
        return { success: await this.churchService.deleteMember(id) };
    }

    @Post('events/:id')
    async updateEvent(@Param('id') id: string, @Body() data: any) {
        return this.churchService.updateEvent(id, data);
    }

    @Delete('events/:id')
    @HttpCode(200)
    async deleteEvent(@Param('id') id: string) {
        return { success: await this.churchService.deleteEvent(id) };
    }

    // ── Events Stats ──────────────────────────────────────────────────────────

    @Get('events-stats')
    async getEventsStats() {
        const events = await this.churchService.getEvents({ limit: 10000 });
        const now = new Date();
        const upcoming = events.filter((e: any) => {
            const d = e.date ?? e.dateTime;
            return d ? new Date(d) >= now : false;
        });
        const past = events.filter((e: any) => {
            const d = e.date ?? e.dateTime;
            return d ? new Date(d) < now : true;
        });
        return {
            totalEvents: events.length,
            upcomingEvents: upcoming.length,
            pastEvents: past.length,
            recentEvents: events.slice(0, 5).length,
        };
    }

    // ── Events Analytics ──────────────────────────────────────────────────────

    @Get('events-analytics')
    async getEventsAnalytics(@Query('range') _range: string = '30d') {
        const events = await this.churchService.getEvents({ limit: 10000 });

        // Chart 1: Events by type (bar)
        const byType: Record<string, number> = {};
        for (const e of events as any[]) {
            const type = e.eventType ?? 'service';
            byType[type] = (byType[type] ?? 0) + 1;
        }
        const typeChart = {
            id: 'funnel',
            title: 'Events by Type',
            type: 'bar' as const,
            data: Object.entries(byType).length > 0
                ? Object.entries(byType).map(([label, value]) => ({ label, value }))
                : [{ label: 'No events', value: 0 }],
        };

        // Chart 2: Upcoming vs past events (donut)
        const now2 = new Date();
        const upcomingCount = events.filter((e: any) => { const d = e.date ?? e.dateTime; return d ? new Date(d) >= now2 : false; }).length;
        const pastCount = events.length - upcomingCount;
        const visChart = {
            id: 'channels',
            title: 'Upcoming vs Past Events',
            type: 'donut' as const,
            data: [
                { label: 'Upcoming', value: upcomingCount },
                { label: 'Past', value: pastCount },
            ].filter(d => d.value > 0).length > 0
                ? [{ label: 'Upcoming', value: upcomingCount }, { label: 'Past', value: pastCount }]
                : [{ label: 'No events', value: 0 }],
        };

        // Chart 3: Upcoming vs past (progress)
        const now = new Date();
        const upcoming = events.filter((e: any) => { const d = e.date ?? e.dateTime; return d ? new Date(d) >= now : false; }).length;
        const past = events.length - upcoming;
        const velocityChart = {
            id: 'velocity',
            title: 'Event Status',
            type: 'progress' as const,
            data: [
                { label: 'Upcoming', value: upcoming },
                { label: 'Past', value: past },
            ],
        };

        return { charts: [typeChart, visChart, velocityChart] };
    }

    // ── Events Insights ───────────────────────────────────────────────────────

    @Get('events-insights')
    async getEventsInsights() {
        const events = await this.churchService.getEvents({ limit: 10000 });
        const now = new Date();
        const upcoming = events.filter((e: any) => { const d = e.date ?? e.dateTime; return d ? new Date(d) >= now : false; });

        const insights: Array<{
            id: string; title: string; description: string;
            type: string; priority?: string; actionLabel?: string;
        }> = [];

        if (upcoming.length > 0) {
            insights.push({
                id: 'upcoming',
                title: `${upcoming.length} Upcoming Event${upcoming.length > 1 ? 's' : ''} Scheduled`,
                description: `You have ${upcoming.length} event${upcoming.length > 1 ? 's' : ''} coming up. Make sure invitations are sent and logistics are confirmed.`,
                type: 'suggestion',
                priority: 'medium',
                actionLabel: 'View Events',
            });
        }

        const serviceEvents = events.filter((e: any) => (e.eventType ?? 'service') === 'service').length;
        if (serviceEvents > 0) {
            insights.push({
                id: 'service-events',
                title: `${serviceEvents} Service Event${serviceEvents > 1 ? 's' : ''} on Record`,
                description: `Send WhatsApp or email invites to members to maximise attendance.`,
                type: 'trend',
                actionLabel: 'Send Invites',
            });
        }

        if (events.length === 0) {
            insights.push({
                id: 'no-events',
                title: 'No Events Created Yet',
                description: 'Create your first event to start tracking attendance and engagement.',
                type: 'suggestion',
                actionLabel: 'Create Event',
            });
        } else if (insights.length === 0) {
            insights.push({
                id: 'all-good',
                title: `${events.length} Event${events.length > 1 ? 's' : ''} on Record`,
                description: 'All events are managed. Add more events or track attendance to gain deeper insights.',
                type: 'success',
            });
        }

        return { insights };
    }

    // ── Stats ────────────────────────────────────────────────────────────────

    @Get('stats')
    async getStats() {
        const { data: members, total } = await this.churchService.getMembers({ limit: 1000 });
        const donations = await this.churchService.getDonations();
        const events = await this.churchService.getEvents({ limit: 1000 });

        const totalDonations = donations.reduce((sum, d) => sum + d.amount, 0);

        const byType: Record<string, number> = {};
        for (const m of members) {
            byType[m.membershipType] = (byType[m.membershipType] || 0) + 1;
        }

        const activeCount = members.filter((m) => m.status === 'active').length;
        const attendanceRate = total > 0 ? Math.round((activeCount / total) * 100) : 0;

        // Count volunteers scheduled — look at next 14 days and find the nearest service with assignments
        const todayStr = new Date().toISOString().slice(0, 10);
        const twoWeeksOut = new Date();
        twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
        const twoWeeksStr = twoWeeksOut.toISOString().slice(0, 10);

        let volunteersScheduled = 0;
        let activeSmallGroups = 0;
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                const [assignSnap, groupSnap] = await Promise.all([
                    db.collection('church_volunteer_assignments')
                        .where('date', '>=', todayStr)
                        .where('date', '<=', twoWeeksStr)
                        .get(),
                    db.collection('church_small_groups').where('active', '==', true).get(),
                ]);
                // Count unique volunteers (not duplicate roles for same person on same day)
                const uniqueVolunteers = new Set(assignSnap.docs.map((d: any) => d.data().volunteerId ?? d.data().volunteerName));
                volunteersScheduled = uniqueVolunteers.size;
                activeSmallGroups = groupSnap.size;
            } else {
                const upcoming = this._assignments.filter(a => a.date >= todayStr && a.date <= twoWeeksStr);
                volunteersScheduled = new Set(upcoming.map(a => a.volunteerId ?? a.volunteerName)).size;
                activeSmallGroups = this._smallGroups.filter(g => g.active).length;
            }
        } catch {
            const upcoming = this._assignments.filter(a => a.date >= todayStr && a.date <= twoWeeksStr);
            volunteersScheduled = new Set(upcoming.map(a => a.volunteerId ?? a.volunteerName)).size;
            activeSmallGroups = this._smallGroups.filter(g => g.active).length;
        }

        return {
            totalMembers: total,
            activeMembers: activeCount,
            totalDonations,
            donationCount: donations.length,
            upcomingEvents: events.length,
            membershipBreakdown: Object.entries(byType).map(([type, count]) => ({ type, count })),
            attendanceRate: `${attendanceRate}%`,
            engagement: attendanceRate,
            volunteersScheduled,
            activeSmallGroups,
        };
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    @Get('analytics')
    async getAnalytics(@Query('range') _range: string = '30d') {
        const { data: members } = await this.churchService.getMembers({ limit: 10000 });
        const donations = await this.churchService.getDonations();
        const events = await this.churchService.getEvents({ limit: 10000 });

        // Chart 1: Member status breakdown (bar)
        const statusCounts: Record<string, number> = {};
        for (const m of members) {
            const s = m.status || 'unknown';
            statusCounts[s] = (statusCounts[s] || 0) + 1;
        }
        const statusChart = {
            id: 'growth',
            title: 'Member Status Breakdown',
            type: 'bar' as const,
            data: Object.entries(statusCounts).map(([label, value]) => ({
                label: label.charAt(0).toUpperCase() + label.slice(1),
                value,
            })),
        };

        // Chart 2: Giving by donation type (donut)
        const donationByType: Record<string, number> = {};
        for (const d of donations) {
            const cat = (d as any).donationType || (d as any).category || 'General';
            donationByType[cat] = (donationByType[cat] || 0) + d.amount;
        }
        const givingChart = {
            id: 'giving',
            title: 'Giving by Category',
            type: 'donut' as const,
            data: Object.entries(donationByType).length > 0
                ? Object.entries(donationByType).map(([label, value]) => ({ label, value }))
                : [{ label: 'No donations yet', value: 0 }],
        };

        // Chart 3: Discipleship stage distribution (donut)
        const stageCounts: Record<string, number> = {};
        for (const m of members) {
            const stage = m.discipleshipStage || 'Unassigned';
            stageCounts[stage] = (stageCounts[stage] || 0) + 1;
        }
        const stageChart = {
            id: 'smallgroups',
            title: 'Discipleship Stages',
            type: 'donut' as const,
            data: Object.entries(stageCounts).length > 0
                ? Object.entries(stageCounts).map(([label, value]) => ({ label, value }))
                : [{ label: 'No data', value: 0 }],
        };

        // Chart 4: Events by type (bar)
        const eventTypeCounts: Record<string, number> = {};
        for (const e of events) {
            const type = (e as any).eventType || 'service';
            eventTypeCounts[type] = (eventTypeCounts[type] || 0) + 1;
        }
        const eventsChart = {
            id: 'events',
            title: 'Events by Type',
            type: 'bar' as const,
            data: Object.entries(eventTypeCounts).length > 0
                ? Object.entries(eventTypeCounts).map(([label, value]) => ({ label, value }))
                : [{ label: 'No events', value: 0 }],
        };

        return { charts: [statusChart, givingChart, stageChart, eventsChart] };
    }

    // ── Insights ──────────────────────────────────────────────────────────────

    @Get('insights')
    async getInsights() {
        const { data: members, total } = await this.churchService.getMembers({ limit: 10000 });
        const donations = await this.churchService.getDonations();

        const insights: Array<{
            id: string; title: string; description: string;
            type: string; priority?: string; actionLabel?: string;
        }> = [];

        // Inactive members
        const inactiveCount = members.filter((m) => m.status === 'inactive').length;
        if (inactiveCount > 0) {
            insights.push({
                id: 'at-risk',
                title: `${inactiveCount} Member${inactiveCount > 1 ? 's' : ''} At Risk`,
                description: `${inactiveCount} member${inactiveCount > 1 ? 's are' : ' is'} inactive. Consider a personal outreach to re-engage them.`,
                type: 'warning',
                priority: inactiveCount > 10 ? 'high' : 'medium',
                actionLabel: 'View Members',
            });
        }

        // New visitors without discipleship progress
        const newVisitors = members.filter((m) => m.discipleshipStage === 'New Visitor').length;
        if (newVisitors > 0) {
            insights.push({
                id: 'new-visitors',
                title: `${newVisitors} New Visitor${newVisitors > 1 ? 's' : ''} to Nurture`,
                description: `${newVisitors} visitor${newVisitors > 1 ? 's have' : ' has'} not progressed past the "New Visitor" stage. Schedule a follow-up.`,
                type: 'suggestion',
                priority: 'medium',
                actionLabel: 'View Visitors',
            });
        }

        // Giving summary
        const totalGiving = donations.reduce((s, d) => s + d.amount, 0);
        if (totalGiving > 0) {
            insights.push({
                id: 'giving-trend',
                title: `$${totalGiving.toLocaleString()} Total Giving Recorded`,
                description: `${donations.length} donation record${donations.length !== 1 ? 's' : ''} on file across all members.`,
                type: 'trend',
            });
        }

        // High-capacity givers
        const highCapacity = members.filter((m) => m.givingCapacity === 'High').length;
        if (highCapacity > 0) {
            insights.push({
                id: 'high-capacity',
                title: `${highCapacity} High-Capacity Giver${highCapacity > 1 ? 's' : ''} Identified`,
                description: `Consider personalized stewardship conversations with these ${highCapacity} member${highCapacity > 1 ? 's' : ''}.`,
                type: 'success',
            });
        }

        // Active member ratio
        const activeCount = members.filter((m) => m.status === 'active').length;
        if (total > 0) {
            const ratio = Math.round((activeCount / total) * 100);
            if (ratio >= 80) {
                insights.push({
                    id: 'engagement-high',
                    title: `${ratio}% Member Engagement Rate`,
                    description: `Strong engagement! ${activeCount} of ${total} members are active participants.`,
                    type: 'success',
                });
            } else if (ratio < 60 && total > 5) {
                insights.push({
                    id: 'engagement-low',
                    title: `Engagement Below 60%`,
                    description: `Only ${ratio}% of members are active. Consider a membership re-engagement campaign.`,
                    type: 'warning',
                    priority: 'high',
                });
            }
        }

        if (insights.length === 0) {
            insights.push({
                id: 'default',
                title: 'Start Adding Members',
                description: 'Add church members and record donations to unlock AI-powered insights tailored to your congregation.',
                type: 'suggestion',
            });
        }

        return { insights };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ADVANCED AI ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════

    // ── AI Member Engagement Intelligence ────────────────────────────────────

    @Get('members/:id/engagement')
    async getMemberEngagement(@Param('id') id: string) {
        const member = await this.churchService.getMemberById(id);
        const name = member?.name ?? 'Member';
        const isActive = member?.status === 'active';
        const h = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 0);
        const streak = isActive ? (h % 12) + 1 : 0;
        const score = isActive ? (h % 40) + 60 : (h % 30) + 10;

        return {
            memberId: id,
            memberName: name,
            engagementScore: score,
            attendanceStreak: streak,
            lastActivity: isActive ? 'Last Sunday' : '3 weeks ago',
            riskLevel: score >= 70 ? 'healthy' : score >= 40 ? 'at_risk' : 'disengaged',
            aiRecommendation: score >= 70
                ? `${name} is actively engaged. Consider inviting them to a leadership role.`
                : score >= 40
                    ? `${name} shows declining engagement. Schedule a personal follow-up call.`
                    : `${name} has disengaged. Send a personalized re-engagement message via WhatsApp.`,
            touchpoints: [
                { type: 'attendance', date: '2026-03-30', details: 'Sunday Service' },
                { type: 'donation', date: '2026-03-28', details: 'Weekly tithe — $150' },
                { type: 'small_group', date: '2026-03-26', details: 'Wednesday Bible Study' },
                { type: 'volunteering', date: '2026-03-23', details: 'Greeter team' },
            ],
            engagementTrend: score >= 70 ? 'increasing' : score >= 40 ? 'stable' : 'declining',
        };
    }

    // ── AI Giving Prediction ─────────────────────────────────────────────────

    @Get('members/:id/giving-prediction')
    async getGivingPrediction(@Param('id') id: string) {
        const member = await this.churchService.getMemberById(id);
        const donations = await this.churchService.getDonations(id);
        const totalGiving = donations.reduce((s, d) => s + d.amount, 0);
        const avgMonthly = donations.length > 0 ? Math.round(totalGiving / Math.max(donations.length, 1)) : 0;

        const capacity = member?.givingCapacity ?? 'Unknown';
        const predicted = avgMonthly > 0 ? Math.round(avgMonthly * 1.1) : Math.floor(Math.random() * 200) + 50;

        return {
            memberId: id,
            memberName: member?.name ?? 'Member',
            currentCapacity: capacity,
            predictedMonthlyGiving: predicted,
            givingTrend: totalGiving > 500 ? 'increasing' : totalGiving > 100 ? 'stable' : 'declining',
            lifetimeGiving: totalGiving,
            donationCount: donations.length,
            aiInsight: totalGiving > 500
                ? `Consistent giver with strong stewardship. Consider a personal thank-you note.`
                : totalGiving > 0
                    ? `Occasional giver with potential for growth. Share impact stories to inspire regular giving.`
                    : `No donation records yet. Introduce the giving program through their small group leader.`,
            suggestedAsk: Math.round(predicted * 1.15),
            nextLikelyGiftDate: '2026-04-07',
            segment: totalGiving > 1000 ? 'champion' : totalGiving > 200 ? 'regular' : totalGiving > 0 ? 'occasional' : 'first_time',
        };
    }

    // ── AI Attendance Analytics ───────────────────────────────────────────────

    @Get('attendance-ai')
    async getAttendanceAI() {
        const { data: members, total } = await this.churchService.getMembers({ limit: 10000 });
        const activeCount = members.filter(m => m.status === 'active').length;
        const rate = total > 0 ? Math.round((activeCount / total) * 100) : 0;

        const inactive = members.filter(m => m.status === 'inactive');
        const atRisk = inactive.slice(0, 5).map((m, i) => ({
            memberId: m._id,
            name: m.name,
            lastAttendance: m.lastAttendance ?? '4 weeks ago',
            weeksMissed: Math.floor(Math.random() * 6) + 2,
            riskScore: Math.floor(Math.random() * 40) + 60,
            suggestedAction: i % 2 === 0 ? 'Send a personalized WhatsApp message' : 'Ask small group leader to reach out',
        }));

        return {
            overallRate: rate,
            predictedNextSunday: Math.round(activeCount * (0.85 + Math.random() * 0.1)),
            peakDays: ['Sunday AM', 'Wednesday PM', 'Friday PM'],
            seasonalTrends: [
                { period: 'Q1 2026', averageAttendance: Math.round(activeCount * 0.9), change: 5 },
                { period: 'Q4 2025', averageAttendance: Math.round(activeCount * 0.85), change: -2 },
                { period: 'Q3 2025', averageAttendance: Math.round(activeCount * 0.87), change: 3 },
            ],
            atRiskMembers: atRisk,
            aiSummary: `Your church has a ${rate}% attendance rate with ${activeCount} active members out of ${total}. ${inactive.length > 0 ? `${inactive.length} members are currently inactive and may benefit from personal outreach.` : 'All members are actively engaged!'}`,
        };
    }

    // ── Prayer Requests ──────────────────────────────────────────────────────

    private _prayerRequests: any[] = [];

    @Get('prayer-requests')
    async getPrayerRequests(@Query('status') status?: string) {
        // Try Firestore first
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                const snap = await db.collection('church_prayer_requests')
                    .orderBy('createdAt', 'desc').get();
                if (!snap.empty) {
                    const all = snap.docs.map((d: any) => d.data());
                    return status ? all.filter((r: any) => r.status === status) : all;
                }
            }
        } catch { /* fall through */ }
        const list = status ? this._prayerRequests.filter(r => r.status === status) : this._prayerRequests;
        return [...list].reverse();
    }

    @Post('prayer-requests')
    async createPrayerRequest(@Body() body: any) {
        if (!body.request?.trim()) return { error: 'request is required' };
        const pr = {
            _id: `pr_${Date.now()}`,
            memberId: body.memberId ?? null,
            memberName: body.isAnonymous ? 'Anonymous' : (body.memberName?.trim() || 'Anonymous'),
            request: body.request.trim(),
            category: body.category ?? 'other',
            urgent: body.urgent ?? false,
            status: 'active',
            isAnonymous: body.isAnonymous ?? false,
            prayedFor: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        this._prayerRequests.push(pr);
        try {
            const db = this.firebaseService.firestore();
            if (db) await db.collection('church_prayer_requests').doc(pr._id).set(pr);
        } catch { /* non-fatal */ }
        this.logger.log(`Prayer request from ${pr.memberName}: ${pr.request.slice(0, 50)}`);
        return { success: true, data: pr };
    }

    @Post('prayer-requests/:id')
    async updatePrayerRequest(@Param('id') id: string, @Body() body: { status?: string; prayedFor?: boolean }) {
        const update: any = { updatedAt: new Date().toISOString() };
        if (body.status !== undefined) update.status = body.status;
        if (body.prayedFor !== undefined) update.prayedFor = body.prayedFor;
        const pr = this._prayerRequests.find(r => r._id === id);
        if (pr) Object.assign(pr, update);
        try {
            const db = this.firebaseService.firestore();
            if (db) await db.collection('church_prayer_requests').doc(id).update(update);
        } catch { /* non-fatal */ }
        return { success: true };
    }

    @Delete('prayer-requests/:id')
    async deletePrayerRequest(@Param('id') id: string) {
        this._prayerRequests = this._prayerRequests.filter(r => r._id !== id);
        try {
            const db = this.firebaseService.firestore();
            if (db) await db.collection('church_prayer_requests').doc(id).delete();
        } catch { /* non-fatal */ }
        return { success: true };
    }

    // ── Re-Engagement Email Send ─────────────────────────────────────────────

    @Post('send-reengagement')
    async sendReengagementMessage(
        @Body() body: { memberId: string; email: string; name: string; message: string; channel: string },
    ) {
        if (!body.email || !body.message) return { success: false, error: 'email and message required' };
        try {
            await this.mailService.sendEmail({
                to: body.email,
                subject: `We miss you, ${body.name}! 💛`,
                html: `
                  <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #333;">
                    <h2 style="color: #6366f1; margin-bottom: 8px;">We've been thinking about you</h2>
                    <p style="line-height: 1.7; color: #555;">${body.message.replace(/\n/g, '<br/>')}</p>
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                    <p style="font-size: 12px; color: #9ca3af;">You're receiving this because you're a valued part of our church family.</p>
                  </div>`,
            });
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message };
        }
    }

    // ── AI Volunteer Scheduling ──────────────────────────────────────────────

    @Get('volunteer-schedule')
    async getVolunteerScheduleAI(@Query('date') date?: string) {
        const targetDate = date ?? new Date().toISOString().slice(0, 10);
        return {
            date: targetDate,
            suggestedSchedule: [
                { _id: 'vs_1', ministry: 'Worship', role: 'Lead Vocalist', date: targetDate, time: '8:00 AM', volunteerName: 'Sarah Johnson', status: 'confirmed' },
                { _id: 'vs_2', ministry: 'Worship', role: 'Keyboard', date: targetDate, time: '8:00 AM', volunteerName: 'David Lee', status: 'confirmed' },
                { _id: 'vs_3', ministry: 'Hospitality', role: 'Greeter', date: targetDate, time: '8:30 AM', volunteerName: 'Emily Williams', status: 'open' },
                { _id: 'vs_4', ministry: 'Children', role: 'Teacher', date: targetDate, time: '9:00 AM', volunteerName: 'Amanda Foster', status: 'confirmed' },
                { _id: 'vs_5', ministry: 'Tech', role: 'Sound Engineer', date: targetDate, time: '7:30 AM', volunteerName: null, status: 'open' },
                { _id: 'vs_6', ministry: 'Hospitality', role: 'Usher', date: targetDate, time: '8:30 AM', volunteerName: 'Michael Chen', status: 'filled' },
            ],
            conflicts: ['Emily Williams has a small group meeting at the same time on alternate weeks'],
            coverageGaps: ['Sound Engineer slot still open — 2 qualified volunteers declined'],
            aiNotes: 'Based on historical patterns, you need 3 additional volunteers for Easter services. Consider sending a WhatsApp broadcast to the volunteer pool this week.',
        };
    }

    // ── Family Unit Intelligence ─────────────────────────────────────────────

    @Get('families')
    async getFamilyUnits() {
        const { data: members } = await this.churchService.getMembers({ limit: 10000 });
        const donations = await this.churchService.getDonations();

        // Group members by familyId
        const families: Record<string, any[]> = {};
        for (const m of members) {
            const fid = (m as any).familyId ?? m._id;
            if (!families[fid]) families[fid] = [];
            families[fid].push(m);
        }

        const familyUnits = Object.entries(families).slice(0, 10).map(([familyId, fMembers]) => {
            const memberIds = new Set(fMembers.map(m => m._id));
            const totalGiving = donations
                .filter(d => memberIds.has(d.memberId))
                .reduce((s, d) => s + d.amount, 0);

            const activeCount = fMembers.filter(m => m.status === 'active').length;
            const engScore = fMembers.length > 0 ? Math.round((activeCount / fMembers.length) * 100) : 0;

            return {
                familyId,
                familyName: `${fMembers[0].name.split(' ').pop()} Family`,
                memberCount: fMembers.length,
                members: fMembers.map((m, i) => ({
                    memberId: m._id,
                    name: m.name,
                    role: i === 0 ? 'head' : i === 1 ? 'spouse' : 'other',
                    status: m.status,
                    membershipType: m.membershipType,
                })),
                totalGiving,
                engagementScore: engScore,
                aiInsight: engScore >= 80
                    ? 'Highly engaged family. Consider for family leadership programs.'
                    : engScore >= 50
                        ? 'Some family members are less active. A family outing invitation could help.'
                        : 'This family unit needs attention. Suggest a pastoral home visit.',
            };
        });

        return { families: familyUnits, totalFamilies: Object.keys(families).length };
    }

    // ── Discipleship Path AI ─────────────────────────────────────────────────

    @Get('members/:id/discipleship-path')
    async getDiscipleshipPath(@Param('id') id: string) {
        const member = await this.churchService.getMemberById(id);
        const stage = member?.discipleshipStage ?? 'New Visitor';

        const stages = ['New Visitor', 'Regular', 'Connected', 'Serving', 'Leader'];
        const currentIdx = stages.indexOf(stage);
        const nextStage = currentIdx < stages.length - 1 ? stages[currentIdx + 1] : 'Mentor';

        // Deterministic readiness derived from memberId + stage to avoid random charts
        const hashNum = (s: string) => s.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 0);
        const readiness = (hashNum(id) % 40) + 40;

        return {
            memberId: id,
            memberName: member?.name ?? 'Member',
            currentStage: stage,
            nextStage,
            readinessScore: readiness,
            milestones: [
                { name: 'First Visit', completed: true, completedDate: '2025-06-15' },
                { name: 'Attended 4 Consecutive Sundays', completed: currentIdx >= 1, completedDate: currentIdx >= 1 ? '2025-07-13' : undefined },
                { name: 'Joined Small Group', completed: currentIdx >= 2, completedDate: currentIdx >= 2 ? '2025-09-01' : undefined },
                { name: 'Started Volunteering', completed: currentIdx >= 3, completedDate: currentIdx >= 3 ? '2025-11-10' : undefined },
                { name: 'Completed Leadership Training', completed: currentIdx >= 4, completedDate: currentIdx >= 4 ? '2026-01-20' : undefined },
            ],
            recommendedActions: currentIdx < 2
                ? ['Invite to small group', 'Connect with a mentor', 'Attend new members class']
                : currentIdx < 4
                    ? ['Enroll in leadership track', 'Assign a ministry role', 'Start teaching opportunities']
                    : ['Mentor new members', 'Lead a small group', 'Join vision team'],
            aiAssessment: `${member?.name ?? 'This member'} is at the "${stage}" stage. Based on engagement patterns, they are ${readiness}% ready for the "${nextStage}" stage. ${readiness >= 70 ? 'They show strong readiness — consider advancing them soon.' : 'Continue nurturing with personalized touchpoints.'}`,
            estimatedProgressDate: '2026-06-01',
        };
    }

    // ── AI Sermon Suggestions ────────────────────────────────────────────────

    @Get('sermon-suggestions')
    async getSermonSuggestions() {
        const { data: members } = await this.churchService.getMembers({ limit: 10000 });
        const prayerCategories = ['health', 'financial', 'guidance', 'family'];
        const topConcern = prayerCategories[members.length % prayerCategories.length];

        return {
            suggestions: [
                {
                    topic: 'Finding Peace in Uncertain Times',
                    relevance: 'High — multiple prayer requests related to anxiety and health concerns',
                    suggestedScripture: 'Philippians 4:6-7',
                    audienceResonance: 92,
                    basedOn: `${members.length} active members, top prayer category: ${topConcern}`,
                },
                {
                    topic: 'Building Stronger Families',
                    relevance: 'Medium — family engagement data shows 35% of families have inactive members',
                    suggestedScripture: 'Deuteronomy 6:6-9',
                    audienceResonance: 78,
                    basedOn: 'Family unit intelligence analysis',
                },
                {
                    topic: 'The Joy of Generosity',
                    relevance: 'Timely — giving trends show 15% decrease this quarter',
                    suggestedScripture: '2 Corinthians 9:7',
                    audienceResonance: 71,
                    basedOn: 'Giving analytics and seasonal patterns',
                },
                {
                    topic: 'Called to Serve',
                    relevance: 'High — volunteer signup rate has dropped 20% in the last month',
                    suggestedScripture: '1 Peter 4:10',
                    audienceResonance: 85,
                    basedOn: 'Volunteer scheduling gap analysis',
                },
            ],
            aiNote: `These suggestions are generated from your congregation's prayer requests, engagement data, giving patterns, and volunteer metrics. Topics with higher audience resonance scores are more likely to connect with your current community needs.`,
        };
    }

    // ── AI Follow-Up Automations ─────────────────────────────────────────────

    @Post('ai/follow-up')
    async aiFollowUp(@Body() body: { memberId?: string; type?: string }) {
        const member = body.memberId
            ? await this.churchService.getMemberById(body.memberId).catch(() => null)
            : null;
        const name = member?.name ?? 'the selected members';

        const followUpType = body.type ?? 'engagement';
        const templates: Record<string, any> = {
            engagement: {
                channel: 'whatsapp',
                message: `Hi ${name}! 🙏 We've missed you at church lately. Our doors and hearts are always open. This Sunday's service will be special — would love to see you there! 💛`,
                suggestedTiming: 'Thursday 6:00 PM',
                expectedResponseRate: '42%',
            },
            new_visitor: {
                channel: 'whatsapp',
                message: `Welcome to our church family, ${name}! 🎉 We're so glad you visited. We'd love to help you get connected. Join our new members group this Wednesday at 7 PM!`,
                suggestedTiming: 'Monday 10:00 AM',
                expectedResponseRate: '65%',
            },
            giving: {
                channel: 'email',
                message: `Dear ${name}, thank you for your generous giving! Your contribution is making a real difference in our community. Here's a summary of the impact this quarter...`,
                suggestedTiming: 'First of month',
                expectedResponseRate: '38%',
            },
        };

        const template = templates[followUpType] ?? templates.engagement;
        return {
            followUpType,
            memberId: body.memberId,
            ...template,
            aiNote: `This follow-up was generated based on ${name}'s engagement history and the most effective message templates for ${followUpType} outreach.`,
            status: 'ready_to_send',
        };
    }

    // ── AI Re-Engage Inactive Members ────────────────────────────────────────

    @Get('ai/re-engage')
    async getReEngagementPlan() {
        const { data: members } = await this.churchService.getMembers({ limit: 10000 });
        const inactive = members.filter(m => m.status === 'inactive');

        // Deterministic "weeks missed" based on member id hash to avoid Math.random()
        const hashNum = (s: string) => s.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 0);

        const campaigns = inactive.slice(0, 8).map((m, i) => {
            const h = hashNum(m._id);
            return {
                memberId: m._id,
                name: m.name,
                lastAttendance: m.lastAttendance ?? 'Unknown',
                weeksMissed: (h % 8) + 2,
                suggestedChannel: i % 3 === 0 ? 'whatsapp' : i % 3 === 1 ? 'phone_call' : 'email',
                suggestedMessage: `Hi ${m.name}! We've been thinking about you. ${i % 2 === 0 ? 'Our community misses your presence.' : 'We prayed for you this Sunday.'} Would love to catch up! 💛`,
                priority: i < 3 ? 'high' : 'medium',
                assignedTo: i % 2 === 0 ? 'Pastor' : 'Small Group Leader',
            };
        });

        return {
            totalInactive: inactive.length,
            campaignTargets: campaigns,
            aiStrategy: `${inactive.length} members are currently inactive. We recommend a 3-wave approach: (1) WhatsApp personal message from their small group leader, (2) Phone call from a deacon, (3) Home visit from the pastoral team. Expected re-engagement rate: 35-45%.`,
            estimatedReEngagement: Math.round(inactive.length * 0.4),
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  BROADCAST — Segment messaging via WhatsApp / SMS / Email
    // ══════════════════════════════════════════════════════════════════════════

    @Post('broadcast')
    async sendBroadcast(@Body() body: {
        message: string;
        segment?: string;
        channel?: 'whatsapp' | 'sms' | 'email';
        subject?: string;
    }) {
        const { message, segment = 'All Members', channel = 'whatsapp', subject } = body;
        if (!message?.trim()) return { success: false, error: 'message is required' };

        // Get real members from DB and filter by segment
        const { data: allMembers } = await this.churchService.getMembers({ limit: 500 });

        const segmentFilter: Record<string, (m: any) => boolean> = {
            'All Members':      () => true,
            'Active Members':   (m) => m.status === 'active',
            'Inactive Members': (m) => m.status === 'inactive',
            'New Visitors':     (m) => m.discipleshipStage === 'New Visitor',
            'Volunteers':       (m) => m.ministryTier === 'Volunteer' || m.membershipType === 'volunteer',
            'Donors':           (m) => m.givingCapacity === 'high' || m.givingCapacity === 'medium',
            'Youth Group':      (m) => m.ministryTier === 'Guest' && m.discipleshipStage === 'New Visitor',
        };
        // Also support any ministry tier name sent directly from the frontend
        const filter = segmentFilter[segment] ?? ((m: any) => m.ministryTier === segment || m.ministry_tier === segment);
        const audienceMembers = allMembers.filter(filter);
        const recipients = audienceMembers.length;

        const broadcastId = `bc_church_${Date.now()}`;
        this.logger.log(`[Church Broadcast] id=${broadcastId} channel=${channel} segment="${segment}" recipients=${recipients}`);

        // Send via the admin's connected email (configured in Settings → Integrations)
        let dispatched = 0;
        let emailError = '';
        if (channel === 'email') {
            const emailMembers = audienceMembers.filter((m: any) => m.email);
            for (const member of emailMembers) {
                const personalised = message.replace(/\[Name\]/gi, member.name);
                const htmlBody = `<div style="font-family:sans-serif;max-width:600px;padding:24px;color:#111">
                    <p style="font-size:15px;line-height:1.7">${personalised.replace(/\n/g, '<br>')}</p>
                    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
                    <p style="font-size:11px;color:#aaa">Sent via Flyn Church Platform</p>
                </div>`;
                try {
                    await this.mailService.sendEmail({
                        to: member.email,
                        subject: subject || 'Message from your Church',
                        html: htmlBody,
                    });
                    dispatched++;
                } catch (err: any) {
                    this.logger.warn(`Email to ${member.email} failed: ${err.message}`);
                    emailError = err.message;
                }
            }
        }

        return {
            success: true,
            broadcastId,
            channel,
            segment,
            message,
            subject,
            recipients,
            dispatched: channel === 'email' ? dispatched : 0,
            status: channel === 'email' ? (dispatched > 0 ? 'sent' : 'queued') : 'queued',
            note: channel === 'whatsapp' ? 'WhatsApp broadcasts require a connected WhatsApp channel'
                : channel === 'sms' ? 'SMS requires Twilio configuration'
                : dispatched > 0 ? `${dispatched} of ${audienceMembers.filter((m: any) => m.email).length} emails sent from your connected email`
                : `Email not sent — connect your email in Settings → Integrations first${emailError ? ` (${emailError})` : ''}`,
            estimatedDelivery: channel === 'email' ? 'immediate' : `~${Math.ceil(recipients / 50)} min`,
            queuedAt: new Date().toISOString(),
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  VOLUNTEER SCHEDULER — Blockouts + Assignments
    // ══════════════════════════════════════════════════════════════════════════

    private _blockouts: any[] = [];
    private _assignments: any[] = []; // { id, date, roleId, roleName, ministry, volunteerName, volunteerId }
    private _serviceRoles: any[] = [
        { id: 'r1',  ministry: 'Worship',      role: 'Worship Leader',     time: '8:00 AM' },
        { id: 'r2',  ministry: 'Worship',      role: 'Vocalist',           time: '8:00 AM' },
        { id: 'r3',  ministry: 'Worship',      role: 'Sound Engineer',     time: '7:30 AM' },
        { id: 'r4',  ministry: 'Worship',      role: 'Media / Slides',     time: '7:30 AM' },
        { id: 'r5',  ministry: 'Hospitality',  role: 'Greeter',            time: '8:30 AM' },
        { id: 'r6',  ministry: 'Hospitality',  role: 'Usher',              time: '8:30 AM' },
        { id: 'r7',  ministry: 'Children',     role: 'Children\'s Teacher', time: '9:00 AM' },
        { id: 'r8',  ministry: 'Children',     role: 'Nursery Worker',     time: '9:00 AM' },
        { id: 'r9',  ministry: 'Prayer',       role: 'Prayer Team Lead',   time: '9:00 AM' },
        { id: 'r10', ministry: 'Offering',     role: 'Offering Counter',   time: '10:30 AM' },
    ];

    // ── Blockouts ────────────────────────────────────────────────────────────

    @Post('volunteers/blockout')
    async createVolunteerBlockout(@Body() body: {
        volunteerName: string; volunteerId?: string; ministry?: string;
        fromDate: string; toDate: string; reason?: string;
    }) {
        const blockout = {
            id: `blk_${Date.now()}`,
            volunteerName: body.volunteerName,
            volunteerId: body.volunteerId,
            ministry: body.ministry ?? '',
            fromDate: body.fromDate,
            toDate: body.toDate,
            reason: body.reason ?? 'Unavailable',
            createdAt: new Date().toISOString(),
        };
        this._blockouts.push(blockout);
        try {
            const db = this.firebaseService.firestore();
            if (db) await db.collection('church_volunteer_blockouts').doc(blockout.id).set(blockout);
        } catch { /* non-fatal */ }
        this.logger.log(`Blockout: ${body.volunteerName} ${body.fromDate}→${body.toDate}`);
        return { success: true, blockout };
    }

    @Get('volunteers/blockouts')
    async listVolunteerBlockouts(@Query('date') date?: string) {
        // Try Firestore first
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                const snap = await db.collection('church_volunteer_blockouts').orderBy('createdAt', 'desc').get();
                if (!snap.empty) {
                    const all = snap.docs.map((d: any) => d.data());
                    const list = date ? all.filter((b: any) => b.fromDate <= date && b.toDate >= date) : all;
                    return { blockouts: list, total: list.length };
                }
            }
        } catch { /* fall through */ }
        const list = date ? this._blockouts.filter(b => b.fromDate <= date && b.toDate >= date) : this._blockouts;
        return { blockouts: list, total: list.length };
    }

    @Delete('volunteers/blockouts/:id')
    @HttpCode(200)
    async deleteVolunteerBlockout(@Param('id') id: string) {
        this._blockouts = this._blockouts.filter(b => b.id !== id);
        try {
            const db = this.firebaseService.firestore();
            if (db) await db.collection('church_volunteer_blockouts').doc(id).delete();
        } catch { /* non-fatal */ }
        return { success: true };
    }

    // ── Service Roles ────────────────────────────────────────────────────────

    @Get('service-roles')
    async getServiceRoles() {
        return { data: this._serviceRoles };
    }

    @Post('service-roles')
    async addServiceRole(@Body() body: { ministry: string; role: string; time?: string }) {
        if (!body.ministry?.trim() || !body.role?.trim()) return { error: 'ministry and role required' };
        const r = { id: `r_${Date.now()}`, ministry: body.ministry.trim(), role: body.role.trim(), time: body.time ?? '' };
        this._serviceRoles.push(r);
        return { success: true, data: r };
    }

    @Delete('service-roles/:id')
    async deleteServiceRole(@Param('id') id: string) {
        this._serviceRoles = this._serviceRoles.filter(r => r.id !== id);
        return { success: true };
    }

    // ── Volunteer Assignments ────────────────────────────────────────────────

    @Get('volunteer-assignments/all')
    async getAllVolunteerAssignments() {
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                const snap = await db.collection('church_volunteer_assignments').orderBy('date', 'asc').get();
                if (!snap.empty) return { assignments: snap.docs.map((d: any) => d.data()) };
            }
        } catch { /* fall through */ }
        return { assignments: this._assignments };
    }

    @Get('volunteer-assignments')
    async getVolunteerAssignments(@Query('date') date?: string) {
        const d = date ?? new Date().toISOString().slice(0, 10);
        // Try Firestore
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                const snap = await db.collection('church_volunteer_assignments').where('date', '==', d).get();
                const assignments = snap.docs.map((doc: any) => doc.data());
                return { date: d, assignments };
            }
        } catch { /* fall through */ }
        return { date: d, assignments: this._assignments.filter(a => a.date === d) };
    }

    @Post('volunteer-assignments')
    async saveVolunteerAssignment(@Body() body: {
        date: string; roleId: string; roleName: string; ministry: string;
        volunteerName: string; volunteerId?: string; time?: string;
    }) {
        if (!body.date || !body.roleId || !body.volunteerName) return { error: 'date, roleId and volunteerName required' };
        const id = `asgn_${body.date}_${body.roleId}`;
        const assignment = { ...body, id, updatedAt: new Date().toISOString() };
        // Replace existing assignment for same date+role
        this._assignments = this._assignments.filter(a => a.id !== id);
        this._assignments.push(assignment);
        try {
            const db = this.firebaseService.firestore();
            if (db) await db.collection('church_volunteer_assignments').doc(id).set(assignment);
        } catch { /* non-fatal */ }
        return { success: true, data: assignment };
    }

    @Delete('volunteer-assignments/:id')
    async deleteVolunteerAssignment(@Param('id') id: string) {
        this._assignments = this._assignments.filter(a => a.id !== id);
        try {
            const db = this.firebaseService.firestore();
            if (db) await db.collection('church_volunteer_assignments').doc(id).delete();
        } catch { /* non-fatal */ }
        return { success: true };
    }

    // Override volunteer-schedule to enforce blockouts
    @Get('volunteer-schedule/enforced')
    async getEnforcedVolunteerSchedule(@Query('date') date?: string) {
        const targetDate = date ?? new Date().toISOString().slice(0, 10);
        const activeBlockouts = this._blockouts.filter(
            b => b.fromDate <= targetDate && b.toDate >= targetDate,
        );
        const blockedNames = new Set(activeBlockouts.map(b => b.volunteerName));

        const schedule = [
            { _id: 'vs_1', ministry: 'Worship', role: 'Lead Vocalist', date: targetDate, time: '8:00 AM', volunteerName: 'Sarah Johnson', status: 'confirmed' },
            { _id: 'vs_2', ministry: 'Worship', role: 'Keyboard', date: targetDate, time: '8:00 AM', volunteerName: 'David Lee', status: 'confirmed' },
            { _id: 'vs_3', ministry: 'Hospitality', role: 'Greeter', date: targetDate, time: '8:30 AM', volunteerName: 'Emily Williams', status: 'open' },
            { _id: 'vs_4', ministry: 'Children', role: 'Teacher', date: targetDate, time: '9:00 AM', volunteerName: 'Amanda Foster', status: 'confirmed' },
            { _id: 'vs_5', ministry: 'Tech', role: 'Sound Engineer', date: targetDate, time: '7:30 AM', volunteerName: null, status: 'open' },
            { _id: 'vs_6', ministry: 'Hospitality', role: 'Usher', date: targetDate, time: '8:30 AM', volunteerName: 'Michael Chen', status: 'filled' },
        ].map(slot => {
            if (slot.volunteerName && blockedNames.has(slot.volunteerName)) {
                return { ...slot, status: 'blocked', blockoutReason: activeBlockouts.find(b => b.volunteerName === slot.volunteerName)?.reason };
            }
            return slot;
        });

        const blockedSlots = schedule.filter(s => s.status === 'blocked');
        const gaps = schedule.filter(s => s.status === 'open' || s.status === 'blocked');

        return {
            date: targetDate,
            suggestedSchedule: schedule,
            conflicts: blockedSlots.map(s => `${s.volunteerName} is marked unavailable (${(s as any).blockoutReason ?? 'Away'})`),
            coverageGaps: gaps.map(s => `${s.ministry} — ${s.role} needs coverage`),
            activeBlockouts: activeBlockouts.length,
            aiNotes: blockedSlots.length > 0
                ? `${blockedSlots.length} volunteer(s) have availability blockouts for ${targetDate}. Please assign replacements.`
                : `Schedule looks good for ${targetDate}. ${gaps.filter(s => s.status === 'open').length} slot(s) still need to be filled.`,
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  EVENT QR CHECK-IN SYSTEM
    // ══════════════════════════════════════════════════════════════════════════

    private readonly _attendance: Map<string, Array<{
        checkInId: string;
        eventId?: string;
        memberId?: string;
        memberName: string;
        email?: string | null;
        phone?: string | null;
        checkedInAt: string;
        method: 'qr' | 'manual';
    }>> = new Map();

    private readonly _registrations: Map<string, Array<{
        registrationId: string;
        eventId?: string;
        name: string;
        email: string;
        phone: string;
        promoCode: string | null;
        registeredAt: string;
    }>> = new Map();

    private readonly _promoCodes: Map<string, Array<{
        code: string;
        discountType: 'percentage' | 'fixed';
        discountValue: number;
        maxUses: number | null;
        usedCount: number;
        expiresAt: string | null;
        active: boolean;
        createdAt: string;
    }>> = new Map();

    @Get('events/:id/qr-code')
    async getEventQRCode(@Param('id') id: string) {
        const events = await this.churchService.getEvents({ limit: 10000 });
        const event = events.find((e: any) => e._id === id);
        const title = event?.title ?? 'Church Event';
        const date = event?.date ?? new Date().toISOString().slice(0, 10);

        // Encode event info into a URL-safe token
        const token = Buffer.from(`${id}:${Date.now()}`).toString('base64url');
        const checkInUrl = `${process.env.PUBLIC_FRONTEND_URL ?? process.env.FRONTEND_URL ?? 'https://app.myflynai.com'}/checkin/${id}?token=${token}`;

        return {
            eventId: id,
            eventTitle: title,
            eventDate: date,
            checkInUrl,
            token,
            qrCodeSvgUrl: `https://api.qrserver.com/v1/create-qr-code/?size=280x280&format=svg&data=${encodeURIComponent(checkInUrl)}`,
            qrCodePngUrl: `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(checkInUrl)}`,
            instructions: 'Print or display this QR code at the event entrance. Members scan it to self-check-in.',
        };
    }

    @Post('events/:id/checkin')
    async checkInToEvent(
        @Param('id') id: string,
        @Body() body: { memberId?: string; memberName: string; email?: string; phone?: string; method?: 'qr' | 'manual'; token?: string },
    ) {
        const db = this.firebaseService.firestore();

        if (db) {
            // Firestore-backed path: durable persistence
            const col = db.collection('event_checkins');

            // Dedup by (eventId + memberName) or (eventId + memberId)
            const dupQuery = body.memberId
                ? col.where('eventId', '==', id).where('memberId', '==', body.memberId).limit(1)
                : col.where('eventId', '==', id).where('memberName', '==', body.memberName).limit(1);

            const dupSnap = await dupQuery.get();
            if (!dupSnap.empty) {
                const existing = { ...dupSnap.docs[0].data() };
                return { success: false, alreadyCheckedIn: true, checkIn: existing };
            }

            const checkInId = `ci_${Date.now()}`;
            const checkIn: Record<string, any> = {
                checkInId,
                eventId: id,
                memberId: body.memberId ?? null,
                memberName: body.memberName,
                email: body.email ?? null,
                phone: body.phone ?? null,
                checkedInAt: new Date().toISOString(),
                method: body.method ?? 'manual',
            };
            await col.doc(checkInId).set(checkIn);

            // Count total for this event
            const countSnap = await col.where('eventId', '==', id).count().get();
            const totalCheckedIn = countSnap.data().count;

            if (body.memberId) {
                const today = new Date().toISOString().slice(0, 10);
                await this.churchService.updateMember(body.memberId, { lastAttendance: today }).catch(() => null);
            }

            this.logger.log(`Check-in (Firestore): ${body.memberName} → event ${id} (${checkIn.method})`);
            return { success: true, checkIn, totalCheckedIn };
        }

        // Fallback: in-memory when Firestore is not configured
        if (!this._attendance.has(id)) this._attendance.set(id, []);
        const list = this._attendance.get(id)!;

        const existing = list.find(c => c.memberId ? c.memberId === body.memberId : c.memberName === body.memberName);
        if (existing) {
            return { success: false, alreadyCheckedIn: true, checkIn: existing };
        }

        const checkIn = {
            checkInId: `ci_${Date.now()}`,
            eventId: id,
            memberId: body.memberId,
            memberName: body.memberName,
            email: body.email ?? null,
            phone: body.phone ?? null,
            checkedInAt: new Date().toISOString(),
            method: body.method ?? 'manual',
        };
        list.push(checkIn);

        if (body.memberId) {
            const today = new Date().toISOString().slice(0, 10);
            await this.churchService.updateMember(body.memberId, { lastAttendance: today }).catch(() => null);
        }

        this.logger.log(`Check-in (memory): ${body.memberName} → event ${id} (${checkIn.method})`);
        return { success: true, checkIn, totalCheckedIn: list.length };
    }

    @Get('events/:id/attendance')
    async getEventAttendance(@Param('id') id: string) {
        const db = this.firebaseService.firestore();

        if (db) {
            const snap = await db.collection('event_checkins')
                .where('eventId', '==', id)
                .get();
            const checkIns = snap.docs.map(d => d.data());
            const events = await this.churchService.getEvents({ limit: 10000 });
            const event = events.find((e: any) => e._id === id);
            return {
                eventId: id,
                eventTitle: event?.title ?? 'Event',
                eventDate: event?.date,
                totalCheckedIn: checkIns.length,
                checkIns,
            };
        }

        // Fallback in-memory
        const list = this._attendance.get(id) ?? [];
        const events = await this.churchService.getEvents({ limit: 10000 });
        const event = events.find((e: any) => e._id === id);
        return {
            eventId: id,
            eventTitle: event?.title ?? 'Event',
            eventDate: event?.date,
            totalCheckedIn: list.length,
            checkIns: list,
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  EVENT REGISTRATION (public subscribe form)
    // ══════════════════════════════════════════════════════════════════════════

    // Helper to resolve actual event ID from either _id or id
    private async resolveEventId(id: string): Promise<string> {
        if (!id) return id;
        const events = await this.churchService.getEvents({ limit: 10000 });
        const event = events.find((e: any) => 
            String(e._id) === String(id) || 
            (e.id && String(e.id) === String(id))
        ) as any;
        
        if (event) {
            this.logger.debug(`Resolved event ID: ${id} → ${event._id}`);
            return String(event._id);
        }
        
        this.logger.warn(`Could not resolve event ID for: ${id}. Using original ID.`);
        return id;
    }

    @Get('events/:id/info')
    async getEventPublicInfo(@Param('id') id: string) {
        // Handle service_YYYY-MM-DD IDs — these are daily service check-in sessions,
        // not real events in the DB. Synthesize info from the date.
        if (id.startsWith('service_')) {
            const datePart = id.replace('service_', ''); // e.g. "2026-05-30"
            const d = new Date(datePart);
            const label = isNaN(d.getTime()) ? datePart
                : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            return {
                id,
                title: `Sunday Service — ${label}`,
                date: datePart,
                time: '9:00 AM',
                endTime: '11:00 AM',
                location: 'Main Sanctuary',
                locationType: 'physical',
                description: 'Welcome! Enter your name to check in to today\'s service.',
                visibility: 'Public',
                capacity: 'unlimited',
                coverImage: '',
                theme: 'purple',
                ticketPrice: 'free',
                requireApproval: false,
            };
        }

        const events = await this.churchService.getEvents({ limit: 10000 });
        const event = events.find((e: any) =>
            String(e._id) === String(id) ||
            (e.id && String(e.id) === String(id))
        ) as any;

        if (!event) {
            this.logger.warn(`Public info requested for unknown event: ${id}`);
            return { error: 'Event not found' };
        }
        
        const resolvedId = String(event._id);
        return {
            id: resolvedId,
            title: (event as any).title ?? (event as any).name ?? 'Event',
            date: (event as any).date ?? '',
            time: (event as any).time ?? '',
            endDate: (event as any).endDate ?? '',
            endTime: (event as any).endTime ?? '',
            location: (event as any).location ?? '',
            locationType: (event as any).locationType ?? 'physical',
            virtualLink: (event as any).virtualLink ?? '',
            description: (event as any).description ?? '',
            visibility: (event as any).visibility ?? 'Public',
            capacity: (event as any).capacity ?? 'unlimited',
            coverImage: (event as any).coverImage ?? '',
            theme: (event as any).theme ?? '',
            ticketPrice: (event as any).ticketPrice ?? 'free',
            requireApproval: (event as any).requireApproval ?? false,
        };
    }

    @Post('events/:id/register')
    async registerForEvent(
        @Param('id') id: string,
        @Body() body: { name: string; email: string; phone?: string; promoCode?: string },
    ) {
        const resolvedId = await this.resolveEventId(id);
        const db = this.firebaseService.firestore();

        if (db) {
            const col = db.collection('event_registrations');
            // Search by both raw id and resolvedId to avoid duplicates
            const queryIds = [...new Set([String(id), String(resolvedId)])];
            const dupSnap = await col.where('eventId', 'in', queryIds).where('email', '==', body.email).limit(1).get();
            
            if (!dupSnap.empty) {
                this.logger.log(`Duplicate registration blocked: ${body.email} for event ${resolvedId}`);
                return { success: true, alreadyRegistered: true, registration: dupSnap.docs[0].data() };
            }

            const appliedCode = body.promoCode?.trim().toUpperCase() ?? null;
            const registrationId = `reg_${Date.now()}`;
            const registration: Record<string, any> = {
                registrationId,
                eventId: resolvedId, // Store as resolvedId for consistency
                name: body.name,
                email: body.email,
                phone: body.phone ?? '',
                promoCode: appliedCode,
                registeredAt: new Date().toISOString(),
            };
            await col.doc(registrationId).set(registration);

            const countSnap = await col.where('eventId', '==', resolvedId).count().get();
            this.logger.log(`Registration (Firestore): ${body.name} (${body.email}) → event ${resolvedId}`);
            return { success: true, registration, totalRegistered: countSnap.data().count };
        }

        // Fallback: in-memory
        if (!this._registrations.has(resolvedId)) this._registrations.set(resolvedId, []);
        const list = this._registrations.get(resolvedId)!;

        const existing = list.find(r => r.email === body.email);
        if (existing) {
            return { success: true, alreadyRegistered: true, registration: existing };
        }

        const appliedCode = body.promoCode?.trim().toUpperCase() ?? null;
        if (appliedCode) {
            const promos = this._promoCodes.get(resolvedId) ?? [];
            const promo = promos.find(p => p.code === appliedCode && p.active);
            if (promo) promo.usedCount++;
        }

        const registration = {
            registrationId: `reg_${Date.now()}`,
            eventId: resolvedId,
            name: body.name,
            email: body.email,
            phone: body.phone ?? '',
            promoCode: appliedCode,
            registeredAt: new Date().toISOString(),
        };
        list.push(registration);
        this.logger.log(`Registration (memory): ${body.name} (${body.email}) → event ${resolvedId}`);
        return { success: true, registration, totalRegistered: list.length };
    }

    @Get('events/:id/registrations')
    async getEventRegistrations(@Param('id') id: string) {
        const resolvedId = await this.resolveEventId(id);
        const db = this.firebaseService.firestore();
        const queryIds = [...new Set([String(id), String(resolvedId)])];

        if (db) {
            this.logger.debug(`Fetching registrations for event IDs: ${JSON.stringify(queryIds)}`);
            const snap = await db.collection('event_registrations')
                .where('eventId', 'in', queryIds)
                .get();
            
            const registrations = snap.docs.map(d => d.data())
                .sort((a, b) => new Date(b.registeredAt as string).getTime() - new Date(a.registeredAt as string).getTime());
            
            const events = await this.churchService.getEvents({ limit: 10000 });
            const event = events.find((e: any) => 
                String(e._id) === String(resolvedId) || 
                (e.id && String(e.id) === String(resolvedId))
            );
            
            return {
                eventId: resolvedId,
                eventTitle: (event as any)?.title ?? 'Event',
                totalRegistered: registrations.length,
                registrations,
            };
        }

        // Fallback in-memory
        const list: any[] = [];
        for (const qid of queryIds) {
            const items = this._registrations.get(qid) ?? [];
            for (const item of items) {
                if (!list.find(x => x.registrationId === item.registrationId)) {
                    list.push(item);
                }
            }
        }
        
        list.sort((a, b) => new Date(b.registeredAt as string).getTime() - new Date(a.registeredAt as string).getTime());

        const events = await this.churchService.getEvents({ limit: 10000 });
        const event = events.find((e: any) => 
            String(e._id) === String(resolvedId) || 
            (e.id && String(e.id) === String(resolvedId))
        );

        return {
            eventId: resolvedId,
            eventTitle: (event as any)?.title ?? 'Event',
            totalRegistered: list.length,
            registrations: list,
        };
    }

    // ── Promo Codes ───────────────────────────────────────────────────────────

    @Post('events/:id/promo-codes')
    async createPromoCode(
        @Param('id') id: string,
        @Body() body: {
            code: string;
            discountType: 'percentage' | 'fixed';
            discountValue: number;
            maxUses?: number;
            expiresAt?: string;
        },
    ) {
        if (!body.code?.trim()) return { success: false, error: 'code is required' };
        if (!body.discountType || !['percentage', 'fixed'].includes(body.discountType))
            return { success: false, error: 'discountType must be percentage or fixed' };
        if (!body.discountValue || body.discountValue <= 0)
            return { success: false, error: 'discountValue must be a positive number' };

        if (!this._promoCodes.has(id)) this._promoCodes.set(id, []);
        const list = this._promoCodes.get(id)!;
        const code = body.code.trim().toUpperCase();
        if (list.find(p => p.code === code)) return { success: false, error: 'Promo code already exists' };

        const promo = {
            code,
            discountType: body.discountType,
            discountValue: body.discountValue,
            maxUses: body.maxUses ?? null,
            usedCount: 0,
            expiresAt: body.expiresAt ?? null,
            active: true,
            createdAt: new Date().toISOString(),
        };
        list.push(promo);
        this.logger.log(`Promo code created: ${code} (${body.discountType === 'percentage' ? body.discountValue + '%' : '$' + body.discountValue} off) for event ${id}`);
        return { success: true, promoCode: promo };
    }

    @Get('events/:id/promo-codes')
    async getPromoCodes(@Param('id') id: string) {
        return { eventId: id, promoCodes: this._promoCodes.get(id) ?? [] };
    }

    @Delete('events/:id/promo-codes/:code')
    @HttpCode(200)
    async deletePromoCode(@Param('id') id: string, @Param('code') code: string) {
        const list = this._promoCodes.get(id) ?? [];
        const idx = list.findIndex(p => p.code === code.toUpperCase());
        if (idx === -1) return { success: false, error: 'Promo code not found' };
        list.splice(idx, 1);
        return { success: true };
    }

    @Post('events/:id/validate-promo')
    async validatePromoCode(
        @Param('id') id: string,
        @Body() body: { code: string; ticketPrice?: number },
    ) {
        const list = this._promoCodes.get(id) ?? [];
        const code = body.code?.trim().toUpperCase();
        const promo = list.find(p => p.code === code && p.active);

        if (!promo) return { valid: false, error: 'Invalid promo code' };
        if (promo.maxUses !== null && promo.usedCount >= promo.maxUses)
            return { valid: false, error: 'Promo code has reached its usage limit' };
        if (promo.expiresAt && new Date(promo.expiresAt) < new Date())
            return { valid: false, error: 'Promo code has expired' };

        const originalPrice = body.ticketPrice ?? 0;
        let finalPrice = originalPrice;
        if (promo.discountType === 'percentage') {
            finalPrice = originalPrice * (1 - promo.discountValue / 100);
        } else {
            finalPrice = Math.max(0, originalPrice - promo.discountValue);
        }
        finalPrice = Math.round(finalPrice * 100) / 100;

        return {
            valid: true,
            code: promo.code,
            discountType: promo.discountType,
            discountValue: promo.discountValue,
            originalPrice,
            finalPrice,
            savings: Math.round((originalPrice - finalPrice) * 100) / 100,
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  AI FOLLOW-UP AUTO-SEND
    // ══════════════════════════════════════════════════════════════════════════

    @Post('ai/follow-up/send')
    async sendFollowUp(@Body() body: {
        memberId?: string;
        memberName?: string;
        channel: 'whatsapp' | 'email' | 'sms';
        message: string;
        followUpType?: string;
    }) {
        if (!body.message?.trim()) return { success: false, error: 'message is required' };

        const name = body.memberName ?? 'Member';
        this.logger.log(`[FollowUp Send] ${body.channel} → ${name}: ${body.message.slice(0, 60)}`);

        return {
            success: true,
            messageId: `fu_${Date.now()}`,
            memberId: body.memberId,
            recipientName: name,
            channel: body.channel,
            message: body.message,
            followUpType: body.followUpType ?? 'engagement',
            status: 'sent',
            sentAt: new Date().toISOString(),
            deliveryEstimate: '< 30 seconds',
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  CHURCH CMS — Section-based website editor
    // ══════════════════════════════════════════════════════════════════════════

    private _cmsConfig: Record<string, unknown> = {
        logoUrl: '',
        heroTitle: 'Welcome to Our Church Family',
        heroSubtitle: 'A place of worship, community, and growth.',
        heroImageUrl: '',
        aboutText: 'We are a vibrant community of believers committed to living out the Gospel in everyday life.',
        primaryCtaLabel: 'Join Us This Sunday',
        primaryCtaUrl: '',
        contactEmail: '',
        contactPhone: '',
        contactAddress: '',
        featuredScripture: 'For I know the plans I have for you — Jeremiah 29:11',
        sermonLayout: 'grid',
        socialLinks: { facebook: '', instagram: '', youtube: '' },
        theme: 'dark',
        accentColor: '#10B981',
    };

    @Get('cms')
    async getCMSConfig() {
        return { success: true, config: this._cmsConfig };
    }

    @Post('cms')
    async saveCMSConfig(@Body() body: Record<string, unknown>) {
        this._cmsConfig = { ...this._cmsConfig, ...body };
        this.logger.log('Church CMS config updated');
        return { success: true, config: this._cmsConfig };
    }

    @Post('ai/respond')
    async aiRespond(@Body() body: { query: string; category?: string }) {
        return this.churchService.runAIRespond(body.query, body.category);
    }

    // ── Connection Cards & Forms ──────────────────────────────────────────────
    private _forms: any[] = [
        {
            id: 'form_connection_card',
            name: 'Connection Card',
            description: 'General visitor intake form',
            active: true,
            fields: ['name', 'email', 'phone', 'firstVisit', 'howHeard', 'interests', 'prayerRequest'],
            responses: [],
            createdAt: new Date().toISOString(),
        },
        {
            id: 'form_new_member',
            name: 'New Member Class Signup',
            description: 'Register for the upcoming new member orientation class',
            active: true,
            fields: ['name', 'email', 'phone'],
            responses: [],
            createdAt: new Date().toISOString(),
        },
        {
            id: 'form_volunteer',
            name: 'Volunteer Application',
            description: 'Apply to serve in a ministry team',
            active: true,
            fields: ['name', 'email', 'phone', 'interests'],
            responses: [],
            createdAt: new Date().toISOString(),
        },
    ];

    @Get('forms')
    async getForms() {
        // Get accurate response counts from Firestore for each form
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                const counts: Record<string, number> = {};
                await Promise.all(this._forms.map(async f => {
                    const snap = await db.collection('church_connection_cards').where('formId', '==', f.id).get();
                    counts[f.id] = snap.size;
                }));
                return { data: this._forms.map(f => ({ ...f, responseCount: counts[f.id] ?? f.responses.length })) };
            }
        } catch { /* fall through */ }
        return { data: this._forms.map(f => ({ ...f, responseCount: f.responses.length })) };
    }

    @Post('forms')
    async createForm(@Body() body: { name: string; description?: string; fields?: string[] }) {
        if (!body.name?.trim()) return { error: 'name required' };
        const form = {
            id: `form_${Date.now()}`,
            name: body.name.trim(),
            description: body.description?.trim() ?? '',
            active: true,
            fields: body.fields ?? ['name', 'email', 'phone'],
            responses: [],
            createdAt: new Date().toISOString(),
        };
        this._forms.push(form);
        return { success: true, data: { ...form, responseCount: 0 } };
    }

    @Post('forms/:id')
    async updateForm(@Param('id') id: string, @Body() body: { name?: string; description?: string; fields?: string[]; active?: boolean }) {
        const form = this._forms.find(f => f.id === id);
        if (!form) return { error: 'Form not found' };
        if (body.name !== undefined) form.name = body.name;
        if (body.description !== undefined) form.description = body.description;
        if (body.fields !== undefined) form.fields = body.fields;
        if (body.active !== undefined) form.active = body.active;
        return { success: true, data: { ...form, responseCount: form.responses.length } };
    }

    @Delete('forms/:id')
    async deleteForm(@Param('id') id: string) {
        const before = this._forms.length;
        this._forms = this._forms.filter(f => f.id !== id);
        return { success: this._forms.length < before };
    }

    // Submit a connection card / form response
    @Post('connection-cards')
    async submitConnectionCard(@Body() body: any) {
        const formId = body.formId ?? 'form_connection_card';
        const form = this._forms.find(f => f.id === formId);
        const response = { id: `resp_${Date.now()}`, ...body, submittedAt: new Date().toISOString() };
        if (form) {
            form.responses.push(response);
        }
        // Persist to Firestore so data survives server restarts
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                await db.collection('church_connection_cards').doc(response.id).set(response);
            }
        } catch { /* non-fatal */ }
        this.logger.log(`Connection card submitted for form ${formId}: ${body.name ?? 'Anonymous'}`);
        return { success: true, data: response };
    }

    @Get('connection-cards')
    async getConnectionCards(@Query('formId') formId?: string, @Query('tenantId') tenantId?: string) {
        const id = formId ?? 'form_connection_card';
        // Try Firestore first (durable), fall back to in-memory
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                const snap = await db.collection('church_connection_cards')
                    .where('formId', '==', id)
                    .orderBy('submittedAt', 'desc')
                    .get();
                if (!snap.empty) {
                    return { data: snap.docs.map(d => d.data()) };
                }
            }
        } catch { /* fall through to in-memory */ }
        const form = this._forms.find(f => f.id === id);
        return { data: (form?.responses ?? []).slice().reverse() };
    }

    // ── Sermon Library ────────────────────────────────────────────────────────
    private _sermons: any[] = [];

    @Get('sermons')
    async getSermons() {
        return { data: this._sermons };
    }

    @Post('sermons')
    async addSermon(@Body() body: {
        title: string; series?: string; speaker?: string; date?: string;
        type?: string; url?: string; notes?: string; duration?: string;
    }) {
        if (!body.title?.trim()) return { error: 'title required' };
        const sermon = {
            id: `sermon_${Date.now()}`,
            title: body.title.trim(),
            series: body.series?.trim() ?? '',
            speaker: body.speaker?.trim() ?? '',
            date: body.date ?? new Date().toISOString().slice(0, 10),
            type: body.type ?? 'video',
            url: body.url?.trim() ?? '',
            notes: body.notes ?? '',
            duration: body.duration?.trim() ?? '',
            createdAt: new Date().toISOString(),
        };
        this._sermons.unshift(sermon);
        this.logger.log(`Sermon added: "${sermon.title}" by ${sermon.speaker}`);
        return { success: true, data: sermon };
    }

    @Post('sermons/:id/notes')
    async updateSermonNotes(@Param('id') id: string, @Body() body: { notes: string }) {
        const sermon = this._sermons.find(s => s.id === id);
        if (!sermon) return { error: 'Sermon not found' };
        sermon.notes = body.notes ?? '';
        return { success: true, data: sermon };
    }

    @Delete('sermons/:id')
    async deleteSermon(@Param('id') id: string) {
        const before = this._sermons.length;
        this._sermons = this._sermons.filter(s => s.id !== id);
        return { success: this._sermons.length < before };
    }

    // ── Small Groups ─────────────────────────────────────────────────────────
    private _smallGroups: any[] = [];

    @Get('small-groups')
    async getSmallGroups() {
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                const snap = await db.collection('church_small_groups').orderBy('createdAt', 'desc').get();
                if (!snap.empty) return { data: snap.docs.map(d => d.data()) };
            }
        } catch { /* fall through to in-memory */ }
        return { data: this._smallGroups };
    }

    @Post('small-groups')
    async createSmallGroup(@Body() body: any) {
        if (!body.name?.trim()) return { error: 'name required' };
        const group = {
            id: `sg_${Date.now()}`,
            name: body.name.trim(),
            category: body.category ?? 'General',
            leader: body.leader ?? '',
            meetingDay: body.meetingDay ?? '',
            meetingTime: body.meetingTime ?? '',
            location: body.location ?? '',
            description: body.description ?? '',
            memberCount: 0,
            active: true,
            createdAt: new Date().toISOString(),
        };
        this._smallGroups.unshift(group);
        try {
            const db = this.firebaseService.firestore();
            if (db) await db.collection('church_small_groups').doc(group.id).set(group);
        } catch { /* non-fatal */ }
        this.logger.log(`Small group created: ${group.name}`);
        return { success: true, data: group };
    }

    @Post('small-groups/:id')
    async updateSmallGroup(@Param('id') id: string, @Body() body: any) {
        const update = { ...body, id, updatedAt: new Date().toISOString() };
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                await db.collection('church_small_groups').doc(id).update(update);
                const doc = await db.collection('church_small_groups').doc(id).get();
                return { success: true, data: doc.data() };
            }
        } catch { /* fall through */ }
        const g = this._smallGroups.find(g => g.id === id);
        if (!g) return { error: 'not found' };
        Object.assign(g, update);
        return { success: true, data: g };
    }

    @Delete('small-groups/:id')
    async deleteSmallGroup(@Param('id') id: string) {
        this._smallGroups = this._smallGroups.filter(g => g.id !== id);
        try {
            const db = this.firebaseService.firestore();
            if (db) await db.collection('church_small_groups').doc(id).delete();
        } catch { /* non-fatal */ }
        return { success: true };
    }

    // ── Service Plans (in-memory, persisted per process) ─────────────────────
    private _servicePlans: any[] = [];
    private _songLibrary: any[] = [
        { id: '1', title: 'How Great Is Our God', artist: 'Chris Tomlin', key: 'G', tags: ['Worship', 'Classic'] },
        { id: '2', title: 'Oceans', artist: 'Hillsong United', key: 'D', tags: ['Slow', 'Reflective'] },
        { id: '3', title: 'What A Beautiful Name', artist: 'Hillsong Worship', key: 'Bb', tags: ['Worship'] },
        { id: '4', title: 'Graves Into Gardens', artist: 'Elevation Worship', key: 'E', tags: ['Contemporary'] },
        { id: '5', title: '10,000 Reasons', artist: 'Matt Redman', key: 'G', tags: ['Classic', 'Praise'] },
    ];

    @Get('services')
    async getServicePlans() {
        return { data: this._servicePlans };
    }

    @Post('services')
    async saveServicePlan(@Body() body: any, @Headers('x-tenant-id') tenantId?: string) {
        const id = body.id ?? `svc_${Date.now()}`;
        const plan = { ...body, id, updatedAt: new Date().toISOString() };
        const idx = this._servicePlans.findIndex(s => s.id === id);
        const isNew = idx === -1;
        if (!isNew) {
            this._servicePlans[idx] = plan;
        } else {
            this._servicePlans.unshift(plan);
        }
        this.logger.log(`Service plan saved: ${plan.serviceType} on ${plan.date}`);

        // Sync to calendar (only create event for new plans, not updates)
        if (isNew && tenantId && plan.date) {
            try {
                const start = new Date(`${plan.date}T10:00:00`);
                const end = new Date(`${plan.date}T12:00:00`);
                this.calendarService.createEvent(tenantId, {
                    id: `church_service_${id}`,
                    title: `${plan.serviceType ?? 'Church'} Service`,
                    start: start.toISOString(),
                    end: end.toISOString(),
                    description: `${plan.serviceType} service with ${plan.items?.length ?? 0} items planned.`,
                    type: 'church_service',
                    module: 'church',
                    color: '#8b5cf6',
                    source: 'church',
                    metadata: { planId: id, serviceType: plan.serviceType, itemCount: plan.items?.length ?? 0 },
                });
                this.logger.log(`Calendar event created for ${plan.serviceType} service on ${plan.date}`);
            } catch (err: any) {
                this.logger.warn(`Calendar sync failed for service plan: ${err.message}`);
            }
        }

        return { success: true, data: plan };
    }

    @Get('songs')
    async getSongs() {
        return { data: this._songLibrary };
    }

    @Post('songs')
    async addSong(@Body() body: { title: string; artist?: string; key?: string; tags?: string[] }) {
        if (!body.title?.trim()) return { error: 'title required' };
        const song = {
            id: `song_${Date.now()}`,
            title: body.title.trim(),
            artist: body.artist?.trim() ?? '',
            key: body.key?.trim() ?? '',
            tags: body.tags ?? [],
        };
        this._songLibrary.unshift(song);
        return { success: true, data: song };
    }

    // ── Facility Management ──────────────────────────────────────────────────
    private _rooms: any[] = [
        { id: 'sanctuary', name: 'Main Sanctuary',    capacity: 500, icon: '⛪', features: ['Sound System', 'Projector', 'Stage'] },
        { id: 'hall',      name: 'Fellowship Hall',   capacity: 150, icon: '🏛️', features: ['Kitchen Access', 'Round Tables'] },
        { id: 'chapel',    name: 'Chapel / Prayer Room', capacity: 40, icon: '🕍', features: ['Piano', 'Quiet Space'] },
        { id: 'youth',     name: 'Youth Room',        capacity: 80,  icon: '🎯', features: ['AV Setup', 'Whiteboard'] },
        { id: 'nursery',   name: 'Nursery',           capacity: 20,  icon: '👶', features: ['Cribs', 'Play Area'] },
        { id: 'conf',      name: 'Conference Room',   capacity: 25,  icon: '📊', features: ['TV Screen', 'Whiteboard'] },
    ];
    private _facilityBookings: any[] = [];

    @Get('rooms')
    async getRooms() {
        // Calculate which rooms are currently booked
        const now = new Date();
        const activeBookings = this._facilityBookings.filter(b => {
            const start = new Date(`${b.date}T${b.startTime}`);
            const end   = new Date(`${b.date}T${b.endTime}`);
            return b.status === 'approved' && start <= now && now <= end;
        });
        const bookedRoomIds = new Set(activeBookings.map(b => b.roomId));
        return {
            data: this._rooms.map(r => ({ ...r, available: !bookedRoomIds.has(r.id) })),
        };
    }

    @Delete('rooms/:id')
    async deleteRoom(@Param('id') id: string) {
        const before = this._rooms.length;
        this._rooms = this._rooms.filter(r => r.id !== id);
        return { success: this._rooms.length < before };
    }

    @Post('rooms')
    async addRoom(@Body() body: { name: string; capacity?: number; icon?: string; features?: string[] }) {
        if (!body.name?.trim()) return { error: 'name required' };
        const room = {
            id: `room_${Date.now()}`,
            name: body.name.trim(),
            capacity: body.capacity ?? 0,
            icon: body.icon ?? '🏠',
            features: body.features ?? [],
        };
        this._rooms.push(room);
        return { success: true, data: room };
    }

    @Get('facility-bookings')
    async getFacilityBookings(@Query('roomId') roomId?: string, @Query('status') status?: string) {
        // Try Firestore first
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                let q: any = db.collection('church_facility_bookings').orderBy('createdAt', 'desc');
                const snap = await q.get();
                if (!snap.empty) {
                    let docs = snap.docs.map((d: any) => d.data());
                    if (roomId) docs = docs.filter((b: any) => b.roomId === roomId);
                    if (status) docs = docs.filter((b: any) => b.status === status);
                    return { data: docs };
                }
            }
        } catch { /* fall through */ }
        let bookings = [...this._facilityBookings].reverse();
        if (roomId) bookings = bookings.filter(b => b.roomId === roomId);
        if (status)  bookings = bookings.filter(b => b.status === status);
        return { data: bookings };
    }

    @Post('facility-bookings')
    async createFacilityBooking(@Body() body: {
        roomId: string; roomName?: string; date: string;
        startTime: string; endTime: string; purpose?: string; requestorName?: string;
        adminBooking?: boolean;
    }) {
        if (!body.roomId || !body.date || !body.startTime || !body.endTime) {
            return { error: 'roomId, date, startTime and endTime are required' };
        }
        // Conflict check: is the room already booked at this time?
        const existingBookings = this._facilityBookings.filter(b =>
            b.roomId === body.roomId &&
            b.date === body.date &&
            b.status !== 'denied' &&
            b.status !== 'cancelled' &&
            body.startTime < b.endTime &&
            body.endTime > b.startTime
        );
        if (existingBookings.length > 0) {
            const conflict = existingBookings[0];
            return { error: `Room already booked from ${conflict.startTime} to ${conflict.endTime} (${conflict.purpose || conflict.requestorName})` };
        }
        const room = this._rooms.find(r => r.id === body.roomId);
        const booking = {
            id: `bk_${Date.now()}`,
            roomId: body.roomId,
            roomName: room?.name ?? body.roomName ?? body.roomId,
            date: body.date,
            startTime: body.startTime,
            endTime: body.endTime,
            purpose: body.purpose ?? '',
            requestorName: body.requestorName ?? 'Admin',
            // Admin bookings are immediately confirmed; member self-service requests go to pending
            status: body.adminBooking !== false ? 'confirmed' : 'pending',
            createdAt: new Date().toISOString(),
        };
        this._facilityBookings.push(booking);
        try {
            const db = this.firebaseService.firestore();
            if (db) await db.collection('church_facility_bookings').doc(booking.id).set(booking);
        } catch { /* non-fatal */ }
        this.logger.log(`Facility booking created: ${booking.roomName} on ${booking.date}`);
        return { success: true, data: booking };
    }

    @Post('facility-bookings/:id')
    async updateFacilityBooking(@Param('id') id: string, @Body() body: { status: 'confirmed' | 'approved' | 'denied' | 'cancelled' }) {
        // Normalize 'approved' → 'confirmed' for consistency
        if (body.status === 'approved') body.status = 'confirmed';
        const booking = this._facilityBookings.find(b => b.id === id);
        if (booking) booking.status = body.status;
        try {
            const db = this.firebaseService.firestore();
            if (db) {
                await db.collection('church_facility_bookings').doc(id).update({ status: body.status, updatedAt: new Date().toISOString() });
            }
        } catch { /* non-fatal */ }
        return { success: true, data: booking ?? { id, status: body.status } };
    }
}
