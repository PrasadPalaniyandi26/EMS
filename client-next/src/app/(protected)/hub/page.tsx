'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useDashboardSummary, useApprovals, useBudgets } from '@/hooks/use-queries';
import { formatCurrency, formatDate } from '@/lib/currency';
import { getStatusConfig } from '@/lib/status';
import {
  TrendingDown, TrendingUp, ShieldCheck, Target,
  Plus, ArrowRight, Wallet, CheckCircle2,
} from 'lucide-react';

export default function HubPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const router = useRouter();

  useEffect(() => { setHeader('Hub', 'Quick overview'); }, [setHeader]);

  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: pendingApprovals } = useApprovals();
  const { data: budgetsData } = useBudgets();

  const recentTxns: any[] = summary?.recentTransactions?.slice(0, 5) || [];
  const pendingCount = Array.isArray(pendingApprovals) ? pendingApprovals.length : 0;
  const budgets: any[] = Array.isArray(budgetsData) ? budgetsData : (budgetsData as any)?.rows || [];
  const overBudget = budgets.filter((b: any) => b.spent > b.amount);

  const isManager = user?.roles?.some((r) => r.role_name === 'MANAGER');
  const isFinance = user?.roles?.some((r) => r.role_name === 'FINANCE');
  const isAdmin = user?.roles?.some((r) => r.role_name === 'ADMIN');
  const canApprove = isManager || isFinance || isAdmin;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-5" style={{ background: 'var(--shell-bg)' }}>

      {/* Quick Actions */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--shell-text-muted)] mb-2.5">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push('/expense')}
            className="btn-action-primary flex items-center gap-2 px-4 py-2"
          >
            <Plus className="w-3.5 h-3.5" /> Add Expense
          </button>
          <button
            onClick={() => router.push('/income')}
            className="btn-action flex items-center gap-2 px-4 py-2"
          >
            <Plus className="w-3.5 h-3.5" /> Add Income
          </button>
          {canApprove && pendingCount > 0 && (
            <button
              onClick={() => router.push('/approvals')}
              className="btn-action flex items-center gap-2 px-4 py-2 border-amber-400/40"
              style={{ color: 'var(--shell-text)', borderColor: 'rgb(251 191 36 / 0.4)' }}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
              Review {pendingCount} Pending Approval{pendingCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Income',
            value: summaryLoading ? '—' : formatCurrency(summary?.totalIncome || 0, currency),
            icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
            color: 'text-emerald-500',
          },
          {
            label: 'Total Expenses',
            value: summaryLoading ? '—' : formatCurrency(summary?.totalExpenses || 0, currency),
            icon: <TrendingDown className="w-4 h-4 text-rose-500" />,
            color: 'text-rose-500',
          },
          {
            label: 'Net Balance',
            value: summaryLoading ? '—' : formatCurrency(summary?.balance || 0, currency),
            icon: <Wallet className="w-4 h-4 text-[var(--shell-accent)]" />,
            color: 'text-[var(--shell-accent)]',
          },
          {
            label: 'Pending Approvals',
            value: String(pendingCount),
            icon: <ShieldCheck className="w-4 h-4 text-amber-500" />,
            color: 'text-amber-500',
          },
        ].map((card) => (
          <div key={card.label} className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
            <div className="mt-0.5 shrink-0">{card.icon}</div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--shell-text-muted)]">{card.label}</p>
              <p className={`text-[16px] font-black mt-0.5 ${card.color}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Transactions */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--shell-border)' }}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--shell-text-muted)]">Recent Transactions</p>
            <button onClick={() => router.push('/transactions')} className="flex items-center gap-1 text-[10px] font-semibold text-[var(--shell-accent)] hover:opacity-80 transition-opacity">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--shell-border)' }}>
            {summaryLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3 animate-pulse">
                  <div className="h-3 w-28 rounded bg-[var(--shell-hover)]" />
                  <div className="h-3 flex-1 rounded bg-[var(--shell-hover)]" />
                  <div className="h-3 w-16 rounded bg-[var(--shell-hover)]" />
                </div>
              ))
            ) : recentTxns.length === 0 ? (
              <div className="px-4 py-8 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-[var(--shell-text-muted)] opacity-40" />
                <p className="text-[11px] text-[var(--shell-text-muted)]">No recent transactions</p>
              </div>
            ) : recentTxns.map((t: any) => {
              const sc = getStatusConfig(t.status);
              const isIncome = t.type === 'income';
              return (
                <div key={t.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--shell-hover)] transition-colors cursor-pointer" onClick={() => router.push('/transactions')}>
                  <span className="text-[10px] text-[var(--shell-text-muted)] font-medium w-20 shrink-0">{formatDate(t.date_recorded)}</span>
                  <span className="flex-1 text-[11px] font-semibold text-black dark:text-white truncate">{t.description}</span>
                  <span className={`text-[10px] font-bold shrink-0 ${sc.color}`}>{sc.label}</span>
                  <span className={`text-[11px] font-black shrink-0 ${isIncome ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {isIncome ? '+' : '-'}{formatCurrency(t.amount, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Budget Overview */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--shell-border)' }}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--shell-text-muted)]">Budget Overview</p>
            <button onClick={() => router.push('/manage/budgets')} className="flex items-center gap-1 text-[10px] font-semibold text-[var(--shell-accent)] hover:opacity-80 transition-opacity">
              Manage <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--shell-border)' }}>
            {budgets.length === 0 ? (
              <div className="px-4 py-8 flex flex-col items-center gap-2">
                <Target className="w-6 h-6 text-[var(--shell-text-muted)] opacity-40" />
                <p className="text-[11px] text-[var(--shell-text-muted)]">No budgets configured</p>
              </div>
            ) : budgets.slice(0, 5).map((b: any) => {
              const pct = b.amount > 0 ? Math.min(100, Math.round((b.spent / b.amount) * 100)) : 0;
              const isOver = pct >= 100;
              const isWarn = pct >= 80 && !isOver;
              return (
                <div key={b.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-black dark:text-white truncate max-w-[180px]">{b.name || b.category_name || `Budget #${b.id}`}</span>
                    <span className={`text-[10px] font-bold ${isOver ? 'text-rose-500' : isWarn ? 'text-amber-500' : 'text-[var(--shell-text-muted)]'}`}>{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[var(--shell-hover)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isOver ? 'bg-rose-500' : isWarn ? 'bg-amber-400' : 'bg-[var(--shell-accent)]'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[9px] text-[var(--shell-text-muted)]">{formatCurrency(b.spent || 0, currency)} spent</span>
                    <span className="text-[9px] text-[var(--shell-text-muted)]">of {formatCurrency(b.amount, currency)}</span>
                  </div>
                </div>
              );
            })}
            {overBudget.length > 0 && (
              <div className="px-4 py-2.5 flex items-center gap-2 bg-rose-500/8">
                <Target className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <p className="text-[10px] font-semibold text-rose-500">{overBudget.length} budget{overBudget.length !== 1 ? 's' : ''} over limit</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
