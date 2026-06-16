/**
 * Phonebook Controller — per-tenant, Firestore-backed
 *
 * All contacts and groups are stored under:1
 *   tenants/{tenantId}/phonebookContacts
 *   tenants/{tenantId}/phonebookGroups
 *
 * This ensures complete data isolation between tenants.
 */

import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Logger,
    HttpCode,
    HttpStatus,
    UseGuards,
    Req,
    ConflictException,
} from '@nestjs/common';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { FirebaseService } from '../firebase/firebase.service';
import { ChannelsService } from '../channels/channels.service';
import { AIProviderService } from '../orchestrator/ai-provider/ai-provider.service';
import { parsePhoneNumber } from 'libphonenumber-js';

/**
 * Normalize a raw phone string to E.164.
 * - Strips surrounding quotes (common CSV artifact: '+9715...' → +9715...)
 * - Converts 00-prefix to + prefix
 * - Validates with libphonenumber-js and returns E.164 if valid
 * - Falls back to the cleaned string so no data is lost
 */
function normalizePhone(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    let phone = raw.trim().replace(/^['"]+|['"]+$/g, '');
    if (!phone) return undefined;
    if (phone.startsWith('00')) phone = '+' + phone.slice(2);
    if (phone.startsWith('+')) {
        try {
            const parsed = parsePhoneNumber(phone);
            if (parsed?.isValid()) return parsed.format('E.164');
        } catch { /* keep cleaned value */ }
        return phone;
    }
    // No country code — strip non-digit chars and return as-is (can't infer country)
    const digits = phone.replace(/[^\d]/g, '');
    return digits || undefined;
}

interface PhonebookContact {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    tags?: string[];
    source?: 'manual' | 'crm' | 'import';
    groupIds?: string[];
    tenantId?: string;
    createdAt?: number;
    dateOfBirth?: string;  // ISO date "YYYY-MM-DD" — used for birthday greetings
    joinDate?: string;     // ISO date "YYYY-MM-DD" — used for work anniversary greetings
}

interface PhonebookGroup {
    id: string;
    name: string;
    description?: string;
    contactIds: string[];
    color: string;
    tenantId?: string;
}

@Controller('phonebook')
@UseGuards(ApiOrFirebaseAuthGuard)
export class PhonebookController {
    private readonly logger = new Logger(PhonebookController.name);

    // ─── In-memory caches (primary storage) ───────────────────────────────
    private readonly _contactsCache = new Map<string, PhonebookContact[]>();
    private readonly _groupsCache = new Map<string, PhonebookGroup[]>();

    constructor(
        private readonly firebase: FirebaseService,
        private readonly channelsService: ChannelsService,
        private readonly ai: AIProviderService,
    ) {}

    // ─── Firestore helpers (optional write-through) ────────────────────────

    private contactsCol(tenantId: string) {
        const db = this.firebase.firestore();
        if (!db) return null;
        return db.collection('tenants').doc(tenantId).collection('phonebookContacts');
    }

    private groupsCol(tenantId: string) {
        const db = this.firebase.firestore();
        if (!db) return null;
        return db.collection('tenants').doc(tenantId).collection('phonebookGroups');
    }

    private tenantId(req: AuthRequest): string {
        // Always prefer uid for consistency — organisation_id may be absent in some sessions
        return (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '';
    }

    // ─── Cache load helpers ────────────────────────────────────────────────

    private async loadContacts(tid: string): Promise<PhonebookContact[]> {
        if (this._contactsCache.has(tid)) return this._contactsCache.get(tid)!;
        const col = this.contactsCol(tid);
        if (col) {
            try {
                const snap = await col.orderBy('createdAt', 'desc').get();
                const contacts = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as PhonebookContact));
                this._contactsCache.set(tid, contacts);
                return contacts;
            } catch (err: any) {
                this.logger.warn(`Firestore contacts load failed for ${tid}: ${err.message}`);
            }
        }
        this._contactsCache.set(tid, []);
        return [];
    }

    private async loadGroups(tid: string): Promise<PhonebookGroup[]> {
        if (this._groupsCache.has(tid)) return this._groupsCache.get(tid)!;
        const col = this.groupsCol(tid);
        if (col) {
            try {
                const snap = await col.get();
                const groups = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as PhonebookGroup));
                this._groupsCache.set(tid, groups);
                return groups;
            } catch (err: any) {
                this.logger.warn(`Firestore groups load failed for ${tid}: ${err.message}`);
            }
        }
        this._groupsCache.set(tid, []);
        return [];
    }

    /** Fire-and-forget Firestore write — never throws */
    private async fsWriteContact(tid: string, contact: PhonebookContact): Promise<void> {
        const col = this.contactsCol(tid);
        if (!col) return;
        try { await col.doc(contact.id).set(contact); } catch (err: any) {
            this.logger.warn(`Firestore contact write failed: ${err.message}`);
        }
    }

    private async fsDeleteContact(tid: string, id: string): Promise<void> {
        const col = this.contactsCol(tid);
        if (!col) return;
        await col.doc(id).delete();
    }

    private async fsWriteGroup(tid: string, group: PhonebookGroup): Promise<void> {
        const col = this.groupsCol(tid);
        if (!col) return;
        try { await col.doc(group.id).set(group); } catch (err: any) {
            this.logger.warn(`Firestore group write failed: ${err.message}`);
        }
    }

    private async fsDeleteGroup(tid: string, id: string): Promise<void> {
        const col = this.groupsCol(tid);
        if (!col) return;
        try { await col.doc(id).delete(); } catch (err: any) {
            this.logger.warn(`Firestore group delete failed: ${err.message}`);
        }
    }

    /**
     * Returns true if the incoming contact is a full duplicate of any existing contact.
     * A duplicate requires ALL three fields (name + phone + email) to match.
     * If any one field differs, the contact is allowed through.
     */
    private isFullDuplicate(incoming: Partial<PhonebookContact>, existing: PhonebookContact[]): boolean {
        const normPhone = (p?: string) => p?.replace(/[\s\(\)\-\.]/g, '') || '';
        const normName = (n?: string) => n?.trim().toLowerCase() || '';
        const normEmail = (e?: string) => e?.trim().toLowerCase() || '';

        // A contact is a duplicate only when ALL THREE fields match exactly.
        // Empty-vs-value is treated as a difference (not a match), so two contacts
        // with the same name but one missing a phone/email are NOT duplicates.
        return existing.some(e => {
            const inName = normName(incoming.name);
            const eName = normName(e.name);
            const inPhone = normPhone(incoming.phone);
            const ePhone = normPhone(e.phone);
            const inEmail = normEmail(incoming.email);
            const eEmail = normEmail(e.email);

            // Both must have a non-empty name for dedup comparison
            if (!inName || !eName) return false;

            return inName === eName && inPhone === ePhone && inEmail === eEmail;
        });
    }

    // ─── Contacts ──────────────────────────────────────────────────────────

    @Get('contacts')
    async getContacts(
        @Req() req: AuthRequest,
        @Query('search') search?: string,
    ) {
        const tid = this.tenantId(req);
        let contacts = await this.loadContacts(tid);
        if (search) {
            const s = search.toLowerCase();
            contacts = contacts.filter(c =>
                c.name?.toLowerCase().includes(s) ||
                c.phone?.includes(s) ||
                c.email?.toLowerCase().includes(s),
            );
        }
        return contacts;
    }

    @Post('contacts')
    @HttpCode(HttpStatus.CREATED)
    async createContact(
        @Req() req: AuthRequest,
        @Body() body: Omit<PhonebookContact, 'id' | 'tenantId' | 'createdAt'>,
    ) {
        const tid = this.tenantId(req);
        const existing = await this.loadContacts(tid);
        const candidates = existing.filter(e => e.name?.trim().toLowerCase() === body.name?.trim().toLowerCase());
        if (this.isFullDuplicate(body, candidates)) {
            throw new ConflictException(`Duplicate contact: "${body.name}" with the same name, phone, and email already exists`);
        }

        const id = `pb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const contact: PhonebookContact = {
            id,
            name: body.name,
            tags: body.tags ?? [],
            source: body.source ?? 'manual',
            groupIds: body.groupIds ?? [],
            tenantId: tid,
            createdAt: Date.now(),
        } as any;
        const normPhone = normalizePhone(body.phone);
        if (normPhone) (contact as any).phone = normPhone;
        if (body.email) (contact as any).email = body.email;
        if (body.dateOfBirth) (contact as any).dateOfBirth = body.dateOfBirth;
        if (body.joinDate) (contact as any).joinDate = body.joinDate;

        // Update cache
        this._contactsCache.set(tid, [contact, ...existing]);

        // Update groups in cache
        if (body.groupIds?.length) {
            const groups = await this.loadGroups(tid);
            for (const gid of body.groupIds) {
                const g = groups.find(g => g.id === gid);
                if (g && !g.contactIds.includes(id)) {
                    g.contactIds.push(id);
                    void this.fsWriteGroup(tid, g);
                }
            }
        }

        // Persist to Firestore (non-blocking)
        void this.fsWriteContact(tid, contact);
        return contact;
    }

    /**
     * POST /phonebook/ai-map
     * Uses AI to intelligently map CSV columns to contact fields.
     * Returns a mapping of column index → field name ('name'|'phone'|'email'|'tags'|'skip').
     */
    @Post('ai-map')
    async aiMapFields(
        @Body() body: { headers: string[]; samples: string[][] },
    ) {
        const { headers, samples } = body;
        if (!Array.isArray(headers) || headers.length === 0) {
            return { mapping: {}, confidence: 0, error: 'No headers provided' };
        }

        // Build a readable representation of the data for the AI
        const sampleRows = (samples || []).slice(0, 5);
        const tableText = [
            `Columns (0-indexed): ${headers.map((h, i) => `[${i}] "${h}"`).join(', ')}`,
            ...sampleRows.map((row, ri) => `Row ${ri + 1}: ${row.map((v, i) => `[${i}]="${v}"`).join(', ')}`),
        ].join('\n');

        const prompt = `You are a data field mapper. A user uploaded a CSV file and you need to identify which column corresponds to which contact field.

CSV data:
${tableText}

Map each column index to exactly one of these fields:
- "name"  — person's full name or first+last name
- "phone" — phone number (any format: local, international, with/without country code)
- "email" — email address
- "tags"  — labels, categories, or tags
- "skip"  — irrelevant, duplicate, or unknown column

Rules:
1. There must be exactly ONE "name" column. If there are separate first/last name columns, pick the one with fuller names or combine hint (prefer "full name" > "first name" > "last name").
2. There must be at most ONE "phone" column.
3. There must be at most ONE "email" column.
4. Look at the actual sample values, not just the header names.
5. If a column header is missing/empty but sample values look like phone numbers (digits, +, spaces), map it to "phone".
6. Return confidence between 0 and 1 for how sure you are.

Return ONLY valid JSON in this exact format:
{"mapping": {"0": "name", "1": "phone", "2": "email"}, "confidence": 0.95}`;

        // Fallback: heuristic mapping used if AI is unavailable or fails
        const heuristicMap = (): Record<string, string> => {
            const m: Record<string, string> = {};
            let nameSet = false;
            let phoneSet = false;
            let emailSet = false;
            headers.forEach((h, i) => {
                const hl = h.toLowerCase();
                if (!nameSet && (hl.includes('name') || hl.includes('full') || hl.includes('contact'))) {
                    m[String(i)] = 'name'; nameSet = true;
                } else if (!phoneSet && (hl.includes('phone') || hl.includes('mobile') || hl.includes('tel') || hl.includes('cell') || hl.includes('number'))) {
                    m[String(i)] = 'phone'; phoneSet = true;
                } else if (!emailSet && (hl.includes('email') || hl.includes('mail') || hl.includes('e-mail'))) {
                    m[String(i)] = 'email'; emailSet = true;
                } else if (hl.includes('tag') || hl.includes('label') || hl.includes('category')) {
                    m[String(i)] = 'tags';
                } else {
                    // Check sample values if header is ambiguous
                    const sampleVals = sampleRows.map(r => r[i] || '');
                    const looksLikePhone = sampleVals.some(v => /^[\+\d\s\-\(\)]{7,15}$/.test(v.trim()));
                    const looksLikeEmail = sampleVals.some(v => v.includes('@') && v.includes('.'));
                    if (!phoneSet && looksLikePhone) { m[String(i)] = 'phone'; phoneSet = true; }
                    else if (!emailSet && looksLikeEmail) { m[String(i)] = 'email'; emailSet = true; }
                    else { m[String(i)] = 'skip'; }
                }
            });
            // If no name column found, make first non-phone, non-email column the name
            if (!nameSet) {
                const firstSkip = Object.entries(m).find(([, v]) => v === 'skip');
                if (firstSkip) { m[firstSkip[0]] = 'name'; }
            }
            return m;
        };

        if (!this.ai.isAvailable()) {
            this.logger.warn('AI not available for field mapping — using heuristics');
            return { mapping: heuristicMap(), confidence: 0.6, source: 'heuristic' };
        }

        try {
            const schema = {
                type: 'object',
                properties: {
                    mapping: {
                        type: 'object',
                        additionalProperties: { type: 'string', enum: ['name', 'phone', 'email', 'tags', 'skip'] },
                    },
                    confidence: { type: 'number' },
                },
                required: ['mapping', 'confidence'],
            };

            const result = await this.ai.generateStructured<{ mapping: Record<string, string>; confidence: number }>(
                prompt, schema, { temperature: 0.1, maxTokens: 256 },
            );

            const mapping = result.data?.mapping ?? {};
            const confidence = result.data?.confidence ?? 0.8;

            // Validate: ensure exactly one name column exists
            const hasName = Object.values(mapping).includes('name');
            if (!hasName) {
                return { mapping: heuristicMap(), confidence: 0.5, source: 'heuristic_fallback' };
            }

            return { mapping, confidence, source: 'ai' };
        } catch (err: any) {
            this.logger.warn(`AI field mapping failed: ${err.message} — using heuristics`);
            return { mapping: heuristicMap(), confidence: 0.6, source: 'heuristic' };
        }
    }

    @Post('contacts/batch')
    @HttpCode(HttpStatus.CREATED)
    async batchCreateContacts(
        @Req() req: AuthRequest,
        @Body() body: { contacts: Array<Omit<PhonebookContact, 'id' | 'tenantId' | 'createdAt'>> },
    ) {
        if (!Array.isArray(body.contacts) || body.contacts.length === 0) return { created: 0, skipped: 0, total: 0 };
        const tid = this.tenantId(req);
        const now = Date.now();

        // Load existing from cache (or Firestore on first call)
        const existing = await this.loadContacts(tid);
        const pool: PhonebookContact[] = [...existing];
        const toCreate: PhonebookContact[] = [];
        let skipped = 0;

        for (const c of body.contacts) {
            if (!c.name?.trim()) { skipped++; continue; }
            if (this.isFullDuplicate(c, pool)) { skipped++; continue; }
            const id = `pb_${now}_${Math.random().toString(36).slice(2, 9)}`;
            const contact: any = {
                id,
                name: c.name,
                tags: c.tags ?? [],
                source: c.source ?? 'import',
                groupIds: c.groupIds ?? [],
                tenantId: tid,
                createdAt: now,
            };
            const normPhone = normalizePhone(c.phone);
            if (normPhone) contact.phone = normPhone;
            if (c.email) contact.email = c.email;
            toCreate.push(contact as PhonebookContact);
            pool.push(contact as PhonebookContact);
        }

        // Persist to in-memory cache immediately
        this._contactsCache.set(tid, [...toCreate, ...existing]);

        // Write-through to Firestore in background (non-blocking)
        void (async () => {
            const db = this.firebase.firestore();
            if (!db || toCreate.length === 0) return;
            try {
                for (let i = 0; i < toCreate.length; i += 400) {
                    const chunk = toCreate.slice(i, i + 400);
                    const batch = db.batch();
                    const col = db.collection('tenants').doc(tid).collection('phonebookContacts');
                    for (const contact of chunk) batch.set(col.doc(contact.id), contact);
                    await batch.commit();
                }
            } catch (err: any) {
                this.logger.warn(`Firestore batch write failed for ${tid}: ${err.message}`);
            }
        })();

        this.logger.log(`Phonebook: batch-imported ${toCreate.length} contacts, skipped ${skipped} for tenant ${tid}`);
        return { created: toCreate.length, skipped, total: body.contacts.length };
    }

    @Put('contacts/:id')
    async updateContact(
        @Req() req: AuthRequest,
        @Param('id') id: string,
        @Body() body: Partial<PhonebookContact>,
    ) {
        const tid = this.tenantId(req);
        delete (body as any).id;
        delete (body as any).tenantId;
        if (body.phone) body.phone = normalizePhone(body.phone);
        const contacts = await this.loadContacts(tid);
        const idx = contacts.findIndex(c => c.id === id);
        const updated = idx >= 0
            ? { ...contacts[idx], ...body, updatedAt: Date.now() }
            : { id, ...body, updatedAt: Date.now() } as any;
        if (idx >= 0) contacts[idx] = updated; else contacts.unshift(updated);
        this._contactsCache.set(tid, contacts);
        void this.fsWriteContact(tid, updated);
        return updated;
    }

    @Delete('contacts/:id')
    async deleteContact(@Req() req: AuthRequest, @Param('id') id: string) {
        const tid = this.tenantId(req);
        const contacts = await this.loadContacts(tid);
        const filtered = contacts.filter(c => c.id !== id);

        try {
            await this.fsDeleteContact(tid, id);
        } catch (err: any) {
            this.logger.error(`Firestore contact delete failed for ${id}: ${err.message}`);
            throw err;
        }

        this._contactsCache.set(tid, filtered);

        // Remove from all groups in cache
        const groups = await this.loadGroups(tid);
        for (const g of groups) {
            if (g.contactIds.includes(id)) {
                g.contactIds = g.contactIds.filter(cid => cid !== id);
                void this.fsWriteGroup(tid, g);
            }
        }
        return { success: true };
    }

    // ─── Groups ────────────────────────────────────────────────────────────

    @Get('groups')
    async getGroups(@Req() req: AuthRequest) {
        const tid = this.tenantId(req);
        return this.loadGroups(tid);
    }

    @Post('groups')
    @HttpCode(HttpStatus.CREATED)
    async createGroup(
        @Req() req: AuthRequest,
        @Body() body: { name: string; description?: string; contactIds?: string[]; color?: string },
    ) {
        const tid = this.tenantId(req);
        const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const group: PhonebookGroup = {
            id,
            name: body.name,
            description: body.description,
            contactIds: body.contactIds ?? [],
            color: body.color ?? 'from-violet-500 to-purple-600',
            tenantId: tid,
        } as any;
        const groups = await this.loadGroups(tid);
        this._groupsCache.set(tid, [group, ...groups]);
        void this.fsWriteGroup(tid, group);
        return group;
    }

    @Put('groups/:id')
    async updateGroup(
        @Req() req: AuthRequest,
        @Param('id') id: string,
        @Body() body: Partial<PhonebookGroup>,
    ) {
        const tid = this.tenantId(req);
        delete (body as any).id;
        delete (body as any).tenantId;
        const groups = await this.loadGroups(tid);
        const idx = groups.findIndex(g => g.id === id);
        const updated = idx >= 0 ? { ...groups[idx], ...body } : { id, ...body } as any;
        if (idx >= 0) groups[idx] = updated; else groups.unshift(updated);
        this._groupsCache.set(tid, groups);
        void this.fsWriteGroup(tid, updated);
        return updated;
    }

    @Delete('groups/:id')
    async deleteGroup(@Req() req: AuthRequest, @Param('id') id: string) {
        const tid = this.tenantId(req);
        const groups = await this.loadGroups(tid);
        this._groupsCache.set(tid, groups.filter(g => g.id !== id));
        void this.fsDeleteGroup(tid, id);
        return { success: true };
    }

    // ─── Broadcast ────────────────────────────────────────────────────────

    @Post('broadcast')
    @HttpCode(HttpStatus.OK)
    async sendBroadcast(
        @Req() req: AuthRequest,
        @Body() body: {
            channel: 'whatsapp' | 'sms' | 'email';
            recipients: Array<{ id: string; name: string; phone?: string; email?: string }>;
            message: string;
            subject?: string;
        },
    ) {
        const tenantId = this.tenantId(req);
        if (!body.message?.trim()) return { success: false, error: 'Message cannot be empty.' };
        if (!body.recipients?.length) return { success: false, error: 'No recipients selected.' };

        if (body.channel === 'whatsapp') {
            const waRecipients = body.recipients
                .filter(r => r.phone?.trim())
                .map(r => ({ phone: r.phone!, name: r.name }));

            if (waRecipients.length === 0) {
                return { success: false, error: 'None of the selected contacts have a phone number.' };
            }

            try {
                const result = await this.channelsService.broadcastWhatsApp(tenantId, waRecipients, body.message);
                return {
                    success: result.sent > 0,
                    sent: result.sent,
                    failed: result.failed,
                    results: result.results,
                    error: result.sent === 0 ? result.results[0]?.error : undefined,
                };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        }

        if (body.channel === 'sms') {
            const smsRecipients = body.recipients.filter(r => r.phone?.trim()).map(r => ({ phone: r.phone!, name: r.name }));
            if (smsRecipients.length === 0) return { success: false, error: 'None of the selected contacts have a phone number.' };
            try {
                const result = await this.channelsService.broadcastSMS(tenantId, smsRecipients, body.message);
                return { success: result.sent > 0, sent: result.sent, failed: result.failed, error: result.sent === 0 ? result.results[0]?.error : undefined };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        }

        if (body.channel === 'email') {
            const emailRecipients = body.recipients.filter(r => r.email?.trim()).map(r => ({ email: r.email!, name: r.name }));
            if (emailRecipients.length === 0) return { success: false, error: 'None of the selected contacts have an email address.' };
            try {
                const result = await this.channelsService.broadcastEmail(tenantId, emailRecipients, body.message, body.subject || 'Message from Flyn');
                return { success: result.sent > 0, sent: result.sent, failed: result.failed, error: result.sent === 0 ? result.results[0]?.error : undefined };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        }

        return { success: false, error: 'Unsupported channel type.' };
    }
}
