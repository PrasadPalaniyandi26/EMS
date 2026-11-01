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
import { IdCell, TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { plain } from '@/components/budgets/budget-ui';

const Whole = ({ value, currency }: { value: number | null; currency: string }) => (
  <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{value == null ? '—' : plain(value, currency)}</div>
);

export default function ProductCostingPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const router = useRouter();
  const { data, isLoading } = useBudgetProducts();
  const [sorting, setSorting] = useState<SortingState>([]);
  useEffect(() => { setHeader('Product costing', 'What each product costs to build, from its bill of materials'); }, [setHeader]);

  const columns = useMemo<ColumnDef<ProductRow, any>[]>(() => [
    { accessorKey: 'code', header: 'Code', cell: ({ row }) => <IdCell value={row.original.code} />, size: 100 },
    { accessorKey: 'name', header: 'Product', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[260px] truncate" /> },
    { accessorKey: 'client_name', header: 'Client', cell: ({ row }) => <TextCell value={row.original.client_name} muted /> },
    { accessorKey: 'bom_lines', header: headerRight('BOM lines'), cell: ({ row }) => <div className="text-right"><TextCell value={row.original.bom_lines || ''} /></div>, size: 100 },
    { accessorKey: 'rolled_cost', header: headerRight('Rolled-up cost'), cell: ({ row }) => <Whole value={row.original.rolled_cost} currency={currency} />, size: 130 },
    { accessorKey: 'standard_cost', header: headerRight('Planned cost'), cell: ({ row }) => <Whole value={row.original.standard_cost} currency={currency} />, size: 130 },
    {
      id: 'budget', header: 'Budget', size: 150,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.plan_status) return <ToneText label="No plan" tone="warning" />;
        return r.budget_line ? <ToneText label="Budgeted" tone="success" /> : <ToneText label="No budget line" tone="warning" />;
      },
    },
    {
      id: 'status', header: 'Costing', size: 170,
      cell: ({ row }) => {
        const r = row.original;
        if (r.standard_cost != null) {
          const newYear = r.standard_fy != null && r.standard_fy < r.fy;
          const drifted = r.rolled_cost != null && Math.abs(r.rolled_cost - r.standard_cost) > 0.5;
          return <ToneText label={newYear ? 'Re-cost for new year' : drifted ? 'Re-cost due' : 'Approved'} tone={newYear || drifted ? 'warning' : 'success'} />;
        }
        return <ToneText label={r.bom_lines ? 'Not approved' : 'No BOM'} tone="muted" />;
      },
    },
  ], [currency]);

  const table = useDataTable({
    data: data ?? [], columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  return (
    <ModuleShell searchRow={<DataTableToolbar table={table} actions={<span className="text-[13px] text-[var(--shell-text-muted)]">Open a product to build its BOM, build operations and build plan.</span>} />}>
      <DataTable isLoading={isLoading} columns={columns} data={data ?? []} tableInstance={table} onRowClick={(r) => router.push(`/budget/products/${r.id}`)} emptyMessage="No products yet." />
    </ModuleShell>
  );
}
