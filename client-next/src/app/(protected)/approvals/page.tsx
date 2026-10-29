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
import { IdCell, TextCell, DateCell, MoneyCell, StatusText, headerRight } from '@/components/data-table/cells';

// ─── Column definitions ─────────────────────────────────────────────────────

function buildColumns(role: string, currency: string): ColumnDef<any>[] {
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
  const cols = useMemo(() => buildColumns(colRole, currency), [colRole, currency]);

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
          actions={
            <>
              {(isManager || isFinance || isAdmin) && (
                <>
                  <button
                    className="btn-action"
                    onClick={() => canActOnSelected && setIsApproveOpen(true)}
                    disabled={!canActOnSelected}
                  >
                    <ShieldCheck className="w-4 h-4 text-[var(--success)]" /> Approve
                  </button>
                  <button
                    className="btn-action"
                    onClick={() => canActOnSelected && setIsRejectOpen(true)}
                    disabled={!canActOnSelected}
                  >
                    <XCircle className="w-4 h-4 text-[var(--danger)]" /> Reject
                  </button>
                  <button
                    className="btn-action"
                    onClick={() => canActOnSelected && setIsSendBackOpen(true)}
                    disabled={!canActOnSelected}
                  >
                    <CornerUpLeft className="w-4 h-4 text-[var(--info)]" /> Send back
                  </button>
                  {(isFinance || isAdmin) && (
                    <button
                      className="btn-action"
                      onClick={() => canVoidSelected && setIsVoidOpen(true)}
                      disabled={!canVoidSelected}
                    >
                      <Ban className="w-4 h-4 text-[var(--danger)]" /> Void
                    </button>
                  )}
                </>
              )}
            </>
          }
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
          >
            {selectedApproval && (
            <div className="flex-1 space-y-4">
              {/* Receipt Viewer */}
              <div className="space-y-2">
                <h3 className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <Receipt className="w-3.5 h-3.5" /> Receipt
                </h3>
                <div
                  role={selectedApproval?.receipt_path ? "button" : undefined}
                  tabIndex={selectedApproval?.receipt_path ? 0 : undefined}
                  aria-label={selectedApproval?.receipt_path ? "Open receipt in a new tab" : undefined}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                  className="focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)] h-20 rounded-xl flex items-center justify-center group cursor-pointer transition-all px-4"
                  style={{ background: 'var(--shell-bg)', border: '1px solid var(--shell-border)' }}
                  onClick={async () => {
                    if (selectedApproval?.receipt_path) {
                      const path = selectedApproval.receipt_path;
                      const url = path.startsWith('/') ? path : `${API_BASE}/receipts/${path}`;
                      try {
                        const token = getAccessToken();
                        const res = await fetch(url, {
                          credentials: 'include',
                          headers: token ? { Authorization: `Bearer ${token}` } : {},
                        });
                        if (!res.ok) {
                          const text = await res.text();
                          console.error('Receipt fetch failed:', res.status, text);
                          toast.error(`Receipt load failed: ${res.status}`);
                          return;
                        }
                        const blob = await res.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        window.open(blobUrl, '_blank');
                      } catch (err) {
                        console.error('Receipt fetch error:', err);
                        toast.error('Could not load receipt. Please try again.');
                      }
                    }
                  }}
                >
                  {selectedApproval?.receipt_path ? (
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--shell-hover)] border border-[var(--shell-border)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Receipt className="w-4 h-4 text-[var(--shell-text-muted)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[var(--shell-text-muted)] truncate">{selectedApproval.receipt_path.split('/').pop()}</p>
                        <p className="text-[11px] text-[var(--shell-text-muted)]/60 font-medium">Click to expand preview</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--shell-hover)] border border-[var(--shell-border)] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-[var(--shell-text-muted)]" />
                      </div>
                      <p className="text-[11px] font-bold text-[var(--shell-text-muted)]">No receipt attached</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Submission Details */}
              <div className="space-y-2">
                <h3 className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <Cpu className="w-3.5 h-3.5" /> Submission Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    // Pending queue view: show who submitted; History view: show approver/rejector
                    ...(view === 'pending' ? [
                      { label: 'Submitted By', val: selectedApproval.submitted_by_name || 'System' },
                    ] : [
                      (() => {
                        const s = (selectedApproval.transaction_status || '').toUpperCase();
                        if (s === 'APPROVED') return { label: 'Approved By', val: selectedApproval.approved_by_name || '—' };
                        if (s === 'REJECTED') return { label: 'Rejected By', val: selectedApproval.rejected_by_name || '—' };
                        return { label: 'Submitted By', val: selectedApproval.submitted_by_name || 'System' };
                      })(),
                    ]),
                    { label: 'Category', val: selectedApproval.category_name || '—' },
                    { label: 'Total Amount', val: formatCurrency(selectedApproval.total_amount ?? amount, currency) },
                    ...(selectedApproval.gst_rate != null ? [
                      { label: 'Net Amount', val: formatCurrency(selectedApproval.net_amount ?? amount, currency) },
                      { label: `GST (${selectedApproval.gst_rate}%)`, val: formatCurrency((selectedApproval.total_amount ?? amount) - (selectedApproval.net_amount ?? amount), currency) },
                      { label: 'Claimable', val: selectedApproval.is_claimable ? 'Yes — GST Reclaimable' : 'No' },
                    ] : []),
                    {
                      label: 'Reimburse',
                      val: selectedApproval.needs_reimbursement ? 'Yes — Needs Reimbursement' : 'No',
                      amber: selectedApproval.needs_reimbursement,
                    },
                  ] as Array<{ label: string; val: string; amber?: boolean }>).map((item, idx) => (
                    <div key={idx} className={`px-2.5 py-2 rounded-lg border ${item.amber ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]' : 'bg-[var(--shell-hover)] border-[var(--shell-border)]'}`}>
                      <p className="text-[11px] font-bold text-[var(--shell-text-muted)]">{item.label}</p>
                      <p className={`text-[11px] font-bold truncate mt-0.5 ${item.amber ? 'text-[var(--warning)]' : 'text-black dark:text-white'}`}>{item.val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fund Allocation / Split Detail */}
              <div className="space-y-2">
                <h3 className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" /> Fund Allocation
                </h3>
                {selectedApproval.is_split === 1 ? (
                  <div className="space-y-2">
                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] rounded-full text-[11px] font-bold text-[var(--success)] w-fit">
                      <Layers className="w-3 h-3" /> Split Transaction
                    </span>
                    {splitDetailsLoading ? (
                      <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">Loading split details...</p>
                    ) : splitDetails.length > 0 ? (
                      <div className="space-y-2">
                        {splitDetails.map((s: any, i: number) => {
                          const pct = ((s.amount / (amount || 1)) * 100).toFixed(1);
                          return (
                            <div key={s.id ?? i}>
                              <div className="flex items-center justify-between mb-0.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-[var(--shell-hover)] text-[var(--shell-text-muted)] text-[11px] font-black flex items-center justify-center">{i + 1}</span>
                                  <span className="text-[11px] font-bold text-black dark:text-white truncate">{s.category_name || `Split ${i + 1}`}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="text-[11px] font-bold text-[var(--shell-accent)]">{pct}%</span>
                                  <span className="text-[11px] font-black text-black dark:text-white">{formatCurrency(Number(s.amount), currency)}</span>
                                </div>
                              </div>
                              <div className="w-full bg-[var(--shell-hover)] rounded-full h-1 overflow-hidden">
                                <div className="bg-[var(--shell-accent)] h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              {s.description && <p className="text-[11px] text-[var(--shell-text-muted)] mt-0.5 truncate">{s.description}</p>}
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between pt-1.5 border-t border-[var(--shell-border)]">
                          <span className="text-[11px] font-bold text-[var(--shell-text-muted)]">{splitDetails.length} splits · Total</span>
                          <span className="text-[12px] font-black text-[var(--shell-accent)]">{formatCurrency(amount, currency)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">No split details available.</p>
                    )}
                  </div>
                ) : (selectedApproval.project_name || selectedApproval.product_name) ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-black dark:text-white">{selectedApproval.project_name || selectedApproval.product_name}</span>
                      <span className="text-[11px] font-bold text-[var(--shell-accent)]">100.00%</span>
                    </div>
                    <div className="w-full bg-[var(--shell-hover)] rounded-full h-1 overflow-hidden">
                      <div className="bg-[var(--shell-accent)] h-full rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">Not linked to a project or product.</p>
                )}
              </div>

              {/* Timeline */}
              <div className="space-y-2">
                <h3 className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <HistoryIcon className="w-3.5 h-3.5" /> Approval Timeline
                </h3>
                <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--shell-hover)] ml-1">
                  <div className="relative pl-7">
                    <div className="absolute left-0 top-0.5 w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--success)_20%,transparent)] border-2 border-[var(--success)] flex items-center justify-center z-10">
                      <ShieldCheck className="w-3 h-3 text-[var(--success)]" />
                    </div>
                    <p className="text-[11px] font-black text-black dark:text-white">
                      Submitted by {selectedApproval.submitted_by_name || 'User'}
                    </p>
                    <p className="text-[11px] text-[var(--shell-text-muted)] font-bold mt-0.5">
                      {formatDate(selectedApproval.created_at)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reimbursement status — shown when employee requested reimbursement */}
              {selectedApproval.needs_reimbursement && (
                <div className="space-y-1.5">
                  <h3 className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                    <Wallet className="w-3.5 h-3.5" /> Reimbursement
                  </h3>
                  {selectedApproval.reimbursement_status === 'PAID' ? (
                    <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)]">
                      <div className="flex items-center gap-2 text-[var(--success)]">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[11px] font-bold">
                          Reimbursed{selectedApproval.reimbursed_by_name ? ` by ${selectedApproval.reimbursed_by_name}` : ''}{selectedApproval.reimbursed_at ? ` · ${new Date(selectedApproval.reimbursed_at).toLocaleDateString()}` : ''}
                        </span>
                      </div>
                      {selectedApproval.reimbursement_reference && (
                        <span className="text-[11px] text-[color-mix(in_srgb,var(--success)_70%,transparent)] pl-5">Ref: {selectedApproval.reimbursement_reference}</span>
                      )}
                      {selectedApproval.reimbursement_note && (
                        <span className="text-[11px] text-[color-mix(in_srgb,var(--success)_70%,transparent)] pl-5">{selectedApproval.reimbursement_note}</span>
                      )}
                    </div>
                  ) : selectedApproval.reimbursement_status === 'ON_HOLD' ? (
                    <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_20%,transparent)]">
                      <div className="flex items-center gap-2 text-[var(--warning)]">
                        <PauseCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[11px] font-bold">On Hold{selectedApproval.reimbursed_by_name ? ` · ${selectedApproval.reimbursed_by_name}` : ''}</span>
                      </div>
                      {selectedApproval.reimbursement_note && (
                        <span className="text-[11px] text-[color-mix(in_srgb,var(--warning)_70%,transparent)] pl-5">{selectedApproval.reimbursement_note}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)]">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-[11px] font-bold">Pending Reimbursement</span>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons in panel — only for pending items in Manager/Finance view */}
              {canActOnSelected && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    onClick={() => setIsApproveOpen(true)}
                    className="bg-[var(--shell-accent)] text-[var(--shell-accent-fg)] py-2.5 rounded-xl text-[11px] font-black transition-all active:scale-95"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setIsSendBackOpen(true)}
                    className="bg-[var(--info)] text-[var(--info-foreground)] py-2.5 rounded-xl text-[11px] font-black transition-all active:scale-95"
                  >
                    Send Back
                  </button>
                  <button
                    onClick={() => setIsRejectOpen(true)}
                    className="bg-[var(--shell-hover)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] py-2.5 rounded-xl text-[11px] font-black hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] transition-all active:scale-95"
                  >
                    Reject
                  </button>
                </div>
              )}

            </div>
            )}
          </ModuleIntelligencePanel>
      }
    >
      {isLoading ? (
        <div className="h-full overflow-y-auto custom-scrollbar px-4 py-4 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 bg-[var(--shell-bg)] border border-black/10 rounded-xl px-4 py-3">
              <div className="h-4 w-4 rounded bg-[var(--shell-hover)] animate-pulse shrink-0" />
              <div className="h-3 w-20 rounded bg-[var(--shell-hover)] animate-pulse" />
              <div className="h-3 w-32 rounded bg-[var(--shell-hover)] animate-pulse flex-1" />
              <div className="h-3 w-24 rounded bg-[var(--shell-hover)] animate-pulse" />
              <div className="h-5 w-16 rounded bg-[var(--shell-hover)] animate-pulse" />
              <div className="h-4 w-20 rounded bg-[var(--shell-hover)] animate-pulse" />
            </div>
          ))}
        </div>
      ) : approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full space-y-4 py-20">
          <div className="w-16 h-16 rounded-full bg-[var(--shell-accent)]/10 flex items-center justify-center text-[var(--shell-accent)]">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-black dark:text-white">
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
