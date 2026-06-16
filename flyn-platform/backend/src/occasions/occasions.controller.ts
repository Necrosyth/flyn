import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { AuthRequest } from '../billing/guards/firebase-auth.guard';
import { OccasionsService, OccasionEvent, CelebrationPrefs } from './occasions.service';

@Controller('occasions')
@UseGuards(ApiOrFirebaseAuthGuard)
export class OccasionsController {
  constructor(private readonly occasionsService: OccasionsService) {}

  /** In-app banner check — called once per session on page load */
  @Get('check')
  check(@Req() req: AuthRequest): Promise<OccasionEvent[]> {
    const tenantId =
      (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.occasionsService.checkOccasions(tenantId);
  }

  /** Load saved celebration prefs for this tenant */
  @Get('prefs')
  getPrefs(@Req() req: AuthRequest): Promise<CelebrationPrefs> {
    const tenantId =
      (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.occasionsService.getPrefs(tenantId);
  }

  /** Save celebration prefs to Firestore */
  @Post('prefs')
  savePrefs(
    @Req() req: AuthRequest,
    @Body() body: Partial<CelebrationPrefs>,
  ): Promise<void> {
    const tenantId =
      (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.occasionsService.savePrefs(tenantId, body);
  }

  /** Manually trigger celebration emails for today (for testing) */
  @Post('send-now')
  sendNow(@Req() req: AuthRequest): Promise<{ sent: number; skipped: number }> {
    const tenantId =
      (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.occasionsService.sendCelebrationsForTenant(tenantId);
  }
}
