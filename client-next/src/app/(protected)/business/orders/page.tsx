'use client';

import { canPropose, isFinanceRole } from '@/lib/permissions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Ban, CircleCheck, Copy, FolderOpen, Hammer, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { DateCell, IdCell, TextCell, ToneText, WholeCell, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { BillingSection } from '@/components/invoicing/billing-section';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { BuildOrderModal, CancelOrderModal, OrderStepModal } from '@/components/budgets/build-order-modals';
import { TabBar, money, plain, unitPrice, useTabParam } from '@/components/budgets/budget-ui';
import { BuildCashView } from '@/components/budgets/build-cash-view';

const monthLabel = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' });
const CSV_HEADERS = ['order', 'product', 'customer', 'customer_po', 'units', 'status', 'start', 'promised_delivery', 'delivered_on', 'unit_cost', 'unit_price', 'order_value', 'margin_pct'];
const LIVE: BuildOrderStatus[] = ['COMMITTED', 'RELEASED', 'IN_BUILD'];
const OPEN: BuildOrderStatus[] = ['COMMITTED', 'RELEASED'];
const TONE_CLASS = { success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', info: 'text-[var(--info)]', muted: 'text-[var(--shell-text-muted)]' } as const;
// What the person does next, in the words of this page
const NEXT: Record<BuildOrderStatus, string> = {
  COMMITTED: 'Open the order to import the product BOM, check the price and release it. Until then you can still edit or delete it.',
  RELEASED: 'The BOM is locked. Start the build when work begins. To change the BOM first, open the order and reopen it.',
  IN_BUILD: 'The order is being built. Deliver it when it ships; it can no longer change after that.',
  DELIVERED: 'Delivered. The margin shown is the real one.',
  CANCELLED: 'Cancelled. Its units go back to the build plan.',
};

type ListTab = 'orders' | 'cash';
const LIST_TABS = ['orders', 'cash'] as const;
type Show = 'ACTIVE' | 'ALL' | BuildOrderStatus;

// One word for where an order stands, worst first. Late: the parts cannot all arrive by the promised date.
const orderVerdict = (r: BuildOrderRow): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted'; rank: number; reason: string } => {
  if (r.margin_pct != null && r.margin_pct < 0) return { label: 'Loss', tone: 'danger', rank: 0, reason: `Margin is negative (${r.margin_pct.toFixed(1)}%).` };
  if (OPEN.includes(r.status) && r.has_bom && r.late) return { label: 'Late', tone: 'danger', rank: 1, reason: 'The parts cannot all arrive in time for the promised delivery.' };
  if (OPEN.includes(r.status) && !r.has_bom) return { label: 'No BOM', tone: 'warning', rank: 2, reason: 'The standard BOM is not imported, so the order is not costed.' };
  if (OPEN.includes(r.status) && r.has_bom) return { label: 'On time', tone: 'success', rank: 3, reason: 'The parts can arrive in time.' };
  return { label: ORDER_STATUS[r.status].label, tone: 'muted', rank: r.status === 'IN_BUILD' ? 4 : 5, reason: '' };
};
// Days between the earliest the parts allow and the promised date. Negative means the promise cannot be kept.
const spareDays = (r: BuildOrderRow): number | null => (!OPEN.includes(r.status) || !r.has_bom || !r.earliest_delivery ? null : Math.round((new Date(r.delivery_date).getTime() - new Date(r.earliest_delivery).getTime()) / 86400000));

