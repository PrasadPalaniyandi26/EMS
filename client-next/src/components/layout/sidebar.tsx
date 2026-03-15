'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import {
  LayoutGrid, ShieldCheck, Receipt, Wallet, User, FolderOpen, Package,
  Building2, PiggyBank, RefreshCw, BarChart3, Settings, Bell, Atom, LogOut, Landmark, HandCoins
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'MAIN',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutGrid },
    ],
  },
  {
    label: 'TRANSACTION',
    items: [
      { name: 'Approvals', href: '/approvals', icon: ShieldCheck },
      { name: 'Expense', href: '/expense', icon: Receipt },
      { name: 'Income', href: '/income', icon: HandCoins },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { name: 'Client', href: '/manage/clients', icon: User },
      { name: 'Project', href: '/manage/projects', icon: FolderOpen },
      { name: 'Product', href: '/manage/products', icon: Package },
    ],
  },
  {
    label: 'MANAGE',
    items: [
      { name: 'Organization', href: '/manage/organization', icon: Building2 },
      { name: 'Budget', href: '/manage/budgets', icon: PiggyBank },
      { name: 'Recurring', href: '/manage/recurring', icon: RefreshCw },
    ],
  },
  {
    label: 'ANALYTICS',
    items: [
      { name: 'Resource Utilization', href: '/analytics/resource-utilization', icon: BarChart3 },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <aside className="menu-fixed flex flex-col shadow-2xl">
      {/* Header */}
      <div className="h-16 flex items-center px-6 border-b border-white/10 shrink-0">
        <Landmark className="text-white h-7 w-7" />
        <h1 className="ml-3 text-lg font-bold tracking-tight text-white uppercase">Finance Hub</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto hide-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-2.5">
            <p className="px-6 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center px-6 py-1.5 text-white transition-colors ${
                      isActive
                        ? 'sidebar-link-active'
                        : 'hover:bg-white/10'
                    }`}
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                    <span className={`ml-4 text-[13px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                      {item.name}
                    </span>
                    <svg className={`ml-auto h-3 w-3 ${isActive ? 'text-white' : 'text-white/40'}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer removed per design spec, moved to topbar */}
    </aside>
  );
}
