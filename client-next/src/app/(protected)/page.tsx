'use client';

import { useState, useEffect, useMemo } from 'react';
import { inputStyle } from '@/components/shared/modal-primitives';
import { StatCard, StatStrip } from '@/components/shared/stat-card';
import { useRouter } from 'next/navigation';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import {
  useDashboardSummary, useDashboardByCategory, useMonthlyTrend,
  useRecentTransactions, useBudgetUtilization, useApprovalCounts, useProjectSpend,
} from '@/hooks/use-queries';
import { formatCurrency, getDateRange, parseApiDate } from '@/lib/currency';
import {
  TrendingUp, TrendingDown, Wallet, ArrowLeftRight,
  ClipboardCheck, Target, Plus, BarChart3, CheckCircle2,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = ['var(--chart-1)', 'var(--chart-4)', 'var(--chart-3)', 'var(--warning)', 'var(--chart-2)', 'var(--chart-5)', 'var(--info)', 'var(--success)'];

const presets = [
  { label: 'This Week', key: 'thisWeek' as const },
  { label: 'Last Week', key: 'lastWeek' as const },
  { label: 'This Month', key: 'thisMonth' as const },
  { label: 'Last Month', key: 'lastMonth' as const },
  { label: 'Calendar Year', key: 'calYear' as const },
  { label: 'Financial Year', key: 'finYear' as const },
  { label: 'All Time', key: 'allTime' as const },
];

function SkeletonRect({ w, h, className = '' }: { w?: string; h?: string; className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ width: w, height: h ?? '1rem', background: 'var(--shell-hover)' }}
    />
  );
}

