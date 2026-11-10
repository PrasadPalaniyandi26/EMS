'use client';

import { useState, useEffect, useMemo } from 'react';
import { Panel, PanelLink } from '@/components/shared/panel';
import { PeriodBar } from '@/components/shared/period-bar';
import { ChartFrame } from '@/components/shared/chart-frame';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import {
  useDashboardSummary, useDashboardByCategory, useMonthlyTrend,
  useRecentTransactions, useBudgetUtilization, useApprovalCounts, useProjectSpend,
} from '@/hooks/use-queries';
import { formatCurrency, formatDate, getDateRange, parseApiDate } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { Plus, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

// Colour is a role: income is the success colour, spending is the series blue (red is kept for things that are wrong), and each figure carries the same colour as its series in the charts
const INCOME = 'var(--success)';
const SPEND = 'var(--chart-1)';

const presets = [
  { label: 'This week', key: 'thisWeek' as const },
  { label: 'Last week', key: 'lastWeek' as const },
  { label: 'This month', key: 'thisMonth' as const },
  { label: 'Last month', key: 'lastMonth' as const },
  { label: 'Calendar year', key: 'calYear' as const },
  { label: 'Financial year', key: 'finYear' as const },
  { label: 'All time', key: 'allTime' as const },
];

const tooltipStyle = { background: 'var(--shell-surface)', border: '1px solid var(--shell-border)', borderRadius: 6, fontSize: 12, color: 'var(--shell-text)' };
const axisTick = { fontSize: 12, fill: 'var(--shell-text-muted)' };
const compact = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

// Where a budget stands: the colour and the words say the same thing
const budgetState = (pct: number) =>
  pct >= 100 ? { label: 'Over budget', color: 'var(--danger)' }
    : pct >= 80 ? { label: 'Near the limit', color: 'var(--warning)' }
      : { label: 'On track', color: 'var(--success)' };

function SkeletonRect({ w, h, className = '' }: { w?: string; h?: string; className?: string }) {
  return (
    <div
      className={`rounded-md motion-safe:animate-pulse ${className}`}
      style={{ width: w, height: h ?? '1rem', background: 'var(--shell-hover)' }}
    />
  );
}

// One of the three figures the page is for. The number leads; the caption says what it means or what to do.
function KeyFigure({ label, value, valueColor, loading, onClick, className, children }: {
  label: string; value: React.ReactNode; valueColor?: string; loading?: boolean; onClick?: () => void; className?: string; children?: React.ReactNode;
}) {
  const body = (
    <div className="min-w-0 text-left">
      <p className="text-[13px] font-medium text-[var(--shell-text-muted)]">{label}</p>
      {loading
        ? <SkeletonRect w="7rem" h="1.75rem" className="mt-2" />
        : <p className="mt-1.5 truncate text-[28px] font-semibold leading-none tracking-[-0.01em] tabular-nums" style={{ color: valueColor ?? 'var(--shell-text)' }}>{value}</p>}
      {children}
    </div>
  );
  const base = cn('block w-full bg-[var(--shell-surface)] p-4', className);
  return onClick
    ? <button type="button" onClick={onClick} className={cn(base, 'cursor-pointer transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)]')}>{body}</button>
    : <div className={base}>{body}</div>;
}

export default function DashboardPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const router = useRouter();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activePreset, setActivePreset] = useState<string>('This month');

  useEffect(() => {
    const r = getDateRange('thisMonth');
    setDateFrom(r.from);
    setDateTo(r.to);
  }, []);

  // The header says which period the figures cover, instead of a greeting
  useEffect(() => {
    setHeader('Dashboard', dateFrom && dateTo ? `${formatDate(dateFrom)} to ${formatDate(dateTo)}` : 'All time');
  }, [setHeader, dateFrom, dateTo]);

  useEffect(() => {
    if ((user?.role_name || '').toUpperCase() === 'EMPLOYEE') {
      router.replace('/expense');
    }
  }, [user?.role_name, router]);

  const { data: summary, isLoading: summaryLoading } = useDashboardSummary(dateFrom, dateTo);
  const { data: byCategory, isLoading: categoryLoading } = useDashboardByCategory(dateFrom, dateTo);
  const { data: monthlyTrend, isLoading: trendLoading } = useMonthlyTrend();
  const { data: recentTxns, isLoading: txnsLoading } = useRecentTransactions();
  const { data: budgetUtil, isLoading: budgetLoading } = useBudgetUtilization();
  const { data: approvalCounts, isLoading: approvalsLoading } = useApprovalCounts();
  const { data: projectSpend, isLoading: projectLoading } = useProjectSpend(dateFrom, dateTo);

  const fmt = (n: number) => formatCurrency(n, currency);

  const handlePreset = (key: string, label: string) => {
    if (key === 'allTime') {
      setDateFrom(''); setDateTo('');
    } else {
      const r = getDateRange(key as any);
      setDateFrom(r.from); setDateTo(r.to);
    }
    setActivePreset(label);
  };

  // Spending by category, largest first: the top six, and the rest together so the list stays short
  const categories = useMemo(() => {
    const all = (byCategory || []).filter((c: any) => c.type === 'expense').map((c: any) => ({ name: c.category_name as string, value: Number(c.total) || 0 })).sort((a, b) => b.value - a.value);
    const top = all.length > 7 ? all.slice(0, 6) : all;
    const rest = all.length > 7 ? all.slice(6) : [];
    if (rest.length) top.push({ name: `${rest.length} other categories`, value: rest.reduce((s, c) => s + c.value, 0) });
    const total = all.reduce((s, c) => s + c.value, 0);
    return { rows: top, total, max: top.reduce((m, c) => Math.max(m, c.value), 0) };
  }, [byCategory]);

  // The chart starts at the first month with a transaction, so the empty months before it do not use up its width
  const trendData = useMemo(() => {
    const all = (monthlyTrend || []).map((m: any) => ({ month: m.month, income: m.income, expenses: m.expense }));
    const first = all.findIndex((d: any) => d.income > 0 || d.expenses > 0);
    return first > 0 ? all.slice(first) : all;
  }, [monthlyTrend]);

  // Only budgets that have spend belong in "nearest their limit"; the API already sorts them by percent used
  const nearestBudgets = useMemo(() => ((budgetUtil || []) as any[]).filter((b) => b.pct > 0).slice(0, 5), [budgetUtil]);

  const pendingApprovals = (approvalCounts as any)?.pendingMyAction ?? 0;
  const budgetPct = useMemo(() => {
    const items = (budgetUtil || []) as any[];
    if (!items.length) return null;
    const total = items.reduce((s: number, b: any) => s + b.budget, 0);
    const spent = items.reduce((s: number, b: any) => s + b.spent, 0);
    return total > 0 ? Math.round((spent / total) * 100) : 0;
  }, [budgetUtil]);
  const overall = budgetPct === null ? null : budgetState(budgetPct);
  const balance = summary?.balance || 0;
  // What the balance is compared to: the period just before the chosen one
  const compareTo = ({ 'This week': 'last week', 'Last week': 'the week before', 'This month': 'last month', 'Last month': 'the month before' } as Record<string, string>)[activePreset] ?? 'the previous period';
  const balanceChange = summary?.previous ? balance - summary.previous.balance : null;
  const balanceColor = balance > 0 ? 'var(--success)' : balance < 0 ? 'var(--danger)' : undefined;

  const approvalStages = [
    { label: 'Draft', count: (approvalCounts as any)?.draft ?? 0, color: 'var(--status-draft)' },
    { label: 'Pending manager', count: (approvalCounts as any)?.pendingManager ?? 0, color: 'var(--status-pending-manager)' },
    { label: 'Pending finance', count: (approvalCounts as any)?.pendingFinance ?? 0, color: 'var(--status-pending-finance)' },
    { label: 'Approved', count: (approvalCounts as any)?.approved ?? 0, color: 'var(--status-approved)' },
    { label: 'Rejected', count: (approvalCounts as any)?.rejected ?? 0, color: 'var(--status-rejected)' },
  ];


  const empty = 'px-4 py-10 text-pretty text-center text-[13px] text-[var(--shell-text-muted)]';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-6 px-4 py-4">

      <PeriodBar
        presets={presets}
        active={activePreset}
        onPreset={handlePreset}
        from={dateFrom}
        to={dateTo}
        onFrom={(v) => { setDateFrom(v); setActivePreset('Custom'); }}
        onTo={(v) => { setDateTo(v); setActivePreset('Custom'); }}
      />

      {/* The three figures the page is for: what needs you, how the budget stands, and the balance for the period with what it is made of */}
      <section aria-label="Key figures" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--shell-border)] bg-[var(--shell-border)] lg:grid-cols-[1fr_1fr_1.8fr]">
        <KeyFigure label="Pending approvals" value={pendingApprovals} loading={approvalsLoading} onClick={() => router.push('/approvals')}>
          <p className="mt-2 text-[13px] font-medium" style={{ color: pendingApprovals > 0 ? 'var(--shell-accent)' : 'var(--shell-text-muted)' }}>
            {pendingApprovals > 0 ? 'Waiting for you' : 'Nothing waiting'}
          </p>
        </KeyFigure>

        <KeyFigure label="Budget used" value={budgetPct !== null ? `${budgetPct}%` : '—'} valueColor={overall && overall.label !== 'On track' ? overall.color : undefined} loading={budgetLoading} onClick={() => router.push('/budget/monitor')}>
          {budgetPct !== null && overall ? (
            <>
              <div role="progressbar" aria-label="Budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(budgetPct, 100)} className="mt-3 h-1.5 overflow-hidden rounded-md bg-[var(--shell-hover)]">
                <div className="h-full rounded-md" style={{ width: `${Math.min(budgetPct, 100)}%`, background: overall.color }} />
              </div>
              <p className="mt-2 text-[13px] font-medium" style={{ color: overall.color }}>{overall.label}</p>
            </>
          ) : (
            !budgetLoading && <p className="mt-2 text-[13px] text-[var(--shell-text-muted)]">No active budget plan</p>
          )}
        </KeyFigure>

        <KeyFigure className="col-span-2 lg:col-span-1" label="Net balance" value={fmt(balance)} valueColor={balanceColor} loading={summaryLoading}>
          {!summaryLoading && (
            <>
              {/* The balance is income less expenses, so it is shown as that sum */}
              <dl className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 text-[13px]">
                <div>
                  <dt className="flex items-center gap-1.5 text-[var(--shell-text-muted)]"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: INCOME }} />Income</dt>
                  <dd className="mt-0.5 text-[18px] font-semibold tabular-nums text-[var(--shell-text)]">{fmt(summary?.totalIncome || 0)}</dd>
                </div>
                <span aria-hidden className="pb-0.5 text-[18px] text-[var(--shell-text-muted)]">−</span>
                <div>
                  <dt className="flex items-center gap-1.5 text-[var(--shell-text-muted)]"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: SPEND }} />Expenses</dt>
                  <dd className="mt-0.5 text-[18px] font-semibold tabular-nums text-[var(--shell-text)]">{fmt(summary?.totalExpenses || 0)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[12px] tabular-nums text-[var(--shell-text-muted)]">
                {balanceChange !== null && <>{balanceChange === 0 ? 'No change' : `${balanceChange > 0 ? '+' : '−'}${fmt(Math.abs(balanceChange))}`} vs {compareTo}<br /></>}
                {summary?.transactionCount || 0} {(summary?.transactionCount || 0) === 1 ? 'transaction' : 'transactions'} in this period
              </p>
            </>
          )}
        </KeyFigure>
      </section>

      {/* Trend, and the budgets closest to their limit */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Monthly income vs expenses" className="lg:col-span-2" action={
          <ul className="flex items-center gap-4 text-[12px] text-[var(--shell-text-muted)]">
            <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: INCOME }} />Income</li>
            <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: SPEND }} />Expenses</li>
          </ul>
        }>
          <div className="p-4">
            {trendLoading ? <SkeletonRect h="260px" /> : trendData.length > 0 ? (
              <ChartFrame label="Monthly income and expenses by month" columns={['Month', 'Income', 'Expenses']} rows={trendData.map((d: any) => [d.month, fmt(d.income || 0), fmt(d.expenses || 0)])}>
                <ResponsiveContainer width="100%" height={330}>
                  <BarChart data={trendData} barGap={2}>
                    <CartesianGrid stroke="var(--shell-border)" vertical={false} />
                    <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => compact(Number(v))} />
                    <Tooltip formatter={(val) => fmt(typeof val === 'number' ? val : 0)} contentStyle={tooltipStyle} cursor={{ fill: 'var(--shell-hover)' }} />
                    <Bar dataKey="income" fill={INCOME} radius={[4, 4, 0, 0]} name="Income" />
                    <Bar dataKey="expenses" fill={SPEND} radius={[4, 4, 0, 0]} name="Expenses" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            ) : (
              <p className={empty}>No transactions yet. Add an expense or an income to see the monthly trend.</p>
            )}
          </div>
        </Panel>

        <Panel title="Budgets nearest their limit" action={<PanelLink onClick={() => router.push('/budget/monitor')}>Manage</PanelLink>}>
          {budgetLoading ? (
            <div className="space-y-3 p-4">{[...Array(4)].map((_, i) => <SkeletonRect key={i} h="40px" />)}</div>
          ) : nearestBudgets.length > 0 ? (
            <ul className="divide-y divide-[var(--shell-border)]">
              {nearestBudgets.map((b) => {
                const st = budgetState(b.pct);
                return (
                  <li key={b.category_id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span title={b.category_name} className="truncate text-[13px] text-[var(--shell-text)]">{b.category_name}</span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: b.pct >= 80 ? st.color : 'var(--shell-text)' }}>{b.pct}%</span>
                    </div>
                    <div role="progressbar" aria-label={`${b.category_name} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(b.pct, 100)} className="mt-1.5 h-1.5 overflow-hidden rounded-md bg-[var(--shell-hover)]">
                      <div className="h-full rounded-md" style={{ width: `${Math.min(b.pct, 100)}%`, background: st.color }} />
                    </div>
                    <p className="mt-1.5 truncate text-[12px] tabular-nums text-[var(--shell-text-muted)]">{fmt(b.spent)} of {fmt(b.budget)}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={empty}>{(budgetUtil || []).length > 0 ? 'Nothing has been spent against a budget yet.' : 'No active budget plan. Create one in the Planner to track spend against it here.'}</p>
          )}
        </Panel>
      </div>

      {/* Activity on the left; on the right where the approvals stand and where the spend goes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Recent transactions" className="lg:col-span-2 lg:self-start" action={<PanelLink onClick={() => router.push('/transactions')}>View all</PanelLink>}>
          {txnsLoading ? (
            <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => <SkeletonRect key={i} h="40px" />)}</div>
          ) : (recentTxns || []).length > 0 ? (
            <ul className="divide-y divide-[var(--shell-border)]">
              {(recentTxns || []).map((txn: any) => (
                <li key={txn.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-[var(--shell-text)]">{txn.description || txn.category_name}</p>
                    <p className="text-[12px] text-[var(--shell-text-muted)]">
                      {parseApiDate(txn.date_recorded)?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: txn.type === 'income' ? INCOME : 'var(--shell-text)' }}>
                    {txn.type === 'income' ? '+' : '-'}{formatCurrency(txn.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={empty}>No transactions yet. They appear here as soon as one is recorded.</p>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Approval pipeline" action={<PanelLink onClick={() => router.push('/approvals')}>View all</PanelLink>}>
            <ul className="divide-y divide-[var(--shell-border)]">
              {approvalStages.map((s) => (
                <li key={s.label} className="flex items-center justify-between px-4 py-2.5">
                  <span className="flex items-center gap-2 text-[13px] text-[var(--shell-text)]">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: s.count > 0 ? 'var(--shell-text)' : 'var(--shell-text-muted)' }}>{s.count}</span>
                </li>
              ))}
            </ul>
          </Panel>

          {/* Where the spend goes: a ranked list reads faster than a donut, and every row says its amount and its share */}
          <Panel title="Expenses by category">
            {categoryLoading ? (
              <div className="space-y-3 p-4">{[...Array(4)].map((_, i) => <SkeletonRect key={i} h="36px" />)}</div>
            ) : categories.rows.length > 0 ? (
              <ul className="divide-y divide-[var(--shell-border)]">
                {categories.rows.map((c) => (
                  <li key={c.name} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span title={c.name} className="truncate text-[13px] text-[var(--shell-text)]">{c.name}</span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--shell-text)]">{fmt(c.value)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-md bg-[var(--shell-hover)]">
                        <div className="h-full rounded-md" style={{ width: `${categories.max > 0 ? (c.value / categories.max) * 100 : 0}%`, background: SPEND }} />
                      </div>
                      <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-[var(--shell-text-muted)]">{categories.total > 0 ? Math.round((c.value / categories.total) * 100) : 0}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={empty}>No expenses in this period. Pick a longer period to see how spending splits by category.</p>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Top project spend">
        <div className="p-4">
          {projectLoading ? <SkeletonRect h="120px" /> : (projectSpend || []).length > 0 ? (
            <ChartFrame label="Top project spend" columns={['Project', 'Spent']} rows={(projectSpend as any[]).map((d: any) => [d.project_name, fmt(Number(d.spent) || 0)])}>
              <ResponsiveContainer width="100%" height={Math.max(160, (projectSpend as any[]).length * 42)}>
                <BarChart data={projectSpend as any[]} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid stroke="var(--shell-border)" horizontal={false} />
                  <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => compact(Number(v))} />
                  <YAxis type="category" dataKey="project_name" tick={axisTick} axisLine={false} tickLine={false} width={140} />
                  <Tooltip formatter={(val) => fmt(typeof val === 'number' ? val : 0)} contentStyle={tooltipStyle} cursor={{ fill: 'var(--shell-hover)' }} />
                  <Bar dataKey="spent" fill={SPEND} radius={[0, 4, 4, 0]} name="Spent" />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          ) : (
            <p className={empty}>No expenses charged to a project in this period.</p>
          )}
        </div>
      </Panel>

      {/* The two ways to add a record, and the report. Every other page is one click away in the panels above and in the menu. */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Button type="button" onClick={() => router.push('/expense')} className="h-9 gap-2 px-3 text-[13px] font-medium">
          <Plus className="h-4 w-4" />Add expense
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/income')} className="h-9 gap-2 px-3 text-[13px] font-medium">
          <Plus className="h-4 w-4 text-[var(--success)]" />Add income
        </Button>
        <button
          type="button"
          onClick={() => router.push('/reporting')}
          className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-[13px] font-medium text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"
        >
          <BarChart3 className="h-4 w-4" />Reports
        </button>
      </div>

    </div>
  );
}
