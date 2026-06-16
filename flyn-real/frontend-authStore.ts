// frontend/src/stores/authStore.ts
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  
  setUser: (user: any) => set({ user }),
  setToken: (token: string) => set({ token, isAuthenticated: true }),
  logout: () => set({ user: null, token: null, isAuthenticated: false }),
}));
