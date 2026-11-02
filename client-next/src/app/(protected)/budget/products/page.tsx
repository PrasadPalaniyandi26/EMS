'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useBudgetProducts, type ProductRow } from '@/hooks/use-planning-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { IdCell, TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { marginTone, plain } from '@/components/budgets/budget-ui';

// Where a product stands on its standard cost: approved, due to be done again, or not yet approved
const costStatus = (r: ProductRow): { label: string; tone: 'success' | 'warning' | 'muted' } => {
  if (r.standard_cost != null) {
    const newYear = r.standard_fy != null && r.standard_fy < r.fy;
    const drifted = r.rolled_cost != null && Math.abs(r.rolled_cost - r.standard_cost) > 0.5;
    return { label: newYear ? 'Re-cost for new year' : drifted ? 'Re-cost due' : 'Approved', tone: newYear || drifted ? 'warning' : 'success' };
  }
  return { label: r.bom_lines ? 'Not approved' : 'No BOM', tone: 'muted' };
};
const COST_STATUSES = ['Approved', 'Re-cost due', 'Re-cost for new year', 'Not approved', 'No BOM'];

const Whole = ({ value, currency }: { value: number | null; currency: string }) => (
  <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{value == null ? '—' : plain(value, currency)}</div>
);

export default function ProductCostingPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const router = useRouter();
  const { data, isLoading } = useBudgetProducts();
  const [sorting, setSorting] = useState<SortingState>([]);
  useEffect(() => { setHeader('Product costing', 'What each product costs to build, what it sells for and its margin'); }, [setHeader]);

  const columns = useMemo<ColumnDef<ProductRow, any>[]>(() => [
    { accessorKey: 'code', header: 'Code', cell: ({ row }) => <IdCell value={row.original.code} />, size: 100 },
    { accessorKey: 'name', header: 'Product', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[260px] truncate" /> },
    { accessorKey: 'client_name', header: 'Client', cell: ({ row }) => <TextCell value={row.original.client_name} muted /> },
    { accessorKey: 'bom_lines', header: headerRight('BOM lines'), cell: ({ row }) => <div className="text-right"><TextCell value={row.original.bom_lines || ''} /></div>, size: 100 },
    { accessorKey: 'rolled_cost', header: headerRight('Rolled-up cost'), cell: ({ row }) => <Whole value={row.original.rolled_cost} currency={currency} />, size: 130 },
    { accessorKey: 'standard_cost', header: headerRight('Standard cost'), cell: ({ row }) => <Whole value={row.original.standard_cost} currency={currency} />, size: 130 },
    { accessorKey: 'selling_price', header: headerRight('Selling price'), cell: ({ row }) => <Whole value={row.original.selling_price} currency={currency} />, size: 130 },
    {
      accessorKey: 'margin_pct', header: headerRight('Margin'), size: 100,
      cell: ({ row }) => { const m = row.original.margin_pct; return <div className="text-right"><ToneText label={m == null ? '—' : `${m.toFixed(1)}%`} tone={marginTone(m, row.original.target_margin_pct, row.original.min_margin_pct)} /></div>; },
    },
    {
      id: 'budget', header: 'Budget plan', size: 150,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.plan_status) return <ToneText label="No budget plan" tone="warning" />;
        return r.budget_line ? <ToneText label="In budget plan" tone="success" /> : <ToneText label="Not in budget plan" tone="warning" />;
      },
    },
    {
      id: 'status', header: 'Cost status', size: 170, accessorFn: (r) => costStatus(r).label,
      cell: ({ row }) => { const s = costStatus(row.original); return <ToneText label={s.label} tone={s.tone} />; },
    },
  ], [currency]);

  const [client, setClient] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const clients = useMemo(() => [...new Set((data ?? []).map((r) => r.client_name).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b)), [data]);
  const rows = useMemo(() => (data ?? []).filter((r) => (client === 'ALL' || r.client_name === client) && (status === 'ALL' || costStatus(r).label === status)), [data, client, status]);
  const filterDefs: FilterDef[] = [
    { id: 'client', label: 'Client', value: client, onChange: setClient, options: [{ value: 'ALL', label: 'All clients' }, ...clients.map((c) => ({ value: c, label: c }))] },
    { id: 'status', label: 'Cost status', value: status, onChange: setStatus, options: [{ value: 'ALL', label: 'All cost statuses' }, ...COST_STATUSES.map((s) => ({ value: s, label: s }))] },
  ];

  const table = useDataTable({
    data: rows, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  return (
    <ModuleShell searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} actions={<span className="text-[13px] text-[var(--shell-text-muted)]">Open a product to build its BOM, standard cost, build plan and margin.</span>} />}>
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} onRowClick={(r) => router.push(`/budget/products/${r.id}`)} emptyMessage="No products yet." />
    </ModuleShell>
  );
}
