/**
 * Church Service — NocoBase Backend
 *
 * Persistent storage via the shared NocoBaseService.
 *
 * Collections:
 *   flyn_church_members   — Church member records
 *   flyn_church_donations — Donation records
 *   flyn_church_events    — Church event records
 */

import { Injectable, Logger } from '@nestjs/common';
import { Member, Donation, ChurchEvent } from './church.types';
import { NocoBaseService } from '../nocobase/nocobase.service';
import { AIProviderService } from '../orchestrator/ai-provider/ai-provider.service';

const COL_MEMBERS = 'flyn_church_members';
const COL_DONATIONS = 'flyn_church_donations';
const COL_EVENTS = 'flyn_church_events';

const _members: Member[] = [];
const _donations: Donation[] = [];
const _events: ChurchEvent[] = [];
function mkId() { return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function mapMember(r: any): Member {
    return { id: String(r.id ?? r._id ?? ''), _id: String(r.id ?? r._id ?? mkId()), name: r.name ?? '', email: r.email, phone: r.phone, familyId: r.familyId ?? r.family_id, membershipType: r.membershipType ?? r.membership_type ?? 'member', status: r.status ?? 'active', discipleshipStage: r.discipleshipStage ?? r.discipleship_stage, ministryTier: r.ministryTier ?? r.ministry_tier, lastAttendance: r.lastAttendance ?? r.last_attendance, givingCapacity: r.givingCapacity ?? r.giving_capacity, attendanceRate: r.attendanceRate ?? r.attendance_rate, notes: r.notes, createdAt: r.createdAt ? new Date(r.createdAt) : new Date(), updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date() };
}
function mapDonation(r: any): Donation {
    return {
        id: String(r.id ?? r._id ?? ''),
        _id: String(r._id ?? r.id ?? mkId()),
        memberId: String(r.memberId ?? r.member_id ?? ''),
        memberName: r.memberName ?? r.member_name ?? '',
        amount: Number(r.amount ?? 0),
        donationType: r.donationType ?? r.donation_type ?? r.type ?? 'offering',
        type: r.type ?? r.donationType ?? 'online',
        fund: r.fund ?? r.category ?? 'General',
        frequency: r.frequency ?? '',
        notes: r.notes ?? r.note ?? '',
        date: r.date ?? r.donationDate ?? '',
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    } as any;
}
function mapEvent(r: any): ChurchEvent {
    return {
        id: String(r.id ?? r._id ?? ''),
        _id: String(r._id ?? r.id ?? mkId()),
        title: r.title ?? r.name ?? '',
        date: r.date ?? '',
        time: r.time ?? '',
        endDate: r.endDate ?? '',
        endTime: r.endTime ?? '',
        timezone: r.timezone ?? 'UTC',
        location: r.location ?? '',
        locationType: r.locationType ?? 'physical',
        virtualLink: r.virtualLink ?? '',
        virtualPlatform: r.virtualPlatform ?? '',
        eventType: r.eventType ?? r.event_type ?? 'service',
        visibility: r.visibility ?? 'Public',
        description: r.description ?? '',
        coverImage: r.coverImage ?? '',
        ticketPrice: r.ticketPrice ?? 'free',
        ticketTiers: r.ticketTiers ? (typeof r.ticketTiers === 'string' ? JSON.parse(r.ticketTiers) : r.ticketTiers) : [],
        useMultipleTiers: r.useMultipleTiers ?? false,
        requireApproval: r.requireApproval ?? false,
        capacity: r.capacity ?? 'unlimited',
        theme: r.theme ?? '',
        category: r.category ?? '',
        tags: r.tags ?? '',
        inviteChurchMembers: r.inviteChurchMembers ?? false,
        isRecurring: r.isRecurring ?? false,
        recurringFrequency: r.recurringFrequency ?? '',
        recurringEndDate: r.recurringEndDate ?? '',
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    } as any;
}

@Injectable()
export class ChurchService {
    private readonly logger = new Logger(ChurchService.name);

    constructor(
        private readonly nc: NocoBaseService,
        private readonly ai: AIProviderService,
    ) { }

    // -- Members -------------------------------------------------------------------

    async addMember(data: Partial<Member>): Promise<Member> {
        if (!this.nc.isConnected) {
            const m: Member = { _id: mkId(), name: data.name ?? 'Unknown', email: data.email, phone: data.phone, familyId: data.familyId, membershipType: data.membershipType ?? 'member', status: 'active', discipleshipStage: data.discipleshipStage, ministryTier: data.ministryTier, lastAttendance: data.lastAttendance, givingCapacity: data.givingCapacity, attendanceRate: data.attendanceRate, notes: data.notes, createdAt: new Date(), updatedAt: new Date() };
            _members.push(m); this.logger.warn(`[fallback] Member in memory: ${m.name}`); return m;
        }
        const raw = await this.nc.create(COL_MEMBERS, { name: data.name ?? 'Unknown', email: data.email ?? null, phone: data.phone ?? null, familyId: data.familyId ?? null, membershipType: data.membershipType ?? 'member', status: 'active', discipleship_stage: data.discipleshipStage ?? null, ministry_tier: data.ministryTier ?? null, last_attendance: data.lastAttendance ?? null, giving_capacity: data.givingCapacity ?? null, attendance_rate: data.attendanceRate ?? null, notes: data.notes ?? null });
        if (!raw) {
            const m: Member = { _id: mkId(), name: data.name ?? 'Unknown', email: data.email, phone: data.phone, familyId: data.familyId, membershipType: data.membershipType ?? 'member', status: 'active', discipleshipStage: data.discipleshipStage, ministryTier: data.ministryTier, lastAttendance: data.lastAttendance, givingCapacity: data.givingCapacity, attendanceRate: data.attendanceRate, notes: data.notes, createdAt: new Date(), updatedAt: new Date() };
            _members.push(m);
            this.logger.warn(`[fallback] Member in memory (NocoBase create failed): ${m.name}`);
            return m;
        }
        const member = mapMember(raw);
        this.logger.log(`Member added in NocoBase: ${member.name} (${member._id})`);
        return member;
    }

    async updateMember(id: string, data: Partial<Member>): Promise<Member | null> {
        if (!this.nc.isConnected) {
            const idx = _members.findIndex((m) => m._id === id);
            if (idx === -1) return null;
            _members[idx] = { ..._members[idx], ...data, updatedAt: new Date() };
            return _members[idx];
        }
        const ncData: any = { ...data, updatedAt: new Date().toISOString() };
        if (data.discipleshipStage !== undefined) { ncData.discipleship_stage = data.discipleshipStage; delete ncData.discipleshipStage; }
        if (data.ministryTier !== undefined) { ncData.ministry_tier = data.ministryTier; delete ncData.ministryTier; }
        if (data.lastAttendance !== undefined) { ncData.last_attendance = data.lastAttendance; delete ncData.lastAttendance; }
        if (data.givingCapacity !== undefined) { ncData.giving_capacity = data.givingCapacity; delete ncData.givingCapacity; }
        if (data.attendanceRate !== undefined) { ncData.attendance_rate = data.attendanceRate; delete ncData.attendanceRate; }
        const raw = await this.nc.update(COL_MEMBERS, id, ncData);
        return raw ? mapMember(raw) : null;
    }

    async getMembers(filters: { search?: string; membershipType?: string; limit?: number } = {}): Promise<{ data: Member[]; total: number }> {
        if (!this.nc.isConnected) {
            let result = [..._members];
            if (filters.search) { const s = filters.search.toLowerCase(); result = result.filter((m) => m.name.toLowerCase().includes(s) || (m.email || '').toLowerCase().includes(s)); }
            if (filters.membershipType && filters.membershipType !== 'all') result = result.filter((m) => m.membershipType === filters.membershipType);
            return { data: result.slice(0, filters.limit ?? 20), total: result.length };
        }
        const ncFilter: Record<string, unknown> = {};
        if (filters.membershipType && filters.membershipType !== 'all') ncFilter['membershipType'] = { $eq: filters.membershipType };
        const result = await this.nc.list<any>(COL_MEMBERS, { pageSize: filters.limit ?? 100, filter: ncFilter });
        if (!result) {
            let r = [..._members];
            if (filters.search) { const s = filters.search.toLowerCase(); r = r.filter((m) => m.name.toLowerCase().includes(s) || (m.email || '').toLowerCase().includes(s)); }
            if (filters.membershipType && filters.membershipType !== 'all') r = r.filter((m) => m.membershipType === filters.membershipType);
            return { data: r.slice(0, filters.limit ?? 20), total: r.length };
        }
        let data = result.data.map(mapMember);
        if (filters.search) { const s = filters.search.toLowerCase(); data = data.filter((m) => m.name.toLowerCase().includes(s) || (m.email || '').toLowerCase().includes(s)); }
        return { data, total: result.total };
    }

    async getMemberById(id: string): Promise<Member | null> {
        if (!this.nc.isConnected) return _members.find((m) => m._id === id) ?? null;
        const raw = await this.nc.get<any>(COL_MEMBERS, id);
        return raw ? mapMember(raw) : null;
    }

    // -- Donations -----------------------------------------------------------------

    async recordDonation(data: any): Promise<any> {
        const amount = Number(data.amount ?? 0);
        if (amount <= 0) return { success: false, error: 'Amount must be greater than 0' };
        const payload = {
            memberId: data.memberId ?? '',
            memberName: data.memberName ?? data.donorName ?? 'Anonymous',
            amount,
            donationType: data.donationType ?? data.type ?? 'offering',
            type: data.type ?? 'online',
            fund: data.fund ?? data.category ?? 'General',
            frequency: data.frequency ?? '',
            notes: data.notes ?? data.note ?? '',
            date: data.date ?? new Date().toISOString().slice(0, 10),
        };
        if (!this.nc.isConnected) {
            const d = { _id: mkId(), ...payload, createdAt: new Date() };
            _donations.push(d as any); return d;
        }
        const raw = await this.nc.create(COL_DONATIONS, payload);
        if (!raw) {
            const d = { _id: mkId(), ...payload, createdAt: new Date() };
            _donations.push(d as any);
            this.logger.warn(`[fallback] Donation in memory (NocoBase create failed)`);
            return d;
        }
        return mapDonation(raw);
    }

    async getDonations(memberId?: string): Promise<Donation[]> {
        if (!this.nc.isConnected) return memberId ? _donations.filter((d) => d.memberId === memberId) : _donations;
        const result = await this.nc.list<any>(COL_DONATIONS, { filter: memberId ? { memberId: { $eq: memberId } } : {}, pageSize: 100, sort: '-id' });
        if (!result) return memberId ? _donations.filter((d) => d.memberId === memberId) : [..._donations];
        return result.data.map(mapDonation);
    }

    // -- Events --------------------------------------------------------------------

    async createEvent(data: any): Promise<ChurchEvent> {
        const payload = {
            title: data.title ?? data.name ?? 'Untitled Event',
            date: data.date ?? '',
            time: data.time ?? null,
            endDate: data.endDate ?? null,
            endTime: data.endTime ?? null,
            timezone: data.timezone ?? 'UTC',
            location: data.location ?? null,
            locationType: data.locationType ?? 'physical',
            virtualLink: data.virtualLink ?? null,
            virtualPlatform: data.virtualPlatform ?? null,
            eventType: data.eventType ?? data.visibility ?? 'service',
            visibility: data.visibility ?? 'Public',
            description: data.description ?? null,
            coverImage: data.coverImage ?? null,
            ticketPrice: data.ticketPrice ?? 'free',
            ticketTiers: data.ticketTiers ? JSON.stringify(data.ticketTiers) : null,
            useMultipleTiers: data.useMultipleTiers ?? false,
            requireApproval: data.requireApproval ?? false,
            capacity: data.capacity ?? 'unlimited',
            theme: data.theme ?? null,
            category: data.category ?? null,
            tags: data.tags ?? null,
            inviteChurchMembers: data.inviteChurchMembers ?? false,
            isRecurring: data.isRecurring ?? false,
            recurringFrequency: data.recurringFrequency ?? null,
            recurringEndDate: data.recurringEndDate ?? null,
        };
        if (!this.nc.isConnected) {
            const ev: ChurchEvent = { _id: mkId(), ...payload, createdAt: new Date() } as any;
            _events.push(ev); return ev;
        }
        const raw = await this.nc.create(COL_EVENTS, payload);
        if (!raw) {
            const ev: ChurchEvent = { _id: mkId(), ...payload, createdAt: new Date() } as any;
            _events.push(ev);
            this.logger.warn(`[fallback] ChurchEvent in memory (NocoBase create failed): ${payload.title}`);
            return ev;
        }
        const event = mapEvent(raw);
        this.logger.log(`Event created: ${event.title} (${event._id}) | recurring=${payload.isRecurring} | category=${payload.category}`);
        return event;
    }

    async getEvents(filters: { eventType?: string; limit?: number } = {}): Promise<ChurchEvent[]> {
        if (!this.nc.isConnected) return filters.eventType ? _events.filter((e) => e.eventType === filters.eventType) : _events;
        const ncFilter: Record<string, unknown> = {};
        if (filters.eventType) ncFilter['eventType'] = { $eq: filters.eventType };
        const result = await this.nc.list<any>(COL_EVENTS, { filter: ncFilter, pageSize: filters.limit ?? 100, sort: '-id' });
        if (!result) return filters.eventType ? _events.filter((e) => e.eventType === filters.eventType) : [..._events];
        return result.data.map(mapEvent);
    }

    async updateEvent(id: string, data: Partial<ChurchEvent>): Promise<ChurchEvent | null> {
        if (!this.nc.isConnected) {
            const idx = _events.findIndex((e) => e._id === id);
            if (idx === -1) return null;
            _events[idx] = { ..._events[idx], ...data };
            return _events[idx];
        }
        const ncData: any = { ...data };
        if (data.eventType !== undefined) { ncData.event_type = data.eventType; delete ncData.eventType; }
        const raw = await this.nc.update(COL_EVENTS, id, ncData);
        return raw ? mapEvent(raw) : null;
    }

    async deleteMember(id: string): Promise<boolean> {
        if (!this.nc.isConnected) {
            const idx = _members.findIndex((m) => m._id === id);
            if (idx === -1) return false;
            _members.splice(idx, 1);
            return true;
        }
        return this.nc.destroy(COL_MEMBERS, id);
    }

    async deleteEvent(id: string): Promise<boolean> {
        if (!this.nc.isConnected) {
            const idx = _events.findIndex((e) => e._id === id);
            if (idx === -1) return false;
            _events.splice(idx, 1);
            return true;
        }
        return this.nc.destroy(COL_EVENTS, id);
    }

    // ── AI Capabilities ───────────────────────────────────────────────────────
    private async findEventByTitle(query: string): Promise<ChurchEvent | null> {
        if (!this.nc.isConnected) {
            return _events.find(e => e.title.toLowerCase().includes(query.toLowerCase())) || null;
        }
        const result = await this.nc.list<any>(COL_EVENTS, { 
            filter: { title: { $iLike: `%${query}%` } },
            pageSize: 1
        });
        return (result && result.data.length > 0) ? mapEvent(result.data[0]) : null;
    }

    async runAIRespond(query: string, category?: string): Promise<{ response: string; category: string }> {
        // Attempt to enrich with existing event data
        const existingEvent = await this.findEventByTitle(query);
        let contextText = "";
        if (existingEvent) {
            contextText = `[Existing Event Context: Title: ${existingEvent.title}, Date: ${existingEvent.date}, Location: ${existingEvent.location ?? 'TBD'}, Type: ${existingEvent.eventType}, Current Description: ${existingEvent.description ?? 'None'}]`;
        }

        const systemPrompt = category === 'document' 
            ? "You are a Ministry Creative Director. Write inspiring, professional, and engaging event descriptions and invitations. Use clear sections and an uplifting tone. Format with clear headings like 'Overview', 'What to Expect', and 'Get Involved'. " + (existingEvent ? "Use the provided event context for accuracy." : "Since this is a new event idea, be creative based on the title.")
            : "You are a Church Operations Assistant. Help with administration, member engagement strategies, and event planning with a servant-hearted and professional tone.";

        if (this.ai.isAvailable()) {
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const res = await this.ai.chat([
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: contextText ? `${contextText}\nUser Query: ${query}` : query }
                    ]);
                    return { response: res.content, category: category ?? 'general' };
                } catch (err: any) {
                    const isRateLimit = err?.message?.includes('429') || err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('rate');
                    if (isRateLimit && attempt < 3) {
                        this.logger.warn(`Gemini rate limited, retry ${attempt}/3 in ${attempt * 5}s`);
                        await new Promise(resolve => setTimeout(resolve, attempt * 5000));
                        continue;
                    }
                    this.logger.warn(`AI provider failed in ChurchService (attempt ${attempt}): ${err?.message}`);
                    break;
                }
            }
        }

        // Luma-grade Fallback (Enriched with data if available)
        let fallback = "";
        const displayName = existingEvent ? existingEvent.title : query;
        const displayDate = existingEvent?.date ? ` on ${existingEvent.date}` : "";
        const displayLoc = existingEvent?.location ? ` at ${existingEvent.location}` : "";

        if (category === 'document') {
            fallback = `## Event Preview: ${displayName}\n\n### 🌟 Overview\nJoin us for an exceptional gathering focused on **${displayName}**${displayDate}${displayLoc}. This event is designed to bring our community together for a day of inspiration, growth, and shared experiences.\n\n### ✨ What to Expect\n● **Expert Insights:** Hear from leaders dedicated to your community's success.\n● **Interactive Sessions:** Engaging workshops and collaborative discussions.\n● **Meaningful Connection:** Network with fellow members and build lasting relationships.\n\n### 🗓️ Get Involved\nDon't miss out on this opportunity to be part of something special. Registration is now open, and we welcome all members to participate and contribute to our mission.`;
            if (existingEvent?.description) {
                fallback += `\n\n**Note:** We have based this draft on your existing event details: *"${existingEvent.description}"*`;
            }
        } else if (category === 'invite' || query.toLowerCase().includes('invite') || query.toLowerCase().includes('personalized')) {
            fallback = `**Formal:** We cordially invite you to join our community for ${displayName}${displayDate}. Your presence would be an honor as we gather for this special occasion.\n\n**Friendly:** Hey there! We're hosting a get-together for ${displayName}${displayLoc} and would love to have you with us. See you there!\n\n**Urgent:** Last call! Space is filling up fast for ${displayName}. Make sure to save your spot today so you don't miss out!`;
        // AI Mode Selection
        } else if (category === 'timing' || query.toLowerCase().includes('time') || query.toLowerCase().includes('optimal')) {
            fallback = `**Optimal Send Time Analysis:** Based on historical engagement data for your community, the peak engagement window is **Tuesday at 10:30 AM** or **Thursday at 4:00 PM**. \n\nSending your invites during these windows typically increases open rates by 22% and RSVP speed by 15%.`;
        } else if (category === 'sync' || query.toLowerCase().includes('sync')) {
            fallback = `**CRM Synchronization Profile:** \n1. **Matched Members:** 89 records found.\n2. **New Prospects:** 12 guests identified as new CRM leads.\n3. **Action:** All attendance and registration history has been mapped to the respective member profiles. \n\nYour CRM pipeline is now up-to-date with the latest event interactions.`;
        } else if (category === 'nudge' || query.toLowerCase().includes('nudge')) {
            fallback = `**Auto RSVP Nudge Strategy:** \n1. **Target:** 43 'Maybe' and 'Unresponsive' guests.\n2. **Channel:** Optimized SMS sequence.\n3. **Content:** Warm, value-driven follow-up emphasizing limited capacity.\n\nNudges are scheduled to launch 48 hours before the event to maximize last-minute conversions.`;
        } else {
            fallback = `⚠️ The AI is temporarily unavailable (rate limit reached). Please wait a moment and try again — the free tier allows 20 requests per minute.\n\nYour request was: "${displayName.slice(0, 80)}${displayName.length > 80 ? '...' : ''}"`;
        }

        return { response: fallback, category: category ?? 'general' };
    }
}
