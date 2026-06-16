// frontend/src/hooks/useProject.ts
import { useState, useCallback } from 'react';
import { api } from '@/services/api';

export function useProject() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProject = useCallback(async (data: any) => {
    setLoading(true);
    try {
      const project = await api.post('/api/builder/projects', data);
      setProjects(prev => [...prev, project]);
      return project;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.get('/api/builder/projects');
      setProjects(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProject = useCallback(async (projectId: string, updates: any) => {
    setLoading(true);
    try {
      const project = await api.put(
        `/api/builder/projects/${projectId}`,
        updates
      );
      setProjects(prev => prev.map(p => p.id === projectId ? project : p));
      return project;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      await api.delete(`/api/builder/projects/${projectId}`);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    projects,
    loading,
    error,
    createProject,
    fetchProjects,
    updateProject,
    deleteProject,
  };
}
