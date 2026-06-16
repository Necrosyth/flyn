import { Controller, Get, Post, Body, Param, Query, HttpException, HttpStatus, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomNodeService } from './custom-node.service';
import { ApiOrFirebaseAuthGuard } from '../../billing/guards/api-or-firebase-auth.guard';
import { TenantFromAuthInterceptor } from '../../common/tenant-from-auth.interceptor';

/**
 * Custom (AI) Nodes — management API.
 * Base path: /api/custom-nodes
 *
 * Feeds the frontend useNodeSchemas() merge + the revision/rollback UI + the
 * human "promote to production" gate. Promotion is the only step that mutates
 * a node into the live/production state, and it is itself gated server-side
 * (tests must pass AND a production-grade sandbox must exist).
 */
@ApiTags('CustomNodes')
@Controller('custom-nodes')
@UseGuards(ApiOrFirebaseAuthGuard)
@UseInterceptors(TenantFromAuthInterceptor)
export class CustomNodesController {
  constructor(private readonly svc: CustomNodeService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) throw new HttpException('tenantId is required', HttpStatus.BAD_REQUEST);
    return tenantId;
  }

  /** Live custom nodes for the tenant (merged into the node palette/schemas). */
  @Get()
  async list(@Query('tenantId') tenantId: string) {
    return this.svc.list(this.requireTenant(tenantId));
  }

  /**
   * Author (or revise) a custom node draft directly — same engine the AI tool uses.
   * Always saved as a sandbox DRAFT; must pass tests + be promoted to go live.
   */
  @Post()
  async author(@Body() body: {
    tenantId: string; createdByUid?: string; nodeId: string;
    kind?: 'custom' | 'override'; targetType?: string; label: string;
    description?: string; schema?: any[]; code: string; testCases?: any[];
  }) {
    const tenantId = this.requireTenant(body?.tenantId);
    if (!body?.nodeId || !body?.code || !body?.label) {
      throw new HttpException('nodeId, label and code are required', HttpStatus.BAD_REQUEST);
    }
    return this.svc.authorDraft({
      tenantId,
      createdByUid: body.createdByUid || 'api',
      nodeId: body.nodeId,
      kind: body.kind === 'override' ? 'override' : 'custom',
      targetType: body.targetType,
      label: body.label,
      description: body.description,
      schema: body.schema ?? [],
      code: body.code,
      testCases: body.testCases ?? [],
    });
  }

  @Get(':nodeId')
  async get(@Param('nodeId') nodeId: string, @Query('tenantId') tenantId: string) {
    const def = await this.svc.get(this.requireTenant(tenantId), nodeId);
    if (!def) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    return def;
  }

  @Get(':nodeId/revisions')
  async revisions(@Param('nodeId') nodeId: string, @Query('tenantId') tenantId: string) {
    return { versions: await this.svc.revisions(this.requireTenant(tenantId), nodeId) };
  }

  /** Run the node's test suite in the sandbox (same path the AI loop uses). */
  @Post(':nodeId/test')
  async test(@Param('nodeId') nodeId: string, @Body() body: { tenantId: string }) {
    return this.svc.runTests(this.requireTenant(body?.tenantId), nodeId);
  }

  /** THE production gate — promote a tested node to live. */
  @Post(':nodeId/promote')
  async promote(@Param('nodeId') nodeId: string, @Body() body: { tenantId: string }) {
    try {
      return await this.svc.promote(this.requireTenant(body?.tenantId), nodeId);
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /** One-click rollback to a prior revision (creates a new version). */
  @Post(':nodeId/rollback')
  async rollback(@Param('nodeId') nodeId: string, @Body() body: { tenantId: string; version: number }) {
    return this.svc.rollback(this.requireTenant(body?.tenantId), nodeId, body.version);
  }
}
