'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import api from '@/lib/api-client';
import { formatCurrency, getDateRange } from '@/lib/currency';
import {
  BarChart3, FileText, TrendingDown, TrendingUp, Scale, Target,
  ArrowLeftRight, Users, Download, Sheet,
  ChevronDown, Loader2, Search, Receipt, Wallet, AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';

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
  { id: 'expense-summary', label: 'Expense Summary', icon: TrendingDown, desc: 'Total spend grouped by category', color: 'text-[var(--danger)]', bg: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]' },
  { id: 'income-summary', label: 'Income Summary', icon: TrendingUp, desc: 'Total income grouped by category', color: 'text-[var(--success)]', bg: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' },
  { id: 'pl-statement', label: 'P&L Statement', icon: Scale, desc: 'Monthly income vs expenses, net balance', color: 'text-[var(--info)]', bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]' },
  { id: 'budget-vs-actual', label: 'Budget vs Actual', icon: Target, desc: 'Budget allocation vs real spend per category', color: 'text-[var(--warning)]', bg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]' },
  { id: 'transaction-ledger', label: 'Transaction Ledger', icon: ArrowLeftRight, desc: 'Full list of all transactions with all fields', color: 'text-[var(--info)]', bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]' },
  { id: 'client-summary', label: 'Client Summary', icon: Users, desc: 'Expense & Income for Project & Product', color: 'text-[var(--info)]', bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]' },
  { id: 'claimable-gst', label: 'Claimable GST', icon: Receipt, desc: 'GST claimable on expense transactions by category', color: 'text-[var(--warning)]', bg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]' },
  { id: 'reimbursement-register', label: 'Reimbursement Register', icon: Wallet, desc: 'All reimbursed expenses with payment details, by employee', color: 'text-[var(--info)]', bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]' },
];

const DATE_PRESETS = [
  { label: 'This Month', key: 'thisMonth' },
  { label: 'Last Month', key: 'lastMonth' },
  { label: 'This Quarter', key: 'thisQuarter' },
  { label: 'Financial Year', key: 'finYear' },
  { label: 'Calendar Year', key: 'calYear' },
  { label: 'Custom', key: 'custom' },
];

const CURRENCY_COLS = new Set(['Amount', 'Income', 'Expenses', 'Net', 'Budget', 'Spent', 'Remaining', 'Net Amount', 'Total Amount', 'GST Amount']);

// ── Number util ───────────────────────────────────────────────────────────────
function isNumericCol(col: string, rows: Record<string, any>[]) {
  return rows.length > 0 && typeof rows[0][col] === 'number';
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ReportingPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const fmt = (n: number) => formatCurrency(n, currency);

  useEffect(() => { setHeader('Reports', 'Generate, view & export financial reports'); }, [setHeader]);

  const [selectedType, setSelectedType] = useState('expense-summary');
  const [datePreset, setDatePreset] = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [txnType, setTxnType] = useState('');
  const [categoryType, setCategoryType] = useState('all');
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Init date range to This Month
  useEffect(() => {
    const r = getDateRange('thisMonth');
    setDateFrom(r.from);
    setDateTo(r.to);
  }, []);

  const handlePreset = (label: string, key: string) => {
    setDatePreset(label);
    if (key !== 'custom') {
      const r = getDateRange(key as any);
      setDateFrom(r.from);
      setDateTo(r.to);
    }
  };

  const generate = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const params: Record<string, string> = { type: selectedType };
      if (selectedType === 'budget-vs-actual') {
        params.month = month;
        params.year = year;
      } else {
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
        if (selectedType === 'transaction-ledger' && txnType) params.txnType = txnType;
        if (selectedType === 'client-summary') {
          params.categoryType = categoryType;
          if (txnType) params.txnType = txnType;
        }
      }
      const qs = new URLSearchParams(params).toString();
      const res = await api.get<ReportResult>(`/reporting/generate?${qs}`);
      setResult((res as any).data ?? res);
    } catch {
      // toast handled by api client
    } finally {
      setLoading(false);
    }
  }, [selectedType, dateFrom, dateTo, txnType, categoryType, month, year]);

  const filteredRows = result
    ? result.rows.filter((row) =>
        !search || Object.values(row).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!result) return;
    const lines = [result.columns.join(',')];
    for (const row of filteredRows) {
      lines.push(result.columns.map((c) => JSON.stringify(row[c] ?? '')).join(','));
    }
    if (Object.keys(result.totals).length > 0) {
      lines.push(result.columns.map((c) => result.totals[c] != null ? JSON.stringify(result.totals[c]) : '').join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${result.title.replace(/\s+/g, '_')}.csv`; a.click();
  };

  const exportExcel = () => {
    if (!result) return;
    const sheetData = [
      result.columns,
      ...filteredRows.map((row) => result.columns.map((c) => row[c] ?? '')),
    ];
    if (Object.keys(result.totals).length > 0) {
      sheetData.push(result.columns.map((c) => result.totals[c] != null ? result.totals[c] : ''));
    }
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, result.title.slice(0, 31));
    XLSX.writeFile(wb, `${result.title.replace(/\s+/g, '_')}.xlsx`);
  };

  const exportPDF = () => {
    if (!tableRef.current || !result) return;
    const win = window.open('', '_blank')!;
    win.document.write(`
      <html><head><title>${escapeHtml(result.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #111; }
        h2 { margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #f1f5f9; text-align: left; padding: 6px 10px; border: 1px solid #e2e8f0; font-size: 11px; text-transform:; }
        td { padding: 6px 10px; border: 1px solid #e2e8f0; }
        tr:nth-child(even) td { background: #f8fafc; }
        .totals td { font-weight: bold; background: #eff6ff; }
        .right { text-align: right; }
        .meta { color: #64748b; font-size: 11px; margin-bottom: 12px; }
      </style></head><body>
      <h2>${escapeHtml(result.title)}</h2>
      <p class="meta">Generated: ${escapeHtml(new Date().toLocaleString())} &nbsp;|&nbsp; Period: ${escapeHtml(dateFrom || '—')} to ${escapeHtml(dateTo || '—')} &nbsp;|&nbsp; ${filteredRows.length} records</p>
      <table>
        <thead><tr>${result.columns.map((c) => `<th class="${isNumericCol(c, result.rows) ? 'right' : ''}">${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>
          ${filteredRows.map((row) => `<tr>${result.columns.map((c) => { const v = row[c]; const isPct = c === '% Used' || c === 'GST %'; return `<td class="${typeof v === 'number' ? 'right' : ''}">${isPct && v != null ? escapeHtml(v) + '%' : escapeHtml(v)}</td>`; }).join('')}</tr>`).join('')}
          ${Object.keys(result.totals).length > 0 ? `<tr class="totals">${result.columns.map((c) => `<td class="${result.totals[c] != null ? 'right' : ''}">${result.totals[c] != null ? escapeHtml(result.totals[c]) : ''}</td>`).join('')}</tr>` : ''}
        </tbody>
      </table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  const surface = { background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' };
  const selectedReport = REPORTS.find((r) => r.id === selectedType);
  const isBudgetReport = selectedType === 'budget-vs-actual';
  const isClientSummary = selectedType === 'client-summary';
  const selectStyle = { background: 'var(--shell-bg)', color: 'var(--shell-text)', borderColor: 'var(--shell-border)' };
  const selectClass = 'rounded-lg px-3 py-2 text-[13px] font-medium border outline-none focus:ring-2 focus:ring-[var(--shell-accent)]';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">

      {/* Filters */}
      <div className="rounded-xl overflow-hidden" style={surface}>
        {/* Row 1: Report type selector */}
        <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid var(--shell-border)' }}>
          {REPORTS.map((r) => {
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
              <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}
                className={selectClass} style={selectStyle}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
                ))}
              </select>
              <select aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)}
                className={selectClass} style={selectStyle}>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </>
          ) : (
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
                  style={{ background: 'var(--shell-bg)', color: 'var(--shell-text)', borderColor: 'var(--shell-border)' }} />
                <span className="text-[11px]" style={{ color: 'var(--shell-text-muted)' }}>—</span>
                <input type="date" aria-label="To date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset('Custom'); }}
                  className="rounded-lg px-3 py-1.5 text-[12px] border outline-none"
                  style={{ background: 'var(--shell-bg)', color: 'var(--shell-text)', borderColor: 'var(--shell-border)' }} />
              </div>

              {(selectedType === 'transaction-ledger' || isClientSummary) && (
                <select aria-label="Transaction type" value={txnType} onChange={(e) => setTxnType(e.target.value)}
                  className={selectClass} style={selectStyle}>
                  <option value="">All Types</option>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
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

          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-[13px] transition-all disabled:opacity-60"
            style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            Generate
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-xl overflow-hidden" style={surface}>
          {/* Result header */}
          <div className="dialog-header px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0" style={{ color: 'var(--shell-accent)' }} />
              <span className="truncate">{result.title}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold shrink-0"
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
                  style={{ background: 'var(--shell-bg)', color: 'var(--shell-text)', borderColor: 'var(--shell-border)' }}
                />
              </div>
              {/* Export buttons */}
              <button onClick={exportCSV} title="Export CSV"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-80"
                style={{ background: 'var(--shell-hover)', color: 'var(--shell-text)' }}>
                <FileText className="h-3.5 w-3.5" /> CSV
              </button>
              <button onClick={exportExcel} title="Export Excel"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-80"
                style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)' }}>
                <Sheet className="h-3.5 w-3.5" /> Excel
              </button>
              <button onClick={exportPDF} title="Print / Save as PDF"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-80"
                style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' }}>
                <Download className="h-3.5 w-3.5" /> PDF
              </button>
            </div>
          </div>

          {/* Truncation notice */}
          {result.truncated && (
            <div role="status" className="px-4 py-2 text-[11.5px] font-medium flex items-center gap-2"
              style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', color: 'var(--warning)', borderBottom: '1px solid var(--shell-border)' }}>
              <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span>{result.note || 'Some records were omitted because the result set is large. Narrow the filters to see the rest.'}</span>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto" ref={tableRef}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--shell-border)', background: 'var(--shell-hover)' }}>
                  {result.columns.map((col) => (
                    <th key={col} scope="col"
                      className={`px-4 py-2.5 font-semibold text-[11px] whitespace-nowrap ${isNumericCol(col, result.rows) ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--shell-text-muted)' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--shell-border)' }}
                    className="transition-colors hover:bg-[var(--shell-hover)]">
                    {result.columns.map((col) => {
                      const val = row[col];
                      const isNum = typeof val === 'number';
                      const isCurrency = isNum && CURRENCY_COLS.has(col);
                      const isPct = col === '% Used' || col === 'GST %';
                      const display = isCurrency ? fmt(val) : isPct ? (val != null ? `${val}%` : '—') : val ?? '—';
                      const color = isPct
                        ? val >= 100 ? 'var(--danger)' : val >= 80 ? 'var(--warning)' : undefined
                        : col === 'Net' ? (val >= 0 ? 'var(--success)' : 'var(--danger)') : undefined;
                      return (
                        <td key={col} className={`px-4 py-2.5 ${isNum ? 'text-right font-semibold tabular-nums' : ''}`}
                          style={{ color: color ?? 'var(--shell-text)', whiteSpace: isNum ? 'nowrap' : undefined }}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Totals row */}
                {Object.keys(result.totals).length > 0 && (
                  <tr style={{ borderTop: '2px solid var(--shell-border)', background: 'var(--shell-hover)' }}>
                    {result.columns.map((col, ci) => {
                      const val = result.totals[col];
                      const isCurrency = val != null && CURRENCY_COLS.has(col);
                      return (
                        <td key={col} className={`px-4 py-2.5 font-black text-[12px] ${val != null ? 'text-right tabular-nums' : ''}`}
                          style={{ color: 'var(--shell-text)' }}>
                          {ci === 0 ? 'TOTAL' : val != null ? (isCurrency ? fmt(val) : val) : ''}
                        </td>
                      );
                    })}
                  </tr>
                )}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={result.columns.length} className="px-4 py-12 text-center text-[12px] italic" style={{ color: 'var(--shell-text-muted)' }}>
                      No data found for the selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state before generation */}
      {!result && !loading && (
        <div className="rounded-xl p-12 text-center" style={surface}>
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" style={{ color: 'var(--shell-text-muted)' }} />
          <p className="text-[14px] font-semibold" style={{ color: 'var(--shell-text)' }}>Select a report and click Generate</p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--shell-text-muted)' }}>Results will appear here with export options</p>
        </div>
      )}
    </div>
  );
}
