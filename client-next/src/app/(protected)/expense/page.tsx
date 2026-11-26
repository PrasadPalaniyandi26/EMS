'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { Tags } from 'lucide-react';
import { ManageCategoriesDialog } from '@/components/manage/manage-categories-dialog';
import { useAllTransactions, useCategories, useProjects, useInvalidate, useApprovalTrail } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { formatCurrency, formatDate, parseApiDate, CURRENCY_SYMBOL } from '@/lib/currency';
import { toast } from 'sonner';
import {
  Plus, Pencil, Split, Send, Trash2,
  FileText, ShieldCheck, LayoutGrid, Layers, UploadCloud, Clock, Copy, Ban, PauseCircle, Banknote
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable } from '@/components/data-table/data-table';
import { TransactionModal } from '@/components/transactions/transaction-modal';
import { SplitRowHeadroom } from '@/components/budgets/budget-headroom';
import { sortByCode } from '@/lib/codes';
import { ProcessReimbursementModal } from '@/components/reimbursements/process-reimbursement-modal';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { columns } from './columns';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  RowSelectionState
} from "@tanstack/react-table";
import { useDataTable } from '@/hooks/use-data-table';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { TransactionDetail } from '@/components/transactions/transaction-detail';
import { VoidModal } from '@/components/approvals/approvals-modals';
import { DetailActions, DetailSummary, DetailSection, DetailGrid, DetailField, ToolbarActions, type DetailActionDef, openReceipt } from '@/components/shared/detail/detail-kit';
import { CurrencyInput, useConfirm } from '@/components/shared/modal-primitives';
import { PageFrame } from '@/components/shared/module/page-frame';

