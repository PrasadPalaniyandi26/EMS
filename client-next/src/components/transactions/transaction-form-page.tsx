'use client';
import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactions, useCategories, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Download, Upload, Send, Search, X } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/currency';
import type { Transaction } from '@/lib/types';
import { TransactionModal } from './transaction-modal';

interface TransactionFormPageProps {
  transactionType: 'expense' | 'income';
  title: string;
  subtitle: string;
}

export function TransactionFormPage({ transactionType, title, subtitle }: TransactionFormPageProps) {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const { data: categories } = useCategories();
  const invalidate = useInvalidate();

  // Filters
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterCode, setFilterCode] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Data
  const [params, setParams] = useState<Record<string, string>>({ type: transactionType });
  const { data: txnData, isLoading } = useTransactions(params);
  // API returns flat array in `data`, or paginated in `data` with `meta` — handle both
  const rawTransactions: Transaction[] = useMemo(() => {
    if (!txnData) return [];
    if (Array.isArray(txnData)) return txnData;
    const data = txnData as unknown as Record<string, unknown>;
    if ('rows' in data && Array.isArray(data.rows)) return data.rows as Transaction[];
    return [];
  }, [txnData]);

  // Client-side filtering
  const transactions = useMemo(() => {
    let filtered = rawTransactions;
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(t =>
        (t.description || '').toLowerCase().includes(s) ||
        String(t.id).includes(s) ||
        (t.reference_id || '').toLowerCase().includes(s)
      );
    }
    if (filterClient !== 'all') filtered = filtered.filter(t => String(t.client_id) === filterClient);
    if (filterCode) filtered = filtered.filter(t => (t.reference_id || '').toLowerCase().includes(filterCode.toLowerCase()));
    if (filterStatus !== 'all') filtered = filtered.filter(t => (t.status || '').toLowerCase() === filterStatus.toLowerCase());
    if (filterCategory !== 'all') filtered = filtered.filter(t => String(t.category_id) === filterCategory);
    if (filterMethod !== 'all') filtered = filtered.filter(t => (t.payment_method || '').toLowerCase() === filterMethod.toLowerCase());
    return filtered;
  }, [rawTransactions, search, filterClient, filterCode, filterStatus, filterCategory, filterMethod]);

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === transactions.length) setSelected(new Set());
    else setSelected(new Set(transactions.map(t => t.id)));
  };

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  useEffect(() => { setHeader(title, subtitle); }, [setHeader, title, subtitle]);

  const filteredCategories = (categories || []).filter((c) => c.type === transactionType);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (t?: Transaction) => {
    const target = t || (selected.size === 1 ? transactions.find(tx => selected.has(tx.id)) : null);
    if (!target) { toast.error('Select one record to edit'); return; }
    setEditing(target);
    setModalOpen(true);
  };

  const handleDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) { toast.error('Select records to delete'); return; }
    if (!confirm(`Delete ${ids.length} record(s)?`)) return;
    try {
      if (ids.length === 1) await api.delete(`/transactions/${ids[0]}`);
      else await api.post('/transactions/bulk-delete', { ids });
      toast.success('Deleted');
      invalidate('transactions', 'dashboard');
      setSelected(new Set());
      setSelectedTxn(null);
    } catch { toast.error('Failed to delete'); }
  };

  const handleExport = () => {
    const rows = transactions.map(t => ({
      ID: t.id, Code: t.reference_id || '', Description: t.description,
      Category: t.category_name || '', Date: formatDate(t.date_recorded),
      Status: t.status || '', Amount: t.amount, Payment: t.payment_method || '',
    }));
    const csv = [Object.keys(rows[0] || {}).join(','), ...rows.map(r => Object.values(r).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${transactionType}_export.csv`; a.click();
  };

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-stone-100 text-stone-700 border-stone-200';
    }
  };

  const getCategoryColor = (name?: string) => {
    const colors: Record<string, string> = {
      education: 'bg-blue-100 text-blue-700', material: 'bg-orange-100 text-orange-700',
      rent: 'bg-purple-100 text-purple-700', 'food & dining': 'bg-emerald-100 text-emerald-700',
      shopping: 'bg-cyan-100 text-cyan-700', entertainment: 'bg-rose-100 text-rose-700',
    };
    return colors[(name || '').toLowerCase()] || 'bg-stone-100 text-stone-700';
  };

  return (
    <div className="flex h-full gap-6">
      <div className="flex-1 flex flex-col space-y-4 min-w-0">
        {/* Functional Inline Filters (Search, Date, Status, Category) */}
        <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-casper shadow-sm">
          <div className="flex items-center gap-3 w-full max-w-5xl">
            <div className="relative flex-1 block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-casper" />
              <input
                className="w-full pl-9 h-9 border border-casper rounded-md text-[12px] bg-[#F0F4F5]/50 focus:ring-1 focus:ring-juniper focus:border-juniper focus:outline-none"
                placeholder="Search ID, description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-center gap-2 bg-[#F0F4F5]/50 border border-casper rounded-md px-3 h-9">
              <input type="date" className="h-7 w-[110px] border-none bg-transparent p-0 text-[12px] shadow-none focus-visible:outline-none text-charcoal outline-none" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span className="text-casper text-[10px] font-bold uppercase">to</span>
              <input type="date" className="h-7 w-[110px] border-none bg-transparent p-0 text-[12px] shadow-none focus-visible:outline-none text-charcoal outline-none" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <select
              className="h-9 w-32 bg-[#F0F4F5]/50 border border-casper rounded-md py-1 px-3 text-[12px] font-medium outline-none cursor-pointer text-charcoal focus:ring-1 focus:ring-juniper focus:border-juniper"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">Status: All</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              className="h-9 w-36 bg-[#F0F4F5]/50 border border-casper rounded-md py-1 px-3 text-[12px] font-medium outline-none cursor-pointer text-charcoal focus:ring-1 focus:ring-juniper focus:border-juniper"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">Category: All</option>
              {filteredCategories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Master Template Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-workspace-bg transition-all">
              <Plus className="text-green-600 w-[18px] h-[18px]" /> Add
            </button>
            <button onClick={() => openEdit()} className="flex items-center gap-2 px-4 py-2 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-workspace-bg transition-all">
              <Pencil className="text-blue-600 w-[18px] h-[18px]" /> Edit
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-workspace-bg transition-all">
              <Send className="text-juniper w-[18px] h-[18px]" /> Submit
            </button>
            <button onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-workspace-bg transition-all">
              <Trash2 className="text-red-500 w-[18px] h-[18px]" /> Delete{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-workspace-bg transition-all">
              <Upload className="text-orange-500 w-[18px] h-[18px]" /> Import
            </button>
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white border border-casper rounded-lg shadow-sm text-[11px] font-bold text-charcoal hover:bg-workspace-bg transition-all">
              <Download className="text-indigo-500 w-[18px] h-[18px]" /> Export
            </button>
          </div>
        </div>

        <div className="table-container flex-1 rounded-xl shadow-lg overflow-hidden flex flex-col min-h-0">
          <div className="overflow-y-auto hide-scrollbar flex-1">
            <Table className="casper-grid">
              <TableHeader className="bg-juniper sticky top-0 z-10">
                <TableRow className="hover:bg-juniper border-b-0">
                  <TableHead className="w-12 text-center border-l-0">
                    <Checkbox className="rounded border-white/30 data-[state=checked]:bg-white data-[state=checked]:text-juniper opacity-100" checked={transactions.length > 0 && selected.size === transactions.length} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead className="text-[10px] font-bold text-white uppercase tracking-wider w-28">CODE</TableHead>
                  <TableHead className="text-[10px] font-bold text-white uppercase tracking-wider w-32">RECEIPT NO</TableHead>
                  <TableHead className="text-[10px] font-bold text-white uppercase tracking-wider">DESCRIPTION</TableHead>
                  <TableHead className="text-[10px] font-bold text-white uppercase tracking-wider w-36 text-center">CATEGORY</TableHead>
                  <TableHead className="text-[10px] font-bold text-white uppercase tracking-wider w-28 text-center">DATE</TableHead>
                  <TableHead className="text-[10px] font-bold text-white uppercase tracking-wider w-28 text-center">STATUS</TableHead>
                  <TableHead className="text-[10px] font-bold text-white uppercase tracking-wider border-r-0 text-right w-32">AMOUNT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow
                    key={t.id}
                    className={`hover:bg-[#F0F4F5]/50 cursor-pointer transition-colors group ${selected.has(t.id) ? 'bg-[#F0F4F5]/20' : ''}`}
                    onClick={() => setSelectedTxn(t)}
                  >
                    <TableCell className="text-center border-l-0" onClick={(e) => e.stopPropagation()}>
                      <Checkbox className="rounded border-casper text-juniper data-[state=checked]:bg-juniper data-[state=checked]:text-white" checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} />
                    </TableCell>
                    <TableCell className="text-[12px] font-bold text-juniper border-casper/30">{t.reference_id || '—'}</TableCell>
                    <TableCell className="text-[12px] font-mono text-charcoal/70 border-casper/30">—</TableCell>
                    <TableCell className="text-[12px] font-medium text-charcoal truncate border-casper/30">
                      {t.description || '—'}
                      {t.notes === 'SPLIT' && <span className="ml-2 px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-[10px] font-bold">SPLIT</span>}
                    </TableCell>
                    <TableCell className="text-center border-casper/30">
                      <span className="px-2 py-0.5 bg-[#F0F4F5] text-[9px] font-bold text-juniper rounded-md uppercase border border-casper/30">
                        {t.category_name || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-[12px] text-charcoal/60 text-center border-casper/30">{formatDate(t.date_recorded)}</TableCell>
                    <TableCell className="border-casper/30">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${getStatusColor(t.status)}`}>
                          {t.status || '—'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[12px] font-bold text-right text-charcoal border-r-0 border-casper/30">{formatCurrency(t.amount, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {transactions.length === 0 && !isLoading && (
              <p className="py-8 text-center text-muted-foreground text-sm">No {transactionType} transactions found.</p>
            )}
          </div>
          
          <div className="p-4 border-t border-casper flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-1">
                <button className="p-1.5 hover:bg-[#F0F4F5] rounded-md transition-colors text-juniper disabled:opacity-30" disabled>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>
                </button>
                <button className="p-1.5 hover:bg-[#F0F4F5] rounded-md transition-colors text-juniper disabled:opacity-30" disabled>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
              </div>
              <div className="flex items-center gap-2 px-4 border-l border-r border-casper">
                <span className="text-[11px] font-bold text-charcoal/50">Page</span>
                <input className="w-10 h-7 text-center text-[11px] font-bold border border-casper rounded-md focus:ring-1 focus:outline-none focus:ring-juniper focus:border-juniper p-0" type="text" value="1" readOnly />
                <span className="text-[11px] font-bold text-charcoal/50">of 1</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1.5 hover:bg-[#F0F4F5] rounded-md transition-colors text-juniper">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
                <button className="p-1.5 hover:bg-[#F0F4F5] rounded-md transition-colors text-juniper">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5 5-5"/></svg>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-charcoal/50">Show:</span>
                <select className="h-7 text-[11px] font-bold border border-casper rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-juniper focus:border-juniper py-0 pl-2 pr-2">
                  <option>50 rows</option>
                  <option>100 rows</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedTxn && (
        <aside className="content-right-sidebar rounded-xl shadow-xl flex flex-col overflow-hidden glass-panel border border-casper">
          <div className="h-12 px-5 bg-juniper text-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] mt-0.5">Transaction Detail</h3>
            </div>
            <button onClick={() => setSelectedTxn(null)} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-juniper uppercase flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                Primary Document
              </label>
              <div className="h-44 bg-[#F0F4F5]/40 rounded-xl border-2 border-dashed border-casper flex flex-col items-center justify-center text-juniper group cursor-pointer hover:bg-white hover:border-juniper transition-all shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-casper group-hover:scale-110 transition-transform"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                <p className="text-[10px] font-bold uppercase tracking-wide">#{selectedTxn.id}_DOCUMENT.PDF</p>
                <p className="text-[9px] text-casper mt-1 font-medium">Click to view/attach full screen</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-6 gap-x-5">
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-casper uppercase tracking-wider">Description</label>
                <p className="text-[11px] break-all text-charcoal bg-[#F0F4F5]/50 p-3 rounded-lg mt-2 border border-casper/30 shadow-sm leading-relaxed">{selectedTxn.description || 'No description provided'}</p>
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-casper uppercase tracking-wider">Requested Amount</label>
                <p className="text-[16px] font-black mt-1 text-charcoal">{formatCurrency(selectedTxn.amount, currency)}</p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-casper uppercase tracking-wider">Date Recorded</label>
                <p className="text-[13px] font-bold mt-1.5 text-charcoal">{formatDate(selectedTxn.date_recorded)}</p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-casper uppercase tracking-wider">Payment Method</label>
                <p className="text-[13px] font-bold mt-1 text-charcoal capitalize">{selectedTxn.payment_method || '—'}</p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-casper uppercase tracking-wider">Category</label>
                <p className="text-[13px] font-bold mt-1 text-charcoal">{selectedTxn.category_name || '—'}</p>
              </div>
            </div>
            
            {selectedTxn.notes && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-juniper uppercase flex items-center gap-2 border-b border-casper/30 pb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Notes & Context
                </label>
                <p className="text-[13px] font-medium text-charcoal leading-relaxed">{selectedTxn.notes}</p>
              </div>
            )}
          </div>
          
          <div className="p-5 bg-[#F0F4F5]/30 border-t border-casper flex gap-3">
             <button className="flex-1 bg-juniper text-white py-3 rounded-lg text-[11px] font-bold uppercase tracking-widest hover:brightness-110 shadow-lg shadow-juniper/20 transition-all active:scale-95">Post to Ledger</button>
             <button className="px-4 bg-white border border-casper text-juniper rounded-lg hover:bg-workspace-bg transition-colors shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
             </button>
          </div>
        </aside>
      )}

      {/* Add/Edit Modal */}
      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        type={transactionType}
        editing={editing}
        onSaved={() => { setSelected(new Set()); setSelectedTxn(null); }}
      />
    </div>
  );
}
