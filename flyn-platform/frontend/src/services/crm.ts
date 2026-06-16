/**
 * CRM Frontend Service
 *
 * Wraps the /crm/* endpoints exposed by the backend API.
 */

import { authedFetch } from './authApi';
import { API_BASE_URL } from '@/lib/api';
import { isDemoModeEnabled } from '@/lib/demo-mode';

const API_BASE = API_BASE_URL;
console.log('[CRM Service] Using API_BASE:', API_BASE);

const DEMO_TENANT_ID = 'demo-org';

const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
const demoId = (prefix: string, suffix: string) => `${prefix}_${suffix}`;

const DEMO_CONTACTS: Contact[] = [
    {
        _id: demoId(DEMO_TENANT_ID, 'c1'),
        id: 1001,
        name: 'Aarav Mehta',
        email: 'aarav.mehta@example.in',
        phone: '+919876543210',
        company: 'Mehta Study Abroad',
        status: 'qualified',
        tags: ['hot-lead', 'india', 'whatsapp'],
        source: 'Website',
        owner: 'Priya Sharma',
        score: 84,
        notes: 'Interested in business analytics and wants a fast scholarship decision.',
        createdAt: daysAgo(12),
        updatedAt: daysAgo(1),
    },
    {
        _id: demoId(DEMO_TENANT_ID, 'c2'),
        id: 1002,
        name: 'Ananya Nair',
        email: 'ananya.nair@example.in',
        phone: '+919821112233',
        company: 'Nair Family',
        status: 'lead',
        tags: ['follow-up', 'india'],
        source: 'WhatsApp Referral',
        owner: 'Rohan Verma',
        score: 62,
        notes: 'Parent asked for tuition, visa, and hostel details in one call.',
        createdAt: daysAgo(10),
        updatedAt: daysAgo(2),
    },
    {
        _id: demoId(DEMO_TENANT_ID, 'c3'),
        id: 1003,
        name: 'Kabir Singh',
        email: 'kabir.singh@example.in',
        phone: '+919700123456',
        company: 'Singh Academy',
        status: 'customer',
        tags: ['enrolled', 'referral'],
        source: 'Alumni Referral',
        owner: 'Sana Khan',
        score: 92,
        notes: 'Paid registration fee; waiting on offer letter for next intake.',
        createdAt: daysAgo(21),
        updatedAt: daysAgo(3),
    },
    {
        _id: demoId(DEMO_TENANT_ID, 'c4'),
        id: 1004,
        name: 'Ishita Rao',
        email: 'ishita.rao@example.in',
        phone: '+919845612345',
        company: 'Rao Education',
        status: 'qualified',
        tags: ['scholarship', 'priority'],
        source: 'Facebook Ads',
        owner: 'Aman Gupta',
        score: 77,
        notes: 'Scholarship-focused lead; family comparing India vs UAE options.',
        createdAt: daysAgo(8),
        updatedAt: daysAgo(1),
    },
    {
        _id: demoId(DEMO_TENANT_ID, 'c5'),
        id: 1005,
        name: 'Dev Patel',
        email: 'dev.patel@example.in',
        phone: '+919900223344',
        company: 'Patel Commerce',
        status: 'inactive',
        tags: ['re-engage'],
        source: 'Website',
        owner: 'Priya Sharma',
        score: 31,
        notes: 'Went quiet after document checklist was shared.',
        createdAt: daysAgo(17),
        updatedAt: daysAgo(5),
    },
    {
        _id: demoId(DEMO_TENANT_ID, 'c6'),
        id: 1006,
        name: 'Sneha Kulkarni',
        email: 'sneha.kulkarni@example.in',
        phone: '+918888334455',
        company: 'Kulkarni Classes',
        status: 'lead',
        tags: ['call-back'],
        source: 'Instagram',
        owner: 'Rohan Verma',
        score: 48,
        notes: 'Shortlisted for a demo on employability pathway and internship support.',
        createdAt: daysAgo(6),
        updatedAt: daysAgo(1),
    },
    {
        _id: demoId(DEMO_TENANT_ID, 'c7'),
        id: 1007,
        name: 'Mohit Bansal',
        email: 'mohit.bansal@example.in',
        phone: '+919711009911',
        company: 'Bansal Families',
        status: 'customer',
        tags: ['visa', 'payments'],
        source: 'Call Inbound',
        owner: 'Sana Khan',
        score: 89,
        notes: 'Strong parent engagement; visa file nearly complete.',
        createdAt: daysAgo(25),
        updatedAt: daysAgo(1),
    },
    {
        _id: demoId(DEMO_TENANT_ID, 'c8'),
        id: 1008,
        name: 'Pooja Iyer',
        email: 'pooja.iyer@example.in',
        phone: '+919677445566',
        company: 'Iyer Foundation',
        status: 'lead',
        tags: ['webinar', 'mba'],
        source: 'Webinar',
        owner: 'Aman Gupta',
        score: 55,
        notes: 'Asked for hostel, living cost, and part-time work guidance.',
        createdAt: daysAgo(4),
        updatedAt: daysAgo(1),
    },
];

