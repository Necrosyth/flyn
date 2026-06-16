/**
 * NocoBase-compatible data service backed by AWS DynamoDB.
 *
 * Drop-in replacement for the old HTTP→NocoBase service.
 * All callers (church, coaches, HR, freelancer, accounting, contracts)
 * use the same list/get/create/update/destroy interface — no changes needed.
 *
 * Table: flyn-app-data  (PAY_PER_REQUEST)
 *   PK  = collection  (string)  e.g. "flyn_church_members"
 *   SK  = id          (string)  UUID
 *
 * Data persists across every redeployment because DynamoDB is a managed service.
 *
 * When DynamoDB is unavailable (no AWS credentials), falls back to a local
 * JSON file at DATA_FILE_PATH (default: ./flyn-data.json) so data survives
 * server restarts during local development.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    DynamoDBClient,
    PutItemCommand,
    GetItemCommand,
    DeleteItemCommand,
    QueryCommand,
    UpdateItemCommand,
    ListTablesCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface NcListOptions {
    page?: number;
    pageSize?: number;
    filter?: Record<string, unknown>;
    sort?: string;
}

export interface NcListResult<T = unknown> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
}

const TABLE = 'flyn-app-data';
const DATA_FILE = process.env.DATA_FILE_PATH || path.join(process.cwd(), 'flyn-data.json');

@Injectable()
export class NocoBaseService implements OnModuleInit {
    private readonly logger = new Logger(NocoBaseService.name);
    private readonly dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    private _ready = false;
    private _usingFile = false;
    // collection → id → record
    private _fileStore: Record<string, Record<string, any>> = {};

    get isConnected(): boolean {
        return this._ready;
    }

    async onModuleInit() {
        try {
            await this.dynamo.send(new ListTablesCommand({ Limit: 1 }));
            this._ready = true;
            this.logger.log('NocoBaseService: DynamoDB connected (flyn-app-data)');
        } catch (err) {
            this.logger.warn(`NocoBaseService: DynamoDB unavailable — using file persistence at ${DATA_FILE}. (${(err as Error).message})`);
            this._usingFile = true;
            this._ready = true; // mark ready so callers go through CRUD methods (not module-level arrays)
            this._loadFileData();
        }
    }

    // ── File persistence helpers ───────────────────────────────────────────────

    private _loadFileData() {
        try {
            if (fs.existsSync(DATA_FILE)) {
                this._fileStore = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
                const count = Object.values(this._fileStore).reduce((s, c) => s + Object.keys(c).length, 0);
                this.logger.log(`NocoBaseService: loaded ${count} records from ${DATA_FILE}`);
            } else {
                this._fileStore = {};
                this.logger.log(`NocoBaseService: new file store created at ${DATA_FILE}`);
            }
        } catch (err: any) {
            this.logger.error(`NocoBaseService: failed to load ${DATA_FILE}: ${err.message}`);
            this._fileStore = {};
        }
    }

    private _saveFileData() {
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(this._fileStore, null, 2));
        } catch (err: any) {
            this.logger.error(`NocoBaseService: failed to save ${DATA_FILE}: ${err.message}`);
        }
    }

    // ──────────────────────── CRUD ────────────────────────────────────────────

    async list<T = unknown>(collection: string, opts: NcListOptions = {}): Promise<NcListResult<T> | null> {
        if (this._usingFile) {
            const col = this._fileStore[collection] ?? {};
            let items = Object.values(col) as any[];

            if (opts.filter) {
                for (const [key, value] of Object.entries(opts.filter)) {
                    if (value !== undefined && value !== null) {
                        items = items.filter((item: any) => item[key] === value);
                    }
                }
            }

            // newest first
            items.sort((a: any, b: any) => ((b.createdAt ?? '') > (a.createdAt ?? '') ? 1 : -1));

            const total = items.length;
            const page = opts.page ?? 1;
            const pageSize = opts.pageSize ?? 100;
            const data = items.slice((page - 1) * pageSize, page * pageSize) as T[];
            return { data, total, page, pageSize };
        }

        try {
            const result = await this.dynamo.send(new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: '#col = :col',
                ExpressionAttributeNames: { '#col': 'collection' },
                ExpressionAttributeValues: marshall({ ':col': collection }),
                ScanIndexForward: false,
            }));

            let items = (result.Items || []).map(i => unmarshall(i) as T);

            if (opts.filter) {
                for (const [key, value] of Object.entries(opts.filter)) {
                    if (value !== undefined && value !== null) {
                        items = items.filter((item: any) => item[key] === value);
                    }
                }
            }

            if (opts.sort) {
                const desc = opts.sort.startsWith('-');
                const field = desc ? opts.sort.slice(1) : opts.sort;
                items.sort((a: any, b: any) => {
                    const av = a[field] ?? '';
                    const bv = b[field] ?? '';
                    return desc ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
                });
            }

            const total = items.length;
            const page = opts.page ?? 1;
            const pageSize = opts.pageSize ?? 100;
            const data = items.slice((page - 1) * pageSize, page * pageSize);

            return { data, total, page, pageSize };
        } catch (err: any) {
            this.logger.error(`list(${collection}) failed: ${err.message}`);
            return null;
        }
    }

    async get<T = unknown>(collection: string, id: string | number): Promise<T | null> {
        if (this._usingFile) {
            const col = this._fileStore[collection] ?? {};
            return (col[String(id)] as T) ?? null;
        }

        try {
            const result = await this.dynamo.send(new GetItemCommand({
                TableName: TABLE,
                Key: marshall({ collection, id: String(id) }),
            }));
            if (!result.Item) return null;
            return unmarshall(result.Item) as T;
        } catch (err: any) {
            this.logger.error(`get(${collection}, ${id}) failed: ${err.message}`);
            return null;
        }
    }

    async create<T = unknown>(collection: string, data: Record<string, unknown>): Promise<T | null> {
        if (this._usingFile) {
            const id = randomUUID();
            const now = new Date().toISOString();
            const item = { ...data, collection, id, createdAt: now, updatedAt: now };
            const clean = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined && v !== null));
            if (!this._fileStore[collection]) this._fileStore[collection] = {};
            this._fileStore[collection][id] = clean;
            this._saveFileData();
            return clean as T;
        }

        try {
            const id = randomUUID();
            const now = new Date().toISOString();
            const item = { ...data, collection, id, createdAt: now, updatedAt: now };
            const clean = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined && v !== null));
            await this.dynamo.send(new PutItemCommand({
                TableName: TABLE,
                Item: marshall(clean),
            }));
            return clean as T;
        } catch (err: any) {
            this.logger.error(`create(${collection}) failed: ${err.message}`);
            return null;
        }
    }

    async update<T = unknown>(collection: string, id: string | number, data: Record<string, unknown>): Promise<T | null> {
        if (this._usingFile) {
            const col = this._fileStore[collection] ?? {};
            const existing = col[String(id)];
            if (!existing) return null;
            const now = new Date().toISOString();
            const updated = { ...existing, ...data, updatedAt: now };
            this._fileStore[collection][String(id)] = updated;
            this._saveFileData();
            return updated as T;
        }

        try {
            const now = new Date().toISOString();
            const updates = { ...data, updatedAt: now };
            const fields = Object.entries(updates).filter(([k, v]) => v !== undefined && v !== null && k !== 'collection' && k !== 'id');
            if (fields.length === 0) return this.get<T>(collection, id);

            const ExpressionAttributeNames: Record<string, string> = {};
            const ExpressionAttributeValues: Record<string, unknown> = {};
            const setParts: string[] = [];

            for (const [k, v] of fields) {
                const nameKey = `#f_${k.replace(/[^a-zA-Z0-9]/g, '_')}`;
                const valKey = `:v_${k.replace(/[^a-zA-Z0-9]/g, '_')}`;
                ExpressionAttributeNames[nameKey] = k;
                ExpressionAttributeValues[valKey] = v;
                setParts.push(`${nameKey} = ${valKey}`);
            }

            await this.dynamo.send(new UpdateItemCommand({
                TableName: TABLE,
                Key: marshall({ collection, id: String(id) }),
                UpdateExpression: `SET ${setParts.join(', ')}`,
                ExpressionAttributeNames,
                ExpressionAttributeValues: marshall(ExpressionAttributeValues),
            }));

            return this.get<T>(collection, id);
        } catch (err: any) {
            this.logger.error(`update(${collection}, ${id}) failed: ${err.message}`);
            return null;
        }
    }

    async destroy(collection: string, id: string | number): Promise<boolean> {
        if (this._usingFile) {
            if (this._fileStore[collection]?.[String(id)]) {
                delete this._fileStore[collection][String(id)];
                this._saveFileData();
                return true;
            }
            return false;
        }

        try {
            await this.dynamo.send(new DeleteItemCommand({
                TableName: TABLE,
                Key: marshall({ collection, id: String(id) }),
            }));
            return true;
        } catch (err: any) {
            this.logger.error(`destroy(${collection}, ${id}) failed: ${err.message}`);
            return false;
        }
    }
}
