/**
 * Smart Agent Addons — NestJS Controller
 * All endpoints prefixed: /api/smart-agents
 */

import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Logger, BadRequestException,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { SmartAgentsService } from './smart-agents.service';
import { SocialPublisherService } from './social-publisher.service';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { TenantFromAuthInterceptor } from '../common/tenant-from-auth.interceptor';
import {
  AgentType, AgentCompanyData, LeadScoringRequest, BookingRequest, CaseType,
} from './smart-agents.types';

@Controller('smart-agents')
@UseGuards(ApiOrFirebaseAuthGuard)
@UseInterceptors(TenantFromAuthInterceptor)
export class SmartAgentsController {
  private readonly logger = new Logger(SmartAgentsController.name);

  constructor(
    private readonly svc: SmartAgentsService,
    private readonly publisher: SocialPublisherService,
  ) {}

  // ─── Config ───────────────────────────────────────────────────────────────

  @Get('configs/:tenantId')
  getAllConfigs(@Param('tenantId') tenantId: string) {
    return this.svc.getAllConfigs(tenantId);
  }

  @Get('config/:tenantId/:agentType')
  getConfig(@Param('tenantId') tenantId: string, @Param('agentType') agentType: AgentType) {
    return this.svc.getConfig(tenantId, agentType);
  }

  @Patch('config/:tenantId/:agentType/toggle')
  toggleAgent(@Param('tenantId') tenantId: string, @Param('agentType') agentType: AgentType, @Body() body: { active: boolean }) {
    return this.svc.toggleAgent(tenantId, agentType, body.active);
  }

  @Patch('config/:tenantId/:agentType/company-data')
  updateCompanyData(@Param('tenantId') tenantId: string, @Param('agentType') agentType: AgentType, @Body() data: Partial<AgentCompanyData>) {
    return this.svc.updateCompanyData(tenantId, agentType, data);
  }

  @Patch('config/:tenantId/:agentType/model')
  updateModel(@Param('tenantId') tenantId: string, @Param('agentType') agentType: AgentType, @Body() body: { model: string }) {
    return this.svc.updateModel(tenantId, agentType, body.model);
  }

  @Get('prompt/:tenantId/:agentType')
  async getSystemPrompt(@Param('tenantId') tenantId: string, @Param('agentType') agentType: AgentType) {
    const valid: AgentType[] = ['marketing', 'content', 'social', 'frontdesk'];
    if (!valid.includes(agentType)) throw new BadRequestException(`Invalid agentType. Must be one of: ${valid.join(', ')}`);
    const prompt = await this.svc.getSystemPrompt(tenantId, agentType);
    return { prompt };
  }

  // ─── Activity Log ─────────────────────────────────────────────────────────

  @Get('activity/:tenantId')
  getActivity(
    @Param('tenantId') tenantId: string,
    @Query('agentType') agentType?: AgentType,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getActivityLog(tenantId, agentType, limit ? Number(limit) : 50);
  }

  // ─── Metrics ──────────────────────────────────────────────────────────────

  @Get('metrics/:tenantId')
  getMetrics(@Param('tenantId') tenantId: string) {
    return this.svc.getMetrics(tenantId);
  }

  // ─── Weekly Report ────────────────────────────────────────────────────────

  @Get('report/:tenantId')
  getWeeklyReport(@Param('tenantId') tenantId: string) {
    return this.svc.generateWeeklyReport(tenantId);
  }

  // ─── Marketing Agent ──────────────────────────────────────────────────────

  @Post('marketing/score-lead')
  scoreLead(@Body() req: LeadScoringRequest) {
    return this.svc.scoreLead(req);
  }

  @Post('marketing/drip-sequence')
  getDripSequence(@Body() body: { tenantId: string; tier: 'hot' | 'warm' | 'cold' }) {
    return this.svc.generateDripSequence(body.tenantId, body.tier);
  }

