import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Controller('track/email')
export class EmailTrackingController {
  private readonly logger = new Logger(EmailTrackingController.name);

  @Get('open/:token')
  async trackOpen(@Param('token') rawToken: string, @Res() res: Response) {
    const token = rawToken.replace(/\.gif$/i, '');
    this.logger.log(`Email open tracked: ${token}`);
    res
      .set({
        'Content-Type': 'image/gif',
        'Content-Length': TRANSPARENT_GIF.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
        Expires: '0',
      })
      .status(200)
      .end(TRANSPARENT_GIF);
  }
}
