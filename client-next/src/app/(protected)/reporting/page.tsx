'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ColumnDef, SortingState, getCoreRowModel, getPaginationRowModel, getSortedRowModel } from '@tanstack/react-table';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { headerRight } from '@/components/data-table/cells';
import { TableCell, TableRow } from '@/components/ui/table';
import { inputStyle } from '@/components/shared/modal-primitives';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import api from '@/lib/api-client';
import { useBudgetPlans, fyLabel } from '@/hooks/use-budget-queries';
import { formatCurrency, getDateRange } from '@/lib/currency';
import {
  BarChart3, FileText, TrendingDown, TrendingUp, Scale, Target, ListFilter,
  ArrowLeftRight, Users, Download, Sheet,
  ChevronDown, Loader2, Search, Receipt, Wallet, AlertTriangle,
  CalendarRange, FileWarning, Boxes, Percent, Ruler, Hourglass, BookText,
  FileSpreadsheet, ScrollText, Coins, Landmark, Calculator, ClipboardList, Briefcase, Clock, Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { RecordLink, TabBar, useTabParam } from '@/components/budgets/budget-ui';
import { useCategories, useClients, useProducts, useProjects } from '@/hooks/use-queries';

// ── Helpers ──────────────────────────────────────────────────────────────────
const escapeHtml = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

// ── Types ────────────────────────────────────────────────────────────────────
interface ReportResult {
  title: string;
  columns: string[];
  rows: Record<string, any>[];
  totals: Record<string, any>;
  truncated?: boolean;
  note?: string;
}

// ── Report catalogue ─────────────────────────────────────────────────────────
const REPORTS = [
  { id: 'expense-summary', group: 'spend', label: 'Expense Summary', icon: TrendingDown, desc: 'Spend by category: net, GST, total, share and claimable GST', color: 'text-[var(--danger)]', bg: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]' },
  { id: 'income-summary', group: 'spend', label: 'Income Summary', icon: TrendingUp, desc: 'Income by category: net, GST, total and share', color: 'text-[var(--success)]', bg: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' },
  { id: 'pl-statement', group: 'spend', label: 'P&L Statement', icon: Scale, desc: 'Income and spend for every month, on the total including GST', color: 'text-[var(--info)]', bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]' },
  { id: 'budget-vs-actual', group: 'budget', label: 'Budget vs Actual', icon: Target, desc: 'Budget against real spend for each budget line', color: 'text-[var(--warning)]', bg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]' },
  { id: 'transaction-ledger', group: 'spend', label: 'Transaction Ledger', icon: ArrowLeftRight, desc: 'Every record one by one, with status, approver and split parts, and what the rows come to', color: 'text-[var(--info)]', bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]' },
  { id: 'client-summary', group: 'spend', label: 'Client Summary', icon: Users, desc: 'Spend and income by client and category, with no-client spend listed too', color: 'text-[var(--info)]', bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]' },
  { id: 'claimable-gst', group: 'tax', label: 'Claimable GST', icon: Receipt, desc: 'GST claimable on expense transactions by category', color: 'text-[var(--warning)]', bg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]' },
  { id: 'reimbursement-register', group: 'claims', label: 'Reimbursement Register', icon: Wallet, desc: 'Expenses to be paid back to employees: pending, on hold and paid', color: 'text-[var(--info)]', bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]' },
  { id: 'budget-by-month', group: 'budget', label: 'Budget by Month', icon: CalendarRange, desc: 'Budget, actual and committed for each month of the year, with running totals', color: 'text-[var(--success)]', bg: '' },
  { id: 'unbudgeted-spend', group: 'budget', label: 'Unbudgeted Spend', icon: FileWarning, desc: 'Expenses that no budget line covers', color: 'text-[var(--danger)]', bg: '' },
  { id: 'order-costing', group: 'operations', label: 'Order Costing', icon: Boxes, desc: 'Orders: dates, days late, planned cost, value, budget, spend, invoiced and received', color: 'text-[var(--warning)]', bg: '' },
  { id: 'product-margin', group: 'operations', label: 'Product Margin', icon: Percent, desc: 'Every product: price against standard cost, margin against goals, and planned units', color: 'text-[var(--success)]', bg: '' },
  { id: 'project-estimate', group: 'operations', label: 'Project Estimate vs Actual', icon: Ruler, desc: 'Approved estimate against spend, with invoiced and received', color: 'text-[var(--info)]', bg: '' },
  { id: 'receivables-ageing', group: 'receivables', label: 'Receivables Ageing', icon: Hourglass, desc: 'What each client owes, by how long it has been due', color: 'text-[var(--danger)]', bg: '' },
  { id: 'gst-sales-register', group: 'receivables', label: 'GST Sales Register', icon: BookText, desc: 'Invoices issued in the period, with CGST, SGST and IGST', color: 'text-[var(--success)]', bg: '' },
  { id: 'invoice-register', group: 'receivables', label: 'Invoice Register', icon: FileSpreadsheet, desc: 'Every invoice raised in the period, with received, tax deducted, balance and days overdue', color: 'text-[var(--info)]', bg: '' },
  { id: 'client-statement', group: 'receivables', label: 'Client Statement', icon: ScrollText, desc: "One client's account: invoices, payments and the balance after each line", color: 'text-[var(--success)]', bg: '' },
  { id: 'collections', group: 'receivables', label: 'Collections', icon: Coins, desc: 'Money received in the period, with method, reference and tax deducted', color: 'text-[var(--warning)]', bg: '' },
  { id: 'tds-register', group: 'tax', label: 'TDS Register', icon: Landmark, desc: 'Tax clients deducted before paying us, to match against their certificates', color: 'text-[var(--danger)]', bg: '' },
  { id: 'gst-position', group: 'tax', label: 'GST Position', icon: Calculator, desc: 'GST charged on invoices against GST claimable on expenses, month by month', color: 'text-[var(--info)]', bg: '' },
  { id: 'client-po-status', group: 'operations', label: 'Client PO Status', icon: ClipboardList, desc: 'Each client PO: value, billed so far, what is left and whether it has expired', color: 'text-[var(--success)]', bg: '' },
  { id: 'project-billing', group: 'operations', label: 'Project Billing', icon: Briefcase, desc: 'Each project billed against its contract and client POs, with received and outstanding', color: 'text-[var(--warning)]', bg: '' },
  { id: 'outstanding-reimbursements', group: 'claims', label: 'Outstanding Reimbursements', icon: Clock, desc: 'Claims still to pay for each employee, with how long the oldest has waited', color: 'text-[var(--danger)]', bg: '' },
];

// Report groups, one tab each; a tab shows only when the user can open at least one of its reports
const GROUPS = [
  { value: 'spend', label: 'Spend' },
  { value: 'budget', label: 'Budget' },
  { value: 'receivables', label: 'Receivables' },
  { value: 'tax', label: 'Tax' },
  { value: 'operations', label: 'Operations' },
  { value: 'claims', label: 'Claims' },
] as const;
type Group = typeof GROUPS[number]['value'];

// Reports driven by a financial year rather than a date range
const FY_REPORTS = new Set(['budget-vs-actual', 'budget-by-month', 'unbudgeted-spend', 'product-margin']);
// Costing figures are for Finance and Admin; a manager sees the generic reports and the budgets they own
const FINANCE_ONLY = new Set(['unbudgeted-spend', 'order-costing', 'product-margin', 'project-estimate', 'receivables-ageing', 'gst-sales-register', 'invoice-register', 'client-statement', 'collections', 'tds-register', 'gst-position', 'client-po-status', 'project-billing']);
const NO_PERIOD = new Set(['project-estimate', 'receivables-ageing', 'client-po-status', 'project-billing', 'outstanding-reimbursements']);
// Invoice reports can be narrowed to one client; the statement needs one
const CLIENT_REPORTS = new Set(['invoice-register', 'client-statement', 'collections', 'tds-register', 'client-po-status']);
// Reports built from transactions can be narrowed by client, project, product, category and person; some can be set against the period before
const FILTERABLE = new Set(['expense-summary', 'income-summary', 'pl-statement', 'claimable-gst', 'client-summary', 'transaction-ledger']);
const COMPARABLE = new Set(['expense-summary', 'income-summary', 'pl-statement', 'client-summary']);
const EMPTY_FILTERS = { clientId: '', projectId: '', productId: '', categoryId: '', personId: '' };
type Filters = typeof EMPTY_FILTERS;

const DATE_PRESETS = [
  { label: 'This Month', key: 'thisMonth' },
  { label: 'Last Month', key: 'lastMonth' },
  { label: 'This Quarter', key: 'thisQuarter' },
  { label: 'Financial Year', key: 'finYear' },
  { label: 'Calendar Year', key: 'calYear' },
  { label: 'Custom', key: 'custom' },
];

const CURRENCY_COLS = new Set([
  'Amount', 'Income', 'Expenses', 'Net', 'Budget', 'Actual', 'Committed', 'Spent', 'Remaining', 'Net Amount', 'Total Amount', 'GST Amount',
  'Cumulative Budget', 'Cumulative Used', 'Unit Cost', 'Planned Cost', 'Order Value', 'Price', 'Standard Cost', 'Margin', 'Contract Value', 'Estimate',
  'Not Due', '1-30 Days', '31-60 Days', '61-90 Days', 'Over 90 Days', 'Outstanding', 'Taxable', 'CGST', 'SGST', 'IGST', 'Round Off', 'Invoice Value',
  'Average', 'Claimable GST', 'Invoiced', 'Received', 'Estimate Total', 'Extended Margin',
  'Debit', 'Credit', 'Balance', 'TDS', 'Total Credited', 'TDS Deducted', 'Output GST', 'Input GST', 'Net Payable', 'PO Value', 'Client PO Value', 'Unbilled', 'Pending', 'On Hold',
]);
const isPctCol = (c: string) => c === '% Used' || c === '% Billed' || c.endsWith(' %');

// ── Number util ───────────────────────────────────────────────────────────────
// A column is numeric when any row has a number in it, so a null in the first row does not decide it
function isNumericCol(col: string, rows: Record<string, any>[]) {
  return rows.some((r) => typeof r[col] === 'number');
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ReportingPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  // The API checks the active role, so the list does too
  const isFinanceUser = ['ADMIN', 'FINANCE'].includes(String(user?.role_name ?? '').toUpperCase());
  const role = String(user?.role_name ?? '').toUpperCase();
  const reports = REPORTS.filter((r) => isFinanceUser || !FINANCE_ONLY.has(r.id));
  const fmt = (n: number) => formatCurrency(n, currency);

  useEffect(() => { setHeader('Reports', 'Generate, view & export financial reports'); }, [setHeader]);

  const groups = GROUPS.filter((g) => reports.some((r) => r.group === g.value));
  const [group, setGroup] = useTabParam<Group>(groups.map((g) => g.value), 'spend');
  const [selectedType, setSelectedType] = useState('expense-summary');
  const [datePreset, setDatePreset] = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [txnType, setTxnType] = useState('');
  const [ledgerStatus, setLedgerStatus] = useState('');
  const [categoryType, setCategoryType] = useState('all');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [compare, setCompare] = useState(false);
  const [asOf, setAsOf] = useState('');
  const [resultType, setResultType] = useState('');
  const [fy, setFy] = useState('');
  const { data: plansData } = useBudgetPlans();
  const fyOptions = Array.from(new Set([...(plansData?.plans ?? []).map((p) => p.fy), ...(plansData ? [plansData.current_fy] : [])])).sort((a, b) => b - a);
  const activeFy = fy || (plansData ? String(plansData.current_fy) : '');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // A link from another page can open a report straight away: /reporting?report=unbudgeted-spend&year=2026
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const wanted = q.get('report');
    const hit = REPORTS.find((r) => r.id === wanted);
    if (hit) { setSelectedType(hit.id); setGroup(hit.group as Group); setResult(null); }
    const y = q.get('year');
    if (y && /^\d{4}$/.test(y)) setFy(y);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The selected report always belongs to the open tab: opening a tab, or a tab in the link, picks its first report
  useEffect(() => {
    if (REPORTS.find((r) => r.id === selectedType)?.group === group) return;
    const first = reports.find((r) => r.group === group);
    if (first) { setSelectedType(first.id); setResult(null); }
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

  // Init date range to This Month
  useEffect(() => {
    const r = getDateRange('thisMonth');
    setDateFrom(r.from);
    setDateTo(r.to);
  }, []);

  // A result belongs to the filters it was made with, so changing one clears it
  useEffect(() => { setResult(null); }, [dateFrom, dateTo, txnType, ledgerStatus, categoryType, activeFy, filters, compare, asOf]);

  // What a report can be narrowed to
  const { data: clientList } = useClients(true);
  const { data: projectList } = useProjects();
  const { data: productList } = useProducts();
  const { data: categoryList } = useCategories();
  const { data: people } = useQuery({ queryKey: ['reporting', 'people'], queryFn: () => api.get<{ id: number; username: string }[]>('/reporting/people').then((r) => r.data), staleTime: 5 * 60 * 1000 });
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const nameOf = (list: { id: number; name?: string; code?: string | null }[] | undefined, id: string) => { const x = list?.find((i) => String(i.id) === id); return x ? [x.code, x.name].filter(Boolean).join(' ') : id; };

  const handlePreset = (label: string, key: string) => {
    setDatePreset(label);
    if (key !== 'custom') {
      const r = getDateRange(key as any);
      setDateFrom(r.from);
      setDateTo(r.to);
    }
  };

  // What goes to the API for a report: the period or year, and the filters that report understands. A drill-through passes its own values.
  const buildParams = (type: string, o: { dateFrom?: string; dateTo?: string; txnType?: string; status?: string; filters?: Filters; compare?: boolean } = {}) => {
    const params: Record<string, string> = { type };
    const f = o.filters ?? filters;
    if (FY_REPORTS.has(type)) {
      if (activeFy) params.year = activeFy;
    } else if (type === 'receivables-ageing') {
      if (asOf) params.asOf = asOf;
    } else if (!NO_PERIOD.has(type)) {
      const from = o.dateFrom ?? dateFrom; const to = o.dateTo ?? dateTo;
      if (from) params.dateFrom = from;
      if (to) params.dateTo = to;
      const tt = o.txnType ?? txnType;
      if (type === 'transaction-ledger') { if (tt) params.txnType = tt; const st = o.status ?? ledgerStatus; if (st) params.status = st; }
      if (type === 'client-summary') { params.categoryType = categoryType; if (tt) params.txnType = tt; }
      if (FILTERABLE.has(type)) for (const [k, v] of Object.entries(f)) if (v) params[k] = v;
      if (COMPARABLE.has(type) && (o.compare ?? compare)) params.compare = '1';
    }
    if (CLIENT_REPORTS.has(type) && f.clientId) params.clientId = f.clientId;
    return params;
  };

  const run = async (params: Record<string, string>) => {
    setLoading(true);
    setResult(null);
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await api.get<ReportResult>(`/reporting/generate?${qs}`);
      setResultType(params.type);
      setResult((res as any).data ?? res);
    } catch {
      // toast handled by api client
    } finally {
      setLoading(false);
    }
  };
  const generate = () => {
    if (selectedType === 'client-statement' && !filters.clientId) { toast.error('Choose a client for the statement.'); return; }
    run(buildParams(selectedType));
  };

  // From a row of a summary to the records behind it: the Transaction Ledger with the same period and filters, narrowed to that row
  const showRecords = (patch: { dateFrom?: string; dateTo?: string; txnType?: string; filters?: Partial<Filters> }) => {
    const next = { ...filters, ...patch.filters };
    const tt = patch.txnType ?? '';
    setSelectedType('transaction-ledger'); setGroup('spend'); setTxnType(tt); setLedgerStatus('approved'); setFilters(next); setCompare(false);
    if (patch.dateFrom && patch.dateTo) { setDateFrom(patch.dateFrom); setDateTo(patch.dateTo); setDatePreset('Custom'); }
    run(buildParams('transaction-ledger', { dateFrom: patch.dateFrom, dateTo: patch.dateTo, txnType: tt, status: 'approved', filters: next, compare: false }));
  };

  const filteredRows = useMemo(() => (result
    ? result.rows.filter((row) =>
        !search || Object.entries(row).some(([k, v]) => !k.startsWith('_') && String(v).toLowerCase().includes(search.toLowerCase()))
      )
    : []), [result, search]);

  // The last column of a report whose rows can be followed to the records or the page behind them
  function drillColumn(): ColumnDef<Record<string, any>, any>[] {
    const month = (m: string) => { const [y, mo] = m.split('-').map(Number); const last = new Date(y, mo, 0).getDate(); return { dateFrom: `${m}-01`, dateTo: `${m}-${String(last).padStart(2, '0')}` }; };
    const btn = (label: string, onClick: () => void) => (
      <button type="button" onClick={onClick} className="rounded-md px-1 text-[13px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">{label}</button>
    );
    const cell = (row: Record<string, any>) => {
      switch (resultType) {
        case 'expense-summary': case 'income-summary':
          return row._categoryId != null ? btn('Records', () => showRecords({ txnType: resultType === 'income-summary' ? 'income' : 'expense', filters: { categoryId: String(row._categoryId) } })) : null;
        case 'client-summary':
          return row._clientId != null ? btn('Records', () => showRecords({ txnType: row._type, filters: { clientId: String(row._clientId), ...(row._categoryId != null ? { categoryId: String(row._categoryId) } : {}) } })) : null;
        case 'pl-statement': return btn('Records', () => showRecords({ ...month(String(row.Month)), txnType: '' }));
        case 'order-costing': return <RecordLink href={`/business/orders/${row._orderId}`}>Open</RecordLink>;
        case 'project-estimate': case 'project-billing': return <RecordLink href={`/business/projects/${row._projectId}`}>Open</RecordLink>;
        case 'product-margin': return <RecordLink href={`/business/products/${row._productId}`}>Open</RecordLink>;
        default: return null;
      }
    };
    if (!['expense-summary', 'income-summary', 'client-summary', 'pl-statement', 'order-costing', 'project-estimate', 'project-billing', 'product-margin'].includes(resultType)) return [];
    return [{ id: '_open', header: '', enableSorting: false, size: 90, accessorFn: () => '', cell: ({ row }: { row: { original: Record<string, any> } }) => cell(row.original) } as ColumnDef<Record<string, any>, any>];
  }

  // The columns come with the report, so the table is built from them; numbers sit right, in the same cell style as every table
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo<ColumnDef<Record<string, any>, any>[]>(() => (result?.columns ?? []).map((col) => {
    const numeric = isNumericCol(col, result!.rows);
    return {
      id: col,
      header: numeric ? headerRight(col) : col,
      accessorFn: (row: Record<string, any>) => row[col],
      cell: ({ row }: { row: { original: Record<string, any> } }) => {
        const val = row.original[col];
        const isNum = typeof val === 'number';
        const isPct = isPctCol(col);
        const display = isNum && CURRENCY_COLS.has(col) ? formatCurrency(val, currency) : isPct ? (val != null ? `${val}%` : '—') : val ?? '—';
        const color = isPct
          ? col === '% Used' && val >= 100 ? 'var(--danger)' : col === '% Used' && val >= 80 ? 'var(--warning)' : undefined
          : col === 'Net' ? (val >= 0 ? 'var(--success)' : 'var(--danger)') : undefined;
        return (
          <div className={isNum ? 'text-right font-semibold tabular-nums whitespace-nowrap' : undefined} style={{ color: color ?? 'var(--shell-text)' }}>{display}</div>
        );
      },
    } as ColumnDef<Record<string, any>, any>;
  }).concat(drillColumn()), [result, currency, resultType, filters]);

  const table = useDataTable({
    data: filteredRows, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  const totalsRow = result && Object.keys(result.totals).length > 0 ? (
    <TableRow className="hover:bg-transparent">
      {result.columns.map((col, ci) => {
        const val = result.totals[col];
        return (
          <TableCell key={col} className={`font-semibold ${val != null ? 'text-right tabular-nums' : ''}`}>
            {ci === 0 ? 'Total' : val != null ? (CURRENCY_COLS.has(col) ? fmt(val) : val) : ''}
          </TableCell>
        );
      })}
    </TableRow>
  ) : null;

  // ── Export ──────────────────────────────────────────────────────────────────
  // What the table shows is what is exported. While a search is active the totals describe the whole report, so they are left out.
  const withTotals = !search && !!result && Object.keys(result.totals).length > 0;
  const totalCell = (col: string, ci: number) => (result!.totals[col] != null ? result!.totals[col] : ci === 0 ? 'Total' : '');
  const shownText = (col: string, v: unknown) =>
    typeof v === 'number' && CURRENCY_COLS.has(col) ? formatCurrency(v, currency) : isPctCol(col) && v != null && v !== '' ? `${v}%` : v == null ? '' : String(v);
  const csvCell = (v: unknown) => JSON.stringify(typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v ?? '');
  const exportCSV = () => {
    if (!result) return;
    const lines = [result.columns.map(csvCell).join(',')];
    for (const row of filteredRows) {
      lines.push(result.columns.map((c) => csvCell(row[c])).join(','));
    }
    if (withTotals) lines.push(result.columns.map((c, ci) => csvCell(totalCell(c, ci))).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${result.title.replace(/\s+/g, '_')}.csv`; a.click();
  };

  // What the report was narrowed to, in words, for the head of an export
  const periodText = FY_REPORTS.has(selectedType) ? (activeFy ? fyLabel(Number(activeFy)) : '—') : selectedType === 'receivables-ageing' ? `As of ${asOf || 'today'}` : NO_PERIOD.has(selectedType) ? 'Now' : `${dateFrom || '—'} to ${dateTo || '—'}`;
  const filterWords = (): string[] => {
    const out: string[] = [];
    if (selectedType === 'transaction-ledger') { if (txnType) out.push(`Type: ${txnType}`); if (ledgerStatus) out.push(`Status: ${ledgerStatus}`); }
    if (selectedType === 'client-summary') { if (txnType) out.push(`Type: ${txnType}`); if (categoryType !== 'all') out.push(`Charged to: ${categoryType}s`); }
    if (FILTERABLE.has(selectedType)) {
      if (filters.clientId) out.push(`Client: ${nameOf(clientList, filters.clientId)}`);
      if (filters.projectId) out.push(`Project: ${nameOf(projectList, filters.projectId)}`);
      if (filters.productId) out.push(`Product: ${nameOf(productList, filters.productId)}`);
      if (filters.categoryId) out.push(`Category: ${nameOf(categoryList, filters.categoryId)}`);
      if (filters.personId) out.push(`Person: ${people?.find((p) => String(p.id) === filters.personId)?.username ?? filters.personId}`);
    }
    if (CLIENT_REPORTS.has(selectedType) && filters.clientId) out.push(`Client: ${nameOf(clientList, filters.clientId)}`);
    if (COMPARABLE.has(selectedType) && compare) out.push('Compared with the period before');
    if (search) out.push(`Rows containing "${search}" only`);
    return out;
  };

  const exportExcel = async () => {
    if (!result) return;
    const words = filterWords();
    const head: string[][] = [[result.title], [`Period: ${periodText}`], ...(words.length ? [[`Filters: ${words.join('; ')}`]] : []), [`Generated: ${new Date().toLocaleString()}`], []];
    const body: unknown[][] = filteredRows.map((row) => result.columns.map((c) => row[c] ?? ''));
    if (withTotals) body.push(result.columns.map((c, ci) => totalCell(c, ci)));
    // Numbers stay numbers, with a format: two decimals and separators for money, a percent sign for percentages
    const asCell = (col: string, v: unknown) => {
      if (v === null || v === undefined || v === '') return null;
      if (typeof v === 'number') return { value: v, format: CURRENCY_COLS.has(col) ? '#,##0.00' : isPctCol(col) ? '0.00"%"' : '#,##0.##' };
      return String(v);
    };
    const sheetData = [
      ...head,
      result.columns,
      ...body.map((r) => r.map((v, i) => asCell(result.columns[i], v))),
      ...(result.note ? [[], [result.note]] : []),
    ];
    const columns = result.columns.map((c) => ({ width: Math.min(42, Math.max(c.length, ...filteredRows.slice(0, 200).map((row) => shownText(c, row[c]).length)) + 2) }));
    try {
      // Loaded on demand so it is not part of the page's first download
      const { default: writeExcelFile } = await import('write-excel-file/browser');
      await writeExcelFile(sheetData, { sheet: result.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), columns }).toFile(`${result.title.replace(/\s+/g, '_')}.xlsx`);
    } catch {
      toast.error('The Excel file could not be created. Try the CSV export instead.');
    }
  };

  const exportPDF = () => {
    if (!tableRef.current || !result) return;
    const win = window.open('', '_blank');
    if (!win) { toast.error('The print window was blocked. Allow pop-ups for this site and try again.'); return; }
    win.document.write(`
      <html><head><title>${escapeHtml(result.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #111; }
        h2 { margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #f1f5f9; text-align: left; padding: 6px 10px; border: 1px solid #e2e8f0; font-size: 11px; }
        td { padding: 6px 10px; border: 1px solid #e2e8f0; }
        tr:nth-child(even) td { background: #f8fafc; }
        .totals td { font-weight: bold; background: #eff6ff; }
        .right { text-align: right; }
        .meta { color: #64748b; font-size: 11px; margin-bottom: 12px; }
      </style></head><body>
      <h2>${escapeHtml(result.title)}</h2>
      <p class="meta">Generated: ${escapeHtml(new Date().toLocaleString())} &nbsp;|&nbsp; Period: ${escapeHtml(periodText)} &nbsp;|&nbsp; ${filteredRows.length} records</p>
      ${filterWords().length ? `<p class="meta">Filters: ${escapeHtml(filterWords().join('; '))}</p>` : ''}
      <table>
        <thead><tr>${result.columns.map((c) => `<th class="${isNumericCol(c, result.rows) ? 'right' : ''}">${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>
          ${filteredRows.map((row) => `<tr>${result.columns.map((c) => `<td class="${isNumericCol(c, result.rows) ? 'right' : ''}">${escapeHtml(shownText(c, row[c]))}</td>`).join('')}</tr>`).join('')}
          ${withTotals ? `<tr class="totals">${result.columns.map((c, ci) => `<td class="${isNumericCol(c, result.rows) ? 'right' : ''}">${escapeHtml(shownText(c, totalCell(c, ci)))}</td>`).join('')}</tr>` : ''}
        </tbody>
      </table>
      ${result.note ? `<p class="meta" style="margin-top:12px">${escapeHtml(result.note)}</p>` : ''}
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  const surface = { background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' };
  const selectedReport = REPORTS.find((r) => r.id === selectedType);
  const isBudgetReport = FY_REPORTS.has(selectedType);
  const hasPeriod = !isBudgetReport && !NO_PERIOD.has(selectedType);
  const isClientSummary = selectedType === 'client-summary';
  const selectStyle = inputStyle;
  const selectClass = 'rounded-lg px-3 py-2 text-[13px] font-medium border outline-none focus:ring-2 focus:ring-[var(--shell-accent)]';

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
    <TabBar tabs={groups as unknown as { value: Group; label: string }[]} value={group} onChange={setGroup} />
    <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${group}`} className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">

      {/* Filters */}
      <div className="rounded-lg overflow-hidden" style={surface}>
        {/* Row 1: Report type selector */}
        <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid var(--shell-border)' }}>
          {reports.filter((r) => r.group === group).map((r) => {
            const Icon = r.icon;
            const active = selectedType === r.id;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={active}
                onClick={() => { setSelectedType(r.id); setResult(null); }}
                title={r.desc}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all border"
                style={active
                  ? { background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)', borderColor: 'var(--shell-accent)' }
                  : { background: 'transparent', color: 'var(--shell-text-muted)', borderColor: 'var(--shell-border)' }
                }
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-white' : r.color}`} />
                <span className="whitespace-nowrap">{r.label}</span>
              </button>
            );
          })}
        </div>

        {/* Row 2: Date filters + Generate */}
        <div className="px-4 py-3 flex flex-wrap items-center gap-3">

          {isBudgetReport ? (
            <>
              <select aria-label="Financial year" value={activeFy} onChange={(e) => setFy(e.target.value)}
                className={selectClass} style={selectStyle}>
                {fyOptions.map((y) => (
                  <option key={y} value={y}>{fyLabel(y)}</option>
                ))}
              </select>
            </>
          ) : !hasPeriod ? null : (
            <>
              {/* Date presets + date range inline */}
              <div className="flex flex-wrap items-center gap-1.5">
                {DATE_PRESETS.map((p) => (
                  <button key={p.label} type="button" aria-pressed={datePreset === p.label} onClick={() => handlePreset(p.label, p.key)}
                    className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold transition-all"
                    style={datePreset === p.label
                      ? { background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }
                      : { background: 'var(--shell-hover)', color: 'var(--shell-text-muted)' }
                    }>{p.label}</button>
                ))}
                <input type="date" aria-label="From date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset('Custom'); }}
                  className="rounded-lg px-3 py-1.5 text-[12px] border outline-none"
                  style={inputStyle} />
                <span className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>—</span>
                <input type="date" aria-label="To date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset('Custom'); }}
                  className="rounded-lg px-3 py-1.5 text-[12px] border outline-none"
                  style={inputStyle} />
              </div>

              {(selectedType === 'transaction-ledger' || isClientSummary) && (
                <select aria-label="Transaction type" value={txnType} onChange={(e) => setTxnType(e.target.value)}
                  className={selectClass} style={selectStyle}>
                  <option value="">All Types</option>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              )}

              {selectedType === 'transaction-ledger' && (
                <select aria-label="Status" value={ledgerStatus} onChange={(e) => setLedgerStatus(e.target.value)}
                  className={selectClass} style={selectStyle}>
                  <option value="">All Statuses</option>
                  <option value="approved">Approved</option>
                  <option value="waiting">Waiting For Approval</option>
                  <option value="draft">Draft</option>
                  <option value="rejected">Rejected</option>
                </select>
              )}

              {isClientSummary && (
                <select aria-label="Category type" value={categoryType} onChange={(e) => setCategoryType(e.target.value)}
                  className={selectClass} style={selectStyle}>
                  <option value="all">All Categories</option>
                  <option value="project">Project</option>
                  <option value="product">Product</option>
                </select>
              )}
            </>
          )}

          {selectedType === 'receivables-ageing' && (
            <label className="flex items-center gap-2 text-[12px] text-[var(--shell-text-muted)]">
              As of
              <input type="date" aria-label="As of date" value={asOf} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setAsOf(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-[12px] border outline-none" style={inputStyle} />
              {!asOf && <span>today</span>}
            </label>
          )}

          {CLIENT_REPORTS.has(selectedType) && (
            <select aria-label="Client" value={filters.clientId} onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value }))}
              className={`${selectClass} max-w-[240px]`} style={selectStyle}>
              <option value="">{selectedType === 'client-statement' ? 'Choose a client' : 'All Clients'}</option>
              {(clientList ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-[13px] transition-all disabled:opacity-60"
            style={{ background: 'var(--nav-emerald)', color: 'var(--shell-surface)' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
            Generate
          </button>
        </div>

        {/* Row 3: narrow the report, and set it against the period before */}
        {(FILTERABLE.has(selectedType) || COMPARABLE.has(selectedType)) && (
          <div className="border-t border-[var(--shell-border)] px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-4">
              {FILTERABLE.has(selectedType) && (
                <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">
                  <ListFilter className="h-3.5 w-3.5" /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
                </button>
              )}
              {COMPARABLE.has(selectedType) && (
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--shell-text-muted)]">
                  <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with the period before
                </label>
              )}
              {activeFilterCount > 0 && (
                <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="rounded-md px-1 text-[12px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">Clear filters</button>
              )}
            </div>
            {FILTERABLE.has(selectedType) && showFilters && (
              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                {([
                  ['clientId', 'Client', (clientList ?? []).map((c: any) => ({ id: c.id, name: c.name }))],
                  ['projectId', 'Project', (projectList ?? []).map((p: any) => ({ id: p.id, name: p.code ? `${p.code} ${p.name}` : p.name }))],
                  ['productId', 'Product', (productList ?? []).map((p: any) => ({ id: p.id, name: p.code ? `${p.code} ${p.name}` : p.name }))],
                  ['categoryId', 'Category', (categoryList ?? []).filter((c: any) => selectedType === 'pl-statement' || selectedType === 'client-summary' || !(selectedType === 'income-summary' ? c.type !== 'income' : c.type !== 'expense')).map((c: any) => ({ id: c.id, name: c.name }))],
                  ...((people ?? []).length ? [['personId', 'Person', (people ?? []).map((p) => ({ id: p.id, name: p.username }))] as const] : []),
                ] as const).map(([key, label, options]) => (
                  <select key={key} aria-label={label} value={filters[key as keyof Filters]} onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                    className={`${selectClass} max-w-[220px]`} style={selectStyle}>
                    <option value="">{`All ${label}s`.replace('Categorys', 'Categories')}</option>
                    {(options as { id: number; name: string }[]).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-lg overflow-hidden" style={surface}>
          {/* Result header */}
          <div className="dialog-header px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0" style={{ color: 'var(--shell-accent)' }} />
              <span className="truncate">{result.title}</span>
              <span className="text-[12px] px-2 py-0.5 rounded-md font-semibold shrink-0"
                style={{ background: 'var(--shell-hover)', color: 'var(--shell-text-muted)' }}>
                {filteredRows.length} records
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Search */}
              <div className="relative hidden sm:block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--shell-text-muted)' }} />
                <input
                  aria-label="Search report rows"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="pl-8 pr-3 py-1.5 rounded-lg text-[12px] border outline-none w-40"
                  style={inputStyle}
                />
              </div>
              {/* Export buttons */}
              <button onClick={exportCSV} title={search ? 'Export CSV (the rows shown, without totals)' : 'Export CSV'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-80"
                style={{ background: 'var(--shell-hover)', color: 'var(--shell-text)' }}>
                <FileText className="h-3.5 w-3.5" /> CSV
              </button>
              <button onClick={exportExcel} title={search ? 'Export Excel (the rows shown, without totals)' : 'Export Excel'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-80"
                style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)' }}>
                <Sheet className="h-3.5 w-3.5" /> Excel
              </button>
              <button onClick={exportPDF} title={search ? 'Print / Save as PDF (the rows shown, without totals)' : 'Print / Save as PDF'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-80"
                style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' }}>
                <Download className="h-3.5 w-3.5" /> PDF
              </button>
            </div>
          </div>

          {/* Truncation notice */}
          {!result.truncated && result.note && (
            <p role="status" className="border-b border-[var(--shell-border)] px-4 py-2 text-[12px] text-[var(--shell-text-muted)]">{result.note}</p>
          )}
          {result.truncated && (
            <div role="status" className="px-4 py-2 text-[12px] font-medium flex items-center gap-2"
              style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', color: 'var(--warning)', borderBottom: '1px solid var(--shell-border)' }}>
              <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span>{result.note || 'Some records were omitted because the result set is large. Narrow the filters to see the rest.'}</span>
            </div>
          )}

          {/* Table: the shared DataTable, pages to the height of the box */}
          <div ref={tableRef} className="flex h-[65dvh] min-h-[320px] flex-col">
            <DataTable columns={columns} data={filteredRows} tableInstance={table} fullHeight footerRow={totalsRow} emptyMessage="No data found for the selected period." />
          </div>
        </div>
      )}

      {/* Empty state before generation */}
      {!result && !loading && (
        <div className="rounded-lg p-12 text-center" style={surface}>
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" style={{ color: 'var(--shell-text-muted)' }} />
          <p className="text-[14px] font-semibold" style={{ color: 'var(--shell-text)' }}>Select a report and click Generate</p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--shell-text-muted)' }}>Results will appear here with export options</p>
        </div>
      )}
    </div>
    </div>
  );
}
