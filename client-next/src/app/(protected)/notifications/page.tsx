'use client';

import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useNotifications, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Bell, CheckCheck, Trash2, ShieldCheck, Info,
  AlertTriangle, XCircle, Filter, Search, X,
  RefreshCw, BellOff,
} from 'lucide-react';
import type { Notification } from '@/lib/types';
import { useConfirm } from '@/components/shared/modal-primitives';

// ─── Type config ──────────────────────────────────
const TYPE_CFG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  approval: { icon: ShieldCheck,   color: 'text-[var(--success)]', bg: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]', label: 'Approval' },
  warning:  { icon: AlertTriangle, color: 'text-[var(--warning)]',   bg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]',   label: 'Warning' },
  error:    { icon: XCircle,       color: 'text-[var(--danger)]',    bg: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]',    label: 'Error' },
  info:     { icon: Info,          color: 'text-[var(--info)]',    bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]',    label: 'Info' },
  system:   { icon: Info,          color: 'text-[var(--info)]',  bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]',  label: 'System' },
  budget:   { icon: AlertTriangle, color: 'text-[var(--warning)]',   bg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]',   label: 'Budget' },
};
const getCfg = (type: string) => TYPE_CFG[type] ?? TYPE_CFG.info;

const TYPE_FILTERS = [
  { label: 'All',      value: '' },
  { label: 'Approval', value: 'approval' },
  { label: 'Warning',  value: 'warning' },
  { label: 'Budget',   value: 'budget' },
  { label: 'System',   value: 'system' },
  { label: 'Info',     value: 'info' },
];

