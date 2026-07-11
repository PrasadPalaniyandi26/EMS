'use client';

import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useRecurring, useCategories, useInvalidate, useRecurringRuns } from '@/hooks/use-queries';
import api, { getAccessToken, API_BASE } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Send,
  Trash2,
  CreditCard,
  History,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  XCircle,
  FileText,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/currency';
import { restoreEnteredAmount } from '@/lib/gst';
import type { RecurringTransaction } from '@/lib/types';
import { RecurringModal, PauseRecurringModal, ResumeRecurringModal, DeleteRecurringModal } from '@/components/recurring/recurring-modals';
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { columns } from "./columns";
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
} from "@tanstack/react-table";
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';

export default function RecurringPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';

  const userRoleNames = [
    ...(user?.roles || []).map((r: any) => (r.role_name || '').toUpperCase()),
    (user?.role_name || '').toUpperCase(),
  ].filter(Boolean);
  const canManage = userRoleNames.some((r) => ['MANAGER', 'ADMIN', 'FINANCE'].includes(r));
  const canApprove = userRoleNames.some((r) => ['FINANCE', 'ADMIN'].includes(r));
  const { data: recurringData, isLoading } = useRecurring();
  const recurring: RecurringTransaction[] = useMemo(() => {
    if (!recurringData) return [];
    if (Array.isArray(recurringData)) return recurringData;
    const d = recurringData as any;
    if ('rows' in d && Array.isArray(d.rows)) return d.rows;
    return [];
  }, [recurringData]);
  const { data: categories } = useCategories();
  const invalidate = useInvalidate();

  const [activeRow, setActiveRow] = useState<RecurringTransaction | null>(null);
  const { data: runHistory, isLoading: runHistoryLoading } = useRecurringRuns(activeRow?.id);

  // TanStack Table State
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);

  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<RecurringTransaction | null>(null);

  const [form, setForm] = useState({
    type: 'expense',
    description: '',
    amount: '',
    gst_rate: '',
    gst_included: false,
    category_id: '',
    frequency: 'monthly',
    next_run: new Date().toISOString().split('T')[0],
    end_date: '',
    open_ended: false,
    is_active: true,
    project_id: '',
    payment_method: '',
    schedule_on: '1st_of_month',
    auto_submit: true,
    notes: ''
  });
  const [recurringFile, setRecurringFile] = useState<File | null>(null);

  useEffect(() => {
    setHeader('Recurring', 'Automated Subscription & Periodic Expense Management');
  }, [setHeader]);

  const table = useReactTable({
    data: recurring,
    columns: columns(currency),
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    enableMultiRowSelection: false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  useEffect(() => {
    const rows = table.getFilteredSelectedRowModel().rows;
    const target = rows.length === 1 ? rows[0].original : null;
    setActiveRow(target);
  }, [rowSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  const BLANK_FORM = {
    type: 'expense',
    description: '',
    amount: '',
    gst_rate: '',
    gst_included: false,
    category_id: '',
    frequency: 'monthly',
    next_run: new Date().toISOString().split('T')[0],
    end_date: '',
    open_ended: false,
    is_active: true,
    project_id: '',
    payment_method: '',
    schedule_on: '1st_of_month',
    auto_submit: true,
    notes: ''
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setForm(BLANK_FORM);
    setRecurringFile(null);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(BLANK_FORM);
    setRecurringFile(null);
    setIsModalOpen(true);
  };

  const openEdit = () => {
    if (selectedCount !== 1) {
      toast.error('Select exactly one record to edit');
      return;
    }
    const target = selectedRows[0].original;
    setEditing(target);
    const editGstIncluded = target.gst_included ?? false;
    setForm({
      type: (target as any).type || 'expense',
      description: target.description || '',
      amount: String(restoreEnteredAmount(target.net_amount, target.total_amount, editGstIncluded, target.amount)),
      gst_rate: target.gst_rate ? `${target.gst_rate}%` : '',
      gst_included: editGstIncluded,
      category_id: String(target.category_id || ''),
      frequency: target.frequency || 'monthly',
      next_run: (target.next_run_date || '').split('T')[0] || '',
      end_date: (target.end_date || '').split('T')[0] || '',
      open_ended: !target.end_date,
      is_active: target.is_active !== 0,
      project_id: target.project_id ? String(target.project_id) : '',
      payment_method: target.payment_method || 'cash',
      schedule_on: '1st_of_month',
      auto_submit: true,
      notes: ''
    });
    setRecurringFile(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.category_id) {
      toast.error('Please fill in required fields (Description, Amount, Category)');
      return;
    }
    if (!form.next_run) {
      toast.error('Next run date is required');
      return;
    }
    if (!form.frequency) {
      toast.error('Frequency is required');
      return;
    }
    try {
      let receiptPath: string | null = editing?.receipt_path || null;
      if (recurringFile) {
        const fd = new FormData();
        fd.append('receipt', recurringFile);
        const uploadRes = await api.post<{ filename: string }>('/receipts/upload', fd);
        receiptPath = (uploadRes as any).data?.filename || null;
      }
      const body = {
        description: form.description,
        amount: Number(form.amount),
        gst_rate: form.gst_rate ? Number(form.gst_rate.replace('%', '')) : null,
        gst_included: form.gst_included,
        category_id: Number(form.category_id),
        frequency: form.frequency,
        next_run: form.next_run,
        end_date: form.end_date || null,
        is_active: form.is_active ? 1 : 0,
        type: form.type || 'expense',
        payment_method: form.payment_method || undefined,
        project_id: form.project_id && form.project_id !== 'none' ? Number(form.project_id) : null,
        ...(receiptPath ? { receipt_path: receiptPath } : {}),
      };
      if (editing) {
        await api.put(`/recurring/${editing.id}`, body);
        toast.success('Schedule Updated successfully');
      } else {
        await api.post('/recurring', body);
        toast.success('Schedule Created successfully');
      }
      invalidate('recurring');
      closeModal();
      setRowSelection({});
    } catch {
      toast.error('Failed to save schedule');
    }
  };

  const handleDelete = () => {
    if (!selectedCount) {
      toast.error('Select records to delete');
      return;
    }
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    try {
      for (const row of selectedRows) await api.delete(`/recurring/${row.original.id}`);
      toast.success('Deleted successfully');
      invalidate('recurring');
      setRowSelection({});
      setIsDeleteOpen(false);
    } catch {
      toast.error('Failed to delete records');
    }
  };

  const handleSubmit = async () => {
    if (selectedCount !== 1) {
      toast.error('Select exactly one record to submit');
      return;
    }
    const target = selectedRows[0].original;
    const s = ((target as any).status || 'DRAFT').toUpperCase();
    if (!['DRAFT', 'SENT_BACK'].includes(s)) {
      toast.error(`Cannot submit a schedule with status '${s}'`);
      return;
    }
    try {
      await api.post(`/recurring/${target.id}/submit`);
      toast.success('Recurring schedule submitted for Finance review');
      invalidate('recurring');
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit schedule');
    }
  };

  const handleApprove = async () => {
    if (selectedCount !== 1) { toast.error('Select exactly one record to approve'); return; }
    const target = selectedRows[0].original;
    if (((target as any).status || '').toUpperCase() !== 'PENDING_FINANCE') {
      toast.error('Only PENDING_FINANCE schedules can be approved');
      return;
    }
    try {
      await api.post(`/recurring/${target.id}/approve`);
      toast.success('Recurring schedule approved');
      invalidate('recurring');
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve schedule');
    }
  };

  const handleViewReceipt = async (receiptPath: string) => {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/receipts/${receiptPath}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      toast.error('Failed to open receipt');
    }
  };

  const handleReject = async () => {
    if (selectedCount !== 1) { toast.error('Select exactly one record to reject'); return; }
    const target = selectedRows[0].original;
    if (((target as any).status || '').toUpperCase() !== 'PENDING_FINANCE') {
      toast.error('Only PENDING_FINANCE schedules can be rejected');
      return;
    }
    try {
      await api.post(`/recurring/${target.id}/reject`);
      toast.success('Recurring schedule rejected');
      invalidate('recurring');
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject schedule');
    }
  };

  const handleToggleStatus = async (status: 'pause' | 'resume') => {
    if (selectedCount !== 1) {
      toast.error(`Select exactly one record to ${status}`);
      return;
    }
    const target = selectedRows[0].original;
    const s = ((target as any).status || '').toUpperCase();
    const isActive = !!(target as any).is_active;
    if (s !== 'APPROVED') {
      toast.error('Only approved recurring schedules can be paused or resumed');
      return;
    }
    if (status === 'pause' && !isActive) {
      toast.error('Schedule is already paused');
      return;
    }
    if (status === 'resume' && isActive) {
      toast.error('Schedule is already active');
      return;
    }
    setModalTarget(target);
    if (status === 'pause') {
      setIsPauseModalOpen(true);
    } else {
      setIsResumeModalOpen(true);
    }
  };

  const onConfirmPause = async () => {
    if (!modalTarget) return;
    try {
      await api.post(`/recurring/${modalTarget.id}/pause`, {});
      toast.success('Schedule Paused successfully');
      invalidate('recurring');
      setIsPauseModalOpen(false);
      setRowSelection({});
    } catch {
      toast.error('Failed to pause schedule');
    }
  };

  const onConfirmResume = async (updatedData: any) => {
    if (!modalTarget) return;
    try {
      await api.post(`/recurring/${modalTarget.id}/resume`, {
        next_run: updatedData.next_run,
        amount: Number(updatedData.amount),
        frequency: updatedData.frequency,
      });
      toast.success('Schedule Resumed successfully');
      invalidate('recurring');
      setIsResumeModalOpen(false);
      setRowSelection({});
    } catch {
      toast.error('Failed to resume schedule');
    }
  };

  return (
    <ModuleShell
      showPanel={!!activeRow}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={
            canManage ? (
              <>
                <button className="btn-action" onClick={openAdd}>
                  <Plus className="h-4 w-4 text-green-600" /> Add
                </button>
                <button className="btn-action" onClick={openEdit} disabled={selectedCount !== 1}>
                  <Pencil className="h-4 w-4 text-blue-600" /> Edit
                </button>
                <button
                  className="btn-action"
                  onClick={handleSubmit}
                  disabled={selectedCount !== 1 || !['DRAFT', 'SENT_BACK'].includes(((selectedRows[0]?.original as any)?.status || 'DRAFT').toUpperCase())}
                >
                  <Send className="h-4 w-4 text-currency" /> Submit
                </button>
                {canApprove && (
                  <>
                    <button
                      className="btn-action"
                      onClick={handleApprove}
                      disabled={selectedCount !== 1 || ((selectedRows[0]?.original as any)?.status || '').toUpperCase() !== 'PENDING_FINANCE'}
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Approve
                    </button>
                    <button
                      className="btn-action"
                      onClick={handleReject}
                      disabled={selectedCount !== 1 || ((selectedRows[0]?.original as any)?.status || '').toUpperCase() !== 'PENDING_FINANCE'}
                    >
                      <XCircle className="h-4 w-4 text-red-400" /> Reject
                    </button>
                  </>
                )}
                <button
                  className="btn-action"
                  onClick={() => handleToggleStatus('pause')}
                  disabled={selectedCount !== 1 || ((selectedRows[0]?.original as any)?.status || '').toUpperCase() !== 'APPROVED' || !(selectedRows[0]?.original as any)?.is_active}
                >
                  <PauseCircle className="h-4 w-4 text-yellow-500" /> Pause
                </button>
                <button
                  className="btn-action"
                  onClick={() => handleToggleStatus('resume')}
                  disabled={selectedCount !== 1 || ((selectedRows[0]?.original as any)?.status || '').toUpperCase() !== 'APPROVED' || !!(selectedRows[0]?.original as any)?.is_active}
                >
                  <PlayCircle className="h-4 w-4 text-cyan-500" /> Resume
                </button>
                <button className="btn-action" onClick={handleDelete} disabled={selectedCount === 0}>
                  <Trash2 className="h-4 w-4 text-red-500" /> Delete{selectedCount > 0 ? ` (${selectedCount})` : ''}
                </button>
              </>
            ) : null
          }
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title="Subscription Lifecycle"
            onClose={() => setRowSelection({})}
            hasSelection={!!activeRow}
          >
            {activeRow && (
            <div className="flex-1 space-y-8">
              <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase">Schedule Info</label>
                  {(activeRow as any).status === 'APPROVED' ? (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${activeRow.is_active ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {activeRow.is_active ? 'Active' : 'Inactive'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-black/10 dark:bg-white/10 text-black/50 dark:text-white/50">
                      {((activeRow as any).status || 'DRAFT').replace('_', ' ')}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Frequency</p>
                    <p className="text-[12px] font-bold text-black dark:text-white capitalize">{activeRow.frequency || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Next Run</p>
                    <p className="text-[12px] font-bold text-black dark:text-white">
                      {activeRow.next_run_date
                        ? new Date(activeRow.next_run_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Last Run</p>
                    <p className="text-[12px] font-bold text-black dark:text-white">
                      {(activeRow as any).last_run_date
                        ? new Date((activeRow as any).last_run_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Not yet run'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Type</p>
                    <p className="text-[12px] font-bold text-black dark:text-white capitalize">{(activeRow as any).type || 'expense'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Start Date</p>
                    <p className="text-[12px] font-bold text-black dark:text-white">
                      {(activeRow as any).start_date
                        ? new Date((activeRow as any).start_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                        : new Date((activeRow as any).next_run_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">End Date</p>
                    <p className="text-[12px] font-bold text-black dark:text-white">
                      {(activeRow as any).end_date
                        ? new Date((activeRow as any).end_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                        : <span className="text-[var(--shell-text-muted)] font-normal italic">Open-Ended</span>}
                    </p>
                  </div>
                  {(activeRow as any).client_name && (
                    <div className="col-span-2">
                      <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Client</p>
                      <p className="text-[12px] font-bold text-black dark:text-white">{(activeRow as any).client_name}</p>
                    </div>
                  )}
                  {(activeRow as any).project_name && (
                    <div className="col-span-2">
                      <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Project</p>
                      <p className="text-[12px] font-bold text-black dark:text-white">{(activeRow as any).project_name}</p>
                    </div>
                  )}
                </div>
              </div>

              {(activeRow as any).receipt_path && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase border-b border-[var(--shell-border)] pb-1.5 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" /> Supporting Document
                  </label>
                  <div
                    className="h-12 rounded-xl flex items-center gap-3 px-3 cursor-pointer border-2 border-[var(--shell-accent)]/40 hover:border-[var(--shell-accent)] transition-all"
                    style={{ background: 'linear-gradient(135deg, rgba(74,111,83,0.12) 0%, rgba(74,111,83,0.05) 100%)' }}
                    onClick={() => handleViewReceipt((activeRow as any).receipt_path)}
                  >
                    <FileText className="w-4 h-4 text-[var(--shell-accent)] shrink-0" />
                    <p className="text-[11px] font-bold text-[var(--shell-accent)] truncate">{(activeRow as any).receipt_path.split('/').pop()}</p>
                    <p className="text-[9px] text-[var(--shell-accent)]/60 ml-auto shrink-0">Click to view</p>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase border-b border-[var(--shell-border)] pb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Payment Info
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-3">
                    <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase">Method</p>
                    <p className="text-[12px] font-bold text-black dark:text-white capitalize">{(activeRow as any).payment_method || '—'}</p>
                  </div>
                  <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-3">
                    <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase">Auto-Run</p>
                    <p className="text-[12px] font-bold text-black dark:text-white">{activeRow.is_active ? 'Enabled' : 'Paused'}</p>
                  </div>
                  {(activeRow as any).gst_rate && (
                    <div className="col-span-2 bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-3">
                      <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-1">GST</p>
                      <p className="text-[12px] font-bold text-black dark:text-white">{(activeRow as any).gst_rate}% · {(activeRow as any).gst_included ? 'Included in amount' : 'Added on top'}</p>
                      <p className="text-[10px] text-[var(--shell-text-muted)] mt-0.5">
                        Net {formatCurrency((activeRow as any).net_amount ?? (activeRow as any).amount, currency)} · Total {formatCurrency((activeRow as any).total_amount ?? (activeRow as any).amount, currency)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase border-b border-[var(--shell-border)] pb-2 flex items-center gap-2">
                  <History className="w-4 h-4" /> Run History
                </label>
                <div className="rounded-xl overflow-hidden border border-[var(--shell-border)] bg-[var(--shell-hover)]">
                  {runHistoryLoading ? (
                    <p className="px-3 py-4 text-[11px] text-[var(--shell-text-muted)]">Loading...</p>
                  ) : !runHistory || runHistory.length === 0 ? (
                    <p className="px-3 py-4 text-[11px] text-[var(--shell-text-muted)]">No runs yet — schedule has not been triggered.</p>
                  ) : (
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-[var(--shell-surface)] text-[var(--shell-text-muted)] font-bold">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2 text-center">Status</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-casper/10">
                        {runHistory.map((run: any) => (
                          <tr key={run.id}>
                            <td className="px-3 py-2 text-[var(--shell-text-muted)]">
                              {run.date_recorded ? new Date(run.date_recorded).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-emerald-500 font-bold uppercase text-[9px] px-1.5 py-0.5 bg-[var(--shell-accent)]/20 rounded">
                                {run.status === 'APPROVED' ? 'Success' : run.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-[var(--shell-text-muted)]">{formatCurrency(run.amount, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
            )}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable
        columns={columns(currency)}
        data={recurring || []}
        tableInstance={table}
        emptyMessage="No recurring transactions set up."
      />

      <RecurringModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSave={handleSave}
        editing={editing}
        form={form}
        setForm={setForm}
        categories={categories || []}
        file={recurringFile}
        onFileChange={setRecurringFile}
      />

      <PauseRecurringModal
        isOpen={isPauseModalOpen}
        onClose={() => setIsPauseModalOpen(false)}
        onConfirm={onConfirmPause}
        targetName={(modalTarget as any)?.description || ''}
      />

      <ResumeRecurringModal
        isOpen={isResumeModalOpen}
        onClose={() => setIsResumeModalOpen(false)}
        onConfirm={onConfirmResume}
        target={modalTarget}
      />

      <DeleteRecurringModal 
        isOpen={isDeleteOpen} 
        onClose={() => setIsDeleteOpen(false)} 
        onConfirm={confirmDelete}
        count={selectedCount}
      />
    </ModuleShell>
  );
}