export default function OrdersPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const canEdit = useAuthStore((s) => canPropose(s.user?.role_name));
  const isFinance = useAuthStore((s) => isFinanceRole(s.user?.role_name)); // delivering and cancelling an order are Finance decisions
  const invalidate = useInvalidate();
  const router = useRouter();
  const { data, isLoading } = useBuildOrders();
  // Worst first, so the orders that need attention are at the top
  const [sorting, setSorting] = useState<SortingState>([{ id: 'verdict', desc: false }]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [show, setShow] = useState<Show>('ACTIVE'); const [product, setProduct] = useState('ALL'); const [customer, setCustomer] = useState('ALL');
  const [listTab, setListTab] = useTabParam<ListTab>(LIST_TABS, 'orders');
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<BuildOrderRow | null>(null); const [copyFrom, setCopyFrom] = useState<BuildOrderRow | null>(null);
  const [startOpen, setStartOpen] = useState(false); const [cancelFor, setCancelFor] = useState<BuildOrderRow | null>(null);
  const [del, setDel] = useState<BuildOrderRow | null>(null); const [deliver, setDeliver] = useState<BuildOrderRow | null>(null);
  useEffect(() => { setHeader('Orders', 'Customer orders: BOM, cost, margin and delivery'); }, [setHeader]);

  const products = useMemo(() => [...new Map((data ?? []).map((r) => [r.product_id, r.product_name ?? ''])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data]);
  const customers = useMemo(() => [...new Set((data ?? []).map((r) => r.client_name).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b)), [data]);
  const rows = useMemo(() => (data ?? []).filter((r) =>
    (show === 'ALL' || (show === 'ACTIVE' ? LIVE.includes(r.status) : r.status === show))
    && (product === 'ALL' || String(r.product_id) === product)
    && (customer === 'ALL' || r.client_name === customer)), [data, show, product, customer]);

  const columns = useMemo<ColumnDef<BuildOrderRow, any>[]>(() => [
    { accessorKey: 'code', header: 'Order', cell: ({ row }) => <IdCell value={row.original.code} />, size: 100 },
    {
      accessorKey: 'product_name', header: 'Product',
      // Customer and PO as the second line: the table stays within the space beside the panel
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[210px]">
          <TextCell value={row.original.product_name} strong className="block truncate" />
          <TextCell value={[row.original.client_name, row.original.customer_po && `PO ${row.original.customer_po}`].filter(Boolean).join(' · ')} muted className="block truncate text-[12px]" />
        </div>
      ),
    },
    { accessorKey: 'quantity', header: headerRight('Units'), cell: ({ row }) => <div className="text-right"><TextCell value={row.original.quantity} /></div>, size: 70 },
    { accessorKey: 'delivery_date', header: 'Promised', cell: ({ row }) => <DateCell value={row.original.delivery_date} />, size: 110 },
    {
      id: 'spare', header: headerRight('Days spare'), size: 100, sortUndefined: 'last', accessorFn: (r) => spareDays(r) ?? undefined,
      cell: ({ row }) => { const n = spareDays(row.original); return <div className="text-right"><ToneText label={n == null ? '—' : `${n} d`} tone={n != null && n < 0 ? 'danger' : 'muted'} /></div>; },
    },
    { accessorKey: 'total_value', header: headerRight('Order value'), cell: ({ row }) => <WholeCell symbol value={row.original.total_value} currency={currency} />, size: 120 },
    {
      accessorKey: 'margin_pct', header: headerRight('Margin'), size: 90, sortUndefined: 'last',
      cell: ({ row }) => { const m = row.original.margin_pct; return <div className="text-right"><ToneText label={m == null ? '—' : `${m.toFixed(1)}%`} tone={m != null && m < 0 ? 'danger' : 'muted'} /></div>; },
    },
    {
      id: 'verdict', header: 'Status', size: 120, accessorFn: (r) => orderVerdict(r).rank,
      // The verdict leads for open orders; the lifecycle step sits under it
      cell: ({ row }) => {
        const v = orderVerdict(row.original);
        return (
          <div>
            <ToneText label={v.label} tone={v.tone} />
            {OPEN.includes(row.original.status) && <span className="block text-[12px] text-[var(--shell-text-muted)]">{ORDER_STATUS[row.original.status].label}</span>}
          </div>
        );
      },
    },
  ], [currency]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getColumnCanGlobalFilter: () => true, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  // /business/orders?id=7 opens the list with that order selected (other pages link here)
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !data?.length) return;
    const wanted = Number(new URLSearchParams(window.location.search).get('id'));
    if (!wanted) return;
    linked.current = true;
    if (data.some((r) => r.id === wanted)) {
      // an order the open-orders filter hides is shown by widening the filter
      if (!rows.some((r) => r.id === wanted)) setShow('ALL');
      setSelection({ [String(wanted)]: true });
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const detailQ = useBuildOrder(selected?.id ?? null);
  const detail = detailQ.data && detailQ.data.id === selected?.id ? detailQ.data : null;

  const act = async (job: () => Promise<unknown>, ok: string) => {
    try { await job(); toast.success(ok); invalidate('budgets'); } catch (e: any) { toast.error(e?.message || 'Could not save.'); }
  };

  // Nothing selected: only Add order. A selected order shows what is valid for where it stands.
  const alwaysActions: DetailActionDef[] = canEdit ? [{ label: 'Add order', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditing(null); setCopyFrom(null); setFormOpen(true); } }] : [];
  const openAction: DetailActionDef[] = selected ? [{ label: 'Open', variant: selected.status === 'COMMITTED' ? 'primary' as const : undefined, icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(`/business/orders/${selected.id}`) }] : [];
  // Changing an order is for Finance, Operations and Admin; Deliver and Cancel are for Finance and Admin
  const changeActions: DetailActionDef[] = !selected || !canEdit ? [] : [
    ...(selected.status === 'RELEASED' ? [{ label: 'Start build', variant: 'primary' as const, icon: <Hammer className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setStartOpen(true) }] : []),
    ...(selected.status === 'IN_BUILD' && isFinance ? [{ label: 'Deliver', variant: 'primary' as const, icon: <CircleCheck className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setDeliver(selected) }] : []),
    ...((selected.status === 'RELEASED' || selected.status === 'IN_BUILD') && isFinance ? [{ label: 'Cancel order', icon: <Ban className="h-4 w-4 text-[var(--nav-rose)]" />, onClick: () => setCancelFor(selected) }] : []),
    { label: 'Copy', icon: <Copy className="h-4 w-4 text-[var(--nav-purple)]" />, onClick: () => { setEditing(null); setCopyFrom(selected); setFormOpen(true); } },
    ...(OPEN.includes(selected.status) ? [{ label: 'Edit', icon: <Pencil className="h-4 w-4 text-[var(--info)]" />, onClick: () => { setCopyFrom(null); setEditing(selected); setFormOpen(true); } }] : []),
    ...(selected.status === 'COMMITTED' ? [{ label: 'Delete', variant: 'danger' as const, icon: <Trash2 className="h-4 w-4 text-[var(--danger)]" />, onClick: () => setDel(selected) }] : []),
  ];
  // The toolbar keeps the order of a workflow (Open, then the steps); the panel puts the main action first
  const itemActions: DetailActionDef[] = [...openAction, ...changeActions];
  const panelActions: DetailActionDef[] = [...changeActions.filter((a) => a.variant === 'primary'), ...openAction, ...changeActions.filter((a) => a.variant !== 'primary' && a.label !== 'Edit' && a.label !== 'Copy'), ...changeActions.filter((a) => a.label === 'Edit')].slice(0, 3);
  const exportOrders = () => downloadCsv('orders.csv', toCsv(CSV_HEADERS, (data ?? []).map((r) => [r.code, r.product_name ?? '', r.client_name ?? '', r.customer_po ?? '', r.quantity, ORDER_STATUS[r.status].label, r.start_date.slice(0, 10), r.delivery_date.slice(0, 10), r.delivered_on?.slice(0, 10) ?? '', r.unit_cost ?? '', r.unit_price ?? '', r.total_value ?? '', r.margin_pct ?? ''])));

  const live = (data ?? []).filter((r) => LIVE.includes(r.status));
  const nextDelivery = [...live].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))[0];
  // Margin of the open orders together, weighted by value, over the orders that have both a cost and a price
  const costed = live.filter((r) => r.total_value != null && r.total_cost != null && r.total_value > 0);
  const openValue = costed.reduce((a, r) => a + (r.total_value ?? 0), 0);
  const openMargin = openValue > 0 ? ((openValue - costed.reduce((a, r) => a + (r.total_cost ?? 0), 0)) / openValue) * 100 : null;
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="Open orders" subtitle="From commitment to delivery" figure={live.length} figureLabel="Orders" />
      <DetailSection title="Needs a look">
        <DetailGrid>
          <DetailField label="Late" value={live.filter((r) => orderVerdict(r).label === 'Late').length} tone={live.some((r) => orderVerdict(r).label === 'Late') ? 'danger' : 'muted'} />
          <DetailField label="At a loss" value={live.filter((r) => r.margin_pct != null && r.margin_pct < 0).length} tone={live.some((r) => r.margin_pct != null && r.margin_pct < 0) ? 'danger' : 'muted'} />
          <DetailField label="No BOM yet" value={live.filter((r) => !r.has_bom).length} tone={live.some((r) => !r.has_bom) ? 'warning' : 'muted'} />
          <DetailField label="Next promised" value={nextDelivery ? `${nextDelivery.code}, ${formatDate(nextDelivery.delivery_date)}` : undefined} wide />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="Where they are">
        <DetailGrid>
          <DetailField label="Committed" value={live.filter((r) => r.status === 'COMMITTED').length} />
          <DetailField label="Released" value={live.filter((r) => r.status === 'RELEASED').length} />
          <DetailField label="In build" value={live.filter((r) => r.status === 'IN_BUILD').length} />
          <DetailField label="Open order value" value={money(live.reduce((a, r) => a + (r.total_value ?? 0), 0), currency)} />
          <DetailField label="Margin on open orders" value={openMargin != null ? `${openMargin.toFixed(1)}%` : undefined} tone={openMargin != null && openMargin < 0 ? 'danger' : 'muted'} wide />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Select an order to act on it, or open it for its parts, cost and cash timing. Days spare is how long the promised date can slip before parts are late.</p>
    </div>
  );

  const d = detail;
  // The margin the order would have if it were costed again at today's part prices
  const liveMargin = selected && d && d.live_unit_cost != null && selected.unit_price && d.cost_drift != null && Math.abs(d.cost_drift) >= 0.005 && OPEN.includes(d.status)
    ? ((selected.unit_price - d.live_unit_cost) / selected.unit_price) * 100 : null;
  const panel = !selected ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.code} subtitle={`${selected.product_name ?? ''} · ${selected.client_name ?? ''}`} status={ORDER_STATUS[selected.status].label}
        statusClass={TONE_CLASS[ORDER_STATUS[selected.status].tone]}
        figure={selected.total_value != null ? plain(selected.total_value, currency) : selected.total_cost != null ? plain(selected.total_cost, currency) : undefined} figureLabel={selected.total_value != null ? 'Order value' : 'Order cost'} />
      {orderVerdict(selected).reason && <p className="text-[13px] text-[var(--shell-text-muted)]">{orderVerdict(selected).label}. {orderVerdict(selected).reason}</p>}
      <DetailSection title="Schedule">
        <DetailGrid>
          <DetailField label="Units" value={selected.quantity} />
          <DetailField label="Customer PO" value={selected.customer_po ?? undefined} />
          <DetailField label="Start" value={formatDate(selected.start_date)} />
          <DetailField label="Promised delivery" value={formatDate(selected.delivery_date)} />
          {selected.delivered_on && <DetailField label="Delivered" value={formatDate(selected.delivered_on)} wide />}
        </DetailGrid>
      </DetailSection>
      {d && OPEN.includes(d.status) && d.has_bom && (
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
        {d && d.cost_drift != null && Math.abs(d.cost_drift) >= 0.005 && OPEN.includes(d.status) && (
          <p role={liveMargin != null && liveMargin < 0 ? 'alert' : undefined} className={liveMargin != null && liveMargin < 0 ? 'text-[12px] text-[var(--danger)]' : 'text-[12px] text-[var(--warning)]'}>Part prices have moved by {unitPrice(d.cost_drift, currency)} per unit since this was costed{liveMargin != null && liveMargin < 0 ? ', and at today\'s prices the order makes a loss' : ''}. Open the order and recost to update it.</p>
        )}
        {selected.source_bom_version != null && <p className="text-[12px] text-[var(--shell-text-muted)]">Copied from BOM version {selected.source_bom_version}{selected.imported_at ? ` on ${formatDate(selected.imported_at)}` : ''}.</p>}
      </DetailSection>
      <BillingSection kind="order" id={selected.id} />
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
      <DetailSection title="What next">
        <p className="text-[13px] text-[var(--shell-text)]">{NEXT[selected.status]}</p>
      </DetailSection>
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
      searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} onExport={exportOrders} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>} />}
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Order' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected}
          idle={summary} footer={panelActions.length ? <DetailActions actions={panelActions} /> : undefined}>
          {panel}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={show === 'ACTIVE' ? (canEdit ? 'No open orders. Use Add order, or set the status filter to All orders to see delivered and cancelled ones.' : 'No open orders.') : 'No orders match the filters.'} />
      <BuildOrderModal isOpen={formOpen} onClose={() => setFormOpen(false)} editing={editing} copyFrom={copyFrom} />
      <OrderStepModal isOpen={startOpen} onClose={() => setStartOpen(false)} order={detail} step="start" />
      <CancelOrderModal isOpen={!!cancelFor} onClose={() => setCancelFor(null)} order={cancelFor} />
      <ConfirmDialog open={!!del} destructive title="Delete order" confirmLabel="Delete" message={`Delete ${del?.code}? It has not been released. Its BOM copy goes with it.`} onCancel={() => setDel(null)}
        onConfirm={() => { const r = del; setDel(null); if (!r) return; setSelection({}); act(() => api.delete(`/build-orders/${r.id}`), 'Order deleted.'); }} />
      <ConfirmDialog open={!!deliver} title="Mark as delivered" confirmLabel="Deliver" message={`Record ${deliver?.code} as delivered today, ${formatDate(new Date().toISOString())}? It can no longer change.`} onCancel={() => setDeliver(null)}
        onConfirm={() => { const r = deliver; setDeliver(null); if (r) act(() => api.post(`/build-orders/${r.id}/deliver`, {}), 'Order delivered.'); }} />
    </ModuleShell>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<ListTab> value={listTab} onChange={setListTab} tabs={[{ value: 'orders', label: 'Orders' }, { value: 'cash', label: 'Cash timing' }]} />
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${listTab}`} className="min-h-0 flex-1">{listTab === 'orders' ? ordersView : <BuildCashView />}</div>
    </div>
  );
}
