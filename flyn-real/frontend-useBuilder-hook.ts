// frontend/src/hooks/useBuilder.ts
import { create } from 'zustand';

interface Project {
  id: string;
  name: string;
  description?: string;
  mode: string;
  pages: any[];
  createdAt: string;
  updatedAt: string;
}

interface Page {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  components: any[];
  content: any;
  status: string;
}

interface Component {
  id: string;
  pageId: string;
  projectId: string;
  name: string;
  type: string;
  props: any;
  styles: any;
  content: any;
  parentId?: string;
}

interface BuilderState {
  project: Project | null;
  selectedPage: Page | null;
  selectedComponent: Component | null;
  mode: string;
  framework: string;
  isDirty: boolean;
  
  // Actions
  setProject: (project: Project) => void;
  setSelectedPage: (page: Page) => void;
  setSelectedComponent: (component: Component | null) => void;
  setMode: (mode: string) => void;
  setFramework: (framework: string) => void;
  setDirty: (dirty: boolean) => void;
  
  // Helpers
  addPage: (page: Page) => void;
  removePage: (pageId: string) => void;
  addComponent: (component: Component) => void;
  removeComponent: (componentId: string) => void;
}

export const useBuilder = create<BuilderState>((set) => ({
  project: null,
  selectedPage: null,
  selectedComponent: null,
  mode: 'WEBSITE',
  framework: 'nextjs',
  isDirty: false,

  setProject: (project) => set({ project }),
  setSelectedPage: (page) => set({ selectedPage: page, isDirty: true }),
  setSelectedComponent: (component) => set({ selectedComponent: component, isDirty: true }),
  setMode: (mode) => set({ mode }),
  setFramework: (framework) => set({ framework }),
  setDirty: (dirty) => set({ isDirty: dirty }),

  addPage: (page) => set((state) => ({
    project: state.project ? {
      ...state.project,
      pages: [...state.project.pages, page],
    } : null,
    isDirty: true,
  })),

  removePage: (pageId) => set((state) => ({
    project: state.project ? {
      ...state.project,
      pages: state.project.pages.filter(p => p.id !== pageId),
    } : null,
    isDirty: true,
  })),

  addComponent: (component) => set((state) => ({
    selectedPage: state.selectedPage ? {
      ...state.selectedPage,
      components: [...(state.selectedPage.components || []), component],
    } : null,
    isDirty: true,
  })),

  removeComponent: (componentId) => set((state) => ({
    selectedPage: state.selectedPage ? {
      ...state.selectedPage,
      components: (state.selectedPage.components || []).filter(c => c.id !== componentId),
    } : null,
    isDirty: true,
  })),
}));
