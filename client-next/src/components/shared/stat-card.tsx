import React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'info' | 'accent';

// Icon tile colours per tone, from the semantic tokens (AA-safe on the surface in both themes)
const TONE_ICON: Record<Tone, string> = {
  default: 'text-[var(--shell-text-muted)] bg-[var(--shell-hover)]',
  success: 'text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]',
  danger: 'text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]',
  warning: 'text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]',
  info: 'text-[var(--info)] bg-[color-mix(in_srgb,var(--info)_12%,transparent)]',
  accent: 'text-[var(--shell-accent)] bg-[color-mix(in_srgb,var(--shell-accent)_12%,transparent)]',
};

// The KPI row on the Dashboard and the Hub: one bordered strip, cells separated by hairlines, no floating cards.
export function StatStrip({ children, cols = 4 }: { children: React.ReactNode; cols?: 4 | 6 }) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border border-[var(--shell-border)] bg-[var(--shell-border)]',
        cols === 6 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 lg:grid-cols-4',
      )}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  loading?: boolean;
  /** Makes the whole cell a real button (focusable, Enter/Space) instead of a static block */
  onClick?: () => void;
}

// One cell of a StatStrip: label and value on the left, a tinted icon tile on the right.
export function StatCard({ label, value, icon, tone = 'default', loading, onClick }: StatCardProps) {
  const body = (
    <>
      <div className="min-w-0 flex-1 text-left">
        <p className="mb-1 truncate text-[12px] font-medium text-[var(--shell-text-muted)]">{label}</p>
        {loading
          ? <div className="mt-1 h-6 w-16 rounded-sm bg-[var(--shell-hover)] motion-safe:animate-pulse" />
          : <p className="truncate text-[18px] font-semibold leading-none tabular-nums text-[var(--shell-text)]">{value}</p>}
      </div>
      {icon && <div aria-hidden className={cn('ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md', TONE_ICON[tone])}>{icon}</div>}
    </>
  );
  const base = 'flex items-center justify-between bg-[var(--shell-surface)] p-4';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, 'w-full cursor-pointer transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)]')}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
