// frontend/src/stores/projectStore.ts
import { create } from 'zustand';

export const useProjectStore = create((set) => ({
  projects: [],
  currentProject: null,
  loading: false,
  error: null,
  
  setProjects: (projects: any[]) => set({ projects }),
  setCurrentProject: (project: any) => set({ currentProject: project }),
  setLoading: (loading: boolean) => set({ loading }),
  setError: (error: any) => set({ error }),
}));
