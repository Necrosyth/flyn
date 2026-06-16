import { Global, Module } from '@nestjs/common';
import { BrevoService } from './brevo.service';

/**
 * Global so any send/domain-auth path can inject BrevoService without re-importing.
 * BrevoService depends only on env (BREVO_API_KEY) + https — no other providers, no cycle risk.
 */
@Global()
@Module({
  providers: [BrevoService],
  exports: [BrevoService],
})
export class BrevoModule {}
