'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useBudgetLine, useBudgetMonitor, useBudgetPlans, useBudgetSettings, type MonitorLine } from '@/hooks/use-budget-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { IdCell, TextCell, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { NativeSelect } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField } from '@/components/shared/detail/detail-kit';
import { FySelect, Kpi, KpiStrip, LevelText, LineStatusText, STATUS_TEXT, UtilBar, money, plain } from '@/components/budgets/budget-ui';
import { formatDate } from '@/lib/currency';
import { StatusText } from '@/components/data-table/cells';

// Whole-rupee amount, right-aligned like MoneyCell
const Whole = ({ value, currency }: { value: number; currency: string }) => <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{plain(value, currency)}</div>;

const STATUS_FILTERS = ['All', 'Needs attention', 'On track'] as const;

export default function BudgetMonitorPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const { data: plansData } = useBudgetPlans();
  const { data: settings } = useBudgetSettings();
  const [fy, setFy] = useState<number | null>(null);
  useEffect(() => { if (fy == null && plansData) setFy(plansData.current_fy); }, [plansData, fy]);
  const { data, isLoading } = useBudgetMonitor(fy);

  const [object, setObject] = useState('ALL');
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('All');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'pct', desc: true }]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rowSelection, setRowSelection] = useState({});

  useEffect(() => { setHeader('Budget monitor', 'What has been spent, what is committed and what is left'); }, [setHeader]);
  useEffect(() => { setSelectedId(null); setRowSelection({}); }, [fy]);

  const rows = useMemo(() => (data?.lines ?? []).filter((l) => {
    if (object !== 'ALL' && l.cost_object !== object) return false;
    if (status === 'Needs attention') return l.status === 'Warning' || l.status === 'Critical' || l.forecast_over;
    if (status === 'On track') return l.status === 'On track' && !l.forecast_over;
    return true;
  }), [data, object, status]);

  const columns = useMemo<ColumnDef<MonitorLine, any>[]>(() => [
    {
      id: 'label', accessorKey: 'label', header: 'Line',
      cell: ({ row }) => (
        <div className="min-w-0">
          <TextCell value={row.original.label} strong className="block max-w-[320px] truncate" />
          <span className="block max-w-[320px] truncate text-[12px] text-[var(--shell-text-muted)]">{row.original.object_name}{row.original.strict ? ' · strict' : ''}</span>
        </div>
      ),
    },
    { accessorKey: 'owner_name', header: 'Owner', cell: ({ row }) => <TextCell value={row.original.owner_name} muted />, size: 100 },
    { accessorKey: 'total', header: headerRight('Budget'), cell: ({ row }) => <Whole value={row.original.total} currency={currency} />, size: 120 },
    { accessorKey: 'used', header: headerRight('Used'), cell: ({ row }) => <Whole value={row.original.used} currency={currency} />, size: 120 },
    {
      accessorKey: 'pct', header: 'Utilisation', size: 150,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <UtilBar pct={row.original.pct} className="w-16" />
          <span className="w-12 text-right text-[13px] tabular-nums">{row.original.pct >= 999 ? '—' : `${Math.round(row.original.pct)}%`}</span>
        </div>
      ),
    },
    { accessorKey: 'forecast', header: headerRight('Forecast'), cell: ({ row }) => (row.original.forecast != null ? <Whole value={row.original.forecast} currency={currency} /> : <div className="text-right"><TextCell value="" /></div>), size: 120 },
    { accessorKey: 'runs_out', header: 'Runs out', cell: ({ row }) => <TextCell value={row.original.runs_out} muted />, size: 90 },
    {
      accessorKey: 'status', header: 'Status', size: 100,
      cell: ({ row }) => (row.original.forecast_over ? <span className="text-[13px] font-medium text-[var(--warning)]">Forecast over</span> : <LineStatusText status={row.original.status} />),
    },
  ], [currency]);

  const table = useDataTable({
    data: rows, columns,
    state: { sorting, rowSelection },
    getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false,
    onRowSelectionChange: (u) => {
      const next = typeof u === 'function' ? u(rowSelection) : u;
      setRowSelection(next);
      setSelectedId(Object.keys(next)[0] ? Number(Object.keys(next)[0]) : null);
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const { data: detail } = useBudgetLine(selected ? selected.id : null);
  const k = data?.kpis;

  return (
    <ModuleShell
      showPanel={!!selected}
      panelOnSelect
      searchRow={
        <DataTableToolbar
          table={table}
          actions={
            <>
              <FySelect plans={plansData?.plans ?? []} value={fy} onChange={setFy} currentFy={plansData?.current_fy} startMonth={settings?.fy_start_month ?? 4} />
              <NativeSelect aria-label="Cost object" value={object} onChange={(e) => setObject(e.target.value)} className="!h-8 !w-auto">
                <option value="ALL">All cost objects</option>
                <option value="PROJECT">Projects</option>
                <option value="PRODUCT">Products</option>
                <option value="DEPARTMENT">Overheads</option>
                <option value="RESERVE">Reserve</option>
              </NativeSelect>
              <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUS_FILTERS)[number])} className="!h-8 !w-auto">
                {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'All' ? 'Any status' : s}</option>)}
              </NativeSelect>
            </>
          }
        />
      }
      intelligencePanel={
        <ModuleIntelligencePanel title="Budget line" onClose={() => { setSelectedId(null); setRowSelection({}); }} hasSelection={!!selected}>
          {selected && (
            <>
              <DetailSummary title={selected.label} subtitle={selected.object_name} status={selected.status} statusClass={STATUS_TEXT[selected.status]} figure={money(selected.available, currency)} figureLabel="Left" />
              <DetailSection title="This year">
                <DetailGrid>
                  <DetailField label="Budget" value={money(selected.total, currency)} />
                  <DetailField label="Actual" value={money(selected.actual, currency)} />
                  <DetailField label="Committed" value={money(selected.committed, currency)} />
                  <DetailField label="Run-rate forecast" value={selected.forecast != null ? money(selected.forecast, currency) : '–'} />
                </DetailGrid>
              </DetailSection>
              <DetailSection title="Month by month">
                <ul className="space-y-1.5">
                  {(detail?.months ?? []).filter((m) => m.budget > 0 || m.actual > 0 || m.committed > 0).map((m) => {
                    const used = m.actual + m.committed;
                    const pct = m.budget > 0 ? (used / m.budget) * 100 : used > 0 ? 100 : 0;
                    return (
                      <li key={`${m.year}-${m.month}`} className="text-[12px]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="w-9 text-[var(--shell-text-muted)]">{m.label}</span>
                          <span className="flex-1 text-right tabular-nums text-[var(--shell-text)]">{plain(used, currency)} <span className="text-[var(--shell-text-muted)]">of {plain(m.budget, currency)}</span></span>
                        </div>
                        <UtilBar pct={pct} className="mt-1" />
                      </li>
                    );
                  })}
                  {detail && !detail.months.some((m) => m.budget > 0 || m.actual > 0 || m.committed > 0) && <li className="text-[12px] text-[var(--shell-text-muted)]">Nothing phased or spent yet.</li>}
                </ul>
              </DetailSection>
              <DetailSection title={`Alerts${detail?.alerts.length ? ` (${detail.alerts.length})` : ''}`}>
                {detail?.alerts.length ? (
                  <ul className="space-y-1.5">
                    {detail.alerts.map((a) => <li key={a.id} className="text-[13px]"><LevelText level={a.level} /> <span className="text-[var(--shell-text)]">{a.message}</span></li>)}
                  </ul>
                ) : <p className="text-[13px] text-[var(--shell-text-muted)]">No open alerts.</p>}
              </DetailSection>
              <DetailSection title="Latest expenses">
                {detail?.expenses.length ? (
                  <ul className="divide-y divide-[var(--shell-border)]">
                    {detail.expenses.slice(0, 8).map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                        <div className="min-w-0">
                          <IdCell value={e.reference_id} />
                          <p className="truncate text-[var(--shell-text-muted)]">{e.description || formatDate(e.date_recorded)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular-nums text-[var(--shell-text)]">{plain(e.amount, currency)}</p>
                          <StatusText status={e.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[13px] text-[var(--shell-text-muted)]">No expenses on this line yet.</p>}
              </DetailSection>
            </>
          )}
        </ModuleIntelligencePanel>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {data?.plan ? (
          <KpiStrip>
            <Kpi label="Approved budget" value={money(k?.approved, currency)} sub={data.plan.label} />
            <Kpi label="Actual" value={money(k?.actual, currency)} sub={k && k.approved > 0 ? `${Math.round((k.actual / k.approved) * 100)}% of budget` : undefined} />
            <Kpi label="Committed" value={money(k?.committed, currency)} sub="Submitted, not yet approved" />
            <Kpi label="Year-end forecast" value={money(k?.forecast, currency)} sub="At the current run-rate" tone={k && k.forecast > k.approved ? 'warning' : undefined} />
            <Kpi label="Open alerts" value={<Link href="/budget/alerts" className="hover:underline">{k?.open_alerts ?? 0}</Link>} />
          </KpiStrip>
        ) : null}
        {k && k.unbudgeted_count > 0 && (
          <p className="shrink-0 border-b border-[var(--shell-border)] px-4 py-2 text-[13px] text-[var(--warning)]">
            {k.unbudgeted_count} expense{k.unbudgeted_count === 1 ? '' : 's'} totalling {money(k.unbudgeted, currency)} match no budget line.
          </p>
        )}
        <div className="min-h-0 flex-1">
          <DataTable
            isLoading={isLoading} columns={columns} data={rows} tableInstance={table}
            emptyMessage={data && !data.plan ? `There is no budget plan for ${data.label}. Create one in the budget planner.` : 'No lines match these filters.'}
          />
        </div>
      </div>
    </ModuleShell>
  );
}
