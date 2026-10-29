'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { inputStyle } from '@/components/shared/modal-primitives';
import { useFitPageSize } from '@/hooks/use-fit-page-size';
import { useHeaderStore } from '@/stores/header-store';
import { useAuditLogs, useAuditStats } from '@/hooks/use-queries';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField } from '@/components/shared/detail/detail-kit';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Shield, Search, X, RefreshCw,
  Database, ChevronLeft, ChevronRight, Activity,
  Eye, FileText, GitCommit,
} from 'lucide-react';
import type { AuditLog } from '@/lib/types';

// ─── Config ───────────────────────────────────────
const ACTION_CFG: Record<string, { color: string; bg: string; label: string }> = {
  INSERT: { color: 'text-[var(--success)]', bg: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]', label: 'Created' },
  UPDATE: { color: 'text-[var(--info)]',    bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]',    label: 'Updated' },
  DELETE: { color: 'text-[var(--danger)]',    bg: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]',    label: 'Deleted' },
};
const getActionCfg = (a: string) => ACTION_CFG[a?.toUpperCase()] ?? { color: 'text-[var(--shell-text-muted)]', bg: 'bg-[var(--shell-hover)]', label: a };

const TABLE_LABELS: Record<string, string> = {
  transactions: 'Transaction', users: 'User', clients: 'Client',
  projects: 'Project', products: 'Product', budgets: 'Budget',
  categories: 'Category', recurring: 'Recurring',
};

