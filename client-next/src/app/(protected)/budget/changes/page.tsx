'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { useBudgetChanges, type BudgetChangeRow } from '@/hooks/use-planning-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { DateCell, TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog, NativeSelect } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { ChangeDecisionModal, ChangeRequestModal } from '@/components/budgets/planning-modals';
import { plain, money } from '@/components/budgets/budget-ui';

const KIND: Record<string, string> = { TRANSFER: 'Transfer', REVISION: 'Revision', DRAWDOWN: 'Contingency drawdown', RELEASE: 'Release to reserve' };
const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = { PENDING: { label: 'Pending', tone: 'warning' }, APPROVED: { label: 'Approved', tone: 'success' }, REJECTED: { label: 'Rejected', tone: 'danger' } };

export default function BudgetChangesPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const role = (user?.role_name || '').toUpperCase();
  const isFinance = role === 'ADMIN' || role === 'FINANCE';
  const invalidate = useInvalidate();
  const [status, setStatus] = useState('PENDING');
  const { data, isLoading } = useBudgetChanges(status);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [reqOpen, setReqOpen] = useState(false);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [withdraw, setWithdraw] = useState<BudgetChangeRow | null>(null);
  useEffect(() => { setHeader('Budget changes', 'Transfers, drawdowns, revisions and releases'); }, [setHeader]);

  const columns = useMemo<ColumnDef<BudgetChangeRow, any>[]>(() => [
    { accessorKey: 'created_at', header: 'Requested', cell: ({ row }) => <DateCell value={row.original.created_at} />, size: 110 },
    { accessorKey: 'kind', header: 'Kind', cell: ({ row }) => <TextCell value={KIND[row.original.kind]} strong />, size: 160 },
    { id: 'lines', header: 'Lines', cell: ({ row }) => <TextCell value={[row.original.from_label, row.original.to_label].filter(Boolean).join('  →  ')} className="block max-w-[380px] truncate" /> },
    { accessorKey: 'amount', header: headerRight('Amount'), cell: ({ row }) => <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{plain(row.original.amount, currency)}</div>, size: 120 },
    { accessorKey: 'requested_by_name', header: 'Requested by', cell: ({ row }) => <TextCell value={row.original.requested_by_name} muted />, size: 120 },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <ToneText label={STATUS[row.original.status].label} tone={STATUS[row.original.status].tone} />, size: 100 },
  ], [currency]);

  const rows = data?.rows ?? [];
  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const pending = selected?.status === 'PENDING';
  const canDecide = pending && isFinance && (!selected!.needs_admin || role === 'ADMIN');
  const actions: DetailActionDef[] = selected && pending ? [
    ...(canDecide ? [{ label: 'Approve', variant: 'primary' as const, onClick: () => setDecision('approve') }, { label: 'Reject', variant: 'danger' as const, onClick: () => setDecision('reject') }] : []),
    { label: 'Withdraw', onClick: () => setWithdraw(selected) },
  ].slice(0, 3) : [];

  return (
    <ModuleShell
      showPanel={!!selected}
      searchRow={
        <DataTableToolbar table={table} filters={
          <NativeSelect aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setSelection({}); }} className="!h-8 !w-auto">
            <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="ALL">All</option>
          </NativeSelect>
        } actions={<>
          <button className="btn-action" onClick={() => setReqOpen(true)}><Plus className="h-4 w-4 text-[var(--success)]" /> Request change</button>
          <ToolbarActions actions={actions.filter((a) => a.label !== 'Withdraw')} />
        </>} />
      }
      intelligencePanel={
        <ModuleIntelligencePanel title="Budget change" onClose={() => setSelection({})} hasSelection={!!selected} footer={actions.length ? <DetailActions actions={actions} /> : undefined}>
          {selected && (
            <>
              <DetailSummary title={KIND[selected.kind]} subtitle={`Requested by ${selected.requested_by_name ?? 'unknown'}`} status={STATUS[selected.status].label} statusClass={{ warning: 'text-[var(--warning)]', success: 'text-[var(--success)]', danger: 'text-[var(--danger)]' }[STATUS[selected.status].tone]} figure={money(selected.amount, currency)} figureLabel="Amount" />
              <DetailSection title="Lines">
                <DetailGrid cols={1}>
                  {selected.from_label && <DetailField label="From" value={selected.from_label} />}
                  {selected.to_label && <DetailField label="To" value={selected.to_label} />}
                </DetailGrid>
              </DetailSection>
              <DetailSection title="Reason"><p className="text-[13px] text-[var(--shell-text)]">{selected.reason}</p></DetailSection>
              {selected.needs_admin && pending && <p className="text-[12px] text-[var(--warning)]">Above {money(data?.approval_threshold, currency)}: an Admin approves this one.</p>}
              {selected.decided_by_name && <DetailSection title="Decision"><p className="text-[13px] text-[var(--shell-text)]">{STATUS[selected.status].label} by {selected.decided_by_name}{selected.decision_note ? `: ${selected.decision_note}` : ''}</p></DetailSection>}
            </>
          )}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={status === 'PENDING' ? 'No changes waiting. Use Request change to move money between lines.' : 'No changes to show.'} />
      <ChangeRequestModal isOpen={reqOpen} onClose={() => setReqOpen(false)} />
      <ChangeDecisionModal isOpen={decision !== null} onClose={() => { setDecision(null); setSelection({}); }} change={selected} mode={decision ?? 'approve'} />
      <ConfirmDialog open={!!withdraw} destructive title="Withdraw request" message="Withdraw this request? It is removed from the list." confirmLabel="Withdraw" onCancel={() => setWithdraw(null)}
        onConfirm={async () => { const w = withdraw; setWithdraw(null); if (!w) return; try { await api.delete(`/budgets/changes/${w.id}`); toast.success('Request withdrawn.'); invalidate('budgets'); setSelection({}); } catch (e: any) { toast.error(e?.message || 'Could not withdraw.'); } }} />
    </ModuleShell>
  );
}
