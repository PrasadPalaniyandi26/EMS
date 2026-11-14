'use client';

import { useEffect, useState, useMemo } from 'react';
import { ColumnDef, getCoreRowModel } from '@tanstack/react-table';
import { Field } from '@/components/shared/modal-primitives';
import { Input } from '@/components/ui/input';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { getDateRange } from '@/lib/currency';
import { useHeaderStore } from '@/stores/header-store';
import { useAuditLogs, useAuditStats } from '@/hooks/use-queries';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField } from '@/components/shared/detail/detail-kit';
import { formatDistanceToNow, format } from 'date-fns';
import { Shield, RefreshCw, Activity } from 'lucide-react';
import type { AuditLog } from '@/lib/types';

// ─── Config ───────────────────────────────────────
const ACTION_CFG: Record<string, { color: string; bg: string; label: string }> = {
  INSERT: { color: 'text-[var(--success)]', bg: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]', label: 'Created' },
  CREATE: { color: 'text-[var(--success)]', bg: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]', label: 'Created' },
  SUBMIT: { color: 'text-[var(--warning)]', bg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]', label: 'Submitted' },
  UPDATE: { color: 'text-[var(--info)]',    bg: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)]',    label: 'Updated' },
  DELETE: { color: 'text-[var(--danger)]',    bg: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]',    label: 'Deleted' },
};
const getActionCfg = (a: string) => ACTION_CFG[a?.toUpperCase()] ?? { color: 'text-[var(--shell-text-muted)]', bg: 'bg-[var(--shell-hover)]', label: a };