// ─── Detail Panel ─────────────────────────────────
function AuditDetailPanel({ log }: { log: AuditLog }) {
  const action = getActionCfg(log.action);

  const parseJson = (s?: string | null) => {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  };

  const oldVals = parseJson(log.old_values);
  const newVals = parseJson(log.new_values);

  const changedFields = useMemo(() => {
    if (!oldVals || !newVals) return null;
    const keys = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);
    return Array.from(keys)
      .filter((k) => JSON.stringify(oldVals[k]) !== JSON.stringify(newVals[k]))
      .map((k) => ({ key: k, old: oldVals[k], new: newVals[k] }));
  }, [oldVals, newVals]);

  const label = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

  return (
    <>
      <DetailSummary
        title={`${action.label} · ${TABLE_LABELS[log.table_name] || log.table_name}`}
        subtitle={log.reference_id || `Record #${log.record_id}`}
        status={log.username || `User #${log.changed_by}`}
        statusClass="text-[var(--shell-text-muted)]"
      />

      <DetailSection title="Details">
        <DetailGrid>
          <DetailField label="Actor" value={log.username || `User #${log.changed_by}`} />
          <DetailField label="Record" value={`#${log.record_id}`} />
          <DetailField label="Date" value={format(new Date(log.changed_at), 'MMM d, yyyy')} />
          <DetailField label="Time" value={format(new Date(log.changed_at), 'h:mm:ss a')} />
        </DetailGrid>
      </DetailSection>

      {changedFields && changedFields.length > 0 && (
        <DetailSection title={`Changes (${changedFields.length} fields)`}>
          <DetailGrid cols={1}>
            {changedFields.map(({ key, old: oldVal, new: newVal }) => (
              <DetailField
                key={key}
                label={label(key)}
                value={
                  <span className="break-all">
                    {oldVal !== undefined && <span className="text-[var(--danger)]">{String(oldVal ?? '—')}</span>}
                    {oldVal !== undefined && newVal !== undefined && <span className="mx-1.5 text-[var(--shell-text-muted)]">→</span>}
                    {newVal !== undefined && <span className="text-[var(--success)]">{String(newVal ?? '—')}</span>}
                  </span>
                }
              />
            ))}
          </DetailGrid>
        </DetailSection>
      )}

      {log.action === 'INSERT' && newVals && (
        <DetailSection title="Record data">
          <DetailGrid cols={1}>
            {Object.entries(newVals).map(([k, v]) => (
              <DetailField key={k} label={label(k)} value={<span className="break-all">{String(v ?? '—')}</span>} />
            ))}
          </DetailGrid>
        </DetailSection>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────
export default function AuditLogPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  // Rows per page follow the height of the table area (see useFitPageSize); 25 until it is measured
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const fitted = useFitPageSize(tableAreaRef, { fallbackRowHeight: 43 });
  const pageSize = fitted ?? 25;
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Debounce search input → only fires API after 400ms pause
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setHeader('Audit Log', 'System activity and change history'); }, [setHeader]);

  const params: Record<string, string> = { page: String(page), limit: String(pageSize) };
  if (search) params.search = search;
  if (actionFilter) params.action = actionFilter;
  if (tableFilter) params.tableName = tableFilter;
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;

  const { data: auditResp, isLoading, isError, error, refetch } = useAuditLogs(params);
  const { data: statsData } = useAuditStats();

  const rows: AuditLog[] = (auditResp as any)?.rows ?? [];
  const total: number = (auditResp as any)?.total ?? 0;
  const limit: number = (auditResp as any)?.limit ?? pageSize;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const stats = statsData as any;

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, actionFilter, tableFilter, dateFrom, dateTo, pageSize]);


  return (
    <ModuleShell
      showPanel={!!selectedLog}
      searchRow={
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--shell-text-muted)' }} />
            <input
              aria-label="Search audit log"
              className="h-8 w-48 pl-9 pr-3 text-[12px] rounded-lg border outline-none"
              style={inputStyle}
              placeholder="Search user, table, ref..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && <button type="button" aria-label="Clear search" onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3" style={{ color: 'var(--shell-text-muted)' }} /></button>}
          </div>

          {/* Action filter */}
          <div className="flex items-center gap-1">
            {['', 'INSERT', 'UPDATE', 'DELETE'].map((a) => {
              const cfg = a ? getActionCfg(a) : null;
              return (
                <button key={a} type="button" aria-pressed={actionFilter === a} onClick={() => setActionFilter(a)}
                  className={`px-2.5 py-1 text-[12px] font-semibold rounded-lg border transition-all ${
                    actionFilter === a
                      ? (cfg ? `${cfg.bg} ${cfg.color} border-current/40` : 'bg-[var(--shell-accent)]/15 text-[var(--info)] border-[var(--shell-accent)]/40')
                      : 'text-[var(--shell-text-muted)] border-transparent hover:border-[var(--shell-border)] hover:text-[var(--shell-text)]'
                  }`}
                >
                  {a || 'All Actions'}
                </button>
              );
            })}
          </div>

          {/* Table filter */}
          <select
            aria-label="Filter by table"
            className="h-8 px-3 text-[12px] rounded-lg border outline-none"
            style={inputStyle}
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          >
            <option value="">All Tables</option>
            {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          {/* Date range */}
          <input type="date" aria-label="From date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 px-3 text-[12px] rounded-lg border outline-none"
            style={inputStyle}
          />
          <span className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>to</span>
          <input type="date" aria-label="To date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-8 px-3 text-[12px] rounded-lg border outline-none"
            style={inputStyle}
          />

          <div className="flex-1" />
          <button type="button" aria-label="Refresh audit log" onClick={() => refetch()} className="btn-action flex items-center gap-1 text-[12px]">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      }
      intelligencePanel={
        <ModuleIntelligencePanel
          title="Audit Detail"
          onClose={() => setSelectedLog(null)}
          hasSelection={!!selectedLog}
        >
          {selectedLog && <AuditDetailPanel log={selectedLog} />}
        </ModuleIntelligencePanel>
      }
    >
      {/* Stats strip */}
      {stats && (
        <div className="shrink-0 flex items-center gap-4 px-4 py-2.5 border-b" style={{ borderColor: 'var(--shell-border)', background: 'var(--shell-surface)' }}>
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" style={{ color: 'var(--shell-accent)' }} />
            <span className="text-[12px] font-semibold" style={{ color: 'var(--shell-text)' }}>{stats.total?.toLocaleString()}</span>
            <span className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>total events</span>
          </div>
          <div className="w-px h-3" style={{ background: 'var(--shell-border)' }} />
          {stats.by_action?.map((a: any) => {
            const cfg = getActionCfg(a.action);
            return (
              <div key={a.action} className="flex items-center gap-1.5">
                <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                <span className="text-[12px] font-semibold text-black dark:text-white">{a.count?.toLocaleString()}</span>
              </div>
            );
          })}
          <div className="flex-1" />
          <span className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>
            Showing {rows.length} of {total.toLocaleString()} records
          </span>
        </div>
      )}

      {/* Table */}
      <div ref={tableAreaRef} className="flex-1 overflow-auto custom-scrollbar">
        {isLoading ? (
          <div className="space-y-0 pt-1">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b" style={{ borderColor: 'var(--shell-border)' }}>
                <div className="h-5 w-14 rounded-md bg-[var(--shell-hover)] animate-pulse" />
                <div className="h-3 w-24 rounded-md bg-[var(--shell-hover)] animate-pulse" />
                <div className="h-3 w-20 rounded-md bg-[var(--shell-hover)] animate-pulse" />
                <div className="h-3 w-32 rounded-md bg-[var(--shell-hover)] animate-pulse flex-1" />
                <div className="h-3 w-24 rounded-md bg-[var(--shell-hover)] animate-pulse" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-24" role="alert">
            <Shield className="w-12 h-12" style={{ color: 'var(--shell-text-muted)', opacity: 0.3 }} />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--shell-text)' }}>
              {(error as any)?.status === 403 ? 'Access restricted' : 'Could not load the audit log'}
            </p>
            <p className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>
              {(error as any)?.status === 403
                ? 'The audit log is available to Admin and Finance users only.'
                : ((error as any)?.message || 'Please try again.')}
            </p>
            {(error as any)?.status !== 403 && (
              <button className="btn-action" onClick={() => refetch()}>Retry</button>
            )}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-24">
            <Shield className="w-12 h-12" style={{ color: 'var(--shell-text-muted)', opacity: 0.3 }} />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--shell-text)' }}>No audit records found</p>
            <p className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>Try adjusting your filters</p>
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--table-header)' }}>
              <tr className="border-b" style={{ borderColor: 'var(--shell-border)' }}>
                {['Action', 'Table', 'Record', 'Actor', 'Time', ''].map((h, i) => (
                  <th key={i} scope="col" className="h-10 px-4 text-left text-[12px] font-semibold text-[var(--shell-text)]" style={{ color: 'var(--shell-text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => {
                const actionCfg = getActionCfg(log.action);
                const isSelected = selectedLog?.id === log.id;
                return (
                  <tr
                    key={log.id}
                    tabIndex={0}
                    aria-selected={isSelected}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedLog(isSelected ? null : log); } }}
                    onClick={() => setSelectedLog(isSelected ? null : log)}
                    className={`border-b cursor-pointer transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)] ${isSelected ? 'bg-[var(--shell-accent)]/10' : ''}`}
                    style={{ borderColor: 'var(--shell-border)' }}
                  >
                    <td className="px-4 py-2.5">
                      <span className={`text-[13px] font-medium ${actionCfg.color}`}>{actionCfg.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px]" style={{ color: 'var(--shell-text)' }}>
                      {TABLE_LABELS[log.table_name] || log.table_name}
                    </td>
                    <td className="px-4 py-2.5 text-[12px]" style={{ color: log.reference_id ? 'var(--shell-text)' : 'var(--shell-text-muted)' }}>
                      {log.reference_id || `#${log.record_id}`}
                    </td>
                    <td className="px-4 py-2.5 text-[13px]" style={{ color: 'var(--shell-text)' }}>
                      {log.username || `User #${log.changed_by}`}
                    </td>
                    <td className="px-4 py-2.5 text-[13px]" style={{ color: 'var(--shell-text-muted)' }} title={formatDistanceToNow(new Date(log.changed_at), { addSuffix: true })}>
                      {format(new Date(log.changed_at), 'MMM d, yyyy h:mm a')}
                    </td>
                    <td className="px-4 py-2.5">
                      <Eye className="w-3.5 h-3.5 transition-opacity opacity-0 group-hover:opacity-100" style={{ color: 'var(--shell-text-muted)' }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-t" style={{ borderColor: 'var(--shell-border)', background: 'var(--shell-surface)' }}>
          <span className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button aria-label="Previous page" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="btn-action disabled:opacity-40">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const p = page <= 4 ? i + 1 : page - 3 + i;
              if (p < 1 || p > totalPages) return null;
              return (
                <button key={p} aria-label={`Page ${p}`} aria-current={p === page ? "page" : undefined} onClick={() => setPage(p)}
                  className={`w-7 h-7 text-[12px] font-semibold rounded-lg transition-all ${p === page ? 'bg-[var(--shell-accent)] text-[var(--shell-accent-fg)]' : 'btn-action'}`}>
                  {p}
                </button>
              );
            })}
            <button aria-label="Next page" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="btn-action disabled:opacity-40">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </ModuleShell>
  );
}
