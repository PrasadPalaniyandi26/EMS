'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/shared/brand';
import { BrandTitle } from '@/components/shared/brand-title';
import { usePathname } from 'next/navigation';

import { useAuthStore } from '@/stores/auth-store';
import { canAccessRoute } from '@/lib/route-access';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useBudgetAlertCount } from '@/hooks/use-budget-queries';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Boxes,
  Home, ClipboardCheck, TrendingDown, TrendingUp,
  Users, Briefcase, Package, Building2, Target, RotateCcw,
  BarChart2, Settings, Shield, FileBarChart, Gauge, SlidersHorizontal, Layers, Percent, ClipboardList,
  ChevronDown, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';

// Groups follow the work: what you do every day first, then reading and costing, then the records and system settings behind them.
// Manage lists are plural (records you maintain); the costing pages carry the word "costing" (results you read).
// Each group has one icon colour, so a colour tells you where you are; the items in a group share it.
const NAV_GROUPS = [
  {
    label: null, iconColor: 'text-nav-blue',
    items: [
      { name: 'Home', href: '/', icon: Home },
    ],
  },
  {
    label: 'Transactions', iconColor: 'text-nav-emerald',
    items: [
      { name: 'Approvals', href: '/approvals', icon: ClipboardCheck },
      { name: 'Expense', href: '/expense', icon: TrendingDown },
      { name: 'Income', href: '/income', icon: TrendingUp },
      { name: 'Recurring', href: '/manage/recurring', icon: RotateCcw },
    ],
  },
  {
    label: 'Business', iconColor: 'text-nav-rose',
    items: [
      { name: 'Clients', href: '/manage/clients', icon: Users },
      { name: 'Projects', href: '/business/projects', icon: Briefcase },
      { name: 'Products', href: '/business/products', icon: Package },
      { name: 'Orders', href: '/business/orders', icon: ClipboardList },
    ],
  },
  {
    label: 'Costing data', iconColor: 'text-nav-amber',
    items: [
      { name: 'Part master', href: '/budget/parts', icon: Layers },
      { name: 'Cost rates', href: '/budget/rates', icon: Percent },
      { name: 'Stock register', href: '/budget/stock', icon: Boxes },
    ],
  },
  {
    label: 'Budget', iconColor: 'text-nav-cyan',
    items: [
      { name: 'Planner', href: '/budget/planner', icon: Target },
      { name: 'Monitor', href: '/budget/monitor', icon: Gauge },
    ],
  },
  {
    label: 'Insights', iconColor: 'text-nav-purple',
    items: [
      { name: 'Analytics', href: '/analytics/resource-utilization', icon: BarChart2 },
      { name: 'Reports', href: '/reporting', icon: FileBarChart },
    ],
  },
  {
    label: 'System', iconColor: 'text-nav-slate',
    items: [
      { name: 'Organization', href: '/manage/organization', icon: Building2 },
      { name: 'Budget settings', href: '/budget/settings', icon: SlidersHorizontal },
      { name: 'Audit Log', href: '/system/audit-log', icon: Shield },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

const EMPLOYEE_ALLOWED = ['/expense', '/approvals'];
const OPEN_BY_DEFAULT = ['Transactions'];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { mobileOpen, closeMobile, slim, toggleSlim, groups, setGroup } = useSidebarStore();

  const isEmployeeActive = (user?.role_name || '').toUpperCase() === 'EMPLOYEE';
  const { data: alertCount } = useBudgetAlertCount(!!user && !isEmployeeActive);
  const isOn = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  // Going to a page opens the group it lives in, so the current page is never hidden
  const activeGroup = NAV_GROUPS.find((g) => g.label && g.items.some((i) => isOn(i.href)))?.label ?? null;
  useEffect(() => { if (activeGroup && groups[activeGroup] === false) setGroup(activeGroup, true); }, [activeGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  // The slide-over menu on a phone closes with Escape, like every other overlay
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMobile(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, closeMobile]);

  return (
    <TooltipProvider delayDuration={200}>
      <>
        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <div
            aria-hidden
            className="fixed inset-0 z-[45] bg-black/60 lg:hidden"
            onClick={closeMobile}
          />
        )}

        <aside aria-label="Main navigation" className={`menu-fixed flex flex-col transition-[width,transform] duration-300 ease-in-out lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${slim ? 'menu-slim' : ''}`}>

          {/* Brand and the collapse control, at the top where it is easy to find */}
          <div className={`relative flex h-[44px] shrink-0 items-center overflow-hidden justify-center ${slim ? '' : 'px-12'}`} style={{ borderBottom: '1px solid var(--shell-border)' }}>
            {!slim && (
              <Link href="/" onClick={closeMobile} aria-label="Kanakku, go to Home" className="flex items-center rounded-md px-1 focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"><BrandTitle className="h-8 w-auto" /></Link>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleSlim}
                  aria-label={slim ? 'Expand sidebar' : 'Collapse sidebar'}
                  className={`hidden lg:flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)] ${slim ? '' : 'absolute right-2'}`}
                  style={{ color: 'var(--shell-text-muted)' }}
                >
                  {slim ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-[12px]">{slim ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
            </Tooltip>
            {slim && <BrandMark small className="h-6 w-auto lg:hidden" />}
          </div>

          {/* Navigation */}
          <nav aria-label="Pages" className={`flex-1 py-2 overflow-y-auto custom-scrollbar ${slim ? 'px-2' : 'px-3'}`}>
            {NAV_GROUPS.map((group, gi) => {
              const visibleItems = group.items.filter((item) =>
                canAccessRoute(item.href, user?.role_name) && (!isEmployeeActive || EMPLOYEE_ALLOWED.includes(item.href)));
              if (visibleItems.length === 0) return null;
              const hasActive = visibleItems.some((i) => isOn(i.href));
              const open = !group.label || slim || (groups[group.label] ?? (OPEN_BY_DEFAULT.includes(group.label) || hasActive));
              // With the group closed, its open alerts move up to the heading so they are not lost
              const hidden = !open && visibleItems.some((i) => i.href === '/budget/monitor') && alertCount?.open ? { n: alertCount.open as number, critical: !!alertCount.critical } : null;
              return (
                // A hairline does the separating, so groups can sit close and still read as blocks
                <div key={gi} className={gi > 0 ? 'mt-1.5 border-t border-[var(--shell-border)] pt-1.5' : ''}>
                  {group.label && !slim && (
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setGroup(group.label as string, !open)}
                      className={`flex h-7 max-lg:h-9 w-full items-center gap-2 rounded-md px-3 text-[12px] capitalize transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)] ${hasActive ? 'font-semibold text-[var(--shell-text)]' : 'font-medium text-[var(--shell-text-muted)]'}`}
                    >
                      {group.label}
                      {hidden && <span className={`ml-auto font-semibold tabular-nums ${hidden.critical ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}><span className="sr-only">, </span>{hidden.n}<span className="sr-only"> open budget alerts</span></span>}
                      <ChevronDown aria-hidden className={`h-3.5 w-3.5 shrink-0 transition-transform ${hidden ? '' : 'ml-auto'} ${open ? '' : '-rotate-90'}`} />
                    </button>
                  )}
                  {open && (
                    <div className="space-y-px">
                      {visibleItems.map((item) => {
                        const isActive = isOn(item.href);
                        // Open alerts: a count beside the name, and a dot on the icon when the sidebar is slim
                        const alerts = item.href === '/budget/monitor' && alertCount?.open ? { n: alertCount.open as number, critical: !!alertCount.critical } : null;
                        const label = alerts ? `${item.name}, ${alerts.n} open` : item.name;
                        const linkEl = (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={closeMobile}
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={slim ? label : undefined}
                            className={`group relative flex items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)] ${
                              slim
                                ? 'justify-center w-9 h-8 max-lg:h-10 mx-auto'
                                : 'w-full h-8 max-lg:h-10 gap-2.5 px-3 text-[13px] capitalize'
                            } ${isActive ? 'nav-active' : 'text-[var(--shell-text)] hover:bg-[var(--shell-hover)]'}`}
                          >
                            <item.icon className={`h-4 w-4 shrink-0 ${isActive ? '' : group.iconColor}`} />
                            {!slim && item.name}
                            {!slim && alerts && (
                              <span className={`ml-auto text-[12px] font-semibold tabular-nums ${isActive ? '' : alerts.critical ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>{alerts.n}</span>
                            )}
                            {slim && alerts && (
                              <span aria-hidden className={`absolute right-1 top-1 h-2 w-2 rounded-full ${isActive ? 'bg-[var(--shell-accent-fg)]' : alerts.critical ? 'bg-[var(--danger)]' : 'bg-[var(--warning)]'}`} />
                            )}
                          </Link>
                        );

                        if (slim) {
                          return (
                            <Tooltip key={item.href}>
                              <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                              <TooltipContent side="right" className="text-[12px]">{label}</TooltipContent>
                            </Tooltip>
                          );
                        }
                        return linkEl;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>
      </>
    </TooltipProvider>
  );
}
