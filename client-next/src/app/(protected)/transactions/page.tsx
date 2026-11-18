'use client';
import { useEffect, useState, useMemo } from 'react';
import { ColumnDef, getCoreRowModel } from '@tanstack/react-table';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactions, useClients } from '@/hooks/use-queries';
import api, { getAccessToken, API_BASE } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { type FilterDef } from '@/components/data-table/filters';
import { Field } from '@/components/shared/modal-primitives';
import { getStatusConfig } from '@/lib/status';
import { formatCurrency, formatDate, getDateRange, toLocalYMD } from '@/lib/currency';
import { toast } from 'sonner';
import { IdCell, TextCell, DateCell, MoneyCell, StatusText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ChargedToSection } from '@/components/transactions/charged-to';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAttachment } from '@/components/shared/detail/detail-kit';
import { PageFrame } from '@/components/shared/module/page-frame';

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

  // Five controls, so they live in the Filters dialog. The date range opens its two dates when it is Custom.
  const filterDefs: FilterDef[] = [
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
    { id: 'type', label: 'Type', value: filterType, onChange: setFilterType, options: [{ value: 'all', label: 'All types' }, { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }] },
    { id: 'payment', label: 'Payment method', value: filterPayment, onChange: setFilterPayment, options: [{ value: 'all', label: 'All methods' }, { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'upi', label: 'UPI' }, { value: 'cheque', label: 'Cheque' }] },
    { id: 'client', label: 'Client', value: filterClient, onChange: setFilterClient, options: [{ value: 'all', label: 'All clients' }, ...(clients || []).map((c: any) => ({ value: String(c.id), label: c.name }))] },
  ];

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

  const [selection, setSelection] = useState<Record<string, boolean>>({});
  // Rows per page follow the height of the table (DataTable measures it); 25 until then
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  useEffect(() => { setHeader('Transactions', 'View all transactions'); }, [setHeader]);

  useEffect(() => { setPagination((p) => ({ ...p, pageIndex: 0 })); }, [search, filterType, filterPayment, filterClient, datePreset, dateFrom, dateTo]);

  const queryParams = useMemo(() => ({
    ...filters,
    ...(search ? { search } : {}),
    page: String(pagination.pageIndex + 1),
    limit: String(pagination.pageSize),
  }), [filters, search, pagination]);

  const { data: txnData, isLoading } = useTransactions(queryParams);
  const displayedTxns = useMemo(() => txnData?.rows || [], [txnData]);
  const total = txnData?.total ?? 0;
  const selectedTxn = displayedTxns.find((t: any) => String(t.id) === Object.keys(selection)[0]) ?? null;

  const columns = useMemo<ColumnDef<any, any>[]>(() => [
    { accessorKey: 'reference_id', header: 'Code', size: 110, cell: ({ row }) => <IdCell value={row.original.reference_id || `#${row.original.id}`} /> },
    { accessorKey: 'description', header: 'Description', cell: ({ row }) => <TextCell value={row.original.description} strong className="block max-w-[350px] truncate" /> },
    { accessorKey: 'status', header: 'Status', size: 150, cell: ({ row }) => <StatusText status={row.original.status} /> },
    { id: 'type', header: 'Type', size: 100, cell: ({ row }) => <TextCell value={row.original.type === 'income' ? 'Income' : 'Expense'} /> },
    { accessorKey: 'category_name', header: 'Category', size: 140, cell: ({ row }) => <TextCell value={row.original.category_name} /> },
    { accessorKey: 'client_name', header: 'Client', size: 140, cell: ({ row }) => <TextCell value={row.original.client_name} /> },
    { accessorKey: 'date_recorded', header: 'Date', size: 112, cell: ({ row }) => <DateCell value={row.original.date_recorded} /> },
    { accessorKey: 'amount', header: headerRight('Amount'), size: 130, cell: ({ row }) => <MoneyCell value={row.original.amount} currency={currency} /> },
  ], [currency]);

  // The server pages, searches and orders the rows; the table only shows the page it was given
  const table = useDataTable({
    data: displayedTxns, columns,
    state: { pagination, rowSelection: selection },
    onPaginationChange: setPagination,
    onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getRowId: (t: any) => String(t.id),
    enableRowSelection: true, enableMultiRowSelection: false,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize), pagination.pageIndex + 1),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageFrame label="Transactions">
    <ModuleShell
      showPanel={!!selectedTxn}
      searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} onExport={handleExportCsv} exporting={exporting} searchValue={search} onSearchChange={setSearch} />}
      intelligencePanel={
        <ModuleIntelligencePanel
          title="Transaction Detail"
          onClose={() => setSelection({})}
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
                  </DetailGrid>
                </DetailSection>

                <ChargedToSection txn={t} />

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
      <DataTable isLoading={isLoading} columns={columns} data={displayedTxns} tableInstance={table} totalRows={total} fullHeight emptyMessage="No transactions found matching the criteria." />
    </ModuleShell>
    </PageFrame>
  );
}
