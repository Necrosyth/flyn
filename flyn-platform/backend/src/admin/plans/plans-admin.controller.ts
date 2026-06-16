import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, HttpCode, Query, UnauthorizedException } from '@nestjs/common';
import { FirebaseAuthGuard, AuthRequest } from '../../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../../billing/guards/api-or-firebase-auth.guard';
import { PlansAdminService } from './plans-admin.service';
import type { PlanId, CreatePlanDto, UpdatePlanDto, EnforcePlanDto, PlanComparisonDto, PlanTemplate, PricingTableSchema } from './plan-definitions.types';

@Controller('admin/plans')
export class PlansAdminController {
  constructor(private readonly plansAdminService: PlansAdminService) {}

  private assertAdmin(req: AuthRequest): void {
    const role = req.firebaseUser?.['role'];
    const uid = req.firebaseUser?.uid;
    const isAdmin = role === 'admin' || role === 'owner' || uid === process.env.ADMIN_UID;
    if (!isAdmin) throw new UnauthorizedException('Admin access required');
  }

  @Get()
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getAllPlans(@Req() req: AuthRequest) {
    this.assertAdmin(req);
    return this.plansAdminService.getAllPlans();
  }

  @Get(':planId')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getPlanById(@Req() req: AuthRequest, @Param('planId') planId: string) {
    this.assertAdmin(req);
    return this.plansAdminService.getPlanById(planId as PlanId);
  }

  @Post(':planId')
  @HttpCode(201)
  @UseGuards(ApiOrFirebaseAuthGuard)
  async createPlan(
    @Req() req: AuthRequest,
    @Param('planId') planId: string,
    @Body() dto: CreatePlanDto,
  ) {
    this.assertAdmin(req);
    return this.plansAdminService.createPlan(planId as PlanId, dto, req.firebaseUser.uid);
  }

  @Put(':planId')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async updatePlan(
    @Req() req: AuthRequest,
    @Param('planId') planId: string,
    @Body() dto: UpdatePlanDto,
  ) {
    this.assertAdmin(req);
    return this.plansAdminService.updatePlan(planId as PlanId, dto, req.firebaseUser.uid);
  }

  @Post(':planId/enforce')
  @HttpCode(200)
  @UseGuards(ApiOrFirebaseAuthGuard)
  async enforcePlanUpdate(
    @Req() req: AuthRequest,
    @Param('planId') planId: string,
    @Body() dto: EnforcePlanDto,
  ) {
    this.assertAdmin(req);
    return this.plansAdminService.enforcePlanUpdate(planId as PlanId, dto, req.firebaseUser.uid);
  }

  @Post('compare')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async comparePlans(@Req() req: AuthRequest, @Body() dto: PlanComparisonDto) {
    this.assertAdmin(req);
    return this.plansAdminService.getPlanComparison(dto);
  }

  @Get(':planId/impact')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async analyzePlanImpact(@Req() req: AuthRequest, @Param('planId') planId: string) {
    this.assertAdmin(req);
    return this.plansAdminService.analyzePlanImpact(planId as PlanId);
  }

  @Get(':planId/history')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getPlanHistory(@Req() req: AuthRequest, @Param('planId') planId: string) {
    this.assertAdmin(req);
    return this.plansAdminService.getPlanHistory(planId as PlanId);
  }

  @Get('templates/list')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getTemplates(@Req() req: AuthRequest) {
    this.assertAdmin(req);
    return this.plansAdminService.getPlanTemplates();
  }

  @Post('templates')
  @HttpCode(201)
  @UseGuards(ApiOrFirebaseAuthGuard)
  async createTemplate(@Req() req: AuthRequest, @Body() template: Omit<PlanTemplate, 'createdAt'>) {
    this.assertAdmin(req);
    return this.plansAdminService.createPlanTemplate(template, req.firebaseUser.uid);
  }

  @Post(':planId/from-template/:templateId')
  @HttpCode(201)
  @UseGuards(ApiOrFirebaseAuthGuard)
  async cloneFromTemplate(
    @Req() req: AuthRequest,
    @Param('planId') planId: string,
    @Param('templateId') templateId: string,
  ) {
    this.assertAdmin(req);
    return this.plansAdminService.clonePlanFromTemplate(planId as PlanId, templateId, req.firebaseUser.uid);
  }

  @Get('schema')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getSchema(@Req() req: AuthRequest) {
    this.assertAdmin(req);
    return this.plansAdminService.getSchema();
  }

  @Put('schema')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async updateSchema(@Req() req: AuthRequest, @Body() schema: PricingTableSchema) {
    this.assertAdmin(req);
    return this.plansAdminService.updateSchema(schema, req.firebaseUser.uid);
  }

  @Post('seed')
  @HttpCode(200)
  @UseGuards(ApiOrFirebaseAuthGuard)
  async seedPlans(@Req() req: AuthRequest) {
    this.assertAdmin(req);
    await this.plansAdminService.seedInitialPlans(req.firebaseUser.uid);
    return { message: 'Plans and schema seeded successfully' };
  }

  @Post('seed-initial')
  @HttpCode(200)
  async seedInitialPlans() {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Seed endpoint only available in development');
    }
    await this.plansAdminService.seedInitialPlans();
    return { message: 'Initial plans seeded successfully' };
  }
}
