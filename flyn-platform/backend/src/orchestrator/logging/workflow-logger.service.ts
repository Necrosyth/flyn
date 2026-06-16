import { Injectable, Logger, Scope } from '@nestjs/common';

/**
 * Log levels
 */
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

/**
 * Structured log entry
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    context: string;
    message: string;
    workflowRunId?: string;
    nodeId?: string;
    tenantId?: string;
    userId?: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
}

/**
 * Workflow Logger Service
 * 
 * Provides structured logging for workflow execution.
 * Logs are formatted as JSON for easy parsing by log aggregators.
 * 
 * Features:
 * - Structured JSON output
 * - Workflow/node context injection
 * - Duration tracking
 * - Error serialization
 */
@Injectable({ scope: Scope.TRANSIENT })
export class WorkflowLoggerService {
    private readonly nestLogger = new Logger('Workflow');
    private context: Partial<LogEntry> = {};

    /**
     * Set the workflow context for all subsequent logs
     */
    setContext(context: Partial<Pick<LogEntry, 'workflowRunId' | 'nodeId' | 'tenantId' | 'userId'>>): void {
        this.context = { ...this.context, ...context };
    }

    /**
     * Clear the context
     */
    clearContext(): void {
        this.context = {};
    }

    /**
     * Log debug message
     */
    debug(message: string, metadata?: Record<string, unknown>): void {
        this.log(LogLevel.DEBUG, message, metadata);
    }

    /**
     * Log info message
     */
    info(message: string, metadata?: Record<string, unknown>): void {
        this.log(LogLevel.INFO, message, metadata);
    }

    /**
     * Log warning message
     */
    warn(message: string, metadata?: Record<string, unknown>): void {
        this.log(LogLevel.WARN, message, metadata);
    }

    /**
     * Log error message
     */
    error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
        const entry = this.buildEntry(LogLevel.ERROR, message, metadata);

        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        }

        this.emit(entry);
    }

    /**
     * Log with explicit level
     */
    log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
        const entry = this.buildEntry(level, message, metadata);
        this.emit(entry);
    }

    /**
     * Log node execution start
     */
    nodeStart(nodeId: string, nodeName: string, nodeType: string): void {
        this.info(`Node execution started: ${nodeName}`, {
            nodeId,
            nodeType,
            event: 'node_start',
        });
    }

    /**
     * Log node execution complete
     */
    nodeComplete(nodeId: string, nodeName: string, durationMs: number, output?: Record<string, unknown>): void {
        this.info(`Node execution completed: ${nodeName}`, {
            nodeId,
            durationMs,
            event: 'node_complete',
            outputKeys: output ? Object.keys(output) : [],
        });
    }

    /**
     * Log node execution failed
     */
    nodeFailed(nodeId: string, nodeName: string, error: Error, durationMs: number): void {
        this.error(`Node execution failed: ${nodeName}`, error, {
            nodeId,
            durationMs,
            event: 'node_failed',
        });
    }

    /**
     * Log workflow started
     */
    workflowStart(workflowId: string, workflowName: string): void {
        this.info(`Workflow execution started: ${workflowName}`, {
            workflowId,
            event: 'workflow_start',
        });
    }

    /**
     * Log workflow completed
     */
    workflowComplete(workflowId: string, workflowName: string, durationMs: number): void {
        this.info(`Workflow execution completed: ${workflowName}`, {
            workflowId,
            durationMs,
            event: 'workflow_complete',
        });
    }

    /**
     * Log workflow failed
     */
    workflowFailed(workflowId: string, workflowName: string, error: Error, durationMs: number): void {
        this.error(`Workflow execution failed: ${workflowName}`, error, {
            workflowId,
            durationMs,
            event: 'workflow_failed',
        });
    }

    /**
     * Build a log entry
     */
    private buildEntry(level: LogLevel, message: string, metadata?: Record<string, unknown>): LogEntry {
        return {
            timestamp: new Date().toISOString(),
            level,
            context: 'Workflow',
            message,
            ...this.context,
            metadata,
        };
    }

    /**
     * Emit the log entry
     */
    private emit(entry: LogEntry): void {
        // Output structured JSON in production, human-readable in development
        const isProduction = process.env.NODE_ENV === 'production';

        if (isProduction) {
            console.log(JSON.stringify(entry));
        } else {
            // Use NestJS logger for development
            const contextPrefix = entry.workflowRunId
                ? `[${entry.workflowRunId.substring(0, 8)}]`
                : '';
            const nodePrefix = entry.nodeId ? `[${entry.nodeId}]` : '';
            const fullMessage = `${contextPrefix}${nodePrefix} ${entry.message}`;

            switch (entry.level) {
                case LogLevel.DEBUG:
                    this.nestLogger.debug(fullMessage);
                    break;
                case LogLevel.INFO:
                    this.nestLogger.log(fullMessage);
                    break;
                case LogLevel.WARN:
                    this.nestLogger.warn(fullMessage);
                    break;
                case LogLevel.ERROR:
                    this.nestLogger.error(fullMessage, entry.error?.stack);
                    break;
            }
        }
    }
}
