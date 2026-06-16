import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { RolesGuard } from '../billing/guards/roles.guard';
import { Roles } from '../billing/guards/roles.decorator';
import { MailboxesService } from './mailboxes.service';
import type { CreateMailboxDto, LinkMailboxDto } from './mailbox.types';

@ApiTags('Mailboxes')
@Controller('mailboxes')
export class MailboxesController {
  constructor(private readonly mailboxes: MailboxesService) {}

  private tenantIdFromReq(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
  }

  /** Admin/owner: every mailbox in the org (the management view). */
  @Get()
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  list(@Req() req: AuthRequest) {
    return this.mailboxes.listMailboxes(this.tenantIdFromReq(req));
  }

  /** Any member: the mailboxes THEY may use (drives the inbox filter + outbox From-picker). */
  @Get('mine')
  @UseGuards(ApiOrFirebaseAuthGuard)
  mine(@Req() req: AuthRequest) {
    return this.mailboxes.getMailboxesForUser(this.tenantIdFromReq(req), req.firebaseUser.uid);
  }

  @Post()
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @HttpCode(201)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  create(@Req() req: AuthRequest, @Body() body: CreateMailboxDto) {
    return this.mailboxes.createMailbox(this.tenantIdFromReq(req), req.firebaseUser.uid, body);
  }

  @Patch(':id/link')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  link(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: LinkMailboxDto) {
    return this.mailboxes.linkMailbox(this.tenantIdFromReq(req), id, body);
  }

  /** Mailboxes on a domain the tenant hasn't verified-owned (junk from before the gate). */
  @Get('orphans')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  orphans(@Req() req: AuthRequest) {
    return this.mailboxes.listOrphans(this.tenantIdFromReq(req));
  }

  /** Delete all orphan mailboxes (declared BEFORE :id so "orphans" isn't parsed as an id). */
  @Delete('orphans')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  cleanupOrphans(@Req() req: AuthRequest) {
    return this.mailboxes.deleteOrphans(this.tenantIdFromReq(req));
  }

  @Delete(':id')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.mailboxes.deleteMailbox(this.tenantIdFromReq(req), id);
  }
}
