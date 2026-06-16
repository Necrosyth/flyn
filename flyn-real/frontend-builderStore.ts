// frontend/src/stores/builderStore.ts
import { create } from 'zustand';

export const useBuilderStore = create((set) => ({
  selectedComponent: null,
  selectedPage: null,
  canvasZoom: 100,
  activePanel: 'elements',
  
  setSelectedComponent: (component: any) => set({ selectedComponent: component }),
  setSelectedPage: (page: any) => set({ selectedPage: page }),
  setCanvasZoom: (zoom: number) => set({ canvasZoom: zoom }),
  setActivePanel: (panel: string) => set({ activePanel: panel }),
}));
