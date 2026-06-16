import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { RolesGuard } from '../billing/guards/roles.guard';
import { Roles } from '../billing/guards/roles.decorator';
import { TeamService } from './team.service';

@ApiTags('Team')
@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  private tenantIdFromReq(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
  }

  @Get('invite/:code')
  @HttpCode(200)
  peek(@Param('code') code: string) {
    if (!code?.trim()) throw new BadRequestException('code is required');
    return this.teamService.peekInvite(code);
  }

  @Post('join')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(200)
  join(@Req() req: AuthRequest, @Body() body: { inviteCode: string }) {
    return this.teamService.joinWithInvite(req.firebaseUser.uid, body.inviteCode);
  }

  @Get('members')
  @UseGuards(ApiOrFirebaseAuthGuard)
  list(@Req() req: AuthRequest) {
    return this.teamService.listMembers(this.tenantIdFromReq(req));
  }

  /** Caller's own role + module access — for client-side gating. */
  @Get('me/access')
  @UseGuards(ApiOrFirebaseAuthGuard)
  myAccess(@Req() req: AuthRequest) {
    return this.teamService.getMyAccess(req.firebaseUser.uid);
  }

  @Post('invite')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @HttpCode(201)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  invite(
    @Req() req: AuthRequest,
    @Body() body: { email: string; role: 'admin' | 'manager' | 'agent'; team?: string },
  ) {
    return this.teamService.inviteMember({
      tenantId: this.tenantIdFromReq(req),
      email: body.email,
      role: body.role,
      team: body.team,
    });
  }

  @Patch('members/:uid')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  update(
    @Req() req: AuthRequest,
    @Param('uid') uid: string,
    @Body()
    body: {
      role?: 'admin' | 'manager' | 'agent';
      team?: string | null;
      permissions?: { accessCRM?: boolean; manageUsers?: boolean; editSettings?: boolean; ownerDashboardAnalytics?: boolean; ownerDashboardContent?: boolean; ownerDashboardPricing?: boolean };
    },
  ) {
    return this.teamService.updateMember({
      tenantId: this.tenantIdFromReq(req),
      uid,
      role: body.role,
      team: body.team,
      permissions: body.permissions,
    });
  }

  @Patch('members/:uid/module-access')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
  updateModuleAccess(
    @Req() req: AuthRequest,
    @Param('uid') uid: string,
    @Body() body: { moduleAccess: Record<string, string> },
  ) {
    return this.teamService.updateMemberModuleAccess({
      tenantId: this.tenantIdFromReq(req),
      uid,
      moduleAccess: body.moduleAccess,
    });
  }

  @Delete('members/:uid')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @HttpCode(200)
  remove(@Req() req: AuthRequest, @Param('uid') uid: string) {
    const callerUid = req.firebaseUser.uid;
    const callerEmail: string = (req.firebaseUser as any).email || '';
    const callerName: string = (req.firebaseUser as any).name || callerEmail.split('@')[0] || 'Admin';
    return this.teamService.removeMember({
      tenantId: this.tenantIdFromReq(req),
      uid,
      revokedByUid: callerUid,
      revokedByEmail: callerEmail,
      revokedByName: callerName,
    });
  }

  @Get('invites')
  @UseGuards(ApiOrFirebaseAuthGuard)
  listInvites(@Req() req: AuthRequest) {
    return this.teamService.listPendingInvites(this.tenantIdFromReq(req));
  }

  @Delete('invite/:code')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @HttpCode(200)
  revokeInvite(@Req() req: AuthRequest, @Param('code') code: string) {
    if (!code?.trim()) throw new BadRequestException('code is required');
    return this.teamService.revokeInvite({
      code,
      tenantId: this.tenantIdFromReq(req),
      revokedByUid: req.firebaseUser.uid,
    });
  }
}
