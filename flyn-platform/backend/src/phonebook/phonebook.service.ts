import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

export interface PhonebookContact {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    tags?: string[];
    source?: 'manual' | 'crm' | 'import';
    groupIds?: string[];
    tenantId?: string;
    createdAt?: number;
    notes?: string;
    group?: string;
}

@Injectable()
export class PhonebookService {
    private readonly logger = new Logger(PhonebookService.name);
    private readonly _contactsCache = new Map<string, PhonebookContact[]>();

    constructor(private readonly firebase: FirebaseService) {}

    private contactsCol(tenantId: string) {
        const db = this.firebase.firestore();
        if (!db) return null;
        return db.collection('tenants').doc(tenantId).collection('phonebookContacts');
    }

    async loadContacts(tenantId: string): Promise<PhonebookContact[]> {
        if (this._contactsCache.has(tenantId)) return this._contactsCache.get(tenantId)!;
        const col = this.contactsCol(tenantId);
        if (col) {
            try {
                const snap = await col.orderBy('createdAt', 'desc').get();
                const contacts = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as PhonebookContact));
                this._contactsCache.set(tenantId, contacts);
                return contacts;
            } catch (err: any) {
                this.logger.warn(`Firestore contacts load failed for ${tenantId}: ${err.message}`);
            }
        }
        this._contactsCache.set(tenantId, []);
        return [];
    }

    async createContact(tenantId: string, data: Partial<PhonebookContact>): Promise<PhonebookContact> {
        const contacts = await this.loadContacts(tenantId);
        
        // Basic dedup
        const name = data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim();
        if (!name) throw new Error('Contact name is required');

        const id = `pb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const contact: PhonebookContact = {
            id,
            name,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            email: data.email,
            tags: data.tags ?? [],
            source: data.source ?? 'manual',
            groupIds: data.groupIds ?? [],
            tenantId,
            createdAt: Date.now(),
            notes: data.notes,
            group: data.group,
        };

        const col = this.contactsCol(tenantId);
        if (col) {
            await col.doc(id).set(contact);
        }

        this._contactsCache.set(tenantId, [contact, ...contacts]);
        return contact;
    }

    async updateContact(tenantId: string, contactId: string, data: Partial<PhonebookContact>): Promise<PhonebookContact> {
        const contacts = await this.loadContacts(tenantId);
        const idx = contacts.findIndex(c => c.id === contactId);
        if (idx === -1) throw new NotFoundException(`Contact ${contactId} not found`);

        const updated = { ...contacts[idx], ...data, updatedAt: Date.now() };
        const col = this.contactsCol(tenantId);
        if (col) {
            await col.doc(contactId).update(data as any);
        }

        contacts[idx] = updated;
        this._contactsCache.set(tenantId, contacts);
        return updated;
    }

    async getContacts(tenantId: string): Promise<PhonebookContact[]> {
        return this.loadContacts(tenantId);
    }

    async deleteContact(tenantId: string, contactId: string): Promise<void> {
        const contacts = await this.loadContacts(tenantId);
        this._contactsCache.set(tenantId, contacts.filter(c => c.id !== contactId));
        
        const col = this.contactsCol(tenantId);
        if (col) {
            await col.doc(contactId).delete();
        }
    }
}