const DEMO_DEALS: Deal[] = [
    { _id: demoId(DEMO_TENANT_ID, 'd1'), id: 2001, title: 'MBA Admission - Aarav Mehta', value: 125000, stage: 'negotiation', contactId: String(1001), contactName: 'Aarav Mehta', probability: 78, expectedCloseDate: daysAgo(-14), owner: 'Priya Sharma', notes: 'Scholarship and cohort fit are the main blockers.', createdAt: daysAgo(12), updatedAt: daysAgo(1) },
    { _id: demoId(DEMO_TENANT_ID, 'd2'), id: 2002, title: 'BBA Admission - Ananya Nair', value: 88000, stage: 'qualified', contactId: String(1002), contactName: 'Ananya Nair', probability: 56, expectedCloseDate: daysAgo(-21), owner: 'Rohan Verma', notes: 'Awaiting parent approval and fee split confirmation.', createdAt: daysAgo(10), updatedAt: daysAgo(2) },
    { _id: demoId(DEMO_TENANT_ID, 'd3'), id: 2003, title: 'MS Admission - Kabir Singh', value: 160000, stage: 'won', contactId: String(1003), contactName: 'Kabir Singh', probability: 100, expectedCloseDate: daysAgo(-7), owner: 'Sana Khan', wonReason: 'Strong referral trust and quick document turnaround.', notes: 'Registration fee paid; onboarding in progress.', createdAt: daysAgo(21), updatedAt: daysAgo(3) },
    { _id: demoId(DEMO_TENANT_ID, 'd4'), id: 2004, title: 'Scholarship Lead - Ishita Rao', value: 140000, stage: 'proposal', contactId: String(1004), contactName: 'Ishita Rao', probability: 69, expectedCloseDate: daysAgo(-10), owner: 'Aman Gupta', notes: 'Proposal sent with two scholarship scenarios.', createdAt: daysAgo(8), updatedAt: daysAgo(1) },
    { _id: demoId(DEMO_TENANT_ID, 'd5'), id: 2005, title: 'Reactivation - Dev Patel', value: 72000, stage: 'new', contactId: String(1005), contactName: 'Dev Patel', probability: 25, expectedCloseDate: daysAgo(-28), owner: 'Priya Sharma', notes: 'Needs follow-up after a silent period.', createdAt: daysAgo(17), updatedAt: daysAgo(5) },
    { _id: demoId(DEMO_TENANT_ID, 'd6'), id: 2006, title: 'Webinar Lead - Pooja Iyer', value: 99000, stage: 'qualified', contactId: String(1008), contactName: 'Pooja Iyer', probability: 61, expectedCloseDate: daysAgo(-18), owner: 'Aman Gupta', notes: 'High intent after webinar on placements and visas.', createdAt: daysAgo(4), updatedAt: daysAgo(1) },
];

