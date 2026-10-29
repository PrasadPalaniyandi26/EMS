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
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import {
  getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, getFacetedRowModel, getFacetedUniqueValues,
  type ColumnDef, type SortingState, type ColumnFiltersState, type VisibilityState,
} from '@tanstack/react-table';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { IdCell, TextCell, DateCell, MoneyCell, ToneText, headerRight } from '@/components/data-table/cells';
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
      cell: ({ row }) => <IdCell value={row.getValue('reference_id') || `#${row.original.id}`} />,
      size: 110,
    },
    {
      accessorKey: 'employee_name',
      header: 'Employee',
      cell: ({ row }) => <TextCell value={row.getValue('employee_name') || 'Unknown'} strong />,
    },
    {
      accessorKey: 'category_name',
      header: 'Category',
      cell: ({ row }) => <TextCell value={(row.getValue('category_name') as string) || 'General'} />,
    },
    {
      id: 'project',
      header: 'Project / product',
      cell: ({ row }) => {
        const o = row.original;
        const code = o.project_name
          ? (o.context_code || o.project_name)
          : o.product_name
          ? (o.context_code || o.product_name)
          : '';
        return <IdCell value={code} />;
      },
    },
    {
      accessorKey: 'date_recorded',
      header: 'Date',
      cell: ({ row }) => <DateCell value={row.getValue('date_recorded') as string} />,
      size: 110,
    },
    {
      id: 'reimb_status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.reimbursement_status;
        return status === 'PAID'
          ? <ToneText label="Paid" tone="success" />
          : status === 'ON_HOLD'
          ? <ToneText label="On hold" tone="warning" />
          : <ToneText label="Pending" tone="warning" />;
      },
      size: 110,
    },
    {
      accessorKey: 'total_amount',
      header: headerRight('Amount'),
      cell: ({ row }) => <MoneyCell value={row.original.total_amount ?? row.original.amount} currency={currency} />,
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
        <p className="text-[12px] font-semibold text-[var(--shell-text-muted)] mb-0.5">{label}</p>
        <p className="text-[12px] font-semibold text-black dark:text-white">{value}</p>
      </div>
    </div>
  );

  const canProcess = isFinanceOrAdmin && !!selected && statusTab !== 'PAID';

  const selectStyle: React.CSSProperties = {
    background: 'var(--shell-bg)',
    color: 'var(--shell-text)',
    borderColor: 'var(--shell-border)',
  };

  const itemActions: DetailActionDef[] = isFinanceOrAdmin && selected && selected.reimbursement_status !== 'PAID'
    ? [{ label: selected.reimbursement_status === 'ON_HOLD' ? 'Process payment' : 'Process', variant: 'primary', onClick: () => openModal([selected.id]) }]
    : [];

  return (
    <>
      <ModuleShell
        showPanel={!!selected}
        searchRow={
          <DataTableToolbar
            table={table}
            actions={<ToolbarActions actions={itemActions} />}
            extra={
              <select
                value={statusTab}
                onChange={(e) => setStatusTab(e.target.value as StatusTab)}
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium border outline-none focus:ring-2 focus:ring-[var(--shell-accent)] h-8"
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
            footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}
          >
            {selected && (() => {
              const x: any = selected;
              const total = x.total_amount ?? x.amount;
              const state = x.reimbursement_status;
              return (
                <>
                  <DetailSummary
                    title={x.employee_name || 'Employee'}
                    subtitle={[x.employee_id, x.reference_id || `#${x.id}`].filter(Boolean).join(' · ')}
                    status={state === 'PAID' ? 'Paid' : state === 'ON_HOLD' ? 'On hold' : 'Pending'}
                    statusClass={state === 'PAID' ? 'text-[var(--success)]' : 'text-[var(--warning)]'}
                    figure={formatCurrency(total, currency)}
                    figureLabel="Total"
                  />

                  <DetailSection title="Transaction">
                    <DetailGrid>
                      <DetailField label="Date" value={formatDate(x.date_recorded)} />
                      <DetailField label="Category" value={x.category_name} />
                      {(x.project_name || x.product_name) && <DetailField label={x.project_name ? 'Project' : 'Product'} value={x.project_name || x.product_name} wide />}
                      {x.description && <DetailField label="Description" value={x.description} wide />}
                      {x.gst_rate ? (
                        <>
                          <DetailField label="Net amount" value={formatCurrency(x.net_amount, currency)} />
                          <DetailField label={`GST (${x.gst_rate}%)`} value={formatCurrency(total - (x.net_amount ?? x.amount), currency)} />
                        </>
                      ) : null}
                    </DetailGrid>
                  </DetailSection>

                  <DetailSection title="Reimbursement">
                    <DetailGrid>
                      <DetailField label="Status" value={state === 'PAID' ? 'Paid' : state === 'ON_HOLD' ? 'On hold' : 'Pending'} tone={state === 'PAID' ? 'success' : 'warning'} />
                      <DetailField label="Handled by" value={x.reimbursed_by_name} />
                      {x.reimbursed_at && <DetailField label="Date" value={formatDate(x.reimbursed_at)} />}
                      {x.reimbursement_reference && <DetailField label="Payment reference" value={x.reimbursement_reference} />}
                      {x.reimbursement_note && <DetailField label="Note" value={x.reimbursement_note} wide />}
                    </DetailGrid>
                  </DetailSection>

                  {x.approved_by_name && (
                    <DetailSection title="Approval">
                      <DetailGrid>
                        <DetailField label="Approved by" value={x.approved_by_name} />
                        <DetailField label="Role" value={x.approved_by_role} />
                        {x.approved_at && <DetailField label="Date" value={formatDate(x.approved_at)} />}
                      </DetailGrid>
                    </DetailSection>
                  )}
                </>
              );
            })()}
          </ModuleIntelligencePanel>
        }
      >
        {isLoading ? (
          <DataTable isLoading columns={columns} data={[]} tableInstance={table} />
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
