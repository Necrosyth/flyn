import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';

export type IntegrationKey =
  | 'whatsapp'
  | 'facebook'
  | 'instagram'
  | 'telegram'
  | 'slack'
  | 'email'
  | 'sms'
  | 'voice'
  | 'api'
  | 'tiktok'
  | 'linkedin'
  | 'apple_business'
  | 'hubspot'
  | 'salesforce';
export type IntegrationMode = 'api_connector' | 'native_chatwoot';

export type IntegrationStatus = {
  type: IntegrationMode;
  status: 'connected' | 'disconnected' | 'pending' | 'error';
  name?: string;
  inboxId?: string;
  callbackUrl?: string;
  createdAt?: number;
  updatedAt?: number;
} | null;

export type IntegrationsStatusResponse = {
  whatsapp?: IntegrationStatus;
  facebook?: IntegrationStatus;
  api?: IntegrationStatus;
};

class ApiClient {
  private baseUrl = `${API_BASE_URL}/integrations`;
  private cachedTenantId: string | null | undefined;

  private clearCachedTenantId() {
    this.cachedTenantId = undefined;
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('tenantId');
      } catch (err) {
        void err;
      }
    }
  }

  private async resolveTenantId(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    if (this.cachedTenantId !== undefined) return this.cachedTenantId;
    try {
      const lsId = localStorage.getItem('tenantId');
      if (lsId) {
        this.cachedTenantId = lsId;
        return lsId;
      }
      const resp = await authedFetch(`${API_BASE_URL}/tenants`);
      if (resp.ok) {
        const list = await resp.json();
        if (Array.isArray(list) && list.length > 0 && list[0].id) {
          localStorage.setItem('tenantId', list[0].id);
          this.cachedTenantId = list[0].id;
          return list[0].id;
        }
      }
    } catch (err) {
      void err;
    }
    this.cachedTenantId = null;
    return null;
  }

  async get<T>(path: string): Promise<T> {
    const run = async () => {
      const tenantId = await this.resolveTenantId();
      return authedFetch(`${this.baseUrl}/${path}`, {
        headers: {
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        },
      });
    };

    let response = await run();
    if (!response.ok) {
      const details = await response.text().catch(() => response.statusText);
      if (response.status === 404 && (details || '').toLowerCase().includes('tenant not found')) {
        this.clearCachedTenantId();
        response = await run();
      }
    }

    if (!response.ok) {
      const details = await response.text().catch(() => response.statusText);
      throw new Error(details || response.statusText);
    }

    return response.json();
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    const run = async () => {
      const tenantId = await this.resolveTenantId();
      return authedFetch(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        },
        body: JSON.stringify(data),
      });
    };

    let response = await run();
    if (!response.ok) {
      const details = await response.text().catch(() => response.statusText);
      if (response.status === 404 && (details || '').toLowerCase().includes('tenant not found')) {
        this.clearCachedTenantId();
        response = await run();
      }
    }

    if (!response.ok) {
      const details = await response.text().catch(() => response.statusText);
      throw new Error(details || response.statusText);
    }

    return response.json();
  }
}

class IntegrationsService {
  private apiClient = new ApiClient();

  async getStatus(): Promise<IntegrationsStatusResponse> {
    return this.apiClient.get<IntegrationsStatusResponse>('status');
  }

  async connect(input: { key: IntegrationKey; mode: IntegrationMode; name: string; callbackUrl: string }): Promise<unknown> {
    return this.apiClient.post<unknown>('connect', input);
  }

  async disconnect(input: { key: IntegrationKey }): Promise<unknown> {
    return this.apiClient.post<unknown>('disconnect', input);
  }
}

export const integrationsService = new IntegrationsService();
