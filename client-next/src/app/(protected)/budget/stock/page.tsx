'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Boxes, CheckCircle2, ClipboardList, CornerUpLeft, PackagePlus, PencilLine, Plus, Send, Settings2, Tag } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDate, toLocalYMD } from '@/lib/currency';
import { money } from '@/lib/money';
import { canApproveStock, canConfigure, canRecordStock } from '@/lib/permissions';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { useItems } from '@/hooks/use-planning-queries';
import { KIND_LABEL, qty, useStockCount, useStockCounts, useStockMoves, useStockOnHand, type StockBalanceRow, type StockCountRow, type StockMoveRow } from '@/hooks/use-stock-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { DateCell, TextCell, ToneText, headerRight, NumCell } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { TabBar, useTabParam } from '@/components/budgets/budget-ui';
import { EnterCountsModal, NewCountModal, SendBackCountModal, OpeningStockModal, StockSettingsModal, type SettingsPart } from '@/components/stock/stock-modals';

type Tab = 'onhand' | 'entries' | 'counts';
const TABS: { value: Tab; label: string }[] = [{ value: 'onhand', label: 'On hand' }, { value: 'entries', label: 'Entries' }, { value: 'counts', label: 'Counts' }];
const TAB_VALUES = TABS.map((t) => t.value);
// The last day of each of the past twelve months, for the stock value at a month end
function monthEnds() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => toLocalYMD(new Date(now.getFullYear(), now.getMonth() - i, 0)));
}
const COUNT_STATE = { DRAFT: { label: 'Draft', tone: 'muted' as const }, SUBMITTED: { label: 'Waiting for approval', tone: 'warning' as const }, APPROVED: { label: 'Approved', tone: 'success' as const } };

