/**
 * MySQL Executor
 *
 * Executes MySQL queries and returns results for workflow processing.
 * Supports:
 *   1. Manual SQL query input
 *   2. AI-powered query generation — type a NLP prompt and the AI provider
 *      will build the SQL query (just like the MongoDB & PostgreSQL nodes).
 */

import { Injectable, Logger } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { BaseExecutor } from '../base-executor';
import {
    CompiledNode,
    NodeExecutionContext,
    NodeResult,
    NodeType,
} from '../../types';
import { AIProviderService } from '../../ai-provider';

// ─── Config & Output interfaces ────────────────────────────────────────────

export interface MySQLConfig {
    /** Connection string (e.g. mysql://user:pass@host:3306/db) */
    connectionString?: string;

    /** Individual connection fields (used if connectionString is empty) */
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;

    /** The SQL query to execute (manual mode) */
    query?: string;

    /** Query parameters for ? placeholders */
    params?: string;

    /** Toggle: use AI to generate the query from NLP */
    useAiQuery?: boolean;

    /** Natural-language description of the query (AI mode) */
    aiQueryPrompt?: string;

    /** Optional: restrict to a specific table (helps AI) */
    table?: string;

    /** Limit rows returned (SELECT queries) */
    limit?: number;
}

export interface MySQLOutput {
    success: boolean;
    operation: string;
    rowCount: number;
    result: unknown;
    executedQuery: string;
    executedParams?: unknown[];
}

// ─── Executor ──────────────────────────────────────────────────────────────

@Injectable()
export class MySQLExecutor extends BaseExecutor {
    private readonly logger = new Logger(MySQLExecutor.name);
    readonly nodeType = NodeType.MYSQL;
    readonly displayName = 'MySQL Query';
    readonly description =
        'Execute MySQL queries — manual SQL or AI-generated from natural language';

    /** Connection pool cache keyed by connection string */
    private pools: Map<string, mysql.Pool> = new Map();

    constructor(private readonly aiProvider: AIProviderService) {
        super();
    }

    // ── Main execution ─────────────────────────────────────────────────────

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as unknown as MySQLConfig;

        context.services.log(
            'info',
            `MySQL node executing${config.table ? ' on table ' + config.table : ''}`,
            { nodeId: node.id },
        );