// ─── Notification Row ────────────────────────────
function NotifRow({ n, onMarkRead, onDelete, selected, onSelect }: {
  n: Notification; onMarkRead: (id: number) => void;
  onDelete: (id: number) => void; selected: boolean; onSelect: (id: number) => void;
}) {
  const cfg = getCfg(n.type);
  const Icon = cfg.icon;
  return (
    <div
      className={`group flex items-start gap-4 px-5 py-4 border-b cursor-pointer transition-all hover:bg-[var(--shell-hover)] ${!n.is_read ? 'bg-[var(--shell-accent)]/[0.04]' : ''} ${selected ? 'bg-[var(--shell-accent)]/10' : ''}`}
      style={{ borderColor: 'var(--shell-border)' }}
      onClick={() => onSelect(n.id)}
    >
      {/* Checkbox */}
      <div
        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-1 transition-all cursor-pointer ${selected ? 'border-[var(--shell-accent)] bg-[var(--shell-accent)]' : 'border-[var(--shell-border)] group-hover:border-[var(--shell-accent)]/50'}`}
        onClick={(e) => { e.stopPropagation(); onSelect(n.id); }}
      >
        {selected && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
      </div>

      {/* Icon */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
        <Icon className={`w-4 h-4 ${cfg.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-[13px] font-semibold leading-tight ${!n.is_read ? 'text-black dark:text-white' : ''}`}
                style={n.is_read ? { color: 'var(--shell-text)' } : {}}>
                {n.title}
              </p>
              {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] shrink-0" />}
              {n.reference_id && (
                <span className="font-mono text-[11px] font-bold text-[var(--info)] bg-[color-mix(in_srgb,var(--info)_10%,transparent)] px-1.5 py-0.5 rounded">
                  {n.reference_id}
                </span>
              )}
            </div>
            {n.message && (
              <p className="text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--shell-text-muted)' }}>
                {n.message}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1.5">
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                {cfg.label}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--shell-text-muted)' }}>
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--shell-text-muted)', opacity: 0.6 }}>
                {format(new Date(n.created_at), 'MMM d, h:mm a')}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {!n.is_read && (
              <button onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
                className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] transition-colors" title="Mark as read">
                <CheckCheck className="w-3.5 h-3.5 text-[var(--success)]" />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
              className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-colors" title="Delete">
              <Trash2 className="w-3.5 h-3.5 text-[var(--danger)]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────
export default function NotificationsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const invalidate = useInvalidate();
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();

  const [typeFilter, setTypeFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => { setHeader('Notifications', 'Alerts, approvals and system messages'); }, [setHeader]);

  const params: Record<string, string> = { limit: '100' };
  if (typeFilter) params.type = typeFilter;
  if (unreadOnly) params.unread = 'true';

  const { data: notifData, isLoading, refetch } = useNotifications(params);
  const allNotifications: Notification[] = (notifData as any)?.rows ?? [];
  const unreadCount: number = (notifData as any)?.unread_count ?? 0;
  const total: number = (notifData as any)?.total ?? 0;

  const notifications = useMemo(() => {
    if (!search) return allNotifications;
    const s = search.toLowerCase();
    return allNotifications.filter(
      (n) => n.title.toLowerCase().includes(s) || (n.message || '').toLowerCase().includes(s) || (n.reference_id || '').toLowerCase().includes(s)
    );
  }, [allNotifications, search]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleMarkRead = async (id: number) => {
    try { await api.patch('/notifications/mark-read', { ids: [id] }); invalidate('notifications'); }
    catch { toast.error('Failed to mark as read'); }
  };

  const handleMarkSelectedRead = async () => {
    if (selected.size === 0) return;
    try {
      await api.patch('/notifications/mark-read', { ids: Array.from(selected) });
      invalidate('notifications'); setSelected(new Set());
      toast.success(`${selected.size} notification(s) marked as read`);
    } catch { toast.error('Failed to mark as read'); }
  };

  const handleMarkAllRead = async () => {
    try { await api.patch('/notifications/mark-all-read', {}); invalidate('notifications'); toast.success('All notifications marked as read'); }
    catch { toast.error('Failed to mark all as read'); }
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/notifications/${id}`); invalidate('notifications'); }
    catch { toast.error('Failed to delete notification'); }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    try {
      await Promise.all(Array.from(selected).map((id) => api.delete(`/notifications/${id}`)));
      invalidate('notifications'); setSelected(new Set());
      toast.success(`${count} notification(s) deleted`);
    } catch { toast.error('Failed to delete'); }
  };

  const handleClearAll = async () => {
    const ok = await confirmDialog('Clear All Notifications', 'Remove all notifications? This cannot be undone.', { confirmLabel: 'Clear All', destructive: true });
    if (!ok) return;
    try { await api.delete('/notifications/clear-all'); invalidate('notifications'); toast.success('All notifications cleared'); }
    catch { toast.error('Failed to clear notifications'); }
  };

  const allSelected = notifications.length > 0 && notifications.every((n) => selected.has(n.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(notifications.map((n) => n.id)));
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--shell-bg)' }}>
      {confirmDialogEl}

      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-b flex-wrap" style={{ borderColor: 'var(--shell-border)', background: 'var(--shell-surface)' }}>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--shell-text-muted)' }} />
          <input
            className="h-8 w-52 pl-9 pr-3 text-[12px] rounded-lg border outline-none transition-colors"
            style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }}
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3" style={{ color: 'var(--shell-text-muted)' }} />
            </button>
          )}
        </div>

        {/* Type filter pills */}
        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--shell-text-muted)' }} />
          {TYPE_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setTypeFilter(f.value)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                typeFilter === f.value
                  ? 'bg-[var(--shell-accent)]/15 text-[var(--info)] border-[var(--shell-accent)]/40'
                  : 'text-[var(--shell-text-muted)] border-transparent hover:border-[var(--shell-border)] hover:text-[var(--shell-text)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Unread toggle */}
        <button onClick={() => setUnreadOnly(!unreadOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all ${
            unreadOnly ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)]' : 'text-[var(--shell-text-muted)] border-[var(--shell-border)] hover:text-[var(--shell-text)]'
          }`}
        >
          <Bell className="w-3 h-3" /> Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </button>

        <div className="flex-1" />

        {/* Bulk / global actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold" style={{ color: 'var(--shell-text-muted)' }}>{selected.size} selected</span>
            <button onClick={handleMarkSelectedRead} className="btn-action flex items-center gap-1 text-[11px]">
              <CheckCheck className="w-3.5 h-3.5 text-[var(--success)]" /> Mark read
            </button>
            <button onClick={handleDeleteSelected} className="btn-action flex items-center gap-1 text-[11px] text-[var(--danger)]">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
        {unreadCount > 0 && selected.size === 0 && (
          <button onClick={handleMarkAllRead} className="btn-action flex items-center gap-1 text-[11px]">
            <CheckCheck className="w-3.5 h-3.5 text-[var(--success)]" /> Mark all read
          </button>
        )}
        <button onClick={() => refetch()} className="btn-action flex items-center gap-1 text-[11px]" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        {notifications.length > 0 && (
          <button onClick={handleClearAll} className="btn-action flex items-center gap-1 text-[11px] text-[var(--danger)]">
            <Trash2 className="w-3.5 h-3.5" /> Clear all
          </button>
        )}
      </div>

      {/* ── Stats / select bar ── */}
      <div className="shrink-0 flex items-center gap-4 px-5 py-2 border-b" style={{ borderColor: 'var(--shell-border)', background: 'var(--shell-surface)' }}>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--shell-text-muted)' }}>
          {total} total · {unreadCount} unread
        </span>
        <div className="flex-1" />
        <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-[11px] font-semibold transition-colors hover:text-[var(--shell-text)]" style={{ color: 'var(--shell-text-muted)' }}>
          <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all ${allSelected ? 'border-[var(--shell-accent)] bg-[var(--shell-accent)]' : 'border-[var(--shell-border)]'}`}>
            {allSelected && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
          </div>
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {/* ── Notification list ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} className="flex items-start gap-4 px-5 py-4 border-b" style={{ borderColor: 'var(--shell-border)' }}>
              <div className="w-4 h-4 rounded bg-[var(--shell-hover)] animate-pulse shrink-0 mt-1" />
              <div className="w-9 h-9 rounded-xl bg-[var(--shell-hover)] animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-48 rounded bg-[var(--shell-hover)] animate-pulse" />
                <div className="h-2.5 w-72 rounded bg-[var(--shell-hover)] animate-pulse" />
                <div className="h-2 w-24 rounded bg-[var(--shell-hover)] animate-pulse" />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-24">
            <div className="w-16 h-16 rounded-full bg-[var(--shell-hover)] flex items-center justify-center">
              <BellOff className="w-7 h-7" style={{ color: 'var(--shell-text-muted)' }} />
            </div>
            <p className="text-[14px] font-semibold" style={{ color: 'var(--shell-text)' }}>
              {unreadOnly ? 'No unread notifications' : search ? 'No matching notifications' : 'All caught up!'}
            </p>
            <p className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>
              {unreadOnly ? 'All notifications are read.' : 'Notifications will appear here.'}
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotifRow key={n.id} n={n} onMarkRead={handleMarkRead} onDelete={handleDelete}
              selected={selected.has(n.id)} onSelect={toggleSelect} />
          ))
        )}
      </div>
    </div>
  );
}
