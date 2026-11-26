'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, BarChart3, RefreshCw, ChevronRight } from 'lucide-react';
import { ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { Panel, PanelLink } from '@/components/shared/panel';
import { PeriodBar } from '@/components/shared/period-bar';
import { ChartFrame } from '@/components/shared/chart-frame';
import { Button } from '@/components/ui/button';
import { BudgetBar, Delta, Figure, Skeleton, Spark, STATUS_WORD, TONE_TEXT } from '@/components/dashboard/dashboard-parts';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useDashboardOverview } from '@/hooks/use-queries';
import { formatDate, getDateRange, parseApiDate } from '@/lib/currency';
import { money, plain } from '@/lib/money';
import { cn } from '@/lib/utils';

// Colour is a role: income is the success colour, spending is the series blue, and red is kept for what is wrong
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
const VERSUS: Record<string, string> = { 'This week': 'last week', 'Last week': 'the week before', 'This month': 'last month', 'Last month': 'the month before', 'Calendar year': 'last year', 'Financial year': 'last year' };

const tooltipStyle = { background: 'var(--shell-surface)', border: '1px solid var(--shell-border)', borderRadius: 6, fontSize: 12, color: 'var(--shell-text)' };
const axisTick = { fontSize: 12, fill: 'var(--shell-text-muted)' };
const compact = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const pad = (n: number) => String(n).padStart(2, '0');
const SCOPE_WORDS = { everyone: 'Everyone’s records', team: 'Your team’s records', self: 'Your records' } as const;
const ago = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

