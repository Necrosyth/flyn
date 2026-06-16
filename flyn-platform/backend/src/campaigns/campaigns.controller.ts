import {
  Body, Controller, Delete, Get, Param, Post, Query,
  Req, UseGuards, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { AuthRequest } from '../billing/guards/firebase-auth.guard';
import { CampaignsService, CampaignChannel, CampaignContact, EmailTemplateDoc } from './campaigns.service';

@ApiTags('Campaigns')
@Controller('campaigns')
@UseGuards(ApiOrFirebaseAuthGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  private tenantId(req: AuthRequest): string {
    return (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
  }

  @Get()
  async list(@Req() req: AuthRequest, @Query('channel') channel?: CampaignChannel) {
    const campaigns = await this.campaigns.list(this.tenantId(req), channel);
    return { campaigns };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthRequest,
    @Body() body: {
      name: string;
      channel: CampaignChannel;
      messageA?: string;
      messageB?: string;
      subject?: string;
      agentId?: string;
      mailboxId?: string;
      selectedContacts?: CampaignContact[];
    },
  ) {
    return this.campaigns.create(this.tenantId(req), body);
  }

  @Post(':id/launch')
  @HttpCode(HttpStatus.OK)
  async launch(@Req() req: AuthRequest, @Param('id') id: string) {
    if (!id) throw new BadRequestException('campaign id is required');
    return this.campaigns.launch(this.tenantId(req), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.campaigns.remove(this.tenantId(req), id);
  }

  // ─── Email Templates ──────────────────────────────────────────────────────

  @Get('email-templates/list')
  async listEmailTemplates(@Req() req: AuthRequest) {
    const templates = await this.campaigns.listEmailTemplates(this.tenantId(req));
    return { templates };
  }

  @Post('email-templates')
  @HttpCode(HttpStatus.OK)
  async saveEmailTemplate(@Req() req: AuthRequest, @Body() body: Partial<EmailTemplateDoc>) {
    return this.campaigns.saveEmailTemplate(this.tenantId(req), body);
  }

  @Delete('email-templates/:id')
  @HttpCode(HttpStatus.OK)
  async deleteEmailTemplate(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.campaigns.deleteEmailTemplate(this.tenantId(req), id);
  }
}
