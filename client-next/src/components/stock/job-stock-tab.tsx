'use client';

import { useMemo, useState } from 'react';
import { FilePen, MinusCircle } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/currency';
import { money } from '@/lib/money';
import { useAuthStore } from '@/stores/auth-store';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { DateCell, TextCell, ToneText, headerRight, NumCell } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { canRecordStock } from '@/lib/permissions';
import { qty, useJobStock, type StockMoveRow } from '@/hooks/use-stock-queries';
import { StockUsedModal, type UsedMode } from '@/components/stock/stock-modals';

// The Material tab of a project or an order: stock used, its cost, and how it compares with the BOM
export function JobStockTab({ projectId, buildOrderId, nextStep = [] }: { projectId?: number; buildOrderId?: number; /** The order's next step, shown on every one of its tabs */ nextStep?: DetailActionDef[] }) {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const canRecord = useAuthStore((s) => canRecordStock(s.user?.role_name));
  const { data, isLoading } = useJobStock({ projectId, buildOrderId });
  const [sorting, setSorting] = useState<SortingState>([{ id: 'moved_on', desc: true }]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<{ mode: UsedMode; entry: StockMoveRow | null } | null>(null);
  const rows = data?.entries ?? [];

  const columns = useMemo<ColumnDef<StockMoveRow, any>[]>(() => [
    { accessorKey: 'moved_on', header: 'Date', cell: ({ row }) => <DateCell value={row.original.moved_on} />, size: 110 },
    { accessorKey: 'part_no', header: 'Part', cell: ({ row }) => <TextCell value={row.original.part_no} strong />, size: 120 },
    { accessorKey: 'part_name', header: 'Name', cell: ({ row }) => <TextCell value={row.original.part_name} className="block max-w-[220px] truncate" /> },
    { accessorKey: 'quantity', header: headerRight('Quantity used'), cell: ({ row }) => <NumCell strong>{`${qty(row.original.quantity)} ${row.original.uom}`}</NumCell>, size: 130 },
    { accessorKey: 'unit_cost', header: headerRight('Unit cost'), cell: ({ row }) => <NumCell>{money(row.original.unit_cost, currency)}</NumCell>, size: 110 },
    { accessorKey: 'value', header: headerRight('Cost'), cell: ({ row }) => <NumCell strong>{money(row.original.value, currency)}</NumCell>, size: 120 },
    { id: 'note', header: 'Entry', accessorFn: (r) => (r.corrects_id ? 'Correction' : r.closed ? 'Closed month' : 'Open'), cell: ({ getValue }) => <ToneText label={getValue() as string} tone={getValue() === 'Correction' ? 'warning' : 'muted'} />, size: 120 },
  ], [currency]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;

  const alwaysActions: DetailActionDef[] = canRecord && data && !data.closed
    ? [{ label: 'Add stock used', variant: 'primary', icon: <MinusCircle className="h-4 w-4 text-[var(--success)]" />, onClick: () => setDialog({ mode: 'add', entry: null }) }] : [];
  // A correction is not edited; an entry in a closed month is corrected instead of edited
  const itemActions: DetailActionDef[] = !selected || !canRecord || selected.corrects_id ? [] : selected.closed
    ? [{ label: 'Correct', icon: <FilePen className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setDialog({ mode: 'correct', entry: selected }) }]
    : [{ label: 'Edit', onClick: () => setDialog({ mode: 'edit', entry: selected }) }];

  const panelActions = [...itemActions, ...nextStep].slice(0, 3);

  const onBom = (data?.lines ?? []).filter((l) => l.on_bom);
  const bomValue = onBom.reduce((a, l) => a + (l.bom_value ?? 0), 0);
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="Stock used" subtitle={data?.label} figure={money(data?.total ?? 0, currency)} figureLabel="Material cost from the Store" />
      <DetailSection title="Used against the BOM">
        {!data?.lines.length ? <p className="text-[12px] text-[var(--shell-text-muted)]">{data?.has_bom ? 'No stock parts on the BOM, and nothing used yet.' : 'Nothing used from the Store yet.'}</p> : (
          <ul className="space-y-2">
            {data.lines.map((l) => (
              <li key={l.item_id} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate text-[var(--shell-text)]">{l.part_no}</span><span className="shrink-0 font-semibold tabular-nums text-[var(--shell-text)]">{money(l.used_value, currency)}</span></div>
                <div className="text-[12px] tabular-nums text-[var(--shell-text-muted)]">{l.on_bom ? `${qty(l.used_qty)} of ${qty(l.bom_qty ?? 0)} ${l.uom} used, BOM at standard ${money(l.bom_value, currency)}` : `${qty(l.used_qty)} ${l.uom} used${data.has_bom ? ', not on the BOM' : ''}`}</div>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
      {onBom.length > 0 && <DetailGrid><DetailField label="BOM stock parts at standard" value={money(bomValue, currency)} /><DetailField label="Used so far" value={money(data!.total, currency)} /></DetailGrid>}
    </div>
  );
  const detail = !selected ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.part_name} subtitle={`${selected.part_no} · ${formatDate(selected.moved_on)}`} figure={money(selected.value, currency)} figureLabel={`${qty(selected.quantity)} ${selected.uom} at ${money(selected.unit_cost, currency)}`} />
      <DetailGrid>
        <DetailField label="Recorded by" value={selected.created_by_name ?? undefined} />
        <DetailField label="Budget category" value={selected.category_name ?? undefined} />
        <DetailField label="Reason" value={selected.reason ?? undefined} wide />
      </DetailGrid>
      {selected.closed && <p className="text-[12px] text-[var(--shell-text-muted)]">This month is closed. Use Correct to change what the job is charged.</p>}
    </div>
  );
  const exportCsv = () => downloadCsv(`stock-used-${data?.label ?? 'job'}.csv`, toCsv(['date', 'part_no', 'name', 'quantity', 'unit', 'unit_cost', 'cost', 'reason', 'recorded_by'],
    rows.map((r) => [r.moved_on, r.part_no, r.part_name, r.quantity, r.uom, r.unit_cost, r.value, r.reason ?? '', r.created_by_name ?? ''])));

  return (
    <>
      <ModuleShell
        showPanel={!!selected}
        searchRow={<DataTableToolbar table={table} onExport={exportCsv} actions={<><ToolbarActions actions={[...alwaysActions, ...nextStep]} /><ToolbarActions actions={itemActions} /></>} />}
        intelligencePanel={
          <ModuleIntelligencePanel title={selected ? 'Entry' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected} idle={summary} footer={panelActions.length ? <DetailActions actions={panelActions} /> : undefined}>{detail}</ModuleIntelligencePanel>
        }
      >
        <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={data?.closed ?? 'No stock used yet. Click Add stock used when material is taken from the Store.'} />
      </ModuleShell>
      <StockUsedModal isOpen={!!dialog} onClose={() => { setDialog(null); setSelection({}); }} job={data} mode={dialog?.mode ?? 'add'} entry={dialog?.entry ?? null} />
    </>
  );
}
