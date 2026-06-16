import {
  Controller, Get, Post, Delete, Body, Param, Query, Headers,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';

@Controller('assets')
@UseGuards(ApiOrFirebaseAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  // Generate a presigned S3 upload URL (browser uploads directly to S3)
  @Post('presigned-url')
  @HttpCode(HttpStatus.OK)
  async getPresignedUrl(
    @Body() body: { fileName: string; fileType: string; module: string },
    @Headers('x-tenant-id') headerTenant: string,
    @Query('tenantId') queryTenant: string,
  ) {
    const tenantId = headerTenant || queryTenant;
    return this.assetsService.getPresignedUploadUrl({ tenantId, ...body });
  }

  // Register asset metadata after browser upload to S3 completes
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: {
      tenantId?: string;
      fileName: string;
      fileKey: string;
      fileUrl: string;
      fileType: string;
      fileSize?: number;
      module: string;
      subType?: string;
      sourceId?: string;
      uploadedBy: string;
      tags?: string[];
    },
    @Headers('x-tenant-id') headerTenant: string,
    @Query('tenantId') queryTenant: string,
  ) {
    const tenantId = headerTenant || queryTenant || body.tenantId || '';
    const asset = await this.assetsService.registerAsset({ ...body, tenantId });
    return { asset };
  }

  // List all assets for tenant, optionally filtered by module
  @Get()
  async list(
    @Headers('x-tenant-id') headerTenant: string,
    @Query('tenantId') queryTenant: string,
    @Query('module') module?: string,
  ) {
    const tenantId = headerTenant || queryTenant;
    const assets = await this.assetsService.listAssets(tenantId, module);
    return { assets };
  }

  // Delete an asset (removes from S3 + DynamoDB)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenant: string,
    @Query('tenantId') queryTenant: string,
  ) {
    const tenantId = headerTenant || queryTenant;
    await this.assetsService.deleteAsset(tenantId, id);
    return { success: true };
  }
}
