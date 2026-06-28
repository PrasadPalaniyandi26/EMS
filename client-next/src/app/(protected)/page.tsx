'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import {
  useDashboardSummary, useDashboardByCategory, useMonthlyTrend,
  useRecentTransactions, useBudgetUtilization, useApprovalCounts, useProjectSpend,
} from '@/hooks/use-queries';
import { formatCurrency, getDateRange } from '@/lib/currency';
import {
  TrendingUp, TrendingDown, Wallet, ArrowLeftRight,
  ClipboardCheck, Target, Plus, BarChart3, CheckCircle2,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = ['#6366F1', '#818CF8', '#A5B4FC', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316'];

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
    { label: 'Total Income', value: fmt(summary?.totalIncome || 0), icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', loading: summaryLoading },
    { label: 'Total Expenses', value: fmt(summary?.totalExpenses || 0), icon: TrendingDown, color: 'text-rose-400', bg: 'bg-rose-400/10', loading: summaryLoading },
    { label: 'Net Balance', value: fmt(summary?.balance || 0), icon: Wallet, color: 'text-blue-400', bg: 'bg-blue-400/10', loading: summaryLoading },
    { label: 'Transactions', value: String(summary?.transactionCount || 0), icon: ArrowLeftRight, color: 'text-amber-400', bg: 'bg-amber-400/10', loading: summaryLoading },
    { label: 'Pending Approvals', value: String(pendingApprovals), icon: ClipboardCheck, color: 'text-violet-400', bg: 'bg-violet-400/10', loading: false, link: '/approvals' },
    { label: 'Budget Used', value: budgetPct !== null ? `${budgetPct}%` : '—', icon: Target, color: budgetPct !== null && budgetPct > 90 ? 'text-rose-400' : 'text-cyan-400', bg: budgetPct !== null && budgetPct > 90 ? 'bg-rose-400/10' : 'bg-cyan-400/10', loading: budgetLoading, link: '/manage/budgets' },
  ];

  const approvalStages = [
    { label: 'Draft', count: (approvalCounts as any)?.draft ?? 0, color: '#94a3b8' },
    { label: 'Pending Manager', count: (approvalCounts as any)?.pendingManager ?? 0, color: '#F59E0B' },
    { label: 'Pending Finance', count: (approvalCounts as any)?.pendingFinance ?? 0, color: '#6366F1' },
    { label: 'Approved', count: (approvalCounts as any)?.approved ?? 0, color: '#10B981' },
    { label: 'Rejected', count: (approvalCounts as any)?.rejected ?? 0, color: '#F43F5E' },
  ];

  const quickActions = [
    { label: '+ Expense', href: '/expense', color: 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20' },
    { label: '+ Income', href: '/income', color: 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' },
    { label: 'Approvals', href: '/approvals', color: 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20' },
    { label: 'Reports', href: '/reporting', color: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' },
    { label: 'Transactions', href: '/transactions', color: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' },
    { label: 'Budgets', href: '/manage/budgets', color: 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20' },
  ];

  const surface = { background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">

      {/* Period selector */}
      <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-3" style={surface}>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.key, p.label)}
              className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all"
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
          <input type="date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setActivePreset('Custom'); }}
            className="rounded-lg px-3 py-1.5 text-[12px] border outline-none"
            style={{ background: 'var(--shell-bg)', color: 'var(--shell-text)', borderColor: 'var(--shell-border)' }} />
          <span className="text-[11px]" style={{ color: 'var(--shell-text-muted)' }}>—</span>
          <input type="date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setActivePreset('Custom'); }}
            className="rounded-lg px-3 py-1.5 text-[12px] border outline-none"
            style={{ background: 'var(--shell-bg)', color: 'var(--shell-text)', borderColor: 'var(--shell-border)' }} />
        </div>
      </div>

      {/* Row 1 — 6 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              onClick={() => k.link && router.push(k.link)}
              className={`rounded-xl p-4 flex items-center justify-between ${k.link ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
              style={surface}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-semibold mb-1 truncate" style={{ color: 'var(--shell-text-muted)' }}>{k.label}</p>
                {k.loading
                  ? <SkeletonRect w="60px" h="24px" className="mt-1" />
                  : <p className="text-[18px] font-black leading-none truncate" style={{ color: 'var(--shell-text)' }}>{k.value}</p>
                }
              </div>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ml-2 ${k.bg} ${k.color}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Row 2 — Monthly Trend + Category Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5">Monthly Income vs Expenses</div>
          <div className="p-4">
            {trendLoading ? <SkeletonRect h="260px" /> : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--shell-text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--shell-text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)', borderRadius: 8, fontSize: 12, color: 'var(--shell-text)' }}
                    cursor={{ fill: 'rgba(128,128,128,0.08)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--shell-text-muted)' }} />
                  <Bar dataKey="income" fill="#6366F1" radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="expenses" fill="#F43F5E" radius={[4, 4, 0, 0]} name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>No data yet. Add transactions to see trends.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl overflow-hidden" style={surface}>
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
        <div className="rounded-xl overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5 flex items-center justify-between">
            <span>Budget Utilization — This Month</span>
            <button onClick={() => router.push('/manage/budgets')} className="text-[11px] font-semibold hover:underline" style={{ color: 'var(--shell-accent)' }}>Manage</button>
          </div>
          <div className="p-4 space-y-3">
            {budgetLoading ? (
              [...Array(4)].map((_, i) => <SkeletonRect key={i} h="36px" />)
            ) : (budgetUtil || []).length > 0 ? (
              (budgetUtil as any[]).map((b) => {
                const pct = Math.min(b.pct, 100);
                const color = b.pct >= 100 ? '#F43F5E' : b.pct >= 80 ? '#F59E0B' : '#10B981';
                return (
                  <div key={b.category_id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--shell-text)' }}>{b.category_name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px]" style={{ color: 'var(--shell-text-muted)' }}>{fmt(b.spent)} / {fmt(b.budget)}</span>
                        <span className="text-[11px] font-bold w-10 text-right" style={{ color }}>{b.pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--shell-hover)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
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
        <div className="rounded-xl overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5">Top Project Spend</div>
          <div className="p-4">
            {projectLoading ? <SkeletonRect h="200px" /> : (projectSpend || []).length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(160, (projectSpend as any[]).length * 42)}>
                <BarChart data={projectSpend as any[]} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--shell-text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="project_name" tick={{ fontSize: 11, fill: 'var(--shell-text-muted)' }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip
                    formatter={(val) => fmt(typeof val === 'number' ? val : 0)}
                    contentStyle={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)', borderRadius: 8, fontSize: 12, color: 'var(--shell-text)' }}
                  />
                  <Bar dataKey="spent" fill="#6366F1" radius={[0, 4, 4, 0]} name="Spent" />
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
        <div className="rounded-xl overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5 flex items-center justify-between">
            <span>Approval Pipeline</span>
            <button onClick={() => router.push('/approvals')} className="text-[11px] font-semibold hover:underline" style={{ color: 'var(--shell-accent)' }}>View All</button>
          </div>
          <div className="p-4 space-y-2">
            {approvalStages.map((s) => (
              <div key={s.label} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'var(--shell-hover)', border: '1px solid var(--shell-border)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-[12px] font-medium" style={{ color: 'var(--shell-text)' }}>{s.label}</span>
                </div>
                <span className="text-[13px] font-black" style={{ color: s.color }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="lg:col-span-2 rounded-xl overflow-hidden" style={surface}>
          <div className="dialog-header px-4 py-2.5 flex items-center justify-between">
            <span>Recent Transactions</span>
            <button onClick={() => router.push('/transactions')} className="text-[11px] font-semibold hover:underline" style={{ color: 'var(--shell-accent)' }}>View All</button>
          </div>
          <div className="p-4">
            {txnsLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <SkeletonRect key={i} h="44px" />)}
              </div>
            ) : (recentTxns || []).length > 0 ? (
              <div className="space-y-2">
                {(recentTxns || []).map((txn: any) => (
                  <div key={txn.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors" style={{ background: 'var(--shell-hover)', border: '1px solid var(--shell-border)' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${txn.type === 'income' ? 'bg-emerald-500/10' : 'bg-rose-400/10'}`}>
                        {txn.type === 'income'
                          ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                          : <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--shell-text)' }}>{txn.description || txn.category_name}</p>
                        <p className="text-[10.5px]" style={{ color: 'var(--shell-text-muted)' }}>
                          {new Date(txn.date_recorded).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[13px] font-black shrink-0 ml-3 ${txn.type === 'income' ? 'text-emerald-500' : 'text-rose-400'}`}>
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
      <div className="rounded-xl px-4 py-3 flex flex-wrap gap-2 items-center" style={surface}>
        <span className="text-[11px] font-semibold uppercase tracking-wider mr-2" style={{ color: 'var(--shell-text-muted)' }}>Quick Actions</span>
        {quickActions.map((a) => (
          <button
            key={a.href}
            onClick={() => router.push(a.href)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${a.color}`}
          >
            {a.label}
          </button>
        ))}
      </div>

    </div>
  );
}
