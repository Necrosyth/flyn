import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Controller, Get, Post, Delete, Query, Res, Redirect, Param, Body, UseGuards, UseInterceptors, UnauthorizedException } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { TenantFromAuthInterceptor } from '../common/tenant-from-auth.interceptor';
import { Public } from '../billing/guards/public.decorator';
import { Response } from 'express';

@ApiTags('Calendar')
@Controller('calendar')
@UseGuards(ApiOrFirebaseAuthGuard)
@UseInterceptors(TenantFromAuthInterceptor)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  /** Auth Redirect to Google */
  @Public()
  @Get('auth/google/:tenantId')
  @Redirect()
  async googleAuth(@Param('tenantId') tenantId: string) {
    const url = this.calendarService.getGoogleAuthUrl(tenantId);
    return { url };
  }

  /** Google Callback */
  @Public()
  @Get('auth/google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) throw new UnauthorizedException('Code and state are required');
    const { tenantId } = JSON.parse(state);
    
    await this.calendarService.handleGoogleCallback(code, tenantId);
    
    // Redirect back to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    res.redirect(`${frontendUrl}/dashboard/calendars?status=success&provider=google`);
  }

  /** Auth Redirect to Microsoft */
  @Public()
  @Get('auth/microsoft/:tenantId')
  @Redirect()
  async microsoftAuth(@Param('tenantId') tenantId: string) {
    const url = this.calendarService.getMicrosoftAuthUrl(tenantId);
    return { url };
  }

  /** Microsoft Callback */
  @Public()
  @Get('auth/microsoft/callback')
  async microsoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) throw new UnauthorizedException('Code and state are required');
    const { tenantId } = JSON.parse(state);
    
    await this.calendarService.handleMicrosoftCallback(code, tenantId);
    
    // Redirect back to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    res.redirect(`${frontendUrl}/dashboard/calendars?status=success&provider=microsoft`);
  }

  /** Get All Events (for the main calendar view) */
  @Get('events/:tenantId')
  async getEvents(@Param('tenantId') tenantId: string) {
    return this.calendarService.getAllEvents(tenantId);
  }

  /**
   * Create an event. When a real provider is given (google/microsoft/outlook/zoom),
   * the event is written to that provider; otherwise a durable internal event.
   */
  @Post('events/:tenantId')
  async createEvent(
    @Param('tenantId') tenantId: string,
    @Body() event: any,
  ) {
    const provider = (event?.provider || event?.source || 'internal').toLowerCase();
    if (['google', 'microsoft', 'outlook', 'zoom'].includes(provider)) {
      return this.calendarService.createMeeting(tenantId, {
        provider,
        title: event.title || event.summary || 'Meeting',
        description: event.description,
        start: event.startDateTime || event.start,
        end: event.endDateTime || event.end,
        attendeeEmail: event.attendeeEmail,
      });
    }
    return this.calendarService.createEvent(tenantId, event);
  }

  /** Delete an internal event */
  @Delete('events/:tenantId/:eventId')
  async deleteEvent(
    @Param('tenantId') tenantId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.calendarService.deleteEvent(tenantId, eventId);
  }

  /** Link a module to a calendar (google/microsoft/none) */
  @Get('link/:tenantId/:moduleKey/:provider')
  async linkModule(
    @Param('tenantId') tenantId: string,
    @Param('moduleKey') moduleKey: string,
    @Param('provider') provider: 'google' | 'microsoft' | 'none',
  ) {
    // Logic to save link in tenant record (to be implemented in service)
    return { status: 'success', linked: provider };
  }
}
