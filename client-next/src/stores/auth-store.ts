import { create } from 'zustand';
import { api, setAccessToken, clearAccessToken } from '@/lib/api-client';
import type { User, LoginCredentials, LoginResponse } from '@/lib/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  switchRole: (roleId: number) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (credentials) => {
    const res = await api.post<LoginResponse>('/auth/login', credentials);
    setAccessToken(res.data.accessToken);
    set({ user: res.data.user, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    clearAccessToken();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  refreshSession: async () => {
    try {
      const res = await api.post<LoginResponse>('/auth/refresh');
      setAccessToken(res.data.accessToken);
      set({ user: res.data.user, isAuthenticated: true, isLoading: false });
    } catch {
      clearAccessToken();
      set({ user: null, isAuthenticated: false, isLoading: false });
      // Redirect to login — session is gone, no valid refresh token
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
  },

  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),

  switchRole: async (roleId) => {
    const state = get();
    if (!state.user) return;
    // Update role in DB
    const res = await api.put<User>(`/users/${state.user.id}/switch-role`, { roleId });
    // Re-issue access token so JWT carries the new role_name for backend guards
    try {
      const refreshRes = await api.post<LoginResponse>('/auth/refresh');
      setAccessToken(refreshRes.data.accessToken);
    } catch {
      // If refresh fails, store update still takes effect for frontend checks
    }
    set((s) => ({
      user: s.user
        ? { ...s.user, role_id: res.data.role_id, role_name: res.data.role_name, roles: res.data.roles }
        : null,
    }));
  },
}));
