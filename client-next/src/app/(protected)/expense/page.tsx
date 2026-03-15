'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactions, useCategories, useProjects, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/currency';
import { toast } from 'sonner';
import {
  PlusCircle, Edit, Split, Send, Trash2, Download,
  X, FileText, ShieldCheck, LayoutGrid, Layers, UploadCloud
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable } from '@/components/data-table/data-table';
import { TransactionModal } from '@/components/transactions/transaction-modal';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { columns } from './columns';
import { 
  useReactTable, 
  getCoreRowModel, 
  getFilteredRowModel, 
  getPaginationRowModel, 
  getSortedRowModel, 
  getFacetedUniqueValues,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  RowSelectionState
} from "@tanstack/react-table";
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';

export default function ExpensePage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const invalidate = useInvalidate();

  const { data: categories } = useCategories();
  const { data: projects } = useProjects();
  const { data: txnData, isLoading } = useTransactions({ type: 'expense' });
  // Case-insensitive check; also treat no-role users as Employee (they can submit their own expenses)
  const activeRoleName = (user?.role_name || '').toLowerCase();
  const isEmployee = activeRoleName === 'employee' || activeRoleName === '';

  // Data — exclude APPROVED/REJECTED (those belong to Approvals history)
  const EXCLUDED_STATUSES = ['APPROVED', 'REJECTED'];
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
  const [modalOpen, setModalOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const [splitEntries, setSplitEntries] = useState([
    { category_id: '', project_id: '', description: '', amount: '' },
    { category_id: '', project_id: '', description: '', amount: '' }
  ]);

  const panelFileRef = useRef<HTMLInputElement>(null);
  const [panelUploading, setPanelUploading] = useState(false);

  const handlePanelFileUpload = async (file: File) => {
    if (!selectedTxn) return;
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

  const handlePanelDocClick = () => {
    if (selectedTxn?.receipt_path) {
      window.open(`/api/v1/receipts/${selectedTxn.receipt_path}`, '_blank');
    } else {
      panelFileRef.current?.click();
    }
  };

  useEffect(() => {
    setHeader('Expense Manager', 'Manage and track your organization\'s expense');
  }, [setHeader]);

  const filteredCategories = (categories || []).filter((c: any) => c.type === 'expense');

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const LOCKED_STATUSES = ['APPROVED', 'REJECTED'];

  const openSplit = async () => {
    if (!isEmployee) {
      toast.error('Only Employee role can split expenses');
      return;
    }
    const sr = table.getFilteredSelectedRowModel().rows;
    const target = sr.length === 1 ? sr[0].original : selectedTxn;
    if (!target) { toast.error('Select one record to split'); return; }
    if ((target.status || '').toUpperCase() !== 'DRAFT') {
      toast.error('Only DRAFT expenses can be split');
      return;
    }
    setEditing(target);
    // Pre-populate with existing splits if already split, otherwise default rows
    if (target.is_split === 1 && splitDetails.length >= 2) {
      setSplitEntries(splitDetails.map((s: any) => ({
        category_id: String(s.category_id || ''),
        project_id: '',
        description: s.description || '',
        amount: String(s.amount),
      })));
    } else {
      setSplitEntries([
        { category_id: String(target.category_id || ''), project_id: '', description: `${target.description} (Part 1)`, amount: '' },
        { category_id: '', project_id: '', description: '', amount: String(target.amount || '') },
      ]);
    }
    setSplitOpen(true);
  };

  const handleSplitExpense = async () => {
    const total = splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    if (Math.abs(total - (editing?.amount || 0)) > 0.01) {
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
      toast.success('Expense split applied successfully');
      invalidate('transactions', 'dashboard');
      setSplitOpen(false);
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to split transaction');
    }
  };

  const openEdit = () => {
    const sr = table.getFilteredSelectedRowModel().rows;
    const target = sr.length === 1 ? sr[0].original : selectedTxn;
    if (!target) { toast.error('Select one record to edit'); return; }
    if (target.status && !['DRAFT', 'SENT_BACK'].includes(target.status.toUpperCase())) {
      toast.error(`Cannot edit expense with status '${target.status}'`);
      return;
    }
    setEditing(target);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!isEmployee) {
      toast.error('Only users with the Employee role can submit expenses. Switch your role to Employee first.');
      return;
    }
    const sr = table.getFilteredSelectedRowModel().rows;
    const targets = sr.filter((r) => ['DRAFT', 'SENT_BACK'].includes((r.original.status || '').toUpperCase()));
    if (targets.length === 0) {
      toast.error('Select one or more DRAFT or SENT_BACK expenses to submit');
      return;
    }
    try {
      await Promise.all(targets.map((r) => api.post(`/transactions/${r.original.id}/submit`)));
      toast.success(`${targets.length} expense(s) submitted for approval`);
      invalidate('transactions', 'dashboard');
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to submit expense(s)');
    }
  };

  const handleDelete = async () => {
    const sr = table.getFilteredSelectedRowModel().rows;
    const locked = sr.filter(r => LOCKED_STATUSES.includes((r.original.status || '').toUpperCase()));
    if (locked.length > 0) {
      toast.error(`Cannot delete expense(s) with status APPROVED or REJECTED`);
      return;
    }
    const ids = sr.map(r => r.original.id);
    if (ids.length === 0) { toast.error('Select records to delete'); return; }
    if (!confirm(`Delete ${ids.length} expense record(s)?`)) return;
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

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
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
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const sr = table.getFilteredSelectedRowModel().rows;
  const selectedCount = sr.length;
  // True when the single selected row is in a locked status (APPROVED/REJECTED)
  const isSelectedLocked = selectedCount === 1 && LOCKED_STATUSES.includes((sr[0].original.status || '').toUpperCase());

  useEffect(() => {
    const target = sr.length === 1 ? sr[0].original : null;
    setSelectedTxn(target);
    setSplitDetails([]);
    if (!target?.is_split) return;
    let cancelled = false;
    setSplitDetailsLoading(true);
    api.get(`/transactions/${target.id}/splits`)
      .then((r) => { if (!cancelled) setSplitDetails(r.data as any[]); })
      .catch(() => { if (!cancelled) setSplitDetails([]); })
      .finally(() => { if (!cancelled) setSplitDetailsLoading(false); });
    return () => { cancelled = true; };
  }, [sr]);

  return (
    <ModuleShell
      showPanel={!!selectedTxn}
      actionsRow={
        <>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all" onClick={openAdd}>
              <PlusCircle className="h-[16px] w-[16px] text-green-600" /> Add Expense
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40"
              onClick={openEdit}
              disabled={selectedCount !== 1}
            >
              <Edit className="h-[16px] w-[16px] text-blue-600" /> Edit
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40"
              onClick={openSplit}
              disabled={selectedCount !== 1 || !isEmployee || (sr.length === 1 && (sr[0].original.status || '').toUpperCase() !== 'DRAFT')}
            >
              <Split className="h-[16px] w-[16px] text-purple-600" /> Split
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40"
              onClick={handleSubmit}
              disabled={selectedCount === 0 || !isEmployee}
              title={!isEmployee ? 'Switch to Employee role to submit expenses' : undefined}
            >
              <Send className="h-[16px] w-[16px] text-juniper" /> Submit
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-slate-50 transition-all disabled:opacity-40"
              onClick={handleDelete}
              disabled={selectedCount === 0 || sr.some(r => LOCKED_STATUSES.includes((r.original.status || '').toUpperCase()))}
            >
              <Trash2 className="h-[16px] w-[16px] text-red-500" /> Delete {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          </div>
          
          <div className="flex items-center gap-2">
             <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-mystic transition-all">
               <Download className="h-[16px] w-[16px] text-juniper" /> Export
             </button>
          </div>
        </>
      }
      searchRow={
        <DataTableToolbar 
          table={table} 
          facetedFilters={[
            {
              columnId: "status",
              title: "Status",
              options: [
                { label: "Pending", value: "pending" },
                { label: "Approved", value: "approved" },
                { label: "Rejected", value: "rejected" },
              ],
            },
            {
              columnId: "category_name",
              title: "Category",
              options: facetedCategories,
            },
          ]}
        />
      }
      intelligencePanel={
        selectedTxn && (
          <ModuleIntelligencePanel
            title="Transaction Detail"
            onClose={() => setRowSelection({})}
          >
            <div className="flex-1 space-y-4">
              {/* Primary Document */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-juniper uppercase flex items-center gap-2 border-b border-casper/10 pb-1.5">
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
                  className="h-32 bg-[#121212] rounded-xl flex flex-col items-center justify-center group cursor-pointer hover:brightness-110 transition-all shadow-md"
                  onClick={handlePanelDocClick}
                >
                  {panelUploading ? (
                    <>
                      <UploadCloud className="w-8 h-8 mb-2 text-white/50 animate-pulse" />
                      <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">Uploading...</p>
                    </>
                  ) : selectedTxn?.receipt_path ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2 text-white/50 group-hover:scale-110 transition-transform"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-white/80">{selectedTxn.receipt_path.split('/').pop()}</p>
                      <p className="text-[9px] text-white/40 mt-0.5 font-medium">Click to view full screen</p>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-8 h-8 mb-2 text-white/30 group-hover:text-white/60 group-hover:scale-110 transition-all" />
                      <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">No receipt attached</p>
                      <p className="text-[9px] text-white/30 mt-0.5 font-medium">Click to upload PDF, JPG, PNG</p>
                    </>
                  )}
                </div>
              </div>

              {/* Info fields */}
              <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                <div className="col-span-2">
                  <label className="text-[9px] font-bold text-casper uppercase tracking-wider">Description</label>
                  <p className="text-[11px] text-[#121212] bg-[#F0F4F5]/50 px-2 py-1.5 rounded-lg mt-0.5 border border-casper/30 shadow-sm leading-relaxed">{selectedTxn.description || 'No description provided'}</p>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-casper uppercase tracking-wider">Amount Spent</label>
                  <p className="text-[14px] font-black mt-0.5 text-[#121212]">{formatCurrency(selectedTxn.amount, currency)}</p>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-casper uppercase tracking-wider">Date Recorded</label>
                  <p className="text-[12px] font-bold mt-0.5 text-[#121212]">{formatDate(selectedTxn.date_recorded)}</p>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-casper uppercase tracking-wider">Payment Method</label>
                  <p className="text-[12px] font-bold mt-0.5 text-[#121212] capitalize">{selectedTxn.payment_method || '—'}</p>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-casper uppercase tracking-wider">Category</label>
                  <p className="text-[12px] font-bold mt-0.5 text-[#121212]">{selectedTxn.category_name || '—'}</p>
                </div>
              </div>

              {/* Fund Allocation */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-juniper uppercase flex items-center gap-2 border-b border-casper/10 pb-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" /> Fund Allocation
                </label>

                {selectedTxn.is_split === 1 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-teal-50 border border-teal-200 rounded-full text-[9px] font-bold text-teal-700 uppercase tracking-wider">
                        <Layers className="w-3 h-3" /> Split Expense
                      </span>
                      <button onClick={openSplit} className="text-[10px] font-bold text-juniper hover:underline uppercase tracking-wider">Re-split →</button>
                    </div>
                    {splitDetailsLoading ? (
                      <p className="text-[11px] text-casper font-medium">Loading split details...</p>
                    ) : splitDetails.length > 0 ? (
                      <div className="space-y-2">
                        {splitDetails.map((s: any, i: number) => {
                          const pct = ((s.amount / selectedTxn.amount) * 100).toFixed(1);
                          return (
                            <div key={s.id ?? i}>
                              <div className="flex items-center justify-between mb-0.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-juniper/10 text-juniper text-[9px] font-black flex items-center justify-center">{i + 1}</span>
                                  <span className="text-[11px] font-bold text-[#121212] truncate">{s.category_name || `Split ${i + 1}`}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="text-[10px] font-bold text-juniper">{pct}%</span>
                                  <span className="text-[11px] font-black text-charcoal">{formatCurrency(s.amount, currency)}</span>
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
                          <span className="text-[12px] font-black text-juniper">{formatCurrency(selectedTxn.amount, currency)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-casper font-medium">No split details available.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-[#121212]">{selectedTxn.project_name || 'General Reserve'}</span>
                      <span className="text-[11px] font-bold text-juniper">100.00%</span>
                    </div>
                    <div className="w-full bg-[#F0F4F5] rounded-full h-1 overflow-hidden shadow-inner">
                      <div className="bg-juniper h-full rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Blockchain Hash — moved to bottom */}
              <div>
                <label className="text-[10px] font-bold text-juniper uppercase tracking-widest flex items-center gap-2 border-b border-casper/10 pb-1.5 mb-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Blockchain Hash
                </label>
                <div className="bg-[#121212] text-white px-3 py-2 rounded-lg font-mono text-[10px] break-all shadow-md leading-relaxed overflow-hidden">
                  0x8F2A11B90C55F81D2E4909AA8C127D9B44F23E99A2D1F4C5B6C7D8E9F{selectedTxn.id}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-1">
                <button className="flex-1 bg-juniper text-white py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest hover:brightness-110 shadow-lg shadow-juniper/20 transition-all active:scale-95">Post to Ledger</button>
                <button className="px-4 bg-white border border-casper text-juniper rounded-xl hover:bg-mystic transition-colors shadow-sm">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </ModuleIntelligencePanel>
        )
      }
    >
      <DataTable 
        columns={expenseColumns} 
        data={rawTransactions} 
        tableInstance={table}
      />

      {/* Add / Edit Expense Modal */}
      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        type="expense"
        editing={editing}
        onSaved={() => setRowSelection({})}
      />

      {/* Split Transaction Modal */}
      <Dialog open={splitOpen} onOpenChange={(open) => !open && setSplitOpen(false)}>
        <DialogContent
          className="sm:max-w-[1000px] p-0 overflow-hidden bg-sharp-white border border-casper shadow-2xl flex flex-col"
          showCloseButton={false}
        >
          <div className="flex items-center bg-juniper text-white p-5 border-b border-casper justify-between h-[52px] shrink-0">
            <div className="flex items-center gap-4">
              <button className="text-white hover:bg-white/10 p-1.5 rounded-md transition-colors shadow-sm border border-white/20" onClick={() => setSplitOpen(false)}>
                <X className="h-5 w-5" />
              </button>
              <div className="flex flex-col">
                <h2 className="text-[12px] font-bold tracking-[0.2em] uppercase mt-0.5 flex items-center gap-2">
                  <Split className="h-4 w-4 text-white/80" /> Split Expense Record
                </h2>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-white/70 text-[9px] font-bold uppercase tracking-wider leading-none">Original Amount</span>
              <p className="text-white text-xl font-black leading-none mt-1">{formatCurrency(editing?.amount || 0, currency)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 p-5 bg-white border-b border-casper">
            <div className="flex-1 min-w-[180px] flex flex-col gap-1 rounded-lg p-3 bg-[#F0F4F5] border border-casper shadow-sm">
              <p className="text-juniper text-[10px] font-bold uppercase tracking-wider">Original Amount</p>
              <p className="text-charcoal text-lg font-black">{formatCurrency(editing?.amount || 0, currency)}</p>
            </div>
            <div className="flex-1 min-w-[180px] flex flex-col gap-1 rounded-lg p-3 bg-blue-50 border border-casper shadow-sm">
              <p className="text-blue-700 text-[10px] font-bold uppercase tracking-wider">Split Total</p>
              <p className="text-blue-800 text-lg font-black">
                {formatCurrency(splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), currency)}
              </p>
            </div>
            <div className="flex-1 min-w-[180px] flex flex-col gap-1 rounded-lg p-3 bg-amber-50 border border-casper shadow-sm">
              <p className="text-amber-600 text-[10px] font-bold uppercase tracking-wider">Remaining Balance</p>
              <p className="text-amber-700 text-lg font-black">
                {formatCurrency((editing?.amount || 0) - splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), currency)}
              </p>
            </div>
          </div>

          <div className="p-5">
            <div className="space-y-3">
              {splitEntries.map((entry, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-3 items-center group relative border-b border-casper/10 pb-3">
                  <div className="col-span-3">
                    <Select value={entry.category_id} onValueChange={(v) => {
                      const neu = [...splitEntries]; neu[idx].category_id = v; setSplitEntries(neu);
                    }}>
                      <SelectTrigger className="h-9 bg-white border-casper text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>{filteredCategories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Select value={entry.project_id} onValueChange={(v) => {
                      const neu = [...splitEntries]; neu[idx].project_id = v; setSplitEntries(neu);
                    }}>
                      <SelectTrigger className="h-9 bg-white border-casper text-xs"><SelectValue placeholder="Project" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Project</SelectItem>
                        {(projects || []).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Input className="h-9 bg-white border-casper text-xs" placeholder="Description..." value={entry.description} onChange={(e) => {
                      const neu = [...splitEntries]; neu[idx].description = e.target.value; setSplitEntries(neu);
                    }} />
                  </div>
                  <div className="col-span-2 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                    <Input className="h-9 pl-6 pr-2 bg-white border-casper text-xs font-bold text-right" placeholder="0.00" value={entry.amount} onChange={(e) => {
                      const neu = [...splitEntries]; neu[idx].amount = e.target.value; setSplitEntries(neu);
                    }} type="number" step="0.01" />
                  </div>
                </div>
              ))}
            </div>
            <button className="mt-4 flex items-center gap-1.5 text-juniper font-bold text-xs uppercase tracking-widest" onClick={() => {
              const used = splitEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
              const remaining = Math.max(0, (editing?.amount || 0) - used);
              setSplitEntries([...splitEntries, { category_id: '', project_id: '', description: '', amount: remaining > 0 ? String(remaining) : '' }]);
            }}>
              <PlusCircle className="h-4 w-4" /> Add Line Item
            </button>
          </div>
          <div className="p-8 pt-4 bg-mystic/20 border-t border-casper/30 flex items-center justify-end gap-3 mt-auto shrink-0">
            <Button
              variant="outline"
              className="px-5 py-2 rounded-md font-bold text-[11px] text-juniper uppercase tracking-widest bg-white border-casper shadow-sm transition-all h-11"
              onClick={() => setSplitOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-juniper hover:brightness-110 text-white px-8 py-2 rounded-md font-bold text-[11px] uppercase tracking-widest shadow-lg shadow-juniper/20 transition-all border border-juniper h-11"
              onClick={handleSplitExpense}
            >
              Verify & Apply Split
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ModuleShell>
  );
}
