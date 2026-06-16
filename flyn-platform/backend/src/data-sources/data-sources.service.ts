/**
 * Data Sources Service
 *
 * Core business logic for managing external data-source connections.
 * Currently supports MongoDB; designed to be extensible for other databases.
 *
 * Uses in-memory storage (same pattern as WorkflowStorageService).
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MongoClient, Db } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import {
    DataSource,
    DataSourceCreateDto,
    DataSourceUpdateDto,
    DataSourceStatus,
    TestConnectionResult,
    CollectionInfo,
    CollectionDataQuery,
    PaginatedDocuments,
} from './data-sources.types';

@Injectable()
export class DataSourcesService {
    private readonly logger = new Logger(DataSourcesService.name);

    /** In-memory store keyed by data-source ID */
    private readonly store = new Map<string, DataSource>();

    /** Connection pool keyed by data-source ID */
    private readonly connections = new Map<string, MongoClient>();

    // ═══════════════════════════════════════════════════════════════════════
    // CRUD
    // ═══════════════════════════════════════════════════════════════════════

    create(dto: DataSourceCreateDto): DataSource {
        const ds: DataSource = {
            id: uuidv4(),
            name: dto.name,
            type: dto.type || 'mongodb',
            connectionString: dto.connectionString,
            defaultDatabase: dto.defaultDatabase,
            status: 'untested',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.store.set(ds.id, ds);
        this.logger.log(`Created data source "${ds.name}" (${ds.id})`);
        return ds;
    }

    findAll(): DataSource[] {
        return Array.from(this.store.values());
    }

    findOne(id: string): DataSource {
        const ds = this.store.get(id);
        if (!ds) throw new NotFoundException(`Data source ${id} not found`);
        return ds;
    }

    update(id: string, dto: DataSourceUpdateDto): DataSource {
        const ds = this.findOne(id);
        if (dto.name !== undefined) ds.name = dto.name;
        if (dto.connectionString !== undefined) {
            ds.connectionString = dto.connectionString;
            // Reset status when connection string changes
            ds.status = 'untested';
            this.disconnectClient(id);
        }
        if (dto.defaultDatabase !== undefined) ds.defaultDatabase = dto.defaultDatabase;
        ds.updatedAt = new Date();
        this.store.set(id, ds);
        this.logger.log(`Updated data source "${ds.name}" (${id})`);
        return ds;
    }

    delete(id: string): boolean {
        const ds = this.store.get(id);
        if (!ds) return false;
        this.disconnectClient(id);
        this.store.delete(id);
        this.logger.log(`Deleted data source "${ds.name}" (${id})`);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONNECTION TESTING
    // ═══════════════════════════════════════════════════════════════════════

    async testConnection(id: string): Promise<TestConnectionResult> {
        const ds = this.findOne(id);
        const start = Date.now();

        try {
            const client = await this.getClient(id, ds.connectionString);
            const admin = client.db().admin();
            await admin.ping();

            const dbListResult = await admin.listDatabases();
            const databases = dbListResult.databases.map(d => d.name);

            const latencyMs = Date.now() - start;

            // Update status
            ds.status = 'connected';
            ds.lastTestedAt = new Date();
            ds.errorMessage = undefined;
            ds.updatedAt = new Date();
            this.store.set(id, ds);

            this.logger.log(`Connection test passed for "${ds.name}" (${latencyMs}ms, ${databases.length} dbs)`);
            return { success: true, latencyMs, databases };
        } catch (error) {
            const latencyMs = Date.now() - start;
            const errMsg = (error as Error).message;

            ds.status = 'error';
            ds.lastTestedAt = new Date();
            ds.errorMessage = errMsg;
            ds.updatedAt = new Date();
            this.store.set(id, ds);

            this.logger.warn(`Connection test failed for "${ds.name}": ${errMsg}`);
            return { success: false, latencyMs, error: errMsg };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // COLLECTION INTROSPECTION
    // ═══════════════════════════════════════════════════════════════════════

    async getCollections(id: string, database?: string): Promise<CollectionInfo[]> {
        const ds = this.findOne(id);
        const client = await this.getClient(id, ds.connectionString);
        const dbName = database || ds.defaultDatabase || 'test';
        const db = client.db(dbName);

        const collections = await db.listCollections().toArray();

        const result: CollectionInfo[] = [];
        for (const col of collections) {
            try {
                const stats = await db.collection(col.name).estimatedDocumentCount();
                result.push({
                    name: col.name,
                    type: col.type || 'collection',
                    documentCount: stats,
                });
            } catch {
                result.push({
                    name: col.name,
                    type: col.type || 'collection',
                    documentCount: 0,
                });
            }
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DOCUMENT BROWSING
    // ═══════════════════════════════════════════════════════════════════════

    async getCollectionData(
        id: string,
        database: string,
        collection: string,
        query: CollectionDataQuery = {},
    ): Promise<PaginatedDocuments> {
        const ds = this.findOne(id);
        const client = await this.getClient(id, ds.connectionString);
        const db = client.db(database || ds.defaultDatabase || 'test');
        const col = db.collection(collection);

        const page = Math.max(query.page || 1, 1);
        const limit = Math.min(Math.max(query.limit || 20, 1), 100);
        const skip = (page - 1) * limit;

        // Parse optional JSON strings
        let filter = {};
        let sort = {};
        let projection = {};

        if (query.filter) {
            try { filter = JSON.parse(query.filter); } catch {
                this.logger.warn('Invalid filter JSON, ignoring');
            }
        }
        if (query.sort) {
            try { sort = JSON.parse(query.sort); } catch {
                this.logger.warn('Invalid sort JSON, ignoring');
            }
        }
        if (query.projection) {
            try { projection = JSON.parse(query.projection); } catch {
                this.logger.warn('Invalid projection JSON, ignoring');
            }
        }

        const [data, total] = await Promise.all([
            col.find(filter, { projection, sort, skip, limit }).toArray(),
            col.countDocuments(filter),
        ]);

        return {
            data: data as Record<string, unknown>[],
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            collection,
            database: database || ds.defaultDatabase || 'test',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESOLVE FOR WORKFLOW EXECUTOR
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Called by MongoDBExecutor to resolve a saved data source's connection string.
     */
    getConnectionString(id: string): string {
        const ds = this.findOne(id);
        return ds.connectionString;
    }

    getDefaultDatabase(id: string): string | undefined {
        const ds = this.findOne(id);
        return ds.defaultDatabase;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTERNAL — CONNECTION POOL
    // ═══════════════════════════════════════════════════════════════════════

    private async getClient(id: string, connectionString: string): Promise<MongoClient> {
        if (this.connections.has(id)) {
            return this.connections.get(id)!;
        }

        const client = new MongoClient(connectionString, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
        });
        await client.connect();
        this.connections.set(id, client);
        this.logger.debug(`New MongoDB client for data source ${id}`);
        return client;
    }

    private disconnectClient(id: string): void {
        const client = this.connections.get(id);
        if (client) {
            client.close().catch(err =>
                this.logger.warn(`Error closing client for ${id}: ${err.message}`),
            );
            this.connections.delete(id);
        }
    }
}
