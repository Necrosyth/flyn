import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { AxiosError, AxiosRequestConfig, Method } from 'axios';
import * as vm from 'vm';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';
import { MailService } from '../../../mail/mail.service';

/**
 * Action Executor
 * 
 * Executes an action immediately and returns COMPLETED.
 * Actions are the most common node type - they do something
 * and produce an output.
 * 
 * Supported Actions:
 * - http_request: Make HTTP calls to external APIs
 * - email: Send emails
 * - slack: Post to Slack (placeholder)
 * - log: Simple logging
 * - transform: Data transformation
 */
@Injectable()
export class ActionExecutor extends BaseExecutor {
    private readonly logger = new Logger(ActionExecutor.name);
    readonly nodeType = NodeType.ACTION;
    readonly displayName = 'Action';
    readonly description = 'Executes an action and produces output';

    constructor(
        private readonly httpService: HttpService,
        private readonly mail: MailService,
    ) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const { config } = node;
        // Support both camelCase (JSON/API) and snake_case (UI form) field names
        const actionType = (config.actionType || config.action_type) as string;

        context.services.log('info', `Executing action: ${actionType}`, {
            nodeId: node.id,
            config,
        });

        try {
            const output = await this.executeAction(actionType, config, context);

            return this.completed({
                success: true,
                actionType,
                result: output,
                executedAt: new Date().toISOString(),
            });
        } catch (error) {
            const err = error as Error;
            context.services.log('error', `Action failed: ${err.message}`, {
                nodeId: node.id,
                error: err.message,
            });

            return this.failed(
                'ACTION_EXECUTION_ERROR',
                err.message,
                true,
                { actionType, originalError: err.message },
            );
        }
    }

    private async executeAction(
        actionType: string,
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Promise<Record<string, unknown>> {
        switch (actionType) {
            case 'http_request':
                return this.executeHttpRequest(config, context);

            case 'email':
                return this.executeEmail(config, context);

            case 'slack':
                return this.executeSlack(config, context);

            case 'log': {
                const rawMessage = config.message as string || 'Log action executed';
                const resolvedMessage = this.interpolateString(rawMessage, context.previousOutputs);
                context.services.log('info', resolvedMessage);
                return { logged: true, message: resolvedMessage };
            }

            case 'transform':
                return this.executeTransform(config, context);

            default:
                return {
                    actionType,
                    config,
                    executed: true,
                    note: 'Generic action executed - implement specific handler for production',
                };
        }
    }

    /**
     * Execute HTTP Request Action
     * 
     * Config:
     * - url: string (required) - The URL to call
     * - method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' (default: 'GET')
     * - headers: Record<string, string> - Request headers
     * - body: any - Request body (for POST/PUT/PATCH)
     * - queryParams: Record<string, string> - Query parameters
     * - timeoutMs: number - Request timeout in milliseconds (default: 30000)
     * - parseResponse: boolean - Whether to parse JSON response (default: true)
     */
    private async executeHttpRequest(
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Promise<Record<string, unknown>> {
        const url = config.url as string;
        if (!url) {
            throw new Error('HTTP request requires a URL');
        }

        const method = (config.method as Method) || 'GET';
        const headers = (config.headers as Record<string, string>) || {};
        const body = config.body;
        const queryParams = config.queryParams as Record<string, string>;
        const timeoutMs = (config.timeoutMs as number) || 30000;
        const parseResponse = config.parseResponse !== false;

        // Interpolate variables from previous outputs
        const interpolatedUrl = this.interpolateString(url, context.previousOutputs);
        const interpolatedHeaders = this.interpolateObject(headers, context.previousOutputs);
        const interpolatedBody = body ? this.interpolateObject(body as Record<string, unknown>, context.previousOutputs) : undefined;

        const axiosConfig: AxiosRequestConfig = {
            url: interpolatedUrl,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...interpolatedHeaders,
            },
            params: queryParams,
            data: interpolatedBody,
        };

        this.logger.debug(`HTTP ${method} ${interpolatedUrl}`, { headers: axiosConfig.headers });

        try {
            const response = await firstValueFrom(
                this.httpService.request(axiosConfig).pipe(
                    timeout(timeoutMs),
                    catchError((error: AxiosError) => {
                        throw this.formatAxiosError(error);
                    }),
                ),
            );

            return {
                statusCode: response.status,
                statusText: response.statusText,
                headers: response.headers,
                data: parseResponse ? response.data : String(response.data),
                requestUrl: interpolatedUrl,
                requestMethod: method,
            };
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`HTTP request failed: ${String(error)}`);
        }
    }

    /**
     * Execute Email Action
     *
     * Config:
     * - to: string | string[] (required) - Recipient email(s)
     * - subject: string (required) - Email subject
     * - body: string (required) - Email body (HTML or text)
     * - from: string - Sender email (default: from env)
     * - isHtml: boolean - Whether body is HTML (default: true)
     */
    private async executeEmail(
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Promise<Record<string, unknown>> {
        const to = config.to as string | string[];
        const subject = config.subject as string;
        const body = config.body as string;
        const from = (config.from as string) || process.env.EMAIL_FROM || 'noreply@flyn.ai';
        const isHtml = config.isHtml === true;

        if (!to || !subject || !body) {
            throw new Error('Email requires to, subject, and body fields');
        }

        // Interpolate variables
        const interpolatedSubject = this.interpolateString(subject, context.previousOutputs);
        const interpolatedBody = this.interpolateString(body, context.previousOutputs);
        const interpolatedFrom = this.interpolateString(from, context.previousOutputs);
        const recipients = Array.isArray(to) ? to : [to];

        this.logger.log(`Sending Email to ${recipients.join(', ')}`);

        try {
            const results = await Promise.all(recipients.map(recipient => 
                this.mail.sendEmail({
                    to: recipient,
                    subject: interpolatedSubject,
                    [isHtml ? 'html' : 'text']: interpolatedBody,
                    from: interpolatedFrom || undefined,
                })
            ));

            return {
                sent: true,
                from: interpolatedFrom,
                recipients,
                subject: interpolatedSubject,
                messageIds: results.map(r => r.messageId),
                sentAt: new Date().toISOString(),
            };
        } catch (err: any) {
            this.logger.error(`Failed to send email in action executor: ${err.message}`);
            throw err;
        }
    }
    /**
     * Execute Slack Action (Placeholder)
     */
    private async executeSlack(
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Promise<Record<string, unknown>> {
        const channel = config.channel as string;
        const message = config.message as string;

        if (!channel || !message) {
            throw new Error('Slack requires channel and message fields');
        }

        const interpolatedMessage = this.interpolateString(message, context.previousOutputs);

        this.logger.log(`[MOCK SLACK] Channel: ${channel}`);
        this.logger.log(`[MOCK SLACK] Message: ${interpolatedMessage}`);

        return {
            sent: true,
            mock: true,
            channel,
            message: interpolatedMessage,
            sentAt: new Date().toISOString(),
            note: 'Slack is currently mocked. Integrate Slack API for production.',
        };
    }

    /**
     * Execute Transform Action
     *
     * Supports:
     *   - transformType: 'merge' | 'pick' | 'map'  (simple built-ins)
     *   - script: string  (custom JS — receives `inputs` object, must return a value)
     *
     * Script example:
     *   const customers = inputs['pg_ai_1'].result || [];
     *   const orderMap = {};
     *   for (const o of (inputs['mysql_ai_1'].result || [])) {
     *     orderMap[String(o.customer_id)] = o;
     *   }
     *   return customers.map(c => ({
     *     ...c,
     *     total_revenue: orderMap[String(c.id)]?.total_revenue || 0,
     *     lead_score: Math.min(100, Math.round((orderMap[String(c.id)]?.total_revenue || 0) / 1000))
     *   }));
     */
    private executeTransform(
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Record<string, unknown> {
        const input = context.previousOutputs;

        // ── Custom script execution (sandboxed via Node.js vm) ───────────────
        const scriptSrc = config.script as string | undefined;
        if (scriptSrc && scriptSrc.trim()) {
            try {
                // Wrap in an IIFE so bare `return` statements work
                const wrapped = `(function(inputs) { ${scriptSrc} })(inputs)`;
                const sandbox = vm.createContext({
                    inputs: input,
                    Math,
                    JSON,
                    String,
                    Number,
                    Boolean,
                    Array,
                    Object,
                    parseFloat,
                    parseInt,
                    isNaN,
                    console: { log: (...a: unknown[]) => this.logger.debug('[transform script]', ...a) },
                });
                const result = vm.runInContext(wrapped, sandbox, { timeout: 5000 });
                return { result };
            } catch (err) {
                throw new Error(`Transform script error: ${(err as Error).message}`);
            }
        }

        // ── Built-in transform types ─────────────────────────────────────────
        const transformType = config.transformType as string;

        switch (transformType) {
            case 'merge':
                return { merged: { ...input } };

            case 'pick': {
                const keys = (config.keys as string[]) || [];
                const picked: Record<string, unknown> = {};
                keys.forEach(key => {
                    if (key in input) picked[key] = input[key];
                });
                return { picked };
            }

            case 'map': {
                const sourceKey = config.sourceKey as string;
                const mapping = config.mapping as Record<string, string>;
                const sourceData = input[sourceKey];
                if (!sourceData || !mapping) {
                    return { mapped: null };
                }
                const mapped: Record<string, unknown> = {};
                Object.entries(mapping).forEach(([from, to]) => {
                    if (typeof sourceData === 'object' && sourceData !== null && from in sourceData) {
                        mapped[to] = (sourceData as Record<string, unknown>)[from];
                    }
                });
                return { mapped };
            }

            default:
                return { transformed: input };
        }
    }

    /**
     * Interpolate variables in a string using {{variablePath}} syntax
     */
    private interpolateString(template: string, data: Record<string, unknown>): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = this.getNestedValue(data, path.trim());
            if (value === undefined) return `{{${path}}}`;
            if (typeof value === 'object' && value !== null) {
                return JSON.stringify(value);
            }
            return String(value);
        });
    }

    /**
     * Interpolate variables in an object recursively
     */
    private interpolateObject(
        obj: Record<string, unknown>,
        data: Record<string, unknown>,
    ): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = this.interpolateString(value, data);
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                result[key] = this.interpolateObject(value as Record<string, unknown>, data);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Get a nested value from an object using dot notation and bracket syntax.
     * Supports paths like: "result[0].city", "data.items[2].name", "trigger.payload"
     */
    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        // Parse the path into segments, handling both dot and bracket notation
        // e.g. "result[0].city" → ['result', '0', 'city']
        const segments = path
            .replace(/\[(\d+)\]/g, '.$1') // result[0] → result.0
            .split('.')
            .filter(Boolean);

        let current: unknown = obj;

        for (const segment of segments) {
            if (current === null || current === undefined) return undefined;

            if (Array.isArray(current)) {
                const index = Number(segment);
                if (Number.isNaN(index)) return undefined;
                current = current[index];
            } else if (typeof current === 'object') {
                current = (current as Record<string, unknown>)[segment];
            } else {
                return undefined;
            }
        }

        return current;
    }

    /**
     * Format Axios error into a readable message
     */
    private formatAxiosError(error: AxiosError): Error {
        if (error.response) {
            const status = error.response.status;
            const statusText = error.response.statusText;
            const data = error.response.data;
            return new Error(
                `HTTP ${status} ${statusText}: ${JSON.stringify(data).substring(0, 500)}`,
            );
        } else if (error.request) {
            return new Error(`No response received: ${error.message}`);
        } else {
            return new Error(`Request setup failed: ${error.message}`);
        }
    }
}
