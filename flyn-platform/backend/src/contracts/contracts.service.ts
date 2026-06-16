/**
 * Contracts Service — NocoBase Backend
 *
 * Persistent storage via the shared NocoBaseService.
 * Implements the full contract lifecycle: create → send → sign → complete.
 *
 * Collections:
 *   flyn_contracts           — Contract records
 *   flyn_contract_signers    — Signer records
 *   flyn_contract_signatures — Signature records
 *   flyn_contract_templates  — Template records
 *   flyn_contract_events     — Audit trail
 */

import { Injectable, Logger } from '@nestjs/common';
import { NocoBaseService } from '../nocobase/nocobase.service';
import { MailService } from '../mail/mail.service';
import { ChannelsService } from '../channels/channels.service';
import {
    Contract, ContractCreateDto, ContractUpdateDto, ContractStatus, ContractType,
    Signer, SignerCreateDto, SignerStatus,
    Signature, SignatureCreateDto,
    ContractTemplate, TemplateCreateDto,
    ContractEvent, ContractEventType,
    ContractDashboardStats,
} from './contracts.types';
import * as crypto from 'crypto';
import { encryptContractData, decryptContractData, hashContractFingerprint } from './contracts-encryption.util';

const COL_CONTRACTS  = 'flyn_contracts';
const COL_SIGNERS    = 'flyn_contract_signers';
const COL_SIGNATURES = 'flyn_contract_signatures';
const COL_TEMPLATES  = 'flyn_contract_templates';
const COL_EVENTS     = 'flyn_contract_events';

