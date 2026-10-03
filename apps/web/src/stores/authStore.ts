import { create } from 'zustand';
import { User, Permission, SystemRole } from '@claimboard/shared';
import { apiRequest } from '../lib/api';

interface AuthState {
  user: User | null;
  permissions: Permission[];
  organizationId: string | null;
  isLoading: boolean;
  error: string | null;
  fetchMe: () => Promise<void>;
  switchDemoRole: (role: SystemRole) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: [],
  organizationId: null,
  isLoading: true,
  error: null,

  fetchMe: async () => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) {
          localStorage.setItem('claimboard_token', urlToken);
        }
      }

      set({ isLoading: true, error: null });
      const data = await apiRequest<{ user: User; permissions: Permission[]; organizationId: string }>('/auth/me');
      set({
        user: data.user,
        permissions: data.permissions,
        organizationId: data.organizationId,
        isLoading: false,
      });
    } catch (err: any) {
      set({ user: null, permissions: [], organizationId: null, isLoading: false, error: err.message });
    }
  },

  switchDemoRole: async (role: SystemRole) => {
    try {
      set({ isLoading: true });
      await apiRequest('/auth/switch-demo-user', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      await get().fetchMe();
    } catch (err: any) {
      console.error('Failed to switch demo role:', err);
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      set({ user: null, permissions: [], organizationId: null });
      window.location.href = '/auth/login';
    }
  },

  hasPermission: (permission: Permission) => {
    const { permissions, user } = get();
    if (user?.role === 'Owner' || user?.role === 'Administrator') return true;
    return permissions.includes(permission);
  },
}));
