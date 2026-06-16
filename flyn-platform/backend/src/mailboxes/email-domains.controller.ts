import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { RolesGuard } from '../billing/guards/roles.guard';
import { Roles } from '../billing/guards/roles.decorator';
import { EmailDomainsService } from './email-domains.service';
import { MailboxesService } from './mailboxes.service';
import type { AddEmailDomainDto } from './email-domain.types';

@ApiTags('Email Domains')
@Controller('email-domains')
export class EmailDomainsController {
  constructor(
    private readonly emailDomains: EmailDomainsService,
    private readonly mailboxes: MailboxesService,
  ) {}

  private tenantIdFromReq(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
  }

  /** Admin/owner: all email domains for the org (any status). */
  @Get()
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  list(@Req() req: AuthRequest) {
    return this.emailDomains.list(this.tenantIdFromReq(req));
  }

  /** Add a domain → returns the domain record + the TXT record to publish for ownership. */
  @Post()
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @HttpCode(201)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  add(@Req() req: AuthRequest, @Body() body: AddEmailDomainDto) {
    return this.emailDomains.addDomain(this.tenantIdFromReq(req), req.firebaseUser.uid, body);
  }

  /** Run a real DNS TXT lookup; flips to 'verified' when the token is found. */
  @Post(':id/verify')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @HttpCode(200)
  verify(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.emailDomains.verifyDomain(this.tenantIdFromReq(req), id);
  }

  /**
   * Start Brevo sending authentication for an ownership-verified domain → returns the DKIM/brevo-code
   * /DMARC records to publish and sets sendingStatus 'pending'.
   */
  @Post(':id/authenticate-sending')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @HttpCode(200)
  authenticateSending(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.emailDomains.startSendingAuth(this.tenantIdFromReq(req), id);
  }

  /**
   * Re-check Brevo authentication; when the domain flips 'verified', activate its pending mailboxes
   * (orchestrated here so EmailDomainsService never depends on MailboxesService).
   */
  @Post(':id/verify-sending')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @HttpCode(200)
  async verifySending(@Req() req: AuthRequest, @Param('id') id: string) {
    const tenantId = this.tenantIdFromReq(req);
    const result = await this.emailDomains.checkSendingAuth(tenantId, id);
    let activated = { activated: 0, addresses: [] as string[] };
    if (result.domain.sendingStatus === 'verified') {
      activated = await this.mailboxes.activateMailboxesForDomain(tenantId, result.domain.domain);
    }
    return { ...result, activated };
  }

  @Delete(':id')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.emailDomains.deleteDomain(this.tenantIdFromReq(req), id);
  }
}
