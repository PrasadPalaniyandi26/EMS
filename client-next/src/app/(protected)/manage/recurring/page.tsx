'use client';

import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { Tags } from 'lucide-react';
import { ManageCategoriesDialog } from '@/components/manage/manage-categories-dialog';
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
import { formatCurrency, formatDate, parseApiDate, toLocalYMD } from '@/lib/currency';
import { restoreEnteredAmount } from '@/lib/gst';
import type { RecurringTransaction } from '@/lib/types';
import { RecurringModal, PauseRecurringModal, ResumeRecurringModal, DeleteRecurringModal } from '@/components/recurring/recurring-modals';
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { columns, frequencyLabel, recurringState, recurringTone } from "./columns";
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
} from "@tanstack/react-table";
import { useDataTable } from '@/hooks/use-data-table';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAttachment, DetailTimeline, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { getStatusConfig } from '@/lib/status';
import { PageFrame } from '@/components/shared/module/page-frame';

export default function RecurringPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  // Managing types and categories is admin-only; the API checks the active role the same way
  const isAdmin = (user?.role_name || '').toUpperCase() === 'ADMIN';
  const [categoriesOpen, setCategoriesOpen] = useState(false);
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

  const recurringColumns = useMemo(() => columns(currency), [currency]);
  const [activeRow, setActiveRow] = useState<RecurringTransaction | null>(null);
  const { data: runHistory, isLoading: runHistoryLoading } = useRecurringRuns(activeRow?.id);

  // TanStack Table State
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  // Overdue and due soon first
  const [sorting, setSorting] = useState<SortingState>([{ id: 'status', desc: false }]);

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
    next_run: toLocalYMD(),
    end_date: '',
    open_ended: false,
    is_active: true,
    context_type: 'project',
    object_id: '',
    renewal_date: '',
    escalation_pct: '',
    payment_method: '',
    schedule_on: '1st_of_month',
    auto_submit: true,
    notes: ''
  });
  const [recurringFile, setRecurringFile] = useState<File | null>(null);

  useEffect(() => {
    setHeader('Recurring', 'What posts next, how often and for how much');
  }, [setHeader]);

  const table = useDataTable({
    data: recurring,
    columns: recurringColumns,
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
    next_run: toLocalYMD(),
    end_date: '',
    open_ended: false,
    is_active: true,
    context_type: 'project',
    object_id: '',
    renewal_date: '',
    escalation_pct: '',
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
      context_type: (target as any).context_type || 'project',
      object_id: String(((target as any).context_type === 'product' ? target.product_id : (target as any).context_type === 'overhead' ? (target as any).department_id : target.project_id) || ''),
      renewal_date: ((target as any).renewal_date || '').split('T')[0] || '',
      escalation_pct: (target as any).escalation_pct != null ? String((target as any).escalation_pct) : '',
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
        context_type: form.context_type || 'project',
        project_id: form.context_type === 'project' && form.object_id ? Number(form.object_id) : null,
        product_id: form.context_type === 'product' && form.object_id ? Number(form.object_id) : null,
        department_id: form.context_type === 'overhead' && form.object_id ? Number(form.object_id) : null,
        renewal_date: form.type === 'expense' && form.renewal_date ? form.renewal_date : null,
        escalation_pct: form.type === 'expense' && form.escalation_pct !== '' ? Number(form.escalation_pct) : null,
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

  const itemActions: DetailActionDef[] = (() => {
    if (!activeRow || !canManage) return [];
    const st = (((activeRow as any).status) || 'DRAFT').toUpperCase();
    if (['DRAFT', 'SENT_BACK'].includes(st)) {
      return [
        { label: 'Submit', variant: 'primary', onClick: handleSubmit },
        { label: 'Edit', onClick: openEdit },
        { label: 'Delete', variant: 'danger', onClick: handleDelete },
      ] as DetailActionDef[];
    }
    if (st === 'PENDING_FINANCE' && canApprove) {
      return [
        { label: 'Approve', variant: 'primary', onClick: handleApprove },
        { label: 'Reject', variant: 'danger', onClick: handleReject },
      ] as DetailActionDef[];
    }
    if (st === 'APPROVED') {
      return [
        activeRow.is_active
          ? { label: 'Pause', variant: 'primary', onClick: () => handleToggleStatus('pause') }
          : { label: 'Resume', variant: 'primary', onClick: () => handleToggleStatus('resume') },
        { label: 'Edit', onClick: openEdit },
        { label: 'Delete', variant: 'danger', onClick: handleDelete },
      ] as DetailActionDef[];
    }
    return [
      { label: 'Edit', variant: 'primary', onClick: openEdit },
      { label: 'Delete', variant: 'danger', onClick: handleDelete },
    ] as DetailActionDef[];
  })();

  // What posts next and what it costs a month, instead of instructions
  const recurringSummary = (() => {
    const PER_MONTH: Record<string, number> = { daily: 30, weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
    const live = recurring.filter((r: any) => ['Overdue', 'Due soon', 'Active'].includes(recurringState(r)));
    const monthly = live.reduce((a: number, r: any) => a + Number(r.total_amount ?? r.amount ?? 0) * (PER_MONTH[String(r.frequency || '').toLowerCase()] ?? 0), 0);
    const count = (...s: string[]) => recurring.filter((r) => s.includes(recurringState(r))).length;
    return (
      <div className="space-y-4">
        <DetailSummary title="All schedules" subtitle="Repeating transactions" figure={formatCurrency(monthly, currency)} figureLabel="Per month, running schedules" />
        <DetailSection title="Where they stand">
          <DetailGrid>
            <DetailField label="Overdue" value={count('Overdue')} tone={count('Overdue') ? 'danger' : 'muted'} />
            <DetailField label="Due in 7 days" value={count('Due soon')} tone={count('Due soon') ? 'warning' : 'muted'} />
            <DetailField label="Active" value={count('Active')} />
            <DetailField label="Paused" value={count('Paused')} />
            <DetailField label="Waiting for approval" value={count('Pending', 'Draft', 'Sent back')} wide />
          </DetailGrid>
        </DetailSection>
        <p className="text-[12px] text-[var(--shell-text-muted)]">Per month converts each schedule to a monthly amount. Paused and ended schedules are left out.</p>
      </div>
    );
  })();

  return (
    <PageFrame label="Recurring">
    <ModuleShell
      showPanel={!!activeRow}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={<>
            {canManage ? (
              <button className="btn-action" onClick={openAdd}>
                <Plus className="h-4 w-4 text-[var(--success)]" /> Add
              </button>
            ) : null}
            {isAdmin && (
              <button className="btn-action" onClick={() => setCategoriesOpen(true)}>
                <Tags aria-hidden className="h-4 w-4 text-[var(--nav-violet)]" /> Category
              </button>
            )}
          <ToolbarActions actions={itemActions} /></>}
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title={activeRow ? 'Schedule' : 'Summary'}
            onClose={() => setRowSelection({})}
            hasSelection={!!activeRow}
            idle={recurringSummary}
            footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}
          >
            {activeRow && (() => {
              const r: any = activeRow;
              const st = (r.status || 'DRAFT').toUpperCase();
              const cfg = getStatusConfig(st);
              const day = (v?: string | null) => (v ? formatDate(v) : undefined);
              const freq = r.frequency ? frequencyLabel(r.frequency) : undefined;
              const state = recurringState(r);
              return (
                <>
                  <DetailSummary
                    title={r.description || r.code || 'Recurring transaction'}
                    subtitle={[r.code, r.category_name].filter(Boolean).join(' · ')}
                    status={state}
                    statusClass={{ success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', muted: 'text-[var(--shell-text-muted)]' }[recurringTone(state)]}
                    figure={formatCurrency(r.total_amount ?? r.amount, currency)}
                    figureLabel={freq}
                  />

                  <DetailSection title="Schedule">
                    <DetailGrid>
                      <DetailField label="Frequency" value={freq} />
                      <DetailField label="Type" value={String(r.type || 'expense').replace(/^./, (c: string) => c.toUpperCase())} />
                      <DetailField label="Next run" value={day(r.next_run_date)} />
                      <DetailField label="Last run" value={day(r.last_run_date) || 'Not yet run'} />
                      {r.start_date && <DetailField label="Start date" value={day(r.start_date)} />}
                      <DetailField label="End date" value={day(r.end_date) || 'Open-ended'} />
                      {r.client_name && <DetailField label="Client" value={r.client_name} />}
                      {r.project_name && <DetailField label="Project" value={r.project_name} />}
                    </DetailGrid>
                  </DetailSection>

                  <DetailSection title="Payment">
                    <DetailGrid>
                      <DetailField label="Method" value={r.payment_method ? String(r.payment_method).replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase()) : undefined} />
                      <DetailField label="Auto-run" value={r.is_active ? 'Enabled' : 'Paused'} />
                      {r.gst_rate && (
                        <>
                          <DetailField label={`GST (${r.gst_rate}%)`} value={r.gst_included ? 'Included in amount' : 'Added on top'} />
                          <DetailField label="Net amount" value={formatCurrency(r.net_amount ?? r.amount, currency)} />
                        </>
                      )}
                    </DetailGrid>
                  </DetailSection>

                  {r.receipt_path && (
                    <DetailSection title="Document">
                      <DetailAttachment path={r.receipt_path} />
                    </DetailSection>
                  )}

                  <DetailSection title="Run history">
                    {runHistoryLoading ? (
                      <p className="text-[12px] text-[var(--shell-text-muted)]">Loading...</p>
                    ) : !runHistory || runHistory.length === 0 ? (
                      <p className="text-[12px] text-[var(--shell-text-muted)]">No runs yet. The schedule has not been triggered.</p>
                    ) : (
                      <DetailTimeline items={runHistory.map((run: any) => ({
                        title: formatCurrency(run.amount, currency),
                        meta: [day(run.date_recorded), run.status === 'APPROVED' ? 'Posted' : getStatusConfig(run.status).label].filter(Boolean).join(' · '),
                        tone: run.status === 'APPROVED' ? 'success' as const : ['REJECTED', 'VOIDED'].includes(String(run.status).toUpperCase()) ? 'danger' as const : 'muted' as const,
                      }))} />
                    )}
                  </DetailSection>
                </>
              );
            })()}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable
        isLoading={isLoading}
        columns={recurringColumns}
        data={recurring || []}
        tableInstance={table}
        emptyMessage={canManage ? 'No recurring schedules yet. Use Add to set up the first one.' : 'No recurring schedules yet.'}
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
        nextRun={(modalTarget as any)?.next_run_date ? `${formatDate((modalTarget as any).next_run_date)} (${formatCurrency((modalTarget as any).total_amount ?? (modalTarget as any).amount, currency)})` : undefined}
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
        name={(activeRow as any)?.description}
      />
      <ManageCategoriesDialog isOpen={categoriesOpen} onClose={() => setCategoriesOpen(false)} kinds={['expense', 'income']} />
    </ModuleShell>
    </PageFrame>
  );
}