const DEMO_ACTIVITIES: Activity[] = [
    { _id: demoId(DEMO_TENANT_ID, 'a1'), id: 3001, type: 'call', contactId: String(1001), dealId: String(2001), description: 'Discussed MBA intake dates, scholarship paperwork, and fee milestones.', actor: 'Priya Sharma', createdAt: daysAgo(1) },
    { _id: demoId(DEMO_TENANT_ID, 'a2'), id: 3002, type: 'email', contactId: String(1002), dealId: String(2002), description: 'Sent brochure and list of required documents to the family email.', actor: 'Rohan Verma', createdAt: daysAgo(2) },
    { _id: demoId(DEMO_TENANT_ID, 'a3'), id: 3003, type: 'meeting', contactId: String(1003), dealId: String(2003), description: 'Closed registration after a virtual parent call from Mumbai.', actor: 'Sana Khan', createdAt: daysAgo(3) },
    { _id: demoId(DEMO_TENANT_ID, 'a4'), id: 3004, type: 'note', contactId: String(1004), dealId: String(2004), description: 'Family comparing Indian universities on ROI and work permits.', actor: 'Aman Gupta', createdAt: daysAgo(1) },
    { _id: demoId(DEMO_TENANT_ID, 'a5'), id: 3005, type: 'task', contactId: String(1005), dealId: String(2005), description: 'Re-engage with updated scholarship options and fee split plan.', actor: 'Priya Sharma', createdAt: daysAgo(2) },
    { _id: demoId(DEMO_TENANT_ID, 'a6'), id: 3006, type: 'call', contactId: String(1006), description: 'Booked a product demo for employability and internship support.', actor: 'Rohan Verma', createdAt: daysAgo(1) },
    { _id: demoId(DEMO_TENANT_ID, 'a7'), id: 3007, type: 'deal_update', contactId: String(1007), dealId: String(2003), description: 'Deal marked won after registration fee confirmation.', actor: 'System', createdAt: daysAgo(3) },
    { _id: demoId(DEMO_TENANT_ID, 'a8'), id: 3008, type: 'relationship', contactId: String(1008), description: 'Student came via a webinar referral from Pune community.', actor: 'Aman Gupta', createdAt: daysAgo(1) },
];

let demoContacts = [...DEMO_CONTACTS];
let demoDeals = [...DEMO_DEALS];
let demoActivities = [...DEMO_ACTIVITIES];

const isDemoCrm = () => isDemoModeEnabled();

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const sortByRecent = <T extends { updatedAt?: string; createdAt?: string }>(items: T[]) =>
    [...items].sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime());

const demoFindContact = (id: string) => demoContacts.find(c => String(c._id || c.id) === id);
const demoFindDeal = (id: string) => demoDeals.find(d => String(d._id || d.id) === id);
const demoStats = (): CRMDashboardStats => {
    const totalContacts = demoContacts.length;
    const totalLeads = demoContacts.filter(c => c.status === 'lead' || c.status === 'qualified').length;
    const qualifiedLeads = demoContacts.filter(c => c.status === 'qualified').length;
    const wonDeals = demoDeals.filter(d => d.stage === 'won');
    const wonValue = wonDeals.reduce((sum, deal) => sum + (deal.value || 0), 0);
    const recentActivities = sortByRecent(demoActivities).slice(0, 10);
    const pipelineBreakdown = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].map((stage) => {
        const stageDeals = demoDeals.filter(d => d.stage === stage);
        return {
            stage,
            count: stageDeals.length,
            value: stageDeals.reduce((sum, deal) => sum + (deal.value || 0), 0),
        };
    });
    const leadSourcesMap = new Map<string, number>();
    demoContacts.forEach((contact) => {
        const source = contact.source || 'Unknown';
        leadSourcesMap.set(source, (leadSourcesMap.get(source) || 0) + 1);
    });
    return {
        totalContacts,
        totalLeads,
        qualifiedLeads,
        totalDeals: demoDeals.length,
        dealsWonValue: wonValue,
        dealsWonCount: wonDeals.length,
        conversionRate: totalContacts > 0 ? Math.round((wonDeals.length / totalContacts) * 100) : 0,
        recentActivities,
        pipelineBreakdown,
        leadSources: Array.from(leadSourcesMap.entries()).map(([source, count]) => ({ source, count })),
    };
};

