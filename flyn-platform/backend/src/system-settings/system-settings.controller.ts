import { Controller, Get, Post, Body, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { SystemSettingsService } from './system-settings.service';
import { SystemSettings } from './system-settings.types';

@Controller('admin/system-settings')
@UseGuards(ApiOrFirebaseAuthGuard)
export class SystemSettingsController {
  constructor(private readonly settingsService: SystemSettingsService) {}

  private assertOwner(req: AuthRequest) {
    if (req.firebaseUser?.role !== 'owner') {
      throw new ForbiddenException('Only owners can access system settings');
    }
  }

  @Get()
  async getSettings(@Req() req: AuthRequest) {
    this.assertOwner(req);
    return this.settingsService.getSettings();
  }

  @Post()
  async updateSettings(@Req() req: AuthRequest, @Body() patch: Partial<SystemSettings>) {
    this.assertOwner(req);
    return this.settingsService.updateSettings(patch);
  }
}
