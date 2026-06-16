// frontend/src/hooks/useComponent.ts
import { useState, useCallback } from 'react';
import { api } from '@/services/api';

export function useComponent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createComponent = useCallback(async (
    projectId: string,
    pageId: string,
    data: any
  ) => {
    setLoading(true);
    try {
      const component = await api.post(
        `/api/builder/${projectId}/components`,
        { ...data, pageId }
      );
      return component;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create component';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateComponent = useCallback(async (
    projectId: string,
    componentId: string,
    updates: any
  ) => {
    setLoading(true);
    try {
      const component = await api.put(
        `/api/builder/${projectId}/components/${componentId}`,
        updates
      );
      return component;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update component';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteComponent = useCallback(async (
    projectId: string,
    componentId: string
  ) => {
    setLoading(true);
    try {
      await api.delete(`/api/builder/${projectId}/components/${componentId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete component';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    createComponent,
    updateComponent,
    deleteComponent,
  };
}
