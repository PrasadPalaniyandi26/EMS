'use client';

import { useState, useEffect, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useDashboardSummary, useDashboardByCategory, useMonthlyTrend, useRecentTransactions } from '@/hooks/use-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, getDateRange } from '@/lib/currency';
import { TrendingUp, TrendingDown, Wallet, ArrowLeftRight } from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = ['#737A5D', '#6B8E5A', '#B85C4D', '#C9A84C', '#5D7A8C', '#A4AC86', '#414833', '#8D9C7A', '#5E644B', '#2D3122'];

const presets = [
  { label: 'This Week', key: 'thisWeek' as const },
  { label: 'Last Week', key: 'lastWeek' as const },
  { label: 'This Month', key: 'thisMonth' as const },
  { label: 'Last Month', key: 'lastMonth' as const },
  { label: 'Cal Year', key: 'calYear' as const },
  { label: 'Fin Year', key: 'finYear' as const },
];

export default function DashboardPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setHeader('Dashboard', `Welcome back, ${user?.username || 'User'}`);
  }, [setHeader, user]);

  const { data: summary, isLoading: summaryLoading } = useDashboardSummary(dateFrom, dateTo);
  const { data: byCategory } = useDashboardByCategory(dateFrom, dateTo);
  const { data: monthlyTrend } = useMonthlyTrend();
  const { data: recentTxns } = useRecentTransactions();

  const fmt = (n: number) => formatCurrency(n, currency);

  const summaryCards = [
    { label: 'Total Income', value: summary?.totalIncome || 0, icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'Total Expenses', value: summary?.totalExpenses || 0, icon: TrendingDown, color: 'text-red-500' },
    { label: 'Balance', value: summary?.balance || 0, icon: Wallet, color: 'text-blue-500' },
    { label: 'Transactions', value: summary?.transactionCount || 0, icon: ArrowLeftRight, color: 'text-stone-500', plain: true },
  ];

  const categoryData = useMemo(() =>
    (byCategory || []).map((c) => ({ name: c.category_name, value: c.total })),
    [byCategory]
  );

  const trendData = useMemo(() =>
    (monthlyTrend || []).map((m) => ({ month: m.month, income: m.income, expenses: m.expense })),
    [monthlyTrend]
  );

  return (
    <div className="space-y-6">
      {/* Date Presets */}
      <Card>
        <CardContent className="flex flex-wrap gap-2 py-3">
          {presets.map((p) => (
            <Button
              key={p.key}
              variant="outline"
              size="sm"
              onClick={() => {
                const r = getDateRange(p.key);
                setDateFrom(r.from);
                setDateTo(r.to);
              }}
            >
              {p.label}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
            All Time
          </Button>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold">
                    {summaryLoading ? '...' : s.plain ? s.value : fmt(s.value)}
                  </p>
                </div>
                <div className={`rounded-lg bg-muted p-3 ${s.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-muted-foreground">No data yet. Add transactions to see trends!</p>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => fmt(typeof val === 'number' ? val : 0)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-muted-foreground">No expense data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {(recentTxns || []).length > 0 ? (
            <div className="space-y-3">
              {(recentTxns || []).map((txn) => (
                <div key={txn.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{txn.description || txn.category_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(txn.date_recorded).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={txn.type === 'income' ? 'default' : 'destructive'}>
                      {txn.type}
                    </Badge>
                    <span className={`text-sm font-semibold ${txn.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {txn.type === 'income' ? '+' : '-'}{formatCurrency(txn.amount, currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-muted-foreground">No transactions yet. Add one to get started!</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
