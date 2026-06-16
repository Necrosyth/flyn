import {
    Controller,
    Post,
    Get,
    Body,
    Param,
    Query,
    HttpException,
    HttpStatus,
    Logger,
    Headers,
} from '@nestjs/common';
import { WorkflowRuntimeService } from './workflow-runtime';
import { OrchestratorService } from './orchestrator.service';
import { WorkflowStorageService } from './workflow-storage';
import { WorkflowRunStatus } from './types';
import * as crypto from 'crypto';

/**
 * Webhook Resume Request
 */
interface WebhookResumeRequest {
    data?: Record<string, unknown>;
}

/**
 * Webhook Controller
 * 
 * Handles incoming webhooks to resume waiting workflows.
 * Each waiting workflow gets a unique webhook URL that can be called
 * to resume execution with provided data.
 * 
 * Base path: /api/webhooks
 */
@Controller('webhooks')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        private readonly runtime: WorkflowRuntimeService,
        private readonly orchestrator: OrchestratorService,
        private readonly storage: WorkflowStorageService,
    ) { }

    /**
     * Resume a workflow via webhook
     * POST /api/webhooks/resume/:runId/:token
     * 
     * The token is a security measure to prevent unauthorized resume
     */
    @Post('resume/:runId/:token')
    async resumeWorkflow(
        @Param('runId') runId: string,
        @Param('token') token: string,
        @Body() body: WebhookResumeRequest,
        @Headers('x-webhook-signature') signature?: string,
    ) {
        this.logger.log(`Webhook received for workflow: ${runId}`);

        // Get the workflow run
        const workflowRun = await this.runtime.getWorkflowRun(runId);

        if (!workflowRun) {
            throw new HttpException('Workflow run not found', HttpStatus.NOT_FOUND);
        }

        // Verify token (simple check - in production use HMAC signature)
        const expectedToken = this.generateToken(runId, workflowRun.workflowId);
        if (token !== expectedToken) {
            this.logger.warn(`Invalid webhook token for workflow: ${runId}`);
            throw new HttpException('Invalid webhook token', HttpStatus.UNAUTHORIZED);
        }

        // Check if workflow is in WAITING status
        if (workflowRun.status !== WorkflowRunStatus.WAITING) {
            throw new HttpException(
                `Workflow is not waiting. Current status: ${workflowRun.status}`,
                HttpStatus.BAD_REQUEST,
            );
        }

        // Resume the workflow
        const resumeData = {
            source: 'webhook',
            receivedAt: new Date().toISOString(),
            ...body.data,
        };

        const result = await this.orchestrator.resumeWorkflow(runId, resumeData);

        if (!result) {
            throw new HttpException('Failed to resume workflow', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        return {
            success: true,
            runId: result.id,
            status: result.status,
            message: 'Workflow resumed successfully',
        };
    }

    /**
     * Get webhook URL for a waiting workflow
     * GET /api/webhooks/url/:runId
     */
    @Get('url/:runId')
    async getWebhookUrl(@Param('runId') runId: string) {
        const workflowRun = await this.runtime.getWorkflowRun(runId);

        if (!workflowRun) {
            throw new HttpException('Workflow run not found', HttpStatus.NOT_FOUND);
        }

        if (workflowRun.status !== WorkflowRunStatus.WAITING) {
            throw new HttpException(
                `Workflow is not waiting. Current status: ${workflowRun.status}`,
                HttpStatus.BAD_REQUEST,
            );
        }

        const token = this.generateToken(runId, workflowRun.workflowId);
        const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';

        return {
            runId,
            status: workflowRun.status,
            webhookUrl: `${baseUrl}/api/webhooks/resume/${runId}/${token}`,
            method: 'POST',
            example: {
                url: `${baseUrl}/api/webhooks/resume/${runId}/${token}`,
                body: { data: { approved: true, comment: 'Looks good!' } },
            },
        };
    }

    /**
     * Approval webhook - specialized for approval nodes
     * POST /api/webhooks/approve/:runId/:token
     */
    @Post('approve/:runId/:token')
    async approveWorkflow(
        @Param('runId') runId: string,
        @Param('token') token: string,
        @Body() body: { approved: boolean; comment?: string; approver?: string },
    ) {
        this.logger.log(`Approval webhook for workflow: ${runId}, approved: ${body.approved}`);

        const workflowRun = await this.runtime.getWorkflowRun(runId);

        if (!workflowRun) {
            throw new HttpException('Workflow run not found', HttpStatus.NOT_FOUND);
        }

        const expectedToken = this.generateToken(runId, workflowRun.workflowId);
        if (token !== expectedToken) {
            throw new HttpException('Invalid webhook token', HttpStatus.UNAUTHORIZED);
        }

        if (workflowRun.status !== WorkflowRunStatus.WAITING) {
            throw new HttpException(
                `Workflow is not waiting. Current status: ${workflowRun.status}`,
                HttpStatus.BAD_REQUEST,
            );
        }

        const resumeData = {
            source: 'approval_webhook',
            approved: body.approved,
            comment: body.comment,
            approver: body.approver || 'anonymous',
            approvedAt: new Date().toISOString(),
        };

        const result = await this.orchestrator.resumeWorkflow(runId, resumeData);

        if (!result) {
            throw new HttpException('Failed to process approval', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        return {
            success: true,
            runId: result.id,
            approved: body.approved,
            status: result.status,
        };
    }

    /**
     * Generate a simple token for webhook URL security
     * In production, use proper HMAC with secret key
     */
    private generateToken(runId: string, workflowId: string): string {
        const secret = process.env.WEBHOOK_SECRET || 'flyn-dev-secret';
        const data = `${runId}:${workflowId}`;
        return crypto.createHmac('sha256', secret).update(data).digest('hex').substring(0, 32);
    }
}
