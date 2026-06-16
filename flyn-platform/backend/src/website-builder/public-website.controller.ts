import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { WebsiteBuilderService } from './website-builder.service';
import { Public } from '../billing/guards/public.decorator';

@Public()
@Controller('website-builder/p')
export class PublicWebsiteController {
  private readonly logger = new Logger(PublicWebsiteController.name);

  constructor(private readonly websiteBuilderService: WebsiteBuilderService) {}

  /**
   * GET /api/website-builder/p/:id
   * Renders the published website HTML publicly — no auth required.
   */
  @Get(':id')
  async renderWebsite(@Param('id') id: string, @Res() res: Response) {
    this.logger.log(`[PublicWebsite] Serving website id=${id}`);

    try {
      const website = await this.websiteBuilderService.getWebsiteByIdPublic(id);

      this.logger.log(`[PublicWebsite] Lookup result for id=${id}: found=${!!website}, hasHtml=${!!(website?.html)}, htmlLen=${website?.html?.length ?? 0}`);

      if (!website) {
        res.status(404).setHeader('Content-Type', 'text/plain').send(`Website not found: ${id}`);
        return;
      }

      if (!website.html) {
        res.status(404).setHeader('Content-Type', 'text/plain').send(`Website ${id} exists but has no HTML content`);
        return;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.send(website.html);

    } catch (err: any) {
      this.logger.error(`[PublicWebsite] Error serving id=${id}: ${err.message}`, err.stack);
      res.status(500).setHeader('Content-Type', 'text/plain').send(`Internal error: ${err.message}`);
    }
  }
}