  @Post('marketing/detect-objection')
  detectObjection(@Body() body: { text: string }) {
    return this.svc.detectObjection(body.text);
  }

  @Post('marketing/campaigns')
  saveCampaign(@Body() body: any) {
    const { tenantId, ...campaign } = body;
    return this.svc.saveCampaign(tenantId, campaign);
  }

  @Get('marketing/campaigns/:tenantId')
  getCampaigns(@Param('tenantId') tenantId: string) {
    return this.svc.getCampaigns(tenantId);
  }

  // ─── Content Agent ────────────────────────────────────────────────────────

  @Post('content/calendar')
  generateCalendar(@Body() body: { tenantId: string }) {
    return this.svc.generate30DayCalendar(body.tenantId);
  }

  @Post('content/caption')
  async generateCaption(@Body() body: { tenantId: string; platform: string; topic: string; tone?: string }) {
    const caption = await this.svc.generateCaption(body.tenantId, body.platform, body.topic, body.tone);
    return { caption };
  }

  @Post('content/blog-outline')
  async generateBlogOutline(@Body() body: { tenantId: string; topic: string }) {
    const outline = await this.svc.generateBlogOutline(body.tenantId, body.topic);
    return { outline };
  }

  @Post('content/ab-variants')
  generateABVariants(@Body() body: { tenantId: string; topic: string; channel: string }) {
    return this.svc.generateABVariants(body.tenantId, body.topic, body.channel);
  }

  @Post('content/faq-answer')
  async generateFAQContent(@Body() body: { tenantId: string; question: string }) {
    const answer = await this.svc.generateFAQContent(body.tenantId, body.question);
    return { answer };
  }

  @Post('content/library')
  saveContent(@Body() body: { tenantId: string; contentType: string; title: string; body: string }) {
    return this.svc.saveContent(body.tenantId, body.contentType as any, body.title, body.body);
  }

  @Get('content/library/:tenantId')
  getContentLibrary(@Param('tenantId') tenantId: string, @Query('type') type?: string) {
    return this.svc.getContentLibrary(tenantId, type as any);
  }

  @Patch('content/library/:tenantId/:contentId/approve')
  approveContent(@Param('tenantId') tenantId: string, @Param('contentId') contentId: string) {
    return this.svc.approveContent(tenantId, contentId);
  }

  /** Content → Calendar: push a generated 30-day calendar onto the Calendar module */
  @Post('content/calendar/sync')
  syncContentCalendar(@Body() body: { tenantId: string; entries: any[] }) {
    return this.svc.syncContentCalendarToCalendar(body.tenantId, body.entries);
  }

  /** Content library → Social: create a draft social post from a library item */
  @Post('content/library/:tenantId/:contentId/to-social')
  contentToSocial(
    @Param('tenantId') tenantId: string,
    @Param('contentId') contentId: string,
    @Body() body: { platform?: string },
  ) {
    return this.svc.pushContentToSocial(tenantId, contentId, body?.platform);
  }

  /** Content library → Campaign Manager: create a draft campaign from a library item */
  @Post('content/library/:tenantId/:contentId/to-campaign')
  contentToCampaign(
    @Param('tenantId') tenantId: string,
    @Param('contentId') contentId: string,
    @Body() body: { channel?: 'email' | 'whatsapp' | 'sms' | 'voice' },
  ) {
    return this.svc.pushContentToCampaign(tenantId, contentId, body?.channel);
  }

  // ─── Social Agent ─────────────────────────────────────────────────────────

  @Post('social/generate-post')
  generatePost(@Body() body: { tenantId: string; platform: string; topic: string }) {
    return this.svc.generateSocialPost(body.tenantId, body.platform, body.topic);
  }

  @Post('social/sentiment')
  analyzeSentiment(@Body() body: { tenantId: string; text: string }) {
    return this.svc.analyzeSentiment(body.tenantId, body.text);
  }

  @Post('social/schedule')
  schedulePost(@Body() body: any) {
    const { tenantId, ...post } = body;
    return this.svc.schedulePost(tenantId, post);
  }

