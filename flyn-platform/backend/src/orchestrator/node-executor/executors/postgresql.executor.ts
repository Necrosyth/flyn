/**
 * PostgreSQL Executor
 *
 * Executes PostgreSQL queries and returns results for workflow processing.
 * Supports:
 *   1. Manual SQL query input
 *   2. AI-powered query generation — type a NLP prompt and the AI provider
 *      will build the SQL query (just like the MongoDB node).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { BaseExecutor } from '../base-executor';
import {
    CompiledNode,
    NodeExecutionContext,
    NodeResult,
    NodeType,
} from '../../types';
import { AIProviderService } from '../../ai-provider';

// ─── Config & Output interfaces ────────────────────────────────────────────

export interface PostgreSQLConfig {
    /** Connection string (e.g. postgresql://user:pass@host:5432/db) */
    connectionString?: string;

    /** Individual connection fields (used if connectionString is empty) */
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;

    /** The SQL query to execute (manual mode) */
    query?: string;

    /** Query parameters for $1, $2 placeholders */
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

export interface PostgreSQLOutput {
    success: boolean;
    operation: string;
    rowCount: number;
    result: unknown;
    executedQuery: string;
    executedParams?: unknown[];
}

// ─── Executor ──────────────────────────────────────────────────────────────

@Injectable()
export class PostgreSQLExecutor extends BaseExecutor {
    private readonly logger = new Logger(PostgreSQLExecutor.name);
    readonly nodeType = NodeType.POSTGRESQL;
    readonly displayName = 'PostgreSQL Query';
    readonly description =
        'Execute PostgreSQL queries — manual SQL or AI-generated from natural language';

    /** Connection pool cache keyed by connection string */
    private pools: Map<string, Pool> = new Map();

    constructor(private readonly aiProvider: AIProviderService) {
        super();
    }

    // ── Main execution ─────────────────────────────────────────────────────

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as unknown as PostgreSQLConfig;

        context.services.log(
            'info',
            `PostgreSQL node executing${config.table ? ' on table ' + config.table : ''}`,
            { nodeId: node.id },
        );

        try {
            const connStr = await this.resolveConnectionString(config, context);
            if (!connStr) {
                return this.failed(
                    'NO_CONNECTION_STRING',
                    'PostgreSQL connection string is required. Provide it in node config, secrets (POSTGRESQL_URI), or env (POSTGRESQL_DEFAULT_URI).',
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
                `PostgreSQL query completed: ${result.rowCount} rows`,
                { nodeId: node.id, operation: result.operation },
            );

            return this.completed({ ...result });
        } catch (error) {
            const err = error as Error;
            this.logger.error(`PostgreSQL error: ${err.message}`, err.stack);
            return this.failed('POSTGRESQL_ERROR', err.message, true, {
                originalError: err.message,
            });
        }
    }

    // ── Connection resolution ──────────────────────────────────────────────

    private async resolveConnectionString(
        config: PostgreSQLConfig,
        context: NodeExecutionContext,
    ): Promise<string | undefined> {
        // 1. From workflow secrets
        const secret = await context.services.getSecret('POSTGRESQL_URI');
        if (secret) return secret;

        // 2. From node config — full connection string
        if (config.connectionString) return config.connectionString;

        // 3. From node config — individual fields
        if (config.host && config.database) {
            const user = config.user || 'flyn';
            const password = config.password || '';
            const port = config.port || 5432;
            return `postgresql://${user}:${password}@${config.host}:${port}/${config.database}`;
        }

        // 4. From environment
        return process.env.POSTGRESQL_DEFAULT_URI;
    }

    // ── Query building (manual / AI) ───────────────────────────────────────

    private async buildQuery(
        config: PostgreSQLConfig,
        context: NodeExecutionContext,
        connStr: string,
    ): Promise<{ sql: string; params: unknown[] }> {
        // ── AI-generated query ──
        if (config.useAiQuery && config.aiQueryPrompt) {
            this.logger.log(
                `Generating PostgreSQL query from AI prompt: "${config.aiQueryPrompt}"`,
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
                        'postgresql',
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
    ): Promise<PostgreSQLOutput> {
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

        const queryResult: QueryResult = await pool.query(sql, params);

        return {
            success: true,
            operation,
            rowCount: queryResult.rowCount ?? queryResult.rows.length,
            result: queryResult.rows,
            executedQuery: sql,
            executedParams: params.length ? params : undefined,
        };
    }

    // ── Pool management ────────────────────────────────────────────────────

    private async getPool(connStr: string): Promise<Pool> {
        if (this.pools.has(connStr)) {
            return this.pools.get(connStr)!;
        }

        const pool = new Pool({ connectionString: connStr });
        this.pools.set(connStr, pool);
        this.logger.log('New PostgreSQL connection pool created');
        return pool;
    }

    // ── Schema introspection helpers ───────────────────────────────────────

    private async listTables(pool: Pool): Promise<string[]> {
        const res = await pool.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
        );
        return res.rows.map((r: any) => r.table_name);
    }

    private async describeTable(
        pool: Pool,
        table: string,
    ): Promise<{ column: string; type: string }[]> {
        const res = await pool.query(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
            [table],
        );
        return res.rows.map((r: any) => ({
            column: r.column_name,
            type: r.data_type,
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
                    `Closed PostgreSQL pool: ${uri.substring(0, 30)}...`,
                );
            } catch (error) {
                this.logger.error(
                    `Error closing PostgreSQL pool: ${(error as Error).message}`,
                );
            }
        }
        this.pools.clear();
    }
}
