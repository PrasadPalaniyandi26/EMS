'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useApprovals, useApprovalsHistory, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
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
  Download,
  Filter,
  LayoutGrid,
  Layers,
} from 'lucide-react';

import { ApproveModal, RejectModal, SendBackModal } from '@/components/approvals/approvals-modals';
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

function buildColumns(role: string): ColumnDef<any>[] {
  const isEmployee = role === 'EMPLOYEE';
  return [
    {
      accessorKey: 'reference_id',
      header: 'ID',
      cell: ({ row }) => (
        <span className="text-[12px] font-bold text-juniper font-mono">
          {row.getValue('reference_id') || row.original.code || `#${row.original.id}`}
        </span>
      ),
      size: 110,
    },
    ...(isEmployee
      ? []
      : [
          {
            accessorKey: 'submitted_by_name',
            header: 'Employee',
            cell: ({ row }: any) => (
              <div className="flex items-center gap-2">
                <img
                  src={`https://api.dicebear.com/7.x/initials/svg?seed=${row.original.submitted_by_name || 'U'}`}
                  className="w-6 h-6 rounded-full border border-casper/50 shrink-0"
                  alt=""
                />
                <span className="text-[12px] font-semibold text-charcoal truncate">
                  {row.original.submitted_by_name || 'System'}
                </span>
              </div>
            ),
          } as ColumnDef<any>,
        ]),
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-[12px] font-medium text-charcoal/80 truncate block max-w-xs">
          {row.getValue('description') || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'category_name',
      header: () => <div className="text-center">Category</div>,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <span className="px-2 py-0.5 bg-mystic/50 text-[10px] font-bold text-juniper rounded-md uppercase border border-casper/30 tracking-tight">
            {row.getValue('category_name') || 'General'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: () => <div className="text-center">Submitted On</div>,
      cell: ({ row }) => (
        <div className="text-[12px] text-charcoal/60 text-center">
          {formatDate(row.original.date_recorded || row.getValue('created_at'))}
        </div>
      ),
    },
    {
      accessorKey: 'transaction_status',
      header: () => <div className="text-center">Status</div>,
      cell: ({ row }) => {
        const raw = (row.getValue('transaction_status') as string) || '';
        const status = raw.toUpperCase();
        const cfg: Record<string, { cls: string; label: string }> = {
          PENDING_MANAGER: { cls: 'text-amber-700 bg-amber-100 border-amber-200', label: 'Pending Manager' },
          PENDING_FINANCE: { cls: 'text-orange-700 bg-orange-100 border-orange-200', label: 'Pending Finance' },
          APPROVED:        { cls: 'text-emerald-700 bg-emerald-100 border-emerald-200', label: 'Approved' },
          REJECTED:        { cls: 'text-red-700 bg-red-100 border-red-200', label: 'Rejected' },
        };
        const c = cfg[status] || { cls: 'text-slate-600 bg-slate-100 border-slate-200', label: status || '—' };
        return (
          <div className="flex justify-center">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${c.cls}`}>
              {c.label}
            </span>
          </div>
        );
      },
      size: 150,
    },
    {
      accessorKey: 'amount',
      header: () => <div className="text-right">Amount</div>,
      cell: ({ row }) => (
        <div className="text-[12px] font-bold text-right text-charcoal">
          {formatCurrency(Number(row.getValue('amount') || 0), 'INR')}
        </div>
      ),
      size: 120,
    },
  ];
}

// ─── Status filter options (Finance only) ───────────────────────────────────

const FINANCE_STATUS_OPTIONS = [
  { label: 'Pending Finance', value: 'PENDING_FINANCE' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const invalidate = useInvalidate();

  const roleName = (user?.role_name || '').toUpperCase();
  const isManager = roleName === 'MANAGER';
  const isFinance = roleName === 'FINANCE';
  const isEmployee = roleName === 'EMPLOYEE' || roleName === '';

  // Finance status filter — default PENDING_FINANCE
  const [financeStatus, setFinanceStatus] = useState<string>('PENDING_FINANCE');

  // Data hooks
  // Manager: pending queue only
  // Finance: history with status filter (defaults PENDING_FINANCE)
  // Employee: their own history (approved + rejected)
  const { data: pendingData, isLoading: pendingLoading } = useApprovals();
  const { data: historyData, isLoading: historyLoading } = useApprovalsHistory(
    isFinance ? financeStatus : undefined
  );

  const approvals: any[] = useMemo(() => {
    if (isManager) return pendingData || [];
    if (isFinance) return historyData || [];
    if (isEmployee) return historyData || [];
    return pendingData || [];
  }, [isManager, isFinance, isEmployee, pendingData, historyData]);

  const isLoading = isManager ? pendingLoading : historyLoading;

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

  const cols = useMemo(() => buildColumns(roleName), [roleName]);

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
    setSplitDetails([]);
    if (!selectedApproval?.is_split) return;
    let cancelled = false;
    setSplitDetailsLoading(true);
    api.get(`/transactions/${selectedApproval.transaction_id || selectedApproval.id}/splits`)
      .then((r) => { if (!cancelled) setSplitDetails(r.data as any[]); })
      .catch(() => { if (!cancelled) setSplitDetails([]); })
      .finally(() => { if (!cancelled) setSplitDetailsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedApproval?.id]);

  // Modals
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isSendBackOpen, setIsSendBackOpen] = useState(false);

  const handleAction = useCallback(async (action: 'approve' | 'reject' | 'send-back', comments?: string) => {
    if (!selectedId) { toast.error('Select a request first'); return; }
    try {
      await api.post(`/approvals/${selectedId}/${action}`, { comments });
      const labels: Record<string, string> = { approve: 'approved', reject: 'rejected', 'send-back': 'sent back to employee' };
      toast.success(`Request ${labels[action]} successfully`);
      setRowSelection({});
      invalidate('approvals', 'approvals-history', 'transactions', 'dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Failed to ${action} request`);
    }
  }, [selectedId, invalidate]);

  const amount = Number(selectedApproval?.amount || 0);
  const canActOnSelected = selectedApproval && (isManager || isFinance) &&
    ['PENDING_MANAGER', 'PENDING_FINANCE'].includes(selectedApproval?.transaction_status || '');

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading workspace...</div>;
  }

  return (
    <ModuleShell
      showPanel={!!selectedApproval}
      actionsRow={
        <>
          <div className="flex items-center gap-3">
            {(isManager || isFinance) && (
              <>
                <button
                  onClick={() => canActOnSelected && setIsApproveOpen(true)}
                  disabled={!canActOnSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-green-50 hover:border-green-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ShieldCheck className="w-[16px] h-[16px] text-green-600" /> Approve
                </button>
                <button
                  onClick={() => canActOnSelected && setIsRejectOpen(true)}
                  disabled={!canActOnSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <XCircle className="w-[16px] h-[16px] text-red-600" /> Reject
                </button>
                <button
                  onClick={() => canActOnSelected && setIsSendBackOpen(true)}
                  disabled={!canActOnSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-blue-50 hover:border-blue-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CornerUpLeft className="w-[16px] h-[16px] text-blue-600" /> Send Back
                </button>
              </>
            )}

            {isEmployee && (
              <span className="text-[11px] font-bold text-casper uppercase tracking-widest">
                Your Approval History
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-mystic transition-all">
              <Download className="h-[16px] w-[16px] text-juniper" /> Export
            </button>
          </div>
        </>
      }
      searchRow={
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1">
            <DataTableToolbar
              table={table}
              facetedFilters={[]}
            />
          </div>

          {/* Finance status toggle — shown only for Finance role */}
          {isFinance && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5 text-casper" />
              {FINANCE_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setFinanceStatus(opt.value);
                    setRowSelection({});
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all ${
                    financeStatus === opt.value
                      ? 'bg-juniper text-white border-juniper shadow-sm'
                      : 'bg-white text-charcoal/70 border-casper hover:border-juniper/40 hover:text-juniper'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      }
      intelligencePanel={
        selectedApproval && (
          <ModuleIntelligencePanel
            title={`Review: ${selectedApproval.reference_id || selectedApproval.code || `#${selectedApproval.id}`}`}
            onClose={() => setRowSelection({})}
          >
            <div className="flex-1 space-y-4">
              {/* Receipt Viewer */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-juniper uppercase tracking-widest flex items-center gap-2 border-b border-casper/10 pb-1.5">
                  <Receipt className="w-3.5 h-3.5" /> Receipt
                </label>
                <div
                  className="h-32 bg-[#121212] rounded-xl flex flex-col items-center justify-center group cursor-pointer hover:brightness-110 transition-all shadow-md"
                  onClick={() => {
                    if (selectedApproval?.receipt_path) {
                      window.open(`/api/v1/receipts/${selectedApproval.receipt_path}`, '_blank');
                    }
                  }}
                >
                  {selectedApproval?.receipt_path ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2 text-white/50 group-hover:scale-110 transition-transform"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-white/80">{selectedApproval.receipt_path.split('/').pop()}</p>
                      <p className="text-[9px] text-white/40 mt-0.5 font-medium">Click to expand preview</p>
                    </>
                  ) : (
                    <>
                      <FileText className="w-8 h-8 mb-2 text-white/20" />
                      <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">No receipt attached</p>
                    </>
                  )}
                </div>
              </div>

              {/* Submission Details */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-juniper uppercase tracking-widest flex items-center gap-2 border-b border-casper/10 pb-1.5">
                  <Cpu className="w-3.5 h-3.5" /> Submission Details
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Submitted By', val: selectedApproval.submitted_by_name || 'System' },
                    { label: 'Category', val: selectedApproval.category_name || '—' },
                    { label: 'Amount', val: formatCurrency(amount, 'INR') },
                    { label: 'Tax (18%)', val: formatCurrency(amount * 0.18, 'INR') },
                  ].map((item, idx) => (
                    <div key={idx} className="bg-[#FAF9F6] px-2.5 py-2 rounded-lg border border-casper/30 shadow-sm">
                      <p className="text-[9px] font-bold text-casper uppercase tracking-wider">{item.label}</p>
                      <p className="text-[11px] font-bold text-charcoal truncate mt-0.5">{item.val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fund Allocation / Split Detail */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-juniper uppercase tracking-widest flex items-center gap-2 border-b border-casper/10 pb-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" /> Fund Allocation
                </label>
                {selectedApproval.is_split === 1 ? (
                  <div className="space-y-2">
                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-teal-50 border border-teal-200 rounded-full text-[9px] font-bold text-teal-700 uppercase tracking-wider w-fit">
                      <Layers className="w-3 h-3" /> Split Transaction
                    </span>
                    {splitDetailsLoading ? (
                      <p className="text-[11px] text-casper font-medium">Loading split details...</p>
                    ) : splitDetails.length > 0 ? (
                      <div className="space-y-2">
                        {splitDetails.map((s: any, i: number) => {
                          const pct = ((s.amount / amount) * 100).toFixed(1);
                          return (
                            <div key={s.id ?? i}>
                              <div className="flex items-center justify-between mb-0.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-juniper/10 text-juniper text-[9px] font-black flex items-center justify-center">{i + 1}</span>
                                  <span className="text-[11px] font-bold text-[#121212] truncate">{s.category_name || `Split ${i + 1}`}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="text-[10px] font-bold text-juniper">{pct}%</span>
                                  <span className="text-[11px] font-black text-charcoal">{formatCurrency(Number(s.amount), 'INR')}</span>
                                </div>
                              </div>
                              <div className="w-full bg-[#F0F4F5] rounded-full h-1 overflow-hidden shadow-inner">
                                <div className="bg-juniper h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              {s.description && <p className="text-[9px] text-casper mt-0.5 truncate">{s.description}</p>}
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between pt-1.5 border-t border-casper/20">
                          <span className="text-[9px] font-bold text-casper uppercase tracking-wider">{splitDetails.length} splits · Total</span>
                          <span className="text-[12px] font-black text-juniper">{formatCurrency(amount, 'INR')}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-casper font-medium">No split details available.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-[#121212]">{selectedApproval.project_name || 'General Reserve'}</span>
                      <span className="text-[11px] font-bold text-juniper">100.00%</span>
                    </div>
                    <div className="w-full bg-[#F0F4F5] rounded-full h-1 overflow-hidden shadow-inner">
                      <div className="bg-juniper h-full rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-juniper uppercase tracking-widest flex items-center gap-2 border-b border-casper/10 pb-1.5">
                  <HistoryIcon className="w-3.5 h-3.5" /> Approval Timeline
                </label>
                <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-casper/30 ml-1">
                  <div className="relative pl-7">
                    <div className="absolute left-0 top-0.5 w-5 h-5 rounded-full bg-green-50 border-2 border-green-500 flex items-center justify-center z-10 shadow-sm">
                      <ShieldCheck className="w-3 h-3 text-green-600" />
                    </div>
                    <p className="text-[11px] font-black text-charcoal tracking-tight">
                      Submitted by {selectedApproval.submitted_by_name || 'User'}
                    </p>
                    <p className="text-[9px] text-casper font-bold uppercase mt-0.5">
                      {formatDate(selectedApproval.created_at)}
                    </p>
                  </div>
                  <div className="relative pl-7">
                    <div className="absolute left-0 top-0.5 w-5 h-5 rounded-full bg-blue-50 border-2 border-blue-500 flex items-center justify-center z-10 shadow-sm">
                      <BarChart3 className="w-3 h-3 text-blue-600" />
                    </div>
                    <p className="text-[11px] font-black text-charcoal tracking-tight">Automatic Policy Check</p>
                    <p className="text-[9px] text-green-600 font-black uppercase mt-0.5 tracking-tight flex items-center gap-1">
                      <CheckCircle2 size={9} /> Passed — In Policy
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons in panel — only for pending items in Manager/Finance view */}
              {canActOnSelected && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    onClick={() => setIsApproveOpen(true)}
                    className="bg-juniper text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] hover:brightness-110 shadow-lg shadow-juniper/20 transition-all active:scale-95"
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
                    className="bg-white border border-rose-200 text-rose-600 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] hover:bg-rose-50 transition-all active:scale-95 shadow-sm"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </ModuleIntelligencePanel>
        )
      }
    >
      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full space-y-4 py-20">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-theme-sidebar">
            {isEmployee ? 'No History Yet' : 'All Caught Up!'}
          </h2>
          <p className="text-muted-foreground max-w-sm text-center text-sm">
            {isEmployee
              ? 'Your approved and rejected expense submissions will appear here.'
              : 'There are no requests matching the current filter.'}
          </p>
        </div>
      ) : (
        <DataTable columns={cols} data={approvals} tableInstance={table} />
      )}

      <ApproveModal
        isOpen={isApproveOpen}
        onClose={() => setIsApproveOpen(false)}
        selectedRequest={selectedApproval}
        onConfirm={(data) => { handleAction('approve', data.comment); setIsApproveOpen(false); }}
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
    </ModuleShell>
  );
}
