'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/shared/panel';
import { PeriodBar } from '@/components/shared/period-bar';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate, getDateRange } from '@/lib/currency';
import {
  useTopSpenders, useCategoryHeatmap, useProjectBurn, useProductBurn,
} from '@/hooks/use-queries';

const DATE_PRESETS = [
  { label: 'This month', key: 'thisMonth' },
  { label: 'Last month', key: 'lastMonth' },
  { label: 'Calendar year', key: 'calYear' },
  { label: 'Financial year', key: 'finYear' },
];

const SPEND = 'var(--chart-1)';
const compact = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

// Opaque bins with their own dark text, so every cell is >= 7:1 and reads the same in light and dark
// (the translucent colours this replaces took their contrast from whatever surface sat underneath).
const HEAT_BINS = [
  { bg: 'var(--heat-1)', fg: 'var(--heat-1-text)' },
  { bg: 'var(--heat-2)', fg: 'var(--heat-2-text)' },
  { bg: 'var(--heat-3)', fg: 'var(--heat-3-text)' },
  { bg: 'var(--heat-4)', fg: 'var(--heat-4-text)' },
];
function heatColor(val: number, max: number): { background: string; color: string } {
  if (!val || !max) return { background: 'var(--shell-hover)', color: 'var(--shell-text-muted)' };
  const pct = val / max;
  const bin = HEAT_BINS[pct >= 0.75 ? 3 : pct >= 0.5 ? 2 : pct >= 0.25 ? 1 : 0];
  return { background: bin.bg, color: bin.fg };
}

// Where a budget stands: the same thresholds and colours as the Home page
const budgetColor = (pct: number | null) => (pct === null ? 'var(--shell-text-muted)' : pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--success)');

function SkeletonRect({ h = '120px' }: { h?: string }) {
  return <div className="rounded-md motion-safe:animate-pulse" style={{ height: h, background: 'var(--shell-hover)' }} />;
}

const empty = 'px-4 py-10 text-pretty text-center text-[13px] text-[var(--shell-text-muted)]';

