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
  BarChart3,
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
  useReactTable,
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

// ─── Column definitions ─────────────────────────────────────────────────────

function buildColumns(role: string, currency: string): ColumnDef<any>[] {
  const isEmployee = role === 'EMPLOYEE';
  return [
    {
      accessorKey: 'code',
      header: 'ID',
      cell: ({ row }: any) => (
        <span className="text-[11px] font-bold font-mono text-blue-400">
          {row.original.code || row.original.reference_id || `#${row.original.id}`}
        </span>
      ),
      size: 100,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-[12px] font-medium text-[var(--shell-text-muted)] truncate block max-w-xs">
          {row.getValue('description') || '—'}
        </span>
      ),
    },
    ...(isEmployee
      ? []
      : [
          {
            accessorKey: 'submitted_by_name',
            header: 'Submitted By',
            cell: ({ row }: any) => {
              const name: string = row.original.submitted_by_name || 'System';
              const parts = name.trim().split(/\s+/);
              const initials = parts.length >= 2
                ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                : name.slice(0, 2).toUpperCase();
              return (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black text-white border border-[var(--shell-border)]"
                    style={{ background: 'var(--shell-accent)' }}>
                    {initials}
                  </div>
                  <span className="text-[12px] font-semibold text-black dark:text-white truncate">
                    {name}
                  </span>
                </div>
              );
            },
          } as ColumnDef<any>,
        ]),
    {
      accessorKey: 'category_name',
      header: () => <div className="text-center">Category</div>,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <span className="text-[12px] font-medium text-indigo-300">
            {row.getValue('category_name') || 'General'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: () => <div className="text-center">Submitted On</div>,
      cell: ({ row }) => (
        <div className="text-[12px] text-[var(--shell-text-muted)] text-center">
          {formatDate(row.original.date_recorded || row.getValue('created_at'))}
        </div>
      ),
    },
    {
      accessorKey: 'transaction_status',
      header: () => <div className="text-center">Status</div>,
      cell: ({ row }) => {
        const c = getStatusConfig(row.getValue('transaction_status') as string);
        return (
          <div className="flex justify-center">
            <Badge variant="outline" className={`text-[10px] font-bold ${c.color} border-current/20`}>
              {c.label}
            </Badge>
          </div>
        );
      },
      size: 150,
    },
    {
      accessorKey: 'amount',
      header: () => <div className="text-right">Amount</div>,
      cell: ({ row }) => (
        <div className="text-[12px] font-bold text-right text-black dark:text-white">
          {formatCurrency(Number(row.getValue('amount') || 0), currency)}
        </div>
      ),
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

  const MOBILE_HIDDEN_APPROVALS = ['category_name', 'description'];
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

  const table = useReactTable({
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
      <div className="px-4 flex items-end gap-0 shrink-0" style={{ borderBottom: '1px solid var(--shell-border)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => switchView(tab.value)}
            className={`relative px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all ${
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
                    <ShieldCheck className="w-4 h-4 text-green-600" /> Approve
                  </button>
                  <button
                    className="btn-action"
                    onClick={() => canActOnSelected && setIsRejectOpen(true)}
                    disabled={!canActOnSelected}
                  >
                    <XCircle className="w-4 h-4 text-red-600" /> Reject
                  </button>
                  <button
                    className="btn-action"
                    onClick={() => canActOnSelected && setIsSendBackOpen(true)}
                    disabled={!canActOnSelected}
                  >
                    <CornerUpLeft className="w-4 h-4 text-blue-600" /> Send back
                  </button>
                  {(isFinance || isAdmin) && (
                    <button
                      className="btn-action"
                      onClick={() => canVoidSelected && setIsVoidOpen(true)}
                      disabled={!canVoidSelected}
                    >
                      <Ban className="w-4 h-4 text-red-500" /> Void
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
          >
            {selectedApproval && (
            <div className="flex-1 space-y-4">
              {/* Receipt Viewer */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <Receipt className="w-3.5 h-3.5" /> Receipt
                </label>
                <div
                  className="h-20 rounded-xl flex items-center justify-center group cursor-pointer hover:brightness-105 transition-all shadow-md px-4"
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
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--shell-text-muted)] truncate">{selectedApproval.receipt_path.split('/').pop()}</p>
                        <p className="text-[9px] text-[var(--shell-text-muted)]/60 font-medium">Click to expand preview</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--shell-hover)] border border-[var(--shell-border)] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-[var(--shell-text-muted)]" />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--shell-text-muted)]">No receipt attached</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Submission Details */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <Cpu className="w-3.5 h-3.5" /> Submission Details
                </label>
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
                    <div key={idx} className={`px-2.5 py-2 rounded-lg border ${item.amber ? 'bg-amber-500/10 border-amber-400/30' : 'bg-[var(--shell-hover)] border-[var(--shell-border)]'}`}>
                      <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase tracking-wider">{item.label}</p>
                      <p className={`text-[11px] font-bold truncate mt-0.5 ${item.amber ? 'text-amber-500' : 'text-black dark:text-white'}`}>{item.val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fund Allocation / Split Detail */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" /> Fund Allocation
                </label>
                {selectedApproval.is_split === 1 ? (
                  <div className="space-y-2">
                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-teal-500/15 border border-teal-400/20 rounded-full text-[9px] font-bold text-teal-400 uppercase tracking-wider w-fit">
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
                                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-[var(--shell-hover)] text-[var(--shell-text-muted)] text-[9px] font-black flex items-center justify-center">{i + 1}</span>
                                  <span className="text-[11px] font-bold text-black dark:text-white truncate">{s.category_name || `Split ${i + 1}`}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="text-[10px] font-bold text-[var(--shell-accent)]">{pct}%</span>
                                  <span className="text-[11px] font-black text-black dark:text-white">{formatCurrency(Number(s.amount), currency)}</span>
                                </div>
                              </div>
                              <div className="w-full bg-[var(--shell-hover)] rounded-full h-1 overflow-hidden shadow-inner">
                                <div className="bg-[var(--shell-accent)] h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              {s.description && <p className="text-[9px] text-[var(--shell-text-muted)] mt-0.5 truncate">{s.description}</p>}
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between pt-1.5 border-t border-[var(--shell-border)]">
                          <span className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase tracking-wider">{splitDetails.length} splits · Total</span>
                          <span className="text-[12px] font-black text-[var(--shell-accent)]">{formatCurrency(amount, currency)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">No split details available.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-black dark:text-white">{selectedApproval.project_name || 'General Reserve'}</span>
                      <span className="text-[11px] font-bold text-[var(--shell-accent)]">100.00%</span>
                    </div>
                    <div className="w-full bg-[var(--shell-hover)] rounded-full h-1 overflow-hidden shadow-inner">
                      <div className="bg-[var(--shell-accent)] h-full rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <HistoryIcon className="w-3.5 h-3.5" /> Approval Timeline
                </label>
                <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--shell-hover)] ml-1">
                  <div className="relative pl-7">
                    <div className="absolute left-0 top-0.5 w-5 h-5 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center z-10">
                      <ShieldCheck className="w-3 h-3 text-green-400" />
                    </div>
                    <p className="text-[11px] font-black text-black dark:text-white tracking-tight">
                      Submitted by {selectedApproval.submitted_by_name || 'User'}
                    </p>
                    <p className="text-[9px] text-[var(--shell-text-muted)] font-bold uppercase mt-0.5">
                      {formatDate(selectedApproval.created_at)}
                    </p>
                  </div>
                  <div className="relative pl-7">
                    <div className="absolute left-0 top-0.5 w-5 h-5 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center z-10">
                      <BarChart3 className="w-3 h-3 text-blue-400" />
                    </div>
                    <p className="text-[11px] font-black text-black dark:text-white tracking-tight">Automatic Policy Check</p>
                    <p className="text-[9px] text-green-400 font-black uppercase mt-0.5 tracking-tight flex items-center gap-1">
                      <CheckCircle2 size={9} /> Passed — In Policy
                    </p>
                  </div>
                </div>
              </div>

              {/* Reimbursement status — shown when employee requested reimbursement */}
              {selectedApproval.needs_reimbursement && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                    <Wallet className="w-3.5 h-3.5" /> Reimbursement
                  </label>
                  {selectedApproval.reimbursement_status === 'PAID' ? (
                    <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-400/20">
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[11px] font-bold">
                          Reimbursed{selectedApproval.reimbursed_by_name ? ` by ${selectedApproval.reimbursed_by_name}` : ''}{selectedApproval.reimbursed_at ? ` · ${new Date(selectedApproval.reimbursed_at).toLocaleDateString()}` : ''}
                        </span>
                      </div>
                      {selectedApproval.reimbursement_reference && (
                        <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 pl-5">Ref: {selectedApproval.reimbursement_reference}</span>
                      )}
                      {selectedApproval.reimbursement_note && (
                        <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 pl-5">{selectedApproval.reimbursement_note}</span>
                      )}
                    </div>
                  ) : selectedApproval.reimbursement_status === 'ON_HOLD' ? (
                    <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-400/20">
                      <div className="flex items-center gap-2 text-orange-600 dark:text-orange-300">
                        <PauseCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[11px] font-bold">On Hold{selectedApproval.reimbursed_by_name ? ` · ${selectedApproval.reimbursed_by_name}` : ''}</span>
                      </div>
                      {selectedApproval.reimbursement_note && (
                        <span className="text-[10px] text-orange-600/70 dark:text-orange-300/70 pl-5">{selectedApproval.reimbursement_note}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/20 text-amber-600 dark:text-amber-300">
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
                    className="bg-[var(--shell-accent)] text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] hover:brightness-110 shadow-lg transition-all active:scale-95"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setIsSendBackOpen(true)}
                    className="bg-blue-600 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] hover:brightness-110 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                  >
                    Send Back
                  </button>
                  <button
                    onClick={() => setIsRejectOpen(true)}
                    className="bg-[var(--shell-hover)] border border-rose-400/30 text-rose-400 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] hover:bg-rose-500/15 transition-all active:scale-95"
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
