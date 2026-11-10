'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useAuthStore } from '@/stores/auth-store';
import { canAccessRoute } from '@/lib/route-access';
import { Home, TrendingDown, TrendingUp, ClipboardCheck, Menu } from 'lucide-react';

const BOTTOM_NAV_ITEMS = [
  { name: 'Home',      href: '/',          icon: Home },
  { name: 'Expense',   href: '/expense',   icon: TrendingDown },
  { name: 'Income',    href: '/income',    icon: TrendingUp },
  { name: 'Approvals', href: '/approvals', icon: ClipboardCheck },
];

const item = 'relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)]';

export function BottomNav() {
  const pathname = usePathname();
  const { toggleMobile } = useSidebarStore();
  const { user } = useAuthStore();

  return (
    <nav aria-label="Quick pages" className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
      style={{
        height: '56px',
        background: 'var(--shell-surface)',
        borderTop: '1px solid var(--shell-border)',
      }}
    >
      {BOTTOM_NAV_ITEMS.filter((it) => canAccessRoute(it.href, user?.role_name)).map((it) => {
        const isActive = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={isActive ? 'page' : undefined}
            className={item}
            style={{ color: isActive ? 'var(--shell-accent)' : 'var(--shell-text-muted)' }}
          >
            <it.icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
            <span className={`text-[12px] capitalize ${isActive ? 'font-semibold' : 'font-medium'}`}>{it.name}</span>
          </Link>
        );
      })}

      {/* More: opens the full slide-over sidebar */}
      <button
        type="button"
        className={item}
        style={{ color: 'var(--shell-text-muted)' }}
        onClick={toggleMobile}
        aria-label="More pages"
      >
        <Menu className="w-5 h-5" strokeWidth={1.8} />
        <span className="text-[12px] font-medium">More</span>
      </button>
    </nav>
  );
}
