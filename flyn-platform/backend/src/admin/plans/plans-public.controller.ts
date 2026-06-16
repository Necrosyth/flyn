import { Controller, Get, Param } from '@nestjs/common';
import { PlansAdminService } from './plans-admin.service';
import type { PlanId } from './plan-definitions.types';

@Controller('public/plans')
export class PlansPublicController {
  constructor(private readonly plansAdminService: PlansAdminService) {}

  @Get()
  async getAllPlans() {
    return this.plansAdminService.getAllPlans();
  }

  @Get('schema')
  async getSchema() {
    return this.plansAdminService.getSchema();
  }

  @Get(':planId')
  async getPlanById(@Param('planId') planId: string) {
    return this.plansAdminService.getPlanById(planId as PlanId);
  }
}
