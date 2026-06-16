import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { WebsiteCmsService } from './website-cms.service';
import { CmsCollection, CmsRecord } from './website-cms.types';

@Controller('website-builder/cms')
@UseGuards(ApiOrFirebaseAuthGuard)
export class WebsiteCmsController {
  constructor(private readonly cmsService: WebsiteCmsService) {}

  private tenantId(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
  }

  // ── Collections ────────────────────────────────────────────────────────────

  @Get('collections')
  async listCollections(@Req() req: AuthRequest, @Query('websiteId') websiteId?: string) {
    return this.cmsService.listCollections(this.tenantId(req), websiteId);
  }

  @Post('collections')
  async createCollection(@Req() req: AuthRequest, @Body() data: any) {
    return this.cmsService.createCollection(this.tenantId(req), data);
  }

  @Delete('collections/:id')
  async deleteCollection(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.cmsService.deleteCollection(this.tenantId(req), id);
    return { success: true };
  }

  // ── Records ────────────────────────────────────────────────────────────────

  @Get('collections/:colId/records')
  async listRecords(@Req() req: AuthRequest, @Param('colId') colId: string) {
    return this.cmsService.listRecords(this.tenantId(req), colId);
  }

  @Post('collections/:colId/records')
  async createRecord(@Req() req: AuthRequest, @Param('colId') colId: string, @Body() body: { data: any; order?: number }) {
    return this.cmsService.createRecord(this.tenantId(req), colId, body.data, body.order);
  }

  @Patch('records/:id')
  async updateRecord(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: { data: any }) {
    await this.cmsService.updateRecord(this.tenantId(req), id, body.data);
    return { success: true };
  }

  @Delete('records/:id')
  async deleteRecord(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.cmsService.deleteRecord(this.tenantId(req), id);
    return { success: true };
  }
}