export default function ExpensePage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  // Managing types and categories is admin-only; the API checks the active role the same way
  const isAdmin = (user?.role_name || '').toUpperCase() === 'ADMIN';
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const currency = user?.currency || 'INR';
  
  const currencySymbol = CURRENCY_SYMBOL[currency] || '₹';
  const invalidate = useInvalidate();
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();

  const { data: categories } = useCategories();
  const { data: projects } = useProjects();
  // This workspace shows only active expenses (APPROVED/REJECTED are excluded below and
  // live in Approvals history), so the row count is naturally bounded. Request a high
  // limit instead of the default 20 so the full active set is available to the
  // client-side table + faceted filters rather than just the latest 20 records.
  // Rejected and sent-back expenses stay here, because the employee has to act on them (read the reason, then
  // copy and resubmit or delete). Only approved ones leave the list; they are in Approvals history.
  const { data: txnData, isLoading } = useAllTransactions({ type: 'expense', excludeStatus: 'APPROVED' });
  const EXCLUDED_STATUSES = ['APPROVED'];
  const rawTransactions = useMemo(() => {
    if (!txnData) return [];
    const rows = Array.isArray(txnData) ? txnData : (txnData as any).rows || [];
    return rows.filter((t: any) => !EXCLUDED_STATUSES.includes((t.status || '').toUpperCase()));
  }, [txnData]);

  // Combined Categories for Filter
  const facetedCategories = useMemo(() => {
    return (categories || [])
      .filter((c: any) => c.type === 'expense')
      .map((c: any) => ({
        label: c.name,
        value: c.name,
      }));
  }, [categories]);

  // Selection & Modal State
  const [selectedTxn, setSelectedTxn] = useState<any>(null);
  const [splitDetails, setSplitDetails] = useState<any[]>([]);
  const [splitDetailsLoading, setSplitDetailsLoading] = useState(false);
  const { data: approvalTrail } = useApprovalTrail(selectedTxn?.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [processOpen, setProcessOpen] = useState(false);
  const [processTxnId, setProcessTxnId] = useState<number | null>(null);

  const [splitEntries, setSplitEntries] = useState<{ category_id: string; description: string; amount: string; client_id: number | null; project_id: number | null; product_id: number | null }[]>([
    { category_id: '', description: '', amount: '', client_id: null, project_id: null, product_id: null },
    { category_id: '', description: '', amount: '', client_id: null, project_id: null, product_id: null }
  ]);

  const panelFileRef = useRef<HTMLInputElement>(null);
  const [panelUploading, setPanelUploading] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const handleVoid = async (reason: string) => {
    if (!selectedTxn) return;
    try {
      await api.post(`/transactions/${selectedTxn.id}/void`, { reason });
      toast.success('Transaction voided');
      setVoidOpen(false);
      invalidate('transactions', 'dashboard');
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to void transaction');
    }
  };

  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const MAX_FILE_MB = 10;

  const handlePanelFileUpload = async (file: File) => {
    if (!selectedTxn) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Only PDF, JPG, PNG, and WEBP are allowed.');
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${MAX_FILE_MB}MB.`);
      return;
    }
    setPanelUploading(true);
    try {
      const fd = new FormData();
      fd.append('receipt', file);
      const res = await api.post<{ filename: string }>('/receipts/upload', fd);
      const filename = (res as any).data?.filename;
      if (filename) {
        await api.put(`/transactions/${selectedTxn.id}`, { receiptPath: filename });
        toast.success('Receipt uploaded');
        invalidate('transactions');
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setPanelUploading(false);
    }
  };

  const handlePanelDocClick = async () => {
    if (selectedTxn?.receipt_path) {
      await openReceipt(selectedTxn.receipt_path);
    } else {
      panelFileRef.current?.click();
    }
  };

  useEffect(() => {
    setHeader('Expenses', 'Your expenses and where each one is waiting');
  }, [setHeader]);

  const filteredCategories = (categories || []).filter((c: any) => c.type === 'expense');

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  // In the approval chain or already decided: the API refuses to delete these, so the screen does not offer it
  const LOCKED_STATUSES = ['APPROVED', 'REJECTED', 'PENDING_MANAGER', 'PENDING_FINANCE', 'VOIDED'];

  const openSplit = async () => {
    const sr = table.getSelectedRowModel().rows;
    const target = sr.length === 1 ? sr[0].original : selectedTxn;
    if (!target) { toast.error('Select one record to split'); return; }
    if (!['DRAFT', 'SENT_BACK'].includes((target.status || '').toUpperCase())) {
      toast.error('Only draft and sent-back expenses can be split');
      return;
    }
    setEditing(target);
    // Pre-populate with existing splits if already split, otherwise default rows
    if (target.is_split === 1 && splitDetails.length >= 2) {
      setSplitEntries(splitDetails.map((s: any) => ({
        category_id: String(s.category_id || ''),
        description: s.description || '',
        amount: String(s.amount),
        client_id: s.client_id ?? target.client_id ?? null,
        project_id: s.project_id ?? target.project_id ?? null,
        product_id: s.product_id ?? target.product_id ?? null,
      })));
    } else {
      setSplitEntries([
        { category_id: String(target.category_id || ''), description: `${target.description} (Part 1)`, amount: '', client_id: target.client_id ?? null, project_id: target.project_id ?? null, product_id: target.product_id ?? null },
        { category_id: '', description: '', amount: String(target.amount || ''), client_id: target.client_id ?? null, project_id: target.project_id ?? null, product_id: target.product_id ?? null },
      ]);
    }
    setSplitOpen(true);
  };

  const handleSplitExpense = async () => {
    const total = splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    if (Math.round(total * 100) !== Math.round(Number(editing?.amount || 0) * 100)) {
      toast.error('Split total must equal original amount');
      return;
    }
    const validEntries = splitEntries.filter(e => e.category_id && Number(e.amount) > 0);
    if (validEntries.length < 2) {
      toast.error('At least 2 split lines with category and amount are required');
      return;
    }
    try {
      await api.post(`/transactions/${editing.id}/split`, {
        splits: validEntries.map(e => ({
          categoryId: Number(e.category_id),
          amount: Number(e.amount),
          description: e.description || null,
          clientId: editing.client_id ? Number(editing.client_id) : null,
          projectId: editing.project_id ? Number(editing.project_id) : null,
          productId: editing.product_id ? Number(editing.product_id) : null,
        })),
      });
      toast.success('Expense split applied successfully');
      invalidate('transactions', 'dashboard');
      setSplitOpen(false);
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to split transaction');
    }
  };

  const openEdit = () => {
    const sr = table.getSelectedRowModel().rows;
    const target = sr.length === 1 ? sr[0].original : selectedTxn;
    if (!target) { toast.error('Select one record to edit'); return; }
    if (target.status && !['DRAFT', 'SENT_BACK'].includes(target.status.toUpperCase())) {
      toast.error(`Cannot edit expense with status '${target.status}'`);
      return;
    }
    setEditing(target);
    setModalOpen(true);
  };

  const isFinance = (user?.roles || []).some((r: any) => (r.role_name || '').toUpperCase() === 'FINANCE');
  const hasElevatedRole = (user?.roles || []).some((r: any) =>
    ['MANAGER', 'ADMIN', 'FINANCE'].includes((r.role_name || '').toUpperCase())
  );
  const activeRoleIsElevated = ['MANAGER', 'ADMIN', 'FINANCE'].includes((user?.role_name || '').toUpperCase());

  const handleSubmit = async () => {
    const sr = table.getSelectedRowModel().rows;
    const targets = sr.filter((r) => ['DRAFT', 'SENT_BACK'].includes((r.original.status || '').toUpperCase()));
    if (targets.length === 0) {
      toast.error('Select one or more DRAFT or SENT_BACK expenses to submit');
      return;
    }
    if (hasElevatedRole && !activeRoleIsElevated) {
      toast.info(
        `You are currently on the ${user?.role_name} role, but your elevated privileges apply — this expense will go directly to Finance for approval.`,
        { duration: 6000 }
      );
    }
    try {
      // The server checks each expense against its budget line and refuses with the reason when it cannot go ahead
      await Promise.all(targets.map((r) => api.post(`/transactions/${r.original.id}/submit`)));
      toast.success(`${targets.length} expense(s) submitted for approval`);
      invalidate('transactions', 'dashboard');
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit expense(s)');
    }
  };

  const handleDelete = async () => {
    const sr = table.getSelectedRowModel().rows;
    const locked = sr.filter(r => LOCKED_STATUSES.includes((r.original.status || '').toUpperCase()));
    if (locked.length > 0) {
      toast.error('Only draft and sent-back expenses can be deleted');
      return;
    }
    const ids = sr.map(r => r.original.id);
    if (ids.length === 0) { toast.error('Select records to delete'); return; }
    const ok = await confirmDialog('Delete Expense Records', `Delete ${ids.length} expense record(s)? This cannot be undone.`, { confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
       if (ids.length === 1) await api.delete(`/transactions/${ids[0]}`);
       else await api.post('/transactions/bulk-delete', { ids });
       toast.success('Deleted successfully');
       invalidate('transactions', 'dashboard');
       setRowSelection({});
       setSelectedTxn(null);
    } catch { toast.error('Failed to delete'); }
  };

  const expenseColumns = useMemo(() => columns(currency), [currency]);

  // Sent back, rejected and draft first: what the employee has to act on
  const [sorting, setSorting] = useState<SortingState>([{ id: 'status', desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const MOBILE_HIDDEN: string[] = [];
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = (isMobile: boolean) => {
      setColumnVisibility((prev) => {
        const vis: VisibilityState = { ...prev };
        MOBILE_HIDDEN.forEach((col) => { vis[col] = !isMobile; });
        return vis;
      });
    };
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useDataTable({
    data: rawTransactions,
    columns: expenseColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
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
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const sr = table.getSelectedRowModel().rows;
  const selectedCount = sr.length;
  // True when the single selected row is in approval or already decided
  const isSelectedLocked = selectedCount === 1 && LOCKED_STATUSES.includes((sr[0].original.status || '').toUpperCase());

  useEffect(() => {
    const rows = table.getFilteredSelectedRowModel().rows;
    const target = rows.length === 1 ? rows[0].original : null;
    setSelectedTxn(target);
    setSplitDetails([]);
    setNotes([]);
    setNewNote('');
    if (!target) return;
    let cancelled = false;

    if (target.is_split) {
      setSplitDetailsLoading(true);
      api.get(`/transactions/${target.id}/splits`)
        .then((r) => { if (!cancelled) setSplitDetails(r.data as any[]); })
        .catch(() => { if (!cancelled) setSplitDetails([]); })
        .finally(() => { if (!cancelled) setSplitDetailsLoading(false); });
    }

    setNotesLoading(true);
    api.get(`/transactions/${target.id}/notes`)
      .then((r) => { if (!cancelled) setNotes(r.data as any[]); })
      .catch(() => { if (!cancelled) setNotes([]); })
      .finally(() => { if (!cancelled) setNotesLoading(false); });

    return () => { cancelled = true; };
  }, [rowSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddNote = async () => {
    if (!selectedTxn || !newNote.trim() || noteSaving) return;
    setNoteSaving(true);
    try {
      const res = await api.post(`/transactions/${selectedTxn.id}/notes`, { note: newNote.trim() });
      setNotes((prev) => [...prev, res.data as any]);
      setNewNote('');
    } catch { toast.error('Failed to add note'); }
    finally { setNoteSaving(false); }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      await api.delete(`/transactions/notes/${noteId}`);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch { toast.error('Failed to delete note'); }
  };

  // One list of actions for the selected item, shown in the toolbar and pinned in the panel (same commands, either place)
  const itemActions: DetailActionDef[] = (() => {
    if (!selectedTxn) return [];
    const st = (selectedTxn.status || '').toUpperCase();
    if (['DRAFT', 'SENT_BACK'].includes(st)) {
      return [
        { label: 'Submit', variant: 'primary', onClick: handleSubmit },
        ...(selectedTxn.context_type === 'stock' ? [] : [{ label: selectedTxn.is_split === 1 ? 'Re-split' : 'Split', icon: <Split className="h-4 w-4 text-[var(--warning)]" />, onClick: openSplit }]),
        { label: 'Edit', onClick: openEdit },
        { label: 'Delete', variant: 'danger', onClick: handleDelete },
      ];
    }
    const isFinance = (user?.roles || []).some((r: any) => ['FINANCE', 'ADMIN'].includes((r.role_name || '').toUpperCase()));
    if (st === 'APPROVED' && isFinance) {
      const owed = selectedTxn.needs_reimbursement && selectedTxn.reimbursement_status !== 'PAID';
      return [
        ...(owed ? [{ label: 'Process reimbursement', variant: 'primary' as const, icon: <Banknote className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setProcessTxnId(selectedTxn.id); setProcessOpen(true); } }] : []),
        { label: 'Void', variant: 'danger', onClick: () => setVoidOpen(true) },
      ];
    }
    return [];
  })();

  // Where the employee's expenses stand, instead of instructions
  const expenseSummary = (() => {
    const by = (s: string) => rawTransactions.filter((t: any) => (t.status || '').toUpperCase() === s);
    const sum = (rows: any[]) => rows.reduce((a, t) => a + Number(t.total_amount ?? t.amount ?? 0), 0);
    const waiting = [...by('PENDING_MANAGER'), ...by('PENDING_FINANCE')];
    return (
      <div className="space-y-4">
        <DetailSummary title="Your expenses" subtitle="Not yet approved" figure={rawTransactions.length} figureLabel="Expenses" />
        <DetailSection title="Where they are">
          <DetailGrid>
            <DetailField label="Sent back" value={by('SENT_BACK').length} tone={by('SENT_BACK').length ? 'warning' : 'muted'} />
            <DetailField label="Rejected" value={by('REJECTED').length} tone={by('REJECTED').length ? 'danger' : 'muted'} />
            <DetailField label="Draft" value={by('DRAFT').length} />
            <DetailField label="Waiting for approval" value={waiting.length} />
            <DetailField label="Amount waiting" value={formatCurrency(sum(waiting), currency)} wide />
          </DetailGrid>
        </DetailSection>
        <p className="text-[12px] text-[var(--shell-text-muted)]">Sent back and rejected expenses stay here until you fix or delete them.</p>
      </div>
    );
  })();

  return (
    <PageFrame label="Expense">
    <ModuleShell
      showPanel={!!selectedTxn}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={<>
            <button className="btn-action" onClick={openAdd}>
              <Plus className="h-4 w-4 text-[var(--success)]" /> Add
            </button>
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
            title={selectedTxn ? 'Expense' : 'Summary'}
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedTxn}
            idle={expenseSummary}
            footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}
          >
            {selectedTxn && (
              <>
                <input
                  ref={panelFileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePanelFileUpload(f); e.target.value = ''; }}
                />
                <TransactionDetail
                  kind="expense"
                  txn={selectedTxn}
                  currency={currency}
                  approvalTrail={approvalTrail}
                  split={{ details: splitDetails, loading: splitDetailsLoading }}
                  notes={{ items: notes, loading: notesLoading, value: newNote, onChange: setNewNote, onAdd: handleAddNote, saving: noteSaving, onDelete: handleDeleteNote, currentUserId: user?.id }}
                  upload={{ uploading: panelUploading, onPick: () => panelFileRef.current?.click() }}
                />
              </>
            )}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable
        isLoading={isLoading}
        columns={expenseColumns}
        data={rawTransactions}
        tableInstance={table}
        emptyMessage="No expense records. Click Add to create one."
      />

      {confirmDialogEl}

      {/* Add / Edit Expense Modal */}
      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        type="expense"
        editing={editing}
        onSaved={() => setRowSelection({})}
      />

      {/* Process Reimbursement Modal */}
      <ProcessReimbursementModal
        isOpen={processOpen}
        onClose={() => setProcessOpen(false)}
        selectedCount={1}
        mode="single"
        onConfirm={async (dto) => {
          try {
            await api.post(`/transactions/bulk-reimburse`, { ids: [processTxnId], ...dto });
            toast.success(dto.status === 'PAID' ? 'Marked as reimbursed' : 'Put on hold');
            invalidate('transactions', 'reimbursements');
            setProcessOpen(false);
          } catch (e: any) {
            toast.error(e?.message || 'Failed to process payment');
            throw e;
          }
        }}
      />

      {/* Split Transaction Modal */}
      <ModuleModal
        isOpen={splitOpen}
        onClose={() => setSplitOpen(false)}
        title="Split Expense Record"
        icon={<Split className="h-4 w-4" />}
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setSplitOpen(false)}
              className="h-8 px-4 text-[12px] font-medium"
              style={{ color: 'var(--shell-text-muted)' }}
            >
              Cancel
            </Button>
            <Button
              className="font-semibold text-[12px] h-8 px-5 rounded-lg transition-all active:scale-95"
              style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}
              onClick={handleSplitExpense}
            >
              Verify &amp; Apply Split
            </Button>
          </>
        }
      >
        {/* Summary cards */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 flex flex-col gap-0.5 rounded-lg p-2.5 bg-[var(--shell-hover)] border border-[var(--shell-border)]">
            <p className="text-[var(--shell-accent)] text-[12px] font-semibold">Original</p>
            <p className="text-[var(--shell-text)] text-[13px] font-semibold">{formatCurrency(Number(editing?.amount || 0), currency)}</p>
          </div>
          <div className="flex-1 flex flex-col gap-0.5 rounded-lg p-2.5 bg-[color-mix(in_srgb,var(--info)_10%,transparent)] border border-[color-mix(in_srgb,var(--info)_20%,transparent)]">
            <p className="text-[var(--info)] text-[12px] font-semibold">Split Total</p>
            <p className="text-[var(--info)] text-[13px] font-semibold">
              {formatCurrency(splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), currency)}
            </p>
          </div>
          <div className="flex-1 flex flex-col gap-0.5 rounded-lg p-2.5 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_20%,transparent)]">
            <p className="text-[var(--warning)] text-[12px] font-semibold">Remaining</p>
            <p className="text-[var(--warning)] text-[13px] font-semibold">
              {formatCurrency(Number(editing?.amount || 0) - splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), currency)}
            </p>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid gap-2 mb-1" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <p className="text-[12px] font-semibold text-[var(--shell-text-muted)] px-1">Category</p>
          <p className="text-[12px] font-semibold text-[var(--shell-text-muted)] px-1">Description</p>
          <p className="text-[12px] font-semibold text-[var(--shell-text-muted)] px-1 text-right">Amount</p>
        </div>

        {/* Split rows */}
        <div className="space-y-2">
          {splitEntries.map((entry, idx) => (
            <div key={idx} className="space-y-1">
            <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <Select value={entry.category_id} onValueChange={(v) => { const neu = [...splitEntries]; neu[idx].category_id = v; setSplitEntries(neu); }}>
                <SelectTrigger className="h-10 bg-[var(--shell-surface)] border-[var(--shell-border)] text-[var(--shell-text)] text-sm">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {sortByCode(filteredCategories).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.code ? `${c.code} ${c.name}` : c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="h-10 bg-[var(--shell-surface)] border-[var(--shell-border)] text-[var(--shell-text)] text-sm placeholder:text-[var(--shell-text-muted)]"
                placeholder="Description..."
                value={entry.description}
                onChange={(e) => { const neu = [...splitEntries]; neu[idx].description = e.target.value; setSplitEntries(neu); }}
              />
              <CurrencyInput
                symbol={currencySymbol}
                value={entry.amount}
                onChange={(v) => {
                  const neu = [...splitEntries];
                  neu[idx].amount = v;
                  const lastIdx = neu.length - 1;
                  if (idx !== lastIdx) {
                    const used = neu.slice(0, lastIdx).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
                    const remaining = Math.max(0, Number(editing?.amount || 0) - used);
                    neu[lastIdx].amount = remaining > 0 ? String(remaining) : '';
                  }
                  setSplitEntries(neu);
                }}
                className="h-10 text-sm text-right pr-2"
              />
            </div>
            <SplitRowHeadroom txn={editing} categoryId={entry.category_id} amount={entry.amount} currency={currency} />
            </div>
          ))}
        </div>

        <button
          className="mt-3 flex items-center gap-1.5 text-[var(--shell-accent)] font-semibold text-[12px]"
          onClick={() => {
            const used = splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
            const remaining = Math.max(0, (editing?.amount || 0) - used);
            setSplitEntries([...splitEntries, { category_id: '', description: '', amount: remaining > 0 ? String(remaining) : '', client_id: editing?.client_id ?? null, project_id: editing?.project_id ?? null, product_id: editing?.product_id ?? null }]);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add Line Item
        </button>
      </ModuleModal>

      <VoidModal
        isOpen={voidOpen}
        onClose={() => setVoidOpen(false)}
        selectedRequest={selectedTxn ? { id: selectedTxn.id, code: selectedTxn.reference_id, submitted_by_name: selectedTxn.submitted_by_name, amount: selectedTxn.total_amount ?? selectedTxn.amount, description: selectedTxn.description, category_name: selectedTxn.category_name } : null}
        onConfirm={({ reason }: { reason?: string }) => handleVoid(reason || '')}
      />
      <ManageCategoriesDialog isOpen={categoriesOpen} onClose={() => setCategoriesOpen(false)} kinds={['expense']} />
    </ModuleShell>
    </PageFrame>
  );
}
