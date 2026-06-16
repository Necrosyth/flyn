/**
 * Data Sources Service
 * --------------------
 * Frontend API client for managing external data-source connections.
 */

import { API_BASE_URL } from '@/lib/api';

// ============================================================================
// TYPES
// ============================================================================

export type DataSourceStatus = 'connected' | 'disconnected' | 'error' | 'untested';

export interface DataSource {
    id: string;
    name: string;
    type: string;
    connectionString: string;
    defaultDatabase?: string;
    status: DataSourceStatus;
    lastTestedAt?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface TestConnectionResult {
    success: boolean;
    latencyMs: number;
    databases?: string[];
    error?: string;
}

export interface CollectionInfo {
    name: string;
    type: string;
    documentCount: number;
}

export interface PaginatedDocuments {
    data: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    collection: string;
    database: string;
}

// ============================================================================
// API CLIENT
// ============================================================================

class DataSourcesApiClient {
    private baseUrl = `${API_BASE_URL}/data-sources`;

    private async request<T>(path: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `Request failed: ${response.statusText}`);
        }

        return response.json();
    }

    // ── CRUD ────────────────────────────────────────────────────────────

    async create(data: { name: string; connectionString: string; defaultDatabase?: string }): Promise<DataSource> {
        return this.request<DataSource>('', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async list(): Promise<DataSource[]> {
        return this.request<DataSource[]>('');
    }

    async get(id: string): Promise<DataSource> {
        return this.request<DataSource>(`/${id}`);
    }

    async update(id: string, data: Partial<{ name: string; connectionString: string; defaultDatabase: string }>): Promise<DataSource> {
        return this.request<DataSource>(`/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async remove(id: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(`/${id}`, {
            method: 'DELETE',
        });
    }

    // ── TEST CONNECTION ─────────────────────────────────────────────────

    async testConnection(id: string): Promise<TestConnectionResult> {
        return this.request<TestConnectionResult>(`/${id}/test`, {
            method: 'POST',
        });
    }

    // ── COLLECTIONS ─────────────────────────────────────────────────────

    async getCollections(id: string, database?: string): Promise<CollectionInfo[]> {
        const params = database ? `?database=${encodeURIComponent(database)}` : '';
        return this.request<CollectionInfo[]>(`/${id}/collections${params}`);
    }

    // ── DOCUMENT BROWSING ───────────────────────────────────────────────

    async getCollectionData(
        id: string,
        collection: string,
        options: {
            database?: string;
            page?: number;
            limit?: number;
            filter?: string;
            sort?: string;
        } = {},
    ): Promise<PaginatedDocuments> {
        const params = new URLSearchParams();
        if (options.database) params.set('database', options.database);
        if (options.page) params.set('page', String(options.page));
        if (options.limit) params.set('limit', String(options.limit));
        if (options.filter) params.set('filter', options.filter);
        if (options.sort) params.set('sort', options.sort);

        const qs = params.toString() ? `?${params.toString()}` : '';
        return this.request<PaginatedDocuments>(`/${id}/collections/${encodeURIComponent(collection)}/data${qs}`);
    }
}

// Export singleton
export const dataSourcesService = new DataSourcesApiClient();
