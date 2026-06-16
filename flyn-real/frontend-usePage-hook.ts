// frontend/src/hooks/usePage.ts
import { useState, useCallback } from 'react';
import { api } from '@/services/api';

export function usePage() {
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPage = useCallback(async (projectId: string, data: any) => {
    setLoading(true);
    try {
      const page = await api.post(
        `/api/builder/${projectId}/pages`,
        data
      );
      setPages(prev => [...prev, page]);
      return page;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPages = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      const list = await api.get(`/api/builder/${projectId}/pages`);
      setPages(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pages');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePage = useCallback(async (projectId: string, pageId: string, updates: any) => {
    setLoading(true);
    try {
      const page = await api.put(
        `/api/builder/${projectId}/pages/${pageId}`,
        updates
      );
      setPages(prev => prev.map(p => p.id === pageId ? page : p));
      return page;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update page');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    pages,
    loading,
    error,
    createPage,
    fetchPages,
    updatePage,
  };
}
