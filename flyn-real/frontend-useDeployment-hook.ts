// frontend/src/hooks/useDeployment.ts
import { useState, useCallback } from 'react';
import { api } from '@/services/api';

export function useDeployment() {
  const [deployments, setDeployments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deploy = useCallback(async (projectId: string, config: any) => {
    setLoading(true);
    try {
      const deployment = await api.post(
        `/api/builder/${projectId}/deploy`,
        config
      );
      setDeployments(prev => [...prev, deployment]);
      return deployment;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployment failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDeployments = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      const list = await api.get(`/api/builder/${projectId}/deployments`);
      setDeployments(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch deployments');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    deployments,
    loading,
    error,
    deploy,
    fetchDeployments,
  };
}
