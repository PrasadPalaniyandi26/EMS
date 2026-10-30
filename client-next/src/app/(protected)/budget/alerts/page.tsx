'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import { useHeaderStore } from '@/stores/header-store';
import { useBudgetAlerts, type AlertLevel, type BudgetAlert } from '@/hooks/use-budget-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { DateCell, TextCell } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { NativeSelect } from '@/components/shared/modal-primitives';
import { Kpi, KpiStrip, LevelText } from '@/components/budgets/budget-ui';

const ACTIONS: Record<string, { label: string; href: (a: BudgetAlert) => string }> = {
  open_line: { label: 'Open line', href: () => '/budget/monitor' },
  view_expenses: { label: 'See in monitor', href: () => '/budget/monitor' },
  open_plan: { label: 'Open planner', href: () => '/budget/planner' },
  open_approvals: { label: 'Open approvals', href: () => '/approvals' },
};

const LEVEL_ORDER: Record<AlertLevel, number> = { CRITICAL: 4, WARNING: 3, CAUTION: 2, INFO: 1 };

export default function BudgetAlertsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const router = useRouter();
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  const [level, setLevel] = useState<'ALL' | AlertLevel>('ALL');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'level', desc: true }]);
  const { data, isLoading } = useBudgetAlerts(status);

  useEffect(() => { setHeader('Budget alerts', 'Where spending needs attention'); }, [setHeader]);

  const all = data ?? [];
  const rows = useMemo(() => all.filter((a) => level === 'ALL' || a.level === level), [all, level]);
  const count = (l: AlertLevel) => all.filter((a) => a.level === l && a.status === 'OPEN').length;

  const columns = useMemo<ColumnDef<BudgetAlert, any>[]>(() => [
    { id: 'level', accessorFn: (a) => LEVEL_ORDER[a.level], header: 'Level', cell: ({ row }) => <LevelText level={row.original.level} />, size: 90 },
    {
      id: 'line', accessorFn: (a) => a.line_label ?? a.rule_name, header: 'Line',
      cell: ({ row }) => (
        <div className="min-w-0">
          <TextCell value={row.original.line_label ?? row.original.rule_name} strong className="block max-w-[260px] truncate" />
          {row.original.line_label && <span className="block text-[12px] text-[var(--shell-text-muted)]">{row.original.rule_name}{row.original.strict ? ' · strict' : ''}</span>}
        </div>
      ),
    },
    { accessorKey: 'message', header: 'What happened', cell: ({ row }) => <TextCell value={row.original.message} className="block max-w-[460px] truncate" /> },
    { accessorKey: 'opened_at', header: 'Opened', cell: ({ row }) => <DateCell value={row.original.opened_at} />, size: 110 },
    {
      id: 'action', header: 'Suggested action', size: 150, enableSorting: false,
      cell: ({ row }) => {
        const a = row.original;
        if (a.status === 'RESOLVED') return <TextCell value="Resolved" muted />;
        const act = a.action ? ACTIONS[a.action] : null;
        return act ? (
          <button type="button" className="btn-action !h-7" onClick={(e) => { e.stopPropagation(); router.push(act.href(a)); }}>{act.label}</button>
        ) : <TextCell value="" />;
      },
    },
  ], [router]);

  const table = useDataTable({
    data: rows, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  return (
    <ModuleShell
      searchRow={
        <DataTableToolbar
          table={table}
          actions={
            <>
              <NativeSelect aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value as 'ALL' | AlertLevel)} className="!h-8 !w-auto">
                <option value="ALL">Any level</option>
                <option value="CRITICAL">Critical</option>
                <option value="WARNING">Warning</option>
                <option value="CAUTION">Caution</option>
                <option value="INFO">Info</option>
              </NativeSelect>
              <NativeSelect aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value as 'OPEN' | 'RESOLVED' | 'ALL')} className="!h-8 !w-auto">
                <option value="OPEN">Open alerts</option>
                <option value="RESOLVED">Resolved</option>
                <option value="ALL">Open and resolved</option>
              </NativeSelect>
            </>
          }
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <KpiStrip>
          <Kpi label="Critical" value={count('CRITICAL')} tone={count('CRITICAL') ? 'danger' : undefined} />
          <Kpi label="Warning" value={count('WARNING')} tone={count('WARNING') ? 'warning' : undefined} />
          <Kpi label="Caution" value={count('CAUTION')} />
          <Kpi label="Info" value={count('INFO')} />
        </KpiStrip>
        <p className="shrink-0 border-b border-[var(--shell-border)] px-4 py-2 text-[12px] text-[var(--shell-text-muted)]">
          One alert per rule and line: if a warning gets worse the same row escalates, and rows close themselves when the condition clears.
        </p>
        <div className="min-h-0 flex-1">
          <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={status === 'OPEN' ? 'No open alerts. Spending is within its budgets.' : 'Nothing to show.'} />
        </div>
      </div>
    </ModuleShell>
  );
}
