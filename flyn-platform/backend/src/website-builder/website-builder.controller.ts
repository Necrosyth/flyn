import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { WebsiteBuilderService, GenerateInput, RegenerateSectionInput } from './website-builder.service';
import { WebsiteBuilderCreditsService } from './website-builder-credits.service';
import { WalletService } from '../wallet/wallet.service';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';

@Controller('website-builder')
@UseGuards(ApiOrFirebaseAuthGuard)
export class WebsiteBuilderController {
  private readonly logger = new Logger(WebsiteBuilderController.name);

  constructor(
    private readonly websiteBuilderService: WebsiteBuilderService,
    private readonly creditsService: WebsiteBuilderCreditsService,
    private readonly walletService: WalletService,
  ) {}

  private getTenantId(req: AuthRequest): string {
    return (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
  }

  /** GET /api/website-builder/templates */
  @Get('templates')
  async listTemplates(
    @Query('q') q?: string,
    @Query('category') category?: string,
  ) {
    return this.websiteBuilderService.listTemplates({ q, category });
  }

  /** GET /api/website-builder — list all websites for tenant */
  @Get()
  async listWebsites(@Req() req: AuthRequest) {
    const tenantId = this.getTenantId(req);
    return this.websiteBuilderService.listWebsites(tenantId);
  }

  /** GET /api/website-builder/credits — get current balance from unified wallet */
  @Get('credits')
  async getCreditsBalance(@Req() req: AuthRequest) {
    const tenantId = this.getTenantId(req);
    try {
      // Use new unified wallet system
      const balance = await this.walletService.getBalance(tenantId);
      const transactions = await this.walletService.getTransactions(tenantId, 10);
      return {
        balance: balance.balance,
        totalPurchased: balance.totalPurchased,
        totalUsed: balance.totalUsed,
        transactions: transactions,
      };
    } catch (err: any) {
      this.logger.error(`getCreditsBalance failed for tenant ${tenantId}: ${err.message}`);
      throw new BadRequestException(err.message ?? 'Failed to fetch credits');
    }
  }

  /** POST /api/website-builder/propose — propose website and predict costs (no generation) */
  @Post('propose')
  @HttpCode(HttpStatus.OK)
  async proposeWebsite(
    @Body() body: GenerateInput,
    @Req() req: AuthRequest,
  ) {
    const tenantId = this.getTenantId(req);
    if (!body?.businessName?.trim()) throw new BadRequestException('businessName is required');
    if (!body?.description?.trim()) throw new BadRequestException('description is required');
    if (!body?.industry?.trim()) throw new BadRequestException('industry is required');
    if (!body?.purpose?.trim()) throw new BadRequestException('purpose is required');

    try {
      return await this.websiteBuilderService.proposeWebsite(tenantId, body);
    } catch (err: any) {
      this.logger.error(`proposeWebsite failed for tenant ${tenantId}: ${err.message}`);
      throw new BadRequestException(err.message ?? 'Website proposal failed');
    }
  }

  /** POST /api/website-builder/proposals/:id/refine — refine proposal with AI chat */
  @Post('proposals/:id/refine')
  @HttpCode(HttpStatus.OK)
  async refineProposal(
    @Param('id') proposalId: string,
    @Body() body: { message: string },
    @Req() req: AuthRequest,
  ) {
    const tenantId = this.getTenantId(req);
    if (!body?.message?.trim()) throw new BadRequestException('message is required');

    try {
      return await this.websiteBuilderService.refineProposal(tenantId, proposalId, body.message);
    } catch (err: any) {
      this.logger.error(`refineProposal failed for tenant ${tenantId}: ${err.message}`);
      throw new BadRequestException(err.message ?? 'Proposal refinement failed');
    }
  }

  /** POST /api/website-builder/generate — generate a new website with AI (deducts credits) */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateWebsite(
    @Body() body: GenerateInput,
    @Req() req: AuthRequest,
  ) {
    const tenantId = this.getTenantId(req);
    if (!body?.businessName?.trim()) throw new BadRequestException('businessName is required');
    if (!body?.description?.trim()) throw new BadRequestException('description is required');
    if (!body?.industry?.trim()) throw new BadRequestException('industry is required');
    if (!body?.purpose?.trim()) throw new BadRequestException('purpose is required');

    try {
      return await this.websiteBuilderService.generateWebsite(tenantId, body);
    } catch (err: any) {
      this.logger.error(`generateWebsite failed for tenant ${tenantId}: ${err.message}`);
      throw new BadRequestException(err.message ?? 'Website generation failed');
    }
  }

  /** POST /api/website-builder/regenerate-section */
  @Post('regenerate-section')
  @HttpCode(HttpStatus.OK)
  async regenerateSection(
    @Body() body: RegenerateSectionInput,
    @Req() req: AuthRequest,
  ) {
    const tenantId = this.getTenantId(req);
    try {
      return await this.websiteBuilderService.regenerateSection(tenantId, body);
    } catch (err: any) {
      throw new BadRequestException(err.message ?? 'Section regeneration failed');
    }
  }

  /** POST /api/website-builder/publish — publish a website */
  @Post('publish')
  @HttpCode(HttpStatus.OK)
  async publishWebsite(
    @Body() body: { websiteId: string },
    @Req() req: AuthRequest,
  ) {
    const tenantId = this.getTenantId(req);
    if (!body?.websiteId) throw new BadRequestException('websiteId is required');
    return this.websiteBuilderService.publishWebsite(tenantId, body.websiteId);
  }

  /** POST /api/website-builder/chat — AI chat revision */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Body() body: { messages: any[]; html: string; websiteId?: string; selectedId?: string },
    @Req() req: AuthRequest,
  ) {
    const tenantId = this.getTenantId(req);
    if (!body?.messages || !Array.isArray(body.messages)) throw new BadRequestException('messages array is required');
    if (!body?.html?.trim()) throw new BadRequestException('html is required');
    try {
      return await this.websiteBuilderService.chat(tenantId, body);
    } catch (err: any) {
      throw new BadRequestException(err.message ?? 'Chat revision failed');
    }
  }

