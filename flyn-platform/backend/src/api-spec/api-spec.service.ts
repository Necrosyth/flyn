import { Injectable } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';

export interface FlatEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  category: string;
  description: string;
  summary?: string;
  parameters?: Array<{ name: string; in: string; required?: boolean; description?: string; schema?: any }>;
  requestBody?: any;
  responses?: any;
}

@Injectable()
export class ApiSpecService {
  private document: OpenAPIObject | null = null;
  private flatCache: FlatEndpoint[] | null = null;

  setDocument(doc: OpenAPIObject): void {
    this.document = doc;
    this.flatCache = null; // invalidate cache
  }

  getDocument(): OpenAPIObject | null {
    return this.document;
  }

  getEndpoints(): FlatEndpoint[] {
    if (this.flatCache) return this.flatCache;
    if (!this.document) return [];

    const endpoints: FlatEndpoint[] = [];
    const paths = this.document.paths || {};

    for (const [rawPath, pathItem] of Object.entries(paths)) {
      // NestJS Swagger already includes the global /api prefix in paths.
      // Avoid doubling it to /api/api/...
      const path = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath}`;
      const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

      for (const method of methods) {
        const op = (pathItem as any)[method];
        if (!op) continue;

        const tags: string[] = op.tags || ['Other'];
        const category = tags[0] || 'Other';

        endpoints.push({
          method: method.toUpperCase() as FlatEndpoint['method'],
          path,
          category,
          description: op.description || op.summary || '',
          summary: op.summary || '',
          parameters: op.parameters || [],
          requestBody: op.requestBody,
          responses: op.responses,
        });
      }
    }

    // Sort by category then path
    endpoints.sort((a, b) => a.category.localeCompare(b.category) || a.path.localeCompare(b.path));
    this.flatCache = endpoints;
    return endpoints;
  }

  searchEndpoints(query: string, module?: string): FlatEndpoint[] {
    const all = this.getEndpoints();
    const q = query.toLowerCase();
    const mod = module?.toLowerCase();

    return all.filter(ep => {
      const matchModule = !mod || ep.category.toLowerCase().includes(mod);
      const matchQuery = !q || (
        ep.path.toLowerCase().includes(q) ||
        ep.description.toLowerCase().includes(q) ||
        ep.summary?.toLowerCase().includes(q) ||
        ep.category.toLowerCase().includes(q)
      );
      return matchModule && matchQuery;
    }).slice(0, 30); // cap at 30 for AI tool
  }

  getCategories(): string[] {
    const all = this.getEndpoints();
    return [...new Set(all.map(e => e.category))].sort();
  }
}
