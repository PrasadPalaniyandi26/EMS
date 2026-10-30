'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useApprovals, useApprovalsHistory, useInvalidate } from '@/hooks/use-queries';
import api, { getAccessToken, API_BASE } from '@/lib/api-client';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/currency';
import {
  CheckCircle2,
  XCircle,
  FileText,
  Receipt,
  Cpu,
  History as HistoryIcon,
  ShieldCheck,
  CornerUpLeft,
  LayoutGrid,
  Layers,
  Ban,
  Wallet,
  PauseCircle,
  Clock,
} from 'lucide-react';
import { ReimbursementsTab } from '@/components/reimbursements/reimbursements-tab';
import { Badge } from '@/components/ui/badge';
import { getStatusConfig } from '@/lib/status';


import { ApproveModal, RejectModal, SendBackModal, VoidModal } from '@/components/approvals/approvals-modals';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAttachment, DetailAllocation, DetailTimeline, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFacetedUniqueValues,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  RowSelectionState,
} from '@tanstack/react-table';
import { useDataTable } from '@/hooks/use-data-table';
import { IdCell, TextCell, DateCell, MoneyCell, StatusText, ToneText, headerRight } from '@/components/data-table/cells';
import { useExpenseImpact, type ExpenseImpact } from '@/hooks/use-budget-queries';
import { UtilBar, money } from '@/components/budgets/budget-ui';

// ─── Column definitions ─────────────────────────────────────────────────────

