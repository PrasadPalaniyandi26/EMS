'use client';

import { canPropose, isFinanceRole } from '@/lib/permissions';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeftRight, Ban, CircleCheck, Hammer, PackageOpen, Pencil, Plus, RefreshCw, Rocket, Tag, Trash2, Undo2 } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { formatDate } from '@/lib/currency';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { ORDER_STATUS, useBuildOrder, type OrderLine, type OrderOperation } from '@/hooks/use-build-orders';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { IdCell, TextCell, ToneText, headerRight, NumCell } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { BillingSection } from '@/components/invoicing/billing-section';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { BuildOrderModal, CancelOrderModal, OrderPricingModal, OrderStepModal, ReimportOrderBomModal, SwapPartModal, type OrderStep } from '@/components/budgets/build-order-modals';
import { BuildStepModal } from '@/components/budgets/planning-modals';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { TabBar, marginTone as projectMarginTone, money, unitPrice, useTabParam } from '@/components/budgets/budget-ui';
import { cn } from '@/lib/utils';

type Tab = 'bom' | 'operations' | 'standard' | 'schedule' | 'variances';
const TABS: { value: Tab; label: string }[] = [
  { value: 'bom', label: 'Bill of materials' }, { value: 'operations', label: 'Build operations' }, { value: 'standard', label: 'Standard cost' },
  { value: 'schedule', label: 'Spend schedule' }, { value: 'variances', label: 'Variances' },
];
const TAB_VALUES = TABS.map((t) => t.value);
// With no target or minimum margin set there is nothing to judge a margin against, so only a loss is coloured
const marginTone = (m: number | null, target: number | null, min: number | null) => (target == null && min == null ? (m != null && m < 0 ? 'danger' as const : 'muted' as const) : projectMarginTone(m, target, min));
const EMPTY: Record<Tab, string> = {
  bom: 'The standard BOM has not been imported yet. Click Import BOM.',
  operations: 'No build operations on this order. Click Add build operation, or reimport the BOM from the product.',
  standard: 'The standard BOM has not been imported yet, so there is nothing to compare.',
  schedule: 'The standard BOM has not been imported yet, so there is nothing to schedule.',
  variances: 'No expenses are charged to this order yet. Choose this order as the Order when you record a product expense.',
};
const EXPENSE_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'muted' | 'danger' }> = {
  APPROVED: { label: 'Approved', tone: 'success' }, PENDING_MANAGER: { label: 'Waiting for manager', tone: 'warning' }, PENDING_FINANCE: { label: 'Waiting for finance', tone: 'warning' },
  DRAFT: { label: 'Draft', tone: 'muted' }, SENT_BACK: { label: 'Sent back', tone: 'muted' }, REJECTED: { label: 'Rejected', tone: 'danger' }, VOID: { label: 'Void', tone: 'danger' },
};
const TONE_CLASS = { success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', info: 'text-[var(--info)]', muted: 'text-[var(--shell-text-muted)]' } as const;

const monthLabel = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' });
const fyText = (fy: number) => `${fy}-${String(fy + 1).slice(2)}`;
const sourcingText = (s?: string) => (s === 'MAKE' ? 'Make' : 'Buy');

export default function BuildOrderDetailPage() {
  const id = Number(useParams<{ id: string }>().id);
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const canEdit = canPropose(user?.role_name);
  const isFinance = isFinanceRole(user?.role_name); // delivering and cancelling an order are Finance decisions
  const router = useRouter();
  const invalidate = useInvalidate();
  const { data, isLoading } = useBuildOrder(id);
  const [tab, setTab] = useTabParam<Tab>(TAB_VALUES, 'bom');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [swapOpen, setSwapOpen] = useState(false); const [pricingOpen, setPricingOpen] = useState(false);
  const [step, setStep] = useState<OrderStep | null>(null); const [lastStep, setLastStep] = useState<OrderStep>('release');
  const [reimport, setReimport] = useState(false);
  const [startOpen, setStartOpen] = useState(false); const [cancelOpen, setCancelOpen] = useState(false); const [editOpen, setEditOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false); const [delOrder, setDelOrder] = useState(false);
  const [opOpen, setOpOpen] = useState(false); const [editOp, setEditOp] = useState<OrderOperation | null>(null); const [delOp, setDelOp] = useState<OrderOperation | null>(null);

  const act = async (job: () => Promise<unknown>, ok: string) => {
    try { await job(); toast.success(ok); invalidate('budgets'); } catch (err: any) { toast.error(err?.message || 'Could not complete that.'); }
  };

  const openStep = (s: OrderStep) => { setLastStep(s); setStep(s); };

  const o = data ?? null; const c = o?.cost ?? null; const t = o?.targets; const sn = o?.standard_now ?? null;
  const editable = !!o && o.editable && canEdit;
  const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '-' : ''}${unitPrice(Math.abs(x), currency)}`;

  const stdRows = useMemo(() => {
    if (!c) return [];
    const parts: [string, number, number | null][] = [
      ['Material', c.material, sn?.material ?? null], ['Scrap', c.scrap, sn?.scrap ?? null], ['Freight and handling', c.freight, sn?.freight ?? null],
      ['Build operations', c.conversion + c.fixed, sn ? sn.conversion + sn.fixed : null], ['Overhead', c.overhead, sn?.overhead ?? null], ['Warranty', c.warranty, sn?.warranty ?? null], ['Cost per unit', c.total, sn?.total ?? null],
    ];
    return parts.map(([label, mine, std], i) => ({ id: i, label, mine, std, diff: std == null ? null : mine - std, total: label === 'Cost per unit' }));
  }, [c, sn]);

  const scheduleRows = useMemo(() => {
    let running = 0;
    return (o?.schedule ?? []).map((m, i) => { const net = m.revenue - m.spend; running += net; return { ...m, id: i, net, running }; });
  }, [o]);

  const rows = useMemo<any[]>(() => (!o ? [] : tab === 'bom' ? o.lines : tab === 'operations' ? o.operations : tab === 'schedule' ? scheduleRows : tab === 'variances' ? o.actuals.expenses : stdRows), [o, tab, stdRows, scheduleRows]);

  const columns = useMemo<ColumnDef<any, any>[]>(() => {
    if (tab === 'bom') return [
      { accessorKey: 'sequence', header: headerRight('Seq'), cell: ({ row }) => <NumCell>{row.original.sequence}</NumCell>, size: 48 },
      { accessorKey: 'part_no', header: 'Part', cell: ({ row }) => <IdCell value={row.original.part_no} />, size: 110 },
      { accessorKey: 'name', header: 'Name', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[170px] truncate" /> },
      { accessorKey: 'quantity', header: headerRight('Qty'), cell: ({ row }) => <NumCell>{row.original.quantity}{row.original.scrap_pct ? <span className="text-[var(--shell-text-muted)]"> (+{row.original.scrap_pct}%)</span> : null}</NumCell>, size: 90 },
      { accessorKey: 'unit_cost', header: headerRight('Unit cost'), cell: ({ row }) => <NumCell>{unitPrice(row.original.unit_cost, currency)}</NumCell>, size: 110 },
      { accessorKey: 'amount', header: headerRight('Amount'), cell: ({ row }) => <NumCell strong>{unitPrice(row.original.amount, currency)}</NumCell>, size: 110 },
      {
        accessorKey: 'lead_time_days', header: headerRight('Lead time'), size: 100,
        cell: ({ row }) => { const l = row.original as OrderLine; if (l.item_id == null) return <NumCell>—</NumCell>; const late = !!o?.lead.late_lines.includes(l.id); return <div className="text-right">{l.lead_time_days == null ? <ToneText label="Not set" tone="warning" /> : <ToneText label={`${l.lead_time_days} d`} tone={late ? 'danger' : 'muted'} />}</div>; },
      },
      {
        id: 'alternate', header: 'Alternate', size: 170,
        cell: ({ row }) => { const l = row.original as OrderLine; if (l.part_status && l.part_status !== 'ACTIVE') return <ToneText label={`Part ${l.part_status === 'REPLACED' ? 'replaced' : 'retired'}`} tone="warning" />; return l.swapped ? <ToneText label={`Swapped from ${l.source_part_no}`} tone="info" /> : l.alternates.length ? <TextCell value={`${l.alternates.length} available`} muted /> : <TextCell value="" />; },
      },
    ];
    if (tab === 'schedule') return [
      { accessorKey: 'label', header: 'Month', cell: ({ row }) => <TextCell value={row.original.label} strong /> },
      { accessorKey: 'spend', header: headerRight('Cash out'), cell: ({ row }) => <NumCell strong>{row.original.spend ? money(row.original.spend, currency) : '—'}</NumCell>, size: 130 },
      { accessorKey: 'revenue', header: headerRight('Sale in'), cell: ({ row }) => <NumCell strong>{row.original.revenue ? money(row.original.revenue, currency) : '—'}</NumCell>, size: 130 },
      { accessorKey: 'net', header: headerRight('Net'), cell: ({ row }) => <div className="text-right"><ToneText label={`${row.original.net < 0 ? '-' : ''}${money(Math.abs(row.original.net), currency)}`} tone={row.original.net < 0 ? 'warning' : row.original.net > 0 ? 'success' : 'muted'} /></div>, size: 130 },
      { accessorKey: 'running', header: headerRight('Running net'), cell: ({ row }) => <NumCell>{`${row.original.running < 0 ? '-' : ''}${money(Math.abs(row.original.running), currency)}`}</NumCell>, size: 140 },
    ];
    if (tab === 'variances') return [
      { accessorKey: 'reference_id', header: 'Expense', cell: ({ row }) => <IdCell value={row.original.reference_id} />, size: 110 },
      { accessorKey: 'date_recorded', header: 'Date', cell: ({ row }) => <TextCell value={formatDate(row.original.date_recorded)} muted />, size: 110 },
      { accessorKey: 'description', header: 'Description', cell: ({ row }) => <TextCell value={row.original.description} strong className="block max-w-[300px] truncate" /> },
      { accessorKey: 'category_name', header: 'Category', cell: ({ row }) => <TextCell value={row.original.category_name} muted />, size: 170 },
      { accessorKey: 'is_e200', header: 'Counts as', cell: ({ row }) => <TextCell value={row.original.is_e200 ? 'Materials and production' : 'Other'} muted />, size: 170 },
      { accessorKey: 'amount', header: headerRight('Amount'), cell: ({ row }) => <NumCell strong>{unitPrice(row.original.amount, currency)}</NumCell>, size: 120 },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => { const s = EXPENSE_STATUS[row.original.status ?? ''] ?? { label: row.original.status ?? '', tone: 'muted' as const }; return <ToneText label={s.label} tone={s.tone} />; }, size: 160 },
    ];
    if (tab === 'operations') return [
      { accessorKey: 'sequence', header: headerRight('Seq'), cell: ({ row }) => <NumCell>{row.original.sequence}</NumCell>, size: 60 },
      { accessorKey: 'type_name', header: 'Operation', cell: ({ row }) => <TextCell value={row.original.type_name} strong /> },
      { accessorKey: 'role', header: 'Role', cell: ({ row }) => <TextCell value={row.original.role} muted />, size: 170 },
      { accessorKey: 'hours', header: headerRight('Hours per unit'), cell: ({ row }) => <NumCell>{row.original.is_outsourced || row.original.is_fixed ? '—' : row.original.hours}</NumCell>, size: 130 },
      { accessorKey: 'amount', header: headerRight('Direct cost'), cell: ({ row }) => <NumCell>{money(row.original.amount, currency)}</NumCell>, size: 120 },
      { id: 'overhead', header: headerRight('Overhead'), cell: ({ row }) => <NumCell>{(row.original.is_outsourced || row.original.is_fixed) ? '—' : money(row.original.hours * (c?.overhead_rate ?? 0), currency)}</NumCell>, size: 110 },
      { id: 'total', header: headerRight('Total'), cell: ({ row }) => <NumCell strong>{money(row.original.amount + ((row.original.is_outsourced || row.original.is_fixed) ? 0 : row.original.hours * (c?.overhead_rate ?? 0)), currency)}</NumCell>, size: 120 },
    ];
    return [
      { accessorKey: 'label', header: 'Cost per unit', cell: ({ row }) => <TextCell value={row.original.label} strong={row.original.total} /> },
      { accessorKey: 'mine', header: headerRight('This order'), cell: ({ row }) => <NumCell strong={row.original.total}>{money(row.original.mine, currency)}</NumCell>, size: 150 },
      // With no approved standard there is nothing to compare, so the two empty columns are left out
      ...(sn ? [
        { accessorKey: 'std', header: headerRight(`Approved standard ${fyText(sn.fy)}`), cell: ({ row }: any) => <NumCell strong={row.original.total}>{row.original.std == null ? '—' : money(row.original.std, currency)}</NumCell>, size: 190 },
        {
          accessorKey: 'diff', header: headerRight('Difference'), size: 140,
          cell: ({ row }: any) => { const d = row.original.diff as number | null; return <div className="text-right"><ToneText label={d == null ? '—' : d === 0 ? '0' : `${d > 0 ? '+' : '-'}${money(Math.abs(d), currency)}`} tone={d == null || Math.abs(d) < 0.5 ? 'muted' : d > 0 ? 'warning' : 'success'} /></div>; },
        },
      ] : []),
    ];
  }, [tab, currency, o, c, sn]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: tab !== 'standard' && tab !== 'schedule', enableMultiRowSelection: false,
    onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected: any = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const switchTab = (next: Tab) => { setTab(next); setSelection({}); };

  const driftNow = !!o && o.cost_drift != null && Math.abs(o.cost_drift) >= 0.005;
  // The margin the order would have if it were costed again at today's part prices
  const liveMargin = o && driftNow && o.editable && o.live_unit_cost != null && o.unit_price ? ((o.unit_price - o.live_unit_cost) / o.unit_price) * 100 : null;
  // One word for where the order stands, as on the list
  const verdict = !o ? null
    : (o.margin_pct != null && o.margin_pct < 0) || (liveMargin != null && liveMargin < 0) ? 'Loss'
    : o.editable && o.has_bom && o.lead.late ? 'Late'
    : o.editable && !o.has_bom ? 'No BOM'
    : o.editable && o.has_bom && t?.min_margin_pct != null && ((o.margin_pct ?? 100) < t.min_margin_pct || (liveMargin ?? 100) < t.min_margin_pct) ? 'Below minimum margin'
    : o.editable && o.has_bom ? 'On time' : ORDER_STATUS[o.status].label;
  useEffect(() => {
    setHeader(data ? `${data.code} ${data.product_name ?? ''}`.trim() : 'Order', data ? [data.client_name, data.customer_po ? `PO ${data.customer_po}` : null, verdict].filter(Boolean).join(' · ') : 'Locked BOM, cost and delivery');
  }, [setHeader, data, verdict]);
  const itemActions: DetailActionDef[] = !selected || !editable ? [] : tab === 'bom' ? (!(selected as OrderLine).alternates?.length ? [] : [
    { label: 'Swap part', icon: <ArrowLeftRight className="h-4 w-4 text-[var(--nav-purple)]" />, onClick: () => setSwapOpen(true) },
  ]) : tab === 'operations' ? [
    { label: 'Edit', icon: <Pencil className="h-4 w-4 text-[var(--info)]" />, onClick: () => { setEditOp(selected as OrderOperation); setOpOpen(true); } },
    { label: 'Delete', variant: 'danger', icon: <Trash2 className="h-4 w-4 text-[var(--danger)]" />, onClick: () => setDelOp(selected as OrderOperation) },
  ] : [];
  const alwaysActions: DetailActionDef[] = !o || !canEdit ? [] : [
    ...(tab === 'operations' && o.editable && o.has_bom ? [{ label: 'Add build operation', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditOp(null); setOpOpen(true); } }] : []),
    ...(o.editable ? [{ label: 'Price and costing', icon: <Tag className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setPricingOpen(true) }] : []),
    ...(o.editable && o.has_bom && driftNow ? [{ label: 'Recost', icon: <RefreshCw className="h-4 w-4 text-[var(--nav-orange)]" />, onClick: () => act(() => api.post(`/build-orders/${o.id}/recost`, {}), 'Order costed again.') }] : []),
    ...(o.status === 'COMMITTED' && o.has_bom ? [{ label: 'Reimport BOM', icon: <PackageOpen className="h-4 w-4 text-[var(--nav-cyan)]" />, onClick: () => setReimport(true) }] : []),
    ...(o.status === 'COMMITTED' && !o.has_bom ? [{ label: 'Import BOM', variant: 'primary' as const, icon: <PackageOpen className="h-4 w-4 text-[var(--nav-cyan)]" />, onClick: () => act(() => api.post(`/build-orders/${o.id}/import-bom`, {}), 'Standard BOM imported and the order costed.') }] : []),
    ...(o.status === 'COMMITTED' && o.has_bom ? [{ label: 'Release', variant: 'primary' as const, icon: <Rocket className="h-4 w-4 text-[var(--nav-indigo)]" />, onClick: () => openStep('release') }] : []),
    ...(o.status === 'RELEASED' ? [{ label: 'Reopen', icon: <Undo2 className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => openStep('reopen') }] : []),
    ...(o.status === 'RELEASED' ? [{ label: 'Start build', variant: 'primary' as const, icon: <Hammer className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setStartOpen(true) }] : []),
    ...(o.status === 'IN_BUILD' && isFinance ? [{ label: 'Deliver', variant: 'primary' as const, icon: <CircleCheck className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setDeliverOpen(true) }] : []),
    ...((o.status === 'RELEASED' || o.status === 'IN_BUILD') && isFinance ? [{ label: 'Cancel order', icon: <Ban className="h-4 w-4 text-[var(--nav-rose)]" />, onClick: () => setCancelOpen(true) }] : []),
    ...(o.editable ? [{ label: 'Edit order', icon: <Pencil className="h-4 w-4 text-[var(--info)]" />, onClick: () => setEditOpen(true) }] : []),
    ...(o.status === 'COMMITTED' ? [{ label: 'Delete order', variant: 'danger' as const, icon: <Trash2 className="h-4 w-4 text-[var(--danger)]" />, onClick: () => setDelOrder(true) }] : []),
  ];
  // A selected part's own action (Swap part) comes first, then the order's main action
  const panelActions = [...itemActions, ...alwaysActions.filter((a) => a.variant === 'primary')].slice(0, 3);

  const lateText = o?.lead.late
    ? `The parts cannot all arrive in time. The longest lead time is ${o.lead.longest_lead_days} days and the build needs about ${o.lead.assembly_days}, against ${o.lead.window_days} days between the dates. The earliest delivery is ${formatDate(o.lead.earliest_delivery)}.`
    : o ? `The parts can arrive in time: longest lead time ${o.lead.longest_lead_days} days, build about ${o.lead.assembly_days} days, ${o.lead.window_days} days available.` : '';
  const margin = o?.margin_pct ?? null;

  const summary = !o ? null : (
    <div className="space-y-4">
      <DetailSummary title={o.product_name ?? 'Order'} subtitle={`${o.code} · ${o.quantity} unit${o.quantity === 1 ? '' : 's'} · ${ORDER_STATUS[o.status].label}`} status={verdict ?? ORDER_STATUS[o.status].label}
        statusClass={verdict === 'Loss' || verdict === 'Late' || verdict === 'Below minimum margin' ? TONE_CLASS.danger : verdict === 'No BOM' ? TONE_CLASS.warning : verdict === 'On time' ? TONE_CLASS.success : TONE_CLASS[ORDER_STATUS[o.status].tone]}
        figure={o.has_bom && c ? money(c.total, currency) : '—'} figureLabel="Cost per unit now" />
      {o.editable && o.has_bom && (o.stale.bom_newer != null || o.stale.standard_changed || o.stale.ended_parts > 0) && (
        <div role="alert" className="space-y-1 text-[12px] text-[var(--warning)]">
          {o.stale.bom_newer != null && <p>The product&apos;s BOM has a newer version (version {o.stale.bom_newer}) than the copy on this order (version {o.source_bom_version}).</p>}
          {o.stale.ended_parts > 0 && <p>{o.stale.ended_parts} part{o.stale.ended_parts === 1 ? ' has' : 's have'} been replaced or retired on the Part master since this was copied.</p>}
          {o.stale.standard_changed && <p>The approved standard cost has changed since this was copied.</p>}
          {o.status === 'COMMITTED' ? <p>Use Reimport BOM to pick the changes up.</p> : <p>Reopen the order first if you want to reimport the BOM.</p>}
        </div>
      )}
      {o.has_bom && c && (
        <DetailSection title="Cost per unit">
          <DetailGrid>
            <DetailField label="Material" value={money(c.material, currency)} />
            <DetailField label="Scrap" value={money(c.scrap, currency)} />
            <DetailField label="Freight and handling" value={money(c.freight, currency)} />
            <DetailField label="Build operations" value={money(c.conversion + c.fixed, currency)} />
            <DetailField label={`Overhead (${money(c.overhead_rate, currency)}/h)`} value={money(c.overhead, currency)} />
            <DetailField label="Warranty" value={money(c.warranty, currency)} />
          </DetailGrid>
          {o.cost_drift != null && driftNow && o.editable && <p className="text-[12px] text-[var(--warning)]">Part prices have moved by {signed(o.cost_drift)} per unit since this was costed. Recost to update it.</p>}
        </DetailSection>
      )}
      <DetailSection title="Price and margin">
        {o.unit_price == null ? <p className="text-[12px] text-[var(--shell-text-muted)]">No selling price is set for this order.{editable ? ' Use Price and costing to add one.' : ''}</p> : (
          <>
            <DetailGrid>
              <DetailField label="Selling price" value={unitPrice(o.unit_price, currency)} />
              <DetailField label="Order value" value={o.total_value != null ? money(o.total_value, currency) : undefined} />
              <DetailField label="Margin" value={margin != null ? `${margin.toFixed(1)}%` : undefined} tone={marginTone(margin, t?.target_margin_pct ?? null, t?.min_margin_pct ?? null)} />
              <DetailField label="Against standard" value={o.vs_standard != null ? signed(o.vs_standard) : undefined} tone={o.vs_standard == null || o.vs_standard === 0 ? 'muted' : o.vs_standard > 0 ? 'warning' : 'success'} />
              <DetailField label="Target margin" value={t?.target_margin_pct != null ? `${t.target_margin_pct}%` : 'Not set'} />
              <DetailField label="Minimum margin" value={t?.min_margin_pct != null ? `${t.min_margin_pct}%` : 'Not set'} />
              {liveMargin != null && <DetailField label="Margin at today's part prices" value={`${liveMargin.toFixed(1)}%`} tone={marginTone(liveMargin, t?.target_margin_pct ?? null, t?.min_margin_pct ?? null) === 'muted' ? 'warning' : marginTone(liveMargin, t?.target_margin_pct ?? null, t?.min_margin_pct ?? null)} wide />}
            </DetailGrid>
            {liveMargin != null && liveMargin < 0 && <p role="alert" className="text-[12px] text-[var(--danger)]">At today&apos;s part prices the cost per unit is above the selling price, so this order would make a loss. Recost to see it in the margin.</p>}
            {margin != null && margin < 0 && <p role="alert" className="text-[12px] text-[var(--danger)]">The cost per unit is above the selling price, so this order makes a loss.</p>}
            {margin != null && margin >= 0 && t?.min_margin_pct != null && margin < t.min_margin_pct && <p role="alert" className="text-[12px] text-[var(--danger)]">Margin is below the minimum of {t.min_margin_pct}%.</p>}
          </>
        )}
      </DetailSection>
      <DetailSection title="Schedule">
        <DetailGrid>
          <DetailField label="Start" value={formatDate(o.start_date)} />
          <DetailField label="Promised delivery" value={formatDate(o.delivery_date)} />
          {o.delivered_on && <DetailField label="Delivered" value={formatDate(o.delivered_on)} wide />}
        </DetailGrid>
        {o.has_bom && o.editable && <p className={cn('text-[13px]', o.lead.late ? 'text-[var(--danger)]' : 'text-[var(--shell-text)]')}>{lateText}</p>}
        {o.lead.missing_lead_time > 0 && o.editable && <p className="text-[12px] text-[var(--warning)]">{o.lead.missing_lead_time} part{o.lead.missing_lead_time === 1 ? ' has' : 's have'} no lead time on the Part master, so {o.lead.missing_lead_time === 1 ? 'it counts' : 'they count'} as zero.</p>}
      </DetailSection>
      <DetailSection title="Build plan">
        <DetailGrid>
          <DetailField label={`Planned, ${monthLabel(o.plan.year, o.plan.month)}`} value={o.plan.planned} />
          <DetailField label="Taken by orders" value={o.plan.taken} />
          <DetailField label="Left in the plan" value={o.plan.open} tone={o.plan.over ? 'danger' : 'muted'} wide />
        </DetailGrid>
        {o.plan.over && <p className="text-[12px] text-[var(--warning)]">Orders starting this month take more units than the plan allows.</p>}
      </DetailSection>
      <BillingSection kind="order" id={o.id} />
      {o.imported_at && <p className="text-[12px] text-[var(--shell-text-muted)]">Copied from BOM version {o.source_bom_version} on {formatDate(o.imported_at)}.</p>}
      {o.notes && <DetailSection title="Notes"><p className="text-[13px] text-[var(--shell-text)]">{o.notes}</p></DetailSection>}
      {o.cancel_reason && <DetailSection title="Cancelled"><p className="text-[13px] text-[var(--shell-text)]">{o.cancel_reason}</p></DetailSection>}
    </div>
  );

  const sched = o?.schedule ?? [];
  const totalSpend = sched.reduce((a, m) => a + m.spend, 0);
  const totalIn = sched.reduce((a, m) => a + m.revenue, 0);
  const lowest = scheduleRows.reduce<(typeof scheduleRows)[number] | null>((m, r) => (m == null || r.running < m.running ? r : m), null);
  const scheduleSummary = !o ? null : (
    <div className="space-y-4">
      <DetailSummary title="Spend schedule" subtitle={o.code} status={lowest && lowest.running < 0 ? 'Cash is out before the sale comes in' : undefined} statusClass="text-[var(--warning)]"
        figure={lowest && lowest.running < 0 ? `${'-'}${money(Math.abs(lowest.running), currency)}` : money(totalSpend, currency)} figureLabel={lowest && lowest.running < 0 ? `Lowest running net, ${lowest.label}` : 'Cash out'} />
      <DetailSection title="Over the order">
        <DetailGrid>
          <DetailField label="Parts" value={money(sched.reduce((a, m) => a + m.materials, 0), currency)} />
          <DetailField label="Build" value={money(sched.reduce((a, m) => a + m.assembly, 0), currency)} />
          <DetailField label="Cash out" value={money(totalSpend, currency)} />
          <DetailField label="Sale in" value={totalIn ? money(totalIn, currency) : 'No price set'} />
          <DetailField label="Net" value={`${totalIn - totalSpend < 0 ? '-' : ''}${money(Math.abs(totalIn - totalSpend), currency)}`} tone={totalIn - totalSpend < 0 ? 'warning' : 'success'} wide />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="How it is worked out">
        <p className="text-[12px] text-[var(--shell-text-muted)]">Each part is paid in the month it arrives, and the build is spread over the days of assembly. The sale comes in on the promised delivery date. Warranty is a provision, not cash, so it is left out.</p>
        {o.lead.late && <p className="text-[12px] text-[var(--danger)]">The parts arrive after the promised delivery, so some money goes out after the sale comes in.</p>}
        {!o.has_bom && <p className="text-[12px] text-[var(--shell-text-muted)]">Import the standard BOM to see when the money moves.</p>}
      </DetailSection>
    </div>
  );

  const standardSummary = !o || !c ? null : (
    <div className="space-y-4">
      <DetailSummary title="Against the standard" subtitle={o.code} status={sn ? `Approved standard ${fyText(sn.fy)}` : 'No approved standard cost'} statusClass="text-[var(--shell-text-muted)]"
        figure={sn ? `${c.total >= sn.total ? '+' : '−'}${money(Math.abs(c.total - sn.total), currency)}` : undefined} figureLabel="This order against the standard" />
      <DetailSection title="Cost per unit">
        <DetailGrid>
          <DetailField label="This order" value={money(c.total, currency)} />
          <DetailField label="Approved standard" value={sn ? money(sn.total, currency) : 'None'} />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">{sn ? 'The order keeps the BOM it copied, so it can differ from the standard as it stands now.' : 'Approve a standard cost on the product to compare this order against it.'}</p>
    </div>
  );

  const a = o?.actuals;
  const signedMoney = (x: number) => `${x > 0 ? '+' : x < 0 ? '-' : ''}${money(Math.abs(x), currency)}`;
  const varianceSummary = !o || !a ? null : (
    <div className="space-y-4">
      <DetailSummary title="Cost against plan" subtitle={o.code} status={o.status === 'DELIVERED' ? 'Delivered: final figures' : 'In progress: spent so far'} statusClass="text-[var(--shell-text-muted)]" figure={money(a.approved, currency)} figureLabel="Approved spend" />
      <DetailSection title="Materials and production (E200)">
        <DetailGrid>
          <DetailField label="Spent" value={money(a.approved_e200, currency)} />
          <DetailField label="Expected" value={a.expected_bought != null ? money(a.expected_bought, currency) : undefined} />
          <DetailField label="Left to spend" value={a.remaining != null ? signedMoney(a.remaining) : undefined} tone={a.remaining != null && a.remaining < 0 ? 'danger' : 'muted'} />
          <DetailField label="Used so far" value={a.spent_pct != null ? `${a.spent_pct.toFixed(0)}%` : undefined} />
        </DetailGrid>
        <p className="text-[12px] text-[var(--shell-text-muted)]">Expected is the material, scrap, freight and outsourced work of this order&apos;s BOM for {o.quantity} unit{o.quantity === 1 ? '' : 's'}. Only approved expenses charged to this order count.</p>
      </DetailSection>
      <DetailSection title="Variances">
        <DetailGrid>
          <DetailField label="Spend" value={o.status === 'DELIVERED' && a.spend_variance != null ? signedMoney(a.spend_variance) : undefined} tone={a.spend_variance == null || a.spend_variance === 0 ? 'muted' : a.spend_variance > 0 ? 'warning' : 'success'} />
          <DetailField label="Price" value={signedMoney(a.price_variance)} tone={a.price_variance > 0 ? 'warning' : a.price_variance < 0 ? 'success' : 'muted'} />
          <DetailField label="Usage (quantity and scrap)" value={o.status === 'DELIVERED' && a.usage_variance != null ? signedMoney(a.usage_variance) : undefined} tone={a.usage_variance == null || a.usage_variance === 0 ? 'muted' : a.usage_variance > 0 ? 'warning' : 'success'} wide />
        </DetailGrid>
        <p className="text-[12px] text-[var(--shell-text-muted)]">Spend = price + usage. Price is the effect of last paid prices against the standard prices in this BOM. Usage is what price does not explain. Spend and usage are shown once the order is delivered, because until then spend is naturally below what is expected. Watch Left to spend instead.</p>
      </DetailSection>
      <DetailSection title="Other expenses">
        <DetailGrid>
          <DetailField label="Other approved" value={money(a.approved_other, currency)} />
          <DetailField label="Waiting for approval" value={money(a.waiting, currency)} tone={a.waiting > 0 ? 'warning' : 'muted'} />
          <DetailField label="Drafts" value={a.drafts} wide />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="Margin">
        {a.actual_margin_pct == null ? <p className="text-[12px] text-[var(--shell-text-muted)]">{o.unit_price == null ? 'Set a selling price to see the margin.' : 'The real margin is shown once the order is delivered. The planned margin is '}{o.unit_price != null && o.margin_pct != null ? `${o.margin_pct.toFixed(1)}%.` : ''}</p> : (
          <DetailGrid>
            <DetailField label="Actual cost" value={a.actual_cost != null ? money(a.actual_cost, currency) : undefined} />
            <DetailField label="Actual profit" value={a.actual_profit != null ? signedMoney(a.actual_profit) : undefined} tone={a.actual_profit != null && a.actual_profit < 0 ? 'danger' : 'muted'} />
            <DetailField label="Actual margin" value={`${a.actual_margin_pct.toFixed(1)}%`} tone={marginTone(a.actual_margin_pct, t?.target_margin_pct ?? null, t?.min_margin_pct ?? null)} />
            <DetailField label="Planned margin" value={o.margin_pct != null ? `${o.margin_pct.toFixed(1)}%` : undefined} />
          </DetailGrid>
        )}
        <p className="text-[12px] text-[var(--shell-text-muted)]">Labour and overhead are not expenses, so they are taken at the standard cost for the units ordered.</p>
      </DetailSection>
    </div>
  );

  const detail = (() => {
    if (!selected || !o) return null;
    if (tab === 'variances') {
      const x = selected as { reference_id: string | null; date_recorded: string; description: string | null; category_name: string | null; is_e200: boolean; amount: number; status: string | null; submitted_by_name: string | null };
      const st = EXPENSE_STATUS[x.status ?? ''] ?? { label: x.status ?? '', tone: 'muted' as const };
      return (
        <div className="space-y-4">
          <DetailSummary title={x.reference_id ?? 'Expense'} subtitle={x.description ?? undefined} status={st.label} statusClass={TONE_CLASS[st.tone]} figure={unitPrice(x.amount, currency)} figureLabel="Amount" />
          <DetailSection title="Expense">
            <DetailGrid>
              <DetailField label="Date" value={formatDate(x.date_recorded)} />
              <DetailField label="Category" value={x.category_name ?? undefined} />
              <DetailField label="Counts as" value={x.is_e200 ? 'Materials and production' : 'Other expense'} />
              <DetailField label="Recorded by" value={x.submitted_by_name ?? undefined} />
            </DetailGrid>
            <p className="text-[12px] text-[var(--shell-text-muted)]">{x.status === 'APPROVED' ? 'This is counted in the order’s spend.' : 'This is not counted in the order’s spend until it is approved.'}</p>
          </DetailSection>
        </div>
      );
    }
    if (tab === 'bom') {
      const l = selected as OrderLine;
      const late = o.lead.late_lines.includes(l.id);
      return (
        <div className="space-y-4">
          <DetailSummary title={l.name} subtitle={`${l.part_no} · ${sourcingText(l.sourcing)}`} figure={unitPrice(l.amount, currency)} figureLabel="Line cost" />
          <DetailSection title="Line">
            <DetailGrid>
              <DetailField label="Group" value={l.group_name ?? '—'} />
              <DetailField label="Sequence" value={l.sequence} />
              <DetailField label="Quantity" value={l.quantity} />
              <DetailField label="Scrap" value={`${l.scrap_pct}%`} />
              <DetailField label="Unit cost" value={unitPrice(l.unit_cost, currency)} />
              <DetailField label="Supplier" value={l.supplier ?? undefined} />
              <DetailField label="Lead time" value={l.item_id == null ? undefined : l.lead_time_days != null ? `${l.lead_time_days} days` : 'Not set'} tone={late ? 'danger' : 'muted'} wide />
            </DetailGrid>
            {late && <p className="text-[12px] text-[var(--danger)]">This part cannot arrive in time for the promised delivery.</p>}
            {l.swapped && <p className="text-[12px] text-[var(--info)]">Swapped from {l.source_part_no} {l.source_name}.</p>}
          </DetailSection>
          {l.alternates.length > 0 && (
            <DetailSection title={`Alternates (${l.alternates.length})`}>
              <ul className="space-y-1.5">
                {l.alternates.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-[var(--shell-text)]">{a.part_no}{a.id === l.source_item_id ? <span className="text-[var(--shell-text-muted)]"> · original</span> : null}</span>
                    <span className="shrink-0 tabular-nums text-[var(--shell-text-muted)]">{a.lead_time_days != null ? `${a.lead_time_days} d · ` : ''}{late ? `${(a.lead_time_days ?? 0) + l.tail_days <= o.lead.window_days ? 'in time' : 'too late'} · ` : ''}{a.cost_change > 0 ? '+' : ''}{unitPrice(a.cost_change, currency)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-[var(--shell-text-muted)]">Cost change is per unit of the order, from the standard prices.</p>
            </DetailSection>
          )}
        </div>
      );
    }
    const op = selected as OrderOperation;
    const ohRate = c?.overhead_rate ?? 0;
    const oh = (op.is_outsourced || op.is_fixed) ? 0 : op.hours * ohRate;
    return (
      <div className="space-y-4">
        <DetailSummary title={op.type_name} subtitle={op.is_fixed ? 'Fixed cost' : op.is_outsourced ? 'Outsourced' : 'In-house'} figure={money(op.amount + oh, currency)} figureLabel="Operation cost" />
        <DetailSection title="Cost">
          <DetailGrid>
            {op.is_fixed ? <DetailField label="Fixed cost per unit" value={money(op.fixed_cost, currency)} wide /> : op.is_outsourced ? <DetailField label="Outsourced cost" value={op.outsourced_cost != null ? money(op.outsourced_cost, currency) : '—'} wide /> : (
              <>
                <DetailField label="Role" value={op.role ?? undefined} wide />
                <DetailField label="Cost per hour" value={op.rate ? money(op.rate, currency) : '—'} />
                <DetailField label="Hours per unit" value={op.hours} />
                <DetailField label="Labour" value={money(op.hours * op.rate, currency)} />
                <DetailField label={`Overhead (${money(ohRate, currency)}/h)`} value={money(oh, currency)} />
              </>
            )}
          </DetailGrid>
        </DetailSection>
        <p className="text-[12px] text-[var(--shell-text-muted)]">Operations start as a copy of the product&apos;s. Changes here are for this order only and cost it again. Reimporting the BOM copies the product&apos;s operations again and replaces these changes.</p>
      </div>
    );
  })();

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<Tab> value={tab} onChange={switchTab} tabs={TABS} />
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1">
        <ModuleShell
          showPanel={!!selected}
          searchRow={<DataTableToolbar table={table} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>} />}
          intelligencePanel={
            <ModuleIntelligencePanel title={selected ? (tab === 'operations' ? 'Build operation' : tab === 'variances' ? 'Expense' : 'Part') : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected}
              idle={tab === 'schedule' ? scheduleSummary : tab === 'variances' ? varianceSummary : tab === 'standard' ? standardSummary : summary} footer={panelActions.length ? <DetailActions actions={panelActions} /> : undefined}>
              {detail}
            </ModuleIntelligencePanel>
          }
        >
          <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={EMPTY[tab]} />
        </ModuleShell>
      </div>

      <SwapPartModal isOpen={swapOpen} onClose={() => setSwapOpen(false)} order={o} lineId={selected?.id ?? null} />
      <OrderStepModal isOpen={step != null} onClose={() => setStep(null)} order={o} step={step ?? lastStep} />
      <OrderPricingModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} order={o} />
      <OrderStepModal isOpen={startOpen} onClose={() => setStartOpen(false)} order={o} step="start" />
      <BuildOrderModal isOpen={editOpen} onClose={() => setEditOpen(false)} editing={o} />
      <CancelOrderModal isOpen={cancelOpen} onClose={() => setCancelOpen(false)} order={o} />
      <ConfirmDialog open={deliverOpen} title="Mark as delivered" confirmLabel="Deliver" message={`Record ${o?.code} as delivered today, ${formatDate(new Date().toISOString())}? It can no longer change.`} onCancel={() => setDeliverOpen(false)}
        onConfirm={() => { setDeliverOpen(false); if (o) act(() => api.post(`/build-orders/${o.id}/deliver`, {}), 'Order delivered.'); }} />
      <ConfirmDialog open={delOrder} destructive title="Delete order" confirmLabel="Delete" message={`Delete ${o?.code}? It has not been released. Its BOM copy goes with it.`} onCancel={() => setDelOrder(false)}
        onConfirm={async () => { setDelOrder(false); if (!o) return; try { await api.delete(`/build-orders/${o.id}`); toast.success('Order deleted.'); invalidate('budgets'); router.push('/business/orders'); } catch (err: any) { toast.error(err?.message || 'Could not delete.'); } }} />
      <ReimportOrderBomModal isOpen={reimport} onClose={() => { setReimport(false); setSelection({}); }} order={o} />
      <BuildStepModal isOpen={opOpen} onClose={() => setOpOpen(false)} data={o ? { operation_types: o.operation_types, rate_cards: o.rate_cards } : undefined} editing={editOp} url={o ? `/build-orders/${o.id}/operations` : undefined} />
      <ConfirmDialog open={!!delOp} destructive title="Remove build operation" message={`Remove ${delOp?.type_name ?? delOp?.name} from this order? The product's own operations are not changed.`} confirmLabel="Remove" onCancel={() => setDelOp(null)}
        onConfirm={async () => { const x = delOp; setDelOp(null); if (x && o) { await act(() => api.delete(`/build-orders/${o.id}/operations/${x.id}`), 'Build operation removed from this order.'); setSelection({}); } }} />
    </div>
  );
}
