'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useThemeStore } from '@/stores/theme-store';
import { useUnreadCount, useNotifications, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { Bell, Settings, LogOut, UserCircle, RefreshCw, Check, Menu, Sun, Moon, CheckCheck, ArrowRight, ShieldCheck, Info, AlertTriangle, XCircle } from 'lucide-react';
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

// ─── Bell Dropdown ────────────────────────────────
function BellDropdown() {
  const router = useRouter();
  const invalidate = useInvalidate();
  const { data: unreadData } = useUnreadCount();
  const unreadCount = (unreadData as any)?.unread_count ?? 0;

  const [open, setOpen] = useState(false);
  const { data: notifData } = useNotifications({ limit: '8' });
  const notifications: any[] = (notifData as any)?.rows ?? [];

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.patch('/notifications/mark-all-read', {});
      invalidate('notifications');
    } catch { /* best-effort: UI will still update on next poll */ }
  };

  const handleMarkOne = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await api.patch('/notifications/mark-read', { ids: [id] });
      invalidate('notifications');
    } catch { /* best-effort: UI will still update on next poll */ }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative w-9 h-9 lg:w-7 lg:h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)]"
          style={{ color: 'var(--shell-text-muted)' }}
          title="Notifications"
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-[var(--danger)] text-[var(--danger-foreground)] text-[12px] font-semibold flex items-center justify-center px-[3px] leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[340px] mt-1 rounded-lg p-0 overflow-hidden"
        style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--shell-border)' }}>
          <div className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5" style={{ color: 'var(--shell-accent)' }} />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--shell-text)' }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] text-[12px] font-semibold">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-[12px] font-semibold transition-colors hover:text-[var(--shell-accent)]"
              style={{ color: 'var(--shell-text-muted)' }}
            >
              <CheckCheck className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Bell className="w-8 h-8" style={{ color: 'var(--shell-text-muted)', opacity: 0.3 }} />
              <p className="text-[12px] font-semibold" style={{ color: 'var(--shell-text-muted)' }}>All caught up!</p>
            </div>
          ) : (
            notifications.map((n: any) => {
              const cfg = getNotifCfg(n.type);
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-all border-b ${!n.is_read ? 'bg-[var(--shell-accent)]/5' : ''}`}
                  style={{ borderColor: 'var(--shell-border)' }}
                  onClick={(e) => { if (!n.is_read) handleMarkOne(e, n.id); }}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${cfg.color} bg-current/10`}
                    style={{ background: `color-mix(in srgb, currentColor 12%, transparent)` }}>
                    <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[12px] font-semibold leading-tight truncate ${!n.is_read ? 'text-black dark:text-white' : ''}`}
                        style={n.is_read ? { color: 'var(--shell-text-muted)' } : {}}>
                        {n.title}
                      </p>
                      {!n.is_read && <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${cfg.dot}`} />}
                    </div>
                    {n.message && (
                      <p className="text-[12px] mt-0.5 leading-snug line-clamp-2" style={{ color: 'var(--shell-text-muted)' }}>
                        {n.message}
                      </p>
                    )}
                    <p className="text-[12px] font-medium mt-1" style={{ color: 'var(--shell-text-muted)', opacity: 0.7 }}>
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t" style={{ borderColor: 'var(--shell-border)' }}>
          <button
            onClick={() => { setOpen(false); router.push('/notifications'); }}
            className="flex items-center gap-1.5 text-[12px] font-semibold w-full justify-center py-1 rounded-lg transition-colors hover:bg-[var(--shell-hover)]"
            style={{ color: 'var(--shell-accent)' }}
          >
            View all notifications <ArrowRight className="w-3 h-3" />
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
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--shell-hover)] text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] transition-colors"
          onClick={toggleMobile}
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <h1 className="text-[15px] font-semibold leading-none" style={{ color: 'var(--shell-text)' }}>
          {title || 'Dashboard'}
        </h1>
        {subtitle && (
          <span className="hidden sm:inline text-[12px] font-normal" style={{ color: 'var(--shell-text-muted)' }}>{subtitle}</span>
        )}
      </div>

      {/* Right: icons + avatar */}
      <div className="flex items-center gap-1">
        <div className="w-px h-4 mx-1" style={{ background: 'var(--shell-border)' }} />

        {/* Theme toggle */}
        <button
          className="w-9 h-9 lg:w-7 lg:h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)]"
          style={{ color: 'var(--shell-text-muted)' }}
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* Bell with dropdown */}
        <BellDropdown />

        {/* Settings */}
        <button
          className="w-9 h-9 lg:w-7 lg:h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)]"
          style={{ color: 'var(--shell-text-muted)' }}
          onClick={() => router.push('/settings')}
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        <div className="w-px h-4 mx-1" style={{ background: 'var(--shell-border)' }} />

        {/* Avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1 rounded-lg outline-none focus:outline-none focus-visible:ring-0 transition-colors hover:bg-[var(--shell-hover)]"
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
                  {user?.role_name || user?.role || 'System Admin'}
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
                    <span className="text-[13px]">Switch Role</span>
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
              <span className="text-[13px] font-medium">Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
