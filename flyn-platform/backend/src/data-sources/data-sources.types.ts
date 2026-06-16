/**
 * Data Sources — Type Definitions
 *
 * Defines the shapes for external data source connections (MongoDB focus).
 * Modelled after NocoBase's data-source manager concept.
 */

// ============================================================================
// DATA SOURCE
// ============================================================================

export type DataSourceType = 'mongodb'; // extensible later (postgres, mysql …)

export type DataSourceStatus = 'connected' | 'disconnected' | 'error' | 'untested';

export interface DataSource {
    id: string;
    name: string;
    type: DataSourceType;
    connectionString: string;
    defaultDatabase?: string;
    status: DataSourceStatus;
    lastTestedAt?: Date;
    errorMessage?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface DataSourceCreateDto {
    name: string;
    type?: DataSourceType;           // defaults to 'mongodb'
    connectionString: string;
    defaultDatabase?: string;
}

export interface DataSourceUpdateDto {
    name?: string;
    connectionString?: string;
    defaultDatabase?: string;
}

// ============================================================================
// TEST CONNECTION
// ============================================================================

export interface TestConnectionResult {
    success: boolean;
    latencyMs: number;
    databases?: string[];
    error?: string;
}

// ============================================================================
// COLLECTIONS & DATA
// ============================================================================

export interface CollectionInfo {
    name: string;
    type: string;             // 'collection' | 'view'
    documentCount: number;
    avgDocumentSize?: number;
    indexes?: number;
}

export interface CollectionDataQuery {
    page?: number;
    limit?: number;
    filter?: string;          // JSON string for mongo filter
    sort?: string;            // JSON string for mongo sort
    projection?: string;      // JSON string for projection
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
