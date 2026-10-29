'use client';
import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactions, useClients } from '@/hooks/use-queries';
import api, { getAccessToken, API_BASE } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Calendar, ChevronLeft, ChevronRight, FileText, ArrowUpRight, CreditCard, Download, CheckCircle2, Clock, PauseCircle, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getStatusConfig } from '@/lib/status';
import { formatCurrency, formatDate, getDateRange, toLocalYMD } from '@/lib/currency';
import { toast } from 'sonner';
import { TextCell, DateCell, MoneyCell, StatusText } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';

export default function TransactionsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';

  const [datePreset, setDatePreset] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: clients } = useClients();

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
    if (filterPayment !== 'all') f.paymentMethod = filterPayment;
    if (filterClient !== 'all') f.clientId = filterClient;
    return f;
  }, [datePreset, dateFrom, dateTo, filterType, filterPayment, filterClient]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const token = getAccessToken();
      const params = new URLSearchParams(filters).toString();
      const res = await fetch(`${API_BASE}/transactions/export${params ? '?' + params : ''}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${toLocalYMD()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export transactions');
    } finally {
      setExporting(false);
    }
  };

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedTxn, setSelectedTxn] = useState<any>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => { setHeader('Transactions', 'View all transactions'); }, [setHeader]);

  useEffect(() => { setPage(0); }, [search, filterType, filterPayment, filterClient, datePreset, dateFrom, dateTo]);

  const queryParams = useMemo(() => ({
    ...filters,
    ...(search ? { search } : {}),
    page: String(page + 1),
    limit: String(PAGE_SIZE),
  }), [filters, search, page]);

  const { data: txnData, isLoading } = useTransactions(queryParams);
  const displayedTxns = txnData?.rows || [];
  const total = txnData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === displayedTxns.length && displayedTxns.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(displayedTxns.map((t: any) => t.id)));
  };

  return (
    <ModuleShell
      showPanel={!!selectedTxn}
      intelligencePanel={
        <ModuleIntelligencePanel
          title="Transaction Detail"
          onClose={() => setSelectedTxn(null)}
          hasSelection={!!selectedTxn}
        >
          {selectedTxn && (
            <div className="space-y-5">
              <div className={`rounded-lg p-4 border ${selectedTxn.type === 'income' ? 'bg-[color-mix(in_srgb,var(--info)_15%,transparent)] border-[color-mix(in_srgb,var(--info)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]'}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className={`text-[11px] font-bold mb-1 ${selectedTxn.type === 'income' ? 'text-[var(--info)]' : 'text-[var(--danger)]'}`}>Total Amount</p>
                    <p className={`text-2xl font-black ${selectedTxn.type === 'income' ? 'text-[var(--info)]' : 'text-[var(--danger)]'}`}>{formatCurrency(selectedTxn.amount, currency)}</p>
                  </div>
                  {selectedTxn.status && (() => {
                    const sc = getStatusConfig(selectedTxn.status);
                    return <Badge variant="outline" className={`text-[11px] font-bold ${sc.color} ${sc.bg}`}>{sc.label}</Badge>;
                  })()}
                </div>
                <div className={`grid grid-cols-2 gap-4 pt-3 border-t ${selectedTxn.type === 'income' ? 'border-[color-mix(in_srgb,var(--info)_20%,transparent)]' : 'border-[color-mix(in_srgb,var(--danger)_20%,transparent)]'}`}>
                  <div>
                    <p className="text-[11px] font-bold mb-0.5 text-[var(--shell-text-muted)]">Record ID</p>
                    <p className="text-[13px] font-bold text-black dark:text-white">#{selectedTxn.id}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold mb-0.5 text-[var(--shell-text-muted)]">Reference #</p>
                    <p className="text-[13px] font-bold text-black dark:text-white">{selectedTxn.reference_id || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-4 gap-x-4">
                <div className="col-span-2">
                  <p className="text-[11px] font-bold text-[var(--shell-text-muted)] mb-1 block">Description</p>
                  <p className="text-[12px] font-medium text-[var(--shell-text-muted)] bg-[var(--shell-hover)] px-2.5 py-2 rounded-lg border border-[var(--shell-border)] leading-relaxed">
                    {selectedTxn.description || 'No description provided.'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[var(--shell-text-muted)] mb-1 block">Category</p>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-[var(--shell-hover)] text-[var(--shell-text-muted)] border-[var(--shell-border)]">
                    {selectedTxn.category_name || 'Uncategorized'}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[var(--shell-text-muted)] mb-1 block">Transaction Date</p>
                  <p className="text-[12px] font-bold text-black dark:text-white">{formatDate(selectedTxn.date_recorded)}</p>
                </div>
                <div className="col-span-2 h-[1px] bg-[var(--shell-hover)]" />
                <div>
                  <p className="text-[11px] font-bold text-[var(--shell-text-muted)] mb-1 block">Payment Method</p>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-[var(--shell-text-muted)]" />
                    <p className="text-[12px] font-bold text-[var(--shell-text-muted)] capitalize">{selectedTxn.payment_method || '—'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[var(--shell-text-muted)] mb-1 block">Type</p>
                  <p className="text-[12px] font-bold text-[var(--shell-text-muted)] capitalize">{selectedTxn.type}</p>
                </div>
              </div>

              {selectedTxn.needs_reimbursement && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-[var(--shell-text-muted)] flex items-center gap-2 border-b border-[var(--shell-border)] pb-1.5">
                    <Wallet className="w-3.5 h-3.5" /> Reimbursement
                  </p>
                  {selectedTxn.reimbursement_status === 'PAID' ? (
                    <div className="flex flex-col gap-1 px-3 py-2.5 rounded-lg bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)]">
                      <div className="flex items-center gap-2 text-[var(--success)]">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span className="text-[11px] font-bold">
                          Reimbursed{selectedTxn.reimbursed_by_name ? ` by ${selectedTxn.reimbursed_by_name}` : ''}{selectedTxn.reimbursed_at ? ` · ${formatDate(selectedTxn.reimbursed_at)}` : ''}
                        </span>
                      </div>
                      {selectedTxn.reimbursement_reference && (
                        <span className="text-[11px] text-[color-mix(in_srgb,var(--success)_70%,transparent)] pl-6">Ref: {selectedTxn.reimbursement_reference}</span>
                      )}
                      {selectedTxn.reimbursement_note && (
                        <span className="text-[11px] text-[color-mix(in_srgb,var(--success)_70%,transparent)] pl-6">{selectedTxn.reimbursement_note}</span>
                      )}
                    </div>
                  ) : selectedTxn.reimbursement_status === 'ON_HOLD' ? (
                    <div className="flex flex-col gap-1 px-3 py-2.5 rounded-lg bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_20%,transparent)]">
                      <div className="flex items-center gap-2 text-[var(--warning)]">
                        <PauseCircle className="w-4 h-4 shrink-0" />
                        <span className="text-[11px] font-bold">On Hold{selectedTxn.reimbursed_by_name ? ` · ${selectedTxn.reimbursed_by_name}` : ''}</span>
                      </div>
                      {selectedTxn.reimbursement_note && (
                        <span className="text-[11px] text-[color-mix(in_srgb,var(--warning)_70%,transparent)] pl-6">{selectedTxn.reimbursement_note}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)]">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="text-[11px] font-bold">Pending Reimbursement</span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--shell-text-muted)]">Attached Document</p>
                {selectedTxn.receipt_path ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const path = selectedTxn.receipt_path;
                      const url = path.startsWith('/') ? path : `${API_BASE}/receipts/${path}`;
                      try {
                        const token = getAccessToken();
                        const res = await fetch(url, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
                        if (!res.ok) { toast.error(`Receipt load failed: ${res.status}`); return; }
                        window.open(URL.createObjectURL(await res.blob()), '_blank');
                      } catch {
                        toast.error('Could not load receipt. Please try again.');
                      }
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-hover)] px-3 py-3 text-left hover:border-[var(--shell-accent)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"
                  >
                    <FileText aria-hidden className="h-4 w-4 shrink-0 text-[var(--shell-text-muted)]" />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--shell-text)]">{selectedTxn.receipt_path.split('/').pop()}</span>
                    <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--shell-text-muted)]">OPEN <ArrowUpRight aria-hidden className="h-3 w-3" /></span>
                  </button>
                ) : (
                  <p className="rounded-lg border border-dashed border-[var(--shell-border)] px-3 py-3 text-[12px] text-[var(--shell-text-muted)]">No document attached.</p>
                )}
              </div>
            </div>
          )}
        </ModuleIntelligencePanel>
      }
    >
      {/* Filter Area */}
      <div className="px-4 pt-3 pb-2.5 shrink-0 border-b border-[var(--shell-border)]">
        <div className="flex items-center gap-3 mb-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--shell-text-muted)]" />
            <Input
              aria-label="Search transactions"
              className="pl-9 h-9 bg-[var(--shell-bg)] border-[var(--shell-border)] text-xs focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--info)_50%,transparent)]"
              placeholder="Search description, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={datePreset} onValueChange={setDatePreset}>
              <SelectTrigger aria-label="Date range" className="h-9 w-[140px] bg-[var(--shell-bg)] border-[var(--shell-border)] text-xs">
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
            <div className="flex items-center gap-2 bg-[var(--shell-bg)] border border-[var(--shell-border)] rounded-md px-3 h-9 text-xs font-medium text-[var(--shell-text-muted)]">
              <Calendar className="h-3.5 w-3.5 text-[var(--shell-text-muted)]" />
              <input aria-label="From date" className="bg-transparent border-none p-0 w-[78px] text-center focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <span className="text-[var(--shell-text-muted)]">to</span>
              <input aria-label="To date" className="bg-transparent border-none p-0 w-[78px] text-center focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger aria-label="Filter by type" className="h-8 w-[130px] bg-[var(--shell-hover)] border-[var(--shell-border)] text-[11px] font-medium"><SelectValue placeholder="Type: All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Type: All</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPayment} onValueChange={setFilterPayment}>
              <SelectTrigger aria-label="Filter by payment method" className="h-8 w-[150px] bg-[var(--shell-hover)] border-[var(--shell-border)] text-[11px] font-medium"><SelectValue placeholder="Payment: All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Payment: All</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger aria-label="Filter by client" className="h-8 w-[150px] bg-[var(--shell-hover)] border-[var(--shell-border)] text-[11px] font-medium"><SelectValue placeholder="Client: All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Client: All</SelectItem>
                {(clients || []).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--shell-border)] bg-[var(--shell-hover)] text-[11px] font-bold text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] hover:bg-[var(--shell-surface)] transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="sticky top-0 z-10 border-b border-[var(--shell-border)] bg-[var(--shell-hover)] text-[12px] font-semibold text-[var(--shell-text-muted)]">
            <tr>
              <th scope="col" className="h-10 w-10 px-4 text-center">
                <Checkbox aria-label="Select all transactions" checked={selectedIds.size === displayedTxns.length && displayedTxns.length > 0} onCheckedChange={toggleAll} />
              </th>
              <th scope="col" className="h-10 w-28 px-4 font-medium">Date</th>
              <th scope="col" className="h-10 px-4 font-medium">Description</th>
              <th scope="col" className="h-10 w-32 px-4 font-medium">Category</th>
              <th scope="col" className="h-10 w-32 px-4 font-medium">Client</th>
              <th scope="col" className="h-10 w-24 px-4 font-medium">Type</th>
              <th scope="col" className="h-10 w-36 px-4 font-medium">Status</th>
              <th scope="col" className="h-10 w-32 px-4 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && [...Array(8)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td className="px-4 py-3"><div className="h-4 w-4 rounded bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-3 w-20 rounded bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-3 w-48 rounded bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-3 w-24 rounded bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-3 w-20 rounded bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-5 w-16 rounded-sm bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-3 w-16 rounded bg-[var(--shell-hover)]" /></td>
                <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-[var(--shell-hover)] ml-auto" /></td>
              </tr>
            ))}
            {!isLoading && displayedTxns.map((t: any) => {
              const isSelected = selectedIds.has(t.id);
              const isViewing = selectedTxn?.id === t.id;
              const isIncome = t.type === 'income';
              return (
                <tr
                  key={t.id}
                  className={`cursor-pointer transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)] border-b border-[var(--shell-border)] ${isViewing ? 'bg-[var(--shell-accent)]/8 shadow-[inset_2px_0_0_var(--shell-accent)]' : (isSelected ? 'bg-[var(--shell-accent)]/5' : 'hover:bg-[var(--shell-hover)]')}`}
                  tabIndex={0}
                  aria-selected={isViewing}
                  onClick={() => setSelectedTxn(t)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelectedTxn(t); } }}
                >
                  <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox aria-label={`Select ${t.description}`} checked={isSelected} onCheckedChange={() => toggleSelect(t.id)} />
                  </td>
                  <td className="px-4 py-2.5"><DateCell value={t.date_recorded} /></td>
                  <td className="max-w-[350px] truncate px-4 py-2.5"><TextCell value={t.description} strong /></td>
                  <td className="px-4 py-2.5"><TextCell value={t.category_name} /></td>
                  <td className="px-4 py-2.5"><TextCell value={t.client_name} /></td>
                  <td className="px-4 py-2.5"><TextCell value={isIncome ? 'Income' : 'Expense'} /></td>
                  <td className="px-4 py-2.5"><StatusText status={t.status} /></td>
                  <td className="px-4 py-2.5"><MoneyCell value={t.amount} currency={currency} /></td>
                </tr>
              );
            })}
            {!isLoading && displayedTxns.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[var(--shell-text-muted)] text-sm">No transactions found matching the criteria.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-2.5 shrink-0 border-t border-[var(--shell-border)] flex items-center justify-between text-[11px] text-[var(--shell-text-muted)] font-medium">
        <p>
          Showing <span className="text-[var(--shell-text)] font-bold">{total === 0 ? 0 : page * PAGE_SIZE + 1}–{page * PAGE_SIZE + displayedTxns.length}</span> of <span className="text-[var(--shell-text)] font-bold">{total}</span>
        </p>
        <div className="flex gap-1.5">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Previous page"
            className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--shell-border)] bg-[var(--shell-surface)] hover:bg-[var(--shell-hover)] transition-all text-[var(--shell-text-muted)] disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button aria-current="page" aria-label={`Page ${page + 1}`} className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--shell-accent)] text-[var(--shell-accent-fg)] font-bold">{page + 1}</button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
            aria-label="Next page"
            className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--shell-border)] bg-[var(--shell-surface)] hover:bg-[var(--shell-hover)] transition-all text-[var(--shell-text-muted)] disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </ModuleShell>
  );
}
