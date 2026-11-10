'use client';

import { useMemo, useState } from 'react';
import { ColumnDef, getCoreRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import { useAuthStore } from '@/stores/auth-store';
import { useBuildCash, type CashMonth } from '@/hooks/use-build-orders';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField } from '@/components/shared/detail/detail-kit';
import { money } from '@/components/budgets/budget-ui';
import { downloadCsv, toCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';

const Num = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => (
  <div className={cn('text-right text-[13px] tabular-nums text-[var(--shell-text)]', strong && 'font-medium')}>{children}</div>
);
const signed = (x: number, currency: string) => `${x < 0 ? '-' : ''}${money(Math.abs(x), currency)}`;

// When money goes out and comes in across every live build order, month by month, with the material spend beside the E200 budget of those products
export function BuildCashView() {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const { data, isLoading } = useBuildCash();
  const [sorting, setSorting] = useState<SortingState>([]);
  const rows = data?.months ?? [];

  const columns = useMemo<ColumnDef<CashMonth, any>[]>(() => [
    { accessorKey: 'label', header: 'Month', cell: ({ row }) => <TextCell value={row.original.label} strong /> },
    { accessorKey: 'materials', header: headerRight('Parts arriving'), cell: ({ row }) => <Num>{row.original.materials ? money(row.original.materials, currency) : '—'}</Num>, size: 150 },
    { accessorKey: 'assembly', header: headerRight('Build'), cell: ({ row }) => <Num>{row.original.assembly ? money(row.original.assembly, currency) : '—'}</Num>, size: 130 },
    { accessorKey: 'spend', header: headerRight('Cash out'), cell: ({ row }) => <Num strong>{row.original.spend ? money(row.original.spend, currency) : '—'}</Num>, size: 130 },
    { accessorKey: 'revenue', header: headerRight('Sale in'), cell: ({ row }) => <Num strong>{row.original.revenue ? money(row.original.revenue, currency) : '—'}</Num>, size: 130 },
    { accessorKey: 'net', header: headerRight('Net'), cell: ({ row }) => <div className="text-right"><ToneText label={signed(row.original.net, currency)} tone={row.original.net < 0 ? 'warning' : row.original.net > 0 ? 'success' : 'muted'} /></div>, size: 130 },
    { accessorKey: 'cumulative', header: headerRight('Running net'), cell: ({ row }) => <Num>{signed(row.original.cumulative, currency)}</Num>, size: 140 },
    { accessorKey: 'budget_e200', header: headerRight('E200 budget'), cell: ({ row }) => <Num>{row.original.budget_e200 != null ? money(row.original.budget_e200, currency) : '—'}</Num>, size: 130 },
    {
      id: 'vs', header: headerRight('Parts vs budget'), size: 140,
      cell: ({ row }) => { const m = row.original; if (m.budget_e200 == null || (!m.materials && !m.budget_e200)) return <Num>—</Num>; const d = m.materials - m.budget_e200; return <div className="text-right"><ToneText label={d === 0 ? 'On budget' : `${d > 0 ? 'Over ' : 'Under '}${money(Math.abs(d), currency)}`} tone={d > 0 ? 'warning' : 'success'} /></div>; },
    },
  ], [currency]);

  const table = useDataTable({
    data: rows, columns, state: { sorting }, onSortingChange: setSorting, getRowId: (r) => `${r.year}-${r.month}`,
    getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  const spend = rows.reduce((a, m) => a + m.spend, 0); const inflow = rows.reduce((a, m) => a + m.revenue, 0);
  const worst = rows.reduce((w, m) => (m.cumulative < w.cumulative ? m : w), rows[0] ?? { cumulative: 0, label: '' } as CashMonth);
  const exportCash = () => downloadCsv('build-order-cash-timing.csv', toCsv(['month', 'parts_arriving', 'build', 'cash_out', 'sale_in', 'net', 'running_net', 'e200_budget'], rows.map((m) => [m.label, m.materials, m.assembly, m.spend, m.revenue, m.net, m.cumulative, m.budget_e200 ?? ''])));

  const summary = (
    <div className="space-y-4">
      <DetailSummary title="Cash timing" subtitle={`${data?.orders ?? 0} live order${data?.orders === 1 ? '' : 's'}`} figure={money(inflow - spend, currency)} figureLabel="Net over all months" />
      <DetailSection title="Over the open orders">
        <DetailGrid>
          <DetailField label="Cash out" value={money(spend, currency)} />
          <DetailField label="Sale in" value={money(inflow, currency)} />
          <DetailField label="Lowest running net" value={rows.length ? `${signed(worst.cumulative, currency)} in ${worst.label}` : undefined} tone={rows.length && worst.cumulative < 0 ? 'warning' : 'muted'} wide />
        </DetailGrid>
        {(data?.late_orders ?? 0) > 0 && <p className="text-[12px] text-[var(--danger)]">{data?.late_orders} order{data?.late_orders === 1 ? '' : 's'} cannot get the parts in time, so some money goes out after the sale.</p>}
      </DetailSection>
      <DetailSection title="How it is worked out">
        <p className="text-[12px] text-[var(--shell-text-muted)]">Every committed, released and in-build order is spread by month. Parts are paid in the month they arrive (the start date plus their lead time). The build is spread over the days of assembly. The sale comes in on the promised delivery date. Warranty is a provision, so it is left out.</p>
        <p className="text-[12px] text-[var(--shell-text-muted)]">The E200 budget is what the budget plan holds for materials and production on these products in that month. Parts arriving is set against it, so Finance can raise a budget change when a month is short.</p>
      </DetailSection>
    </div>
  );

  return (
    <ModuleShell
      searchRow={<DataTableToolbar table={table} onExport={exportCash} actions={<span className="text-[13px] text-[var(--shell-text-muted)]">Expected money in and out of the live orders, by month.</span>} />}
      intelligencePanel={<ModuleIntelligencePanel title="Cash timing" onClose={() => undefined} hasSelection={false} idle={summary}>{null}</ModuleIntelligencePanel>}
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage="No live orders have a BOM yet, so there is nothing to schedule." />
    </ModuleShell>
  );
}
