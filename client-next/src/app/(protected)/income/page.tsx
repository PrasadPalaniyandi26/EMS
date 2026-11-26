'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { Tags } from 'lucide-react';
import { ManageCategoriesDialog } from '@/components/manage/manage-categories-dialog';
import { useAllTransactions, useCategories, useClients, useProjects, useInvalidate, useApprovalTrail } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { formatCurrency, formatDate, parseApiDate, CURRENCY_SYMBOL } from '@/lib/currency';
import { STATUS_CONFIG } from '@/lib/status';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, Pencil, Split, Send, Trash2,
  FileText, ShieldCheck, LayoutGrid, Layers, UploadCloud, Clock, Ban
} from 'lucide-react';
import { TransactionModal } from '@/components/transactions/transaction-modal';
import { Button } from '@/components/ui/button';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { DataTable } from '@/components/data-table/data-table';
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

export default function IncomePage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  // Managing types and categories is admin-only; the API checks the active role the same way
  const isAdmin = (user?.role_name || '').toUpperCase() === 'ADMIN';
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const currency = user?.currency || 'INR';
  const canManage = (user?.roles || []).some((r: any) =>
    ['MANAGER', 'ADMIN', 'FINANCE'].includes(r.role_name?.toUpperCase())
  );
  const isFinance = (user?.roles || []).some((r: any) => r.role_name?.toUpperCase() === 'FINANCE');
  const canSubmit = canManage; // Finance can submit their own income too
  
  const currencySymbol = CURRENCY_SYMBOL[currency] || '₹';
  const invalidate = useInvalidate();
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();

  const { data: clients } = useClients();
  const { data: categories } = useCategories();
  const { data: projects } = useProjects();
  // Income is auto-approved on submit, so hiding APPROVED/REJECTED would make a record vanish from
  // the page it was entered on. Show every status and let the toolbar filter narrow it down.
  // Request a high limit instead of the default 20 so the client-side table has the full set.
  const { data: txnData, isLoading } = useAllTransactions({ type: 'income' });

  // In the approval chain or already decided: the API refuses to delete these, so the screen does not offer it
  const LOCKED_STATUSES = ['APPROVED', 'REJECTED', 'PENDING_MANAGER', 'PENDING_FINANCE', 'VOIDED'];
  const [statusFilter, setStatusFilter] = useState('all');
  const rawTransactions = useMemo(() => {
    if (!txnData) return [];
    const rows = Array.isArray(txnData) ? txnData : (txnData as any).rows || [];
    return statusFilter === 'all'
      ? rows
      : rows.filter((t: any) => (t.status || '').toUpperCase() === statusFilter);
  }, [txnData, statusFilter]);

  // Combined Categories for Filter
  const facetedCategories = useMemo(() => {
    return (categories || [])
      .filter((c: any) => c.type === 'income')
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

  const [splitEntries, setSplitEntries] = useState([
    { category_id: '', description: '', amount: '' },
    { category_id: '', description: '', amount: '' }
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
      const res = await api.post<{ filename: string }>('/receipts/upload?type=invoice', fd);
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
    setHeader('Income', 'Money received, by client and period');
  }, [setHeader]);

  const filteredCategories = (categories || []).filter((c: any) => c.type === 'income');

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = () => {
    const sr = table.getSelectedRowModel().rows;
    const target = sr.length === 1 ? sr[0].original : selectedTxn;
    if (!target) { toast.error('Select one record to edit'); return; }
    if (target.status && !['DRAFT', 'SENT_BACK'].includes(target.status.toUpperCase())) {
      toast.error(`Cannot edit income with status '${target.status}'`);
      return;
    }
    setEditing(target);
    setModalOpen(true);
  };

  const openSplit = () => {
    const sr = table.getSelectedRowModel().rows;
    const target = sr.length === 1 ? sr[0].original : selectedTxn;
    if (!target) { toast.error('Select one record to split'); return; }
    if (!['DRAFT', 'SENT_BACK'].includes((target.status || '').toUpperCase())) {
      toast.error('Only draft and sent-back income records can be split');
      return;
    }
    setEditing(target);
    setSplitEntries([
      { category_id: String(target.category_id || ''), description: `${target.description} (Part 1)`, amount: '' },
      { category_id: '', description: '', amount: String(target.amount || '') }
    ]);
    setSplitOpen(true);
  };

  const handleSplitIncome = async () => {
    const total = splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    // Use integer cent comparison to avoid JS floating-point precision errors
    if (Math.round(total * 100) !== Math.round((editing?.amount || 0) * 100)) {
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
        })),
      });
      toast.success('Income split applied successfully');
      invalidate('transactions', 'dashboard');
      setSplitOpen(false);
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to split transaction');
    }
  };

  const hasElevatedRole = (user?.roles || []).some((r: any) =>
    ['MANAGER', 'ADMIN', 'FINANCE'].includes((r.role_name || '').toUpperCase())
  );
  const activeRoleIsElevated = ['MANAGER', 'ADMIN', 'FINANCE'].includes((user?.role_name || '').toUpperCase());

  const handleSubmit = async () => {
    const sr = table.getSelectedRowModel().rows;
    if (sr.length === 0) { toast.error('Select one or more income records to submit'); return; }
    const submittable = sr.filter((r) => {
      const s = (r.original.status || '').toUpperCase();
      return ['DRAFT', 'SENT_BACK'].includes(s);
    });
    if (submittable.length === 0) {
      toast.error('No submittable income records selected');
      return;
    }
    if (hasElevatedRole && !activeRoleIsElevated) {
      toast.info(
        `You are currently on the ${user?.role_name} role, but your elevated privileges apply — this income will go directly to Finance for approval.`,
        { duration: 6000 }
      );
    }
    try {
      await Promise.all(submittable.map((r) => api.post(`/transactions/${r.original.id}/submit`)));
      toast.success(`${submittable.length} income record(s) submitted`);
      invalidate('transactions', 'dashboard');
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit income record(s)');
    }
  };

  const handleDelete = async () => {
    const sr = table.getSelectedRowModel().rows;
    const locked = sr.filter(r => LOCKED_STATUSES.includes((r.original.status || '').toUpperCase()));
    if (locked.length > 0) {
      toast.error('Only draft and sent-back income records can be deleted');
      return;
    }
    const ids = sr.map(r => r.original.id);
    if (ids.length === 0) { toast.error('Select records to delete'); return; }
    const ok = await confirmDialog('Delete Income Records', `Delete ${ids.length} income record(s)? This cannot be undone.`, { confirmLabel: 'Delete', destructive: true });
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

  const incomeColumns = useMemo(() => columns(currency), [currency]);

  // Newest first, so the order never depends on how the server happens to return it
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date_recorded', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');

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

  const table = useDataTable({
    data: rawTransactions,
    columns: incomeColumns,
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
      setNotes((prev) => prev.filter((n: any) => n.id !== noteId));
    } catch { toast.error('Failed to delete note'); }
  };

  // What has been received, instead of instructions
  const incomeSummary = (() => {
    const rows = rawTransactions as any[];
    const counted = rows.filter((t) => !['VOIDED', 'REJECTED'].includes((t.status || '').toUpperCase()));
    const total = (xs: any[]) => xs.reduce((a, t) => a + Number(t.total_amount ?? t.amount ?? 0), 0);
    const now = new Date();
    const thisMonth = counted.filter((t) => { const d = parseApiDate(t.date_recorded); return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
    const gst = counted.reduce((a, t) => a + (Number(t.total_amount ?? t.amount ?? 0) - Number(t.net_amount ?? t.total_amount ?? t.amount ?? 0)), 0);
    return (
      <div className="space-y-4">
        <DetailSummary title="Income" subtitle="Money received" figure={formatCurrency(total(counted), currency)} figureLabel="Total received" />
        <DetailSection title="Where it stands">
          <DetailGrid>
            <DetailField label="Records" value={counted.length} />
            <DetailField label="This month" value={formatCurrency(total(thisMonth), currency)} />
            <DetailField label="GST in the total" value={formatCurrency(gst, currency)} />
            <DetailField label="No invoice attached" value={counted.filter((t) => !t.receipt_path).length} tone={counted.some((t) => !t.receipt_path) ? 'warning' : 'muted'} />
            <DetailField label="Not yet approved" value={counted.filter((t) => (t.status || '').toUpperCase() !== 'APPROVED').length} wide />
          </DetailGrid>
        </DetailSection>
      </div>
    );
  })();

  // One list of actions for the selected item, shown in the toolbar and pinned in the panel (same commands, either place)
  const itemActions: DetailActionDef[] = (() => {
    if (!selectedTxn) return [];
    const st = (selectedTxn.status || '').toUpperCase();
    if (['DRAFT', 'SENT_BACK'].includes(st)) {
      return [
        { label: 'Submit', variant: 'primary', onClick: handleSubmit },
        { label: 'Edit', onClick: openEdit },
        { label: 'Delete', variant: 'danger', onClick: handleDelete },
      ];
    }
    if (st === 'APPROVED' && (user?.roles || []).some((r: any) => ['FINANCE', 'ADMIN'].includes((r.role_name || '').toUpperCase()))) {
      return [{ label: 'Void', variant: 'danger', onClick: () => setVoidOpen(true) }];
    }
    return [];
  })();

  return (
    <PageFrame label="Income">
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
          extra={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[150px] rounded-md text-[13px]" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).filter(([key]) => key !== 'PENDING_MANAGER').map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title={selectedTxn ? 'Income' : 'Summary'}
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedTxn}
            idle={incomeSummary}
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
                  kind="income"
                  txn={selectedTxn}
                  currency={currency}
                  approvalTrail={approvalTrail}
                  split={{ details: splitDetails, loading: splitDetailsLoading, onSplit: openSplit }}
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
        columns={incomeColumns}
        data={rawTransactions}
        tableInstance={table}
        emptyMessage="No income recorded yet. Use Add to record the first one."
      />

      {confirmDialogEl}

      {/* Add / Edit Income Modal */}
      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        type="income"
        editing={editing}
        onSaved={() => setRowSelection({})}
      />

      {/* Split Transaction Modal */}
      <ModuleModal
        isOpen={splitOpen}
        onClose={() => setSplitOpen(false)}
        title="Split Income Record"
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
              onClick={handleSplitIncome}
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
        <div className="grid gap-2 mb-1" style={{ gridTemplateColumns: '2fr 3fr 1.5fr' }}>
          <p className="text-[12px] font-semibold text-[var(--shell-text-muted)] px-1">Category</p>
          <p className="text-[12px] font-semibold text-[var(--shell-text-muted)] px-1">Description</p>
          <p className="text-[12px] font-semibold text-[var(--shell-text-muted)] px-1 text-right">Amount</p>
        </div>

        {/* Split rows */}
        <div className="space-y-2">
          {splitEntries.map((entry, idx) => (
            <div key={idx} className="grid gap-2 items-center" style={{ gridTemplateColumns: '2fr 3fr 1.5fr' }}>
              <Select value={entry.category_id} onValueChange={(v) => {
                const neu = [...splitEntries]; neu[idx].category_id = v; setSplitEntries(neu);
              }}>
                <SelectTrigger className="h-8 bg-[var(--shell-surface)] border-[var(--shell-border)] text-[var(--shell-text)] text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="h-8 bg-[var(--shell-surface)] border-[var(--shell-border)] text-[var(--shell-text)] text-xs placeholder:text-[var(--shell-text-muted)]"
                placeholder="Description..."
                value={entry.description}
                onChange={(e) => { const neu = [...splitEntries]; neu[idx].description = e.target.value; setSplitEntries(neu); }}
              />
              <CurrencyInput
                symbol={currencySymbol}
                value={entry.amount}
                onChange={(v) => { const neu = [...splitEntries]; neu[idx].amount = v; setSplitEntries(neu); }}
                className="h-8 text-xs text-right pr-2"
              />
            </div>
          ))}
        </div>

        <button
          className="mt-3 flex items-center gap-1.5 text-[var(--shell-accent)] font-semibold text-[12px]"
          onClick={() => {
            const used = splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
            const remaining = Math.max(0, (editing?.amount || 0) - used);
            setSplitEntries([...splitEntries, { category_id: '', description: '', amount: remaining > 0 ? String(remaining) : '' }]);
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
      <ManageCategoriesDialog isOpen={categoriesOpen} onClose={() => setCategoriesOpen(false)} kinds={['income']} />
    </ModuleShell>
    </PageFrame>
  );
}
