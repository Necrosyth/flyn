import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { KeyValidationService, KeyValidationResult } from './key-validation.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../guards/api-or-firebase-auth.guard';

/**
 * KeyValidationController
 *
 * GET /api/billing/keys/validate
 *
 * Runs a read-only connectivity test against each configured payment gateway
 * and returns whether the credentials are valid and the API is reachable.
 *
 * - Requires Firebase auth (admin use only — do not expose to all users).
 * - Never returns key values or secrets in the response.
 * - All three gateway checks run in parallel via Promise.allSettled.
 */
@Controller('billing/keys')
@UseGuards(ApiOrFirebaseAuthGuard)
export class KeyValidationController {
  private readonly logger = new Logger(KeyValidationController.name);

  constructor(private readonly keyValidationService: KeyValidationService) {}

  @Get('validate')
  async validate(): Promise<KeyValidationResult> {
    this.logger.log('Running payment gateway key validation');
    return this.keyValidationService.validateAll();
  }
}
