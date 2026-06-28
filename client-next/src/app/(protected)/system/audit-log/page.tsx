'use client';

import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuditLogs, useAuditStats } from '@/hooks/use-queries';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Shield, Search, X, RefreshCw,
  Database, ChevronLeft, ChevronRight, Activity,
  Eye, FileText, GitCommit,
} from 'lucide-react';
import type { AuditLog } from '@/lib/types';

// ─── Config ───────────────────────────────────────
const ACTION_CFG: Record<string, { color: string; bg: string; label: string }> = {
  INSERT: { color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Created' },
  UPDATE: { color: 'text-blue-400',    bg: 'bg-blue-400/10',    label: 'Updated' },
  DELETE: { color: 'text-rose-400',    bg: 'bg-rose-400/10',    label: 'Deleted' },
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

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-xl p-4 border" style={{ background: 'var(--shell-hover)', borderColor: 'var(--shell-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${action.bg} ${action.color}`}>
            {action.label}
          </div>
          <span className="text-[11px] font-bold text-black dark:text-white">
            {TABLE_LABELS[log.table_name] || log.table_name}
          </span>
          {log.reference_id && (
            <span className="font-mono text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded ml-auto">
              {log.reference_id}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Actor',      val: log.username || `User #${log.changed_by}` },
            { label: 'Record ID',  val: `#${log.record_id}` },
            { label: 'Date',       val: format(new Date(log.changed_at), 'MMM d, yyyy') },
            { label: 'Time',       val: format(new Date(log.changed_at), 'h:mm:ss a') },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-lg px-2.5 py-2 border" style={{ background: 'var(--shell-surface)', borderColor: 'var(--shell-border)' }}>
              <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--shell-text-muted)' }}>{label}</p>
              <p className="text-[11px] font-bold text-black dark:text-white mt-0.5 truncate">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Changed fields diff */}
      {changedFields && changedFields.length > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border-b pb-1.5"
            style={{ color: 'var(--shell-text-muted)', borderColor: 'var(--shell-border)' }}>
            <GitCommit className="w-3.5 h-3.5" /> Changes ({changedFields.length} fields)
          </label>
          <div className="space-y-2">
            {changedFields.map(({ key, old: oldVal, new: newVal }) => (
              <div key={key} className="rounded-lg overflow-hidden border text-[11px]" style={{ borderColor: 'var(--shell-border)' }}>
                <div className="px-3 py-1.5 border-b font-bold uppercase tracking-wider text-[9px]"
                  style={{ background: 'var(--shell-hover)', borderColor: 'var(--shell-border)', color: 'var(--shell-text-muted)' }}>
                  {key.replace(/_/g, ' ')}
                </div>
                {oldVal !== undefined && (
                  <div className="px-3 py-2 flex items-start gap-2 bg-rose-500/5 border-b" style={{ borderColor: 'var(--shell-border)' }}>
                    <span className="text-[9px] font-black text-rose-400 uppercase mt-0.5 shrink-0 w-7">Old</span>
                    <span className="text-rose-400 font-mono break-all">{String(oldVal ?? '—')}</span>
                  </div>
                )}
                {newVal !== undefined && (
                  <div className="px-3 py-2 flex items-start gap-2 bg-emerald-500/5">
                    <span className="text-[9px] font-black text-emerald-500 uppercase mt-0.5 shrink-0 w-7">New</span>
                    <span className="text-emerald-500 font-mono break-all">{String(newVal ?? '—')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw values (INSERT only — show new_values) */}
      {log.action === 'INSERT' && newVals && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border-b pb-1.5"
            style={{ color: 'var(--shell-text-muted)', borderColor: 'var(--shell-border)' }}>
            <FileText className="w-3.5 h-3.5" /> Record Data
          </label>
          <div className="rounded-lg overflow-hidden border text-[11px]" style={{ borderColor: 'var(--shell-border)' }}>
            {Object.entries(newVals).map(([k, v]) => (
              <div key={k} className="flex items-start gap-3 px-3 py-1.5 border-b" style={{ borderColor: 'var(--shell-border)' }}>
                <span className="text-[9px] font-bold uppercase tracking-wider min-w-[100px] shrink-0 mt-0.5" style={{ color: 'var(--shell-text-muted)' }}>
                  {k.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-black dark:text-white break-all">{String(v ?? '—')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
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
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Debounce search input → only fires API after 400ms pause
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setHeader('Audit Log', 'System activity and change history'); }, [setHeader]);

  const params: Record<string, string> = { page: String(page), limit: '50' };
  if (search) params.search = search;
  if (actionFilter) params.action = actionFilter;
  if (tableFilter) params.tableName = tableFilter;
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;

  const { data: auditResp, isLoading, refetch } = useAuditLogs(params);
  const { data: statsData } = useAuditStats();

  const rows: AuditLog[] = (auditResp as any)?.rows ?? [];
  const total: number = (auditResp as any)?.total ?? 0;
  const limit: number = (auditResp as any)?.limit ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const stats = statsData as any;

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, actionFilter, tableFilter, dateFrom, dateTo]);


  return (
    <ModuleShell
      showPanel={!!selectedLog}
      searchRow={
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--shell-text-muted)' }} />
            <input
              className="h-8 w-48 pl-9 pr-3 text-[12px] rounded-lg border outline-none"
              style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }}
              placeholder="Search user, table, ref..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && <button onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3" style={{ color: 'var(--shell-text-muted)' }} /></button>}
          </div>

          {/* Action filter */}
          <div className="flex items-center gap-1">
            {['', 'INSERT', 'UPDATE', 'DELETE'].map((a) => {
              const cfg = a ? getActionCfg(a) : null;
              return (
                <button key={a} onClick={() => setActionFilter(a)}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all ${
                    actionFilter === a
                      ? (cfg ? `${cfg.bg} ${cfg.color} border-current/40` : 'bg-[var(--shell-accent)]/15 text-[var(--shell-accent)] border-[var(--shell-accent)]/40')
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
            className="h-8 px-3 text-[11px] rounded-lg border outline-none"
            style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }}
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          >
            <option value="">All Tables</option>
            {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          {/* Date range */}
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 px-3 text-[11px] rounded-lg border outline-none"
            style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }}
          />
          <span className="text-[10px]" style={{ color: 'var(--shell-text-muted)' }}>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-8 px-3 text-[11px] rounded-lg border outline-none"
            style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }}
          />

          <div className="flex-1" />
          <button onClick={() => refetch()} className="btn-action flex items-center gap-1 text-[10px]">
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
            <span className="text-[11px] font-bold" style={{ color: 'var(--shell-text)' }}>{stats.total?.toLocaleString()}</span>
            <span className="text-[10px]" style={{ color: 'var(--shell-text-muted)' }}>total events</span>
          </div>
          <div className="w-px h-3" style={{ background: 'var(--shell-border)' }} />
          {stats.by_action?.map((a: any) => {
            const cfg = getActionCfg(a.action);
            return (
              <div key={a.action} className="flex items-center gap-1.5">
                <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                <span className="text-[11px] font-bold text-black dark:text-white">{a.count?.toLocaleString()}</span>
              </div>
            );
          })}
          <div className="flex-1" />
          <span className="text-[10px]" style={{ color: 'var(--shell-text-muted)' }}>
            Showing {rows.length} of {total.toLocaleString()} records
          </span>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {isLoading ? (
          <div className="space-y-0 pt-1">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b" style={{ borderColor: 'var(--shell-border)' }}>
                <div className="h-5 w-14 rounded bg-[var(--shell-hover)] animate-pulse" />
                <div className="h-3 w-24 rounded bg-[var(--shell-hover)] animate-pulse" />
                <div className="h-3 w-20 rounded bg-[var(--shell-hover)] animate-pulse" />
                <div className="h-3 w-32 rounded bg-[var(--shell-hover)] animate-pulse flex-1" />
                <div className="h-3 w-24 rounded bg-[var(--shell-hover)] animate-pulse" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-24">
            <Shield className="w-12 h-12" style={{ color: 'var(--shell-text-muted)', opacity: 0.3 }} />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--shell-text)' }}>No audit records found</p>
            <p className="text-[11px]" style={{ color: 'var(--shell-text-muted)' }}>Try adjusting your filters</p>
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--shell-surface)' }}>
              <tr className="border-b" style={{ borderColor: 'var(--shell-border)' }}>
                {['Action', 'Table', 'Record', 'Actor', 'Timestamp', ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--shell-text-muted)' }}>
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
                    onClick={() => setSelectedLog(isSelected ? null : log)}
                    className={`border-b cursor-pointer transition-colors hover:bg-[var(--shell-hover)] ${isSelected ? 'bg-[var(--shell-accent)]/10' : ''}`}
                    style={{ borderColor: 'var(--shell-border)' }}
                  >
                    <td className="px-4 py-3">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded ${actionCfg.bg} ${actionCfg.color}`}>
                        {actionCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3 h-3 shrink-0" style={{ color: 'var(--shell-text-muted)' }} />
                        <span className="font-semibold text-black dark:text-white">
                          {TABLE_LABELS[log.table_name] || log.table_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {log.reference_id ? (
                          <span className="font-mono text-[11px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">
                            {log.reference_id}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px]" style={{ color: 'var(--shell-text-muted)' }}>#{log.record_id}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-[var(--shell-hover)] flex items-center justify-center text-[8px] font-bold border shrink-0"
                          style={{ borderColor: 'var(--shell-border)', color: 'var(--shell-accent)' }}>
                          {(() => { const p = (log.username || 'U').trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : p[0].slice(0,2).toUpperCase(); })()}
                        </div>
                        <span className="font-medium text-black dark:text-white">{log.username || `User #${log.changed_by}`}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium" style={{ color: 'var(--shell-text)' }}>
                          {format(new Date(log.changed_at), 'MMM d, yyyy')}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--shell-text-muted)' }}>
                          {format(new Date(log.changed_at), 'h:mm:ss a')} · {formatDistanceToNow(new Date(log.changed_at), { addSuffix: true })}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
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
          <span className="text-[10px]" style={{ color: 'var(--shell-text-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="btn-action disabled:opacity-40">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const p = page <= 4 ? i + 1 : page - 3 + i;
              if (p < 1 || p > totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-7 h-7 text-[11px] font-semibold rounded-lg transition-all ${p === page ? 'bg-[var(--shell-accent)] text-white' : 'btn-action'}`}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="btn-action disabled:opacity-40">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </ModuleShell>
  );
}
