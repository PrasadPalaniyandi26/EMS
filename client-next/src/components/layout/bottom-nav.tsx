'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebarStore } from '@/stores/sidebar-store';
import { Home, TrendingDown, TrendingUp, ClipboardCheck, Menu } from 'lucide-react';

const BOTTOM_NAV_ITEMS = [
  { name: 'Home',      href: '/',          icon: Home },
  { name: 'Expense',   href: '/expense',   icon: TrendingDown },
  { name: 'Income',    href: '/income',    icon: TrendingUp },
  { name: 'Approvals', href: '/approvals', icon: ClipboardCheck },
];

export function BottomNav() {
  const pathname = usePathname();
  const { toggleMobile } = useSidebarStore();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
      style={{
        height: '56px',
        background: 'var(--shell-surface)',
        borderTop: '1px solid var(--shell-border)',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.08)',
      }}
    >
      {BOTTOM_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
            style={{ color: isActive ? 'var(--shell-accent)' : 'var(--shell-text-muted)' }}
          >
            <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
            <span className="text-[10px] font-semibold">{item.name}</span>
            {isActive && (
              <span className="absolute bottom-1 w-1 h-1 rounded-full" style={{ background: 'var(--shell-accent)' }} />
            )}
          </Link>
        );
      })}

      {/* More — opens the full slide-over sidebar */}
      <button
        className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
        style={{ color: 'var(--shell-text-muted)' }}
        onClick={toggleMobile}
        aria-label="More navigation"
      >
        <Menu className="w-5 h-5" strokeWidth={1.8} />
        <span className="text-[10px] font-semibold">More</span>
      </button>
    </nav>
  );
}