export default function DashboardPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const router = useRouter();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activePreset, setActivePreset] = useState<string>('This Month');

  useEffect(() => {
    const r = getDateRange('thisMonth');
    setDateFrom(r.from);
    setDateTo(r.to);
  }, []);

  useEffect(() => {
    setHeader('Dashboard', `Welcome back, ${user?.username || 'User'}`);
  }, [setHeader, user]);

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
  const { data: approvalCounts } = useApprovalCounts();
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

  const categoryData = useMemo(() =>
    (byCategory || []).filter((c: any) => c.type === 'expense').map((c: any) => ({ name: c.category_name, value: c.total })),
    [byCategory]
  );

  const trendData = useMemo(() =>
    (monthlyTrend || []).map((m: any) => ({ month: m.month, income: m.income, expenses: m.expense })),
    [monthlyTrend]
  );

  const pendingApprovals = (approvalCounts as any)?.pendingMyAction ?? 0;
  const budgetPct = useMemo(() => {
    const items = (budgetUtil || []) as any[];
    if (!items.length) return null;
    const total = items.reduce((s: number, b: any) => s + b.budget, 0);
    const spent = items.reduce((s: number, b: any) => s + b.spent, 0);
    return total > 0 ? Math.round((spent / total) * 100) : 0;
  }, [budgetUtil]);

  const kpis = [
    { tone: 'success' as const, label: 'Total Income', value: fmt(summary?.totalIncome || 0), icon: TrendingUp, color: 'text-[var(--success)]', bg: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]', loading: summaryLoading },
    { tone: 'danger' as const, label: 'Total Expenses', value: fmt(summary?.totalExpenses || 0), icon: TrendingDown, color: 'text-[var(--danger)]', bg: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]', loading: summaryLoading },
    { tone: 'info' as const, label: 'Net Balance', value: fmt(summary?.balance || 0), icon: Wallet, color: 'text-[var(--info)]', bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]', loading: summaryLoading },
    { tone: 'warning' as const, label: 'Transactions', value: String(summary?.transactionCount || 0), icon: ArrowLeftRight, color: 'text-[var(--warning)]', bg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]', loading: summaryLoading },
    { tone: 'info' as const, label: 'Pending Approvals', value: String(pendingApprovals), icon: ClipboardCheck, color: 'text-[var(--info)]', bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]', loading: false, link: '/approvals' },
    { tone: (budgetPct !== null && budgetPct > 90 ? 'danger' : 'info') as 'danger' | 'info', label: 'Budget Used', value: budgetPct !== null ? `${budgetPct}%` : '—', icon: Target, color: budgetPct !== null && budgetPct > 90 ? 'text-[var(--danger)]' : 'text-[var(--info)]', bg: budgetPct !== null && budgetPct > 90 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]' : 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]', loading: budgetLoading, link: '/manage/budgets' },
  ];

  const approvalStages = [
    { label: 'Draft', count: (approvalCounts as any)?.draft ?? 0, color: 'var(--status-draft)' },
    { label: 'Pending Manager', count: (approvalCounts as any)?.pendingManager ?? 0, color: 'var(--status-pending-manager)' },
    { label: 'Pending Finance', count: (approvalCounts as any)?.pendingFinance ?? 0, color: 'var(--status-pending-finance)' },
    { label: 'Approved', count: (approvalCounts as any)?.approved ?? 0, color: 'var(--status-approved)' },
    { label: 'Rejected', count: (approvalCounts as any)?.rejected ?? 0, color: 'var(--status-rejected)' },
  ];

  const quickActions = [
    { label: '+ Expense', href: '/expense', color: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]' },
    { label: '+ Income', href: '/income', color: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]' },
    { label: 'Approvals', href: '/approvals', color: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)] text-[var(--info)] hover:bg-[color-mix(in_srgb,var(--info)_20%,transparent)]' },
    { label: 'Reports', href: '/reporting', color: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)] text-[var(--info)] hover:bg-[color-mix(in_srgb,var(--info)_20%,transparent)]' },
    { label: 'Transactions', href: '/transactions', color: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]' },
    { label: 'Budgets', href: '/manage/budgets', color: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)] text-[var(--info)] hover:bg-[color-mix(in_srgb,var(--info)_20%,transparent)]' },
  ];

  const surface = { background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">

      {/* Period selector */}
      <div className="rounded-lg px-4 py-3 flex flex-wrap items-center gap-3" style={surface}>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={activePreset === p.label}
              onClick={() => handlePreset(p.key, p.label)}
              className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold transition-all"
              style={activePreset === p.label
                ? { background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }
                : { background: 'var(--shell-hover)', color: 'var(--shell-text-muted)' }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input type="date" aria-label="From date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setActivePreset('Custom'); }}
            className="rounded-lg px-3 py-1.5 text-[12px] border outline-none"
            style={inputStyle} />
          <span className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>—</span>
          <input type="date" aria-label="To date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setActivePreset('Custom'); }}
            className="rounded-lg px-3 py-1.5 text-[12px] border outline-none"
            style={inputStyle} />
        </div>
      </div>

      {/* Row 1: KPI strip */}
      <StatStrip cols={6}>
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <StatCard
              key={k.label}
              label={k.label}
              value={k.value}
              loading={k.loading}
              tone={k.tone}
              icon={<Icon className="h-4 w-4" />}
              onClick={k.link ? () => router.push(k.link as string) : undefined}
            />
          );
        })}
      </StatStrip>

      {/* Row 2 — Monthly Trend + Category Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5">Monthly Income vs Expenses</div>
          <div className="p-4">
            {trendLoading ? <SkeletonRect h="260px" /> : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--shell-border)" strokeOpacity={0.5} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--shell-text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--shell-text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)', borderRadius: 8, fontSize: 12, color: 'var(--shell-text)' }}
                    cursor={{ fill: 'var(--shell-hover)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--shell-text-muted)' }} />
                  <Bar dataKey="income" fill="var(--success)" radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="expenses" fill="var(--danger)" radius={[4, 4, 0, 0]} name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>No data yet. Add transactions to see trends.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5">Expenses by Category</div>
          <div className="p-4">
            {categoryLoading ? <SkeletonRect h="260px" /> : categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="45%" outerRadius={90} innerRadius={48} paddingAngle={3} dataKey="value">
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(val) => fmt(typeof val === 'number' ? val : 0)} contentStyle={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)', borderRadius: 8, fontSize: 12, color: 'var(--shell-text)' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--shell-text-muted)' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>No expense data yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Row 3 — Budget Utilization + Project Spend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Budget Utilization */}
        <div className="rounded-lg overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5 flex items-center justify-between">
            <span>Budget Utilization — This Month</span>
            <button onClick={() => router.push('/manage/budgets')} className="text-[12px] font-semibold hover:underline" style={{ color: 'var(--shell-accent)' }}>Manage</button>
          </div>
          <div className="p-4 space-y-3">
            {budgetLoading ? (
              [...Array(4)].map((_, i) => <SkeletonRect key={i} h="36px" />)
            ) : (budgetUtil || []).length > 0 ? (
              (budgetUtil as any[]).map((b) => {
                const pct = Math.min(b.pct, 100);
                const color = b.pct >= 100 ? 'var(--danger)' : b.pct >= 80 ? 'var(--warning)' : 'var(--success)';
                return (
                  <div key={b.category_id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--shell-text)' }}>{b.category_name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>{fmt(b.spent)} / {fmt(b.budget)}</span>
                        <span className="text-[12px] font-semibold w-10 text-right" style={{ color }}>{b.pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-md overflow-hidden" style={{ background: 'var(--shell-hover)' }}>
                      <div className="h-full rounded-md transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>No budgets set for this month.</p>
            )}
          </div>
        </div>

        {/* Project Spend */}
        <div className="rounded-lg overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5">Top Project Spend</div>
          <div className="p-4">
            {projectLoading ? <SkeletonRect h="200px" /> : (projectSpend || []).length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(160, (projectSpend as any[]).length * 42)}>
                <BarChart data={projectSpend as any[]} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--shell-border)" strokeOpacity={0.5} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--shell-text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="project_name" tick={{ fontSize: 11, fill: 'var(--shell-text-muted)' }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip
                    formatter={(val) => fmt(typeof val === 'number' ? val : 0)}
                    contentStyle={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)', borderRadius: 8, fontSize: 12, color: 'var(--shell-text)' }}
                  />
                  <Bar dataKey="spent" fill="var(--info)" radius={[0, 4, 4, 0]} name="Spent" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>No project-linked expenses yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Row 4 — Approval Pipeline + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Approval Pipeline */}
        <div className="rounded-lg overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5 flex items-center justify-between">
            <span>Approval Pipeline</span>
            <button onClick={() => router.push('/approvals')} className="text-[12px] font-semibold hover:underline" style={{ color: 'var(--shell-accent)' }}>View All</button>
          </div>
          <div className="p-4 space-y-2">
            {approvalStages.map((s) => (
              <div key={s.label} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ border: '1px solid var(--shell-border)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-[12px] font-medium" style={{ color: 'var(--shell-text)' }}>{s.label}</span>
                </div>
                <span className="text-[13px] font-semibold" style={{ color: s.color }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="lg:col-span-2 rounded-lg overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5 flex items-center justify-between">
            <span>Recent Transactions</span>
            <button onClick={() => router.push('/transactions')} className="text-[12px] font-semibold hover:underline" style={{ color: 'var(--shell-accent)' }}>View All</button>
          </div>
          <div className="p-4">
            {txnsLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <SkeletonRect key={i} h="44px" />)}
              </div>
            ) : (recentTxns || []).length > 0 ? (
              <div className="space-y-2">
                {(recentTxns || []).map((txn: any) => (
                  <div key={txn.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors" style={{ border: '1px solid var(--shell-border)' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${txn.type === 'income' ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' : 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]'}`}>
                        {txn.type === 'income'
                          ? <TrendingUp className="h-3.5 w-3.5 text-[var(--success)]" />
                          : <TrendingDown className="h-3.5 w-3.5 text-[var(--danger)]" />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--shell-text)' }}>{txn.description || txn.category_name}</p>
                        <p className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>
                          {parseApiDate(txn.date_recorded)?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[13px] font-semibold shrink-0 ml-3 ${txn.type === 'income' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {txn.type === 'income' ? '+' : '-'}{formatCurrency(txn.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>No transactions yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Row 5 — Quick Actions */}
      <div className="rounded-lg px-4 py-3 flex flex-wrap gap-2 items-center" style={surface}>
        <span className="text-[12px] font-semibold mr-2" style={{ color: 'var(--shell-text-muted)' }}>Quick Actions</span>
        {quickActions.map((a) => (
          <button
            key={a.href}
            onClick={() => router.push(a.href)}
            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${a.color}`}
          >
            {a.label}
          </button>
        ))}
      </div>

    </div>
  );
}
