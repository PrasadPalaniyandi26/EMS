'use client';
import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactions } from '@/hooks/use-queries';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Search, Download, Calendar, ChevronLeft, ChevronRight, FileText, X, ArrowUpRight, CreditCard } from 'lucide-react';
import { formatCurrency, formatDate, getDateRange } from '@/lib/currency';

export default function TransactionsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';

  const [datePreset, setDatePreset] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (datePreset !== 'all' && datePreset !== 'custom') {
      const r = getDateRange(datePreset as any);
      f.dateFrom = r.from;
      f.dateTo = r.to;
    } else if (dateFrom || dateTo) {
      if (dateFrom) f.dateFrom = dateFrom;
      if (dateTo) f.dateTo = dateTo;
    }
    if (filterType !== 'all') f.type = filterType;
    return f;
  }, [datePreset, dateFrom, dateTo, filterType]);

  const { data: txnData, isLoading } = useTransactions(filters);
  const transactions = txnData?.rows || [];

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedTxn, setSelectedTxn] = useState<any>(null);

  useEffect(() => { setHeader('Transactions', 'View all transactions'); }, [setHeader]);

  const displayedTxns = search
    ? transactions.filter((t: any) => t.description?.toLowerCase().includes(search.toLowerCase()) || t.category_name?.toLowerCase().includes(search.toLowerCase()))
    : transactions;

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };
  
  const toggleAll = () => {
    if (selectedIds.size === displayedTxns.length && displayedTxns.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(displayedTxns.map((t: any) => t.id)));
  };

  const handleExport = () => {
    if (displayedTxns.length === 0) { toast.error('No transactions to export'); return; }
    const rows = displayedTxns.map((t: any) => ({
      ID: t.id, Description: t.description || '', Category: t.category_name || '',
      Client: t.client_name || '', Date: formatDate(t.date_recorded), Type: t.type,
      Amount: t.amount, Payment: t.payment_method || '', Status: t.status || '',
    }));
    const csv = [Object.keys(rows[0]).join(','), ...rows.map((r: any) => Object.values(r).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'transactions.csv'; a.click();
    toast.success('Exported');
  };

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return { label: 'text-emerald-600', dot: 'bg-emerald-500', px: 'bg-emerald-500/10 border-emerald-500/20' };
      case 'pending': return { label: 'text-amber-500', dot: 'bg-amber-500', px: 'bg-amber-500/10 border-amber-500/20' };
      case 'rejected': return { label: 'text-rose-500', dot: 'bg-rose-500', px: 'bg-rose-500/10 border-rose-500/20' };
      default: return { label: 'text-slate-500', dot: 'bg-slate-400', px: 'bg-slate-100 border-slate-200' };
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-theme-bg">
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Filters/Search Row */}
        <div className="px-6 pt-5 pb-3">
          <div className="glass-card rounded-xl p-3 shadow-sm space-y-3">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-theme-sidebar/50" />
                <Input 
                  className="pl-9 h-9 bg-white border-theme-sidebar/10 text-xs shadow-sm focus-visible:ring-1 focus-visible:ring-emerald-500/50" 
                  placeholder="Search description, category..." 
                  value={search} onChange={(e) => setSearch(e.target.value)} 
                />
              </div>
              <div className="flex items-center gap-2">
                <Select value={datePreset} onValueChange={setDatePreset}>
                  <SelectTrigger className="h-9 w-[140px] bg-white border-theme-sidebar/10 text-xs shadow-sm">
                    <SelectValue placeholder="Date Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="thisWeek">This Week</SelectItem>
                    <SelectItem value="lastWeek">Last Week</SelectItem>
                    <SelectItem value="thisMonth">This Month</SelectItem>
                    <SelectItem value="lastMonth">Last Month</SelectItem>
                    <SelectItem value="calYear">This Year</SelectItem>
                    <SelectItem value="finYear">Financial Year</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 bg-white border border-theme-sidebar/10 rounded-md px-3 h-9 text-xs font-medium text-theme-sidebar/70 shadow-sm">
                  <Calendar className="h-3.5 w-3.5 text-theme-sidebar/50" />
                  <input className="bg-transparent border-none p-0 w-[78px] text-center focus:outline-none focus:ring-0" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
                  <span className="text-theme-sidebar/40">to</span>
                  <input className="bg-transparent border-none p-0 w-[78px] text-center focus:outline-none focus:ring-0" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex gap-3 w-64">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-8 bg-white/60 border-theme-sidebar/10 text-[11px] font-medium"><SelectValue placeholder="Type: All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Type: All</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-semibold text-theme-sidebar/70 hover:bg-white/50 border border-transparent hover:border-theme-sidebar/10 transition-all">
                <Download className="h-4 w-4 text-theme-sidebar/50" /> Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto px-6 pb-6 mt-2">
          <div className="bg-white rounded-xl overflow-hidden border border-theme-sidebar/10 shadow-sm relative h-full flex flex-col">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead className="bg-juniper text-sharp-white font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-casper shadow-sm">
                <tr>
                  <th className="px-4 py-3 border-r border-casper w-10 text-center">
                    <Checkbox className="border-sharp-white/40" checked={selectedIds.size === displayedTxns.length && displayedTxns.length > 0} onCheckedChange={toggleAll} />
                  </th>
                  <th className="px-3 py-3 border-r border-casper w-28">Date</th>
                  <th className="px-3 py-3 border-r border-casper">Description</th>
                  <th className="px-3 py-3 border-r border-casper w-32">Category</th>
                  <th className="px-3 py-3 border-r border-casper w-32">Client</th>
                  <th className="px-3 py-3 border-r border-casper w-24">Type</th>
                  <th className="px-3 py-3 border-r border-casper w-28">Status</th>
                  <th className="px-4 py-3 text-right w-32">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-casper">
                {displayedTxns.map((t: any) => {
                  const isSelected = selectedIds.has(t.id);
                  const isViewing = selectedTxn?.id === t.id;
                  const statColor = getStatusColor(t.status);
                  const isIncome = t.type === 'income';
                  
                  return (
                    <tr 
                      key={t.id} 
                      className={`cursor-pointer transition-colors ${isViewing ? 'bg-theme-sidebar/10' : (isSelected ? 'bg-theme-sidebar/5' : 'hover:bg-stone-50')}`}
                      onClick={() => setSelectedTxn(t)}
                    >
                      <td className="px-4 py-2 text-center border-r border-casper" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(t.id)} />
                      </td>
                      <td className="px-3 py-2 text-charcoal font-medium border-r border-casper">{formatDate(t.date_recorded)}</td>
                      <td className="px-3 py-2 font-semibold text-charcoal truncate max-w-[350px] border-r border-casper">{t.description}</td>
                      <td className="px-3 py-2 text-charcoal border-r border-casper tracking-tight">{t.category_name || '—'}</td>
                      <td className="px-3 py-2 text-charcoal border-r border-casper">{t.client_name || '—'}</td>
                      <td className="px-3 py-2 border-r border-casper">
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isIncome ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'}`}>
                           {t.type}
                         </span>
                      </td>
                      <td className="px-3 py-2 border-r border-casper">
                        <div className={`flex items-center gap-1.5 ${statColor.label}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ring-2 ring-white ${statColor.dot}`}></span>
                          <span className="font-bold">{t.status || 'Pending'}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-2 text-right font-bold ${isIncome ? 'text-blue-700' : 'text-rose-700'}`}>
                        {isIncome ? '+' : '-'}{formatCurrency(t.amount, currency)}
                      </td>
                    </tr>
                  );
                })}
                {displayedTxns.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-theme-sidebar/50 text-sm">No transactions found matching the criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 flex items-center justify-between px-2 text-[11px] text-theme-sidebar/50 font-medium pb-2">
            <p>Showing <span className="text-theme-sidebar font-bold">1-{Math.min(20, displayedTxns.length)}</span> of <span className="text-theme-sidebar font-bold">{displayedTxns.length}</span> entries</p>
            <div className="flex gap-1.5">
              <button className="w-7 h-7 flex items-center justify-center rounded-md border border-theme-sidebar/10 bg-white hover:bg-stone-50 transition-all text-theme-sidebar/60">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="w-7 h-7 flex items-center justify-center rounded-md bg-theme-sidebar text-white font-bold shadow-sm">1</button>
              <button className="w-7 h-7 flex items-center justify-center rounded-md border border-theme-sidebar/10 bg-white hover:bg-stone-50 transition-all text-theme-sidebar/60">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Detail Right Pane */}
      {selectedTxn && (
        <aside className="w-[420px] h-full flex-shrink-0 border-l border-theme-sidebar/10 bg-white flex flex-col shadow-xl z-20 overflow-hidden relative">
          <div className="h-16 flex items-center justify-between px-6 border-b border-theme-sidebar/10 bg-[#f9faf9]">
            <h2 className="font-bold text-sm text-theme-text uppercase tracking-wider">Transaction Detail</h2>
            <div className="flex items-center gap-1.5">
              <button className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-sidebar/50 hover:text-theme-sidebar hover:bg-theme-sidebar/5">
                <FileText className="h-4 w-4" />
              </button>
              <button onClick={() => setSelectedTxn(null)} className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-sidebar/50 hover:text-red-500 hover:bg-red-50 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7 pb-24">
            
            {/* Hero Money Card */}
            <div className={`bg-gradient-to-br border rounded-xl p-5 relative overflow-hidden shadow-sm ${selectedTxn.type === 'income' ? 'from-blue-50 to-white border-blue-100/60' : 'from-rose-50 to-white border-rose-100/60'}`}>
              <div className="relative z-10 flex justify-between items-start mb-4">
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${selectedTxn.type === 'income' ? 'text-blue-700' : 'text-rose-700'}`}>Total Amount</p>
                  <p className={`text-3xl font-black ${selectedTxn.type === 'income' ? 'text-blue-900' : 'text-rose-900'}`}>{formatCurrency(selectedTxn.amount, currency)}</p>
                </div>
                {selectedTxn.status && (
                  <span className={`px-2.5 py-1 ${getStatusColor(selectedTxn.status).px} ${getStatusColor(selectedTxn.status).label} rounded-full text-[10px] font-bold uppercase tracking-wider`}>
                    {selectedTxn.status}
                  </span>
                )}
              </div>
              <div className={`grid grid-cols-2 gap-4 pt-4 border-t ${selectedTxn.type === 'income' ? 'border-blue-100' : 'border-rose-100'}`}>
                <div>
                  <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${selectedTxn.type === 'income' ? 'text-blue-800/50' : 'text-rose-800/50'}`}>Record ID</p>
                  <p className={`text-[13px] font-bold font-mono ${selectedTxn.type === 'income' ? 'text-blue-900' : 'text-rose-900'}`}>#{selectedTxn.id}</p>
                </div>
                <div>
                  <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${selectedTxn.type === 'income' ? 'text-blue-800/50' : 'text-rose-800/50'}`}>Reference #</p>
                  <p className={`text-[13px] font-bold ${selectedTxn.type === 'income' ? 'text-blue-900' : 'text-rose-900'}`}>{selectedTxn.reference_id || '—'}</p>
                </div>
              </div>
            </div>

            {/* Core Details Grid */}
            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
              <div className="col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-theme-sidebar/50 mb-1.5 block">Description</label>
                <p className="text-[13px] font-medium text-theme-text leading-relaxed">
                   {selectedTxn.description || 'No description provided.'}
                </p>
              </div>
              
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-theme-sidebar/50 mb-1.5 block">Category</label>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-tighter bg-stone-50 text-stone-600 border-stone-200">
                  {selectedTxn.category_name || 'Uncategorized'}
                </span>
              </div>
              
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-theme-sidebar/50 mb-1.5 block">Transaction Date</label>
                <p className="text-[13px] font-bold text-theme-text">{formatDate(selectedTxn.date_recorded)}</p>
              </div>
              
              <div className="col-span-2 h-[1px] bg-theme-sidebar/10"></div>
              
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-theme-sidebar/50 mb-1.5 block">Payment Method</label>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-theme-sidebar/40" />
                  <p className="text-[13px] font-bold text-theme-sidebar capitalize">{selectedTxn.payment_method || '—'}</p>
                </div>
              </div>
              
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-theme-sidebar/50 mb-1.5 block">Type</label>
                <p className="text-[13px] font-bold text-theme-sidebar capitalize">{selectedTxn.type}</p>
              </div>
              
            </div>

            {/* Receipt Preview Area */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-theme-sidebar/50">Attached Document</label>
                <a href="#" className="text-[10px] text-theme-sidebar hover:text-theme-text hover:underline font-bold flex items-center gap-1">
                  VIEW FULLSIZE <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
              <div className="aspect-[1.5/1] rounded-xl overflow-hidden border border-theme-sidebar/10 relative group cursor-pointer shadow-sm bg-stone-100 flex items-center justify-center">
                <div className="absolute inset-0 bg-theme-sidebar/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                  <span className="material-symbols-outlined text-white text-3xl">zoom_in</span>
                </div>
                <div className="w-[80%] h-[90%] bg-white shadow-lg border border-stone-200 rotate-1 relative px-4 py-6 font-mono text-[8px] text-stone-400 opacity-60 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="text-center font-bold text-stone-600 text-sm mb-4">DOCUMENT PREVIEW</div>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>Date:</span><span>{formatDate(selectedTxn.date_recorded)}</span></div>
                    <div className="flex justify-between"><span>Ref:</span><span>{selectedTxn.reference_id || 'N/A'}</span></div>
                  </div>
                  <div className="my-4 border-t border-dashed border-stone-300"></div>
                  <div className="flex justify-between font-bold text-stone-700 text-xs">
                    <span>TOTAL</span>
                    <span>{formatCurrency(selectedTxn.amount, currency)}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </aside>
      )}

    </div>
  );
}
