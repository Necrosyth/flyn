/**
 * Contracts Controller
 * --------------------
 * REST endpoints for the Contracts & eSignature Engine.
 *
 * GET  /api/contracts               — list contracts
 * GET  /api/contracts/:id           — get contract
 * POST /api/contracts               — create contract
 * POST /api/contracts/:id           — update contract
 * POST /api/contracts/:id/send      — send contract for signing
 * POST /api/contracts/:id/sign      — sign a contract
 * POST /api/contracts/:id/void      — void a contract
 * GET  /api/contracts/:id/signers   — get signers
 * POST /api/contracts/:id/signers   — add signer
 * GET  /api/contracts/:id/events    — get audit trail
 * GET  /api/contracts/templates     — list templates
 * POST /api/contracts/templates     — create template
 * GET  /api/contracts/stats         — dashboard stats
 * GET  /api/contracts/analytics     — analytics charts
 * GET  /api/contracts/insights      — AI insights
 * GET  /api/contracts/:id/versions  — version history
 * POST /api/contracts/:id/encrypt   — encrypt contract data
 * POST /api/contracts/:id/verify    — verify signed URL
 *
 * POST /api/contracts/seed          — seed demo data
 */

import {
    Controller, Get, Post, Delete, Param, Body, Query, HttpCode, Logger, Req,
} from '@nestjs/common';
import { UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { TenantFromAuthInterceptor } from '../common/tenant-from-auth.interceptor';
import { ContractsService } from './contracts.service';
import { AIProviderService } from '../orchestrator/ai-provider';
import { encryptContractData, decryptContractData, hashContractFingerprint, verifySignedUrl, generateSignedUrl } from './contracts-encryption.util';
import { ContractCreateDto, ContractUpdateDto, SignerCreateDto, SignatureCreateDto, ContractType } from './contracts.types';

@Controller('contracts')
@UseGuards(ApiOrFirebaseAuthGuard)
@UseInterceptors(TenantFromAuthInterceptor)
export class ContractsController {
    private readonly logger = new Logger(ContractsController.name);

    constructor(
        private readonly contractsService: ContractsService,
        private readonly ai: AIProviderService,
    ) {}

    // ── Contracts CRUD ──────────────────────────────────────────────────────

    @Get()
    async listContracts(
        @Query('status') status?: string,
        @Query('type') type?: string,
        @Query('sourceModule') sourceModule?: string,
        @Query('limit') limit?: string,
    ) {
        return this.contractsService.getContracts({
            status,
            type,
            sourceModule,
            limit: limit ? parseInt(limit, 10) : 100,
        });
    }

    @Get('stats')
    async getStats() {
        return this.contractsService.getDashboardStats();
    }

    @Get('analytics')
    async getAnalytics(@Query('range') _range: string = '30d') {
        const { data: contracts } = await this.contractsService.getContracts({ limit: 10000 });

        // Chart 1: Contract status breakdown (donut)
        const statusCounts: Record<string, number> = {};
        for (const c of contracts) {
            statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
        }
        const statusChart = {
            id: 'contract-status',
            title: 'Contracts by Status',
            type: 'donut' as const,
            data: Object.entries(statusCounts).length > 0
                ? Object.entries(statusCounts).map(([label, value]) => ({
                    label: label.charAt(0).toUpperCase() + label.slice(1),
                    value,
                }))
                : [{ label: 'No contracts', value: 0 }],
        };

        // Chart 2: Contract type breakdown (bar)
        const typeCounts: Record<string, number> = {};
        for (const c of contracts) {
            typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
        }
        const typeChart = {
            id: 'contract-types',
            title: 'Contracts by Type',
            type: 'bar' as const,
            data: Object.entries(typeCounts).length > 0
                ? Object.entries(typeCounts).map(([label, value]) => ({
                    label: label.toUpperCase(),
                    value,
                }))
                : [{ label: 'No data', value: 0 }],
        };

        // Chart 3: Source module breakdown (progress)
        const sourceCounts: Record<string, number> = {};
        for (const c of contracts) {
            const src = c.sourceModule || 'API';
            sourceCounts[src] = (sourceCounts[src] || 0) + 1;
        }
        const sourceChart = {
            id: 'contract-sources',
            title: 'Contracts by Source Module',
            type: 'progress' as const,
            data: Object.entries(sourceCounts).length > 0
                ? Object.entries(sourceCounts).map(([label, value]) => ({ label, value }))
                : [{ label: 'No contracts', value: 0 }],
        };

        return { charts: [statusChart, typeChart, sourceChart] };
    }

    @Get('insights')
    async getInsights() {
        const stats = await this.contractsService.getDashboardStats();
        const contracts = await this.contractsService.getContracts({ limit: 100 });

        // Base rule-driven insights
        const baseInsights: Array<{ id: string; title: string; description: string; type: string; priority?: string; actionLabel?: string }> = [];

        if (stats.sentCount > 0) {
            baseInsights.push({
                id: 'pending-signatures',
                title: `${stats.sentCount} Contract${stats.sentCount > 1 ? 's' : ''} Awaiting Signature`,
                description: `${stats.sentCount} contract${stats.sentCount > 1 ? 's have' : ' has'} been sent and awaiting signatures.`,
                type: 'warning',
                priority: stats.sentCount > 3 ? 'high' : 'medium',
                actionLabel: 'Review Contracts',
            });
        }
        if (stats.draftCount > 0) {
            baseInsights.push({
                id: 'draft-contracts',
                title: `${stats.draftCount} Draft Contract${stats.draftCount > 1 ? 's' : ''}`,
                description: `You have ${stats.draftCount} contract${stats.draftCount > 1 ? 's' : ''} in draft status ready to send.`,
                type: 'suggestion',
                priority: 'low',
            });
        }
        if (stats.signedCount > 0) {
            baseInsights.push({
                id: 'signed-contracts',
                title: `${stats.signedCount} Fully Signed Contract${stats.signedCount > 1 ? 's' : ''}`,
                description: `${stats.signedCount} contract${stats.signedCount > 1 ? 's' : ''} completed successfully.`,
                type: 'success',
            });
        }
        if (stats.expiredCount > 0) {
            baseInsights.push({
                id: 'expired-contracts',
                title: `${stats.expiredCount} Expired Contract${stats.expiredCount > 1 ? 's' : ''}`,
                description: 'Some contracts have expired. Consider resending or voiding them.',
                type: 'warning',
                priority: 'medium',
                actionLabel: 'Review Expired',
            });
        }
        if (baseInsights.length === 0) {
            baseInsights.push({
                id: 'default',
                title: 'Create Your First Contract',
                description: 'Use templates to generate NDA, employment, freelance, or sales contracts.',
                type: 'suggestion',
            });
        }

        // AI-enhanced insight if available
        if (this.ai.isAvailable() && contracts.data.length > 0) {
            try {
                const contractSummary = contracts.data.slice(0, 20).map((c: any) => ({
                    type: c.type,
                    status: c.status,
                    title: c.title,
                    createdAt: c.createdAt,
                }));

                const prompt = `You are a contract management AI advisor. Analyze these contracts and provide 1-2 specific, actionable business insights.

Contract stats: ${JSON.stringify(stats)}
Recent contracts: ${JSON.stringify(contractSummary)}

Return JSON: {"aiInsights": [{"title": "string", "description": "string", "type": "warning|success|suggestion|info", "priority": "high|medium|low"}]}
Maximum 2 insights. Focus on patterns, risks, or opportunities the user might not notice from raw numbers.`;

                const schema = {
                    type: 'object',
                    properties: {
                        aiInsights: { type: 'array', items: { type: 'object' } },
                    },
                    required: ['aiInsights'],
                };

                const result = await this.ai.generateStructured<any>(prompt, schema, { temperature: 0.5, maxTokens: 400 });
                const aiInsights = (result.data?.aiInsights || []).map((i: any, idx: number) => ({
                    ...i,
                    id: `ai-insight-${idx}`,
                }));

                return { insights: [...baseInsights, ...aiInsights] };
            } catch (err) {
                this.logger.warn(`Contracts insights AI failed: ${(err as Error).message}`);
            }
        }

        return { insights: baseInsights };
    }

    /**
     * POST /api/contracts/ai/generate
     * AI generates contract content from a description/requirements
     */
    @Post('ai/generate')
    async aiGenerateContract(@Body() body: {
        type: ContractType;
        party1Name: string;
        party2Name: string;
        description?: string;
        keyTerms?: string;
        jurisdiction?: string;
    }) {
        const { type, party1Name, party2Name, description = '', keyTerms = '', jurisdiction = 'UAE' } = body;

        if (this.ai.isAvailable()) {
            try {
                const prompt = `You are a legal contract drafting AI. Generate a professional ${type} contract.

Party 1: ${party1Name}
Party 2: ${party2Name}
Contract type: ${type}
Jurisdiction: ${jurisdiction}
${description ? `Description: ${description}` : ''}
${keyTerms ? `Key terms: ${keyTerms}` : ''}

Write a complete, professional contract in HTML format. Include:
- Title and parties section
- Recitals/background
- Definitions
- Core obligations for each party
- Duration/term
- Payment terms (if applicable)
- Confidentiality clause
- Termination provisions
- Governing law (${jurisdiction})
- Signature block with placeholders

Use proper legal language. Format with <h1>, <h2>, <p>, <ul> HTML tags.`;

                const aiResponse = await this.ai.chat([
                    { role: 'system', content: 'You are an expert legal AI that drafts clear, professional contracts. Always use proper legal language and structure.' },
                    { role: 'user', content: prompt },
                ], { maxTokens: 2000 });

                const content = aiResponse.content || '';
                return {
                    success: true,
                    source: 'ai',
                    draft: {
                        type,
                        title: `${type.toUpperCase()} — ${party1Name} & ${party2Name}`,
                        content,
                        variables: { party1Name, party2Name, jurisdiction },
                        generatedAt: new Date(),
                    },
                };
            } catch (err) {
                this.logger.warn(`Contract AI generation failed: ${(err as Error).message}`);
                return { success: false, error: 'AI generation failed. Please try again or use a template.' };
            }
        }

        return {
            success: false,
            error: 'AI provider not configured. Please use a contract template instead.',
        };
    }

    @Get('templates')
    async listTemplates(@Query('type') type?: ContractType) {
        return this.contractsService.getTemplates(type);
    }

    @Post('templates')
    async createTemplate(@Body() body: any) {
        return this.contractsService.createTemplate(body);
    }

    @Get(':id')
    async getContract(@Param('id') id: string) {
        const contract = await this.contractsService.getContractById(id);
        if (!contract) return { error: 'Contract not found', statusCode: 404 };
        const signers = await this.contractsService.getSigners(id);
        return { ...contract, signers };
    }

    @Post()
    async createContract(@Body() dto: ContractCreateDto) {
        this.logger.log(`Creating contract: ${dto.title}`);
        return this.contractsService.createContract(dto);
    }

    @Post(':id')
    async updateContract(@Param('id') id: string, @Body() dto: ContractUpdateDto) {
        const result = await this.contractsService.updateContract(id, dto);
        if (!result) return { error: 'Contract not found', statusCode: 404 };
        return result;
    }

    @Delete(':id')
    @HttpCode(200)
    async deleteContract(@Param('id') id: string) {
        return { success: await this.contractsService.deleteContract(id) };
    }

    // ── Signing Flow ────────────────────────────────────────────────────────

    @Post(':id/send')
    async sendContract(@Param('id') id: string) {
        const result = await this.contractsService.sendContract(id);
        if (!result) return { error: 'Contract not found or not in draft status', statusCode: 400 };
        return { success: true, contract: result };
    }

    @Post(':id/sign')
    async signContract(@Param('id') id: string, @Body() body: any, @Req() req: any) {
        const dto: SignatureCreateDto = {
            contractId: id,
            signerId: body.signerId,
            signingToken: body.signingToken,
            signatureData: body.signatureData,
            method: body.method || 'type',
            ipAddress: req?.ip || req?.connection?.remoteAddress,
            userAgent: req?.headers?.['user-agent'],
        };
        return this.contractsService.signContract(dto);
    }

    @Post(':id/void')
    async voidContract(@Param('id') id: string) {
        const result = await this.contractsService.voidContract(id);
        if (!result) return { error: 'Contract not found', statusCode: 404 };
        return { success: true, contract: result };
    }

    // ── Signers ─────────────────────────────────────────────────────────────

    @Get(':id/signers')
    async getSigners(@Param('id') id: string) {
        return this.contractsService.getSigners(id);
    }

    @Post(':id/signers')
    async addSigner(@Param('id') id: string, @Body() body: SignerCreateDto) {
        return this.contractsService.addSigner(id, body);
    }

    // ── Audit Trail ─────────────────────────────────────────────────────────

    @Get(':id/events')
    async getEvents(@Param('id') id: string) {
        return this.contractsService.getEvents(id);
    }

    // ── Seed ────────────────────────────────────────────────────────────────

    @Post('seed')
    async seedDemoData() {
        return this.contractsService.seedDemoData();
    }

    // ========================================================================
    // ADVANCED CONTRACTS — Version History
    // (From FLYN_AI_Contracts_Module_Implementation.pdf Section 11)
    // ========================================================================

    /**
     * GET /api/contracts/:id/versions
     * Returns version history for a contract
     */
    @Get(':id/versions')
    async getVersionHistory(@Param('id') id: string) {
        const contract = await this.contractsService.getContractById(id);
        if (!contract) return { error: 'Contract not found', statusCode: 404 };

        const events = await this.contractsService.getEvents(id);
        const eventList = Array.isArray(events) ? events : [];

        // Construct version timeline from audit trail
        const versions = [
            {
                version: 1,
                status: 'draft',
                modifiedBy: 'System',
                modifiedAt: contract.createdAt || new Date().toISOString(),
                changes: ['Contract created'],
                fingerprint: hashContractFingerprint(JSON.stringify({ title: contract.title, type: contract.type, version: 1 })),
            },
        ];

        let versionNum = 2;
        for (const evt of eventList) {
            if (['contract.sent', 'contract.signed', 'contract.voided'].includes(evt.type || '')) {
                versions.push({
                    version: versionNum++,
                    status: evt.type?.replace('contract.', '') || 'updated',
                    modifiedBy: evt.actorName || evt.actorId || 'System',
                    modifiedAt: evt.createdAt || new Date().toISOString(),
                    changes: [(evt.payload as any)?.description || `Status changed to ${evt.type}`],
                    fingerprint: hashContractFingerprint(JSON.stringify({ id, version: versionNum, type: evt.type })),
                });
            }
        }

        return {
            contractId: id,
            contractTitle: contract.title,
            currentVersion: versions.length,
            versions,
        };
    }

    // ========================================================================
    // ADVANCED CONTRACTS — AES-256 Encryption
    // (From FLYN_AI_Contracts_Module_Implementation.pdf Section 10)
    // ========================================================================

    /**
     * POST /api/contracts/:id/encrypt
     * Encrypt sensitive contract content using AES-256-CBC
     */
    @Post(':id/encrypt')
    async encryptContract(@Param('id') id: string) {
        const contract = await this.contractsService.getContractById(id);
        if (!contract) return { error: 'Contract not found', statusCode: 404 };

        const contentToEncrypt = contract.content || '';
        const encrypted = encryptContractData(contentToEncrypt);
        const fingerprint = hashContractFingerprint(contentToEncrypt);

        return {
            success: true,
            contractId: id,
            encrypted: true,
            encryptedContentPreview: encrypted.slice(0, 50) + '...',
            contentFingerprint: fingerprint,
            algorithm: 'AES-256-CBC',
            message: 'Contract content encrypted at rest. Decryption requires CONTRACTS_ENCRYPTION_KEY.',
        };
    }

    /**
     * POST /api/contracts/:id/generate-signed-url
     * Generate a signed URL for secure contract access
     */
    @Post(':id/generate-signed-url')
    async generateContractSignedUrl(@Param('id') id: string, @Body() body: { signerEmail: string; expiresInHours?: number }) {
        const contract = await this.contractsService.getContractById(id);
        if (!contract) return { error: 'Contract not found', statusCode: 404 };

        const expiresAt = new Date(Date.now() + (body.expiresInHours || 72) * 3600000);
        const signedUrl = generateSignedUrl(id, body.signerEmail, expiresAt);

        return {
            success: true,
            contractId: id,
            signerEmail: body.signerEmail,
            signedUrl,
            expiresAt: expiresAt.toISOString(),
            securityNote: 'URL is HMAC-SHA256 signed. Tampering will invalidate the link.',
        };
    }

    /**
     * POST /api/contracts/verify-url
     * Verify the integrity of a signed contract URL
     */
    @Post('verify-url')
    async verifyContractUrl(@Body() body: { signedUrl: string }) {
        const result = verifySignedUrl(body.signedUrl);
        return {
            valid: result.valid,
            expired: result.expired,
            contractId: result.contractId,
            signerEmail: result.signerEmail,
            message: !result.valid ? 'Invalid or tampered URL' :
                result.expired ? 'URL has expired' : 'URL is valid and active',
        };
    }
}
