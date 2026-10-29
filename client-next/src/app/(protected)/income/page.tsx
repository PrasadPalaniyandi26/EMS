'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactions, useCategories, useClients, useProjects, useInvalidate, useApprovalTrail } from '@/hooks/use-queries';
import api, { getAccessToken, API_BASE } from '@/lib/api-client';
import { formatCurrency, formatDate, CURRENCY_SYMBOL } from '@/lib/currency';
import { STATUS_CONFIG } from '@/lib/status';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, Pencil, Split, Send, Trash2,
  FileText, ShieldCheck, LayoutGrid, Layers, UploadCloud, Clock, Copy, Ban
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
import { CurrencyInput, useConfirm } from '@/components/shared/modal-primitives';

export default function IncomePage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
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
  const { data: txnData, isLoading } = useTransactions({ type: 'income', limit: '500' });

  const LOCKED_STATUSES = ['APPROVED', 'REJECTED'];
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
  const [voidReason, setVoidReason] = useState('');
  const [voidSaving, setVoidSaving] = useState(false);

  const handleDuplicate = async () => {
    if (!selectedTxn) return;
    try {
      await api.post(`/transactions/${selectedTxn.id}/duplicate`);
      toast.success('Duplicate created as DRAFT');
      invalidate('transactions');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to duplicate');
    }
  };

  const handleVoid = async () => {
    if (!selectedTxn || voidSaving) return;
    setVoidSaving(true);
    try {
      await api.post(`/transactions/${selectedTxn.id}/void`, { reason: voidReason });
      toast.success('Transaction voided');
      setVoidOpen(false);
      setVoidReason('');
      invalidate('transactions', 'dashboard');
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to void transaction');
    } finally {
      setVoidSaving(false);
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
      try {
        const token = getAccessToken();
        const res = await fetch(`${API_BASE}/receipts/${selectedTxn.receipt_path}`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), '_blank');
      } catch {
        toast.error('Failed to open receipt');
      }
    } else {
      panelFileRef.current?.click();
    }
  };

  useEffect(() => {
    setHeader('Income Manager', 'Manage and track your organization\'s income');
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
    if ((target.status || '').toUpperCase() !== 'DRAFT') {
      toast.error('Only DRAFT income records can be split');
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
      toast.error('Cannot delete income record(s) with status APPROVED or REJECTED');
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

  const [sorting, setSorting] = useState<SortingState>([]);
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

  return (
    <ModuleShell
      showPanel={!!selectedTxn}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={
            <>
              <button className="btn-action" onClick={openAdd}>
                <Plus className="h-4 w-4 text-[var(--success)]" /> Add
              </button>
              <button
                className="btn-action"
                onClick={openEdit}
                disabled={selectedCount !== 1 || !['DRAFT', 'SENT_BACK'].includes((sr[0]?.original?.status || '').toUpperCase())}
              >
                <Pencil className="h-4 w-4 text-[var(--info)]" /> Edit
              </button>
              <button
                className="btn-action"
                onClick={openSplit}
                disabled={selectedCount !== 1 || !['DRAFT', 'SENT_BACK'].includes((sr[0]?.original?.status || '').toUpperCase())}
              >
                <Split className="h-4 w-4 text-[var(--info)]" /> Split
              </button>
              <button
                className="btn-action"
                onClick={handleSubmit}
                disabled={selectedCount === 0 || !sr.some(r => ['DRAFT', 'SENT_BACK'].includes((r.original.status || '').toUpperCase()))}
              >
                <Send className="h-4 w-4 text-[var(--shell-accent)]" /> Submit
              </button>
              <button className="btn-action" onClick={handleDelete} disabled={selectedCount === 0}>
                <Trash2 className="h-4 w-4 text-[var(--danger)]" /> Delete{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </button>
            </>
          }
          extra={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[150px] rounded-md text-[13px]" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title="Transaction Detail"
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedTxn}
          >
            {selectedTxn && (
            <div className="flex-1 space-y-4">
              {/* Primary Document */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <FileText className="w-3.5 h-3.5" /> Primary Document
                </label>
                <input
                  ref={panelFileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePanelFileUpload(f); e.target.value = ''; }}
                />
                <div
                  className={`h-32 rounded-xl flex flex-col items-center justify-center group cursor-pointer transition-all ${selectedTxn?.receipt_path ? 'border-2 border-[var(--shell-accent)]/40 hover:border-[var(--shell-accent)]' : 'hover:brightness-105'}`}
                  style={selectedTxn?.receipt_path ? { background: 'linear-gradient(135deg, rgba(74,111,83,0.12) 0%, rgba(74,111,83,0.05) 100%)' } : { background: 'var(--shell-bg)', border: '1px solid var(--shell-border)' }}
                  onClick={handlePanelDocClick}
                >
                  {panelUploading ? (
                    <>
                      <UploadCloud className="w-8 h-8 mb-2 text-[var(--shell-text-muted)] animate-pulse" />
                      <p className="text-[11px] font-bold text-[var(--shell-text-muted)]">Uploading...</p>
                    </>
                  ) : selectedTxn?.receipt_path ? (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-[var(--shell-accent)]/20 border border-[var(--shell-accent)]/30 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <FileText className="w-5 h-5 text-[var(--shell-accent)]" />
                      </div>
                      <p className="text-[11px] font-bold text-[var(--shell-accent)] truncate max-w-[160px] px-2">{selectedTxn.receipt_path.split('/').pop()}</p>
                      <p className="text-[11px] text-[var(--shell-accent)]/60 mt-0.5 font-medium">Click to view full screen</p>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-[var(--shell-hover)] border border-[var(--shell-border)] flex items-center justify-center mb-2">
                        <FileText className="w-5 h-5 text-[var(--shell-text-muted)]" />
                      </div>
                      <p className="text-[11px] font-bold text-[var(--shell-text-muted)]">No Receipt or Invoice</p>
                      <p className="text-[11px] text-[var(--shell-text-muted)] opacity-60 mt-0.5 font-medium">Click to upload PDF, JPG, PNG</p>
                    </>
                  )}
                </div>
              </div>

              {/* Info fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-[var(--shell-text-muted)]">Description</label>
                  <p className="text-[11px] text-[var(--shell-text-muted)] bg-[var(--shell-hover)] px-2 py-1.5 rounded-lg mt-0.5 border border-[var(--shell-border)] leading-relaxed">{selectedTxn.description || 'No description provided'}</p>
                </div>

                {/* Amount breakdown */}
                <div className="col-span-2 rounded-xl border border-[var(--shell-border)] overflow-hidden">
                  {selectedTxn.gst_rate != null && (
                    <>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--shell-border)]">
                        <span className="text-[11px] font-bold text-[var(--shell-text-muted)]">Net Amount</span>
                        <span className="text-[12px] font-bold text-black dark:text-white">{formatCurrency(selectedTxn.net_amount ?? selectedTxn.amount, currency)}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--shell-border)]">
                        <span className="text-[11px] font-bold text-[var(--shell-text-muted)]">GST ({selectedTxn.gst_rate}%)</span>
                        <span className="text-[12px] font-bold text-black dark:text-white">
                          {formatCurrency((selectedTxn.total_amount ?? selectedTxn.amount) - (selectedTxn.net_amount ?? selectedTxn.amount), currency)}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--shell-accent)]/5">
                    <span className="text-[11px] font-bold text-[var(--shell-accent)]">Total Amount</span>
                    <span className="text-[14px] font-black text-black dark:text-white">{formatCurrency(selectedTxn.total_amount ?? selectedTxn.amount, currency)}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--shell-text-muted)]">Date Recorded</label>
                  <p className="text-[12px] font-bold mt-0.5 text-black dark:text-white">{formatDate(selectedTxn.date_recorded)}</p>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[var(--shell-text-muted)]">Payment Method</label>
                  <p className="text-[12px] font-bold mt-0.5 text-black dark:text-white capitalize">{selectedTxn.payment_method || '—'}</p>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[var(--shell-text-muted)]">Category</label>
                  <p className="text-[12px] font-bold mt-0.5 text-black dark:text-white">{selectedTxn.category_name || '—'}</p>
                </div>
              </div>

              {/* Fund Allocation */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" /> Fund Allocation
                </label>
                {selectedTxn.is_split === 1 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-[color-mix(in_srgb,var(--success)_12%,transparent)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] rounded-full text-[11px] font-bold text-[var(--success)]">
                        <Layers className="w-3 h-3" /> Split Income
                      </span>
                      <button onClick={openSplit} className="text-[11px] font-bold text-[var(--shell-accent)] hover:underline">Re-split →</button>
                    </div>
                    {splitDetailsLoading ? (
                      <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">Loading split details...</p>
                    ) : splitDetails.length > 0 ? (
                      <div className="space-y-2">
                        {splitDetails.map((s: any, i: number) => {
                          const pct = ((s.amount / selectedTxn.amount) * 100).toFixed(1);
                          return (
                            <div key={s.id ?? i}>
                              <div className="flex items-center justify-between mb-0.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-[var(--shell-accent)]/10 text-[var(--shell-accent)] text-[11px] font-black flex items-center justify-center">{i + 1}</span>
                                  <span className="text-[11px] font-bold text-black dark:text-white truncate">{s.category_name || `Split ${i + 1}`}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="text-[11px] font-bold text-[var(--shell-accent)]">{pct}%</span>
                                  <span className="text-[11px] font-black text-black dark:text-white">{formatCurrency(s.amount, currency)}</span>
                                </div>
                              </div>
                              <div className="w-full bg-[var(--shell-hover)] rounded-full h-1 overflow-hidden">
                                <div className="bg-[var(--shell-accent)] h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              {(s.description || s.project_name) && (
                                <p className="text-[11px] text-[var(--shell-text-muted)] mt-0.5 truncate">
                                  {[s.description, s.project_name && `[${s.project_name}]`].filter(Boolean).join(' ')}
                                </p>
                              )}
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between pt-1.5 border-t border-[var(--shell-border)]">
                          <span className="text-[11px] font-bold text-[var(--shell-text-muted)]">{splitDetails.length} splits · Total</span>
                          <span className="text-[12px] font-black text-[var(--shell-accent)]">{formatCurrency(selectedTxn.amount, currency)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">No split details available.</p>
                    )}
                  </div>
                ) : (selectedTxn.project_name || selectedTxn.product_name) ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-black dark:text-white">{selectedTxn.project_name || selectedTxn.product_name}</span>
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

              {/* Approval Trail */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <Clock className="w-3.5 h-3.5" /> Approval Trail
                </label>
                {(() => {
                  const sentBackComment = approvalTrail?.find((r: any) => r.status === 'SENT_BACK')?.comments;
                  const approvedComment = approvalTrail?.find((r: any) => r.status === 'APPROVED')?.comments;
                  const rejectedComment = approvalTrail?.find((r: any) => r.status === 'REJECTED')?.comments;
                  return (
                    <div className="space-y-2">
                      {selectedTxn.submitted_at && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--info)] mt-1.5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-bold text-black dark:text-white">
                              Submitted by <span className="text-[var(--shell-accent)]">{selectedTxn.submitted_by_name || 'User'}</span>
                            </p>
                            <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">{formatDate(selectedTxn.submitted_at)}</p>
                          </div>
                        </div>
                      )}
                      {selectedTxn.sent_back_at && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] mt-1.5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-bold text-black dark:text-white">
                              Sent back by <span className="text-[var(--warning)]">{selectedTxn.sent_back_by_name}</span>
                              {selectedTxn.sent_back_by_role && <span className="text-[var(--shell-text-muted)]"> ({selectedTxn.sent_back_by_role})</span>}
                            </p>
                            <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">{formatDate(selectedTxn.sent_back_at)}</p>
                            {sentBackComment && <p className="text-[11px] text-[var(--warning)] mt-0.5 italic">"{sentBackComment}"</p>}
                          </div>
                        </div>
                      )}
                      {selectedTxn.approved_at && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)] mt-1.5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-bold text-black dark:text-white">
                              Approved by <span className="text-[var(--success)]">{selectedTxn.approved_by_name}</span>
                              {selectedTxn.approved_by_role && <span className="text-[var(--shell-text-muted)]"> ({selectedTxn.approved_by_role})</span>}
                            </p>
                            <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">{formatDate(selectedTxn.approved_at)}</p>
                            {approvedComment && <p className="text-[11px] text-[var(--success)] mt-0.5 italic">"{approvedComment}"</p>}
                          </div>
                        </div>
                      )}
                      {selectedTxn.rejected_at && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] mt-1.5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-bold text-black dark:text-white">
                              Rejected by <span className="text-[var(--danger)]">{selectedTxn.rejected_by_name}</span>
                              {selectedTxn.rejected_by_role && <span className="text-[var(--shell-text-muted)]"> ({selectedTxn.rejected_by_role})</span>}
                            </p>
                            <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">{formatDate(selectedTxn.rejected_at)}</p>
                            {rejectedComment && <p className="text-[11px] text-[var(--danger)] mt-0.5 italic">"{rejectedComment}"</p>}
                          </div>
                        </div>
                      )}
                      {selectedTxn.voided_at && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--shell-hover)] mt-1.5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-bold text-black dark:text-white">
                              Voided by <span className="text-[var(--shell-text-muted)]">{selectedTxn.voided_by_name}</span>
                            </p>
                            <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">{formatDate(selectedTxn.voided_at)}</p>
                            {selectedTxn.void_reason && <p className="text-[11px] text-[var(--shell-text-muted)] mt-0.5 italic">"{selectedTxn.void_reason}"</p>}
                          </div>
                        </div>
                      )}
                      {!selectedTxn.submitted_at && !selectedTxn.approved_at && !selectedTxn.rejected_at && !selectedTxn.voided_at && (
                        <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">Draft — not yet submitted</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Notes Thread */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                  <FileText className="w-3.5 h-3.5" /> Internal Notes
                </label>
                {notesLoading ? (
                  <p className="text-[11px] text-[var(--shell-text-muted)]">Loading notes...</p>
                ) : (
                  <div className="space-y-1.5">
                    {notes.map((n: any) => (
                      <div key={n.id} className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-[var(--shell-hover)] border border-[var(--shell-border)]">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-[var(--shell-accent)]">{n.username}</p>
                          <p className="text-[11px] text-black dark:text-white leading-snug">{n.note}</p>
                          <p className="text-[11px] text-[var(--shell-text-muted)] mt-0.5">{formatDate(n.created_at)}</p>
                        </div>
                        {n.user_id === user?.id && (
                          <button onClick={() => handleDeleteNote(n.id)} className="text-[var(--shell-text-muted)] hover:text-[var(--danger)] transition-colors shrink-0 mt-0.5">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    {notes.length === 0 && <p className="text-[11px] text-[var(--shell-text-muted)]">No notes yet.</p>}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-surface)] text-[12px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50"
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || noteSaving}
                    className="h-8 px-3 rounded-lg bg-[var(--shell-accent)] text-[var(--shell-accent-fg)] text-[11px] font-bold disabled:opacity-40 transition-opacity"
                  >
                    {noteSaving ? '...' : 'Add'}
                  </button>
                </div>
              </div>

              {/* Reference ID */}
              <div>
                <label className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5 mb-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Reference ID
                </label>
                <div className="px-3 py-2 rounded-lg font-mono text-[12px] font-bold leading-relaxed" style={{ background: 'var(--shell-hover)', border: '1px solid var(--shell-border)', color: 'var(--shell-accent)' }}>
                  {selectedTxn.reference_id || `#${selectedTxn.id}`}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleDuplicate}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-hover)] text-[11px] font-bold text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] hover:bg-[var(--shell-surface)] transition-colors"
                >
                  <Copy className="w-3 h-3" /> Duplicate
                </button>
                {(selectedTxn.status || '').toUpperCase() === 'APPROVED' && (user?.roles || []).some((r: any) => ['FINANCE', 'ADMIN'].includes((r.role_name || '').toUpperCase())) && (
                  <button
                    onClick={() => { setVoidReason(''); setVoidOpen(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[11px] font-bold text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors"
                  >
                    <Ban className="w-3 h-3" /> Void
                  </button>
                )}
              </div>

            </div>
            )}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable
        columns={incomeColumns}
        data={rawTransactions}
        tableInstance={table}
        emptyMessage="No income records. Click Add to create one."
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
              className="h-8 px-4 text-[11.5px] font-medium"
              style={{ color: 'var(--shell-text-muted)' }}
            >
              Cancel
            </Button>
            <Button
              className="font-semibold text-[11.5px] h-8 px-5 rounded-lg transition-all active:scale-95"
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
            <p className="text-[var(--shell-accent)] text-[11px] font-bold">Original</p>
            <p className="text-[var(--shell-text)] text-[13px] font-black">{formatCurrency(Number(editing?.amount || 0), currency)}</p>
          </div>
          <div className="flex-1 flex flex-col gap-0.5 rounded-lg p-2.5 bg-[color-mix(in_srgb,var(--info)_10%,transparent)] border border-[color-mix(in_srgb,var(--info)_20%,transparent)]">
            <p className="text-[var(--info)] text-[11px] font-bold">Split Total</p>
            <p className="text-[var(--info)] text-[13px] font-black">
              {formatCurrency(splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), currency)}
            </p>
          </div>
          <div className="flex-1 flex flex-col gap-0.5 rounded-lg p-2.5 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_20%,transparent)]">
            <p className="text-[var(--warning)] text-[11px] font-bold">Remaining</p>
            <p className="text-[var(--warning)] text-[13px] font-black">
              {formatCurrency(Number(editing?.amount || 0) - splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), currency)}
            </p>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid gap-2 mb-1" style={{ gridTemplateColumns: '2fr 3fr 1.5fr' }}>
          <p className="text-[11px] font-bold text-[var(--shell-text-muted)] px-1">Category</p>
          <p className="text-[11px] font-bold text-[var(--shell-text-muted)] px-1">Description</p>
          <p className="text-[11px] font-bold text-[var(--shell-text-muted)] px-1 text-right">Amount</p>
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
          className="mt-3 flex items-center gap-1.5 text-[var(--shell-accent)] font-bold text-[11px]"
          onClick={() => {
            const used = splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
            const remaining = Math.max(0, (editing?.amount || 0) - used);
            setSplitEntries([...splitEntries, { category_id: '', description: '', amount: remaining > 0 ? String(remaining) : '' }]);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add Line Item
        </button>
      </ModuleModal>

      {/* Void Transaction Modal */}
      <ModuleModal
        isOpen={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Void Transaction"
        icon={<Ban className="w-4 h-4" />}
        isDestructive={true}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setVoidOpen(false)} disabled={voidSaving} className="h-8 px-4 text-[11.5px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>
              Cancel
            </Button>
            <button
              onClick={handleVoid}
              disabled={voidSaving}
              className="px-8 py-2.5 bg-[var(--danger)] text-[var(--danger-foreground)] text-[12px] font-bold rounded-lg active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {voidSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />}
              Confirm Void
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] rounded-xl text-[11px] text-[var(--danger)] font-medium">
            This will permanently mark <strong>{selectedTxn?.reference_id || `#${selectedTxn?.id}`}</strong> as VOIDED. The record is kept for audit purposes but will no longer count in reports.
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--shell-text)] block">Void Reason (optional)</label>
            <textarea
              className="w-full h-20 p-3 border-input bg-transparent text-[var(--shell-text)] border border-[var(--shell-border)] rounded-lg text-[13px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--danger)_50%,transparent)] focus:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] resize-none outline-none"
              placeholder="Describe why this transaction is being voided..."
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </div>
        </div>
      </ModuleModal>
    </ModuleShell>
  );
}
