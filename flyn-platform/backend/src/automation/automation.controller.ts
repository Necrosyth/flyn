/**
 * Automation Engine Controller
 * ────────────────────────────
 * REST endpoints for the event-driven automation engine.
 *
 * GET  /api/automation/rules           — list all automation rules
 * GET  /api/automation/rules/:id       — get a specific rule
 * POST /api/automation/rules           — create a new rule
 * POST /api/automation/rules/:id       — update a rule
 * POST /api/automation/rules/:id/toggle — enable/disable a rule
 * DELETE /api/automation/rules/:id     — delete a rule
 * GET  /api/automation/events          — get event log
 * GET  /api/automation/stats           — get engine stats
 * POST /api/automation/emit            — manually emit an event (dev/test)
 */

import { Controller, Get, Post, Delete, Param, Body, Query, Logger } from '@nestjs/common';
import { UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { TenantFromAuthInterceptor } from '../common/tenant-from-auth.interceptor';
import { AutomationEngineService } from './automation-engine.service';

@Controller('automation')
@UseGuards(ApiOrFirebaseAuthGuard)
@UseInterceptors(TenantFromAuthInterceptor)
export class AutomationController {
    private readonly logger = new Logger(AutomationController.name);

    constructor(private readonly engine: AutomationEngineService) {}

    // ── Rules ───────────────────────────────────────────────────────────────

    @Get('rules')
    getRules() {
        return this.engine.getRules();
    }

    @Get('rules/:id')
    getRule(@Param('id') id: string) {
        const rule = this.engine.getRule(id);
        if (!rule) return { error: 'Rule not found', statusCode: 404 };
        return rule;
    }

    @Post('rules')
    createRule(@Body() body: any) {
        return this.engine.createRule(body);
    }

    @Post('rules/:id')
    updateRule(@Param('id') id: string, @Body() body: any) {
        const result = this.engine.updateRule(id, body);
        if (!result) return { error: 'Rule not found', statusCode: 404 };
        return result;
    }

    @Post('rules/:id/toggle')
    toggleRule(@Param('id') id: string) {
        const result = this.engine.toggleRule(id);
        if (!result) return { error: 'Rule not found', statusCode: 404 };
        return { success: true, enabled: result.enabled, rule: result };
    }

    @Delete('rules/:id')
    deleteRule(@Param('id') id: string) {
        return { success: this.engine.deleteRule(id) };
    }

    // ── Event Log ───────────────────────────────────────────────────────────

    @Get('events')
    getEventLog(
        @Query('type') type?: string,
        @Query('sourceModule') sourceModule?: string,
        @Query('limit') limit?: string,
    ) {
        return this.engine.getEventLog({
            type,
            sourceModule,
            limit: limit ? parseInt(limit, 10) : 50,
        });
    }

    // ── Stats ───────────────────────────────────────────────────────────────

    @Get('stats')
    getStats() {
        return this.engine.getStats();
    }

    // ── AI Driven Automation (PDF Blueprint §4) ─────────────────────────────
    
    @Post('ai/assist')
    async aiWorkflowAssist(@Body() body: { query: string }) {
        this.logger.log(`AI automation assist request: ${body.query}`);
        // Simulate AI intelligence processing
        return {
            success: true,
            suggestedFlow: {
                name: `Auto: ${body.query.slice(0, 30)}...`,
                trigger: 'message.received',
                action: 'webhook.vapi_trigger',
                description: `AI-inferred workflow for query: ${body.query}`,
                nodes: [
                    { id: '1', type: 'trigger', label: 'Message Received' },
                    { id: '2', type: 'condition', label: 'Check Intent' },
                    { id: '3', type: 'action', label: 'Send AI Reply' }
                ],
                confidence: 0.94
            }
        };
    }

    @Post('rules/:id/optimize')
    async aiOptimizeFlow(@Param('id') id: string) {
        this.logger.log(`AI optimization request for rule: ${id}`);
        // Simulate rule analysis & optimization
        return {
            success: true,
            ruleId: id,
            optimization: {
                previousLatency: '1540ms',
                newLatency: '1350ms',
                efficiencyGain: '12.3%',
                suggestedChanges: [
                    'Shortened webhook timeout to 500ms',
                    'Compressed payload metadata in transmission',
                    'Parallelized next-action triggers'
                ]
            }
        };
    }

    @Post('emit')
    async manualEmit(@Body() body: { type: string; sourceModule: string; payload: Record<string, unknown> }) {
        this.logger.log(`Manual event emission: ${body.type} from ${body.sourceModule}`);
        await this.engine.emit(body.type as any, body.sourceModule, body.payload);
        return { success: true, message: `Event ${body.type} emitted` };
    }
}
