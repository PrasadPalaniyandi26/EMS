'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Small pieces of the Home dashboard. Colour is a role: income is the success colour, spending is the series blue,
// and red is kept for what is wrong. Statuses are plain coloured text, never a chip.

export const TONE_TEXT = {
  success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', info: 'text-[var(--info)]', muted: 'text-[var(--shell-text-muted)]',
} as const;
export type Tone = keyof typeof TONE_TEXT;

export function Skeleton({ w, h = '1rem', className }: { w?: string; h?: string; className?: string }) {
  return <div className={cn('rounded-md motion-safe:animate-pulse', className)} style={{ width: w, height: h, background: 'var(--shell-hover)' }} />;
}

// A line over the last months: no axes, it shows the shape and the last point
export function Spark({ values, color = 'var(--chart-1)', label }: { values: number[]; color?: string; label: string }) {
  if (values.length < 2 || values.every((v) => v === 0)) return <div aria-hidden className="h-8" />;
  const w = 120; const h = 32; const pad = 3;
  const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (w - pad * 2), h - pad - ((v - min) / span) * (h - pad * 2)] as const);
  const last = pts[pts.length - 1];
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

// "+12.4% vs last month": the change against the period before, in the colour of what it means
export function Delta({ now, before, goodWhen = 'up', versus, format }: { now: number; before: number | null | undefined; goodWhen?: 'up' | 'down'; versus: string; format?: (n: number) => string }) {
  if (before == null) return <p className="mt-1 text-[12px] text-[var(--shell-text-muted)]">No earlier period to compare</p>;
  const diff = now - before;
  if (Math.abs(diff) < 0.005) return <p className="mt-1 text-[12px] text-[var(--shell-text-muted)]">No change vs {versus}</p>;
  const pct = before !== 0 ? (diff / Math.abs(before)) * 100 : null;
  const good = goodWhen === 'up' ? diff > 0 : diff < 0;
  const text = pct != null && Math.abs(pct) < 1000 ? `${diff > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%` : `${diff > 0 ? '+' : '−'}${format ? format(Math.abs(diff)) : Math.abs(diff).toFixed(0)}`;
  return (
    <p className="mt-1 text-[12px] tabular-nums text-[var(--shell-text-muted)]">
      <span className={cn('font-medium', good ? TONE_TEXT.success : TONE_TEXT.warning)}>{text}</span> vs {versus}
    </p>
  );
}

// One of the headline figures: the number leads, then what it is compared to, then the shape of the last twelve months
export function Figure({ label, value, valueClass, loading, onClick, children, spark }: {
  label: string; value: ReactNode; valueClass?: string; loading?: boolean; onClick?: () => void; children?: ReactNode; spark?: ReactNode;
}) {
  const body = (
    <div className="flex h-full min-w-0 flex-col text-left">
      <p className="text-[13px] font-medium text-[var(--shell-text-muted)]">{label}</p>
      {loading ? <Skeleton w="7rem" h="1.75rem" className="mt-2" /> : <p className={cn('mt-1.5 truncate text-[22px] font-semibold leading-none tracking-[-0.01em] tabular-nums text-[var(--shell-text)]', valueClass)}>{value}</p>}
      {!loading && children}
      {spark && <div className="mt-auto pt-3">{spark}</div>}
    </div>
  );
  const base = 'block h-full w-full bg-[var(--shell-surface)] p-4';
  return onClick
    ? <button type="button" onClick={onClick} className={cn(base, 'cursor-pointer transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)]')}>{body}</button>
    : <div className={base}>{body}</div>;
}

// Used against what the plan allows, with a mark for how much of the year has gone: a bar past the mark is spending ahead of time
export function BudgetBar({ pct, elapsed, label }: { pct: number; elapsed?: number | null; label: string }) {
  const color = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="relative">
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Math.round(pct), 100)} className="h-2 overflow-hidden rounded-md bg-[var(--shell-hover)]">
        <div className="h-full rounded-md" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      {elapsed != null && <span aria-hidden title={`${Math.round(elapsed)}% of the year has passed`} className="absolute -top-1 h-4 w-px bg-[var(--shell-text)]" style={{ left: `${Math.min(elapsed, 100)}%` }} />}
    </div>
  );
}

export const STATUS_WORD: Record<string, { label: string; tone: Tone }> = {
  APPROVED: { label: 'Approved', tone: 'success' }, PENDING_MANAGER: { label: 'Waiting for manager', tone: 'warning' }, PENDING_FINANCE: { label: 'Waiting for finance', tone: 'warning' },
  DRAFT: { label: 'Draft', tone: 'muted' }, SENT_BACK: { label: 'Sent back', tone: 'muted' }, REJECTED: { label: 'Rejected', tone: 'danger' },
};
