'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Lock, Unlock, MessageSquarePlus } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { useMonthClose, type CloseLine } from '@/hooks/use-planning-queries';
import { MONTH_NAMES } from '@/hooks/use-budget-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog, NativeSelect } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { VARIANCE_REASONS, VarianceModal } from '@/components/budgets/planning-modals';
import { money } from '@/components/budgets/budget-ui';
import { formatDate } from '@/lib/currency';
import { cn } from '@/lib/utils';

const Num = ({ children, strong, tone }: { children: React.ReactNode; strong?: boolean; tone?: string }) => (
  <div className={cn('text-right text-[13px] tabular-nums', tone ?? 'text-[var(--shell-text)]', strong && 'font-medium')}>{children}</div>
);
const reasonText = (l: CloseLine) => l.note ? `${VARIANCE_REASONS.find((r) => r.value === l.note!.reason_code)?.label ?? l.note.reason_code}${l.note.comment ? `: ${l.note.comment}` : ''}` : '';

export default function MonthlyClosePage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const role = (user?.role_name || '').toUpperCase();
  const isFinance = role === 'ADMIN' || role === 'FINANCE';
  const invalidate = useInvalidate();
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [year, setYear] = useState(prev.getFullYear());
  const [month, setMonth] = useState(prev.getMonth() + 1);
  const { data, isLoading } = useMonthClose(year, month);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [line, setLine] = useState<CloseLine | null>(null);
  const [lockOpen, setLockOpen] = useState(false); const [unlockOpen, setUnlockOpen] = useState(false);
  useEffect(() => { setHeader('Monthly close', 'Explain the variances, then close the month'); }, [setHeader]);

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const lines = data?.lines ?? [];
  const missing = lines.filter((l) => l.needs_note && !l.note).length;
  const act = async (job: () => Promise<unknown>, ok: string) => { try { await job(); toast.success(ok); invalidate('budgets'); } catch (e: any) { toast.error(e?.message || 'Could not complete that.'); } };

  const columns = useMemo<ColumnDef<CloseLine, any>[]>(() => [
    { accessorKey: 'label', header: 'Line', cell: ({ row }) => <TextCell value={row.original.label} strong className="block max-w-[300px] truncate" /> },
    { accessorKey: 'owner_name', header: 'Owner', cell: ({ row }) => <TextCell value={row.original.owner_name} muted />, size: 140 },
    { accessorKey: 'budget', header: headerRight('Budget'), cell: ({ row }) => <Num>{money(row.original.budget, currency)}</Num>, size: 120 },
    { accessorKey: 'actual', header: headerRight('Actual'), cell: ({ row }) => <Num>{money(row.original.actual, currency)}</Num>, size: 120 },
    { accessorKey: 'variance', header: headerRight('Variance'), cell: ({ row }) => <Num strong tone={row.original.variance < 0 ? 'text-[var(--warning)]' : undefined}>{row.original.variance < 0 ? '-' : ''}{money(Math.abs(row.original.variance), currency)}</Num>, size: 120 },
    { id: 'reason', header: 'Reason', cell: ({ row }) => row.original.note ? <TextCell value={reasonText(row.original)} className="block max-w-[320px] truncate" /> : row.original.needs_note ? <ToneText label="Reason needed" tone="warning" /> : <TextCell value="" /> },
  ], [currency]);

  const table = useDataTable({
    data: lines, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.line_id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = lines.find((l) => String(l.line_id) === Object.keys(selection)[0]) ?? null;
  const itemActions: DetailActionDef[] = selected && !data?.locked && (selected.needs_note || selected.note)
    ? [{ label: selected.note ? 'Edit reason' : 'Explain', variant: 'primary', icon: <MessageSquarePlus className="h-4 w-4 text-[var(--info)]" />, onClick: () => setLine(selected) }] : [];
  const alwaysActions: DetailActionDef[] = data?.locked
    ? (role === 'ADMIN' ? [{ label: 'Reopen month', icon: <Unlock className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setUnlockOpen(true) }] : [])
    : (data?.plan && isFinance ? [{ label: 'Close month', icon: <Lock className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setLockOpen(true) }] : []);

  const over = (data?.totals?.actual ?? 0) > (data?.totals?.budget ?? 0);
  const summary = (
    <div className="space-y-4">
      <DetailSummary title={`${MONTH_NAMES[month - 1]} ${year}`} subtitle={data?.plan?.label ?? 'No budget plan for this month'}
        status={data?.locked ? `Closed by ${data.lock?.locked_by_name}, ${data.lock ? formatDate(data.lock.locked_at) : ''}` : data?.plan ? 'Open' : undefined}
        statusClass={data?.locked ? 'text-[var(--success)]' : 'text-[var(--shell-text-muted)]'} figure={money((data?.totals?.budget ?? 0) - (data?.totals?.actual ?? 0), currency)} figureLabel={over ? 'Over budget' : 'Under budget'} />
      <DetailSection title="Month">
        <DetailGrid>
          <DetailField label="Budget" value={money(data?.totals?.budget, currency)} />
          <DetailField label="Spent and committed" value={money(data?.totals?.actual, currency)} />
          <DetailField label="Reasons still needed" value={missing} tone={missing ? 'warning' : 'muted'} wide />
        </DetailGrid>
        <p className="text-[12px] text-[var(--shell-text-muted)]">A reason is needed for lines over by more than 10% and ₹10,000.</p>
      </DetailSection>
      {(data?.locks.length ?? 0) > 0 && (
        <DetailSection title="Closed months">
          <p className="text-[12px] text-[var(--shell-text-muted)]">{data!.locks.map((x) => `${MONTH_NAMES[x.month - 1].slice(0, 3)} ${x.year}`).join(', ')}. New expenses cannot be dated in a closed month.</p>
        </DetailSection>
      )}
    </div>
  );

  const detail = !selected ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.label} subtitle={selected.owner_name ? `Owner ${selected.owner_name}` : undefined}
        status={selected.needs_note && !selected.note ? 'Reason needed' : undefined} statusClass="text-[var(--warning)]"
        figure={`${selected.variance < 0 ? '-' : ''}${money(Math.abs(selected.variance), currency)}`} figureLabel="Variance" />
      <DetailSection title="Month">
        <DetailGrid>
          <DetailField label="Budget" value={money(selected.budget, currency)} />
          <DetailField label="Actual" value={money(selected.actual, currency)} />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="Reason">
        <p className="text-[13px] text-[var(--shell-text)]">{selected.note ? <>{reasonText(selected)}{selected.note.author_name && <span className="block text-[12px] text-[var(--shell-text-muted)]">{selected.note.author_name}</span>}</> : <span className="text-[var(--shell-text-muted)]">None recorded.</span>}</p>
      </DetailSection>
    </div>
  );

  return (
    <>
      <ModuleShell
        showPanel={!!selected}
        searchRow={
          <DataTableToolbar table={table} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>}
            filters={<>
              <NativeSelect aria-label="Month" value={month} onChange={(e) => { setMonth(Number(e.target.value)); setSelection({}); }} className="!h-8 !w-auto">
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </NativeSelect>
              <NativeSelect aria-label="Year" value={year} onChange={(e) => { setYear(Number(e.target.value)); setSelection({}); }} className="!h-8 !w-auto">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </NativeSelect>
            </>} />
        }
        intelligencePanel={
          <ModuleIntelligencePanel title={selected ? 'Budget line' : 'Monthly close'} onClose={() => setSelection({})} hasSelection={!!selected}
            idle={summary} footer={itemActions.length ? <DetailActions actions={itemActions} /> : undefined}>
            {detail}
          </ModuleIntelligencePanel>
        }
      >
        <DataTable isLoading={isLoading} columns={columns} data={lines} tableInstance={table} emptyMessage={data && !data.plan ? 'There is no budget plan for this month.' : 'No lines in this plan.'} />
      </ModuleShell>

      <VarianceModal isOpen={!!line} onClose={() => { setLine(null); setSelection({}); }} line={line} year={year} month={month} />
      <ConfirmDialog open={lockOpen} title={`Close ${MONTH_NAMES[month - 1]} ${year}`} confirmLabel="Close month"
        message="After closing, no expense can be dated in this month and its variance reasons are final. An Admin can reopen it." onCancel={() => setLockOpen(false)}
        onConfirm={async () => { setLockOpen(false); await act(() => api.post('/budgets/close/lock', { year, month }), 'Month closed.'); }} />
      <ConfirmDialog open={unlockOpen} title={`Reopen ${MONTH_NAMES[month - 1]} ${year}`} confirmLabel="Reopen" message="Expenses can be dated in this month again." onCancel={() => setUnlockOpen(false)}
        onConfirm={async () => { setUnlockOpen(false); await act(() => api.post('/budgets/close/unlock', { year, month }), 'Month reopened.'); }} />
    </>
  );
}
