// frontend/src/hooks/useCMS.ts
import { useState, useCallback } from 'react';
import { api } from '@/services/api';

interface CMSState {
  collections: any[];
  entries: any[];
  loading: boolean;
  error: string | null;
}

export function useCMS() {
  const [state, setState] = useState<CMSState>({
    collections: [],
    entries: [],
    loading: false,
    error: null,
  });

  const fetchCollections = useCallback(async (projectId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const collections = await api.get(
        `/api/cms/${projectId}/collections`
      );
      setState(prev => ({ ...prev, collections, loading: false }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch collections',
        loading: false,
      }));
    }
  }, []);

  const createCollection = useCallback(async (projectId: string, data: any) => {
    try {
      const collection = await api.post(
        `/api/cms/${projectId}/collections`,
        data
      );
      setState(prev => ({
        ...prev,
        collections: [...prev.collections, collection],
      }));
      return collection;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create collection',
      }));
      throw error;
    }
  }, []);

  const syncCMS = useCallback(async (projectId: string) => {
    setState(prev => ({ ...prev, loading: true }));
    try {
      const result = await api.post(`/api/cms/${projectId}/sync`);
      setState(prev => ({ ...prev, loading: false }));
      return result;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to sync CMS',
        loading: false,
      }));
      throw error;
    }
  }, []);

  return {
    ...state,
    fetchCollections,
    createCollection,
    syncCMS,
  };
}
