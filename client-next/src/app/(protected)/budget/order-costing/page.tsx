'use client';

import { canPropose } from '@/lib/permissions';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { FolderOpen, PackageOpen, Rocket, Undo2 } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/currency';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { ORDER_STATUS, useBuildOrder, useBuildOrders, type BuildOrderRow, type BuildOrderStatus } from '@/hooks/use-build-orders';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { DateCell, IdCell, TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { OrderStepModal, ReimportOrderBomModal, type OrderStep } from '@/components/budgets/build-order-modals';
import { TabBar, money, plain, unitPlain, unitPrice, useTabParam } from '@/components/budgets/budget-ui';
import { BuildCashView } from '@/components/budgets/build-cash-view';

const Whole = ({ value, currency, unit }: { value: number | null; currency: string; unit?: boolean }) => (
  <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{value == null ? '—' : unit ? unitPlain(value, currency) : plain(value, currency)}</div>
);
const monthLabel = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' });
const CSV_HEADERS = ['order', 'product', 'customer', 'customer_po', 'units', 'status', 'start', 'promised_delivery', 'delivered_on', 'unit_cost', 'unit_price', 'margin_pct'];

type ListTab = 'orders' | 'cash';
const LIST_TABS = ['orders', 'cash'] as const;
type Show = 'ACTIVE' | 'ALL' | BuildOrderStatus;
const isOpen = (s: BuildOrderStatus) => s === 'COMMITTED' || s === 'RELEASED';

// One word for where an order stands, worst first. Late: the parts cannot all arrive by the promised date.
const orderVerdict = (r: BuildOrderRow): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted'; rank: number; reason: string } => {
  if (r.margin_pct != null && r.margin_pct < 0) return { label: 'Loss', tone: 'danger', rank: 0, reason: `Margin is negative (${r.margin_pct.toFixed(1)}%).` };
  if (isOpen(r.status) && r.has_bom && r.late) return { label: 'Late', tone: 'danger', rank: 1, reason: 'The parts cannot all arrive in time for the promised delivery.' };
  if (isOpen(r.status) && !r.has_bom) return { label: 'No BOM', tone: 'warning', rank: 2, reason: 'The standard BOM is not imported, so the order is not costed.' };
  if (isOpen(r.status) && r.has_bom) return { label: 'On time', tone: 'success', rank: 3, reason: 'The parts can arrive in time.' };
  return { label: ORDER_STATUS[r.status].label, tone: 'muted', rank: r.status === 'IN_BUILD' ? 4 : 5, reason: '' };
};
// Days between the earliest the parts allow and the promised date. Negative means the promise cannot be kept.
const sparedays = (r: BuildOrderRow): number | null => {
  if (!isOpen(r.status) || !r.has_bom || !r.earliest_delivery) return null;
  return Math.round((new Date(r.delivery_date).getTime() - new Date(r.earliest_delivery).getTime()) / 86400000);
};

