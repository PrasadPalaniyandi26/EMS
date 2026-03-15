'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { getAccessToken } from '@/lib/api-client';
import { Sidebar } from '@/components/layout/sidebar';
import { Footer } from '@/components/layout/footer';
import { TopBar } from '@/components/layout/topbar';

export function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, refreshSession } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Only try refresh if we don't already have a token
    // (e.g., page reload — the in-memory token is lost but cookie may still be valid)
    if (!getAccessToken()) {
      refreshSession();
    } else {
      // Token already exists (just logged in), mark as done loading
      useAuthStore.setState({ isLoading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F0F4F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-juniper border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="relative min-h-screen">
      <Sidebar />
      <TopBar />
      <main className="main-workspace">
        {children}
      </main>
      {/* <Footer /> */}
    </div>
  );
}

