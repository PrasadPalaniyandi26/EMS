'use client';

import { useEffect, useState, type KeyboardEvent, type ReactNode, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { RelatedLinks } from '@/components/layout/related-links';
import type { AlertLevel, BudgetPlanInfo, LineStatus, PlanStatus } from '@/hooks/use-budget-queries';

// The money formats live in lib/money.ts; they are re-exported here because every budget screen imports them from this file
import { money, plain, unitPrice, unitPlain } from '@/lib/money';
export { money, plain, unitPrice, unitPlain };

const LEVEL_TEXT: Record<AlertLevel, { label: string; cls: string }> = {
  CRITICAL: { label: 'Critical', cls: 'text-[var(--danger)]' },
  WARNING: { label: 'Warning', cls: 'text-[var(--warning)]' },
  CAUTION: { label: 'Caution', cls: 'text-[var(--warning)]' },
  INFO: { label: 'Info', cls: 'text-[var(--info)]' },
};

// Alert level as coloured plain text, like every other state in tables
export function LevelText({ level }: { level: AlertLevel }) {
  const l = LEVEL_TEXT[level] ?? LEVEL_TEXT.INFO;
  return <span className={cn('text-[13px] font-medium', l.cls)}>{l.label}</span>;
}

export const STATUS_TEXT: Record<LineStatus, string> = {
  'On track': 'text-[var(--success)]',
  Caution: 'text-[var(--warning)]',
  Warning: 'text-[var(--warning)]',
  Critical: 'text-[var(--danger)]',
  Held: 'text-[var(--shell-text-muted)]',
};

export function LineStatusText({ status }: { status: LineStatus }) {
  return <span className={cn('text-[13px] font-medium', STATUS_TEXT[status] ?? '')}>{status}</span>;
}

const PLAN_STATUS: Record<PlanStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'text-[var(--shell-text-muted)]' },
  SUBMITTED: { label: 'With Finance', cls: 'text-[var(--warning)]' },
  APPROVED: { label: 'Approved', cls: 'text-[var(--success)]' },
  ACTIVE: { label: 'Active', cls: 'text-[var(--success)]' },
  CLOSED: { label: 'Closed', cls: 'text-[var(--shell-text-muted)]' },
};

export function PlanStatusText({ status }: { status: PlanStatus }) {
  const s = PLAN_STATUS[status] ?? PLAN_STATUS.DRAFT;
  return <span className={cn('text-[13px] font-medium', s.cls)}>{s.label}</span>;
}

// Utilisation bar; goes amber at 90% and red at 100%
export function UtilBar({ pct, className }: { pct: number; className?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  const colour = pct >= 100 ? 'bg-[var(--danger)]' : pct >= 90 ? 'bg-[var(--warning)]' : 'bg-[var(--shell-accent)]';
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-[var(--shell-border)]', className)} role="img" aria-label={`${Math.round(pct)}% used`}>
      <div className={cn('h-full', colour)} style={{ width: `${w}%` }} />
    </div>
  );
}

// The financial years to choose from, as filter options: the plans that exist, plus the current year when it has none yet
export function fyOptions(plans: BudgetPlanInfo[], currentFy?: number, startMonth = 4) {
  const label = (fy: number) => (startMonth === 1 ? `FY ${fy}` : `FY ${fy}-${String(fy + 1).slice(2)}`);
  return [...new Set([...plans.map((p) => p.fy), ...(currentFy != null ? [currentFy] : [])])].sort((a, b) => b - a).map((fy) => ({ value: String(fy), label: label(fy) }));
}

// One KPI cell for a strip of figures
export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <div className="min-w-0 flex-1 px-4 py-3">
      <p className="text-[12px] text-[var(--shell-text-muted)]">{label}</p>
      <p className={cn('mt-0.5 text-[18px] font-semibold tabular-nums', tone === 'danger' ? 'text-[var(--danger)]' : tone === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--shell-text)]')}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-[var(--shell-text-muted)]">{sub}</p>}
    </div>
  );
}

export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 divide-x divide-[var(--shell-border)] overflow-x-auto border-b border-[var(--shell-border)] bg-[var(--shell-surface)]">{children}</div>;
}

// Tabs for the detail pages: one row, the active tab underlined with the accent
// The open tab lives in the address (?tab=), so a reload or a shared link opens the same one
export function useTabParam<T extends string>(valid: readonly T[], initial: T): [T, (t: T) => void] {
  const [tab, setTab] = useState<T>(initial);
  const key = valid.join();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab') as T | null;
    if (q && valid.includes(q)) setTab(q);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [tab, (t) => { setTab(t); window.history.replaceState(null, '', `?tab=${t}`); }];
}

// The page puts role="tabpanel" id={panelId} aria-labelledby={`tab-${value}`} around the active tab's content.
// One tab is in the tab order; arrow keys, Home and End move between tabs.
export function TabBar<T extends string>({ tabs, value, onChange, panelId = 'tabpanel' }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void; panelId?: string }) {
  const list = useRef<HTMLDivElement>(null);
  // On a narrow screen the tab row scrolls, so the open tab is brought into view
  useEffect(() => {
    const box = list.current;
    const tab = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (box && tab && (tab.offsetLeft < box.scrollLeft || tab.offsetLeft + tab.offsetWidth > box.scrollLeft + box.clientWidth)) box.scrollLeft = tab.offsetLeft - 16;
  }, [value, tabs.length]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.value === value);
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].value);
    requestAnimationFrame(() => document.getElementById(`tab-${tabs[next].value}`)?.focus());
  };
  return (
    <div className="flex shrink-0 flex-wrap gap-x-4 border-b border-[var(--shell-border)] px-4">
    <div ref={list} role="tablist" onKeyDown={onKey} className="relative flex max-w-full gap-1 overflow-x-auto overflow-y-hidden">
      {tabs.map((t) => (
        <button
          key={t.value} id={`tab-${t.value}`} type="button" role="tab" aria-selected={value === t.value} aria-controls={panelId} tabIndex={value === t.value ? 0 : -1} onClick={() => onChange(t.value)}
          className={cn('-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]',
            value === t.value ? 'border-[var(--shell-accent)] text-[var(--shell-text)]' : 'border-transparent text-[var(--shell-text-muted)] hover:text-[var(--shell-text)]')}
        >
          {t.label}
        </button>
      ))}
    </div>
    <RelatedLinks />
    </div>
  );
}

