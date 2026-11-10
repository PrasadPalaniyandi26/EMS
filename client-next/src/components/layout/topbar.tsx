'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useThemeStore } from '@/stores/theme-store';
import { useUnreadCount, useNotifications, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { Bell, Settings, LogOut, UserCircle, RefreshCw, Check, Menu, Sun, Moon, ShieldCheck, Info, AlertTriangle, XCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// ─── Notification type config ────────────────────
const notifConfig: Record<string, { icon: React.ElementType; color: string; dot: string }> = {
  approval: { icon: ShieldCheck,    color: 'text-[var(--success)]', dot: 'bg-[var(--success)]' },
  warning:  { icon: AlertTriangle,  color: 'text-[var(--warning)]', dot: 'bg-[var(--warning)]' },
  error:    { icon: XCircle,        color: 'text-[var(--danger)]',  dot: 'bg-[var(--danger)]' },
  info:     { icon: Info,           color: 'text-[var(--info)]',    dot: 'bg-[var(--info)]' },
  system:   { icon: Info,           color: 'text-nav-indigo',       dot: 'bg-nav-indigo' },
  budget:   { icon: AlertTriangle,  color: 'text-[var(--warning)]', dot: 'bg-[var(--warning)]' },
};
const getNotifCfg = (type: string) => notifConfig[type] ?? notifConfig.info;
const sentenceCase = (s: string) => s.toLowerCase().replace(/^./, (c) => c.toUpperCase());

// ─── Bell Dropdown ────────────────────────────────
const iconBtn = 'relative flex h-9 w-9 items-center justify-center rounded-md text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)] lg:h-8 lg:w-8';

function BellDropdown() {
  const router = useRouter();
  const invalidate = useInvalidate();
  const { data: unreadData } = useUnreadCount();
  const unreadCount = (unreadData as any)?.unread_count ?? 0;

  const [open, setOpen] = useState(false);
  const { data: notifData } = useNotifications({ limit: '8' });
  const notifications: any[] = (notifData as any)?.rows ?? [];

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/mark-all-read', {});
      invalidate('notifications');
    } catch { /* best-effort: UI will still update on next poll */ }
  };

  const handleMarkOne = async (id: number) => {
    try {
      await api.patch('/notifications/mark-read', { ids: [id] });
      invalidate('notifications');
    } catch { /* best-effort: UI will still update on next poll */ }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className={iconBtn} aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'} title="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span aria-hidden className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[12px] font-semibold leading-none text-[var(--danger-foreground)]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="mt-1 w-[340px] overflow-hidden rounded-lg p-0"
        style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--shell-border)' }}>
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-[var(--shell-text)]">Notifications</span>
            {unreadCount > 0 && <span className="text-[13px] text-[var(--shell-text-muted)]">{unreadCount} unread</span>}
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={handleMarkAllRead} className="rounded-md px-1 text-[13px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
          {notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-[var(--shell-text-muted)]">No notifications.</p>
          ) : (
            notifications.map((n: any) => {
              const cfg = getNotifCfg(n.type);
              const Icon = cfg.icon;
              return (
                <DropdownMenuItem
                  key={n.id}
                  onSelect={(e) => { e.preventDefault(); if (!n.is_read) handleMarkOne(n.id); }}
                  className="flex cursor-pointer items-start gap-3 rounded-none border-b px-4 py-3"
                  style={{ borderColor: 'var(--shell-border)' }}
                >
                  <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[13px] leading-tight ${n.is_read ? 'text-[var(--shell-text-muted)]' : 'font-semibold text-[var(--shell-text)]'}`}>{n.title}</p>
                    {n.message && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--shell-text-muted)]">{n.message}</p>}
                    <p className="mt-1 text-[12px] text-[var(--shell-text-muted)]">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                  </div>
                  {!n.is_read && <span role="img" aria-label="Unread" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />}
                </DropdownMenuItem>
              );
            })
          )}
        </div>

        <div className="border-t px-4 py-2.5 text-center" style={{ borderColor: 'var(--shell-border)' }}>
          <button
            type="button"
            onClick={() => { setOpen(false); router.push('/notifications'); }}
            className="rounded-md px-2 py-1 text-[13px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"
          >
            View all notifications
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── TopBar ───────────────────────────────────────
export function TopBar() {
  const router = useRouter();
  const { title, subtitle } = useHeaderStore();
  const { user, logout, switchRole } = useAuthStore();
  const toggleMobile = useSidebarStore((s) => s.toggleMobile);
  const { theme, toggleTheme } = useThemeStore();

  const handleSwitchRole = async (roleId: number) => {
    try {
      await switchRole(roleId);
      toast.success('Role switched successfully.');
    } catch {
      toast.error('Failed to switch role.');
    }
  };

  return (
    <header className="fixed-top">
      {/* Left: hamburger (mobile) + page title */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          className={`${iconBtn} lg:hidden`}
          onClick={toggleMobile}
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-[15px] font-semibold leading-none capitalize" style={{ color: 'var(--shell-text)' }}>
            {title || 'Dashboard'}
          </h1>
          {subtitle && (
            <span className="hidden shrink-0 text-[12px] font-normal sm:inline" style={{ color: 'var(--shell-text-muted)' }}>{subtitle}</span>
          )}
        </div>
      </div>

      {/* Right: icons + avatar */}
      <div className="flex shrink-0 items-center gap-1">

        {/* Theme toggle */}
        <button
          className={iconBtn}
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Bell with dropdown */}
        <BellDropdown />

        {/* Settings */}
        <button
          className={iconBtn}
          onClick={() => router.push('/settings')}
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>


        {/* Avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-2 flex items-center gap-2 rounded-md px-2 py-1 outline-none transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"
              style={{ color: 'var(--shell-text)' }}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[12px] font-semibold"
                style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}>
                {(() => { const p = (user?.username || 'U').trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0].slice(0, 2).toUpperCase(); })()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-[12px] font-semibold leading-none" style={{ color: 'var(--shell-text)' }}>
                  {user?.username || 'Admin'}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--shell-text-muted)' }}>
                  {sentenceCase(String(user?.role_name || user?.role || 'System admin'))}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 mt-1 rounded-lg"
            style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
            <DropdownMenuLabel className="text-[12px] font-semibold px-3 py-2"
              style={{ color: 'var(--shell-text-muted)' }}>
              Account
            </DropdownMenuLabel>
            <DropdownMenuSeparator style={{ background: 'var(--shell-border)' }} />
            <DropdownMenuItem className="cursor-pointer gap-2.5 px-3 py-2 rounded-lg mx-1"
              style={{ color: 'var(--shell-text)' }}
              onClick={() => router.push('/settings')}>
              <UserCircle className="w-3.5 h-3.5" style={{ color: 'var(--shell-text-muted)' }} />
              <span className="text-[13px]">Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2.5 px-3 py-2 rounded-lg mx-1"
              style={{ color: 'var(--shell-text)' }}
              onClick={() => router.push('/settings?tab=preferences')}>
              <Settings className="w-3.5 h-3.5" style={{ color: 'var(--shell-text-muted)' }} />
              <span className="text-[13px]">Preferences</span>
            </DropdownMenuItem>
            {user?.roles && user.roles.length > 0 && (
              <>
                <DropdownMenuSeparator style={{ background: 'var(--shell-border)' }} />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer gap-2.5 px-3 py-2 rounded-lg mx-1"
                    style={{ color: 'var(--shell-text)' }}>
                    <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--shell-text-muted)' }} />
                    <span className="text-[13px]">Switch role</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="rounded-lg min-w-[160px]"
                    style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                    {user.roles.map((r) => (
                      <DropdownMenuItem
                        key={r.role_id}
                        className="cursor-pointer gap-2.5 px-3 py-2 rounded-lg mx-1"
                        onClick={() => handleSwitchRole(r.role_id)}
                      >
                        <Check className={`w-3 h-3 ${r.role_id === user.role_id ? '' : 'opacity-0'}`}
                          style={{ color: r.role_id === user.role_id ? 'var(--shell-accent)' : undefined }} />
                        <span className="text-[13px]"
                          style={{ color: r.role_id === user.role_id ? 'var(--shell-accent)' : 'var(--shell-text)', fontWeight: r.role_id === user.role_id ? 600 : 400 }}>
                          {r.role_name}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            <DropdownMenuSeparator style={{ background: 'var(--shell-border)' }} />
            <DropdownMenuItem
              className="cursor-pointer gap-2.5 px-3 py-2 rounded-lg mx-1 mb-1 text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] focus:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
              onClick={() => logout()}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="text-[13px] font-medium">Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