const demoPaginate = <T,>(items: T[], page = 1, limit = 10): PaginatedResult<T> => {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const start = (safePage - 1) * safeLimit;
    return {
        data: items.slice(start, start + safeLimit),
        total,
        page: safePage,
        limit: safeLimit,
        totalPages,
    };
};

export interface Contact {
    _id?: string;
    id?: number;
    name: string;
    email: string;
    phone?: string;
    company?: string;
    status: 'lead' | 'qualified' | 'customer' | 'churned' | 'inactive';
    tags?: string[];
    source?: string;
    owner?: string;
    score?: number;
    notes?: string;
    signature?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Deal {
    _id?: string;
    id?: number;
    title: string;
    value: number;
    stage: 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
    contactId: string;
    contactName?: string;
    probability?: number;
    expectedCloseDate?: string;
    owner?: string;
    notes?: string;
    lostReason?: string;
    wonReason?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Activity {
    _id?: string;
    id?: number;
    type: 'email' | 'call' | 'meeting' | 'note' | 'task' | 'deal_update';
    contactId?: string;
    dealId?: string;
    description: string;
    actor: string;
    createdAt: string;
}

export interface CRMDashboardStats {
    totalContacts: number;
    totalLeads: number;
    qualifiedLeads: number;
    totalDeals: number;
    dealsWonValue: number;
    dealsWonCount: number;
    conversionRate: number;
    recentActivities: Activity[];
    pipelineBreakdown: { stage: string; count: number; value: number }[];
    leadSources: { source: string; count: number }[];
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await authedFetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!res.ok) {
        let errorDetails = '';
        try {
            const body = await res.json();
            errorDetails = ` | Details: ${JSON.stringify(body)}`;
        } catch (e) {
            errorDetails = ` | Could not parse error body`;
        }
        throw new Error(`CRM API error: ${res.status} ${res.statusText}${errorDetails}`);
    }

    return res.json();
}

// ============================================================================
// CONTACTS
// ============================================================================

export async function getContacts(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
}): Promise<PaginatedResult<Contact>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);

    const qs = query.toString();
    if (isDemoCrm()) {
        const filtered = sortByRecent(demoContacts.filter((contact) => {
            const matchesSearch = !params?.search || [
                contact.name,
                contact.email,
                contact.phone,
                contact.company,
                contact.source,
                contact.owner,
                (contact.tags ?? []).join(' '),
            ].join(' ').toLowerCase().includes(params.search.toLowerCase());
            const matchesStatus = !params?.status || contact.status === params.status;
            return matchesSearch && matchesStatus;
        }));
        return Promise.resolve(demoPaginate(filtered, params?.page ?? 1, params?.limit ?? 10));
    }
    return request(`/crm/contacts${qs ? `?${qs}` : ''}`);
}

export async function getContact(id: string): Promise<Contact> {
    if (isDemoCrm()) {
        const contact = demoFindContact(id);
        if (!contact) throw new Error('Contact not found');
        return clone(contact);
    }
    return request(`/crm/contacts/${id}`);
}