// ── In-memory fallback ──────────────────────────────────────────────────────
const _contracts:  Contract[]         = [];
const _signers:    Signer[]           = [];
const _signatures: Signature[]        = [];
const _templates:  ContractTemplate[] = [];
const _events:     ContractEvent[]    = [];
function mkId() { return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function generateToken() { return crypto.randomBytes(32).toString('hex'); }

// ── Default Templates ───────────────────────────────────────────────────────
const DEFAULT_TEMPLATES: Omit<ContractTemplate, '_id' | 'createdAt' | 'updatedAt'>[] = [
    {
        name: 'Non-Disclosure Agreement (NDA)',
        type: 'nda',
        isDefault: true,
        variables: ['party1Name', 'party2Name', 'effectiveDate', 'duration', 'jurisdiction'],
        htmlTemplate: `<h1>NON-DISCLOSURE AGREEMENT</h1>
<p>This Non-Disclosure Agreement ("Agreement") is entered into as of <strong>{{effectiveDate}}</strong> by and between:</p>
<p><strong>Disclosing Party:</strong> {{party1Name}}<br/><strong>Receiving Party:</strong> {{party2Name}}</p>
<h2>1. Confidential Information</h2>
<p>The Receiving Party agrees to hold in confidence all information, documents, and materials provided by the Disclosing Party.</p>
<h2>2. Duration</h2>
<p>This Agreement shall remain in effect for {{duration}} from the effective date.</p>
<h2>3. Governing Law</h2>
<p>This Agreement shall be governed by the laws of {{jurisdiction}}.</p>
<div class="signature-block"><p>Signature: _________________________</p><p>Date: _________________________</p></div>`,
    },
    {
        name: 'Employment Contract',
        type: 'employment',
        isDefault: true,
        variables: ['employeeName', 'employerName', 'position', 'startDate', 'salary', 'currency'],
        htmlTemplate: `<h1>EMPLOYMENT CONTRACT</h1>
<p>This Employment Contract is entered into between <strong>{{employerName}}</strong> ("Employer") and <strong>{{employeeName}}</strong> ("Employee").</p>
<h2>1. Position</h2>
<p>The Employee shall serve as <strong>{{position}}</strong> commencing on <strong>{{startDate}}</strong>.</p>
<h2>2. Compensation</h2>
<p>The Employee shall receive an annual salary of <strong>{{currency}} {{salary}}</strong>, payable in accordance with the Employer's standard payroll schedule.</p>
<h2>3. Terms</h2>
<p>This employment is at-will and may be terminated by either party with 30 days written notice.</p>
<div class="signature-block"><p>Employer Signature: _________________________</p><p>Employee Signature: _________________________</p></div>`,
    },
    {
        name: 'Freelancer Agreement',
        type: 'freelance',
        isDefault: true,
        variables: ['freelancerName', 'clientName', 'projectTitle', 'projectValue', 'currency', 'deadline', 'milestones'],
        htmlTemplate: `<h1>FREELANCER SERVICE AGREEMENT</h1>
<p>This Agreement is between <strong>{{clientName}}</strong> ("Client") and <strong>{{freelancerName}}</strong> ("Freelancer").</p>
<h2>1. Project</h2>
<p><strong>Project:</strong> {{projectTitle}}<br/><strong>Deadline:</strong> {{deadline}}</p>
<h2>2. Compensation</h2>
<p>The Client shall pay {{currency}} {{projectValue}} upon completion. Milestones: {{milestones}}</p>
<h2>3. Intellectual Property</h2>
<p>All work product shall be transferred to the Client upon full payment.</p>
<div class="signature-block"><p>Client Signature: _________________________</p><p>Freelancer Signature: _________________________</p></div>`,
    },
    {
        name: 'Sales Agreement',
        type: 'sales',
        isDefault: true,
        variables: ['sellerName', 'buyerName', 'productDescription', 'totalValue', 'currency', 'paymentTerms'],
        htmlTemplate: `<h1>SALES AGREEMENT</h1>
<p>This Sales Agreement is entered into between <strong>{{sellerName}}</strong> ("Seller") and <strong>{{buyerName}}</strong> ("Buyer").</p>
<h2>1. Product / Service</h2>
<p>{{productDescription}}</p>
<h2>2. Price & Payment</h2>
<p>Total: {{currency}} {{totalValue}}. Payment terms: {{paymentTerms}}.</p>
<h2>3. Delivery</h2>
<p>Products/services shall be delivered within the agreed timeline.</p>
<div class="signature-block"><p>Seller Signature: _________________________</p><p>Buyer Signature: _________________________</p></div>`,
    },
];

// ── Mappers ─────────────────────────────────────────────────────────────────
function mapContract(r: any): Contract {
    return {
        _id: String(r.id ?? r._id ?? mkId()),
        organizationId: r.organizationId ?? r.organization_id,
        templateId: r.templateId ?? r.template_id,
        title: r.title ?? '',
        type: r.type ?? 'custom',
        status: r.status ?? 'draft',
        content: r.content ?? '',
        fileUrl: r.fileUrl ?? r.file_url,
        metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : undefined,
        sourceModule: r.sourceModule ?? r.source_module,
        sourceEntityId: r.sourceEntityId ?? r.source_entity_id,
        expiresAt: r.expiresAt ?? r.expires_at,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
    };
}
function mapSigner(r: any): Signer {
    return {
        _id: String(r.id ?? r._id ?? mkId()),
        contractId: String(r.contractId ?? r.contract_id ?? ''),
        name: r.name ?? '',
        email: r.email ?? '',
        phone: r.phone,
        role: r.role ?? 'client',
        order: r.order ?? 1,
        status: r.status ?? 'pending',
        signingToken: r.signingToken ?? r.signing_token,
        tokenExpiresAt: r.tokenExpiresAt ?? r.token_expires_at,
        signedAt: r.signedAt ?? r.signed_at,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    };
}
function mapSignature(r: any): Signature {
    return {
        _id: String(r.id ?? r._id ?? mkId()),
        contractId: String(r.contractId ?? r.contract_id ?? ''),
        signerId: String(r.signerId ?? r.signer_id ?? ''),
        signatureData: r.signatureData ?? r.signature_data ?? '',
        method: r.method ?? 'type',
        signedAt: r.signedAt ? new Date(r.signedAt) : new Date(),
        ipAddress: r.ipAddress ?? r.ip_address,
        userAgent: r.userAgent ?? r.user_agent,
    };
}
function mapTemplate(r: any): ContractTemplate {
    return {
        _id: String(r.id ?? r._id ?? mkId()),
        organizationId: r.organizationId ?? r.organization_id,
        name: r.name ?? '',
        type: r.type ?? 'custom',
        htmlTemplate: r.htmlTemplate ?? r.html_template ?? '',
        variables: r.variables ? (typeof r.variables === 'string' ? JSON.parse(r.variables) : r.variables) : [],
        isDefault: r.isDefault ?? r.is_default ?? false,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
    };
}
function mapEvent(r: any): ContractEvent {
    return {
        _id: String(r.id ?? r._id ?? mkId()),
        contractId: String(r.contractId ?? r.contract_id ?? ''),
        type: r.type ?? 'contract.created',
        actorId: r.actorId ?? r.actor_id,
        actorName: r.actorName ?? r.actor_name,
        payload: r.payload ? (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) : undefined,
        ipAddress: r.ipAddress ?? r.ip_address,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    };
}

@Injectable()
export class ContractsService {
    private readonly logger = new Logger(ContractsService.name);

    constructor(
        private readonly nc: NocoBaseService,
        private readonly mail: MailService,
        private readonly channels: ChannelsService,
    ) {}

    // ── Contracts ────────────────────────────────────────────────────────────

    async createContract(dto: ContractCreateDto): Promise<Contract> {
        let content = dto.content ?? '';

        // If templateId provided, render from template
        if (dto.templateId) {
            const template = await this.getTemplateById(dto.templateId);
            if (template) {
                content = this.renderTemplate(template.htmlTemplate, dto.templateVariables ?? {});
            }
        }

        const contractData: any = {
            title: dto.title,
            type: dto.type ?? 'custom',
            status: 'draft' as ContractStatus,
            content,
            organizationId: dto.organizationId,
            templateId: dto.templateId,
            sourceModule: dto.sourceModule,
            sourceEntityId: dto.sourceEntityId,
            expiresAt: dto.expiresAt,
        };

        let contract: Contract;
        if (!this.nc.isConnected) {
            contract = { ...mapContract({ ...contractData, _id: mkId() }) };
            _contracts.push(contract);
            this.logger.warn(`[fallback] Contract in memory: ${contract.title}`);
        } else {
            const raw = await this.nc.create(COL_CONTRACTS, contractData);
            if (!raw) {
                contract = mapContract({ ...contractData, _id: mkId() });
                _contracts.push(contract);
            } else {
                contract = mapContract(raw);
            }
        }

        const contractId = contract._id;

        // Add signers if provided
        if (dto.signers && dto.signers.length > 0) {
            for (let i = 0; i < dto.signers.length; i++) {
                await this.addSigner(contractId, { ...dto.signers[i], order: dto.signers[i].order ?? i + 1 });
            }
        }

        // Audit trail
        await this.logEvent(contract._id, 'contract.created', undefined, undefined, { type: contract.type, sourceModule: contract.sourceModule });

        this.logger.log(`Contract created: ${contract._id} — ${contract.title}`);
        return contract;
    }

    async updateContract(id: string, dto: ContractUpdateDto): Promise<Contract | null> {
        if (!this.nc.isConnected) {
            const idx = _contracts.findIndex(c => c._id === id);
            if (idx === -1) return null;
            _contracts[idx] = { ..._contracts[idx], ...dto, updatedAt: new Date() };
            return _contracts[idx];
        }
        const raw = await this.nc.update(COL_CONTRACTS, id, { ...dto, updatedAt: new Date().toISOString() });
        return raw ? mapContract(raw) : null;
    }

    async getContracts(filters: { status?: string; type?: string; sourceModule?: string; limit?: number } = {}): Promise<{ data: Contract[]; total: number }> {
        if (!this.nc.isConnected) {
            let result = [..._contracts];
            if (filters.status) result = result.filter(c => c.status === filters.status);
            if (filters.type) result = result.filter(c => c.type === filters.type);
            if (filters.sourceModule) result = result.filter(c => c.sourceModule === filters.sourceModule);
            return { data: result.slice(0, filters.limit ?? 100), total: result.length };
        }
        const ncFilter: Record<string, unknown> = {};
        if (filters.status) ncFilter['status'] = { $eq: filters.status };
        if (filters.type) ncFilter['type'] = { $eq: filters.type };
        if (filters.sourceModule) ncFilter['sourceModule'] = { $eq: filters.sourceModule };
        const result = await this.nc.list<any>(COL_CONTRACTS, { pageSize: filters.limit ?? 100, filter: ncFilter });
        if (!result) {
            let r = [..._contracts];
            if (filters.status) r = r.filter(c => c.status === filters.status);
            if (filters.type) r = r.filter(c => c.type === filters.type);
            return { data: r.slice(0, filters.limit ?? 100), total: r.length };
        }
        return { data: result.data.map(mapContract), total: result.total };
    }

    async getContractById(id: string): Promise<Contract | null> {
        if (!this.nc.isConnected) return _contracts.find(c => c._id === id) ?? null;
        const raw = await this.nc.get<any>(COL_CONTRACTS, id);
        return raw ? mapContract(raw) : null;
    }

    async deleteContract(id: string): Promise<boolean> {
        if (!this.nc.isConnected) {
            const idx = _contracts.findIndex(c => c._id === id);
            if (idx === -1) return false;
            _contracts.splice(idx, 1);
            return true;
        }
        return this.nc.destroy(COL_CONTRACTS, id);
    }

    // ── Signers ─────────────────────────────────────────────────────────────

    async addSigner(contractId: string, dto: SignerCreateDto): Promise<Signer> {
        const token = generateToken();
        const tokenExpiry = new Date(Date.now() + 7 * 86400000).toISOString(); // 7 days

        const signerData: any = {
            contractId,
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            role: dto.role ?? 'client',
            order: dto.order ?? 1,
            status: 'pending' as SignerStatus,
            signingToken: token,
            tokenExpiresAt: tokenExpiry,
        };

        if (!this.nc.isConnected) {
            const signer = mapSigner({ ...signerData, _id: mkId() });
            _signers.push(signer);
            return signer;
        }
        const raw = await this.nc.create(COL_SIGNERS, signerData);
        if (!raw) {
            const signer = mapSigner({ ...signerData, _id: mkId() });
            _signers.push(signer);
            return signer;
        }
        const signer = mapSigner(raw);
        await this.logEvent(contractId, 'signer.added', undefined, dto.name, { email: dto.email, role: dto.role });
        return signer;
    }

    async getSigners(contractId: string): Promise<Signer[]> {
        if (!this.nc.isConnected) return _signers.filter(s => s.contractId === contractId).sort((a, b) => a.order - b.order);
        const result = await this.nc.list<any>(COL_SIGNERS, { filter: { contractId: { $eq: contractId } }, pageSize: 50 });
        if (!result) return _signers.filter(s => s.contractId === contractId);
        return result.data.map(mapSigner).sort((a, b) => a.order - b.order);
    }

    // ── Signing Flow ────────────────────────────────────────────────────────

    async sendContract(contractId: string): Promise<Contract | null> {
        const contract = await this.getContractById(contractId);
        if (!contract || contract.status !== 'draft') return null;

        const updated = await this.updateContract(contractId, { status: 'sent' });
        if (updated) {
            const signers = await this.getSigners(contractId);
            const publicUrl = process.env.PUBLIC_APP_URL || 'https://app.myflynai.com';
            
            for (const signer of signers) {
                const signUrl = `${publicUrl}/sign/${contractId}?token=${signer.signingToken}`;
                
                // 1. Send Email
                this.mail.sendContractInvite(
                    signer.email,
                    signer.name,
                    contract.title,
                    signUrl
                ).catch(err => this.logger.error(`Failed to send contract email to ${signer.email}: ${err.message}`));

                // 2. Send WhatsApp (if phone available)
                if (signer.phone) {
                    const waMessage = `Hello ${signer.name}, you have been requested to sign the document: "${contract.title}". Please review and sign here: ${signUrl}`;
                    this.channels.broadcastWhatsApp(
                        contract.organizationId,
                        [{ phone: signer.phone, name: signer.name }],
                        waMessage
                    ).catch(err => this.logger.error(`Failed to send contract WhatsApp to ${signer.phone}: ${err.message}`));
                }

                this.logger.log(`[Contract Send] Notified ${signer.email} for contract ${contractId}`);
                await this.logEvent(contractId, 'signer.notified', undefined, signer.name, { email: signer.email });
            }
            await this.logEvent(contractId, 'contract.sent');
        }
        return updated;
    }

    async signContract(dto: SignatureCreateDto): Promise<{ success: boolean; contract?: Contract; error?: string }> {
        // Validate signing token
        const signers = await this.getSigners(dto.contractId);
        const signer = signers.find(s => s._id === dto.signerId && s.signingToken === dto.signingToken);

        if (!signer) return { success: false, error: 'Invalid signer or signing token' };
        if (signer.status === 'signed') return { success: false, error: 'Already signed' };
        if (signer.tokenExpiresAt && new Date(signer.tokenExpiresAt) < new Date()) {
            return { success: false, error: 'Signing link has expired' };
        }

        // Store signature
        const signatureData: any = {
            contractId: dto.contractId,
            signerId: dto.signerId,
            signatureData: dto.signatureData,
            method: dto.method,
            signedAt: new Date().toISOString(),
            ipAddress: dto.ipAddress,
            userAgent: dto.userAgent,
        };

        if (!this.nc.isConnected) {
            _signatures.push(mapSignature({ ...signatureData, _id: mkId() }));
        } else {
            await this.nc.create(COL_SIGNATURES, signatureData);
        }

        // Update signer status
        if (!this.nc.isConnected) {
            const idx = _signers.findIndex(s => s._id === dto.signerId);
            if (idx !== -1) {
                _signers[idx].status = 'signed';
                _signers[idx].signedAt = new Date().toISOString();
            }
        } else {
            await this.nc.update(COL_SIGNERS, dto.signerId, { status: 'signed', signedAt: new Date().toISOString() });
        }

        await this.logEvent(dto.contractId, 'signature.captured', dto.signerId, signer.name, {
            method: dto.method,
            ipAddress: dto.ipAddress,
        });

        // Check if all signers have signed
        const updatedSigners = await this.getSigners(dto.contractId);
        const allSigned = updatedSigners.every(s => s.status === 'signed');

        if (allSigned) {
            await this.updateContract(dto.contractId, { status: 'signed' });
            await this.logEvent(dto.contractId, 'contract.signed');
            this.logger.log(`Contract ${dto.contractId} fully signed by all parties`);
        }

        const contract = await this.getContractById(dto.contractId);
        return { success: true, contract: contract ?? undefined };
    }

    async voidContract(contractId: string): Promise<Contract | null> {
        const updated = await this.updateContract(contractId, { status: 'voided' });
        if (updated) {
            await this.logEvent(contractId, 'contract.voided');
        }
        return updated;
    }

    // ── Templates ───────────────────────────────────────────────────────────

    async getTemplates(type?: ContractType): Promise<ContractTemplate[]> {
        if (!this.nc.isConnected) {
            let result = [..._templates];
            if (type) result = result.filter(t => t.type === type);
            return result;
        }
        const ncFilter: Record<string, unknown> = {};
        if (type) ncFilter['type'] = { $eq: type };
        const result = await this.nc.list<any>(COL_TEMPLATES, { filter: ncFilter, pageSize: 100 });
        if (!result) return type ? _templates.filter(t => t.type === type) : [..._templates];
        return result.data.map(mapTemplate);
    }

    async getTemplateById(id: string): Promise<ContractTemplate | null> {
        if (!this.nc.isConnected) return _templates.find(t => t._id === id) ?? null;
        const raw = await this.nc.get<any>(COL_TEMPLATES, id);
        return raw ? mapTemplate(raw) : null;
    }

    async createTemplate(dto: TemplateCreateDto): Promise<ContractTemplate> {
        const data: any = {
            name: dto.name,
            type: dto.type,
            htmlTemplate: dto.htmlTemplate,
            variables: JSON.stringify(dto.variables ?? []),
            isDefault: dto.isDefault ?? false,
            organizationId: dto.organizationId,
        };

        if (!this.nc.isConnected) {
            const t = mapTemplate({ ...data, _id: mkId() });
            _templates.push(t);
            return t;
        }
        const raw = await this.nc.create(COL_TEMPLATES, data);
        if (!raw) {
            const t = mapTemplate({ ...data, _id: mkId() });
            _templates.push(t);
            return t;
        }
        return mapTemplate(raw);
    }

    // ── Events (Audit Trail) ────────────────────────────────────────────────

    async logEvent(
        contractId: string,
        type: ContractEventType,
        actorId?: string,
        actorName?: string,
        payload?: Record<string, unknown>,
        ipAddress?: string,
    ): Promise<ContractEvent> {
        const eventData: any = {
            contractId,
            type,
            actorId,
            actorName,
            payload: payload ? JSON.stringify(payload) : null,
            ipAddress,
        };

        if (!this.nc.isConnected) {
            const ev = mapEvent({ ...eventData, _id: mkId() });
            _events.push(ev);
            return ev;
        }
        const raw = await this.nc.create(COL_EVENTS, eventData);
        if (!raw) {
            const ev = mapEvent({ ...eventData, _id: mkId() });
            _events.push(ev);
            return ev;
        }
        return mapEvent(raw);
    }

    async getEvents(contractId: string): Promise<ContractEvent[]> {
        if (!this.nc.isConnected) return _events.filter(e => e.contractId === contractId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const result = await this.nc.list<any>(COL_EVENTS, { filter: { contractId: { $eq: contractId } }, pageSize: 100, sort: '-id' });
        if (!result) return _events.filter(e => e.contractId === contractId);
        return result.data.map(mapEvent);
    }

    // ── Dashboard Stats ─────────────────────────────────────────────────────

    async getDashboardStats(): Promise<ContractDashboardStats> {
        const { data: contracts } = await this.getContracts({ limit: 1000 });
        const allEvents = !this.nc.isConnected ? [..._events] : [];

        if (this.nc.isConnected) {
            const evResult = await this.nc.list<any>(COL_EVENTS, { pageSize: 20, sort: '-id' });
            if (evResult) allEvents.push(...evResult.data.map(mapEvent));
        }

        const statusMap: Record<string, number> = {};
        const typeMap: Record<string, number> = {};
        for (const c of contracts) {
            statusMap[c.status] = (statusMap[c.status] || 0) + 1;
            typeMap[c.type] = (typeMap[c.type] || 0) + 1;
        }

        return {
            totalContracts: contracts.length,
            draftCount: statusMap['draft'] || 0,
            sentCount: statusMap['sent'] || 0,
            signedCount: statusMap['signed'] || 0,
            declinedCount: statusMap['declined'] || 0,
            expiredCount: statusMap['expired'] || 0,
            recentEvents: allEvents.slice(0, 10),
            statusBreakdown: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
            typeBreakdown: Object.entries(typeMap).map(([type, count]) => ({ type, count })),
        };
    }

    // ── Template Rendering ──────────────────────────────────────────────────

    private renderTemplate(html: string, variables: Record<string, string>): string {
        let rendered = html;
        for (const [key, value] of Object.entries(variables)) {
            rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
        }
        return rendered;
    }

    // ── Seed Demo Data ──────────────────────────────────────────────────────

    async seedDemoData(): Promise<{ contracts: number; templates: number; signers: number }> {
        const existing = await this.getContracts({ limit: 1 });
        if (existing.total > 0) {
            this.logger.log('Contract data already seeded, skipping.');
            return { contracts: 0, templates: 0, signers: 0 };
        }

        this.logger.log('Seeding contracts demo data...');

        // Seed default templates
        let templateCount = 0;
        const existingTemplates = await this.getTemplates();
        if (existingTemplates.length === 0) {
            for (const tmpl of DEFAULT_TEMPLATES) {
                await this.createTemplate({
                    name: tmpl.name,
                    type: tmpl.type,
                    htmlTemplate: tmpl.htmlTemplate,
                    variables: tmpl.variables,
                    isDefault: tmpl.isDefault,
                });
                templateCount++;
            }
        }

        // Seed demo contracts
        const contractsData: ContractCreateDto[] = [];

        let contractCount = 0;
        let signerCount = 0;
        for (const dto of contractsData) {
            const c = await this.createContract(dto);
            contractCount++;
            signerCount += dto.signers?.length ?? 0;

            // Mark second contract as signed for demo variety
            if (contractCount === 2) {
                await this.updateContract(c._id, { status: 'signed' });
            }
            if (contractCount === 4) {
                await this.updateContract(c._id, { status: 'sent' });
            }
        }

        this.logger.log(`Contracts seed complete: ${contractCount} contracts, ${templateCount} templates, ${signerCount} signers`);
        return { contracts: contractCount, templates: templateCount, signers: signerCount };
    }
}
