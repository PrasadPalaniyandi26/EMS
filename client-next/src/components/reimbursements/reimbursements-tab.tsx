'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useReimbursementQueue, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/currency';
import {
  Wallet, CheckCircle2, Clock, BadgeCheck, CalendarDays,
  Tag, Briefcase, Ban, CreditCard, PauseCircle,
} from 'lucide-react';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import {
  getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, getFacetedRowModel, getFacetedUniqueValues,
  type ColumnDef, type SortingState, type ColumnFiltersState, type VisibilityState,
} from '@tanstack/react-table';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { ProcessReimbursementModal } from './process-reimbursement-modal';

const STATUS_TABS = [
  { key: 'PENDING',  label: 'Pending' },
  { key: 'ON_HOLD',  label: 'On Hold' },
  { key: 'PAID',     label: 'Paid' },
  { key: 'ALL',      label: 'All' },
] as const;

type StatusTab = typeof STATUS_TABS[number]['key'];

export function ReimbursementsTab() {
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const invalidate = useInvalidate();

  const isFinanceOrAdmin = (user?.roles || []).some((r: any) =>
    ['FINANCE', 'ADMIN'].includes((r.role_name || '').toUpperCase()),
  );

  const [statusTab, setStatusTab] = useState<StatusTab>('PENDING');
  const [selected, setSelected] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIds, setModalIds] = useState<number[]>([]);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const queryParams = useMemo(() => ({ status: statusTab }), [statusTab]);

  const { data: rawData, isLoading } = useReimbursementQueue(queryParams);

  const rows: any[] = useMemo(() => {
    if (!rawData) return [];
    if (Array.isArray(rawData)) return rawData;
    return (rawData as any)?.rows ?? [];
  }, [rawData]);

  useEffect(() => {
    setSelected(null);
  }, [statusTab]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      accessorKey: 'reference_id',
      header: 'Reference',
      cell: ({ row }) => (
        <span className="text-[11px] font-bold font-mono text-[var(--info)]">
          {row.getValue('reference_id') || `#${row.original.id}`}
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: 'employee_name',
      header: 'Employee',
      cell: ({ row }) => {
        const name: string = row.getValue('employee_name') || 'Unknown';
        const parts = name.trim().split(/\s+/);
        const initials = parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : name.slice(0, 2).toUpperCase();
        return (
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black text-white border border-[var(--shell-border)]"
              style={{ background: 'var(--shell-accent)' }}
            >
              {initials}
            </div>
            <div>
              <p className="text-[12px] font-semibold text-black dark:text-white">{name}</p>
              <p className="text-[11px] text-[var(--shell-text-muted)] font-mono">{row.original.employee_id}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'category_name',
      header: () => <div className="text-center">Category</div>,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <span className="text-[12px] font-medium text-[var(--info)]">
            {row.getValue('category_name') || 'General'}
          </span>
        </div>
      ),
    },
    {
      id: 'project',
      header: 'Project / Product',
      cell: ({ row }) => (
        <span className="text-[12px] text-[var(--shell-text-muted)] font-mono font-semibold">
          {row.original.project_name
            ? (row.original.context_code || row.original.project_name)
            : row.original.product_name
            ? (row.original.context_code || row.original.product_name)
            : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'date_recorded',
      header: () => <div className="text-center">Date</div>,
      cell: ({ row }) => (
        <div className="text-[12px] text-[var(--shell-text-muted)] text-center">
          {formatDate(row.getValue('date_recorded'))}
        </div>
      ),
      size: 110,
    },
    {
      id: 'reimb_status',
      header: () => <div className="text-center">Status</div>,
      cell: ({ row }) => {
        const status = row.original.reimbursement_status;
        return (
          <div className="flex justify-center">
            {status === 'PAID' ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--success)]">
                <CheckCircle2 className="w-3.5 h-3.5" /> Paid
              </span>
            ) : status === 'ON_HOLD' ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--warning)]">
                <PauseCircle className="w-3.5 h-3.5" /> On Hold
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--warning)]">
                <Clock className="w-3.5 h-3.5" /> Pending
              </span>
            )}
          </div>
        );
      },
      size: 110,
    },
    {
      accessorKey: 'total_amount',
      header: () => <div className="text-right">Amount</div>,
      cell: ({ row }) => (
        <div className="text-[12px] font-bold text-right text-black dark:text-white">
          {formatCurrency(row.original.total_amount ?? row.original.amount, currency)}
        </div>
      ),
      size: 120,
    },
  ], [currency]);

  const table = useDataTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const openModal = (ids: number[]) => {
    setModalIds(ids);
    setModalOpen(true);
  };

  const handleProcessPayment = async (dto: { status: 'PAID' | 'ON_HOLD'; reference: string; note: string }) => {
    try {
      const res = await api.post<any>('/transactions/bulk-reimburse', {
        ids: modalIds,
        status: dto.status,
        reference: dto.reference || undefined,
        note: dto.note || undefined,
      });
      const count = (res as any).data?.reimbursed ?? (res as any).reimbursed ?? modalIds.length;
      const label = dto.status === 'PAID' ? 'marked as paid' : 'put on hold';
      toast.success(`${count} transaction${count !== 1 ? 's' : ''} ${label}`);
      invalidate('reimbursements', 'transactions');
      setSelected(null);
      setModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to process payment');
      throw e;
    }
  };

  const infoRow = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-[var(--shell-text-muted)] shrink-0">{icon}</span>
      <div>
        <p className="text-[11px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">{label}</p>
        <p className="text-[12px] font-bold text-black dark:text-white">{value}</p>
      </div>
    </div>
  );

  const canProcess = isFinanceOrAdmin && !!selected && statusTab !== 'PAID';

  const selectStyle: React.CSSProperties = {
    background: 'var(--shell-bg)',
    color: 'var(--shell-text)',
    borderColor: 'var(--shell-border)',
  };

  return (
    <>
      <ModuleShell
        showPanel={!!selected}
        searchRow={
          <DataTableToolbar
            table={table}
            actions={
              isFinanceOrAdmin ? (
                <button
                  className="btn-action-primary"
                  onClick={() => selected && openModal([selected.id])}
                  disabled={!canProcess}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Process
                </button>
              ) : null
            }
            extra={
              <select
                value={statusTab}
                onChange={(e) => setStatusTab(e.target.value as StatusTab)}
                className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium border outline-none focus:ring-2 focus:ring-[var(--shell-accent)] h-8"
                style={selectStyle}
              >
                {STATUS_TABS.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            }
          />
        }
        intelligencePanel={
          <ModuleIntelligencePanel
            title="Reimbursement Detail"
            onClose={() => setSelected(null)}
            hasSelection={!!selected}
          >
            {selected && (
              <div className="flex-1 space-y-6">
                {/* Employee */}
                <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-4 space-y-3">
                  <p className="text-[11px] font-bold text-[var(--shell-text-muted)] uppercase">Employee</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[13px] font-bold"
                      style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}>
                      {(selected.employee_name || 'U').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-black dark:text-white">{selected.employee_name}</p>
                      <p className="text-[11px] font-mono text-[var(--shell-text-muted)]">{selected.employee_id}</p>
                    </div>
                  </div>
                </div>

                {/* Transaction detail */}
                <div className="space-y-3">
                  <p className="text-[11px] font-bold text-[var(--shell-text-muted)] uppercase border-b border-[var(--shell-border)] pb-1.5">Transaction</p>
                  <div className="space-y-2.5">
                    {infoRow(<Tag className="w-3.5 h-3.5" />, 'Reference', <span className="font-mono text-[var(--info)]">{selected.reference_id || `#${selected.id}`}</span>)}
                    {infoRow(<CalendarDays className="w-3.5 h-3.5" />, 'Date', formatDate(selected.date_recorded))}
                    {infoRow(<Tag className="w-3.5 h-3.5" />, 'Category', selected.category_name || '—')}
                    {(selected.project_name || selected.product_name) && infoRow(
                      <Briefcase className="w-3.5 h-3.5" />,
                      selected.project_name ? 'Project' : 'Product',
                      selected.project_name || selected.product_name,
                    )}
                    {selected.description && infoRow(<Tag className="w-3.5 h-3.5" />, 'Description', selected.description)}
                  </div>
                </div>

                {/* Amount breakdown */}
                <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-4 space-y-2">
                  <p className="text-[11px] font-bold text-[var(--shell-text-muted)] uppercase">Amount</p>
                  {selected.gst_rate ? (
                    <>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[var(--shell-text-muted)]">Net (excl. GST)</span>
                        <span className="font-semibold text-black dark:text-white">{formatCurrency(selected.net_amount, currency)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[var(--shell-text-muted)]">GST ({selected.gst_rate}%)</span>
                        <span className="font-semibold text-black dark:text-white">{formatCurrency((selected.total_amount ?? selected.amount) - (selected.net_amount ?? selected.amount), currency)}</span>
                      </div>
                      <div className="flex justify-between text-[13px] font-bold border-t border-[var(--shell-border)] pt-2 mt-1">
                        <span className="text-black dark:text-white">Total</span>
                        <span className="text-black dark:text-white">{formatCurrency(selected.total_amount ?? selected.amount, currency)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-[15px] font-bold text-black dark:text-white">{formatCurrency(selected.total_amount ?? selected.amount, currency)}</p>
                  )}
                </div>

                {/* Reimbursement status */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-[var(--shell-text-muted)] uppercase border-b border-[var(--shell-border)] pb-1.5 flex items-center gap-2">
                    <Wallet className="w-3.5 h-3.5" /> Reimbursement
                  </p>
                  {selected.reimbursement_status === 'PAID' ? (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] text-[11px] font-bold">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <div>
                          <p>Reimbursed{selected.reimbursed_by_name ? ` by ${selected.reimbursed_by_name}` : ''}</p>
                          {selected.reimbursed_at && <p className="font-normal opacity-80">{formatDate(selected.reimbursed_at)}</p>}
                        </div>
                      </div>
                      {selected.reimbursement_reference && (
                        <div className="px-3 py-2 rounded-lg border text-[11px]" style={{ background: 'var(--shell-hover)', borderColor: 'var(--shell-border)' }}>
                          <p className="text-[11px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Payment Reference</p>
                          <p className="font-mono font-bold text-black dark:text-white">{selected.reimbursement_reference}</p>
                        </div>
                      )}
                      {selected.reimbursement_note && (
                        <div className="px-3 py-2 rounded-lg border text-[11px]" style={{ background: 'var(--shell-hover)', borderColor: 'var(--shell-border)' }}>
                          <p className="text-[11px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Note</p>
                          <p className="text-black dark:text-white">{selected.reimbursement_note}</p>
                        </div>
                      )}
                    </>
                  ) : selected.reimbursement_status === 'ON_HOLD' ? (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)] text-[11px] font-bold">
                        <PauseCircle className="w-4 h-4 shrink-0" />
                        <div>
                          <p>On Hold{selected.reimbursed_by_name ? ` · ${selected.reimbursed_by_name}` : ''}</p>
                          {selected.reimbursed_at && <p className="font-normal opacity-80">{formatDate(selected.reimbursed_at)}</p>}
                        </div>
                      </div>
                      {selected.reimbursement_reference && (
                        <div className="px-3 py-2 rounded-lg border text-[11px]" style={{ background: 'var(--shell-hover)', borderColor: 'var(--shell-border)' }}>
                          <p className="text-[11px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Reference</p>
                          <p className="font-mono font-bold text-black dark:text-white">{selected.reimbursement_reference}</p>
                        </div>
                      )}
                      {selected.reimbursement_note && (
                        <div className="px-3 py-2 rounded-lg border text-[11px]" style={{ background: 'var(--shell-hover)', borderColor: 'var(--shell-border)' }}>
                          <p className="text-[11px] font-bold text-[var(--shell-text-muted)] uppercase mb-0.5">Note</p>
                          <p className="text-black dark:text-white">{selected.reimbursement_note}</p>
                        </div>
                      )}
                      {isFinanceOrAdmin && (
                        <button
                          onClick={() => openModal([selected.id])}
                          className="w-full text-[11px] font-bold text-[var(--shell-accent)] hover:underline uppercase tracking-wider text-center py-1"
                        >
                          Process Payment →
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_20%,transparent)]">
                      <div className="flex items-center gap-2 text-[var(--warning)]">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span className="text-[11px] font-bold">Pending Reimbursement</span>
                      </div>
                      {isFinanceOrAdmin && (
                        <button
                          onClick={() => openModal([selected.id])}
                          className="text-[11px] font-bold text-[var(--shell-accent)] hover:underline uppercase tracking-wider"
                        >
                          Process →
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Approved by */}
                {selected.approved_by_name && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-[var(--shell-text-muted)] uppercase border-b border-[var(--shell-border)] pb-1.5 flex items-center gap-2">
                      <BadgeCheck className="w-3.5 h-3.5" /> Approved By
                    </p>
                    <div className="px-3 py-2 rounded-lg bg-[var(--shell-hover)] border border-[var(--shell-border)]">
                      <p className="text-[12px] font-bold text-black dark:text-white">{selected.approved_by_name}</p>
                      {selected.approved_by_role && <p className="text-[11px] text-[var(--shell-text-muted)]">{selected.approved_by_role}</p>}
                      {selected.approved_at && <p className="text-[11px] text-[var(--shell-text-muted)] mt-0.5">{formatDate(selected.approved_at)}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ModuleIntelligencePanel>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-[var(--shell-text-muted)] text-sm">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-[var(--shell-text-muted)]">
            {statusTab === 'PENDING'
              ? <><CheckCircle2 className="w-8 h-8 text-[var(--success)]" /><p className="text-sm font-medium">All reimbursements are settled</p></>
              : statusTab === 'ON_HOLD'
              ? <><PauseCircle className="w-8 h-8 text-[var(--warning)]" /><p className="text-sm font-medium">No on-hold reimbursements</p></>
              : statusTab === 'PAID'
              ? <><Wallet className="w-8 h-8" /><p className="text-sm font-medium">No paid reimbursements yet</p></>
              : <><Ban className="w-8 h-8" /><p className="text-sm font-medium">No reimbursement records found</p></>
            }
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            tableInstance={table}
            onRowClick={(row) => {
              setSelected((prev: any) => prev?.id === row.id ? null : row);
            }}
          />
        )}
      </ModuleShell>

      <ProcessReimbursementModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleProcessPayment}
        selectedCount={1}
        mode="single"
      />
    </>
  );
}