export default function StockPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const role = useAuthStore((s) => s.user?.role_name);
  const canRecord = canRecordStock(role); const canApprove = canApproveStock(role); const canCfg = canConfigure(role);
  const invalidate = useInvalidate();
  const [tab, setTab] = useTabParam<Tab>(TAB_VALUES, 'onhand');
  const [asOf, setAsOf] = useState('');
  const onHand = useStockOnHand(asOf); const moves = useStockMoves(tab === 'entries'); const counts = useStockCounts(tab === 'counts');
  const items = useItems(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [level, setLevel] = useState('ALL'); const [kind, setKind] = useState('ALL'); const [partFilter, setPartFilter] = useState('ALL');
  const [settingsFor, setSettingsFor] = useState<SettingsPart | null>(null); const [settingsOpen, setSettingsOpen] = useState(false);
  const [openingFor, setOpeningFor] = useState<StockBalanceRow | null>(null);
  const [priceFor, setPriceFor] = useState<StockBalanceRow | null>(null);
  const [newCount, setNewCount] = useState(false); const [countsFor, setCountsFor] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ step: 'submit' | 'approve' | 'delete'; row: StockCountRow } | null>(null);
  const [sendBack, setSendBack] = useState<StockCountRow | null>(null);
  useEffect(() => { setHeader('Stock register', 'Parts bought in bulk: what is in the Store, what jobs used and the monthly count'); }, [setHeader]);

  const rows = useMemo<any[]>(() => {
    if (tab === 'onhand') return (onHand.data ?? []).filter((r) => level === 'ALL' || (level === 'REORDER' ? r.reorder : r.quantity > 0));
    if (tab === 'entries') return (moves.data ?? []).filter((r) => (kind === 'ALL' || r.kind === kind) && (partFilter === 'ALL' || String(r.item_id) === partFilter));
    return counts.data ?? [];
  }, [tab, onHand.data, moves.data, counts.data, level, kind, partFilter]);

  const columns = useMemo<ColumnDef<any, any>[]>(() => tab === 'onhand' ? [
    { accessorKey: 'part_no', header: 'Part', cell: ({ row }) => <TextCell value={row.original.part_no} strong />, size: 120 },
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <TextCell value={row.original.name} className="block max-w-[240px] truncate" /> },
    { accessorKey: 'quantity', header: headerRight('On hand'), cell: ({ row }) => <NumCell strong>{`${qty(row.original.quantity)} ${row.original.uom}`}</NumCell>, size: 130 },
    { accessorKey: 'avg_cost', header: headerRight('Average cost'), cell: ({ row }) => <NumCell>{money(row.original.avg_cost, currency)}</NumCell>, size: 130 },
    { accessorKey: 'value', header: headerRight('Value'), cell: ({ row }) => <NumCell strong>{money(row.original.value, currency)}</NumCell>, size: 130 },
    { accessorKey: 'reorder_level', header: headerRight('Reorder level'), cell: ({ row }) => <NumCell>{row.original.reorder_level == null ? '—' : qty(row.original.reorder_level)}</NumCell>, size: 120 },
    { id: 'state', header: 'Status', size: 130, accessorFn: (r) => (r.reorder ? 'Reorder' : r.supply_mode === 'DIRECT' ? 'Direct' : 'OK'), cell: ({ getValue }) => <ToneText label={getValue() as string} tone={getValue() === 'Reorder' ? 'warning' : 'muted'} /> },
  ] : tab === 'entries' ? [
    { accessorKey: 'moved_on', header: 'Date', cell: ({ row }) => <DateCell value={row.original.moved_on} />, size: 110 },
    { accessorKey: 'kind', header: 'Entry', accessorFn: (r) => KIND_LABEL[r.kind as StockMoveRow['kind']], cell: ({ getValue }) => <TextCell value={getValue() as string} />, size: 130 },
    { accessorKey: 'part_no', header: 'Part', cell: ({ row }) => <TextCell value={row.original.part_no} strong />, size: 120 },
    { accessorKey: 'quantity', header: headerRight('Quantity'), cell: ({ row }) => <NumCell strong>{`${qty(row.original.quantity)} ${row.original.uom}`}</NumCell>, size: 130 },
    { accessorKey: 'value', header: headerRight('Value'), cell: ({ row }) => <NumCell>{money(row.original.value, currency)}</NumCell>, size: 130 },
    { accessorKey: 'job', header: 'Job', cell: ({ row }) => <TextCell value={row.original.job} />, size: 150 },
    { accessorKey: 'reference', header: 'Reference', cell: ({ row }) => <TextCell value={row.original.reference} muted />, size: 140 },
  ] : [
    { accessorKey: 'label', header: 'Month', accessorFn: (r) => r.label, sortingFn: (a, b) => a.original.year * 12 + a.original.month - (b.original.year * 12 + b.original.month), cell: ({ row }) => <TextCell value={row.original.label} strong />, size: 130 },
    { id: 'status', header: 'Status', accessorFn: (r) => COUNT_STATE[r.status as StockCountRow['status']].label, cell: ({ row }) => <ToneText {...COUNT_STATE[row.original.status as StockCountRow['status']]} />, size: 170 },
    { accessorKey: 'counted', header: headerRight('Parts counted'), cell: ({ row }) => <NumCell>{`${row.original.counted} of ${row.original.parts}`}</NumCell>, size: 130 },
    { accessorKey: 'adjustment_value', header: headerRight('Difference posted'), cell: ({ row }) => <NumCell strong>{row.original.status === 'APPROVED' ? money(row.original.adjustment_value, currency) : '—'}</NumCell>, size: 150 },
    { accessorKey: 'approved_by_name', header: 'Approved by', cell: ({ row }) => <TextCell value={row.original.approved_by_name} muted />, size: 150 },
  ], [tab, currency]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getColumnCanGlobalFilter: () => true, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected: any = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const part: StockBalanceRow | null = tab === 'onhand' ? selected : null;
  const count: StockCountRow | null = tab === 'counts' ? selected : null;
  const sheet = useStockCount(count?.id ?? null);

  const switchTab = (next: Tab) => { setTab(next); setSelection({}); setSorting([]); };
  const act = async (call: () => Promise<unknown>, done: string) => {
    try { await call(); toast.success(done); invalidate('stock', 'budgets'); }
    catch (e: any) { toast.error(e?.message || 'Could not save.'); }
  };

  // Bought, active parts that are not stock parts yet
  const choices: SettingsPart[] = (items.data ?? []).filter((i) => i.status === 'ACTIVE' && i.project_id == null && !(onHand.data ?? []).some((r) => r.id === i.id && r.supply_mode === 'STOCK'))
    .map((i) => ({ id: i.id, part_no: i.part_no, name: i.name, uom: i.uom, supply_mode: 'DIRECT', purchase_uom: null, purchase_factor: null, reorder_level: null, category_id: null }));

  const alwaysActions: DetailActionDef[] = tab === 'onhand' && canRecord
    ? [{ label: 'Add stock part', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setSettingsFor(null); setSettingsOpen(true); } }]
    : tab === 'counts' && canRecord ? [{ label: 'New count', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => setNewCount(true) }] : [];

  const itemActions: DetailActionDef[] = part ? [
    ...(canApprove && !asOf && part.supply_mode === 'STOCK' && part.entries === 0 ? [{ label: 'Opening stock', variant: 'primary' as const, icon: <PackagePlus className="h-4 w-4 text-[var(--shell-accent)]" />, onClick: () => setOpeningFor(part) }] : []),
    ...(canRecord ? [{ label: 'Stock settings', icon: <Settings2 className="h-4 w-4 text-[var(--info)]" />, onClick: () => { setSettingsFor(part); setSettingsOpen(true); } }] : []),
    ...(canCfg && !asOf && part.avg_cost > 0 && Math.abs(part.avg_cost - part.standard_price) >= 0.01 ? [{ label: 'Use average price', icon: <Tag className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setPriceFor(part) }] : []),
  ] : count ? [
    ...(count.status === 'DRAFT' && canRecord ? [
      { label: 'Enter counts', variant: 'primary' as const, icon: <PencilLine className="h-4 w-4 text-[var(--info)]" />, onClick: () => setCountsFor(count.id) },
      { label: 'Submit', disabled: count.counted < count.parts, icon: <Send className="h-4 w-4 text-[var(--shell-accent)]" />, onClick: () => setConfirm({ step: 'submit', row: count }) },
      { label: 'Delete', variant: 'danger' as const, onClick: () => setConfirm({ step: 'delete', row: count }) },
    ] : []),
    ...(count.status === 'SUBMITTED' && canApprove ? [
      { label: 'Approve', variant: 'primary' as const, icon: <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />, onClick: () => setConfirm({ step: 'approve', row: count }) },
      { label: 'Send back', icon: <CornerUpLeft className="h-4 w-4 text-[var(--info)]" />, onClick: () => setSendBack(count) },
    ] : []),
  ] : [];

  const stockRows = (onHand.data ?? []).filter((r) => r.supply_mode === 'STOCK' || r.quantity > 0);
  const totalValue = stockRows.reduce((a, r) => a + r.value, 0);
  const low = stockRows.filter((r) => r.reorder).length;
  const summary = tab === 'counts' ? (
    <div className="space-y-4">
      <DetailSummary title="Stock counts" subtitle="One for each month" figure={(counts.data ?? []).filter((c) => c.status !== 'APPROVED').length} figureLabel="Counts not yet approved" />
      <p className="text-[12px] text-[var(--shell-text-muted)]">Count the Store before the month is closed. A difference is charged to the Workshop department, never to a job.</p>
    </div>
  ) : (
    <div className="space-y-4">
      <DetailSummary title="Store" subtitle={asOf ? `At the end of ${formatDate(asOf)}` : 'Now'} figure={money(totalValue, currency)} figureLabel="Stock value" />
      <DetailGrid><DetailField label="Stock parts" value={stockRows.length} /><DetailField label="At reorder level" value={low} tone={low ? 'warning' : 'muted'} /></DetailGrid>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Stock comes in with a stock purchase on the Expense page. It is used from the Material tab of a project or order.</p>
    </div>
  );

  const detail = part ? (
    <div className="space-y-4">
      <DetailSummary title={part.name} subtitle={part.part_no} status={part.reorder ? 'Reorder' : undefined} statusClass="text-[var(--warning)]" figure={`${qty(part.quantity)} ${part.uom}`} figureLabel={`Worth ${money(part.value, currency)}`} />
      <DetailSection title="Cost"><DetailGrid><DetailField label="Average cost" value={money(part.avg_cost, currency)} /><DetailField label="Standard price" value={money(part.standard_price, currency)} /></DetailGrid></DetailSection>
      <DetailSection title="Settings">
        <DetailGrid>
          <DetailField label="Supply mode" value={part.supply_mode === 'STOCK' ? 'Stock' : 'Direct'} />
          <DetailField label="Reorder level" value={part.reorder_level == null ? undefined : `${qty(part.reorder_level)} ${part.uom}`} />
          <DetailField label="Bought in" value={part.purchase_uom ? `${part.purchase_uom} of ${qty(part.purchase_factor ?? 1)} ${part.uom}` : part.uom} />
          <DetailField label="Budget category" value={part.category_name ?? undefined} />
        </DetailGrid>
      </DetailSection>
    </div>
  ) : tab === 'entries' && selected ? (
    <div className="space-y-4">
      <DetailSummary title={KIND_LABEL[(selected as StockMoveRow).kind]} subtitle={`${selected.part_no} · ${formatDate(selected.moved_on)}`} figure={money(selected.value, currency)} figureLabel={`${qty(selected.quantity)} ${selected.uom} at ${money(selected.unit_cost, currency)}`} />
      <DetailGrid>
        <DetailField label="Job" value={selected.job ?? undefined} /><DetailField label="Reference" value={selected.reference ?? undefined} />
        <DetailField label="Recorded by" value={selected.created_by_name ?? undefined} /><DetailField label="Budget category" value={selected.category_name ?? undefined} />
        <DetailField label="Reason" value={selected.reason ?? undefined} wide />
      </DetailGrid>
    </div>
  ) : count ? (
    <div className="space-y-4">
      <DetailSummary title={`${count.label} count`} status={COUNT_STATE[count.status].label} figure={money(count.status === 'APPROVED' ? count.adjustment_value : (sheet.data?.lines ?? []).reduce((a, l) => a + (l.difference_value ?? 0), 0), currency)} figureLabel={count.status === 'APPROVED' ? 'Difference posted' : 'Difference so far'} />
      {count.note && <p className="text-[12px] text-[var(--warning)]">{count.note}</p>}
      <DetailSection title="Parts">
        <ul className="space-y-2">
          {(sheet.data?.lines ?? []).map((l) => (
            <li key={l.item_id} className="text-[13px]">
              <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate text-[var(--shell-text)]">{l.part_no}</span>
                <span className={l.difference ? 'shrink-0 font-semibold tabular-nums text-[var(--warning)]' : 'shrink-0 tabular-nums text-[var(--shell-text-muted)]'}>{l.difference == null ? 'Not counted' : l.difference === 0 ? 'Matches' : `${l.difference > 0 ? '+' : ''}${qty(l.difference)} ${l.uom}`}</span></div>
              <div className="text-[12px] tabular-nums text-[var(--shell-text-muted)]">Books {qty(l.expected_qty)}{l.counted_qty == null ? '' : `, counted ${qty(l.counted_qty)}`}{l.difference ? `, ${money(l.difference_value, currency)}` : ''}</div>
            </li>
          ))}
        </ul>
      </DetailSection>
    </div>
  ) : null;

  const filterDefs: FilterDef[] = tab === 'onhand'
    ? [{ id: 'level', label: 'Quantity', value: level, onChange: setLevel, options: [{ value: 'ALL', label: 'Any quantity' }, { value: 'INSTOCK', label: 'In stock' }, { value: 'REORDER', label: 'At reorder level' }] },
      { id: 'asof', label: 'Stock date', value: asOf || 'NOW', onChange: (v) => { setAsOf(v === 'NOW' ? '' : v); setSelection({}); }, options: [{ value: 'NOW', label: 'Stock now' }, ...monthEnds().map((d) => ({ value: d, label: `At ${formatDate(d)}` }))] }]
    : tab === 'entries' ? [
      { id: 'kind', label: 'Entry', value: kind, onChange: setKind, options: [{ value: 'ALL', label: 'All entries' }, ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))] },
      { id: 'part', label: 'Part', value: partFilter, onChange: setPartFilter, options: [{ value: 'ALL', label: 'Any part' }, ...stockRows.map((r) => ({ value: String(r.id), label: r.part_no }))] },
    ] : [];

  const exportCsv = () => {
    if (tab === 'onhand') downloadCsv(`stock-on-hand${asOf ? `-${asOf}` : ''}.csv`, toCsv(['part_no', 'name', 'quantity', 'unit', 'average_cost', 'value', 'reorder_level'], (rows as StockBalanceRow[]).map((r) => [r.part_no, r.name, r.quantity, r.uom, r.avg_cost, r.value, r.reorder_level ?? ''])));
    else downloadCsv('stock-entries.csv', toCsv(['date', 'entry', 'part_no', 'quantity', 'unit', 'unit_cost', 'value', 'job', 'reference', 'reason'], (rows as StockMoveRow[]).map((r) => [r.moved_on, KIND_LABEL[r.kind], r.part_no, r.quantity, r.uom, r.unit_cost, r.value, r.job ?? '', r.reference ?? '', r.reason ?? ''])));
  };
  const loading = tab === 'onhand' ? onHand.isLoading : tab === 'entries' ? moves.isLoading : counts.isLoading;
  const empty = tab === 'onhand' ? (canRecord ? 'No stock parts yet. Click Add stock part and choose a part from the Part master.' : 'No stock parts yet.') : tab === 'entries' ? 'No stock entries yet.' : 'No stock counts yet.';

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<Tab> value={tab} onChange={switchTab} tabs={TABS} />
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1">
        <ModuleShell
          showPanel={!!selected}
          searchRow={<DataTableToolbar key={tab} table={table} filterDefs={filterDefs} onExport={tab === 'counts' ? undefined : exportCsv} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>} />}
          intelligencePanel={
            <ModuleIntelligencePanel title={!selected ? 'Summary' : tab === 'onhand' ? 'Part' : tab === 'entries' ? 'Entry' : 'Count'} onClose={() => setSelection({})} hasSelection={!!selected} idle={summary} footer={itemActions.length ? <DetailActions actions={itemActions.slice(0, 3)} /> : undefined}>
              {detail}
            </ModuleIntelligencePanel>
          }
        >
          <DataTable isLoading={loading} columns={columns} data={rows} tableInstance={table} emptyMessage={empty} />
        </ModuleShell>
      </div>

      <StockSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} part={settingsFor} choices={choices} />
      <OpeningStockModal isOpen={!!openingFor} onClose={() => setOpeningFor(null)} part={openingFor} />
      <NewCountModal isOpen={newCount} onClose={() => setNewCount(false)} />
      <EnterCountsModal isOpen={countsFor != null} onClose={() => setCountsFor(null)} countId={countsFor} />
      <ConfirmDialog open={!!priceFor} title="Use average price" confirmLabel="Use average price"
        message={`Make ${money(priceFor?.avg_cost, currency)} the standard price of ${priceFor?.part_no}, in place of ${money(priceFor?.standard_price, currency)}? Live product costs are repriced. Approved standard costs change only when a new one is proposed and approved.`}
        onCancel={() => setPriceFor(null)} onConfirm={() => { const p = priceFor; setPriceFor(null); if (p) act(() => api.post(`/stock/items/${p.id}/use-average`, {}), 'Standard price updated.'); }} />
      <ConfirmDialog open={!!confirm} destructive={confirm?.step === 'delete'}
        title={confirm?.step === 'delete' ? 'Delete stock count' : confirm?.step === 'submit' ? 'Submit stock count' : 'Approve stock count'}
        confirmLabel={confirm?.step === 'delete' ? 'Delete' : confirm?.step === 'submit' ? 'Submit' : 'Approve'}
        message={confirm?.step === 'delete' ? `Delete the ${confirm.row.label} count? Nothing has been posted.` : confirm?.step === 'submit' ? `Send the ${confirm?.row.label} count to Finance for approval?` : `Approve the ${confirm?.row.label} count? Each difference is posted to Workshop and the quantities on hand change to what was counted. Add any missed stock used to its job first.`}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm; setConfirm(null); if (!c) return;
          if (c.step === 'delete') { setSelection({}); act(() => api.delete(`/stock/counts/${c.row.id}`), 'Stock count deleted.'); }
          else if (c.step === 'submit') act(() => api.post(`/stock/counts/${c.row.id}/submit`, {}), 'Count submitted.');
          else act(() => api.post(`/stock/counts/${c.row.id}/decision`, { decision: 'approve' }), 'Count approved.');
        }} />
      <SendBackCountModal isOpen={!!sendBack} onClose={() => setSendBack(null)} count={sendBack} />
    </div>
  );
}
