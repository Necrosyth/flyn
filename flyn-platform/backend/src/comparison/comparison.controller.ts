import { Body, Controller, Get, Put, Logger, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { Public } from '../billing/guards/public.decorator';
import { FirebaseService } from '../firebase/firebase.service';

/**
 * Comparison page content — NestJS port of the client's Next.js
 * `pages/api/admin/comparison.ts`.
 *
 *  GET /api/comparison  → public; serves the stored "FLYN vs competitors" page
 *                          content (or {} if never edited — the frontend merges
 *                          with its static defaults so the page never breaks).
 *  PUT /api/comparison  → authed; partial-merge update of the content.
 *
 * Storage: Firestore  site_config/comparison  (single platform-level doc).
 */
@ApiTags('Comparison')
@Controller('comparison')
export class ComparisonController {
  private readonly logger = new Logger(ComparisonController.name);
  private readonly COL = 'site_config';
  private readonly DOC = 'comparison';

  constructor(private readonly firebase: FirebaseService) {}

  private docRef() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore unavailable');
    return db.collection(this.COL).doc(this.DOC);
  }

  /** Public read — the marketing page is anonymous-visible. */
  @Public()
  @Get()
  async get(): Promise<Record<string, unknown>> {
    try {
      const snap = await this.docRef().get();
      return snap.exists ? (snap.data() as Record<string, unknown>) : {};
    } catch (err) {
      this.logger.warn(`comparison GET failed: ${(err as Error).message}`);
      return {}; // frontend falls back to its static defaults
    }
  }

  /**
   * Authed update. Partial-merges top-level fields; deep-merges hero + cta so
   * partial edits work (mirrors the original Next.js handler's behaviour).
   */
  @Put()
  @UseGuards(ApiOrFirebaseAuthGuard)
  async update(@Body() payload: Record<string, any>): Promise<Record<string, unknown>> {
    const snap = await this.docRef().get();
    const current = (snap.exists ? snap.data() : {}) as Record<string, any>;
    const merged: Record<string, any> = {
      ...current,
      ...payload,
      hero: { ...(current.hero ?? {}), ...(payload?.hero ?? {}) },
      cta: { ...(current.cta ?? {}), ...(payload?.cta ?? {}) },
      lastUpdated: new Date().toISOString(),
    };
    await this.docRef().set(merged, { merge: true });
    return merged;
  }
}