  @Get('social/posts/:tenantId')
  getPosts(@Param('tenantId') tenantId: string) {
    return this.svc.getPosts(tenantId);
  }

  /** Social → Calendar: push the tenant's scheduled posts onto the Calendar module */
  @Post('social/calendar/sync')
  syncSocialCalendar(@Body() body: { tenantId: string }) {
    return this.svc.syncSocialPostsToCalendar(body.tenantId);
  }

  /** Which social platforms the tenant can actually publish to (connected channels). */
  @Get('social/connected-channels/:tenantId')
  async connectedChannels(@Param('tenantId') tenantId: string) {
    return { platforms: await this.publisher.getConnectedPlatforms(tenantId) };
  }

  /** Publish a stored post to its platform right now. */
  @Post('social/posts/:tenantId/:postId/publish-now')
  async publishNow(@Param('tenantId') tenantId: string, @Param('postId') postId: string) {
    return this.publisher.publishStoredPost(tenantId, postId);
  }

  /** Re-queue a failed post for the scheduler. */
  @Post('social/posts/:tenantId/:postId/retry')
  async retryPost(@Param('postId') postId: string) {
    await this.publisher.retryPost(postId);
    return { success: true };
  }

  @Post('social/trend-alert')
  generateTrendAlert(@Body() body: { tenantId: string; topic: string }) {
    return this.svc.generateTrendAlert(body.tenantId, body.topic);
  }

  // ─── Front Desk Agent ─────────────────────────────────────────────────────

  @Post('frontdesk/bookings')
  createBooking(@Body() req: BookingRequest) {
    return this.svc.createBooking(req);
  }

  @Get('frontdesk/bookings/:tenantId')
  getBookings(@Param('tenantId') tenantId: string) {
    return this.svc.getBookings(tenantId);
  }

  @Patch('frontdesk/bookings/:tenantId/:bookingId/status')
  updateBookingStatus(@Param('tenantId') tenantId: string, @Param('bookingId') bookingId: string, @Body() body: { status: string }) {
    return this.svc.updateBookingStatus(tenantId, bookingId, body.status as any);
  }

  @Post('frontdesk/faq')
  async answerFAQ(@Body() body: { tenantId: string; question: string }) {
    const answer = await this.svc.answerFAQ(body.tenantId, body.question);
    return { answer };
  }

  @Post('frontdesk/faqs')
  saveFAQ(@Body() body: { tenantId: string; question: string; answer: string; category: string }) {
    return this.svc.saveFAQ(body.tenantId, body.question, body.answer, body.category);
  }

  @Get('frontdesk/faqs/:tenantId')
  getFAQs(@Param('tenantId') tenantId: string) {
    return this.svc.getFAQs(tenantId);
  }

  @Delete('frontdesk/faqs/:tenantId/:faqId')
  deleteFAQ(@Param('tenantId') tenantId: string, @Param('faqId') faqId: string) {
    return this.svc.deleteFAQ(tenantId, faqId);
  }

  @Post('frontdesk/cases')
  createCase(@Body() body: { tenantId: string; caseType: CaseType; summary: string; contactId?: string }) {
    return this.svc.createCase(body.tenantId, body.caseType, body.summary, body.contactId);
  }

  @Get('frontdesk/cases/:tenantId')
  getCases(@Param('tenantId') tenantId: string) {
    return this.svc.getCases(tenantId);
  }

  @Patch('frontdesk/cases/:tenantId/:caseId/escalate')
  escalateCase(@Param('tenantId') tenantId: string, @Param('caseId') caseId: string) {
    return this.svc.escalateCase(tenantId, caseId);
  }

  @Patch('frontdesk/cases/:tenantId/:caseId/resolve')
  resolveCase(@Param('tenantId') tenantId: string, @Param('caseId') caseId: string) {
    return this.svc.resolveCase(tenantId, caseId);
  }
}
