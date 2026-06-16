/**
 * MongoDB Executor
 * 
 * Executes MongoDB queries and returns results for workflow processing.
 * Supports AI-powered query generation: type a natural language prompt
 * and the node will call the AI provider to build the MongoDB query.
 */

import { Injectable, Logger } from '@nestjs/common';
import { MongoClient, Db, Collection, Document, FindOptions } from 'mongodb';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';
import { AIProviderService } from '../../ai-provider';
import { DataSourcesService } from '../../../data-sources';

export interface MongoDBConfig {
    // Saved data source ID (preferred — resolves connection string automatically)
    dataSourceId?: string;

    // Connection string (can be from secrets)
    connectionString?: string;

    // Database name
    database: string;

    // Collection name
    collection: string;

    // Operation to perform
    operation: 'find' | 'findOne' | 'aggregate' | 'count';

    // Query filter (for find/findOne/count)
    query?: Record<string, unknown>;

    // Aggregation pipeline (for aggregate)
    pipeline?: Record<string, unknown>[];

    // Field projection
    projection?: Record<string, number>;

    // Sort order
    sort?: Record<string, 1 | -1>;

    // Limit results
    limit?: number;

    // Skip results (pagination)
    skip?: number;

    // Natural language prompt — AI will generate the query from this text
    aiQueryPrompt?: string;

    // (Legacy) Reference output from a previous AI Router node
    useQueryFrom?: string;
}

export interface MongoDBOutput {
    success: boolean;
    operation: string;
    collection: string;
    resultCount: number;
    result: unknown;
    executedQuery: Record<string, unknown>;
}

@Injectable()
export class MongoDBExecutor extends BaseExecutor {
    private readonly logger = new Logger(MongoDBExecutor.name);
    readonly nodeType = NodeType.MONGODB;
    readonly displayName = 'MongoDB Query';
    readonly description = 'Execute MongoDB queries and retrieve data';

    // Connection pool for reuse
    private connections: Map<string, MongoClient> = new Map();

    constructor(
        private readonly aiProvider: AIProviderService,
        private readonly dataSourcesService: DataSourcesService,
    ) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as unknown as MongoDBConfig;

        context.services.log('info', `MongoDB executing ${config.operation} on ${config.collection}`, {
            nodeId: node.id,
        });

