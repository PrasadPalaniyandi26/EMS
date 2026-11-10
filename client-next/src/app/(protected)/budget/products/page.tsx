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
import { FolderOpen } from 'lucide-react';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { marginAtCost, marginTone, plain, productVerdict, PRODUCT_VERDICT_RANK, TONE_CLASS } from '@/components/budgets/budget-ui';

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
  // Worst first, so the products that need attention are at the top
  const [sorting, setSorting] = useState<SortingState>([{ id: 'verdict', desc: false }]);
  useEffect(() => { setHeader('Product costing', 'What each product costs to build, what it sells for and its margin'); }, [setHeader]);

  const columns = useMemo<ColumnDef<ProductRow, any>[]>(() => [
    { accessorKey: 'code', header: 'Code', cell: ({ row }) => <IdCell value={row.original.code} />, size: 100 },
    { accessorKey: 'name', header: 'Product', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[200px] truncate" />, size: 210 },
    { accessorKey: 'client_name', header: 'Client', cell: ({ row }) => <TextCell value={row.original.client_name} muted className="block max-w-[150px] truncate" />, size: 160 },
    // Only the cost status here; the verdict (below minimum, no price…) is on the side panel
    {
      id: 'status', header: 'Cost status', size: 150, accessorFn: (r) => costStatus(r).label,
      cell: ({ row }) => { const s = costStatus(row.original); return <ToneText label={s.label} tone={s.tone} />; },
    },
    // Hidden: the verdict still drives the default sort, worst first
    { id: 'verdict', header: 'Verdict', accessorFn: (r) => PRODUCT_VERDICT_RANK[productVerdict(r).label], cell: () => null, enableHiding: true },
    {
      accessorKey: 'margin_pct', header: headerRight('Margin'), size: 90, sortUndefined: 'last',
      cell: ({ row }) => { const m = row.original.margin_pct; return <div className="text-right"><ToneText label={m == null ? '—' : `${m.toFixed(1)}%`} tone={marginTone(m, row.original.target_margin_pct, row.original.min_margin_pct)} /></div>; },
    },
    {
      id: 'margin_now', header: headerRight('At current cost'), size: 110, sortUndefined: 'last',
      accessorFn: (r) => marginAtCost(r.selling_price, r.rolled_cost) ?? undefined,
      cell: ({ row }) => { const m = marginAtCost(row.original.selling_price, row.original.rolled_cost); return <div className="text-right"><ToneText label={m == null ? '—' : `${m.toFixed(1)}%`} tone={marginTone(m, row.original.target_margin_pct, row.original.min_margin_pct)} /></div>; },
    },
    { accessorKey: 'standard_cost', header: headerRight('Standard cost'), cell: ({ row }) => <Whole value={row.original.standard_cost} currency={currency} />, size: 110 },
    { accessorKey: 'selling_price', header: headerRight('Selling price'), cell: ({ row }) => <Whole value={row.original.selling_price} currency={currency} />, size: 110 },
  ], [currency]);

  const [client, setClient] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const clients = useMemo(() => [...new Set((data ?? []).map((r) => r.client_name).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b)), [data]);
  const rows = useMemo(() => (data ?? []).filter((r) => (client === 'ALL' || r.client_name === client) && (status === 'ALL' || costStatus(r).label === status)), [data, client, status]);
  const filterDefs: FilterDef[] = [
    { id: 'client', label: 'Client', value: client, onChange: setClient, options: [{ value: 'ALL', label: 'All clients' }, ...clients.map((c) => ({ value: c, label: c }))] },
    { id: 'status', label: 'Cost status', value: status, onChange: setStatus, options: [{ value: 'ALL', label: 'All cost statuses' }, ...COST_STATUSES.map((s) => ({ value: s, label: s }))] },
  ];

  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection, columnVisibility: { verdict: false } }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const actions: DetailActionDef[] = selected ? [{ label: 'Open', variant: 'primary', icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(`/budget/products/${selected.id}`) }] : [];

  const all = data ?? [];
  const vcount = (...labels: string[]) => all.filter((r) => labels.includes(productVerdict(r).label)).length;
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="All products" subtitle="Standard cost, price and margin of each product" figure={all.length} figureLabel="Products" />
      <DetailSection title="Where they stand">
        <DetailGrid>
          <DetailField label="Below minimum margin" value={vcount('Loss', 'Below minimum')} tone={vcount('Loss', 'Below minimum') ? 'danger' : 'muted'} />
          <DetailField label="Below target" value={vcount('Below target')} tone={vcount('Below target') ? 'warning' : 'muted'} />
          <DetailField label="On target" value={vcount('On target')} />
          <DetailField label="No price or BOM" value={vcount('No price', 'No BOM')} />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="Cost status">
        <DetailGrid>
          {COST_STATUSES.map((s) => <DetailField key={s} label={s} value={all.filter((r) => costStatus(r).label === s).length} />)}
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Margin is judged at the standard cost and at today's cost, whichever is worse.</p>
    </div>
  );

  const cs = selected ? costStatus(selected) : null;
  const sv = selected ? productVerdict(selected) : null;
  const nowMargin = selected ? marginAtCost(selected.selling_price, selected.rolled_cost) : null;
  const panel = !selected || !cs || !sv ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.name} subtitle={`${selected.code ?? ''}${selected.client_name ? ` · ${selected.client_name}` : ''}`} status={sv.label}
        statusClass={TONE_CLASS[sv.tone]}
        figure={selected.standard_cost != null ? plain(selected.standard_cost, currency) : selected.rolled_cost != null ? plain(selected.rolled_cost, currency) : undefined}
        figureLabel={selected.standard_cost != null ? 'Standard cost' : 'Rolled-up cost'} />
      <p className="text-[13px] text-[var(--shell-text-muted)]">{sv.reason}</p>
      <DetailSection title="Cost and margin">
        <DetailGrid>
          <DetailField label="Rolled-up cost" value={selected.rolled_cost != null ? plain(selected.rolled_cost, currency) : undefined} />
          <DetailField label="Standard cost" value={selected.standard_cost != null ? plain(selected.standard_cost, currency) : undefined} />
          <DetailField label="Selling price" value={selected.selling_price != null ? plain(selected.selling_price, currency) : undefined} />
          <DetailField label="Margin at standard" value={selected.margin_pct != null ? `${selected.margin_pct.toFixed(1)}%` : undefined} tone={marginTone(selected.margin_pct, selected.target_margin_pct, selected.min_margin_pct)} />
          <DetailField label="Margin at current cost" value={nowMargin != null ? `${nowMargin.toFixed(1)}%` : undefined} tone={marginTone(nowMargin, selected.target_margin_pct, selected.min_margin_pct)} />
          <DetailField label="Cost status" value={cs.label} tone={cs.tone === 'warning' ? 'warning' : 'muted'} />
          <DetailField label="Target margin" value={selected.target_margin_pct != null ? `${selected.target_margin_pct}%` : 'Not set'} />
          <DetailField label="Minimum margin" value={selected.min_margin_pct != null ? `${selected.min_margin_pct}%` : 'Not set'} />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="BOM and plan">
        <DetailGrid>
          <DetailField label="BOM lines" value={selected.bom_lines} />
          <DetailField label="Year" value={`${selected.fy}-${String(selected.fy + 1).slice(2)}`} />
          <DetailField label="Budget plan" value={!selected.plan_status ? 'No budget plan' : selected.budget_line ? 'In budget plan' : 'Not in budget plan'} wide />
        </DetailGrid>
      </DetailSection>
    </div>
  );

  return (
    <ModuleShell
      showPanel={!!selected}
      searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} actions={<ToolbarActions actions={actions} />} />}
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Product' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected}
          idle={summary} footer={actions.length ? <DetailActions actions={actions} /> : undefined}>
          {panel}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage="No products yet." />
    </ModuleShell>
  );
}