// The tables the server writes to the log; the filter offers these
const TABLE_LABELS: Record<string, string> = {
  transactions: 'Expense or income', recurring_transactions: 'Recurring', users: 'User',
  budget_plans: 'Budget plan', budget_lines: 'Budget line', budget_line_periods: 'Budget month',
  budget_settings: 'Budget settings', build_orders: 'Order', items: 'Part',
};
const tableLabel = (t: string) => TABLE_LABELS[t] || t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

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
  const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

  return (
    <>
      <DetailSummary
        title={`${action.label} · ${tableLabel(log.table_name)}`}
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
                    {oldVal !== undefined && <span className="text-[var(--danger)]">{show(oldVal)}</span>}
                    {oldVal !== undefined && newVal !== undefined && <span className="mx-1.5 text-[var(--shell-text-muted)]">→</span>}
                    {newVal !== undefined && <span className="text-[var(--success)]">{show(newVal)}</span>}
                  </span>
                }
              />
            ))}
          </DetailGrid>
        </DetailSection>
      )}

      {(log.action === 'INSERT' || log.action === 'CREATE') && newVals && (
        <DetailSection title="Record data">
          <DetailGrid cols={1}>
            {Object.entries(newVals).map(([k, v]) => (
              <DetailField key={k} label={label(k)} value={<span className="break-all">{show(v)}</span>} />
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
  const [actionFilter, setActionFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Rows per page follow the height of the table (DataTable measures it); 25 until then
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [selection, setSelection] = useState<Record<string, boolean>>({});

  // Debounce search input → only fires API after 400ms pause
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setHeader('Audit Log', 'System activity and change history'); }, [setHeader]);

  const range = useMemo(() => {
    if (datePreset === 'all') return { from: '', to: '' };
    if (datePreset === 'custom') return { from: dateFrom, to: dateTo };
    return getDateRange(datePreset as any);
  }, [datePreset, dateFrom, dateTo]);

  const params: Record<string, string> = { page: String(pagination.pageIndex + 1), limit: String(pagination.pageSize) };
  if (search) params.search = search;
  if (actionFilter !== 'all') params.action = actionFilter;
  if (tableFilter !== 'all') params.tableName = tableFilter;
  if (range.from) params.dateFrom = range.from;
  if (range.to) params.dateTo = range.to;

  const { data: auditResp, isLoading, isError, error, refetch } = useAuditLogs(params);
  const { data: statsData } = useAuditStats();

  const rows: AuditLog[] = useMemo(() => (auditResp as any)?.rows ?? [], [auditResp]);
  const total: number = (auditResp as any)?.total ?? 0;
  const stats = statsData as any;
  // Older user records were logged as CREATE; the strip counts them with Created
  const mergedActions = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of (stats?.by_action ?? []) as { action: string; count: number }[]) {
      const k = a.action === 'CREATE' ? 'INSERT' : a.action;
      m.set(k, (m.get(k) ?? 0) + a.count);
    }
    return [...m.entries()].map(([action, count]) => ({ action, count }));
  }, [stats]);
  const selectedLog = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;

  // Back to the first page when a filter changes
  useEffect(() => { setPagination((p) => ({ ...p, pageIndex: 0 })); }, [search, actionFilter, tableFilter, datePreset, dateFrom, dateTo]);

  const columns = useMemo<ColumnDef<AuditLog, any>[]>(() => [
    { id: 'action', header: 'Action', size: 110, cell: ({ row }) => <span className={`text-[13px] font-medium ${getActionCfg(row.original.action).color}`}>{getActionCfg(row.original.action).label}</span> },
    { id: 'table', header: 'Table', size: 130, cell: ({ row }) => <span className="text-[13px] text-[var(--shell-text)]">{tableLabel(row.original.table_name)}</span> },
    { id: 'record', header: 'Record', size: 130, cell: ({ row }) => <span className={`text-[13px] ${row.original.reference_id ? 'text-[var(--shell-text)]' : 'text-[var(--shell-text-muted)]'}`}>{row.original.reference_id || `#${row.original.record_id}`}</span> },
    { id: 'actor', header: 'Actor', size: 150, cell: ({ row }) => <span className="text-[13px] text-[var(--shell-text)]">{row.original.username || `User #${row.original.changed_by}`}</span> },
    { id: 'time', header: 'Time', size: 190, cell: ({ row }) => <span className="text-[13px] text-[var(--shell-text-muted)]" title={formatDistanceToNow(new Date(row.original.changed_at), { addSuffix: true })}>{format(new Date(row.original.changed_at), 'MMM d, yyyy h:mm a')}</span> },
  ], []);

  // The server pages and filters the log; the table only shows the page it was given
  const table = useDataTable({
    data: rows, columns,
    state: { pagination, rowSelection: selection },
    onPaginationChange: setPagination,
    onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getRowId: (r: AuditLog) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize), pagination.pageIndex + 1),
    getCoreRowModel: getCoreRowModel(),
  });

  const filterDefs: FilterDef[] = [
    { id: 'action', label: 'Action', value: actionFilter, onChange: setActionFilter, options: [{ value: 'all', label: 'All actions' }, ...['INSERT', 'UPDATE', 'DELETE', 'SUBMIT'].map((a) => ({ value: a, label: getActionCfg(a).label }))] },
    { id: 'table', label: 'Table', value: tableFilter, onChange: setTableFilter, options: [{ value: 'all', label: 'All tables' }, ...Object.entries(TABLE_LABELS).map(([k, v]) => ({ value: k, label: v }))] },
    {
      id: 'date', label: 'Date range', value: datePreset, onChange: setDatePreset,
      options: [{ value: 'all', label: 'All time' }, { value: 'thisWeek', label: 'This week' }, { value: 'lastWeek', label: 'Last week' }, { value: 'thisMonth', label: 'This month' }, { value: 'lastMonth', label: 'Last month' }, { value: 'calYear', label: 'This year' }, { value: 'finYear', label: 'Financial year' }, { value: 'custom', label: 'Custom' }],
      extra: (v) => v === 'custom' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
        </div>
      ) : null,
    },
  ];

  const failed = isError ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24" role="alert">
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
  ) : null;

  return (
    <ModuleShell
      showPanel={!!selectedLog}
      searchRow={
        <DataTableToolbar table={table} filterDefs={filterDefs} searchValue={searchInput} onSearchChange={(v) => { setSearchInput(v); if (!v) setSearch(''); }}
          extra={<button type="button" aria-label="Refresh audit log" onClick={() => refetch()} className="btn-action"><RefreshCw aria-hidden className="h-4 w-4 text-[var(--info)]" /></button>} />
      }
      intelligencePanel={
        <ModuleIntelligencePanel
          title="Audit Detail"
          onClose={() => setSelection({})}
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
          {mergedActions.map((a) => {
            const cfg = getActionCfg(a.action);
            return (
              <div key={a.action} className="flex items-center gap-1.5">
                <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                <span className="text-[12px] font-semibold text-black dark:text-white">{a.count?.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {failed ?? <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} totalRows={total} fullHeight emptyMessage="No audit records found. Try adjusting your filters." />}
    </ModuleShell>
  );
}
