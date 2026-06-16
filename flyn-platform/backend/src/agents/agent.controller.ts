/**
 * Agent Controller
 * -----------------
 * REST API for AI agent CRUD operations.
 *
 * Base path: /api/agents
 *
 * Security: every route is authenticated (ApiOrFirebaseAuthGuard) and tenantId is
 * ALWAYS derived from the verified Firebase token — never from query/body. All
 * single-doc ops are tenant-scoped in the service (cross-tenant access → 404).
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { CreateAgentDto, UpdateAgentDto } from './agent.types';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { AuthRequest } from '../billing/guards/firebase-auth.guard';

@ApiTags('AI Agents')
@Controller('agents')
@UseGuards(ApiOrFirebaseAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly agentService: AgentService) {}

  /** TenantId from the verified token — NEVER from query/body. */
  private tenantId(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
  }

  // ─── LIST ────────────────────────────────────────────────────────────────
  @Get()
  async list(@Req() req: AuthRequest, @Query('limit') limit?: string) {
    const tid = this.tenantId(req);
    const agents = await this.agentService.listByTenant(tid, limit ? parseInt(limit, 10) : 50);
    return { success: true, agents, count: agents.length };
  }

  // ─── GET ONE (tenant-scoped) ─────────────────────────────────────────────
  @Get(':id')
  async getOne(@Req() req: AuthRequest, @Param('id') id: string) {
    try {
      const agent = await this.agentService.getById(id, this.tenantId(req));
      return { success: true, agent };
    } catch (err) {
      throw new HttpException((err as Error).message || 'Agent not found', HttpStatus.NOT_FOUND);
    }
  }

  // ─── CREATE ──────────────────────────────────────────────────────────────
  @Post()
  async create(@Req() req: AuthRequest, @Body() body: CreateAgentDto) {
    const tenantId = this.tenantId(req);
    this.logger.log(`Creating agent "${body.name}" for tenant ${tenantId}`);
    try {
      const agent = await this.agentService.create(tenantId, body, req.firebaseUser?.uid ?? 'api');
      return { success: true, agent, message: `Agent "${agent.name}" created` };
    } catch (err) {
      throw new HttpException((err as Error).message || 'Failed to create agent', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── UPDATE (tenant-scoped) ──────────────────────────────────────────────
  @Put(':id')
  async update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: UpdateAgentDto) {
    this.logger.log(`Updating agent ${id}`);
    try {
      const agent = await this.agentService.update(id, this.tenantId(req), body);
      return { success: true, agent, message: 'Agent updated' };
    } catch (err) {
      const status =
        (err as Error).name === 'NotFoundException' ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException((err as Error).message || 'Failed to update agent', status);
    }
  }

  // ─── DELETE (tenant-scoped) ──────────────────────────────────────────────
  @Delete(':id')
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    this.logger.log(`Deleting agent ${id}`);
    const deleted = await this.agentService.delete(id, this.tenantId(req));
    if (!deleted) throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    return { success: true, message: 'Agent deleted' };
  }
}
