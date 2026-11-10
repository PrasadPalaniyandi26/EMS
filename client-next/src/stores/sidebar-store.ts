import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarStore {
  mobileOpen: boolean;
  slim: boolean;
  // Menu groups the person has opened or closed by hand; a group not listed follows the default (open when it holds the current page)
  groups: Record<string, boolean>;
  toggleMobile: () => void;
  closeMobile: () => void;
  toggleSlim: () => void;
  setGroup: (label: string, open: boolean) => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      mobileOpen: false,
      slim: false,
      groups: {},
      toggleMobile: () => set((s) => ({ mobileOpen: !s.mobileOpen })),
      closeMobile: () => set({ mobileOpen: false }),
      toggleSlim: () => set((s) => ({ slim: !s.slim })),
      setGroup: (label, open) => set((s) => ({ groups: { ...s.groups, [label]: open } })),
    }),
    {
      name: 'ems-sidebar',
      partialize: (s) => ({ slim: s.slim, groups: s.groups }),
    }
  )
);