// A text link to a record on another page
export function RecordLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="whitespace-nowrap text-[13px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">{children}</Link>;
}

// One word for where a project stands, worst first. At risk: the margin is below the minimum (or negative), or the spend
// is already over the estimate. Below target: the margin is under the target but above the minimum.
export const VERDICT_RANK = { 'At risk': 0, 'Below target': 1, 'On track': 2, 'No margin': 3, 'No estimate': 4 } as const;
export type VerdictTone = 'success' | 'warning' | 'danger' | 'muted';
export const TONE_CLASS: Record<VerdictTone, string> = {
  success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', muted: 'text-[var(--shell-text-muted)]',
};
export function projectVerdict(p: { estimate: number | null; spent: number; margin: number | null; target: number | null; min: number | null }, currency: string): { label: keyof typeof VERDICT_RANK; tone: VerdictTone; reason: string } {
  const { estimate, spent, margin: m, target, min } = p;
  if (!estimate) return { label: 'No estimate', tone: 'muted', reason: 'No estimate cost yet, so margin and spending cannot be judged.' };
  if (spent > estimate) return { label: 'At risk', tone: 'danger', reason: `Spent ${plain(spent, currency)} is over the estimate of ${plain(estimate, currency)}.` };
  if (m == null) return { label: 'No margin', tone: 'muted', reason: 'No contract value yet, so margin cannot be worked out.' };
  if (m < 0) return { label: 'At risk', tone: 'danger', reason: `The margin is negative (${m.toFixed(1)}%).` };
  if (min != null && m < min) return { label: 'At risk', tone: 'danger', reason: `Margin ${m.toFixed(1)}% is below the minimum of ${min}%.` };
  if (target != null && m < target) return { label: 'Below target', tone: 'warning', reason: `Margin ${m.toFixed(1)}% is below the target of ${target}%.` };
  return { label: 'On track', tone: 'success', reason: target != null ? `Margin ${m.toFixed(1)}% meets the target of ${target}%.` : `Margin is ${m.toFixed(1)}%. No target margin is set.` };
}

// The same idea for a product: margin at the standard cost and at today's cost, whichever is worse, against the product's own targets
export const PRODUCT_VERDICT_RANK = { Loss: 0, 'Below minimum': 1, 'Below target': 2, 'On target': 3, 'No price': 4, 'No BOM': 5 } as const;
export type ProductVerdictInput = { bom_lines: number; selling_price: number | null; standard_cost: number | null; rolled_cost: number | null; margin_pct: number | null; target_margin_pct: number | null; min_margin_pct: number | null };
export const marginAtCost = (price: number | null, cost: number | null) => (price && cost != null ? ((price - cost) / price) * 100 : null);
export function productVerdict(r: ProductVerdictInput): { label: keyof typeof PRODUCT_VERDICT_RANK; tone: VerdictTone; reason: string } {
  if (!r.bom_lines) return { label: 'No BOM', tone: 'muted', reason: 'No BOM yet, so the cost cannot be worked out.' };
  if (!r.selling_price) return { label: 'No price', tone: 'muted', reason: 'No selling price yet, so margin cannot be worked out.' };
  const now = marginAtCost(r.selling_price, r.rolled_cost);
  const cands = [r.margin_pct, now].filter((x): x is number => x != null);
  if (!cands.length) return { label: 'No price', tone: 'muted', reason: 'No cost yet, so margin cannot be worked out.' };
  const m = Math.min(...cands);
  const where = now != null && m === now && r.margin_pct != null && Math.abs(now - r.margin_pct) > 0.05 ? ' at the current cost' : '';
  if (m < 0) return { label: 'Loss', tone: 'danger', reason: `The margin${where} is negative (${m.toFixed(1)}%).` };
  if (r.min_margin_pct != null && m < r.min_margin_pct) return { label: 'Below minimum', tone: 'danger', reason: `Margin${where} ${m.toFixed(1)}% is below the minimum of ${r.min_margin_pct}%.` };
  if (r.target_margin_pct != null && m < r.target_margin_pct) return { label: 'Below target', tone: 'warning', reason: `Margin${where} ${m.toFixed(1)}% is below the target of ${r.target_margin_pct}%.` };
  return { label: 'On target', tone: 'success', reason: r.target_margin_pct != null ? `Margin${where} ${m.toFixed(1)}% meets the target of ${r.target_margin_pct}%.` : `Margin${where} is ${m.toFixed(1)}%. No target margin is set.` };
}

// Margin against its goals: below zero or the minimum is red, below the target amber, otherwise green
export function marginTone(m: number | null, target: number | null, min: number | null): 'danger' | 'warning' | 'success' | 'muted' {
  if (m == null) return 'muted';
  if (m < 0 || (min != null && m < min)) return 'danger';
  if (target != null && m < target) return 'warning';
  return 'success';
}
