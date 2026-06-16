import { Body, Controller, Get, InternalServerErrorException, Logger, Post, Put, Req, UseGuards, UseInterceptors, UploadedFile, UsePipes, ValidationPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { BrandingService } from './branding.service';
import { FirebaseService } from '../firebase/firebase.service';
import type { BrandingSettings } from './branding.types';

@Controller('branding')
@UseGuards(ApiOrFirebaseAuthGuard)
export class BrandingController {
  private readonly logger = new Logger(BrandingController.name);
  constructor(
    private readonly brandingService: BrandingService,
    private readonly firebase: FirebaseService,
  ) {}

  private tenantIdFromReq(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
  }

  @Get()
  async get(@Req() req: AuthRequest): Promise<BrandingSettings | null> {
    return this.brandingService.getBranding(this.tenantIdFromReq(req));
  }

  @Put()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async put(@Req() req: AuthRequest, @Body() body: Partial<BrandingSettings>): Promise<BrandingSettings> {
    return this.brandingService.upsertBranding(this.tenantIdFromReq(req), body);
  }

  /** Upload logo to Firebase Storage via Admin SDK (bypasses client-side Storage rules). Returns { url }. */
  @Post('logo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadLogo(@Req() req: AuthRequest, @UploadedFile() file: any): Promise<{ url: string }> {
    const tenantId = this.tenantIdFromReq(req);
    try {
      if (!file) throw new Error('No file received');
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || 'flyn-94396.firebasestorage.app';
      this.logger.log(`[logo-upload] tenant=${tenantId} size=${file.size} mime=${file.mimetype} bucket=${storageBucket}`);

      const storage = this.firebase.storage();
      if (!storage) throw new Error('Firebase Admin Storage not initialised');
      const bucket = storage.bucket(storageBucket);

      const path = `tenants/${tenantId}/logo`;
      const fileRef = bucket.file(path);
      await fileRef.save(file.buffer, { contentType: file.mimetype, metadata: { cacheControl: 'public, max-age=31536000' } });
      await fileRef.makePublic();
      const url = `https://storage.googleapis.com/${bucket.name}/${path}`;
      this.logger.log(`[logo-upload] success → ${url}`);

      await this.brandingService.upsertBranding(tenantId, { logoUrl: url });
      return { url };
    } catch (err: any) {
      this.logger.error(`[logo-upload] FAILED: ${err?.message}`, err?.stack);
      throw new InternalServerErrorException(`Logo upload failed: ${err?.message}`);
    }
  }
}