        try {
            // Get connection string from secrets or config
            const connectionString = await this.getConnectionString(config, context);

            if (!connectionString) {
                return this.failed(
                    'NO_CONNECTION_STRING',
                    'MongoDB connection string is required. Set it in secrets or config.',
                    false,
                );
            }

            // Build the final query (possibly from AI-generated natural language)
            const finalConfig = await this.buildFinalConfig(config, context);

            // Execute the query
            const result = await this.executeQuery(connectionString, finalConfig);

            context.services.log('info', `MongoDB query completed: ${result.resultCount} documents`, {
                nodeId: node.id,
                operation: result.operation,
            });

            return this.completed({ ...result });
        } catch (error) {
            const err = error as Error;
            this.logger.error(`MongoDB error: ${err.message}`, err.stack);

            return this.failed(
                'MONGODB_ERROR',
                err.message,
                true,
                { originalError: err.message },
            );
        }
    }

    private async getConnectionString(
        config: MongoDBConfig,
        context: NodeExecutionContext,
    ): Promise<string | undefined> {
        // Priority 0: Resolve from saved data source
        if (config.dataSourceId && this.dataSourcesService) {
            try {
                const connStr = this.dataSourcesService.getConnectionString(config.dataSourceId);
                this.logger.log(`Resolved connection from data source ${config.dataSourceId}`);
                return connStr;
            } catch (error) {
                this.logger.warn(`Data source ${config.dataSourceId} not found, falling through`);
            }
        }

        // Try to get from secrets first
        const secretConn = await context.services.getSecret('MONGODB_URI');
        if (secretConn) return secretConn;

        // Then from config
        if (config.connectionString) return config.connectionString;

        // Finally from environment
        return process.env.MONGODB_DEFAULT_URI;
    }

    private async buildFinalConfig(
        config: MongoDBConfig,
        context: NodeExecutionContext,
    ): Promise<MongoDBConfig> {
        // Use default database: data source default > env > 'test'
        let database = config.database;
        if (!database && config.dataSourceId && this.dataSourcesService) {
            try {
                database = this.dataSourcesService.getDefaultDatabase(config.dataSourceId);
            } catch { /* ignore */ }
        }
        database = database || process.env.MONGODB_DEFAULT_DATABASE || 'test';

        // ── Normalize: map frontend field names to executor field names ──────
        // The flow JSON uses `ai_query_source` and `use_ai_query`, while the
        // executor expects `aiQueryPrompt`. Resolve any template variables in the
        // prompt string so the AI gets the actual email/value, not the placeholder.
        const rawPrompt = (config as any).ai_query_source || config.aiQueryPrompt;
        if ((config as any).use_ai_query && rawPrompt) {
            config = {
                ...config,
                aiQueryPrompt: this.interpolateString(rawPrompt, context.previousOutputs),
            };
        }

        // ── Priority 1: AI-generated query from natural language prompt ──
        if (config.aiQueryPrompt) {
            this.logger.log(`Generating MongoDB query from AI prompt: "${config.aiQueryPrompt}"`);

            if (!this.aiProvider.isAvailable()) {
                this.logger.warn('AI provider is not available — falling back to manual query config');
            } else {
                try {
                    // Sample real documents from the collection to give the LLM schema context
                    let sampleDocuments: Record<string, unknown>[] | undefined;
                    try {
                        const connStr = await this.getConnectionString(config, context);
                        if (connStr && config.collection) {
                            sampleDocuments = await this.sampleCollectionSchema(
                                connStr,
                                database,
                                config.collection,
                            );
                            this.logger.debug(
                                `Schema sampled: ${sampleDocuments.length} docs, ` +
                                `fields: [${Object.keys(sampleDocuments[0] || {}).join(', ')}]`,
                            );
                        }
                    } catch (schemaErr) {
                        this.logger.warn(`Schema sampling failed (non-fatal): ${(schemaErr as Error).message}`);
                    }

                    const aiResult = await this.aiProvider.generateMongoQuery(
                        config.aiQueryPrompt,
                        {
                            availableCollections: config.collection ? [config.collection] : undefined,
                            sampleDocuments,
                        },
                    );

                    const aiQuery = aiResult.data;
                    const finalOp = (aiQuery.operation as MongoDBConfig['operation']) || config.operation;
                    this.logger.log(`AI generated query: ${JSON.stringify(aiQuery.query)} (op: ${finalOp}, confidence: ${aiQuery.confidence})`);

                    // When the AI returns an aggregate operation, the "query" field
                    // actually contains the pipeline array — map it to `pipeline`.
                    const isAggregate = finalOp === 'aggregate';

                    // Use AI query if present; fall back to manual config.query.
                    // If fallback is still a raw JSON string with {{templates}}, parse + resolve it.
                    let aiQueryValue: Record<string, unknown> | undefined = aiQuery.query;
                    if (!aiQueryValue && config.query) {
                        if (typeof config.query === 'string') {
                            try {
                                const interpolated = this.interpolateString(config.query as unknown as string, context.previousOutputs);
                                aiQueryValue = JSON.parse(interpolated) as Record<string, unknown>;
                            } catch {
                                // leave undefined — executeQuery will use {}
                            }
                        } else {
                            aiQueryValue = this.interpolateObject(config.query, context.previousOutputs);
                        }
                    }

                    // Parse sort JSON string if needed (flow JSON: "{ \"createdAt\": -1 }")
                    let sortValue = aiQuery.sort || config.sort;
                    if (typeof sortValue === 'string') {
                        try { sortValue = JSON.parse(sortValue); } catch { sortValue = undefined; }
                    }

                    // The AI may return the pipeline as:
                    //   1. A direct array: [{ $match: ... }, ...]
                    //   2. Wrapped in an object: { pipeline: [{ $match: ... }, ...] }
                    let pipelineValue = config.pipeline;
                    if (isAggregate && aiQueryValue) {
                        if (Array.isArray(aiQueryValue)) {
                            pipelineValue = aiQueryValue;
                        } else if (
                            typeof aiQueryValue === 'object' &&
                            Array.isArray((aiQueryValue as any).pipeline)
                        ) {
                            pipelineValue = (aiQueryValue as any).pipeline;
                        } else {
                            pipelineValue = [aiQueryValue];
                        }
                    }

                    return {
                        ...config,
                        database,
                        collection: aiQuery.collection || config.collection,
                        operation: finalOp,
                        query: isAggregate ? config.query : aiQueryValue,
                        pipeline: pipelineValue,
                        projection: aiQuery.projection || config.projection,
                        sort: sortValue,
                        limit: aiQuery.limit || config.limit,
                    };
                } catch (error) {
                    this.logger.error(`AI query generation failed: ${(error as Error).message} — falling back to manual query config`);
                }
            }
        }

        // ── Priority 2: Reference a previous AI Router node output ──
        if (config.useQueryFrom) {
            // Strip {{ }} template syntax if present (frontend sends template strings)
            const rawPath = config.useQueryFrom
                .replace(/^\{\{/, '')
                .replace(/\}\}$/, '')
                .trim();

            this.logger.debug(`Looking up AI query from path: "${rawPath}" in previousOutputs keys: [${Object.keys(context.previousOutputs).join(', ')}]`);

            const previousOutput = this.getNestedValue(
                context.previousOutputs,
                rawPath,
            ) as Record<string, unknown> | undefined;

            if (previousOutput) {
                const aiQuery = previousOutput as {
                    collection?: string;
                    operation?: string;
                    query?: Record<string, unknown>;
                    projection?: Record<string, number>;
                    sort?: Record<string, 1 | -1>;
                    limit?: number;
                };

                this.logger.log(`Using AI Router query: ${JSON.stringify(aiQuery.query)}`);

                return {
                    ...config,
                    database,
                    collection: aiQuery.collection || config.collection,
                    operation: (aiQuery.operation as MongoDBConfig['operation']) || config.operation,
                    query: aiQuery.query || config.query,
                    projection: aiQuery.projection || config.projection,
                    sort: aiQuery.sort || config.sort,
                    limit: aiQuery.limit || config.limit,
                };
            } else {
                this.logger.warn(`useQueryFrom path "${rawPath}" resolved to undefined — falling back to manual query config`);
            }
        }

        // ── Priority 3: Manual query config ──
        if (config.query) {
            // The flow JSON may send query as a JSON string (e.g. from the node form).
            // Parse it first, then interpolate template variables.
            if (typeof config.query === 'string') {
                try {
                    // Interpolate templates in the raw string BEFORE parsing JSON so
                    // {{...}} tokens become real values first.
                    const interpolated = this.interpolateString(config.query as unknown as string, context.previousOutputs);
                    config.query = JSON.parse(interpolated);
                } catch {
                    // Not valid JSON — leave as-is, let MongoDB driver reject it
                }
            } else {
                config.query = this.interpolateObject(config.query, context.previousOutputs);
            }
        }

        // Parse sort JSON string if needed ("{ \"createdAt\": -1 }" → object)
        if (typeof config.sort === 'string') {
            try { config = { ...config, sort: JSON.parse(config.sort as unknown as string) }; } catch { /* ignore */ }
        }

        return { ...config, database };
    }

    private async executeQuery(
        connectionString: string,
        config: MongoDBConfig,
    ): Promise<MongoDBOutput> {
        const client = await this.getConnection(connectionString);
        const db = client.db(config.database);
        const collection = db.collection(config.collection);

        const options: FindOptions = {};
        if (config.projection) options.projection = config.projection;
        if (config.sort) options.sort = config.sort;
        if (config.limit) options.limit = config.limit;
        if (config.skip) options.skip = config.skip;

        // Make string equality comparisons case-insensitive
        const query = this.makeCaseInsensitive(config.query || {});

        let result: unknown;
        let resultCount: number;

        switch (config.operation) {
            case 'find': {
                const cursor = collection.find(query, options);
                const documents = await cursor.toArray();
                result = documents;
                resultCount = documents.length;
                break;
            }

            case 'findOne': {
                const doc = await collection.findOne(query, options);
                result = doc;
                resultCount = doc ? 1 : 0;
                break;
            }

            case 'aggregate': {
                if (!config.pipeline) {
                    throw new Error('Aggregation pipeline is required for aggregate operation');
                }
                const aggCursor = collection.aggregate(config.pipeline);
                const aggResult = await aggCursor.toArray();
                result = aggResult;
                resultCount = aggResult.length;
                break;
            }

            case 'count': {
                resultCount = await collection.countDocuments(query);
                result = { count: resultCount };
                break;
            }

            default:
                throw new Error(`Unsupported MongoDB operation: ${config.operation}`);
        }

        return {
            success: true,
            operation: config.operation,
            collection: config.collection,
            resultCount,
            result,
            executedQuery: query,
        };
    }

    /**
     * Recursively converts plain string values in a query filter to
     * case-insensitive regex matches.
     *
     * Examples:
     *   { country: "india" }  →  { country: { $regex: "^india$", $options: "i" } }
     *   { age: { $gte: 25 } } →  { age: { $gte: 25 } }  (unchanged — not a plain string)
     *   { $or: [...] }        →  recurses into each item
     *
     * Skips: ObjectId fields (_id), operator keys ($gt, $in, …),
     *        non-string values, and values that are already regex/operator objects.
     */
    private makeCaseInsensitive(query: Record<string, unknown>): Record<string, unknown> {
        const SKIP_KEYS = new Set(['_id', '__v']);
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(query)) {
            // Logical operators — recurse into their array of conditions
            if ((key === '$or' || key === '$and' || key === '$nor') && Array.isArray(value)) {
                result[key] = value.map(item =>
                    typeof item === 'object' && item !== null
                        ? this.makeCaseInsensitive(item as Record<string, unknown>)
                        : item,
                );
                continue;
            }

            // Skip special keys and MongoDB operator keys
            if (SKIP_KEYS.has(key) || key.startsWith('$')) {
                result[key] = value;
                continue;
            }

            // Plain string value → convert to case-insensitive regex
            if (typeof value === 'string') {
                // Escape special regex chars in the value
                const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                result[key] = { $regex: `^${escaped}$`, $options: 'i' };
                continue;
            }

            // Nested object that is NOT already an operator object → recurse
            if (
                typeof value === 'object' &&
                value !== null &&
                !Array.isArray(value) &&
                !Object.keys(value as object).some(k => k.startsWith('$'))
            ) {
                result[key] = this.makeCaseInsensitive(value as Record<string, unknown>);
                continue;
            }

            // Everything else (numbers, booleans, operator objects, arrays) — keep as-is
            result[key] = value;
        }

        return result;
    }

    /**
     * Sample up to 5 documents from a collection and build a schema descriptor.
     * Returns an array of "sanitised" sample docs (ObjectIds converted to strings,
     * deep nested objects flattened one level so the LLM can see all field names).
     */
    private async sampleCollectionSchema(
        connectionString: string,
        database: string,
        collection: string,
    ): Promise<Record<string, unknown>[]> {
        const client = await this.getConnection(connectionString);
        const col = client.db(database).collection(collection);

        // Fetch up to 5 docs without any filter
        const docs = await col.find({}, { limit: 5 }).toArray();

        // Convert to plain objects (removes BSON types)
        return docs.map(doc => JSON.parse(JSON.stringify(doc)));
    }

    private async getConnection(connectionString: string): Promise<MongoClient> {
        // Check if we have an existing connection
        if (this.connections.has(connectionString)) {
            return this.connections.get(connectionString)!;
        }

        // Create a new connection
        const client = new MongoClient(connectionString);
        await client.connect();

        this.connections.set(connectionString, client);
        this.logger.log('New MongoDB connection established');

        return client;
    }

    /**
     * Cleanup connections on service shutdown
     */
    async cleanup(context: NodeExecutionContext): Promise<void> {
        for (const [uri, client] of this.connections) {
            try {
                await client.close();
                this.logger.debug(`Closed MongoDB connection: ${uri.substring(0, 20)}...`);
            } catch (error) {
                this.logger.error(`Error closing MongoDB connection: ${(error as Error).message}`);
            }
        }
        this.connections.clear();
    }

    /**
     * Get a nested value from an object using dot notation
     */
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

    /**
     * Interpolate template variables in an object
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
            } else if (Array.isArray(value)) {
                result[key] = value.map(item => {
                    if (typeof item === 'object' && item !== null) {
                        return this.interpolateObject(item as Record<string, unknown>, data);
                    }
                    return item;
                });
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Interpolate template variables in a string
     */
    private interpolateString(template: string, data: Record<string, unknown>): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = this.getNestedValue(data, path.trim());
            return value !== undefined ? String(value) : `{{${path}}}`;
        });
    }
}
