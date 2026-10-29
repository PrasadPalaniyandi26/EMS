'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { canAccessRoute, fallbackRoute } from '@/lib/route-access';
import { useSidebarStore } from '@/stores/sidebar-store';
import { getAccessToken } from '@/lib/api-client';
import { Sidebar } from '@/components/layout/sidebar';
import { Footer } from '@/components/layout/footer';
import { TopBar } from '@/components/layout/topbar';
import { BottomNav } from '@/components/layout/bottom-nav';

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading, refreshSession } = useAuthStore();
  const { slim } = useSidebarStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!getAccessToken()) {
      refreshSession();
    } else {
      useAuthStore.setState({ isLoading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const roleName = user?.role_name;
  const routeAllowed = canAccessRoute(pathname, roleName);
  useEffect(() => {
    if (isAuthenticated && !routeAllowed) router.replace(fallbackRoute(roleName));
  }, [isAuthenticated, routeAllowed, roleName, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--shell-bg)' }}>
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--shell-accent)] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (!routeAllowed) return null; // redirecting; don't render the page or fire its queries

  return (
    <div className={`relative min-h-dvh ${slim ? 'layout-slim' : ''}`}>
      <Sidebar />
      <TopBar />
      <main className="main-workspace">
        {children}
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
