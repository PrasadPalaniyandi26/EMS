import { create } from 'zustand';

interface HeaderState {
  title: string;
  subtitle: string;
  setHeader: (title: string, subtitle?: string) => void;
}

export const useHeaderStore = create<HeaderState>((set) => ({
  title: 'Dashboard',
  subtitle: '',
  setHeader: (title, subtitle = '') => set({ title, subtitle }),
}));
