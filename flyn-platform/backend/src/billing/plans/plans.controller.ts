import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { Plan, CreatePlanDto } from './plans.types';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../guards/api-or-firebase-auth.guard';
import { Region } from '../region/region.types';

/**
 * PlansController
 *
 * Public reads (GET /billing/plans) do NOT require authentication —
 * the frontend pricing page needs them without a token.
 *
 * Writes (POST / PUT / DELETE) require a valid Firebase ID token.
 * Additional role checking (admin only) should be added via a RolesGuard
 * once RBAC is implemented.
 */
@Controller('billing/plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  list(@Query('region') region?: Region): Promise<Plan[]> {
    if (region) return this.plansService.listPlansForRegion(region);
    return this.plansService.listPlans();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Plan> {
    return this.plansService.getPlan(id);
  }

  @Post()
  @UseGuards(ApiOrFirebaseAuthGuard)
  create(@Body() body: CreatePlanDto): Promise<Plan> {
    return this.plansService.createPlan(body);
  }

  @Put(':id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  update(
    @Param('id') id: string,
    @Body() body: Partial<Omit<Plan, 'id' | 'createdAt'>>,
  ): Promise<Plan> {
    return this.plansService.updatePlan(id, body);
  }

  @Delete(':id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async archive(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.plansService.archivePlan(id);
    return { success: true };
  }
}
