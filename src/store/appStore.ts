import { create } from 'zustand';
import { User, Settings, AppModule } from '../types';

interface AppState {
  // Activation
  isActivated: boolean | null;
  tenantId: string | null;
  setActivation: (active: boolean, tenantId?: string) => void;

  // Auth
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;

  // Navigation
  activeModule: AppModule;
  setActiveModule: (module: AppModule) => void;

  // Settings
  settings: Settings | null;
  setSettings: (settings: Settings) => void;

  // UI
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Activation
  isActivated: null,
  tenantId: null,
  setActivation: (active, tenantId) => set({ isActivated: active, tenantId: tenantId || null }),

  // Auth
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false, activeModule: 'dashboard' }),

  // Navigation
  activeModule: 'dashboard',
  setActiveModule: (module) => set({ activeModule: module }),

  // Settings
  settings: null,
  setSettings: (settings) => set({ settings }),

  // UI
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
}));