// Spend against budget, one row per project or product: the name, how much of the budget is used, a bar, and the amounts
function BudgetRows({ data, nameKey, fmt }: { data: any[]; nameKey: string; fmt: (n: number) => string }) {
  return (
    <ul className="divide-y divide-[var(--shell-border)]">
      {data.map((p: any, i: number) => {
        const hasBudget = p.budget > 0;
        const pct: number | null = hasBudget ? (p.pct ?? Math.round((p.spent / p.budget) * 100)) : null;
        const color = budgetColor(pct);
        return (
          <li key={p[nameKey]} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span title={p[nameKey]} className="truncate text-[13px] text-[var(--shell-text)]">{p[nameKey]}</span>
              {pct !== null
                ? <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: pct >= 80 ? color : 'var(--shell-text)' }}>{pct}%</span>
                : <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: SPEND }}>{fmt(p.spent)}</span>}
            </div>
            {pct !== null && (
              <div role="progressbar" aria-label={`${p[nameKey]} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} className="mt-1.5 h-1.5 overflow-hidden rounded-md bg-[var(--shell-hover)]">
                <div className="bar-fill h-full rounded-md" style={{ width: `${Math.min(pct, 100)}%`, background: color, '--bar-delay': `${i * 60}ms` } as React.CSSProperties} />
              </div>
            )}
            <p className="mt-1.5 truncate text-[12px] tabular-nums text-[var(--shell-text-muted)]">
              {hasBudget ? `${fmt(p.spent)} of ${fmt(p.budget)}` : 'No budget set'}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export default function SpendAnalyticsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency  = useAuthStore((s) => s.user?.currency || 'INR');
  const fmt       = (n: number) => formatCurrency(n, currency);

  const [preset, setPreset]     = useState('Financial year');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  useEffect(() => {
    const r = getDateRange('finYear');
    setDateFrom(r.from);
    setDateTo(r.to);
  }, []);

  // The header says which period the figures cover
  useEffect(() => {
    setHeader('Spend Analytics', dateFrom && dateTo ? `${formatDate(dateFrom)} to ${formatDate(dateTo)}` : '');
  }, [setHeader, dateFrom, dateTo]);

  const handlePreset = (key: string, label: string) => {
    setPreset(label);
    const r = getDateRange(key as any);
    setDateFrom(r.from);
    setDateTo(r.to);
  };

  const { data: spenders,    isLoading: loadSpenders  } = useTopSpenders(dateFrom, dateTo);
  const { data: heatmap,     isLoading: loadHeatmap   } = useCategoryHeatmap(dateFrom, dateTo);
  const { data: burnProject, isLoading: loadBurnProj  } = useProjectBurn(dateFrom, dateTo);
  const { data: burnProduct, isLoading: loadBurnProd  } = useProductBurn(dateFrom, dateTo);

  // The grid covers the last 12 months whatever the period, so rows with no spend at the start and end are dropped
  const heatMonths = (() => {
    const months = ((heatmap?.months || []) as any[]);
    const cats = ((heatmap?.categories || []) as string[]);
    const has = (m: any) => cats.some((c) => (m.values[c] || 0) > 0);
    const first = months.findIndex(has);
    if (first < 0) return months;
    let last = months.length - 1;
    while (last > first && !has(months[last])) last--;
    return months.slice(first, last + 1);
  })();

  const heatMax = heatmap
    ? Math.max(...(heatmap.months || []).flatMap((m: any) =>
        (heatmap.categories || []).map((c: string) => m.values[c] || 0)
      ), 1)
    : 1;

  const spenderRows = ((spenders || []) as any[]).map((s) => ({ name: s.username as string, value: Number(s.total) || 0 }));
  const spenderMax = spenderRows.reduce((m, s) => Math.max(m, s.value), 0);
  const spenderTotal = spenderRows.reduce((t, s) => t + s.value, 0);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-6 px-4 py-4">

      <PeriodBar
        presets={DATE_PRESETS}
        active={preset}
        onPreset={handlePreset}
        from={dateFrom}
        to={dateTo}
        onFrom={(v) => { setDateFrom(v); setPreset('Custom'); }}
        onTo={(v) => { setDateTo(v); setPreset('Custom'); }}
      />

      {/* The overview first, across the full width so every category has room: spend by category and month */}
      <Panel title="Spend by category and month" action={
        <div className="flex items-center gap-2 text-[12px] text-[var(--shell-text-muted)]">
          Lower
          <span aria-hidden className="flex gap-0.5">
            {HEAT_BINS.map((b) => <span key={b.bg} className="h-3 w-5 rounded-md" style={{ background: b.bg }} />)}
          </span>
          Higher
        </div>
      }>
        <div className="overflow-x-auto p-4">
          {loadHeatmap ? <SkeletonRect h="220px" /> : !heatmap?.categories?.length ? (
            <p className={empty}>No expenses in this period. Pick a longer period to see how spend splits by category and month.</p>
          ) : (
            <table className="w-full border-separate text-[12px]" style={{ borderSpacing: '3px' }}>
              <caption className="sr-only">Expense spend by category and month</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-16 pr-3 text-left font-medium text-[var(--shell-text-muted)]">Month</th>
                  {(heatmap.categories as string[]).map((c: string) => (
                    <th scope="col" key={c} className="whitespace-nowrap px-1 text-center font-medium text-[var(--shell-text-muted)]">{c}</th>
                  ))}
                  <th scope="col" className="whitespace-nowrap pl-3 text-right font-medium text-[var(--shell-text-muted)]">Total</th>
                </tr>
              </thead>
              <tbody>
                {heatMonths.map((m: any) => {
                  const total = (heatmap.categories as string[]).reduce((t, c) => t + (m.values[c] || 0), 0);
                  return (
                    <tr key={m.label}>
                      <th scope="row" className="whitespace-nowrap pr-3 text-left font-medium text-[var(--shell-text-muted)]">{m.label}</th>
                      {(heatmap.categories as string[]).map((c: string) => {
                        const val = m.values[c] || 0;
                        return (
                          <td key={c} title={val ? fmt(val) : undefined}
                            className="rounded-md px-2 py-1.5 text-center font-semibold tabular-nums"
                            style={heatColor(val, heatMax)}>
                            {val ? <><span aria-hidden>{compact(val)}</span><span className="sr-only">{fmt(val)}</span></> : ''}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap pl-3 text-right font-semibold tabular-nums" style={{ color: SPEND }}>
                        {total ? <><span aria-hidden>{compact(total)}</span><span className="sr-only">{fmt(total)}</span></> : <span className="text-[var(--shell-text-muted)]">–</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      {/* Who spends, and how projects and products stand against their budgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        <Panel title="Top spenders">
          {loadSpenders ? (
            <div className="space-y-3 p-4">{[...Array(4)].map((_, i) => <SkeletonRect key={i} h="36px" />)}</div>
          ) : !spenderRows.length ? (
            <p className={empty}>No expenses in this period. Pick a longer period to see who spent the most.</p>
          ) : (
            <ul className="divide-y divide-[var(--shell-border)]">
              {spenderRows.map((s, i) => (
                <li key={s.name} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span title={s.name} className="truncate text-[13px] text-[var(--shell-text)]">{s.name}</span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: SPEND }}>{fmt(s.value)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-md bg-[var(--shell-hover)]">
                      <div className="bar-fill h-full rounded-md" style={{ width: `${spenderMax > 0 ? (s.value / spenderMax) * 100 : 0}%`, background: SPEND, '--bar-delay': `${i * 60}ms` } as React.CSSProperties} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-[var(--shell-text-muted)]">{spenderTotal > 0 ? Math.round((s.value / spenderTotal) * 100) : 0}%</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Projects against budget">
          {loadBurnProj ? (
            <div className="space-y-3 p-4">{[...Array(4)].map((_, i) => <SkeletonRect key={i} h="40px" />)}</div>
          ) : !burnProject?.length ? (
            <p className={empty}>No expenses charged to a project in this period.</p>
          ) : (
            <BudgetRows data={burnProject} nameKey="project_name" fmt={fmt} />
          )}
        </Panel>

        <Panel title="Products against budget">
          {loadBurnProd ? (
            <div className="space-y-3 p-4">{[...Array(4)].map((_, i) => <SkeletonRect key={i} h="40px" />)}</div>
          ) : !burnProduct?.length ? (
            <p className={empty}>No expenses charged to a product in this period.</p>
          ) : (
            <BudgetRows data={burnProduct} nameKey="product_name" fmt={fmt} />
          )}
        </Panel>
      </div>

    </div>
  );
}
