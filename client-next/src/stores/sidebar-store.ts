import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarStore {
  mobileOpen: boolean;
  slim: boolean;
  toggleMobile: () => void;
  closeMobile: () => void;
  toggleSlim: () => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      mobileOpen: false,
      slim: false,
      toggleMobile: () => set((s) => ({ mobileOpen: !s.mobileOpen })),
      closeMobile: () => set({ mobileOpen: false }),
      toggleSlim: () => set((s) => ({ slim: !s.slim })),
    }),
    {
      name: 'ems-sidebar',
      partialize: (s) => ({ slim: s.slim }),
    }
  )
);
