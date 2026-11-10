'use client';

import { canPropose, isFinanceRole } from '@/lib/permissions';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Ban, CircleCheck, FolderOpen, Hammer, Pencil, Plus } from 'lucide-react';
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
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { BuildOrderModal, CancelOrderModal, OrderStepModal } from '@/components/budgets/build-order-modals';
import { money, plain } from '@/components/budgets/budget-ui';

const Whole = ({ value, currency }: { value: number | null; currency: string }) => (
  <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{value == null ? '—' : money(value, currency)}</div>
);
const CSV_HEADERS = ['order', 'product', 'customer', 'customer_po', 'units', 'status', 'start', 'promised_delivery', 'delivered_on', 'unit_price', 'order_value'];
const LIVE: BuildOrderStatus[] = ['COMMITTED', 'RELEASED', 'IN_BUILD'];
const TONE_CLASS = { success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', info: 'text-[var(--info)]', muted: 'text-[var(--shell-text-muted)]' } as const;
// What the person does next, in the words of the page they will do it on
const NEXT: Record<BuildOrderStatus, string> = {
  COMMITTED: 'Open the costing to import the product BOM, check the price and release the order. Until then you can still edit or delete it.',
  RELEASED: 'The BOM is locked. Start the build when work begins. If something must change first, reopen the order from the costing.',
  IN_BUILD: 'The order is being built. Deliver it when it ships; it can no longer change after that.',
  DELIVERED: 'Delivered. The costing now shows the real margin.',
  CANCELLED: 'Cancelled. Its units go back to the build plan.',
};
type Show = 'ACTIVE' | 'ALL' | BuildOrderStatus;
const OPEN: BuildOrderStatus[] = ['COMMITTED', 'RELEASED'];

// One word for where an order stands, worst first. The same words as on Order costing.
const orderVerdict = (r: BuildOrderRow): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted'; rank: number } => {
  if (r.margin_pct != null && r.margin_pct < 0) return { label: 'Loss', tone: 'danger', rank: 0 };
  if (OPEN.includes(r.status) && r.has_bom && r.late) return { label: 'Late', tone: 'danger', rank: 1 };
  if (OPEN.includes(r.status) && !r.has_bom) return { label: 'No BOM', tone: 'warning', rank: 2 };
  if (OPEN.includes(r.status) && r.has_bom) return { label: 'On time', tone: 'success', rank: 3 };
  return { label: ORDER_STATUS[r.status].label, tone: 'muted', rank: r.status === 'IN_BUILD' ? 4 : 5 };
};
// Days the promised date can slip before the parts are late. Negative means the promise cannot be kept.
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
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<BuildOrderRow | null>(null);
  const [startOpen, setStartOpen] = useState(false); const [cancelFor, setCancelFor] = useState<BuildOrderRow | null>(null);
  const [del, setDel] = useState<BuildOrderRow | null>(null); const [deliver, setDeliver] = useState<BuildOrderRow | null>(null);
  useEffect(() => { setHeader('Orders', 'Customer orders, from commitment to delivery'); }, [setHeader]);

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
    { accessorKey: 'total_value', header: headerRight('Order value'), cell: ({ row }) => <Whole value={row.original.total_value} currency={currency} />, size: 120 },
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
  const selected = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const detailQ = useBuildOrder(selected?.id ?? null);
  const detail = detailQ.data && detailQ.data.id === selected?.id ? detailQ.data : null;

  const act = async (job: () => Promise<unknown>, ok: string) => {
    try { await job(); toast.success(ok); invalidate('budgets'); } catch (e: any) { toast.error(e?.message || 'Could not save.'); }
  };

  const alwaysActions: DetailActionDef[] = canEdit ? [{ label: 'Add order', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditing(null); setFormOpen(true); } }] : [];
  // Anyone who can see the list can open an order's costing; changing the order is for Finance and Admin
  // For a committed order the next step is in the costing (import the BOM, check the price, release), so it leads
  const openAction: DetailActionDef[] = selected ? [{ label: 'Open costing', variant: selected.status === 'COMMITTED' ? 'primary' as const : undefined, icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(`/budget/order-costing/${selected.id}`) }] : [];
  const changeActions: DetailActionDef[] = !selected || !canEdit ? [] : [
    ...(selected.status === 'COMMITTED' || selected.status === 'RELEASED' ? [{ label: 'Edit', icon: <Pencil className="h-4 w-4 text-[var(--info)]" />, onClick: () => { setEditing(selected); setFormOpen(true); } }] : []),
    ...(selected.status === 'RELEASED' ? [{ label: 'Start build', variant: 'primary' as const, icon: <Hammer className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setStartOpen(true) }] : []),
    ...(selected.status === 'IN_BUILD' && isFinance ? [{ label: 'Deliver', variant: 'primary' as const, icon: <CircleCheck className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setDeliver(selected) }] : []),
    ...((selected.status === 'RELEASED' || selected.status === 'IN_BUILD') && isFinance ? [{ label: 'Cancel order', icon: <Ban className="h-4 w-4 text-[var(--nav-rose)]" />, onClick: () => setCancelFor(selected) }] : []),
    ...(selected.status === 'COMMITTED' ? [{ label: 'Delete', variant: 'danger' as const, onClick: () => setDel(selected) }] : []),
  ];
  const itemActions: DetailActionDef[] = [...openAction, ...changeActions];
  // The panel puts the main action first, then the way into the costing
  // Edit goes last, so Cancel order and Delete are never the ones cut by the three-action limit
  const panelActions: DetailActionDef[] = [...changeActions.filter((a) => a.variant === 'primary'), ...openAction, ...changeActions.filter((a) => a.variant !== 'primary' && a.label !== 'Edit'), ...changeActions.filter((a) => a.label === 'Edit')].slice(0, 3);
  const exportOrders = () => downloadCsv('orders.csv', toCsv(CSV_HEADERS, (data ?? []).map((r) => [r.code, r.product_name ?? '', r.client_name ?? '', r.customer_po ?? '', r.quantity, ORDER_STATUS[r.status].label, r.start_date.slice(0, 10), r.delivery_date.slice(0, 10), r.delivered_on?.slice(0, 10) ?? '', r.unit_price ?? '', r.total_value ?? ''])));

  const live = (data ?? []).filter((r) => LIVE.includes(r.status));
  const nextDelivery = [...live].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))[0];
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="Open orders" subtitle="From commitment to delivery" figure={live.length} figureLabel="Orders" />
      <DetailSection title="Needs a look">
        <DetailGrid>
          <DetailField label="Late" value={live.filter((r) => orderVerdict(r).label === 'Late').length} tone={live.some((r) => orderVerdict(r).label === 'Late') ? 'danger' : 'muted'} />
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
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">BOM, cost, margin and release are on Order costing.</p>
    </div>
  );

  const d = detail;
  const panel = !selected ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.code} subtitle={`${selected.product_name ?? ''} · ${selected.client_name ?? ''}`} status={ORDER_STATUS[selected.status].label}
        statusClass={TONE_CLASS[ORDER_STATUS[selected.status].tone]}
        figure={selected.total_value != null ? money(selected.total_value, currency) : undefined} figureLabel="Order value" />
      <DetailSection title="Order">
        <DetailGrid>
          <DetailField label="Units" value={selected.quantity} />
          <DetailField label="Customer PO" value={selected.customer_po ?? undefined} />
          <DetailField label="Start" value={formatDate(selected.start_date)} />
          <DetailField label="Promised delivery" value={formatDate(selected.delivery_date)} />
          {selected.delivered_on && <DetailField label="Delivered" value={formatDate(selected.delivered_on)} wide />}
        </DetailGrid>
      </DetailSection>
      {d && (d.status === 'COMMITTED' || d.status === 'RELEASED') && d.has_bom && (
        <DetailSection title="Parts and dates">
          <p className={`text-[13px] ${d.lead.late ? 'text-[var(--danger)]' : 'text-[var(--shell-text)]'}`}>
            {d.lead.late
              ? `The parts cannot all arrive in time. The earliest delivery is ${formatDate(d.lead.earliest_delivery)}.`
              : `The parts can arrive in time: longest lead time ${d.lead.longest_lead_days} days, build about ${d.lead.assembly_days} days, ${d.lead.window_days} days available.`}
          </p>
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

  return (
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
      <BuildOrderModal isOpen={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      <OrderStepModal isOpen={startOpen} onClose={() => setStartOpen(false)} order={detail} step="start" />
      <CancelOrderModal isOpen={!!cancelFor} onClose={() => setCancelFor(null)} order={cancelFor} />
      <ConfirmDialog open={!!del} destructive title="Delete order" confirmLabel="Delete" message={`Delete ${del?.code}? It has not been released. Its BOM copy goes with it.`} onCancel={() => setDel(null)}
        onConfirm={() => { const r = del; setDel(null); if (!r) return; setSelection({}); act(() => api.delete(`/build-orders/${r.id}`), 'Order deleted.'); }} />
      <ConfirmDialog open={!!deliver} title="Mark as delivered" confirmLabel="Deliver" message={`Record ${deliver?.code} as delivered today, ${formatDate(new Date().toISOString())}? It can no longer change.`} onCancel={() => setDeliver(null)}
        onConfirm={() => { const r = deliver; setDeliver(null); if (r) act(() => api.post(`/build-orders/${r.id}/deliver`, {}), 'Order delivered.'); }} />
    </ModuleShell>
  );
}
