/**
 * Smart Agents Frontend Service
 * ----------------------------
 * Wraps the smartAgentsApi to provide a consistent interface for DashboardModule.
 */

import { agentsApi } from '@/lib/smartAgentsApi';

export const smartAgentsService = {
  getMetrics: async (tenantId?: string) => {
    try {
      const metrics = await agentsApi.getMetrics(tenantId);
      // Metrics is an array: [mkt, cnt, soc, fd]
      // We'll return it as a Record for easier access in DashboardModule
      const stats: Record<string, any> = {};
      metrics.forEach(m => {
        stats[m.agentType] = m;
      });
      return stats;
    } catch {
      return null;
    }
  },

  getActivity: async (agentType?: string, limit = 50, tenantId?: string) => {
    try {
      return await agentsApi.getActivity(agentType, limit, tenantId);
    } catch {
      return [];
    }
  },

  getContentLibrary: async (type?: string, tenantId?: string) => {
    try {
      return await agentsApi.getContentLibrary(type, tenantId);
    } catch {
      return [];
    }
  },

  getPosts: async (tenantId?: string) => {
    try {
      return await agentsApi.getPosts(tenantId);
    } catch {
      return [];
    }
  },

  getCases: async (tenantId?: string) => {
    try {
      return await agentsApi.getCases(tenantId);
    } catch {
      return [];
    }
  },
};
