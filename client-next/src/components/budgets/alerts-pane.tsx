'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import { useBudgetAlerts, type AlertLevel, type BudgetAlert } from '@/hooks/use-budget-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { DateCell, TextCell } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { Kpi, KpiStrip, LevelText } from '@/components/budgets/budget-ui';
import { formatDate } from '@/lib/currency';

// Where an alert sends you, and what the button says
const ACTIONS: Record<string, { label: string; href: string; why: string }> = {
  open_line: { label: 'Open line', href: '/budget/monitor?tab=lines', why: 'Look at the line, its expenses and its forecast.' },
  view_expenses: { label: 'See lines', href: '/budget/monitor?tab=lines', why: 'See which expenses are using the line.' },
  open_plan: { label: 'Open planner', href: '/budget/planner', why: 'Change the budget or move money between lines.' },
  open_stock: { label: 'Open stock register', href: '/budget/stock', why: 'See which parts to buy again.' },
  open_approvals: { label: 'Open approvals', href: '/approvals', why: 'Approve or send back the expenses that are waiting.' },
};

const LEVEL_ORDER: Record<AlertLevel, number> = { CRITICAL: 4, WARNING: 3, CAUTION: 2, INFO: 1 };

// Where spending needs attention: one alert per rule and line. Select a row to read it, then open where to act on it.
export function AlertsPane() {
  const router = useRouter();
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  const [level, setLevel] = useState<'ALL' | AlertLevel>('ALL');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'level', desc: true }]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const { data, isLoading } = useBudgetAlerts(status);

  const all = data ?? [];
  const rows = useMemo(() => all.filter((a) => level === 'ALL' || a.level === level), [all, level]);
  const count = (l: AlertLevel) => all.filter((a) => a.level === l && a.status === 'OPEN').length;

  const columns = useMemo<ColumnDef<BudgetAlert, any>[]>(() => [
    { id: 'level', accessorFn: (a) => LEVEL_ORDER[a.level], header: 'Level', cell: ({ row }) => <LevelText level={row.original.level} />, size: 90 },
    {
      id: 'line', accessorFn: (a) => a.line_label ?? a.rule_name, header: 'Line', size: 210,
      cell: ({ row }) => (
        <div className="min-w-0">
          <TextCell value={row.original.line_label ?? row.original.rule_name} strong className="block max-w-[190px] truncate" />
          {row.original.line_label && <span className="block max-w-[190px] truncate text-[12px] text-[var(--shell-text-muted)]">{row.original.rule_name}</span>}
        </div>
      ),
    },
    { accessorKey: 'message', header: 'What happened', cell: ({ row }) => <TextCell value={row.original.message} className="block max-w-[360px] truncate" /> },
    { accessorKey: 'opened_at', header: 'Opened', cell: ({ row }) => <DateCell value={row.original.opened_at} />, size: 110 },
    { accessorKey: 'status', header: 'Status', size: 90, cell: ({ row }) => <TextCell value={row.original.status === 'OPEN' ? 'Open' : 'Resolved'} muted={row.original.status !== 'OPEN'} strong={row.original.status === 'OPEN'} /> },
  ], []);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((a) => String(a.id) === Object.keys(selection)[0]) ?? null;
  const act = selected?.action ? ACTIONS[selected.action] : undefined;
  const actions: DetailActionDef[] = act ? [{ label: act.label, variant: 'primary', icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(act.href) }] : [];

  const summary = (
    <div className="space-y-4">
      <DetailSummary title="Open alerts" subtitle="Spending that needs a look" figure={all.filter((a) => a.status === 'OPEN').length} figureLabel="Open" />
      <DetailSection title="By level">
        <DetailGrid>
          <DetailField label="Critical" value={count('CRITICAL')} tone={count('CRITICAL') ? 'danger' : 'muted'} />
          <DetailField label="Warning" value={count('WARNING')} tone={count('WARNING') ? 'warning' : 'muted'} />
          <DetailField label="Caution" value={count('CAUTION')} />
          <DetailField label="Info" value={count('INFO')} />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Rows close themselves when the condition clears.</p>
    </div>
  );

  const detail = selected && (
    <div className="space-y-4">
      <DetailSummary title={selected.line_label ?? selected.rule_name} subtitle={selected.line_label ? selected.rule_name : undefined}
        status={selected.status === 'OPEN' ? 'Open' : 'Resolved'} statusClass={selected.status === 'OPEN' ? 'text-[var(--warning)]' : 'text-[var(--shell-text-muted)]'} />
      <DetailSection title="What happened">
        <p className="text-[13px] text-[var(--shell-text)]">{selected.message}</p>
        <LevelText level={selected.level} />
      </DetailSection>
      <DetailSection title="Details">
        <DetailGrid>
          <DetailField label="Opened" value={formatDate(selected.opened_at)} />
          <DetailField label="Resolved" value={selected.resolved_at ? formatDate(selected.resolved_at) : '–'} />
          {selected.strict && <DetailField label="Strict" value="Yes, blocks at the limit" wide />}
        </DetailGrid>
      </DetailSection>
      {act && selected.status === 'OPEN' && (
        <DetailSection title="Next step">
          <p className="text-[13px] text-[var(--shell-text)]">{act.why}</p>
        </DetailSection>
      )}
    </div>
  );

  return (
    <ModuleShell
      showPanel={!!selected}
      panelOnSelect
      searchRow={
        <DataTableToolbar
          table={table}
          actions={<ToolbarActions actions={actions} />}
          filterDefs={[
            { id: 'level', label: 'Level', value: level, onChange: (v) => { setLevel(v as 'ALL' | AlertLevel); setSelection({}); }, options: [{ value: 'ALL', label: 'Any level' }, { value: 'CRITICAL', label: 'Critical' }, { value: 'WARNING', label: 'Warning' }, { value: 'CAUTION', label: 'Caution' }, { value: 'INFO', label: 'Info' }] },
            { id: 'status', label: 'Show', value: status, onChange: (v) => { setStatus(v as 'OPEN' | 'RESOLVED' | 'ALL'); setSelection({}); }, options: [{ value: 'OPEN', label: 'Open alerts' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'ALL', label: 'Open and resolved' }] },
          ]}
        />
      }
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Alert' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected} idle={summary}
          footer={actions.length ? <DetailActions actions={actions} /> : undefined}>
          {detail}
        </ModuleIntelligencePanel>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <KpiStrip>
          <Kpi label="Critical" value={count('CRITICAL')} tone={count('CRITICAL') ? 'danger' : undefined} />
          <Kpi label="Warning" value={count('WARNING')} tone={count('WARNING') ? 'warning' : undefined} />
          <Kpi label="Caution" value={count('CAUTION')} />
          <Kpi label="Info" value={count('INFO')} />
        </KpiStrip>
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} fullHeight emptyMessage={status === 'OPEN' ? 'No open alerts. Spending is within its budgets.' : 'Nothing to show.'} />
        </div>
      </div>
    </ModuleShell>
  );
}