export default function HomePage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const router = useRouter();
  const isEmployee = (user?.role_name || '').toUpperCase() === 'EMPLOYEE';

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activePreset, setActivePreset] = useState<string>('This month');
  const [chartMode, setChartMode] = useState<'monthly' | 'cumulative'>('monthly');

  useEffect(() => { const r = getDateRange('thisMonth'); setDateFrom(r.from); setDateTo(r.to); }, []);
  useEffect(() => { if (isEmployee) router.replace('/expense'); }, [isEmployee, router]);

  const ready = !!dateFrom || activePreset === 'All time';
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useDashboardOverview(dateFrom, dateTo, !isEmployee && ready);

  useEffect(() => {
    const period = dateFrom && dateTo ? `${formatDate(dateFrom)} to ${formatDate(dateTo)}` : 'All time';
    setHeader('Home', `${data ? SCOPE_WORDS[data.scope] : ''}${data ? ' · ' : ''}${period}`);
  }, [setHeader, dateFrom, dateTo, data]);

  const handlePreset = (key: string, label: string) => {
    if (key === 'allTime') { setDateFrom(''); setDateTo(''); } else { const r = getDateRange(key as any); setDateFrom(r.from); setDateTo(r.to); }
    setActivePreset(label);
  };
  // Click a month in the chart to look at just that month
  const pickMonth = (year: number, month: number) => {
    const last = new Date(year, month, 0).getDate();
    setDateFrom(`${year}-${pad(month)}-01`); setDateTo(`${year}-${pad(month)}-${pad(last)}`); setActivePreset('Custom');
  };

  const t = data?.totals; const prev = data?.previous ?? null;
  const versus = VERSUS[activePreset] ?? 'the period before';
  const loading = isLoading && !data;
  const series = data?.series ?? [];
  const inPeriod = (s: { year: number; month: number }) => {
    if (!dateFrom || !dateTo) return true;
    const start = `${s.year}-${pad(s.month)}-01`; const end = `${s.year}-${pad(s.month)}-${pad(new Date(s.year, s.month, 0).getDate())}`;
    return end >= dateFrom && start <= dateTo;
  };
  const firstActive = series.findIndex((s) => s.income > 0 || s.expense > 0);
  const chartData = firstActive > 0 ? series.slice(firstActive) : series;
  const budget = data?.budget; const portfolio = data?.portfolio; const recv = data?.receivables;
  const showBudgetFigure = !!budget;
  const empty = 'px-4 py-8 text-pretty text-center text-[13px] text-[var(--shell-text-muted)]';

  const netTone = !t ? '' : t.net > 0 ? TONE_TEXT.success : t.net < 0 ? TONE_TEXT.danger : '';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-5 px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 max-sm:basis-full">
          <PeriodBar presets={presets} active={activePreset} onPreset={handlePreset} from={dateFrom} to={dateTo}
            onFrom={(v) => { setDateFrom(v); setActivePreset('Custom'); }} onTo={(v) => { setDateTo(v); setActivePreset('Custom'); }} />
        </div>
        <button type="button" onClick={() => refetch()} aria-label="Refresh the figures" className="flex h-9 items-center gap-2 rounded-md px-2 text-[12px] text-[var(--shell-text-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">
          <RefreshCw aria-hidden className={cn('h-3.5 w-3.5', isFetching && 'motion-safe:animate-spin')} />
          <span aria-live="polite">{dataUpdatedAt ? `Updated ${ago(new Date(dataUpdatedAt).toISOString())}` : 'Loading'}</span>
        </button>
      </div>

      {/* The headline figures: how the business did, what is waiting, and how the plan stands */}
      <section aria-label="Key figures" className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--shell-border)] bg-[var(--shell-border)] lg:grid-cols-3 lg:max-[87.49rem]:[&>:last-child:nth-child(3n+2)]:col-span-2', recv ? 'min-[87.5rem]:grid-cols-6' : 'min-[87.5rem]:grid-cols-5')}>
        <Figure label="Net result" loading={loading} value={t ? money(t.net, currency) : ''} valueClass={netTone}
          spark={<Spark values={series.map((s) => s.net)} color={t && t.net < 0 ? 'var(--danger)' : INCOME} label="Net result by month, last twelve months" />}>
          <Delta now={t?.net ?? 0} before={prev?.net} versus={versus} format={(n) => plain(n, currency)} />
          {t?.margin_pct != null && <p className="mt-0.5 text-[12px] tabular-nums text-[var(--shell-text-muted)]">{t.margin_pct.toFixed(1)}% of income kept</p>}
        </Figure>
        <Figure label="Income" loading={loading} value={t ? money(t.income, currency) : ''}
          spark={<Spark values={series.map((s) => s.income)} color={INCOME} label="Income by month, last twelve months" />}>
          <Delta now={t?.income ?? 0} before={prev?.income} versus={versus} format={(n) => plain(n, currency)} />
        </Figure>
        <Figure label="Expenses" loading={loading} value={t ? money(t.expenses, currency) : ''}
          spark={<Spark values={series.map((s) => s.expense)} color={SPEND} label="Expenses by month, last twelve months" />}>
          <Delta now={t?.expenses ?? 0} before={prev?.expenses} goodWhen="down" versus={versus} format={(n) => plain(n, currency)} />
          {t && t.expenses_pending > 0 && <p className="mt-0.5 text-[12px] tabular-nums text-[var(--shell-text-muted)]">{money(t.expenses_pending, currency)} not yet approved</p>}
        </Figure>
        <Figure label="Awaiting approval" loading={loading} onClick={() => router.push('/approvals')} value={data ? money(data.approvals.pending_amount, currency) : ''}>
          <p className="mt-1 text-[12px] tabular-nums text-[var(--shell-text-muted)]">{data?.approvals.pending_count ?? 0} {data?.approvals.pending_count === 1 ? 'expense' : 'expenses'}{data?.approvals.oldest_days != null ? `, oldest ${data.approvals.oldest_days} ${data.approvals.oldest_days === 1 ? 'day' : 'days'}` : ''}</p>
          <p className={cn('mt-0.5 text-[13px] font-medium', (data?.approvals.mine ?? 0) > 0 ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-muted)]')}>
            {(data?.approvals.mine ?? 0) > 0 ? `${data!.approvals.mine} waiting for you` : 'Nothing waiting for you'}
          </p>
        </Figure>
        {recv && (
          <Figure label="Clients owe you" loading={loading} onClick={() => router.push('/manage/clients?tab=invoices')} value={money(recv.outstanding, currency)}>
            <p className={cn('mt-1 text-[12px] tabular-nums', recv.overdue > 0 ? TONE_TEXT.danger : 'text-[var(--shell-text-muted)]')}>{recv.overdue > 0 ? `${money(recv.overdue, currency)} overdue` : 'Nothing overdue'}</p>
            <p className="mt-0.5 text-[12px] tabular-nums text-[var(--shell-text-muted)]">{money(recv.received_this_month, currency)} received this month</p>
          </Figure>
        )}
        {showBudgetFigure ? (
          <Figure label={`Budget used, ${budget!.label}`} loading={loading} onClick={() => router.push('/budget/monitor')} value={budget!.pct != null ? `${Math.round(budget!.pct)}%` : '—'}
            valueClass={budget!.pct != null && budget!.pct >= 100 ? TONE_TEXT.danger : budget!.pct != null && budget!.pct >= 80 ? TONE_TEXT.warning : ''}>
            {budget!.pct != null && <div className="mt-3"><BudgetBar pct={budget!.pct} elapsed={budget!.elapsed_pct} label="Budget used" /></div>}
            <p className="mt-2 text-[12px] tabular-nums text-[var(--shell-text-muted)]">{money(budget!.used, currency)} of {money(budget!.approved, currency)}</p>
            {budget!.elapsed_pct != null && budget!.pct != null && <p className={cn('mt-0.5 text-[12px]', budget!.pct > budget!.elapsed_pct + 10 ? TONE_TEXT.warning : 'text-[var(--shell-text-muted)]')}>{Math.round(budget!.elapsed_pct)}% of the year has passed</p>}
          </Figure>
        ) : (
          <Figure label="Claims to reimburse" loading={loading} onClick={() => router.push('/reimbursements')} value={data ? money(data.reimbursements.due_amount, currency) : ''}>
            <p className="mt-1 text-[12px] tabular-nums text-[var(--shell-text-muted)]">{data?.reimbursements.due_count ?? 0} approved, not yet paid</p>
          </Figure>
        )}
      </section>

      {/* The trend, and what needs a look */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title={chartMode === 'monthly' ? 'Income and expenses by month' : 'Running net result'} className="lg:col-span-2" action={
          <div className="flex items-center gap-4">
            <div role="group" aria-label="Chart view" className="flex gap-1 rounded-md border border-[var(--shell-border)] p-0.5">
              {(['monthly', 'cumulative'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={chartMode === m} onClick={() => setChartMode(m)}
                  className={cn('h-7 rounded-md px-2.5 text-[12px] font-medium focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]', chartMode === m ? 'bg-[var(--shell-hover)] text-[var(--shell-text)]' : 'text-[var(--shell-text-muted)] hover:text-[var(--shell-text)]')}>
                  {m === 'monthly' ? 'Monthly' : 'Running net'}
                </button>
              ))}
            </div>
            <ul className="hidden items-center gap-4 text-[12px] text-[var(--shell-text-muted)] sm:flex">
              <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: INCOME }} />Income</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: SPEND }} />Expenses</li>
            </ul>
          </div>
        }>
          <div className="p-4">
            {loading ? <Skeleton h="300px" /> : chartData.some((d) => d.income > 0 || d.expense > 0) ? (
              <ChartFrame label="Income, expenses and net result by month" columns={['Month', 'Income', 'Expenses', 'Net']} rows={chartData.map((d) => [`${d.label} ${d.year}`, money(d.income, currency), money(d.expense, currency), money(d.net, currency)])}>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartData} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--shell-border)" vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => compact(Number(v))} />
                    <ReferenceLine y={0} stroke="var(--shell-border)" />
                    <Tooltip formatter={(val, name) => [money(typeof val === 'number' ? val : 0, currency), name as string]} labelFormatter={(l, p) => { const d = (p?.[0]?.payload) as any; return d ? `${d.label} ${d.year}` : String(l); }} contentStyle={tooltipStyle} itemStyle={{ color: 'var(--shell-text)' }} cursor={{ fill: 'var(--shell-hover)' }} />
                    {chartMode === 'monthly' ? (
                      <>
                        <Bar dataKey="income" name="Income" radius={[3, 3, 0, 0]} onClick={(d: any) => pickMonth(d.year, d.month)} cursor="pointer">
                          {chartData.map((d, i) => <Cell key={i} fill={INCOME} fillOpacity={inPeriod(d) ? 1 : 0.35} />)}
                        </Bar>
                        <Bar dataKey="expense" name="Expenses" radius={[3, 3, 0, 0]} onClick={(d: any) => pickMonth(d.year, d.month)} cursor="pointer">
                          {chartData.map((d, i) => <Cell key={i} fill={SPEND} fillOpacity={inPeriod(d) ? 1 : 0.35} />)}
                        </Bar>
                        <Line dataKey="net" name="Net" type="linear" stroke="var(--shell-text)" strokeWidth={1.5} dot={{ r: 2.5, fill: 'var(--shell-text)' }} />
                      </>
                    ) : (
                      <Line dataKey="cumulative" name="Running net" type="linear" stroke="var(--shell-accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--shell-accent)' }} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartFrame>
            ) : (
              <p className={empty}>No transactions in the last twelve months. Record an expense or an income to see the trend.</p>
            )}
            {chartMode === 'monthly' && chartData.length > 0 && <p className="mt-2 text-[12px] text-[var(--shell-text-muted)]">Click a month to look at just that month. The line is the net result.</p>}
          </div>
        </Panel>

        <Panel title="Needs attention">
          {loading ? (
            <div className="space-y-3 p-4">{[...Array(4)].map((_, i) => <Skeleton key={i} h="44px" />)}</div>
          ) : (data?.attention ?? []).length > 0 ? (
            <ul className="divide-y divide-[var(--shell-border)]">
              {data!.attention.map((a) => (
                <li key={a.key}>
                  <button type="button" onClick={() => router.push(a.href)} className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)]">
                    <span aria-hidden className={cn('mt-0.5 w-6 shrink-0 text-right text-[15px] font-semibold tabular-nums', a.tone === 'danger' ? TONE_TEXT.danger : a.tone === 'warning' ? TONE_TEXT.warning : TONE_TEXT.info)}>{a.count}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-[var(--shell-text)]">{a.label}</span>
                      <span className="block text-[12px] text-[var(--shell-text-muted)]">{a.detail}</span>
                    </span>
                    <ChevronRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--shell-text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={empty}>All clear. Nothing is waiting, over budget or late.</p>
          )}
        </Panel>
      </div>

      {/* Where the money goes, how the plan stands, and the work behind it */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Spend by category" action={<PanelLink onClick={() => router.push('/analytics/resource-utilization')}>Analytics</PanelLink>}>
          {loading ? <div className="space-y-3 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} h="34px" />)}</div> : (data?.categories.rows ?? []).length > 0 ? (
            <ul className="divide-y divide-[var(--shell-border)]">
              {data!.categories.rows.map((c) => {
                const max = data!.categories.rows[0]?.amount || 1;
                const change = c.previous != null && c.previous > 0 ? ((c.amount - c.previous) / c.previous) * 100 : null;
                return (
                  <li key={c.name} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span title={c.name} className="truncate text-[13px] text-[var(--shell-text)]">{c.name}</span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--shell-text)]">{money(c.amount, currency)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-md bg-[var(--shell-hover)]"><div className="h-full rounded-md" style={{ width: `${(c.amount / max) * 100}%`, background: SPEND }} /></div>
                      <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-[var(--shell-text-muted)]">{Math.round(c.share)}%</span>
                      <span className={cn('w-14 shrink-0 text-right text-[12px] tabular-nums', change == null ? 'text-[var(--shell-text-muted)]' : change > 10 ? TONE_TEXT.warning : change < -10 ? TONE_TEXT.success : 'text-[var(--shell-text-muted)]')}>
                        {change == null ? '' : `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(0)}%`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className={empty}>No expenses in this period. Pick a longer period to see how spending splits by category.</p>}
        </Panel>

        {!portfolio && (
          <Panel title="Recent activity" className="lg:col-span-2" action={<PanelLink onClick={() => router.push('/transactions')}>View all</PanelLink>}>
            <RecentList rows={data?.recent ?? []} currency={currency} empty={empty} loading={loading} wide />
          </Panel>
        )}

        {budget ? (
          <Panel title={`Budget health, ${budget.label}`} action={<PanelLink onClick={() => router.push('/budget/monitor')}>Monitor</PanelLink>}>
            <div className="space-y-3 border-b border-[var(--shell-border)] p-4">
              <dl className="grid grid-cols-3 gap-3 text-[12px]">
                <div><dt className="text-[var(--shell-text-muted)]">Approved</dt><dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--shell-text)]">{plain(budget.approved, currency)}</dd></div>
                <div><dt className="text-[var(--shell-text-muted)]">Used</dt><dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--shell-text)]">{plain(budget.used, currency)}</dd></div>
                <div><dt className="text-[var(--shell-text-muted)]">Forecast</dt><dd className={cn('mt-0.5 text-[15px] font-semibold tabular-nums', budget.forecast > budget.approved ? TONE_TEXT.warning : 'text-[var(--shell-text)]')}>{plain(budget.forecast, currency)}</dd></div>
              </dl>
              {budget.pct != null && <BudgetBar pct={budget.pct} elapsed={budget.elapsed_pct} label="Budget used" />}
              <p className="text-[12px] text-[var(--shell-text-muted)]">
                {budget.over_lines > 0 ? <span className={TONE_TEXT.danger}>{budget.over_lines} over the limit</span> : 'None over the limit'}
                {` · ${budget.caution_lines} near it · ${budget.open_alerts} open ${budget.open_alerts === 1 ? 'alert' : 'alerts'}`}
              </p>
            </div>
            {budget.lines.length > 0 ? (
              <ul className="divide-y divide-[var(--shell-border)]">
                {budget.lines.map((l) => (
                  <li key={l.id} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span title={l.label} className="truncate text-[13px] text-[var(--shell-text)]">{l.label}</span>
                      <span className={cn('shrink-0 text-[13px] font-semibold tabular-nums', l.pct >= 100 ? TONE_TEXT.danger : l.pct >= 80 ? TONE_TEXT.warning : 'text-[var(--shell-text)]')}>{Math.round(l.pct)}%</span>
                    </div>
                    <div className="mt-1.5"><BudgetBar pct={l.pct} label={`${l.label} budget used`} /></div>
                  </li>
                ))}
              </ul>
            ) : <p className={empty}>No budget line has any spend yet.</p>}
          </Panel>
        ) : portfolio ? (
          <Panel title="Budget health" action={<PanelLink onClick={() => router.push('/budget/planner')}>Planner</PanelLink>}>
            <p className={empty}>No active budget plan for this financial year. Create one in the Planner to track spend against it here.</p>
          </Panel>
        ) : null}

        {portfolio && (
          <Panel title="Projects" action={<PanelLink onClick={() => router.push('/business/projects')}>All projects</PanelLink>}>
            <div className="space-y-2 border-b border-[var(--shell-border)] p-4">
              <dl className="grid grid-cols-3 gap-3 text-[12px]">
                <div><dt className="text-[var(--shell-text-muted)]">Active</dt><dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--shell-text)]">{portfolio.projects.active}</dd></div>
                <div><dt className="text-[var(--shell-text-muted)]">At risk</dt><dd className={cn('mt-0.5 text-[15px] font-semibold tabular-nums', portfolio.projects.at_risk ? TONE_TEXT.danger : 'text-[var(--shell-text)]')}>{portfolio.projects.at_risk}</dd></div>
                <div><dt className="text-[var(--shell-text-muted)]">Past end date</dt><dd className={cn('mt-0.5 text-[15px] font-semibold tabular-nums', portfolio.projects.overdue ? TONE_TEXT.warning : 'text-[var(--shell-text)]')}>{portfolio.projects.overdue}</dd></div>
              </dl>
              <p className="text-[12px] tabular-nums text-[var(--shell-text-muted)]">Spent {plain(portfolio.projects.spent, currency)} of {plain(portfolio.projects.estimate, currency)} estimated · contract value {plain(portfolio.projects.contract_value, currency)}</p>
            </div>
            {portfolio.projects.top.length > 0 ? (
              <ul className="divide-y divide-[var(--shell-border)]">
                {portfolio.projects.top.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => router.push(`/business/projects/${p.id}`)} className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span title={p.name} className="truncate text-[13px] text-[var(--shell-text)]">{p.name}{p.client ? <span className="text-[var(--shell-text-muted)]"> · {p.client}</span> : null}</span>
                        <span className={cn('shrink-0 text-[12px] font-medium', p.at_risk ? TONE_TEXT.danger : p.overdue ? TONE_TEXT.warning : 'text-[var(--shell-text-muted)]')}>{p.at_risk ? 'At risk' : p.overdue ? 'Past end date' : p.status}</span>
                      </div>
                      {p.pct != null ? <div className="mt-1.5"><BudgetBar pct={p.pct} label={`${p.name} spent of estimate`} /></div> : <p className="mt-1 text-[12px] text-[var(--shell-text-muted)]">No estimate yet</p>}
                      <p className="mt-1 text-[12px] tabular-nums text-[var(--shell-text-muted)]">{plain(p.spent, currency)}{p.estimate ? ` of ${plain(p.estimate, currency)}` : ''}{p.margin_pct != null ? ` · margin ${p.margin_pct.toFixed(1)}%` : ''}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className={empty}>No active projects.</p>}
          </Panel>
        )}
      </div>

      {/* The order book, and the latest activity */}
      {portfolio && (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {portfolio && (
          <Panel title="Order book" className="lg:col-span-1" action={<PanelLink onClick={() => router.push('/business/orders')}>All orders</PanelLink>}>
            <div className="border-b border-[var(--shell-border)] p-4">
              <dl className="grid grid-cols-3 gap-3 text-[12px]">
                <div><dt className="text-[var(--shell-text-muted)]">Open orders</dt><dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--shell-text)]">{portfolio.orders.open}</dd></div>
                <div><dt className="text-[var(--shell-text-muted)]">Value</dt><dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--shell-text)]">{plain(portfolio.orders.value, currency)}</dd></div>
                <div><dt className="text-[var(--shell-text-muted)]">Margin</dt><dd className={cn('mt-0.5 text-[15px] font-semibold tabular-nums', portfolio.orders.margin_pct != null && portfolio.orders.margin_pct < 0 ? TONE_TEXT.danger : 'text-[var(--shell-text)]')}>{portfolio.orders.margin_pct != null ? `${portfolio.orders.margin_pct.toFixed(1)}%` : '—'}</dd></div>
              </dl>
            </div>
            {portfolio.orders.next.length > 0 ? (
              <ul className="divide-y divide-[var(--shell-border)]">
                {portfolio.orders.next.map((o) => (
                  <li key={o.id}>
                    <button type="button" onClick={() => router.push(`/business/orders/${o.id}`)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)]">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-[var(--shell-text)]">{o.code} <span className="text-[var(--shell-text-muted)]">{o.product}</span></span>
                        <span className="block truncate text-[12px] text-[var(--shell-text-muted)]">{o.customer}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cn('block text-[13px] font-medium tabular-nums', o.late ? TONE_TEXT.danger : 'text-[var(--shell-text)]')}>{o.late ? 'Late' : o.days < 0 ? `${Math.abs(o.days)} ${Math.abs(o.days) === 1 ? 'day' : 'days'} overdue` : o.days === 0 ? 'Today' : `in ${o.days} ${o.days === 1 ? 'day' : 'days'}`}</span>
                        <span className="block text-[12px] tabular-nums text-[var(--shell-text-muted)]">{formatDate(o.delivery_date)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className={empty}>No open orders.</p>}
          </Panel>
        )}

        {recv && (
          <Panel title="Receivables" action={<PanelLink onClick={() => router.push('/manage/clients?tab=invoices')}>Invoices</PanelLink>}>
            <div className="border-b border-[var(--shell-border)] p-4">
              <dl className="grid grid-cols-3 gap-3 text-[12px]">
                <div><dt className="text-[var(--shell-text-muted)]">Outstanding</dt><dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--shell-text)]">{plain(recv.outstanding, currency)}</dd></div>
                <div><dt className="text-[var(--shell-text-muted)]">Overdue</dt><dd className={cn('mt-0.5 text-[15px] font-semibold tabular-nums', recv.overdue > 0 ? TONE_TEXT.danger : 'text-[var(--shell-text)]')}>{plain(recv.overdue, currency)}</dd></div>
                <div><dt className="text-[var(--shell-text-muted)]">Drafts</dt><dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--shell-text)]">{recv.drafts}</dd></div>
              </dl>
            </div>
            {recv.top.length > 0 ? (
              <ul className="divide-y divide-[var(--shell-border)]">
                {recv.top.map((c) => (
                  <li key={c.client_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span title={c.name} className="min-w-0 truncate text-[13px] text-[var(--shell-text)]">{c.name}</span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[13px] font-semibold tabular-nums text-[var(--shell-text)]">{money(c.outstanding, currency)}</span>
                      {c.overdue > 0 && <span className={cn('block text-[12px] tabular-nums', TONE_TEXT.danger)}>{money(c.overdue, currency)} overdue</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className={empty}>No client owes you anything. Issue an invoice to bill a client.</p>}
          </Panel>
        )}

        <Panel title="Recent activity" className={recv ? 'lg:col-span-1' : 'lg:col-span-2'} action={<PanelLink onClick={() => router.push('/transactions')}>View all</PanelLink>}>
          <RecentList rows={data?.recent ?? []} currency={currency} empty={empty} loading={loading} wide={!recv} />
        </Panel>
      </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Button type="button" onClick={() => router.push('/expense')} className="h-9 gap-2 px-3 text-[13px] font-medium"><Plus className="h-4 w-4" />Add expense</Button>
        <Button type="button" variant="outline" onClick={() => router.push('/income')} className="h-9 gap-2 px-3 text-[13px] font-medium"><Plus className="h-4 w-4 text-[var(--success)]" />Add income</Button>
        <button type="button" onClick={() => router.push('/reporting')} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-[13px] font-medium text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"><BarChart3 className="h-4 w-4" />Reports</button>
      </div>
    </div>
  );
}

function RecentList({ rows, currency, empty, loading, wide }: { rows: { id: number; reference: string | null; type: string; amount: number; status: string | null; date: string; description: string | null; category: string | null; who: string | null }[]; currency: string; empty: string; loading?: boolean; wide?: boolean }) {
  if (loading) return <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} h="40px" />)}</div>;
  if (!rows.length) return <p className={empty}>No transactions yet. They appear here as soon as one is recorded.</p>;
  return (
    <ul className="divide-y divide-[var(--shell-border)]">
      {rows.map((r) => {
        const st = STATUS_WORD[r.status ?? ''];
        return (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-[var(--shell-text)]">{r.description || r.category}</p>
              <p className="truncate text-[12px] text-[var(--shell-text-muted)]">
                {parseApiDate(r.date)?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                {wide && r.who ? ` · ${r.who}` : ''}{wide && r.category ? ` · ${r.category}` : ''}
                {st && st.label !== 'Approved' ? <> · <span className={TONE_TEXT[st.tone]}>{st.label}</span></> : null}
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: r.type === 'income' ? INCOME : 'var(--shell-text)' }}>{r.type === 'income' ? '+' : '−'}{money(r.amount, currency)}</span>
          </li>
        );
      })}
    </ul>
  );
}