function buildColumns(role: string, currency: string, impact: Record<number, ExpenseImpact>): ColumnDef<any>[] {
  const isEmployee = role === 'EMPLOYEE';
  return [
    {
      accessorKey: 'code',
      header: 'ID',
      cell: ({ row }: any) => <IdCell value={row.original.code || row.original.reference_id || `#${row.original.id}`} />,
      size: 100,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <TextCell value={row.getValue('description') as string} className="block max-w-xs truncate" />,
    },
    ...(isEmployee
      ? []
      : [
          {
            accessorKey: 'submitted_by_name',
            header: 'Submitted by',
            cell: ({ row }: any) => <TextCell value={row.original.submitted_by_name || 'System'} />,
          } as ColumnDef<any>,
        ]),
    {
      accessorKey: 'category_name',
      header: 'Category',
      cell: ({ row }) => <TextCell value={(row.getValue('category_name') as string) || 'General'} />,
    },
    {
      accessorKey: 'created_at',
      header: 'Submitted on',
      cell: ({ row }) => <DateCell value={row.original.date_recorded || row.getValue('created_at')} />,
    },
    {
      accessorKey: 'transaction_status',
      header: 'Status',
      cell: ({ row }) => <StatusText status={row.getValue('transaction_status') as string} />,
      size: 150,
    },
    ...(isEmployee
      ? []
      : [
          {
            id: 'budget',
            header: 'Budget',
            enableSorting: false,
            cell: ({ row }: any) => {
              const i = impact[row.original.transaction_id];
              if (!i || i.state === 'NO_PLAN') return <TextCell value="" />;
              if (i.state === 'OVER') return <ToneText tone="warning" label={`Over by ${money(i.over_by, currency)}`} />;
              if (i.state === 'NO_LINE') return <ToneText tone="warning" label="No budget line" />;
              return <ToneText tone="success" label="Within" />;
            },
            size: 130,
          } as ColumnDef<any>,
        ]),
    {
      accessorKey: 'amount',
      header: headerRight('Amount'),
      cell: ({ row }) => <MoneyCell value={row.getValue('amount')} currency={currency} />,
      size: 120,
    },
  ];
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const invalidate = useInvalidate();

  const roleName = (user?.role_name || '').toUpperCase();
  const hasRole = (r: string) => user?.roles?.some((x) => x.role_name?.toUpperCase() === r) || roleName === r;
  const isManager = hasRole('MANAGER');
  const isFinance = hasRole('FINANCE');
  const isAdmin = hasRole('ADMIN');
  const canToggle = isManager || isFinance || isAdmin;
  const canSeeReimbursements = isFinance || isAdmin;
  // Employee: locked to 'history'; Manager + Finance + Admin: default 'pending'
  const [view, setView] = useState<'pending' | 'history' | 'reimbursements'>(canToggle ? 'pending' : 'history');

  const switchView = (v: 'pending' | 'history' | 'reimbursements') => {
    setView(v);
    setRowSelection({});
  };

  // Data hooks
  const { data: pendingData, isLoading: pendingLoading } = useApprovals();
  const { data: historyData, isLoading: historyLoading } = useApprovalsHistory();

  const approvals: any[] = useMemo(() => {
    if (view === 'reimbursements') return [];
    return view === 'pending' ? (pendingData || []) : (historyData || []);
  }, [view, pendingData, historyData]);

  const isLoading = view === 'pending' ? pendingLoading : (view === 'history' ? historyLoading : false);

  useEffect(() => {
    const roleCtx = user?.role_name ? `Acting as: ${user.role_name.toUpperCase()}` : '';
    setHeader('Approvals Workspace', roleCtx);
  }, [setHeader, user?.role_name]);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  const MOBILE_HIDDEN_APPROVALS: string[] = [];
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = (isMobile: boolean) => {
      setColumnVisibility((prev) => {
        const vis: VisibilityState = { ...prev };
        MOBILE_HIDDEN_APPROVALS.forEach((col) => { vis[col] = !isMobile; });
        return vis;
      });
    };
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Non-toggling roles (Admin, Employee) see only their own history — treat as EMPLOYEE for columns
  const colRole = canToggle ? roleName : 'EMPLOYEE';
  // Money each pending expense would take from its budget line, for the Budget column and the panel
  const impactIds = useMemo(
    () => (view === 'pending' && canToggle ? approvals.filter((a) => a.record_type !== 'recurring' && a.type !== 'income' && a.transaction_id).map((a) => Number(a.transaction_id)) : []),
    [approvals, view, canToggle],
  );
  const { data: impactData } = useExpenseImpact(impactIds);
  const impact = useMemo(() => impactData ?? {}, [impactData]);
  const cols = useMemo(() => buildColumns(colRole, currency, impact), [colRole, currency, impact]);

  const table = useDataTable({
    data: approvals,
    columns: cols,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    enableRowSelection: true,
    enableMultiRowSelection: false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedApproval: any = selectedRows.length === 1 ? selectedRows[0].original : null;
  const selectedId = selectedApproval?.id ?? null;

  // Split details for selected approval
  const [splitDetails, setSplitDetails] = useState<any[]>([]);
  const [splitDetailsLoading, setSplitDetailsLoading] = useState(false);

  useEffect(() => {
    const rows = table.getFilteredSelectedRowModel().rows;
    const approval = rows.length === 1 ? rows[0].original : null;
    setSplitDetails([]);
    if (!approval?.is_split) return;
    let cancelled = false;
    setSplitDetailsLoading(true);
    api.get(`/transactions/${approval.transaction_id || approval.id}/splits`)
      .then((r) => { if (!cancelled) setSplitDetails(r.data as any[]); })
      .catch(() => { if (!cancelled) setSplitDetails([]); })
      .finally(() => { if (!cancelled) setSplitDetailsLoading(false); });
    return () => { cancelled = true; };
  }, [rowSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Modals
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isSendBackOpen, setIsSendBackOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);

  const handleVoid = useCallback(async ({ reason }: { reason: string }) => {
    const txId = selectedApproval?.transaction_id;
    if (!txId) return;
    try {
      await api.post(`/transactions/${txId}/void`, { reason });
      toast.success(`Transaction ${selectedApproval.code || `#${txId}`} voided`);
      setIsVoidOpen(false);
      setRowSelection({});
      invalidate('approvals', 'approvals-history', 'transactions', 'recurring', 'dashboard');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to void transaction');
      throw err;
    }
  }, [selectedApproval, invalidate]);

  const handleAction = useCallback(async (action: 'approve' | 'reject' | 'send-back', comments?: string, isClaimable?: boolean) => {
    if (!selectedId) { toast.error('Select a request first'); return; }
    try {
      const body: any = { comments };
      if (action === 'approve' && isClaimable !== undefined) body.isClaimable = isClaimable;
      await api.post(`/approvals/${selectedId}/${action}`, body);
      const labels: Record<string, string> = { approve: 'approved', reject: 'rejected', 'send-back': 'sent back to employee' };
      toast.success(`Request ${labels[action]} successfully`);
      setRowSelection({});
      invalidate('approvals', 'approvals-history', 'transactions', 'recurring', 'dashboard');
    } catch (err: any) {
      toast.error(err?.message || `Failed to ${action} request`);
    }
  }, [selectedId, invalidate]);

  const amount = Number(selectedApproval?.amount || 0);
  const canActOnSelected = selectedApproval && (isManager || isFinance || isAdmin) &&
    ['PENDING_MANAGER', 'PENDING_FINANCE'].includes(selectedApproval?.transaction_status || '');
  const canVoidSelected = selectedApproval && (isFinance || isAdmin) &&
    view === 'history' &&
    (selectedApproval?.transaction_status || '').toUpperCase() === 'APPROVED';

  // Tab definitions
  const tabs = [
    ...(canToggle ? [{ label: 'Pending Approvals', value: 'pending' as const }] : []),
    { label: 'History', value: 'history' as const },
    ...(canSeeReimbursements ? [{ label: 'Reimbursements', value: 'reimbursements' as const }] : []),
  ];

  const itemActions: DetailActionDef[] = canActOnSelected
    ? [
        { label: 'Approve', variant: 'primary', onClick: () => setIsApproveOpen(true) },
        { label: 'Send back', onClick: () => setIsSendBackOpen(true) },
        { label: 'Reject', variant: 'danger', onClick: () => setIsRejectOpen(true) },
      ]
    : canVoidSelected
    ? [{ label: 'Void', variant: 'danger', onClick: () => setIsVoidOpen(true) }]
    : [];

  return (
    <div className="flex flex-col h-full w-full" style={{ background: 'var(--shell-bg)' }}>
      {/* Tab strip */}
      <div role="tablist" aria-label="Approval views" className="px-4 flex items-end gap-0 shrink-0" style={{ borderBottom: '1px solid var(--shell-border)' }}>
        {tabs.map((tab) => (
          <button role="tab" aria-selected={view === tab.value}
            key={tab.value}
            onClick={() => switchView(tab.value)}
            className={`relative px-4 py-2.5 text-[13px] font-medium transition-all ${
              view === tab.value
                ? 'text-black dark:text-white'
                : 'text-[var(--shell-text-muted)] hover:text-[var(--shell-text)]'
            }`}
          >
            {tab.label}
            {view === tab.value && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full" style={{ background: 'var(--shell-accent)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Reimbursements tab — self-contained */}
      {view === 'reimbursements' ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ReimbursementsTab />
        </div>
      ) : (

    <ModuleShell
      showPanel={!!selectedApproval}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={<ToolbarActions actions={itemActions} />}
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title="Approval Review"
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedApproval}
            emptyState={!canToggle ? {
              heading: 'No Request Selected',
              body: 'Select one of your submissions to see who reviewed it, their comments, and the outcome.',
              tips: ['See who approved or rejected it', 'Read the reviewer\'s comments', 'Full audit trail per request'],
            } : undefined}
            footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}
          >
            {selectedApproval && (() => {
              const a = selectedApproval;
              const statusCfg = getStatusConfig(a.transaction_status);
              const total = a.total_amount ?? amount;
              const state = (a.transaction_status || '').toUpperCase();
              const people =
                view === 'pending' || (state !== 'APPROVED' && state !== 'REJECTED')
                  ? { label: 'Submitted by', value: a.submitted_by_name || 'System' }
                  : state === 'APPROVED'
                  ? { label: 'Approved by', value: a.approved_by_name }
                  : { label: 'Rejected by', value: a.rejected_by_name };
              const linked = a.project_name || a.product_name;
              return (
                <>
                  <DetailSummary
                    title={a.code || a.reference_id || `#${a.id}`}
                    subtitle={a.description}
                    status={statusCfg.label}
                    statusClass={statusCfg.color}
                    figure={formatCurrency(total, currency)}
                    figureLabel="Total"
                  />

                  <DetailSection title="Details">
                    <DetailGrid>
                      <DetailField label={people.label} value={people.value} />
                      <DetailField label="Category" value={a.category_name} />
                      {a.gst_rate != null && (
                        <>
                          <DetailField label="Net amount" value={formatCurrency(a.net_amount ?? amount, currency)} />
                          <DetailField label={`GST (${a.gst_rate}%)`} value={formatCurrency(total - (a.net_amount ?? amount), currency)} />
                          <DetailField label="GST claimable" value={a.is_claimable ? 'Yes' : 'No'} />
                        </>
                      )}
                      <DetailField label="Reimbursement" value={a.needs_reimbursement ? 'Needed' : 'Not needed'} tone={a.needs_reimbursement ? 'warning' : 'muted'} />
                    </DetailGrid>
                  </DetailSection>

                  {impact[a.transaction_id] && impact[a.transaction_id].state !== 'NO_PLAN' && (() => {
                    const i = impact[a.transaction_id];
                    return (
                      <DetailSection title={i.line_label ? `Budget impact · ${i.line_label}` : 'Budget impact'}>
                        {i.state === 'NO_LINE' ? (
                          <p className="text-[13px] text-[var(--warning)]">This expense matches no budget line.</p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[12px] text-[var(--shell-text-muted)]">Before this expense: {i.before_pct}% ({money(i.before, currency)} of {money(i.budget, currency)})</p>
                            <UtilBar pct={i.before_pct ?? 0} />
                            <p className={`text-[12px] ${i.state === 'OVER' ? 'text-[var(--warning)]' : 'text-[var(--shell-text-muted)]'}`}>After: {i.after_pct}% ({money(i.after, currency)} of {money(i.budget, currency)}){i.state === 'OVER' ? `, ${money(i.over_by, currency)} over` : ''}</p>
                            <UtilBar pct={i.after_pct ?? 0} />
                          </div>
                        )}
                        {i.reason && (
                          <div className="mt-2">
                            <p className="text-[12px] text-[var(--shell-text-muted)]">Reason given</p>
                            <p className="text-[13px] text-[var(--shell-text)]">{i.reason}</p>
                          </div>
                        )}
                      </DetailSection>
                    );
                  })()}

                  <DetailSection title="Receipt">
                    <DetailAttachment path={a.receipt_path} emptyLabel="No receipt attached" />
                  </DetailSection>

                  <DetailSection title="Fund allocation">
                    {a.is_split === 1 ? (
                      splitDetailsLoading ? (
                        <p className="text-[12px] text-[var(--shell-text-muted)]">Loading split details...</p>
                      ) : splitDetails.length > 0 ? (
                        <DetailAllocation
                          items={splitDetails.map((s: any, i: number) => ({
                            label: s.category_name || `Split ${i + 1}`,
                            amount: formatCurrency(Number(s.amount), currency),
                            pct: (Number(s.amount) / (amount || 1)) * 100,
                            note: s.description,
                          }))}
                          total={`${splitDetails.length} splits · ${formatCurrency(amount, currency)}`}
                        />
                      ) : (
                        <p className="text-[12px] text-[var(--shell-text-muted)]">No split details available.</p>
                      )
                    ) : linked ? (
                      <DetailAllocation items={[{ label: linked, pct: 100 }]} />
                    ) : (
                      <p className="text-[12px] text-[var(--shell-text-muted)]">Not linked to a project or product.</p>
                    )}
                  </DetailSection>

                  <DetailSection title="Timeline">
                    <DetailTimeline items={[{ title: `Submitted by ${a.submitted_by_name || 'User'}`, meta: formatDate(a.created_at), tone: 'success' }]} />
                  </DetailSection>

                  {a.needs_reimbursement && (
                    <DetailSection title="Reimbursement">
                      <DetailGrid>
                        <DetailField
                          label="Status"
                          value={a.reimbursement_status === 'PAID' ? 'Paid' : a.reimbursement_status === 'ON_HOLD' ? 'On hold' : 'Pending'}
                          tone={a.reimbursement_status === 'PAID' ? 'success' : 'warning'}
                        />
                        <DetailField label="Handled by" value={a.reimbursed_by_name} />
                        {a.reimbursement_reference && <DetailField label="Reference" value={a.reimbursement_reference} />}
                        {a.reimbursed_at && <DetailField label="Date" value={formatDate(a.reimbursed_at)} />}
                        {a.reimbursement_note && <DetailField label="Note" value={a.reimbursement_note} wide />}
                      </DetailGrid>
                    </DetailSection>
                  )}
                </>
              );
            })()}
          </ModuleIntelligencePanel>
      }
    >
      {isLoading ? (
        <DataTable isLoading columns={cols} data={[]} tableInstance={table} />
      ) : approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full space-y-4 py-20">
          <div className="w-16 h-16 rounded-full bg-[var(--shell-accent)]/10 flex items-center justify-center text-[var(--shell-accent)]">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-semibold text-black dark:text-white">
            {view === 'history' ? 'No History Yet' : 'All Caught Up!'}
          </h2>
          <p className="text-muted-foreground max-w-sm text-center text-sm">
            {view === 'history'
              ? 'Your approved and rejected submissions will appear here.'
              : 'There are no pending requests in the queue.'}
          </p>
        </div>
      ) : (
        <DataTable
          columns={cols}
          data={approvals}
          tableInstance={table}
          emptyMessage={view === 'pending' ? 'No pending approvals — all caught up!' : 'No approval history yet.'}
        />
      )}

      <ApproveModal
        isOpen={isApproveOpen}
        onClose={() => setIsApproveOpen(false)}
        selectedRequest={selectedApproval}
        onConfirm={(data) => { handleAction('approve', data.comment, data.isClaimable); setIsApproveOpen(false); }}
      />
      <RejectModal
        isOpen={isRejectOpen}
        onClose={() => setIsRejectOpen(false)}
        selectedRequest={selectedApproval}
        onConfirm={(data) => { handleAction('reject', data.comment); setIsRejectOpen(false); }}
      />
      <SendBackModal
        isOpen={isSendBackOpen}
        onClose={() => setIsSendBackOpen(false)}
        selectedRequest={selectedApproval}
        onConfirm={(data) => { handleAction('send-back', data.comment); setIsSendBackOpen(false); }}
      />
      <VoidModal
        isOpen={isVoidOpen}
        onClose={() => setIsVoidOpen(false)}
        selectedRequest={selectedApproval}
        onConfirm={handleVoid}
      />
    </ModuleShell>

      )} {/* end view !== reimbursements */}
    </div>
  );
}