  /** POST /api/website-builder/forms/publish — publish a form so it has a public URL */
  @Post('forms/publish')
  @HttpCode(HttpStatus.OK)
  async publishForm(
    @Body() body: { formId: string; html: string; name?: string },
    @Req() req: AuthRequest,
  ) {
    if (!body?.formId || !body?.html) throw new BadRequestException('formId and html are required');
    const tenantId = this.getTenantId(req);
    return this.websiteBuilderService.publishForm(tenantId, body.formId, body.html, body.name ?? 'Form');
  }

  /** POST /api/website-builder/generate-form — generate a new form with AI */
  @Post('generate-form')
  @HttpCode(HttpStatus.OK)
  async generateForm(
    @Body() body: { prompt: string; businessName?: string; style?: string },
  ) {
    if (!body?.prompt?.trim()) throw new BadRequestException('prompt is required');
    try {
      return await this.websiteBuilderService.generateForm(body);
    } catch (err: any) {
      throw new BadRequestException(err.message ?? 'Form generation failed');
    }
  }

  /** GET /api/website-builder/drafts — get the most recent draft proposal */
  @Get('drafts')
  async getDraftProposal(@Req() req: AuthRequest) {
    const tenantId = this.getTenantId(req);
    return this.websiteBuilderService.getDraftProposal(tenantId);
  }

  /** GET /api/website-builder/forms/:id/submissions — list all submissions for a form */
  @Get('forms/:id/submissions')
  async listFormSubmissions(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = this.getTenantId(req);
    return this.websiteBuilderService.listFormSubmissions(tenantId, id);
  }

  /** GET /api/website-builder/:id */
  @Get(':id')
  async getWebsite(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = this.getTenantId(req);
    return this.websiteBuilderService.getWebsite(tenantId, id);
  }

  /** PATCH /api/website-builder/:id */
  @Patch(':id')
  async updateWebsite(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @Req() req: AuthRequest,
  ) {
    const tenantId = this.getTenantId(req);
    return this.websiteBuilderService.updateWebsite(tenantId, id, body);
  }

  /** POST /api/website-builder/:id/sync-cms — Sync with CMS data */
  @Post(':id/sync-cms')
  @HttpCode(HttpStatus.OK)
  async syncCMS(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = this.getTenantId(req);
    return this.websiteBuilderService.syncWebsiteCMS(tenantId, id);
  }

  /** DELETE /api/website-builder/:id */
  @Delete(':id')
  async deleteWebsite(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = this.getTenantId(req);
    return this.websiteBuilderService.deleteWebsite(tenantId, id);
  }
}
