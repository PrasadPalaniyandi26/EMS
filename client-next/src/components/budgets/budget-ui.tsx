'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { NativeSelect } from '@/components/shared/modal-primitives';
import type { AlertLevel, BudgetPlanInfo, LineStatus, PlanStatus } from '@/hooks/use-budget-queries';

// Whole-rupee amounts for budget screens; paise never matter at planning level
const whole = (currency: string, symbol: boolean) => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: symbol ? 'currency' : 'decimal', currency, maximumFractionDigits: 0, minimumFractionDigits: 0 });
export const money = (v: number | null | undefined, currency = 'INR') => whole(currency, true).format(Math.round(Number(v || 0)));
export const plain = (v: number | null | undefined, currency = 'INR') => whole(currency, false).format(Math.round(Number(v || 0)));

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
  SUBMITTED: { label: 'Waiting for approval', cls: 'text-[var(--warning)]' },
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

// Financial-year chooser: the plans that exist, plus the current year when it has none yet
export function FySelect({ plans, value, onChange, currentFy, startMonth = 4 }: {
  plans: BudgetPlanInfo[]; value: number | null; onChange: (fy: number) => void; currentFy?: number; startMonth?: number;
}) {
  const label = (fy: number) => (startMonth === 1 ? `FY ${fy}` : `FY ${fy}-${String(fy + 1).slice(2)}`);
  const fys = [...new Set([...plans.map((p) => p.fy), ...(currentFy != null ? [currentFy] : [])])].sort((a, b) => b - a);
  return (
    <NativeSelect aria-label="Financial year" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} className="!h-8 !w-auto min-w-[130px]">
      {fys.map((fy) => <option key={fy} value={fy}>{label(fy)}</option>)}
    </NativeSelect>
  );
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
