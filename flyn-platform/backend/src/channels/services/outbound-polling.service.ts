import { Injectable, Logger } from '@nestjs/common';

/**
 * Previously polled Chatwoot for outbound agent messages.
 * Chatwoot has been replaced with DynamoDB-backed InboxService.
 * Outbound messages now go through POST /inbox/conversations/:id/reply directly.
 */
@Injectable()
export class OutboundPollingService {
  private readonly logger = new Logger(OutboundPollingService.name);

  constructor() {
    this.logger.log('OutboundPollingService: Chatwoot polling disabled — using DynamoDB inbox');
  }
}
