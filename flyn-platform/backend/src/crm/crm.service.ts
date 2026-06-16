/**
 * CRM Service — NocoBase Backend
 * 
 * Core business logic for the CRM plugin module.
 * Proxies all operations through the NocoBase REST API instead of direct MongoDB.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    Contact, ContactCreateDto, ContactUpdateDto,
    Deal, DealCreateDto, DealUpdateDto,
    Activity, ActivityCreateDto,
    CRMDashboardStats, PaginationQuery, PaginatedResult, ContactStatus,
} from './crm.types';
import { AIProviderService } from '../orchestrator/ai-provider/ai-provider.service';
import { FirebaseService } from '../firebase/firebase.service';
import { isDemoModeEnabled } from '../common/demo-auth';

type EventBusFn = (tenantId: string, eventName: string, data: Record<string, unknown>) => void;

const DEMO_TENANT_ID = 'demo-org';

type DemoCrmSeed = {
    contacts: Contact[];
    deals: Deal[];
    activities: Activity[];
};

const buildDemoCrmSeed = (tenantId: string): DemoCrmSeed => {
    const now = Date.now();
    const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);
    const id = (suffix: string) => `${tenantId}_${suffix}`;
    const contacts: Contact[] = [
        {
            _id: id('c1'), id: 1001, name: 'Aarav Mehta', email: 'aarav.mehta@example.in', phone: '+919876543210',
            company: 'Mehta Study Abroad', status: 'qualified', tags: ['hot-lead', 'india', 'whatsapp'],
            source: 'Website', owner: 'Priya Sharma', score: 84, notes: 'Interested in business analytics and wants a fast scholarship decision.',
            createdAt: daysAgo(12), updatedAt: daysAgo(1),
        },
        {
            _id: id('c2'), id: 1002, name: 'Ananya Nair', email: 'ananya.nair@example.in', phone: '+919821112233',
            company: 'Nair Family', status: 'lead', tags: ['follow-up', 'india'], source: 'WhatsApp Referral',
            owner: 'Rohan Verma', score: 62, notes: 'Parent asked for tuition, visa, and hostel details in one call.',
            createdAt: daysAgo(10), updatedAt: daysAgo(2),
        },
        {
            _id: id('c3'), id: 1003, name: 'Kabir Singh', email: 'kabir.singh@example.in', phone: '+919700123456',
            company: 'Singh Academy', status: 'customer', tags: ['enrolled', 'referral'], source: 'Alumni Referral',
            owner: 'Sana Khan', score: 92, notes: 'Paid registration fee; waiting on offer letter for next intake.',
            createdAt: daysAgo(21), updatedAt: daysAgo(3),
        },
        {
            _id: id('c4'), id: 1004, name: 'Ishita Rao', email: 'ishita.rao@example.in', phone: '+919845612345',
            company: 'Rao Education', status: 'qualified', tags: ['scholarship', 'priority'], source: 'Facebook Ads',
            owner: 'Aman Gupta', score: 77, notes: 'Scholarship-focused lead; family comparing India vs UAE options.',
            createdAt: daysAgo(8), updatedAt: daysAgo(1),
        },
        {
            _id: id('c5'), id: 1005, name: 'Dev Patel', email: 'dev.patel@example.in', phone: '+919900223344',
            company: 'Patel Commerce', status: 'inactive', tags: ['re-engage'], source: 'Website', owner: 'Priya Sharma',
            score: 31, notes: 'Went quiet after document checklist was shared.',
            createdAt: daysAgo(17), updatedAt: daysAgo(5),
        },
        {
            _id: id('c6'), id: 1006, name: 'Sneha Kulkarni', email: 'sneha.kulkarni@example.in', phone: '+918888334455',
            company: 'Kulkarni Classes', status: 'lead', tags: ['call-back'], source: 'Instagram', owner: 'Rohan Verma',
            score: 48, notes: 'Shortlisted for a demo on employability pathway and internship support.',
            createdAt: daysAgo(6), updatedAt: daysAgo(1),
        },
        {
            _id: id('c7'), id: 1007, name: 'Mohit Bansal', email: 'mohit.bansal@example.in', phone: '+919711009911',
            company: 'Bansal Families', status: 'customer', tags: ['visa', 'payments'], source: 'Call Inbound',
            owner: 'Sana Khan', score: 89, notes: 'Strong parent engagement; visa file nearly complete.',
            createdAt: daysAgo(25), updatedAt: daysAgo(1),
        },
        {
            _id: id('c8'), id: 1008, name: 'Pooja Iyer', email: 'pooja.iyer@example.in', phone: '+919677445566',
            company: 'Iyer Foundation', status: 'lead', tags: ['webinar', 'mba'], source: 'Webinar',
            owner: 'Aman Gupta', score: 55, notes: 'Asked for hostel, living cost, and part-time work guidance.',
            createdAt: daysAgo(4), updatedAt: daysAgo(1),
        },
    ];

    const deals: Deal[] = [
        { _id: id('d1'), id: 2001, title: 'MBA Admission - Aarav Mehta', value: 125000, stage: 'negotiation', contactId: String(contacts[0].id), contactName: contacts[0].name, probability: 78, expectedCloseDate: daysAgo(-14), owner: 'Priya Sharma', notes: 'Scholarship and cohort fit are the main blockers.', createdAt: daysAgo(12), updatedAt: daysAgo(1) },
        { _id: id('d2'), id: 2002, title: 'BBA Admission - Ananya Nair', value: 88000, stage: 'qualified', contactId: String(contacts[1].id), contactName: contacts[1].name, probability: 56, expectedCloseDate: daysAgo(-21), owner: 'Rohan Verma', notes: 'Awaiting parent approval and fee split confirmation.', createdAt: daysAgo(10), updatedAt: daysAgo(2) },
        { _id: id('d3'), id: 2003, title: 'MS Admission - Kabir Singh', value: 160000, stage: 'won', contactId: String(contacts[2].id), contactName: contacts[2].name, probability: 100, expectedCloseDate: daysAgo(-7), owner: 'Sana Khan', wonReason: 'Strong referral trust and quick document turnaround.', notes: 'Registration fee paid; onboarding in progress.', createdAt: daysAgo(21), updatedAt: daysAgo(3) },
        { _id: id('d4'), id: 2004, title: 'Scholarship Lead - Ishita Rao', value: 140000, stage: 'proposal', contactId: String(contacts[3].id), contactName: contacts[3].name, probability: 69, expectedCloseDate: daysAgo(-10), owner: 'Aman Gupta', notes: 'Proposal sent with two scholarship scenarios.', createdAt: daysAgo(8), updatedAt: daysAgo(1) },
        { _id: id('d5'), id: 2005, title: 'Reactivation - Dev Patel', value: 72000, stage: 'new', contactId: String(contacts[4].id), contactName: contacts[4].name, probability: 25, expectedCloseDate: daysAgo(-28), owner: 'Priya Sharma', notes: 'Needs follow-up after a silent period.', createdAt: daysAgo(17), updatedAt: daysAgo(5) },
        { _id: id('d6'), id: 2006, title: 'Webinar Lead - Pooja Iyer', value: 99000, stage: 'qualified', contactId: String(contacts[7].id), contactName: contacts[7].name, probability: 61, expectedCloseDate: daysAgo(-18), owner: 'Aman Gupta', notes: 'High intent after webinar on placements and visas.', createdAt: daysAgo(4), updatedAt: daysAgo(1) },
    ];

    const activities: Activity[] = [
        { _id: id('a1'), id: 3001, type: 'call', contactId: String(contacts[0].id), dealId: String(deals[0].id), description: 'Discussed MBA intake dates, scholarship paperwork, and fee milestones.', actor: 'Priya Sharma', createdAt: daysAgo(1) },
        { _id: id('a2'), id: 3002, type: 'email', contactId: String(contacts[1].id), dealId: String(deals[1].id), description: 'Sent brochure and list of required documents to the family email.', actor: 'Rohan Verma', createdAt: daysAgo(2) },
        { _id: id('a3'), id: 3003, type: 'meeting', contactId: String(contacts[2].id), dealId: String(deals[2].id), description: 'Closed registration after a virtual parent call from Mumbai.', actor: 'Sana Khan', createdAt: daysAgo(3) },
        { _id: id('a4'), id: 3004, type: 'note', contactId: String(contacts[3].id), dealId: String(deals[3].id), description: 'Family comparing Indian universities on ROI and work permits.', actor: 'Aman Gupta', createdAt: daysAgo(1) },
        { _id: id('a5'), id: 3005, type: 'task', contactId: String(contacts[4].id), dealId: String(deals[4].id), description: 'Re-engage with updated scholarship options and fee split plan.', actor: 'Priya Sharma', createdAt: daysAgo(2) },
        { _id: id('a6'), id: 3006, type: 'call', contactId: String(contacts[5].id), description: 'Booked a product demo for employability and internship support.', actor: 'Rohan Verma', createdAt: daysAgo(1) },
        { _id: id('a7'), id: 3007, type: 'deal_update', contactId: String(contacts[6].id), dealId: String(deals[2].id), description: 'Deal marked won after registration fee confirmation.', actor: 'System', createdAt: daysAgo(3) },
        { _id: id('a8'), id: 3008, type: 'relationship', contactId: String(contacts[7].id), description: 'Student came via a webinar referral from Pune community.', actor: 'Aman Gupta', createdAt: daysAgo(1) },
    ];

    return { contacts, deals, activities };
};

@Injectable()
export class CrmService implements OnModuleInit {
    private readonly logger = new Logger(CrmService.name);
    private token: string | null = null;
    private eventBus: EventBusFn | null = null;

    /** Called by WorkflowEventService at startup — avoids circular DI. */
    setEventBus(fn: EventBusFn): void { this.eventBus = fn; }

    // Per-tenant in-memory cache (keyed by tenantId) used when NocoBase is down
    private contactsMap = new Map<string, Contact[]>();
    private dealsMap = new Map<string, Deal[]>();
    private activitiesMap = new Map<string, Activity[]>();

    private resolveTenantId(tenantId = 'default'): string {
        if (tenantId !== 'default') return tenantId;
        return isDemoModeEnabled() ? DEMO_TENANT_ID : tenantId;
    }

    private ensureDemoSeed(tenantId = 'default'): string {
        const effectiveTenantId = this.resolveTenantId(tenantId);
        if (!isDemoModeEnabled()) return effectiveTenantId;
        const alreadySeeded =
            (this.contactsMap.get(effectiveTenantId)?.length ?? 0) > 0 ||
            (this.dealsMap.get(effectiveTenantId)?.length ?? 0) > 0 ||
            (this.activitiesMap.get(effectiveTenantId)?.length ?? 0) > 0;
        if (alreadySeeded) return effectiveTenantId;

        const seed = buildDemoCrmSeed(effectiveTenantId);
        this.contactsMap.set(effectiveTenantId, seed.contacts);
        this.dealsMap.set(effectiveTenantId, seed.deals);
        this.activitiesMap.set(effectiveTenantId, seed.activities);
        return effectiveTenantId;
    }

    // Per-tenant Firestore helpers
    private crmCol(tenantId: string, sub: 'crmContacts' | 'crmDeals' | 'crmActivities') {
        return this.firebase.firestore()
            .collection('tenants').doc(tenantId)
            .collection(sub);
    }

    private async loadTenantContacts(tenantId: string): Promise<Contact[]> {
        const effectiveTenantId = this.ensureDemoSeed(tenantId);
        if (this.contactsMap.has(effectiveTenantId)) return this.contactsMap.get(effectiveTenantId)!;
        try {
            const snap = await this.crmCol(effectiveTenantId, 'crmContacts').get();
            const contacts = snap.docs.map(d => d.data() as Contact);
            this.contactsMap.set(effectiveTenantId, contacts);
            return contacts;
        } catch {
            this.contactsMap.set(effectiveTenantId, []);
            return [];
        }
    }

    private async loadTenantDeals(tenantId: string): Promise<Deal[]> {
        const effectiveTenantId = this.ensureDemoSeed(tenantId);
        if (this.dealsMap.has(effectiveTenantId)) return this.dealsMap.get(effectiveTenantId)!;
        this.dealsMap.set(effectiveTenantId, []);
        return [];
    }

    private async loadTenantActivities(tenantId: string): Promise<Activity[]> {
        const effectiveTenantId = this.ensureDemoSeed(tenantId);
        if (this.activitiesMap.has(effectiveTenantId)) return this.activitiesMap.get(effectiveTenantId)!;
        this.activitiesMap.set(effectiveTenantId, []);
        return [];
    }

    private async saveTenantContact(tenantId: string, contact: Contact): Promise<void> {
        try {
            await this.crmCol(tenantId, 'crmContacts').doc(contact._id).set(contact);
        } catch (err) {
            this.logger.warn(`CRM Firestore save failed for ${tenantId}: ${(err as Error).message}`);
        }
    }

    private async deleteTenantContact(tenantId: string, id: string): Promise<void> {
        try {
            await this.crmCol(tenantId, 'crmContacts').doc(id).delete();
        } catch (err) {
            this.logger.warn(`CRM Firestore delete failed for ${tenantId}: ${(err as Error).message}`);
        }
    }

    constructor(
        private readonly ai: AIProviderService,
        private readonly firebase: FirebaseService,
    ) {}

    private get baseUrl(): string {
        return process.env.NOCOBASE_URL || 'http://localhost:13000';
    }

    private get adminEmail(): string {
        return process.env.NOCOBASE_ADMIN_EMAIL || 'admin@nocobase.com';
    }

    private get adminPassword(): string {
        return process.env.NOCOBASE_ADMIN_PASSWORD || 'admin123';
    }

    async onModuleInit() {
        try {
            await this.authenticate();
            this.logger.log(`CRM Service connected to NocoBase at ${this.baseUrl}`);
            await this.setupCollections();
        } catch (error) {
            this.logger.warn(`CRM Service: NocoBase connection failed (${(error as Error).message}). CRM will operate with Firestore per-tenant persistence.`);
        }
    }

    private async setupCollections(): Promise<void> {
        const collections: Record<string, Array<{ name: string; type: string; title: string }>> = {
            contacts: [
                { name: 'name', type: 'string', title: 'Name' },
                { name: 'email', type: 'string', title: 'Email' },
                { name: 'phone', type: 'string', title: 'Phone' },
                { name: 'company', type: 'string', title: 'Company' },
                { name: 'status', type: 'string', title: 'Status' },
                { name: 'source', type: 'string', title: 'Source' },
                { name: 'score', type: 'integer', title: 'Lead Score' },
                { name: 'tags', type: 'string', title: 'Tags' },
                { name: 'notes', type: 'text', title: 'Notes' },
                { name: 'signature', type: 'string', title: 'Digital Signature' },
            ],
            deals: [
                { name: 'title', type: 'string', title: 'Title' },
                { name: 'value', type: 'float', title: 'Value' },
                { name: 'stage', type: 'string', title: 'Stage' },
                { name: 'contactId', type: 'integer', title: 'Contact ID' },
                { name: 'contactName', type: 'string', title: 'Contact Name' },
                { name: 'probability', type: 'integer', title: 'Probability (%)' },
                { name: 'expectedCloseDate', type: 'string', title: 'Expected Close Date' },
                { name: 'owner', type: 'string', title: 'Owner' },
                { name: 'wonReason', type: 'text', title: 'Won Reason' },
                { name: 'lostReason', type: 'text', title: 'Lost Reason' },
                { name: 'notes', type: 'text', title: 'Notes' },
            ],
            activities: [
                { name: 'type', type: 'string', title: 'Type' },
                { name: 'description', type: 'text', title: 'Description' },
                { name: 'actor', type: 'string', title: 'Actor' },
                { name: 'contactId', type: 'integer', title: 'Contact ID' },
                { name: 'dealId', type: 'integer', title: 'Deal ID' },
            ],
            relationships: [
                { name: 'sourceContactId', type: 'integer', title: 'Source Contact ID' },
                { name: 'targetContactId', type: 'integer', title: 'Target Contact ID' },
                { name: 'relationshipType', type: 'string', title: 'Relationship Type' },
                { name: 'strength', type: 'float', title: 'Strength' },
                { name: 'notes', type: 'text', title: 'Notes' },
            ],
        };

        for (const [name, fields] of Object.entries(collections)) {
            await this.request('/api/collections:create', 'POST', { name, title: name.charAt(0).toUpperCase() + name.slice(1) }).catch(() => null);
            for (const field of fields) {
                await this.request(`/api/collections/${name}/fields:create`, 'POST', {
                    name: field.name,
                    type: field.type,
                    interface: field.type === 'text' ? 'textarea' : field.type === 'integer' || field.type === 'float' ? 'number' : 'input',
                    uiSchema: { title: field.title },
                }).catch(() => null);
            }
            this.logger.log(`CRM: NocoBase collection "${name}" ready`);
        }
    }

    // ─── Auth ──────────────────────────────────────────────────────────
    private async authenticate(): Promise<void> {
        const res = await this.request('/api/auth:signIn', 'POST', {
            account: this.adminEmail,
            password: this.adminPassword,
        }, false);
        if (!res?.data?.token) {
            throw new Error('NocoBase auth failed');
        }
        this.token = res.data.token;
    }

    private async request(path: string, method = 'GET', body?: any, useAuth = true): Promise<any> {
        // Lazy auth: if token is missing, try to authenticate now (handles backend
        // starting before NocoBase is ready).
        if (useAuth && !this.token) {
            try {
                await this.authenticate();
            } catch (err) {
                this.logger.warn('Lazy auth failed, NocoBase may not be ready yet');
                throw err;
            }
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (useAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const url = `${this.baseUrl}${path}`;

        try {
            const res = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });

            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({}));
                this.logger.error(`NocoBase request failed: ${method} ${path} - Status: ${res.status}`, JSON.stringify(errorBody));
                throw new Error(errorBody?.errors?.[0]?.message || errorBody?.message || `NocoBase error: ${res.status}`);
            }

            return await res.json();
        } catch (error) {
            this.logger.error(`NocoBase request failed: ${method} ${path}`, (error as Error).message);
            throw error;
        }
    }

    private get isConnected(): boolean {
        return this.token !== null;
    }

    // ─── Contacts ──────────────────────────────────────────────────────

    async getContacts(query: PaginationQuery = {}, tenantId = 'default'): Promise<PaginatedResult<Contact>> {
        tenantId = this.resolveTenantId(tenantId);
        if (!this.isConnected) {
            const page = query.page || 1;
            const limit = query.limit || 10;
            let data = [...(await this.loadTenantContacts(tenantId))];
            if (query.search) {
                const s = query.search.toLowerCase();
                data = data.filter(c => c.name.toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s));
            }
            if (query.status) {
                data = data.filter(c => c.status === query.status);
            }
            const total = data.length;
            const sliced = data.slice((page - 1) * limit, page * limit);
            return { data: sliced, total, page, limit, totalPages: Math.ceil(total / limit) };
        }

        const page = query.page || 1;
        const limit = query.limit || 10;
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('pageSize', String(limit));

        if (query.search) {
            // NocoBase filter format for "or" search across fields
            params.set('filter', JSON.stringify({
                $or: [
                    { name: { $includes: query.search } },
                    { email: { $includes: query.search } },
                    { company: { $includes: query.search } },
                ],
            }));
        }

        if (query.status) {
            const currentFilter = params.get('filter');
            const filterObj = currentFilter ? JSON.parse(currentFilter) : {};
            filterObj.status = query.status;
            params.set('filter', JSON.stringify(filterObj));
        }

        if (query.sort) {
            const dir = query.sortDirection === 'desc' ? '-' : '';
            params.set('sort', `${dir}${query.sort}`);
        } else {
            // Use -id as default sort (createdAt may not exist in NocoBase collection)
            params.set('sort', '-id');
        }

        try {
            const result = await this.request(`/api/contacts:list?${params.toString()}`);
            if (result?.errors) {
                // Sort field might not exist — retry without sort
                this.logger.warn(`contacts:list failed with sort, retrying without: ${result.errors[0]?.message}`);
                params.delete('sort');
                const retry = await this.request(`/api/contacts:list?${params.toString()}`);
                const data = retry?.data || [];
                const total = retry?.meta?.count || data.length;
                return { data: data.map(this.mapContact), total, page, limit, totalPages: Math.ceil(total / limit) };
            }
            const data = result?.data || [];
            const total = result?.meta?.count || data.length;

            return {
                data: data.map(this.mapContact),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        } catch (error) {
            this.logger.error(`getContacts failed: ${(error as Error).message}`);
            return { data: [], total: 0, page, limit, totalPages: 0 };
        }
    }

    async getContact(id: string, tenantId = 'default'): Promise<Contact | null> {
        tenantId = this.resolveTenantId(tenantId);
        if (!this.isConnected) {
            const contacts = await this.loadTenantContacts(tenantId);
            return contacts.find(c => c._id === id || String(c.id) === id) || null;
        }
        const result = await this.request(`/api/contacts:get?filterByTk=${id}`);
        return result?.data ? this.mapContact(result.data) : null;
    }

    async findContactByPhone(phone: string, tenantId = 'default'): Promise<Contact | null> {
        tenantId = this.resolveTenantId(tenantId);
        const normalized = phone.replace(/\D/g, '');
        if (!normalized) return null;
        if (!this.isConnected) {
            const contacts = await this.loadTenantContacts(tenantId);
            return contacts.find(c => (c.phone || '').replace(/\D/g, '') === normalized) ?? null;
        }
        try {
            const result = await this.request(
                `/api/contacts:list?filter=${encodeURIComponent(JSON.stringify({ phone: { $includes: normalized } }))}&pageSize=5`,
            );
            const match = (result?.data || []).find(
                (c: any) => (c.phone || '').replace(/\D/g, '') === normalized,
            );
            return match ? this.mapContact(match) : null;
        } catch {
            return null;
        }
    }

    /**
     * A contact is a duplicate only when ALL THREE fields (name+phone+email) match exactly.
     * Empty-vs-value is treated as different, so contacts with same name but one missing
     * a phone or email are NOT duplicates.
     */
    private isFullDuplicate(dto: ContactCreateDto, existing: Contact[]): boolean {
        const normName = (s?: string) => s?.trim().toLowerCase() || '';
        const normPhone = (s?: string) => s?.trim().replace(/[\s\(\)\-]/g, '') || '';
        const normEmail = (s?: string) => s?.trim().toLowerCase() || '';

        const inName = normName(dto.name);
        const inPhone = normPhone(dto.phone);
        const inEmail = normEmail(dto.email);

        if (!inName) return false; // contacts with no name are never duplicates

        return existing.some(c => {
            return normName(c.name) === inName &&
                normPhone(c.phone) === inPhone &&
                normEmail(c.email) === inEmail;
        });
    }

    async createContact(dto: ContactCreateDto, tenantId = 'default'): Promise<Contact> {
        tenantId = this.resolveTenantId(tenantId);
        let contact: Contact;
        if (!this.isConnected) {
            const existing = await this.loadTenantContacts(tenantId);
            if (this.isFullDuplicate(dto, existing)) {
                this.logger.warn(`createContact: duplicate skipped — "${dto.name}"`);
                throw new Error(`Duplicate contact: "${dto.name}" with the same name, phone, and email already exists`);
            }
            const id = `crm_${tenantId}_${Date.now()}`;
            contact = {
                _id: id,
                id: Date.now(),
                ...dto,
                status: dto.status || 'lead',
                score: dto.score || 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any;
            existing.push(contact);
            this.contactsMap.set(tenantId, existing);
            await this.saveTenantContact(tenantId, contact);
        } else {
            const result = await this.request('/api/contacts:create', 'POST', dto);
            contact = this.mapContact(result.data);
        }
        this.eventBus?.(tenantId, 'crm.contact.created', { contact, tenantId });
        return contact;
    }

    /** Bulk-create contacts per tenant with Firestore persistence */
    async bulkCreateContacts(dtos: ContactCreateDto[], tenantId = 'default'): Promise<Contact[]> {
        tenantId = this.resolveTenantId(tenantId);
        if (!this.isConnected) {
            const existing = await this.loadTenantContacts(tenantId);
            const base = Date.now();
            const newContacts: Contact[] = [];
            const pool: Contact[] = [...existing];
            let skipped = 0;
            for (let i = 0; i < dtos.length; i++) {
                const dto = dtos[i];
                if (this.isFullDuplicate(dto, pool)) { skipped++; continue; }
                const contact: Contact = {
                    _id: `crm_${tenantId}_${base}_${i}`,
                    id: base + i,
                    ...dto,
                    status: dto.status || 'lead',
                    score: dto.score || 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as any;
                newContacts.push(contact);
                pool.push(contact);
            }
            const merged = [...existing, ...newContacts];
            this.contactsMap.set(tenantId, merged);
            // Batch write to Firestore
            if (newContacts.length > 0) {
                const db = this.firebase.firestore();
                const col = this.crmCol(tenantId, 'crmContacts');
                for (let i = 0; i < newContacts.length; i += 400) {
                    const batch = db.batch();
                    newContacts.slice(i, i + 400).forEach(c => batch.set(col.doc(c._id), c));
                    await batch.commit().catch(e => this.logger.warn(`CRM batch write failed: ${(e as Error).message}`));
                }
            }
            if (skipped > 0) this.logger.log(`CRM: Bulk-import skipped ${skipped} duplicates, added ${newContacts.length} for tenant ${tenantId}`);
            return newContacts;
        }
        // NocoBase: sequential creates
        const results: Contact[] = [];
        for (const dto of dtos) {
            try {
                const result = await this.request('/api/contacts:create', 'POST', dto);
                results.push(this.mapContact(result.data));
            } catch (err) {
                this.logger.warn(`bulkCreate: skipped "${dto.name}" — ${(err as Error).message}`);
            }
        }
        return results;
    }

    async updateContact(id: string, dto: ContactUpdateDto, tenantId = 'default'): Promise<Contact | null> {
        tenantId = this.resolveTenantId(tenantId);
        if (!this.isConnected) {
            const contacts = await this.loadTenantContacts(tenantId);
            const idx = contacts.findIndex(c => c._id === id || String(c.id) === id);
            if (idx === -1) return null;
            contacts[idx] = { ...contacts[idx], ...dto, updatedAt: new Date() } as any;
            this.contactsMap.set(tenantId, contacts);
            await this.saveTenantContact(tenantId, contacts[idx]);
            return contacts[idx];
        }
        const result = await this.request(`/api/contacts:update?filterByTk=${id}`, 'POST', dto);
        return result?.data ? this.mapContact(result.data) : null;
    }

    async deleteContact(id: string, tenantId = 'default'): Promise<boolean> {
        tenantId = this.resolveTenantId(tenantId);
        if (!this.isConnected) {
            const contacts = await this.loadTenantContacts(tenantId);
            const filtered = contacts.filter(c => c._id !== id && String(c.id) !== id);
            const deleted = filtered.length < contacts.length;
            if (deleted) {
                this.contactsMap.set(tenantId, filtered);
                await this.deleteTenantContact(tenantId, id);
            }
            return deleted;
        }
        const result = await this.request(`/api/contacts:destroy?filterByTk=${id}`, 'POST');
        return !!result?.data;
    }

    private mapContact(raw: any): Contact {
        return {
            _id: String(raw.id),
            id: raw.id,
            name: raw.name || '',
            email: raw.email || '',
            phone: raw.phone || '',
            company: raw.company || '',
            status: raw.status || 'lead',
            tags: raw.tags || [],
            source: raw.source || '',
            score: raw.score || 0,
            notes: raw.notes || '',
            createdAt: raw.createdAt || new Date().toISOString(),
            updatedAt: raw.updatedAt || new Date().toISOString(),
        };
    }

    // ─── Deals ──────────────────────────────────────────────────────────

    async getDeals(stage?: string): Promise<Deal[]> {
        const tenantId = this.ensureDemoSeed();
        if (!this.isConnected) {
            let deals = await this.loadTenantDeals(tenantId);
            if (stage) deals = deals.filter(d => d.stage === stage);
            return deals;
        }

        const params = new URLSearchParams();
        params.set('pageSize', '100');
        if (stage) {
            params.set('filter', JSON.stringify({ stage }));
        }

        const result = await this.request(`/api/deals:list?${params.toString()}`);
        return (result?.data || []).map(this.mapDeal);
    }

    async getDeal(id: string): Promise<Deal | null> {
        const tenantId = this.ensureDemoSeed();
        if (!this.isConnected) {
            const deals = await this.loadTenantDeals(tenantId);
            return deals.find(d => d._id === id || String(d.id) === id) || null;
        }
        const result = await this.request(`/api/deals:get?filterByTk=${id}`);
        return result?.data ? this.mapDeal(result.data) : null;
    }

    async createDeal(dto: DealCreateDto, tenantId = 'default'): Promise<Deal> {
        tenantId = this.resolveTenantId(tenantId);
        let deal: Deal;
        if (!this.isConnected) {
            deal = {
                _id: `mem_deal_${Date.now()}`,
                id: Date.now(),
                ...dto,
                value: Number(dto.value) || 0,
                stage: dto.stage || 'new',
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any;
            const deals = this.dealsMap.get(tenantId) || [];
            deals.push(deal);
            this.dealsMap.set(tenantId, deals);
        } else {
            const result = await this.request('/api/deals:create', 'POST', dto);
            deal = this.mapDeal(result.data);
        }
        this.eventBus?.(tenantId, 'crm.deal.created', { deal, tenantId });
        return deal;
    }

    async updateDeal(id: string, dto: DealUpdateDto, tenantId = 'default'): Promise<Deal | null> {
        tenantId = this.resolveTenantId(tenantId);
        // Strip system-managed fields that NocoBase rejects if sent in the body
        const { updatedAt: _u, createdAt: _c, ...safeDto } = dto as any;

        if (!this.isConnected) {
            // In-memory fallback: find and patch the deal in dealsMap
            for (const [tid, list] of this.dealsMap) {
                const idx = list.findIndex(d => String(d._id || d.id) === id);
                if (idx !== -1) {
                    list[idx] = { ...list[idx], ...safeDto, updatedAt: new Date() } as any;
                    this.dealsMap.set(tid, list);
                    const updated = list[idx];
                    if (safeDto.stage === 'won') this.eventBus?.(tenantId, 'crm.deal.won', { deal: updated, tenantId });
                    return updated;
                }
            }
            return null;
        }

        const result = await this.request(`/api/deals:update?filterByTk=${id}`, 'POST', safeDto);
        const deal = result?.data ? this.mapDeal(result.data) : null;
        if (deal && safeDto.stage === 'won') {
            this.eventBus?.(tenantId, 'crm.deal.won', { deal, tenantId });
        }
        return deal;
    }

    private mapDeal(raw: any): Deal {
        return {
            _id: String(raw.id),
            id: raw.id,
            title: raw.title || '',
            value: raw.value || 0,
            stage: raw.stage || 'new',
            contactId: raw.contactId ? String(raw.contactId) : undefined,
            contactName: raw.contactName || undefined,
            probability: raw.probability || 0,
            expectedCloseDate: raw.expectedCloseDate,
            owner: raw.owner || undefined,
            wonReason: raw.wonReason || undefined,
            lostReason: raw.lostReason || undefined,
            notes: raw.notes || '',
            createdAt: raw.createdAt || new Date().toISOString(),
            updatedAt: raw.updatedAt || new Date().toISOString(),
        };
    }

    // ─── Activities ──────────────────────────────────────────────────────

    async getActivities(contactId?: string, dealId?: string): Promise<Activity[]> {
        const tenantId = this.ensureDemoSeed();
        if (!this.isConnected) {
            let activities = await this.loadTenantActivities(tenantId);
            if (contactId) activities = activities.filter(a => String(a.contactId ?? '') === String(contactId));
            if (dealId) activities = activities.filter(a => String(a.dealId ?? '') === String(dealId));
            return activities;
        }

        const params = new URLSearchParams();
        params.set('pageSize', '50');
        params.set('sort', '-id');

        const filter: Record<string, any> = {};
        if (contactId) filter.contactId = Number(contactId);
        if (dealId) filter.dealId = Number(dealId);
        if (Object.keys(filter).length > 0) {
            params.set('filter', JSON.stringify(filter));
        }

        const result = await this.request(`/api/activities:list?${params.toString()}`);
        return (result?.data || []).map(this.mapActivity);
    }

    async createActivity(dto: ActivityCreateDto): Promise<Activity> {
        const tenantId = this.ensureDemoSeed();
        if (!this.isConnected) {
            const activity: Activity = {
                _id: `mem_act_${Date.now()}`,
                id: Date.now(),
                ...dto,
                actor: dto.actor || 'System',
                createdAt: new Date(),
            } as any;
            const activities = this.activitiesMap.get(tenantId) || [];
            activities.push(activity);
            this.activitiesMap.set(tenantId, activities);
            return activity;
        }
        const result = await this.request('/api/activities:create', 'POST', {
            ...dto,
            contactId: dto.contactId ? Number(dto.contactId) : undefined,
            dealId: dto.dealId ? Number(dto.dealId) : undefined,
        });
        return this.mapActivity(result.data);
    }

    private mapActivity(raw: any): Activity {
        return {
            _id: String(raw.id),
            id: raw.id,
            type: raw.type || 'note',
            description: raw.description || '',
            actor: raw.actor || '',
            contactId: raw.contactId ? String(raw.contactId) : undefined,
            dealId: raw.dealId ? String(raw.dealId) : undefined,
            createdAt: raw.createdAt || new Date().toISOString(),
        };
    }

    // ─── Relationships ──────────────────────────────────────────────────

    async getRelationships(contactId: string): Promise<any[]> {
        if (!this.isConnected) return [];
        const params = new URLSearchParams();
        params.set('filter', JSON.stringify({
            $or: [
                { sourceContactId: Number(contactId) },
                { targetContactId: Number(contactId) },
            ],
        }));
        const result = await this.request(`/api/relationships:list?${params.toString()}`);
        return (result?.data || []).map((r: any) => ({
            id: r.id,
            sourceContactId: String(r.sourceContactId),
            targetContactId: String(r.targetContactId),
            type: r.relationshipType,
            strength: r.strength,
            notes: r.notes,
        }));
    }

    async createRelationship(data: { sourceContactId: string; targetContactId: string; type: string; notes?: string }): Promise<any> {
        const result = await this.request('/api/relationships:create', 'POST', {
            sourceContactId: Number(data.sourceContactId),
            targetContactId: Number(data.targetContactId),
            relationshipType: data.type,
            strength: 1.0,
            notes: data.notes,
        });
        return result?.data;
    }

    // ─── Dashboard Stats ──────────────────────────────────────────────────

    async getDashboardStats(tenantId = 'default'): Promise<CRMDashboardStats> {
        try {
            tenantId = this.resolveTenantId(tenantId);
            let contacts: any[] = [];
            let deals: any[] = [];
            let activities: any[] = [];

            if (this.isConnected) {
                // Fetch from NocoBase
                const contactsResult = await this.request('/api/contacts:list?pageSize=500');
                contacts = contactsResult?.data || [];

                const dealsResult = await this.request('/api/deals:list?pageSize=500');
                deals = dealsResult?.data || [];

                try {
                    const activitiesResult = await this.request('/api/activities:list?pageSize=10&sort=-id');
                    activities = (activitiesResult?.data || []).map(this.mapActivity);
                } catch (e) {
                    this.logger.warn(`Activities fetch failed in dashboard: ${(e as Error).message}`);
                }
            } else {
                // Fetch from per-tenant Firestore cache
                contacts = await this.loadTenantContacts(tenantId);
                deals = await this.loadTenantDeals(tenantId);
                activities = await this.loadTenantActivities(tenantId);
            }

            // Compute stats
            const totalContacts = contacts.length;
            const totalLeads = contacts.filter((c: any) => c.status === 'lead').length;
            const qualifiedLeads = contacts.filter((c: any) => c.status === 'qualified').length;

            const totalDeals = deals.length;
            const wonDeals = deals.filter((d: any) => d.stage === 'won');
            const dealsWonValue = wonDeals.reduce((sum: number, d: any) => sum + (d.value || 0), 0);
            const dealsWonCount = wonDeals.length;

            const convertedCount = contacts.filter((c: any) => c.status === 'customer').length;
            const conversionRate = totalContacts > 0 ? Math.round((convertedCount / totalContacts) * 100) : 0;

            // Pipeline breakdown
            const stageMap: Record<string, { count: number; value: number }> = {};
            for (const deal of deals) {
                const stage = deal.stage || 'new';
                if (!stageMap[stage]) stageMap[stage] = { count: 0, value: 0 };
                stageMap[stage].count++;
                stageMap[stage].value += deal.value || 0;
            }
            const pipelineBreakdown = Object.entries(stageMap).map(([stage, data]) => ({
                stage,
                count: data.count,
                value: data.value,
            }));

            // Lead sources
            const sourceMap: Record<string, number> = {};
            for (const contact of contacts) {
                const src = contact.source || 'Unknown';
                sourceMap[src] = (sourceMap[src] || 0) + 1;
            }
            const leadSources = Object.entries(sourceMap)
                .map(([source, count]) => ({ source, count }))
                .sort((a, b) => b.count - a.count);

            return {
                totalContacts,
                totalLeads,
                qualifiedLeads,
                totalDeals,
                dealsWonValue,
                dealsWonCount,
                conversionRate,
                recentActivities: activities,
                pipelineBreakdown,
                leadSources,
            };
        } catch (error) {
            this.logger.error(`Failed to compute dashboard stats: ${(error as Error).message}`);
            return this.fallbackStats();
        }
    }

    private fallbackStats(): CRMDashboardStats {
        return {
            totalContacts: 0,
            totalLeads: 0,
            qualifiedLeads: 0,
            totalDeals: 0,
            dealsWonValue: 0,
            dealsWonCount: 0,
            conversionRate: 0,
            recentActivities: [],
            pipelineBreakdown: [],
            leadSources: [],
        };
    }

    // ─── AI Sanitization ────────────────────────────────────────────────
    async sanitizeContacts(contacts: any[]): Promise<any[]> {
        const fallbackSanitize = (data: any[]) => {
            return data.map(c => {
                const sanitized = { ...c };
                if (typeof sanitized.name === 'string') {
                    sanitized.name = sanitized.name.trim().replace(/\s+/g, ' ')
                        .split(' ')
                        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                }
                if (typeof sanitized.email === 'string') {
                    sanitized.email = sanitized.email.trim().toLowerCase();
                }
                if (typeof sanitized.phone === 'string') {
                    // Basic cleanup: remove spaces and parens
                    let phone = sanitized.phone.replace(/[\s\(\)\-]/g, '');
                    if (phone.length > 0 && phone[0] !== '+') {
                        phone = '+' + phone; // Add plus if missing for E.164 style
                    }
                    sanitized.phone = phone;
                }
                if (typeof sanitized.company === 'string') {
                    sanitized.company = sanitized.company.trim();
                }
                return sanitized;
            });
        };

        if (!this.ai.isAvailable()) {
            this.logger.warn('AI Provider not available for sanitization, using fallback algorithmic sanitization');
            return fallbackSanitize(contacts);
        }

        const prompt = `You are a data cleaning expert. Sanitize and format these contact records for the FLYN platform.
Rules:
1. Phone numbers should be in E.164 format (e.g., +1234567890).
2. Email addresses should be valid and lowercase.
3. Fix common typos in names and companies.
4. If a field is clearly invalid, leave it as is or try to fix it logically.
5. Return ONLY a JSON array of the sanitized records.

Contacts to sanitize:
${JSON.stringify(contacts, null, 2)}`;

        const schema = {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    company: { type: 'string' },
                    status: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                    source: { type: 'string' },
                }
            }
        };

        try {
            const resp = await this.ai.generateStructured<any[]>(prompt, schema);
            return resp.data && resp.data.length > 0 ? resp.data : fallbackSanitize(contacts);
        } catch (error) {
            this.logger.error(`AI Sanitization failed: ${(error as Error).message}, using fallback`);
            return fallbackSanitize(contacts);
        }
    }
}
