'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useBudgetProjects, type ProjectRow } from '@/hooks/use-planning-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { IdCell, TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { marginTone, plain } from '@/components/budgets/budget-ui';

const Whole = ({ value, currency }: { value: number | null; currency: string }) => (
  <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{value == null ? '—' : plain(value, currency)}</div>
);

export default function ProjectBudgetsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const router = useRouter();
  const { data, isLoading } = useBudgetProjects();
  const [sorting, setSorting] = useState<SortingState>([]);
  useEffect(() => { setHeader('Project costing','Estimate, margin and progress for each project'); }, [setHeader]);

  const columns = useMemo<ColumnDef<ProjectRow, any>[]>(() => [
    { accessorKey: 'code', header: 'Code', cell: ({ row }) => <IdCell value={row.original.code} />, size: 100 },
    { accessorKey: 'name', header: 'Project', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[260px] truncate" /> },
    { accessorKey: 'client_name', header: 'Client', cell: ({ row }) => <TextCell value={row.original.client_name} muted /> },
    { id: 'products', header: 'Product', accessorFn: (r) => (r.products.length ? 'Yes' : 'No'), cell: ({ row }) => <TextCell value={row.original.products.length ? 'Yes' : 'No'} muted />, size: 90 },
    { accessorKey: 'contract_value', header: headerRight('Contract value'), cell: ({ row }) => <Whole value={row.original.contract_value} currency={currency} />, size: 130 },
    { accessorKey: 'estimate_total', header: headerRight('Estimate cost'), cell: ({ row }) => <Whole value={row.original.estimate_total} currency={currency} />, size: 120 },
    { accessorKey: 'actual', header: headerRight('Spent'), cell: ({ row }) => <Whole value={row.original.actual} currency={currency} />, size: 110 },
    {
      accessorKey: 'projected_margin_pct', header: headerRight('Margin'), size: 100,
      cell: ({ row }) => {
        const m = row.original.projected_margin_pct;
        if (m == null) return <div className="text-right"><TextCell value="" /></div>;
        return <div className="text-right"><ToneText label={`${m.toFixed(1)}%`} tone={marginTone(m, row.original.target_margin_pct, row.original.min_margin_pct)} /></div>;
      },
    },
    { accessorKey: 'risk_rating', header: 'Risk', cell: ({ row }) => <TextCell value={row.original.risk_rating ? row.original.risk_rating.charAt(0) + row.original.risk_rating.slice(1).toLowerCase() : ''} muted />, size: 90 },
    {
      accessorKey: 'estimate_status', header: 'Baseline', size: 120,
      cell: ({ row }) => <ToneText label={row.original.estimate_status === 'BASELINE' ? 'Approved' : row.original.estimate_status === 'PROPOSED' ? 'Proposed' : row.original.estimate_status ? 'Not proposed' : 'No estimate'} tone={row.original.estimate_status === 'BASELINE' ? 'success' : row.original.estimate_status === 'PROPOSED' ? 'warning' : 'muted'} />,
    },
  ], [currency]);

  const [client, setClient] = useState('ALL');
  const [product, setProduct] = useState('ALL');
  const clients = useMemo(() => [...new Set((data ?? []).map((r) => r.client_name).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b)), [data]);
  const rows = useMemo(() => (data ?? []).filter((r) =>
    (client === 'ALL' || r.client_name === client) &&
    (product === 'ALL' || (product === 'YES') === (r.products.length > 0))), [data, client, product]);
  const filterDefs: FilterDef[] = [
    { id: 'client', label: 'Client', value: client, onChange: setClient, options: [{ value: 'ALL', label: 'All clients' }, ...clients.map((c) => ({ value: c, label: c }))] },
    { id: 'product', label: 'Product', placeholder: 'Product', value: product, onChange: setProduct, options: [{ value: 'ALL', label: 'All' }, { value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }] },
  ];

  const table = useDataTable({
    data: rows, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  return (
    <ModuleShell searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} actions={<span className="text-[13px] text-[var(--shell-text-muted)]">Open a project to build its estimate, baseline, milestones and earned value.</span>} />}>
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} onRowClick={(r) => router.push(`/budget/projects/${r.id}`)} emptyMessage="No projects yet." />
    </ModuleShell>
  );
}