export default function BuildOrdersPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const canEdit = useAuthStore((s) => canPropose(s.user?.role_name));
  const invalidate = useInvalidate();
  const { data, isLoading } = useBuildOrders();
  // Worst first, so the orders that need attention are at the top
  const [sorting, setSorting] = useState<SortingState>([{ id: 'verdict', desc: false }]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [show, setShow] = useState<Show>('ACTIVE'); const [product, setProduct] = useState('ALL'); const [customer, setCustomer] = useState('ALL');
  const [listTab, setListTab] = useTabParam<ListTab>(LIST_TABS, 'orders');
  const [step, setStep] = useState<OrderStep | null>(null); const [lastStep, setLastStep] = useState<OrderStep>('release');
  const router = useRouter(); const [reimport, setReimport] = useState<BuildOrderRow | null>(null);
  useEffect(() => { setHeader('Order costing', 'BOM, cost, margin and cash timing of customer orders'); }, [setHeader]);

  const products = useMemo(() => [...new Map((data ?? []).map((r) => [r.product_id, r.product_name ?? ''])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data]);
  const customers = useMemo(() => [...new Set((data ?? []).map((r) => r.client_name).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b)), [data]);
  const rows = useMemo(() => (data ?? []).filter((r) =>
    (show === 'ALL' || (show === 'ACTIVE' ? ['COMMITTED', 'RELEASED', 'IN_BUILD'].includes(r.status) : r.status === show))
    && (product === 'ALL' || String(r.product_id) === product)
    && (customer === 'ALL' || r.client_name === customer)), [data, show, product, customer]);

  const columns = useMemo<ColumnDef<BuildOrderRow, any>[]>(() => [
    { accessorKey: 'code', header: 'Order', cell: ({ row }) => <IdCell value={row.original.code} />, size: 100 },
    { accessorKey: 'product_name', header: 'Product', cell: ({ row }) => <TextCell value={row.original.product_name} strong className="block max-w-[200px] truncate" />, size: 210 },
    { accessorKey: 'client_name', header: 'Customer', cell: ({ row }) => <TextCell value={row.original.client_name} muted className="block max-w-[150px] truncate" />, size: 160 },
    { accessorKey: 'quantity', header: headerRight('Units'), cell: ({ row }) => <div className="text-right"><TextCell value={row.original.quantity} /></div>, size: 70 },
    { accessorKey: 'delivery_date', header: 'Promised delivery', cell: ({ row }) => <DateCell value={row.original.delivery_date} />, size: 140 },
    {
      id: 'spare', header: headerRight('Days spare'), size: 100, sortUndefined: 'last', accessorFn: (r) => sparedays(r) ?? undefined,
      cell: ({ row }) => { const n = sparedays(row.original); return <div className="text-right"><ToneText label={n == null ? '—' : `${n} d`} tone={n == null ? 'muted' : n < 0 ? 'danger' : 'muted'} /></div>; },
    },
    {
      accessorKey: 'margin_pct', header: headerRight('Margin'), size: 90, sortUndefined: 'last',
      cell: ({ row }) => { const m = row.original.margin_pct; return <div className="text-right"><ToneText label={m == null ? '—' : `${m.toFixed(1)}%`} tone={m != null && m < 0 ? 'danger' : 'muted'} /></div>; },
    },
    // Only the lifecycle status here; the verdict (late, no BOM, loss) is on the side panel
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <ToneText label={ORDER_STATUS[row.original.status].label} tone={ORDER_STATUS[row.original.status].tone} />, size: 120 },
    // Hidden: the verdict still drives the default sort, worst first
    { id: 'verdict', header: 'Verdict', size: 130, accessorFn: (r) => orderVerdict(r).rank, cell: () => null, enableHiding: true },
  ], [currency]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection, columnVisibility: { verdict: false } }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getColumnCanGlobalFilter: () => true, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const detailQ = useBuildOrder(selected?.id ?? null);
  const detail = detailQ.data && detailQ.data.id === selected?.id ? detailQ.data : null;

  const act = async (job: () => Promise<unknown>, ok: string) => {
    try { await job(); toast.success(ok); invalidate('budgets'); } catch (e: any) { toast.error(e?.message || 'Could not save.'); }
  };
  const importBom = (r: BuildOrderRow) => act(() => api.post(`/build-orders/${r.id}/import-bom`, {}), 'Standard BOM imported and the order costed.');

  // Anyone who can see the list can open an order; the BOM steps are for Finance and Admin. Orders are added and edited on Manage > Order
  const openAction: DetailActionDef[] = selected ? [{ label: 'Open', icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(`/budget/order-costing/${selected.id}`) }] : [];
  const changeActions: DetailActionDef[] = !selected || !canEdit ? [] : [
    ...(selected.status === 'COMMITTED' && selected.has_bom ? [{ label: 'Reimport BOM', icon: <PackageOpen className="h-4 w-4 text-[var(--nav-cyan)]" />, onClick: () => setReimport(selected) }] : []),
    ...(selected.status === 'COMMITTED' && !selected.has_bom ? [{ label: 'Import BOM', variant: 'primary' as const, icon: <PackageOpen className="h-4 w-4 text-[var(--nav-cyan)]" />, onClick: () => importBom(selected) }] : []),
    ...(selected.status === 'COMMITTED' && selected.has_bom ? [{ label: 'Release', variant: 'primary' as const, icon: <Rocket className="h-4 w-4 text-[var(--nav-indigo)]" />, onClick: () => openStep('release') }] : []),
    ...(selected.status === 'RELEASED' ? [{ label: 'Reopen', icon: <Undo2 className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => openStep('reopen') }] : []),
  ];
  // The toolbar keeps the order of a workflow (Open, Import BOM, Release…); the panel puts the main action first
  const itemActions: DetailActionDef[] = [...openAction, ...changeActions];
  const panelActions: DetailActionDef[] = [...changeActions.filter((a) => a.variant === 'primary'), ...openAction, ...changeActions.filter((a) => a.variant !== 'primary')].slice(0, 3);
  const openStep = (s: OrderStep) => { setLastStep(s); setStep(s); };
  const exportOrders = () => downloadCsv('order-costing.csv', toCsv(CSV_HEADERS, (data ?? []).map((r) => [r.code, r.product_name ?? '', r.client_name ?? '', r.customer_po ?? '', r.quantity, ORDER_STATUS[r.status].label, r.start_date.slice(0, 10), r.delivery_date.slice(0, 10), r.delivered_on?.slice(0, 10) ?? '', r.unit_cost ?? '', r.unit_price ?? '', r.margin_pct ?? ''])));

  const live = (data ?? []).filter((r) => ['COMMITTED', 'RELEASED', 'IN_BUILD'].includes(r.status));
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="All orders" subtitle="Cost and margin of customer orders" figure={live.length} figureLabel="Open orders" />
      <DetailSection title="Where they are">
        <DetailGrid>
          <DetailField label="Committed" value={live.filter((r) => r.status === 'COMMITTED').length} />
          <DetailField label="Released" value={live.filter((r) => r.status === 'RELEASED').length} />
          <DetailField label="In build" value={live.filter((r) => r.status === 'IN_BUILD').length} />
          <DetailField label="Cannot arrive in time" value={live.filter((r) => r.late).length} tone={live.some((r) => r.late) ? 'danger' : 'muted'} />
          <DetailField label="Open order value" value={money(live.reduce((a, r) => a + (r.total_value ?? 0), 0), currency)} wide />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Open an order for its parts, cost and cash timing. Days spare is how long the promised date can slip before parts are late.</p>
    </div>
  );

  const d = detail;
  // The margin the order would have if it were costed again at today's part prices
  const liveMargin = selected && d && d.live_unit_cost != null && selected.unit_price && d.cost_drift != null && Math.abs(d.cost_drift) >= 0.005 && isOpen(d.status)
    ? ((selected.unit_price - d.live_unit_cost) / selected.unit_price) * 100 : null;
  const panel = !selected ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.code} subtitle={`${selected.product_name ?? ''} · ${selected.client_name ?? ''}`} status={ORDER_STATUS[selected.status].label}
        statusClass={{ success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', info: 'text-[var(--info)]', muted: 'text-[var(--shell-text-muted)]' }[ORDER_STATUS[selected.status].tone]}
        figure={selected.total_value != null ? plain(selected.total_value, currency) : selected.total_cost != null ? plain(selected.total_cost, currency) : undefined} figureLabel={selected.total_value != null ? 'Order value' : 'Order cost'} />
      <p className="text-[13px] text-[var(--shell-text-muted)]">{orderVerdict(selected).label}. {orderVerdict(selected).reason}</p>
      <DetailSection title="Schedule">
        <DetailGrid>
          <DetailField label="Units" value={selected.quantity} />
          <DetailField label="Customer PO" value={selected.customer_po ?? undefined} />
          <DetailField label="Start" value={formatDate(selected.start_date)} />
          <DetailField label="Promised delivery" value={formatDate(selected.delivery_date)} />
          {selected.delivered_on && <DetailField label="Delivered" value={formatDate(selected.delivered_on)} wide />}
        </DetailGrid>
      </DetailSection>
      {d && isOpen(d.status) && d.has_bom && (
        <DetailSection title="Parts and dates">
          {d.lead.late ? (
            <p className="text-[13px] text-[var(--danger)]">The parts cannot all arrive in time. The longest lead time is {d.lead.longest_lead_days} days and the build needs about {d.lead.assembly_days}, against {d.lead.window_days} days between the dates. The earliest delivery is {formatDate(d.lead.earliest_delivery)}.</p>
          ) : (
            <p className="text-[13px] text-[var(--shell-text)]">The parts can arrive in time: longest lead time {d.lead.longest_lead_days} days, build about {d.lead.assembly_days} days, {d.lead.window_days} days available.</p>
          )}
          {d.lead.late_lines.length > 0 && (
            <ul className="space-y-1">
              {d.lines.filter((l) => d.lead.late_lines.includes(l.id)).map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-[var(--shell-text)]">{l.part_no} {l.name}</span>
                  <span className="shrink-0 tabular-nums text-[var(--warning)]">{l.lead_time_days} d{l.alternates.some((a) => (a.lead_time_days ?? 0) + l.tail_days <= d.lead.window_days) ? ' · an alternate fits' : ''}</span>
                </li>
              ))}
            </ul>
          )}
          {d.lead.missing_lead_time > 0 && <p className="text-[12px] text-[var(--shell-text-muted)]">{d.lead.missing_lead_time} part{d.lead.missing_lead_time === 1 ? ' has' : 's have'} no lead time on the Part master, so {d.lead.missing_lead_time === 1 ? 'it counts' : 'they count'} as zero.</p>}
        </DetailSection>
      )}
      <DetailSection title="Cost and margin">
        {!selected.has_bom ? <p className="text-[12px] text-[var(--shell-text-muted)]">{selected.status === 'COMMITTED' ? 'Import the standard BOM to cost this order.' : 'No BOM was imported.'}</p> : (
          <DetailGrid>
            <DetailField label="Cost per unit" value={selected.unit_cost != null ? unitPrice(selected.unit_cost, currency) : undefined} />
            <DetailField label="Standard at import" value={selected.source_standard_cost != null ? unitPrice(selected.source_standard_cost, currency) : undefined} />
            <DetailField label="Against standard" value={selected.vs_standard != null ? `${selected.vs_standard > 0 ? '+' : ''}${unitPrice(selected.vs_standard, currency)}` : undefined} tone={selected.vs_standard == null || selected.vs_standard === 0 ? 'muted' : selected.vs_standard > 0 ? 'danger' : 'success'} />
            <DetailField label="Selling price" value={selected.unit_price != null ? unitPrice(selected.unit_price, currency) : undefined} />
            <DetailField label="Margin" value={selected.margin_pct != null ? `${selected.margin_pct.toFixed(1)}%` : undefined} tone={selected.margin_pct != null && selected.margin_pct < 0 ? 'danger' : 'muted'} />
            <DetailField label="Order cost" value={selected.total_cost != null ? money(selected.total_cost, currency) : undefined} />
            {liveMargin != null && <DetailField label="Margin at today's part prices" value={`${liveMargin.toFixed(1)}%`} tone={liveMargin < 0 ? 'danger' : 'warning'} wide />}
          </DetailGrid>
        )}
        {d && d.cost_drift != null && Math.abs(d.cost_drift) >= 0.005 && isOpen(d.status) && (
          <p role={liveMargin != null && liveMargin < 0 ? 'alert' : undefined} className={liveMargin != null && liveMargin < 0 ? 'text-[12px] text-[var(--danger)]' : 'text-[12px] text-[var(--warning)]'}>Part prices have moved by {unitPrice(d.cost_drift, currency)} per unit since this was costed{liveMargin != null && liveMargin < 0 ? ', and at today\'s prices the order makes a loss' : ''}. Recost to update it.</p>
        )}
        {selected.source_bom_version != null && <p className="text-[12px] text-[var(--shell-text-muted)]">Copied from BOM version {selected.source_bom_version}{selected.imported_at ? ` on ${formatDate(selected.imported_at)}` : ''}.</p>}
      </DetailSection>
      {d && (
        <DetailSection title="Build plan">
          <DetailGrid>
            <DetailField label={`Planned, ${monthLabel(d.plan.year, d.plan.month)}`} value={d.plan.planned} />
            <DetailField label="Taken by orders" value={d.plan.taken} />
            <DetailField label="Left in the plan" value={d.plan.open} tone={d.plan.over ? 'danger' : 'muted'} wide />
          </DetailGrid>
          {d.plan.over && <p className="text-[12px] text-[var(--warning)]">Orders starting this month take more units than the plan allows. Raise the plan on the product, or move a start date.</p>}
        </DetailSection>
      )}
      {selected.notes && <DetailSection title="Notes"><p className="text-[13px] text-[var(--shell-text)]">{selected.notes}</p></DetailSection>}
      {selected.cancel_reason && <DetailSection title="Cancelled"><p className="text-[13px] text-[var(--shell-text)]">{selected.cancel_reason}</p></DetailSection>}
    </div>
  );

  const filterDefs: FilterDef[] = [
    { id: 'show', label: 'Order status', value: show, onChange: (v) => setShow(v as Show), options: [{ value: 'ACTIVE', label: 'Open orders' }, { value: 'ALL', label: 'All orders' }, ...(Object.keys(ORDER_STATUS) as BuildOrderStatus[]).map((s) => ({ value: s, label: ORDER_STATUS[s].label }))] },
    { id: 'product', label: 'Product', value: product, onChange: setProduct, options: [{ value: 'ALL', label: 'All products' }, ...products.map(([id, name]) => ({ value: String(id), label: name }))] },
    { id: 'customer', label: 'Customer', value: customer, onChange: setCustomer, options: [{ value: 'ALL', label: 'All customers' }, ...customers.map((c) => ({ value: c, label: c }))] },
  ];

  const ordersView = (
    <ModuleShell
      showPanel={!!selected}
      searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} onExport={exportOrders} actions={<><ToolbarActions actions={itemActions} /></>} />}
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Order' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected}
          idle={summary} footer={panelActions.length ? <DetailActions actions={panelActions} /> : undefined}>
          {panel}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage="No orders match. Orders are added on Manage > Order." />
      <OrderStepModal isOpen={step != null} onClose={() => setStep(null)} order={detail} step={step ?? lastStep} />
      <ReimportOrderBomModal isOpen={!!reimport} onClose={() => setReimport(null)} order={reimport} />
    </ModuleShell>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<ListTab> value={listTab} onChange={setListTab} tabs={[{ value: 'orders', label: 'Orders' }, { value: 'cash', label: 'Cash timing' }]} />
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${listTab}`} className="min-h-0 flex-1">{listTab === 'orders' ? ordersView : <BuildCashView />}</div>
    </div>
  );
}
