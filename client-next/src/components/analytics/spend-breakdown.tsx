'use client';

import { Panel } from '@/components/shared/panel';
import { RecordLink } from '@/components/budgets/budget-ui';
import { useSpendBreakdown } from '@/hooks/use-queries';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate } from '@/lib/currency';

const SPEND = 'var(--chart-1)';
const empty = 'px-4 py-10 text-pretty text-center text-[13px] text-[var(--shell-text-muted)]';
const muted = 'text-[12px] tabular-nums text-[var(--shell-text-muted)]';

function Loading() {
  return <div className="space-y-3 p-4">{[...Array(4)].map((_, i) => <div key={i} className="h-9 rounded-md bg-[var(--shell-hover)] motion-safe:animate-pulse" />)}</div>;
}

// Where the period's spend went, what moved against the period before, and the expenses behind the totals
export function SpendBreakdown({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const fmt = (n: number) => formatCurrency(n, currency);
  const { data, isLoading } = useSpendBreakdown(dateFrom, dateTo);
  const c = data?.comparison;
  const none = !data || !data.charged_to.length;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 2xl:grid-cols-[1fr_1fr_1.4fr]">
      <Panel title="Where the money goes">
        {isLoading ? <Loading /> : none ? <p className={empty}>No expenses in this period.</p> : (
          <ul className="divide-y divide-[var(--shell-border)]">
            {data.charged_to.map((g, i) => {
              const share = data.total > 0 ? (g.amount / data.total) * 100 : 0;
              return (
                <li key={g.label} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-[var(--shell-text)]">{g.label}</span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--shell-text)]">{fmt(g.amount)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-md bg-[var(--shell-hover)]">
                      <div className="bar-fill h-full rounded-md" style={{ width: `${Math.max(0, share)}%`, background: SPEND, '--bar-delay': `${i * 60}ms` } as React.CSSProperties} />
                    </div>
                    <span className={`w-10 shrink-0 text-right ${muted}`}>{share > 0 && share < 1 ? '<1' : Math.round(share)}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Biggest changes">
        {isLoading ? <Loading /> : !c || !c.rows.length ? (
          <p className={empty}>{c ? 'No category changed from the period before.' : 'Pick a period with a start and an end to compare it.'}</p>
        ) : (
          <>
            <p className={`px-4 pt-3 ${muted}`}>
              {formatDate(c.from)} to {formatDate(c.to)}, against {formatDate(c.previous_from)} to {formatDate(c.previous_to)}
            </p>
            <ul className="divide-y divide-[var(--shell-border)]">
              {c.rows.map((r) => {
                const up = r.change > 0;
                return (
                  <li key={r.category} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span title={r.category} className="truncate text-[13px] text-[var(--shell-text)]">{r.category}</span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: up ? 'var(--warning)' : 'var(--success)' }}>
                        <span className="sr-only">{up ? 'Up by ' : 'Down by '}</span>
                        <span aria-hidden>{up ? '+' : '−'}</span>{fmt(Math.abs(r.change))}
                      </span>
                    </div>
                    <p className={`mt-1 ${muted}`}>{fmt(r.before)} to {fmt(r.now)}{r.before > 0 ? ` (${up ? '+' : '−'}${Math.round((Math.abs(r.change) / r.before) * 100)}%)` : ', new in this period'}</p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
        <Panel title="Largest expenses">
          {isLoading ? <Loading /> : none ? <p className={empty}>No expenses in this period.</p> : (
            <ol className="divide-y divide-[var(--shell-border)]">
              {data.largest.map((t) => (
                <li key={t.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span title={t.description ?? undefined} className="truncate text-[13px] text-[var(--shell-text)]">{t.description || t.category}</span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--shell-text)]">{fmt(t.amount)}</span>
                  </div>
                  <p className={`mt-0.5 flex flex-wrap items-baseline gap-x-3 ${muted}`}>
                    {t.reference_id ? <RecordLink href={`/transactions?search=${encodeURIComponent(t.reference_id)}`}>{t.reference_id}</RecordLink> : <span>#{t.id}</span>}
                    <span>{t.category}</span>
                    <span>{formatDate(t.date_recorded)}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
