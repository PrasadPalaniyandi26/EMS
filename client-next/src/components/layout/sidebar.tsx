'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuthStore } from '@/stores/auth-store';
import { canAccessRoute } from '@/lib/route-access';
import { useSidebarStore } from '@/stores/sidebar-store';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Home, ClipboardCheck, TrendingDown, TrendingUp,
  Users, Briefcase, Package, Building2, Target, RotateCcw,
  BarChart2, Settings, ChevronsUpDown, Shield, FileBarChart,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { name: 'Home', href: '/', icon: Home, iconColor: 'text-nav-blue' },
    ],
  },
  {
    label: 'Transactions',
    items: [
      { name: 'Approvals', href: '/approvals', icon: ClipboardCheck, iconColor: 'text-nav-violet' },
      { name: 'Expense', href: '/expense', icon: TrendingDown, iconColor: 'text-nav-rose' },
      { name: 'Income', href: '/income', icon: TrendingUp, iconColor: 'text-nav-emerald' },
      { name: 'Recurring', href: '/manage/recurring', icon: RotateCcw, iconColor: 'text-nav-orange' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Client', href: '/manage/clients', icon: Users, iconColor: 'text-nav-cyan' },
      { name: 'Project', href: '/manage/projects', icon: Briefcase, iconColor: 'text-nav-indigo' },
      { name: 'Product', href: '/manage/products', icon: Package, iconColor: 'text-nav-amber' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { name: 'Organization', href: '/manage/organization', icon: Building2, iconColor: 'text-nav-blue' },
      { name: 'Budget', href: '/manage/budgets', icon: Target, iconColor: 'text-nav-cyan' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Spend Analytics', href: '/analytics/resource-utilization', icon: BarChart2, iconColor: 'text-nav-purple' },
      { name: 'Transaction Reports', href: '/reporting', icon: FileBarChart, iconColor: 'text-nav-blue' },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Audit Log', href: '/system/audit-log', icon: Shield, iconColor: 'text-nav-red' },
      { name: 'Settings', href: '/settings', icon: Settings, iconColor: 'text-nav-slate' },
    ],
  },
];

const EMPLOYEE_ALLOWED = ['/expense', '/approvals'];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { mobileOpen, closeMobile, slim, toggleSlim } = useSidebarStore();

  const isEmployeeActive = (user?.role_name || '').toUpperCase() === 'EMPLOYEE';

  const parts = (user?.username || 'U').trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();

  return (
    <TooltipProvider delayDuration={200}>
      <>
        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={closeMobile}
          />
        )}

        <aside className={`menu-fixed flex flex-col transition-[width,transform] duration-300 ease-in-out lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${slim ? 'menu-slim' : ''}`}>

          {/* Logo */}
          <div className="h-[44px] flex items-center shrink-0 overflow-hidden" style={{ borderBottom: '1px solid var(--shell-border)', justifyContent: slim ? 'center' : 'center' }}>
            {slim ? (
              <span className="text-[16px] font-extrabold" style={{ color: 'var(--shell-brand)', fontFamily: 'var(--font-raleway)' }}>N</span>
            ) : (
              <span className="text-[16px] font-extrabold tracking-[0.22em]" style={{ color: 'var(--shell-brand)', fontFamily: 'var(--font-raleway)' }}>NTEMS</span>
            )}
          </div>

          {/* Navigation */}
          <nav className={`flex-1 py-3 overflow-y-auto hide-scrollbar space-y-0.5 ${slim ? 'px-2' : 'px-3'}`}>
            {NAV_GROUPS.map((group, gi) => {
              const visibleItems = group.items.filter((item) =>
                canAccessRoute(item.href, user?.role_name) && (!isEmployeeActive || EMPLOYEE_ALLOWED.includes(item.href)));
              if (visibleItems.length === 0) return null;
              return (
                <div key={gi} className={gi > 0 ? 'pt-4' : ''}>
                  {group.label && !slim && (
                    <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--shell-text-muted)' }}>
                      {group.label}
                    </p>
                  )}
                  {group.label && slim && (
                    <div className="h-px mx-1 mb-2" style={{ background: 'var(--shell-border)' }} />
                  )}
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = pathname === item.href;
                      const linkEl = (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={closeMobile}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={slim ? item.name : undefined}
                          className={`flex items-center transition-all rounded-full ${
                            slim
                              ? 'justify-center w-9 h-9 mx-auto'
                              : 'w-full gap-2.5 px-3 py-[7px] text-[12.5px] font-medium'
                          } ${isActive ? 'nav-active' : 'hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)]'}`}
                          style={!isActive ? { color: 'color-mix(in srgb, var(--shell-text) 55%, var(--shell-text-muted))' } : {}}
                        >
                          <item.icon className={`h-[15px] w-[15px] shrink-0 ${item.iconColor}`} />
                          {!slim && item.name}
                        </Link>
                      );

                      if (slim) {
                        return (
                          <Tooltip key={item.href}>
                            <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                            <TooltipContent side="right" className="text-[12px]">{item.name}</TooltipContent>
                          </Tooltip>
                        );
                      }
                      return linkEl;
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Bottom: slim toggle + user profile */}
          <div className={`shrink-0 ${slim ? 'px-2 py-2' : 'px-3 py-3'}`} style={{ borderTop: '1px solid var(--shell-border)' }}>

            {/* Slim toggle button — desktop only */}
            <div className="hidden lg:flex justify-end mb-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleSlim}
                    aria-label={slim ? "Expand sidebar" : "Collapse sidebar"}
                    className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--shell-hover)]"
                    style={{ color: 'var(--shell-text-muted)' }}
                  >
                    {slim ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-[12px]">
                  {slim ? 'Expand sidebar' : 'Collapse sidebar'}
                </TooltipContent>
              </Tooltip>
            </div>

            {slim ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-9 h-9 mx-auto rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
                    style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}>
                    <span className="text-[11px] font-bold">{initials}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-[12px]">
                  <p className="font-semibold">{user?.username || 'User'}</p>
                  <p className="text-[11px] opacity-70">{user?.role_name || user?.role || 'Admin'}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--shell-hover)]">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                  style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold leading-none truncate" style={{ color: 'var(--shell-text)' }}>{user?.username || 'User'}</p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--shell-text-muted)' }}>{user?.role_name || user?.role || 'Admin'}</p>
                </div>
                <ChevronsUpDown className="w-3 h-3 shrink-0" style={{ color: 'var(--shell-text-muted)' }} />
              </div>
            )}
          </div>
        </aside>
      </>
    </TooltipProvider>
  );
}
