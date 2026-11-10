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
import { FolderOpen } from 'lucide-react';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { marginTone, plain, projectVerdict, TONE_CLASS, VERDICT_RANK } from '@/components/budgets/budget-ui';

const Whole = ({ value, currency }: { value: number | null; currency: string }) => (
  <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{value == null ? '—' : plain(value, currency)}</div>
);

const verdictOf = (r: ProjectRow, currency: string) =>
  projectVerdict({ estimate: r.estimate_total, spent: r.actual, margin: r.projected_margin_pct, target: r.target_margin_pct, min: r.min_margin_pct }, currency);

const spentPct = (r: ProjectRow) => (r.estimate_total ? (r.actual / r.estimate_total) * 100 : null);
const barColor = (p: number) => (p >= 100 ? 'var(--danger)' : p >= 80 ? 'var(--warning)' : 'var(--success)');

export default function ProjectBudgetsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const router = useRouter();
  const { data, isLoading } = useBudgetProjects();
  // Worst first, so the projects that need attention are at the top
  const [sorting, setSorting] = useState<SortingState>([{ id: 'verdict', desc: false }]);
  useEffect(() => { setHeader('Project costing','Estimate, margin and progress for each project'); }, [setHeader]);

  const columns = useMemo<ColumnDef<ProjectRow, any>[]>(() => [
    { accessorKey: 'code', header: 'Code', cell: ({ row }) => <IdCell value={row.original.code} />, size: 100 },
    { accessorKey: 'name', header: 'Project', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[220px] truncate" /> },
    { accessorKey: 'client_name', header: 'Client', cell: ({ row }) => <TextCell value={row.original.client_name} muted className="block max-w-[160px] truncate" /> },
    {
      id: 'verdict', header: 'Status', size: 120,
      accessorFn: (r) => VERDICT_RANK[verdictOf(r, currency).label],
      cell: ({ row }) => { const v = verdictOf(row.original, currency); return <span title={v.reason}><ToneText label={v.label} tone={v.tone} /></span>; },
    },
    {
      id: 'projected_margin_pct', header: headerRight('Margin'), size: 90, sortUndefined: 'last',
      accessorFn: (r) => r.projected_margin_pct ?? undefined,
      cell: ({ row }) => {
        const m = row.original.projected_margin_pct;
        return <div className="text-right"><ToneText label={m == null ? '' : `${m.toFixed(1)}%`} tone={marginTone(m, row.original.target_margin_pct, row.original.min_margin_pct)} /></div>;
      },
    },
    { id: 'estimate_total', header: headerRight('Estimate cost'), accessorFn: (r) => r.estimate_total ?? undefined, sortUndefined: 'last', cell: ({ row }) => <Whole value={row.original.estimate_total} currency={currency} />, size: 120 },
    { accessorKey: 'actual', header: headerRight('Spent'), cell: ({ row }) => <Whole value={row.original.actual} currency={currency} />, size: 110 },
    {
      id: 'spent_pct', header: headerRight('Of estimate'), size: 130, sortUndefined: 'last',
      accessorFn: (r) => spentPct(r) ?? undefined,
      cell: ({ row }) => {
        const p = spentPct(row.original);
        if (p == null) return <div className="text-right"><ToneText label="" /></div>;
        return (
          <div className="flex items-center justify-end gap-2">
            <div aria-hidden className="h-1.5 w-12 overflow-hidden rounded-md bg-[var(--shell-hover)]">
              <div className="h-full rounded-md" style={{ width: `${Math.min(p, 100)}%`, background: barColor(p) }} />
            </div>
            <span className="w-9 text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{Math.round(p)}%</span>
          </div>
        );
      },
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

  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const actions: DetailActionDef[] = selected ? [{ label: 'Open', variant: 'primary', icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(`/budget/projects/${selected.id}`) }] : [];

  const all = data ?? [];
  const baseline = (s: string | null) => (s === 'BASELINE' ? 'Approved' : s === 'PROPOSED' ? 'Proposed' : s ? 'Not proposed' : 'No estimate');
  const count = (label: string) => all.filter((r) => verdictOf(r, currency).label === label).length;
  const sum = (pick: (r: ProjectRow) => number | null) => all.reduce((a, r) => a + (pick(r) ?? 0), 0);
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="All projects" subtitle={`Spent ${plain(sum((r) => r.actual), currency)} of ${plain(sum((r) => r.estimate_total), currency)} estimated`} figure={all.length} figureLabel="Projects" />
      <DetailSection title="Where they stand">
        <DetailGrid>
          <DetailField label="At risk" value={count('At risk')} tone={count('At risk') ? 'danger' : 'muted'} />
          <DetailField label="Below target" value={count('Below target')} tone={count('Below target') ? 'warning' : 'muted'} />
          <DetailField label="On track" value={count('On track')} />
          <DetailField label="No estimate" value={count('No estimate')} />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="Totals">
        <DetailGrid>
          <DetailField label="Estimate cost" value={plain(sum((r) => r.estimate_total), currency)} />
          <DetailField label="Spent" value={plain(sum((r) => r.actual), currency)} />
          <DetailField label="Contract value" value={plain(sum((r) => r.contract_value), currency)} wide />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">At risk means the margin is below the minimum or the spend is over the estimate. Select a project, then Open it to build its estimate, baseline, milestones and earned value.</p>
    </div>
  );

  const sv = selected ? verdictOf(selected, currency) : null;
  const sp = selected ? spentPct(selected) : null;
  const panel = !selected || !sv ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.name} subtitle={`${selected.code ?? ''}${selected.client_name ? ` · ${selected.client_name}` : ''}`} status={sv.label}
        statusClass={TONE_CLASS[sv.tone]}
        figure={selected.contract_value != null ? plain(selected.contract_value, currency) : undefined} figureLabel="Contract value" />
      <p className="text-[13px] text-[var(--shell-text-muted)]">{sv.reason}</p>
      <DetailSection title="Cost and margin">
        <DetailGrid>
          <DetailField label="Margin" value={selected.projected_margin_pct != null ? `${selected.projected_margin_pct.toFixed(1)}%` : undefined} tone={marginTone(selected.projected_margin_pct, selected.target_margin_pct, selected.min_margin_pct)} />
          <DetailField label="Target margin" value={selected.target_margin_pct != null ? `${selected.target_margin_pct}%` : 'Not set'} />
          <DetailField label="Minimum margin" value={selected.min_margin_pct != null ? `${selected.min_margin_pct}%` : 'Not set'} />
          <DetailField label="Estimate cost" value={selected.estimate_total != null ? plain(selected.estimate_total, currency) : undefined} />
          <DetailField label="Spent" value={plain(selected.actual, currency)} />
          <DetailField label="Spent of estimate" value={sp != null ? `${Math.round(sp)}%` : undefined} />
          <DetailField label="Baseline" value={baseline(selected.estimate_status)} />
          <DetailField label="Risk" value={selected.risk_rating ? selected.risk_rating.charAt(0) + selected.risk_rating.slice(1).toLowerCase() : undefined} />
        </DetailGrid>
      </DetailSection>
      {selected.products.length > 0 && (
        <DetailSection title={`Products (${selected.products.length})`}>
          <ul className="space-y-1">
            {selected.products.map((p) => <li key={p.id} className="truncate text-[13px] text-[var(--shell-text)]">{p.code ? `${p.code} ` : ''}{p.name}</li>)}
          </ul>
        </DetailSection>
      )}
    </div>
  );

  return (
    <ModuleShell
      showPanel={!!selected}
      searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} actions={<ToolbarActions actions={actions} />} />}
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Project' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected}
          idle={summary} footer={actions.length ? <DetailActions actions={actions} /> : undefined}>
          {panel}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table}
        emptyMessage={client !== 'ALL' || product !== 'ALL' ? 'No projects match the filters. Clear a filter to see more.' : 'No projects yet.'} />
    </ModuleShell>
  );
}