export async function createContact(data: Partial<Contact>): Promise<Contact> {
    if (isDemoCrm()) {
        const nowIso = new Date().toISOString();
        const contact: Contact = {
            _id: demoId(DEMO_TENANT_ID, `c${Date.now()}`),
            id: Math.floor(1000 + Math.random() * 9000),
            name: data.name || 'New Contact',
            email: data.email || '',
            phone: data.phone,
            company: data.company,
            status: data.status || 'lead',
            tags: data.tags ?? [],
            source: data.source || 'Manual',
            owner: data.owner || 'Demo Admin',
            score: data.score ?? 0,
            notes: data.notes,
            signature: data.signature,
            createdAt: nowIso,
            updatedAt: nowIso,
        };
        demoContacts = [contact, ...demoContacts];
        demoActivities = [
            {
                _id: demoId(DEMO_TENANT_ID, `a${Date.now()}`),
                id: Math.floor(10000 + Math.random() * 90000),
                type: 'note',
                contactId: String(contact.id),
                description: `Contact created: ${contact.name}`,
                actor: 'Demo Admin',
                createdAt: nowIso,
            },
            ...demoActivities,
        ];
        return clone(contact);
    }
    return request('/crm/contacts', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateContact(id: string, data: Partial<Contact>): Promise<Contact> {
    if (isDemoCrm()) {
        const idx = demoContacts.findIndex((contact) => String(contact._id || contact.id) === id);
        if (idx === -1) throw new Error('Contact not found');
        const updated: Contact = {
            ...demoContacts[idx],
            ...data,
            updatedAt: new Date().toISOString(),
        };
        demoContacts[idx] = updated;
        return clone(updated);
    }
    return request(`/crm/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deleteContact(id: string): Promise<{ success: boolean }> {
    if (isDemoCrm()) {
        demoContacts = demoContacts.filter((contact) => String(contact._id || contact.id) !== id);
        demoDeals = demoDeals.filter((deal) => String(deal.contactId) !== id);
        demoActivities = demoActivities.filter((activity) => String(activity.contactId) !== id);
        return { success: true };
    }
    return request(`/crm/contacts/${id}`, { method: 'DELETE' });
}

// ============================================================================
// DEALS
// ============================================================================

export async function getDeals(stage?: string): Promise<Deal[]> {
    if (isDemoCrm()) {
        const deals = stage ? demoDeals.filter((deal) => deal.stage === stage) : demoDeals;
        return clone(sortByRecent(deals));
    }
    const qs = stage ? `?stage=${stage}` : '';
    return request(`/crm/deals${qs}`);
}

export async function createDeal(data: Partial<Deal>): Promise<Deal> {
    if (isDemoCrm()) {
        const nowIso = new Date().toISOString();
        const deal: Deal = {
            _id: demoId(DEMO_TENANT_ID, `d${Date.now()}`),
            id: Math.floor(2000 + Math.random() * 9000),
            title: data.title || 'New Deal',
            value: data.value ?? 0,
            stage: data.stage || 'new',
            contactId: data.contactId || '',
            contactName: data.contactName,
            probability: data.probability,
            expectedCloseDate: data.expectedCloseDate,
            owner: data.owner || 'Demo Admin',
            notes: data.notes,
            lostReason: data.lostReason,
            wonReason: data.wonReason,
            createdAt: nowIso,
            updatedAt: nowIso,
        };
        demoDeals = [deal, ...demoDeals];
        return clone(deal);
    }
    return request('/crm/deals', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateDeal(id: string, data: Partial<Deal>): Promise<Deal> {
    if (isDemoCrm()) {
        const idx = demoDeals.findIndex((deal) => String(deal._id || deal.id) === id);
        if (idx === -1) throw new Error('Deal not found');
        const updated: Deal = {
            ...demoDeals[idx],
            ...data,
            updatedAt: new Date().toISOString(),
        };
        demoDeals[idx] = updated;
        return clone(updated);
    }
    return request(`/crm/deals/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deleteDeal(id: string): Promise<{ success: boolean }> {
    if (isDemoCrm()) {
        demoDeals = demoDeals.filter((deal) => String(deal._id || deal.id) !== id);
        demoActivities = demoActivities.filter((activity) => String(activity.dealId) !== id);
        return { success: true };
    }
    return request(`/crm/deals/${id}`, { method: 'DELETE' });
}

export async function importContacts(contacts: Partial<Contact>[]): Promise<{ imported: number; failed: number }> {
    if (isDemoCrm()) {
        let imported = 0;
        let failed = 0;
        for (const contact of contacts) {
            if (!contact.email) {
                failed++;
                continue;
            }
            demoContacts.unshift({
                _id: demoId(DEMO_TENANT_ID, `c${Date.now()}_${imported}`),
                id: Math.floor(3000 + Math.random() * 9000),
                name: contact.name || 'Imported Contact',
                email: contact.email,
                phone: contact.phone,
                company: contact.company,
                status: (contact.status as Contact['status']) || 'lead',
                tags: contact.tags ?? [],
                source: contact.source || 'CSV Import',
                owner: contact.owner || 'Demo Admin',
                score: contact.score ?? 0,
                notes: contact.notes,
                signature: contact.signature,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            imported++;
        }
        return { imported, failed };
    }
    return request('/crm/contacts/import', {
        method: 'POST',
        body: JSON.stringify({ contacts }),
    });
}

// ============================================================================
// ACTIVITIES
// ============================================================================

export async function getActivities(contactId?: string, dealId?: string): Promise<Activity[]> {
    if (isDemoCrm()) {
        const activities = demoActivities.filter((activity) =>
            (!contactId || String(activity.contactId) === contactId) &&
            (!dealId || String(activity.dealId) === dealId),
        );
        return clone(sortByRecent(activities));
    }
    const query = new URLSearchParams();
    if (contactId) query.set('contactId', contactId);
    if (dealId) query.set('dealId', dealId);
    const qs = query.toString();
    return request(`/crm/activities${qs ? `?${qs}` : ''}`);
}

export async function createActivity(data: Partial<Activity>): Promise<Activity> {
    if (isDemoCrm()) {
        const activity: Activity = {
            _id: demoId(DEMO_TENANT_ID, `a${Date.now()}`),
            id: Math.floor(4000 + Math.random() * 9000),
            type: data.type || 'note',
            contactId: data.contactId,
            dealId: data.dealId,
            description: data.description || 'Demo activity',
            actor: data.actor || 'Demo Admin',
            createdAt: new Date().toISOString(),
        };
        demoActivities = [activity, ...demoActivities];
        return clone(activity);
    }
    return request('/crm/activities', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

// ============================================================================
// DASHBOARD
// ============================================================================

export async function getDashboardStats(): Promise<CRMDashboardStats> {
    if (isDemoCrm()) {
        return clone(demoStats());
    }
    return request('/crm/dashboard');
}

// ============================================================================
// ADVANCED CRM (AI & FORECASTING)
// ============================================================================

export async function getLeadScore(id: string): Promise<any> {
    if (isDemoCrm()) {
        const contact = demoFindContact(id);
        if (!contact) return { error: 'Contact not found' };
        const activityCount = demoActivities.filter((activity) => String(activity.contactId) === id).length;
        const baseScore = contact.score ?? 0;
        const totalScore = Math.min(baseScore + Math.min(activityCount * 5, 30) + (contact.company ? 10 : 0), 100);
        return {
            contactId: id,
            score: totalScore,
            summary: `${contact.name} is a ${totalScore >= 70 ? 'High' : totalScore >= 40 ? 'Medium' : 'Low'} priority lead.`,
            factors: [
                { factor: 'Base Score', contribution: baseScore },
                { factor: 'Activity Bonus', contribution: Math.min(activityCount * 5, 30) },
                { factor: 'Company Info Bonus', contribution: contact.company ? 10 : 0 },
            ],
            churnRisk: totalScore < 30 ? 0.35 : 0.1,
            nextBestAction: totalScore < 30 ? 'Send introductory email' : 'Schedule follow-up call',
        };
    }
    return request(`/crm/contacts/${id}/score`);
}

export async function getRevenueForecast(): Promise<any> {
    if (isDemoCrm()) {
        return {
            forecast: demoDeals.reduce((sum, deal) => sum + (deal.stage === 'won' ? 0 : deal.value * (deal.probability ?? 50) / 100), 0),
            currency: 'USD',
            currencySymbol: '$',
        };
    }
    return request('/crm/forecasting');
}

export async function routeLeads(data: any): Promise<any> {
    if (isDemoCrm()) return { success: true, routed: 1, data };
    return request('/crm/leads/route', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function mergeProfiles(primaryId: string, secondaryId: string): Promise<any> {
    if (isDemoCrm()) return { success: true, primaryId, secondaryId };
    return request(`/crm/contacts/${primaryId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ mergeContactIds: [secondaryId] }),
    });
}

export async function getMergeSuggestions(contactId: string): Promise<any> {
    if (isDemoCrm()) {
        const contact = demoFindContact(contactId);
        if (!contact) return { matches: [] };
        return {
            matches: demoContacts
                .filter((c) => String(c._id || c.id) !== contactId && c.email.split('@')[1] === contact.email.split('@')[1])
                .slice(0, 3)
                .map((c) => ({ contactId: String(c._id || c.id), name: c.name, reason: 'Similar domain / Indian lead profile' })),
        };
    }
    return request(`/crm/contacts/${contactId}/merge-suggestions`);
}

export async function autoStageDeals(): Promise<any> {
    if (isDemoCrm()) return { success: true, movedCount: 0, updates: [] };
    return request('/crm/deals/auto-stage', { method: 'POST' });
}

export async function runOmnichannelCampaign(data: any): Promise<any> {
    if (isDemoCrm()) return { success: true, queued: 1, data };
    const contactId = data.contactId || 'default';
    return request(`/crm/contacts/${contactId}/omnichannel/send`, {
        method: 'POST',
        body: JSON.stringify({ message: data.message, priority: data.priority }),
    });
}

export async function getContactEngagement(id: string): Promise<any> {
    if (isDemoCrm()) {
        return { engagementScore: 78, recentActivityCount: demoActivities.filter((activity) => String(activity.contactId) === id).length };
    }
    return request(`/crm/contacts/${id}/engagement`);
}

export async function getOmnichannelConfig(id: string): Promise<any> {
    if (isDemoCrm()) return { enabled: true, channels: ['whatsapp', 'email', 'calls'] };
    return request(`/crm/contacts/${id}/omnichannel`);
}

export async function getSkillBasedRouting(type?: string): Promise<any> {
    if (isDemoCrm()) return { type: type || 'default', routes: [] };
    const qs = type ? `?type=${type}` : '';
    return request(`/crm/routing/skill-based${qs}`);
}

export async function aiAutoUpdate(id: string): Promise<any> {
    if (isDemoCrm()) return { success: true, contactId: id };
    return request(`/crm/contacts/${id}/ai-update`, { method: 'POST' });
}

export async function getSLAStatus(id: string): Promise<any> {
    if (isDemoCrm()) return { status: 'green', contactId: id };
    return request(`/crm/contacts/${id}/sla-status`);
}

export async function getAIMemory(id: string): Promise<any> {
    if (isDemoCrm()) return { entries: [] };
    return request(`/crm/contacts/${id}/ai-memory`);
}

export async function getKnowledgeGraph(id: string): Promise<any> {
    if (isDemoCrm()) {
        const contact = demoFindContact(id);
        return {
            nodes: contact ? [{ id, label: contact.name, type: 'contact' }] : [],
            edges: [],
        };
    }
    return request(`/crm/contacts/${id}/knowledge-graph`);
}

export async function getLifetimeValue(id: string): Promise<any> {
    if (isDemoCrm()) {
        const contact = demoFindContact(id);
        if (!contact) return { value: 0 };
        const relatedDeals = demoDeals.filter((deal) => String(deal.contactId) === id);
        const value = relatedDeals.reduce((sum, deal) => sum + deal.value, 0) || (contact.score ?? 0) * 1000;
        return { value, currency: 'USD', currencySymbol: '$' };
    }
    return request(`/crm/contacts/${id}/lifetime-value`);
}

/**
 * Tracks a behavioral interaction (page view, click, etc.)
 */
export async function trackInteraction(data: { contactId?: string; type: string; target: string; metadata?: any }): Promise<any> {
    if (isDemoCrm()) return { success: true };
    return request('/crm/track', {
        method: 'POST',
        body: JSON.stringify(data),
    }).catch(err => {
        console.warn('[CRM Tracker] Failed to send interaction:', err.message);
        return { success: false };
    });
}

/**
 * Creates an explicit relationship between two contacts
 */
export async function createRelationship(data: { sourceContactId: string; targetContactId: string; type: string; notes?: string }): Promise<any> {
    if (isDemoCrm()) return { success: true, relationship: data };
    return request(`/crm/contacts/${data.sourceContactId}/relationships`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
