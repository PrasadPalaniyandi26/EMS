'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'success' | 'warning' | 'danger' | 'muted' | 'normal';
export const TONE_TEXT: Record<Tone, string> = {
  success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', muted: 'text-[var(--shell-text-muted)]', normal: 'text-[var(--shell-text)]',
};
const TONE_FILL: Record<Exclude<Tone, 'normal'>, string> = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', muted: 'var(--shell-text-muted)' };

export const pct = (v: number | null | undefined, digits = 1) => (v == null ? '–' : `${v.toFixed(digits)}%`);
export const signedPct = (v: number | null | undefined) => (v == null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
export const compact = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

// The few figures that answer the question of a tab, in one strip
export function Kpis({ items }: { items: { label: string; value: ReactNode; tone?: Tone; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 divide-x divide-y divide-[var(--shell-border)] overflow-hidden rounded-lg border border-[var(--shell-border)] bg-[var(--shell-surface)] sm:grid-cols-3 sm:divide-y-0 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ '--cols': items.length } as React.CSSProperties}>
      {items.map((k) => (
        <div key={k.label} className="px-4 py-3">
          <dt className="text-[12px] text-[var(--shell-text-muted)]">{k.label}</dt>
          <dd className={cn('mt-1 text-[18px] font-semibold tabular-nums', TONE_TEXT[k.tone ?? 'normal'])}>{k.value}</dd>
          {k.hint && <p className="mt-0.5 text-[12px] text-[var(--shell-text-muted)]">{k.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

export const EMPTY_NOTE = 'px-4 py-10 text-pretty text-center text-[13px] text-[var(--shell-text-muted)]';

// A table that sits inside a Panel: quiet header, hairline rows, numbers on the right
export function DataGrid({ caption, columns, children }: { caption: string; columns: { label: string; right?: boolean; width?: string }[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--shell-border)]">
            {columns.map((c) => (
              <th key={c.label} scope="col" style={c.width ? { width: c.width } : undefined} className={cn('whitespace-nowrap px-4 py-2 text-[12px] font-medium text-[var(--shell-text-muted)]', c.right ? 'text-right' : 'text-left')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--shell-border)]">{children}</tbody>
      </table>
    </div>
  );
}
export const Cell = ({ children, right, strong, tone = 'normal', className }: { children: ReactNode; right?: boolean; strong?: boolean; tone?: Tone; className?: string }) => (
  <td className={cn('px-4 py-2.5 align-middle', right && 'text-right tabular-nums', strong && 'font-medium', TONE_TEXT[tone], className)}>{children}</td>
);

// Two bars per month side by side. The same numbers are in a table for screen readers.
export function PairBars({ data, a, b, format }: { data: { label: string; a: number; b: number }[]; a: { label: string; tone: Exclude<Tone, 'normal'> }; b: { label: string; tone: Exclude<Tone, 'normal'> }; format: (v: number) => string }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return (
    <figure className="p-4">
      <div className="flex items-center gap-4 pb-3 text-[12px] text-[var(--shell-text-muted)]">
        {[a, b].map((s) => (
          <span key={s.label} className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: TONE_FILL[s.tone] }} />{s.label}</span>
        ))}
      </div>
      <div aria-hidden className="flex h-36 items-end gap-2">
        {data.map((d) => (
          <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <div className="flex h-full items-end justify-center gap-0.5">
              {[{ v: d.a, s: a }, { v: d.b, s: b }].map(({ v, s }) => (
                <div key={s.label} title={`${d.label}: ${s.label} ${format(v)}`} className="w-full max-w-4 rounded-t-sm" style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 0}%`, background: TONE_FILL[s.tone] }} />
              ))}
            </div>
            <span className="truncate text-center text-[12px] text-[var(--shell-text-muted)]">{d.label}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{a.label} and {b.label} by month</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">{a.label}</th><th scope="col">{b.label}</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><th scope="row">{d.label}</th><td>{format(d.a)}</td><td>{format(d.b)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

// One line for the movement of a price over its purchases
export function Sparkline({ points, tone = 'muted' }: { points: number[]; tone?: Exclude<Tone, 'normal'> }) {
  if (points.length < 2) return <span className="text-[var(--shell-text-muted)]">–</span>;
  const lo = Math.min(...points); const hi = Math.max(...points); const span = hi - lo || 1;
  const w = 72; const h = 22;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / (points.length - 1)) * w).toFixed(1)},${(h - 2 - ((p - lo) / span) * (h - 4)).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Price went from ${points[0]} to ${points[points.length - 1]}`}>
      <path d={d} fill="none" stroke={TONE_FILL[tone]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const PanelSkeleton = ({ h = 120 }: { h?: number }) => <div className="m-4 rounded-md motion-safe:animate-pulse" style={{ height: h, background: 'var(--shell-hover)' }} />;
