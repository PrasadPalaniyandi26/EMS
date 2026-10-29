'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useFitPageSize } from '@/hooks/use-fit-page-size';
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
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAttachment } from '@/components/shared/detail/detail-kit';

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
  // Rows per page follow the height of the table area (see useFitPageSize); 25 until it is measured
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const fitted = useFitPageSize(tableAreaRef);
  const PAGE_SIZE = fitted ?? 25;

  useEffect(() => { setHeader('Transactions', 'View all transactions'); }, [setHeader]);

  useEffect(() => { setPage(0); }, [search, filterType, filterPayment, filterClient, datePreset, dateFrom, dateTo, PAGE_SIZE]);

  const queryParams = useMemo(() => ({
    ...filters,
    ...(search ? { search } : {}),
    page: String(page + 1),
    limit: String(PAGE_SIZE),
  }), [filters, search, page, PAGE_SIZE]);

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
          {selectedTxn && (() => {
            const t = selectedTxn;
            const cfg = getStatusConfig(t.status);
            const reimb = t.reimbursement_status;
            return (
              <>
                <DetailSummary
                  title={t.reference_id || `#${t.id}`}
                  subtitle={t.description || 'No description'}
                  status={cfg.label}
                  statusClass={cfg.color}
                  figure={`${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount, currency)}`}
                  figureLabel={t.type === 'income' ? 'Income' : 'Expense'}
                />

                <DetailSection title="Details">
                  <DetailGrid>
                    <DetailField label="Date" value={formatDate(t.date_recorded)} />
                    <DetailField label="Payment method" value={t.payment_method ? String(t.payment_method).replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase()) : undefined} />
                    <DetailField label="Category" value={t.category_name} />
                    <DetailField label="Client" value={t.client_name} />
                    {(t.project_name || t.product_name) && <DetailField label="Project / product" value={t.project_name || t.product_name} wide />}
                  </DetailGrid>
                </DetailSection>

                {t.needs_reimbursement && (
                  <DetailSection title="Reimbursement">
                    <DetailGrid>
                      <DetailField label="Status" value={reimb === 'PAID' ? 'Paid' : reimb === 'ON_HOLD' ? 'On hold' : 'Pending'} tone={reimb === 'PAID' ? 'success' : 'warning'} />
                      <DetailField label="Handled by" value={t.reimbursed_by_name} />
                      {t.reimbursement_reference && <DetailField label="Reference" value={t.reimbursement_reference} />}
                      {t.reimbursed_at && <DetailField label="Date" value={formatDate(t.reimbursed_at)} />}
                      {t.reimbursement_note && <DetailField label="Note" value={t.reimbursement_note} wide />}
                    </DetailGrid>
                  </DetailSection>
                )}

                <DetailSection title="Document">
                  <DetailAttachment path={t.receipt_path} />
                </DetailSection>
              </>
            );
          })()}
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
              <SelectTrigger aria-label="Filter by type" className="h-8 w-[130px] bg-[var(--shell-hover)] border-[var(--shell-border)] text-[12px] font-medium"><SelectValue placeholder="Type: All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Type: All</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPayment} onValueChange={setFilterPayment}>
              <SelectTrigger aria-label="Filter by payment method" className="h-8 w-[150px] bg-[var(--shell-hover)] border-[var(--shell-border)] text-[12px] font-medium"><SelectValue placeholder="Payment: All" /></SelectTrigger>
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
              <SelectTrigger aria-label="Filter by client" className="h-8 w-[150px] bg-[var(--shell-hover)] border-[var(--shell-border)] text-[12px] font-medium"><SelectValue placeholder="Client: All" /></SelectTrigger>
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
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--shell-border)] bg-[var(--shell-hover)] text-[12px] font-semibold text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] hover:bg-[var(--shell-surface)] transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div ref={tableAreaRef} className="flex-1 overflow-auto min-h-0">
        <table className="w-full border-collapse whitespace-nowrap text-left text-[13px]">
          <thead className="sticky top-0 z-10 border-b border-[var(--shell-border)] bg-[var(--table-header)] text-[12px] font-semibold text-[var(--shell-text)]">
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
                <td className="px-4 py-3"><div className="h-4 w-4 rounded-md bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-3 w-20 rounded-md bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-3 w-48 rounded-md bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-3 w-24 rounded-md bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-3 w-20 rounded-md bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-5 w-16 rounded-sm bg-[var(--shell-hover)]" /></td>
                <td className="px-3 py-3"><div className="h-3 w-16 rounded-md bg-[var(--shell-hover)]" /></td>
                <td className="px-4 py-3"><div className="h-3 w-20 rounded-md bg-[var(--shell-hover)] ml-auto" /></td>
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
      <div className="px-4 py-2.5 shrink-0 border-t border-[var(--shell-border)] flex items-center justify-between text-[12px] text-[var(--shell-text-muted)] font-medium">
        <p>
          Showing <span className="text-[var(--shell-text)] font-semibold">{total === 0 ? 0 : page * PAGE_SIZE + 1}–{page * PAGE_SIZE + displayedTxns.length}</span> of <span className="text-[var(--shell-text)] font-semibold">{total}</span>
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
          <button aria-current="page" aria-label={`Page ${page + 1}`} className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--shell-accent)] text-[var(--shell-accent-fg)] font-semibold">{page + 1}</button>
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