        try {
            const connStr = await this.resolveConnectionString(config, context);
            if (!connStr) {
                return this.failed(
                    'NO_CONNECTION_STRING',
                    'MySQL connection string is required. Provide it in node config, secrets (MYSQL_URI), or env (MYSQL_DEFAULT_URI).',
                    false,
                );
            }

            // Build the final SQL (possibly via AI)
            const { sql, params } = await this.buildQuery(config, context, connStr);

            if (!sql) {
                return this.failed(
                    'NO_QUERY',
                    'No SQL query provided. Enter a query manually or describe it for AI generation.',
                    false,
                );
            }

            const result = await this.executeQuery(connStr, sql, params);

            context.services.log(
                'info',
                `MySQL query completed: ${result.rowCount} rows`,
                { nodeId: node.id, operation: result.operation },
            );

            return this.completed({ ...result });
        } catch (error) {
            const err = error as Error;
            this.logger.error(`MySQL error: ${err.message}`, err.stack);
            return this.failed('MYSQL_ERROR', err.message, true, {
                originalError: err.message,
            });
        }
    }

    // ── Connection resolution ──────────────────────────────────────────────

    private async resolveConnectionString(
        config: MySQLConfig,
        context: NodeExecutionContext,
    ): Promise<string | undefined> {
        // 1. From workflow secrets
        const secret = await context.services.getSecret('MYSQL_URI');
        if (secret) return secret;

        // 2. From node config — full connection string
        if (config.connectionString) return config.connectionString;

        // 3. From node config — individual fields
        if (config.host && config.database) {
            const user = config.user || 'flyn';
            const password = config.password || '';
            const port = config.port || 3306;
            return `mysql://${user}:${password}@${config.host}:${port}/${config.database}`;
        }

        // 4. From environment
        return process.env.MYSQL_DEFAULT_URI;
    }

    // ── Query building (manual / AI) ───────────────────────────────────────

    private async buildQuery(
        config: MySQLConfig,
        context: NodeExecutionContext,
        connStr: string,
    ): Promise<{ sql: string; params: unknown[] }> {
        // ── AI-generated query ──
        if (config.useAiQuery && config.aiQueryPrompt) {
            this.logger.log(
                `Generating MySQL query from AI prompt: "${config.aiQueryPrompt}"`,
            );

            if (!this.aiProvider.isAvailable()) {
                this.logger.warn(
                    'AI provider not available — falling back to manual query',
                );
            } else {
                try {
                    // Introspect table schema for better AI results
                    let tableSchemas:
                        | Record<string, { column: string; type: string }[]>
                        | undefined;
                    let availableTables: string[] | undefined;

                    try {
                        const pool = await this.getPool(connStr);
                        availableTables = await this.listTables(pool);
                        if (config.table) {
                            const cols = await this.describeTable(
                                pool,
                                config.table,
                            );
                            if (cols.length) {
                                tableSchemas = { [config.table]: cols };
                            }
                        } else if (availableTables.length <= 15) {
                            // Small DB — describe all tables
                            tableSchemas = {};
                            for (const t of availableTables) {
                                tableSchemas[t] = await this.describeTable(
                                    pool,
                                    t,
                                );
                            }
                        }
                    } catch (schemaErr) {
                        this.logger.warn(
                            `Schema introspection failed (non-fatal): ${(schemaErr as Error).message}`,
                        );
                    }

                    const aiResult = await this.aiProvider.generateSQLQuery(
                        config.aiQueryPrompt,
                        'mysql',
                        { availableTables, tableSchemas },
                    );

                    const ai = aiResult.data;
                    this.logger.log(
                        `AI generated SQL: ${ai.sql} (confidence: ${ai.confidence})`,
                    );

                    let finalSql = ai.sql.replace(/;\s*$/, '');
                    if (
                        config.limit &&
                        ai.operation === 'select' &&
                        !/LIMIT\s+\d+/i.test(finalSql)
                    ) {
                        finalSql += ` LIMIT ${config.limit}`;
                    }

                    return { sql: finalSql, params: ai.params || [] };
                } catch (aiErr) {
                    this.logger.error(
                        `AI query generation failed: ${(aiErr as Error).message} — falling back`,
                    );
                }
            }
        }

        // ── Manual query ──
        let sql = (config.query || '').replace(/;\s*$/, '');
        sql = this.interpolateTemplates(sql, context.previousOutputs);

        let params: unknown[] = [];
        if (config.params) {
            try {
                const interpolated = this.interpolateTemplates(
                    config.params,
                    context.previousOutputs,
                );
                params = JSON.parse(interpolated);
            } catch {
                // params stay empty
            }
        }

        // Append LIMIT if needed
        if (
            config.limit &&
            /^\s*SELECT/i.test(sql) &&
            !/LIMIT\s+\d+/i.test(sql)
        ) {
            sql += ` LIMIT ${config.limit}`;
        }

        return { sql, params };
    }

    // ── Query execution ────────────────────────────────────────────────────

    private async executeQuery(
        connStr: string,
        sql: string,
        params: unknown[],
    ): Promise<MySQLOutput> {
        const pool = await this.getPool(connStr);

        const trimmed = sql.trim().toUpperCase();
        const operation = trimmed.startsWith('SELECT')
            ? 'select'
            : trimmed.startsWith('INSERT')
                ? 'insert'
                : trimmed.startsWith('UPDATE')
                    ? 'update'
                    : trimmed.startsWith('DELETE')
                        ? 'delete'
                        : 'raw';

        const [rows, fields] = await pool.execute(sql, params as any[]);

        // mysql2 returns an array for SELECT and an OkPacket for DML
        const isArray = Array.isArray(rows);

        return {
            success: true,
            operation,
            rowCount: isArray
                ? (rows as any[]).length
                : (rows as any).affectedRows ?? 0,
            result: isArray ? rows : { affectedRows: (rows as any).affectedRows, insertId: (rows as any).insertId },
            executedQuery: sql,
            executedParams: params.length ? params : undefined,
        };
    }

    // ── Pool management ────────────────────────────────────────────────────

    private async getPool(connStr: string): Promise<mysql.Pool> {
        if (this.pools.has(connStr)) {
            return this.pools.get(connStr)!;
        }

        const pool = mysql.createPool({ uri: connStr, waitForConnections: true, connectionLimit: 10 });
        this.pools.set(connStr, pool);
        this.logger.log('New MySQL connection pool created');
        return pool;
    }

    // ── Schema introspection helpers ───────────────────────────────────────

    private async listTables(pool: mysql.Pool): Promise<string[]> {
        const [rows] = await pool.query('SHOW TABLES');
        // SHOW TABLES returns rows like { Tables_in_dbname: 'tablename' }
        return (rows as any[]).map((r: any) => Object.values(r)[0] as string);
    }

    private async describeTable(
        pool: mysql.Pool,
        table: string,
    ): Promise<{ column: string; type: string }[]> {
        const [rows] = await pool.query(
            `SELECT COLUMN_NAME AS col, DATA_TYPE AS dtype FROM information_schema.COLUMNS WHERE TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
            [table],
        );
        return (rows as any[]).map((r: any) => ({
            column: r.col,
            type: r.dtype,
        }));
    }

    // ── Template interpolation ─────────────────────────────────────────────

    private interpolateTemplates(
        template: string,
        data: Record<string, unknown>,
    ): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = this.getNestedValue(data, path.trim());
            return value !== undefined ? String(value) : `{{${path}}}`;
        });
    }

    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        const tokens = path
            .replace(/\[(\d+)\]/g, '.$1')
            .replace(/\["([^"]+)"\]/g, '.$1')
            .replace(/\['([^']+)'\]/g, '.$1')
            .split('.')
            .filter(Boolean);

        return tokens.reduce((current, key) => {
            if (current === undefined || current === null) return undefined;
            if (Array.isArray(current)) {
                const idx = Number(key);
                if (Number.isInteger(idx)) return current[idx];
                const first = current[0];
                if (first && typeof first === 'object') {
                    return (first as Record<string, unknown>)[key];
                }
                return undefined;
            }
            if (typeof current === 'object') {
                return (current as Record<string, unknown>)[key];
            }
            return undefined;
        }, obj as unknown);
    }

    // ── Cleanup ────────────────────────────────────────────────────────────

    async cleanup(context: NodeExecutionContext): Promise<void> {
        for (const [uri, pool] of this.pools) {
            try {
                await pool.end();
                this.logger.debug(
                    `Closed MySQL pool: ${uri.substring(0, 30)}...`,
                );
            } catch (error) {
                this.logger.error(
                    `Error closing MySQL pool: ${(error as Error).message}`,
                );
            }
        }
        this.pools.clear();
    }
}
