'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Calculator, CalendarPlus, Settings2, Tag } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { useProductCosting, type BomLineRow, type OperationRow, type ProductCosting } from '@/hooks/use-planning-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { DateCell, IdCell, TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAllocation, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { BomLineModal, BuildPlanModal, BuildStepModal, ProductPricingModal, RejectCostModal, StandardCostModal, StepTypesModal } from '@/components/budgets/planning-modals';
import { TabBar, marginTone, money, unitPrice } from '@/components/budgets/budget-ui';
import { formatDate } from '@/lib/currency';
import { cn } from '@/lib/utils';

type Tab = 'bom' | 'operations' | 'plan' | 'standard' | 'variances';
type Standard = ProductCosting['standards'][number];
type PlanMonth = ProductCosting['build_plan'][number];

const TABS: { value: Tab; label: string }[] = [
  { value: 'bom', label: 'Bill of materials' }, { value: 'operations', label: 'Build operations' }, { value: 'standard', label: 'Standard cost' },
  { value: 'plan', label: 'Build plan' }, { value: 'variances', label: 'Variances' },
];
const EMPTY: Record<Tab, string> = {
  bom: 'No parts yet. Click Add part to pick parts from the Part master.',
  operations: 'No build operations yet. Click Add build operation for final assembly, testing, packing or outsourced work.',
  plan: 'No build plan for this year.',
  standard: 'No standard cost proposed yet. Use Propose standard cost to freeze the current roll-up for approval.',
  variances: 'No parts on this product yet. Add parts on the Bill of materials tab.',
};

const Num = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => (
  <div className={cn('text-right text-[13px] tabular-nums text-[var(--shell-text)]', strong && 'font-medium')}>{children}</div>
);
const fyText = (fy: number) => `${fy}-${String(fy + 1).slice(2)}`;
const sourcingText = (s?: string) => (s === 'MAKE' ? 'Make' : 'Buy');
const advice = (l: BomLineRow, pct: number | null) => {
  if (!l.item_id) return 'Sub-assembly. Its cost comes from its own BOM, so review its variance on that product.';
  if (pct == null || Math.abs(pct) <= 0.05) return 'Price is in line with standard. No action needed.';
  if (pct < 0) return 'Last price is below standard. If it holds, the standard may be set too high; review it at the next proposal.';
  return l.sourcing === 'MAKE'
    ? 'Last cost is above standard. Check the material and manufacturing costs on the item and the current rate card, then update the item if the rise is lasting.'
    : 'Last paid is above standard. Check the supplier quote. If the rise is lasting, update the item standard price and propose a new standard cost.';
};

export default function ProductCostingDetailPage() {
  const id = Number(useParams<{ id: string }>().id);
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const isFinance = ['ADMIN', 'FINANCE'].includes((user?.role_name || '').toUpperCase());
  const invalidate = useInvalidate();
  const { data, isLoading } = useProductCosting(id);
  const [tab, setTab] = useState<Tab>('bom');
  const [sourcing, setSourcing] = useState('ALL');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [bomOpen, setBomOpen] = useState(false); const [editBom, setEditBom] = useState<BomLineRow | null>(null);
  const [opOpen, setOpOpen] = useState(false); const [editOp, setEditOp] = useState<OperationRow | null>(null); const [typesOpen, setTypesOpen] = useState(false);
  const [delBom, setDelBom] = useState<BomLineRow | null>(null); const [delOp, setDelOp] = useState<OperationRow | null>(null);
  const [approve, setApprove] = useState<number | null>(null); const [reject, setReject] = useState<number | null>(null);
  const [planConfirm, setPlanConfirm] = useState(false); const [pricingOpen, setPricingOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false); const [editPlan, setEditPlan] = useState<PlanMonth | null>(null);

  useEffect(() => { setHeader(data ? `${data.product.code ?? ''} ${data.product.name}`.trim() : 'Product costing', data?.product.client_name ?? 'Bill of materials, standard cost and margin'); }, [setHeader, data]);

  const act = async (job: () => Promise<unknown>, ok: string) => {
    try { await job(); toast.success(ok); invalidate('budgets'); } catch (err: any) { toast.error(err?.message || 'Could not complete that.'); }
  };

  const c = data?.cost ?? null; const a = data?.annual; const v = data?.variances; const pr = data?.pricing;
  const std = data?.product.standard_cost ?? null;
  // Variance per part: the standard allowance for the units built, and the price effect (last price against standard)
  const units = a?.actual_units ?? 0;
  const priceChange = (l: BomLineRow) => (l.item_id && l.quantity * l.unit_cost > 0 ? (l.item_drift / (l.quantity * l.unit_cost)) * 100 : null);
  const lineVar = (l: BomLineRow) => ({ allow: l.quantity * (1 + l.scrap_pct / 100) * l.unit_cost * units, price: l.item_drift * units });
  const driftOf = (l: BomLineRow) => { const p = priceChange(l); return !l.item_id ? 'Sub-assembly' : p == null || Math.abs(p) <= 0.05 ? 'In line' : p > 0 ? 'Above standard' : 'Below standard'; };
  const driftTone = (l: BomLineRow): 'warning' | 'success' | 'muted' => { const p = priceChange(l) ?? 0; return p > 0.05 ? 'warning' : p < -0.05 ? 'success' : 'muted'; };
  const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '-' : ''}${money(Math.abs(x), currency)}`;
  const toneOf = (x: number): 'warning' | 'success' | 'muted' => (x > 0 ? 'warning' : x < 0 ? 'success' : 'muted');
  // Build plan month: how it is going against the plan, and the money that goes with it
  const nowYm = new Date().getFullYear() * 12 + new Date().getMonth();
  const planStatus = (m: PlanMonth): { label: string; tone: 'success' | 'warning' | 'muted' } => {
    const ym = m.year * 12 + (m.month - 1);
    if (ym > nowYm) return { label: 'Planned', tone: 'muted' };
    if (ym === nowYm) return { label: 'In progress', tone: 'muted' };
    if (m.planned === 0 && m.actual === 0) return { label: 'Not planned', tone: 'muted' };
    return m.actual > m.planned ? { label: 'Ahead', tone: 'success' } : m.actual === m.planned ? { label: 'On plan', tone: 'success' } : { label: 'Behind', tone: 'warning' };
  };
  const planMath = (m: PlanMonth) => ({
    plannedCost: m.planned * (a?.unit_cost ?? 0), builtCost: m.actual * (a?.unit_cost ?? 0), budget: m.planned * (a?.plan_unit_cost ?? 0),
    achieved: m.planned > 0 ? (m.actual / m.planned) * 100 : null,
  });

  const rows = useMemo<any[]>(() => {
    if (!data) return [];
    if (tab === 'bom') return data.lines.filter((l) => sourcing === 'ALL' || l.sourcing === sourcing);
    if (tab === 'operations') return data.operations;
    if (tab === 'plan') return data.build_plan.map((m) => ({ ...m, id: `${m.year}-${m.month}` }));
    if (tab === 'standard') return data.standards;
    return data.lines.filter((l) => sourcing === 'ALL' || l.sourcing === sourcing);
  }, [data, tab, sourcing]);

  const columns = useMemo<ColumnDef<any, any>[]>(() => {
    if (tab === 'bom') return [
      { accessorKey: 'part_no', header: 'Part', cell: ({ row }) => <IdCell value={row.original.part_no} />, size: 110 },
      { accessorKey: 'name', header: 'Name', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[320px] truncate" /> },
      { accessorKey: 'sourcing', header: 'Make / Buy', cell: ({ row }) => <TextCell value={sourcingText(row.original.sourcing)} />, size: 90 },
      { accessorKey: 'quantity', header: headerRight('Qty'), cell: ({ row }) => <Num>{row.original.quantity}</Num>, size: 80 },
      { accessorKey: 'scrap_pct', header: headerRight('Scrap'), cell: ({ row }) => <Num>{row.original.scrap_pct}%</Num>, size: 80 },
      { accessorKey: 'unit_cost', header: headerRight('Unit cost'), cell: ({ row }) => <Num>{unitPrice(row.original.unit_cost, currency)}</Num>, size: 110 },
      { accessorKey: 'amount', header: headerRight('Amount'), cell: ({ row }) => <Num strong>{unitPrice(row.original.amount, currency)}</Num>, size: 120 },
    ];
    if (tab === 'operations') return [
      { accessorKey: 'type_name', header: 'Operation', cell: ({ row }) => <TextCell value={row.original.type_name} strong /> },
      { accessorKey: 'role', header: 'Role', cell: ({ row }) => <TextCell value={row.original.role} muted />, size: 170 },
      { id: 'labour', header: headerRight('Labour'), cell: ({ row }) => <Num>{(row.original.is_outsourced || row.original.is_fixed) ? '—' : money(row.original.hours * row.original.rate, currency)}</Num>, size: 110 },
      { accessorKey: 'outsourced_cost', header: headerRight('Outsourced'), cell: ({ row }) => <Num>{row.original.outsourced_cost != null ? money(row.original.outsourced_cost, currency) : '—'}</Num>, size: 120 },
      { accessorKey: 'fixed_cost', header: headerRight('Fixed'), cell: ({ row }) => <Num>{row.original.fixed_cost != null ? money(row.original.fixed_cost, currency) : '—'}</Num>, size: 110 },
      { accessorKey: 'amount', header: headerRight('Direct cost'), cell: ({ row }) => <Num>{money(row.original.amount, currency)}</Num>, size: 120 },
      { id: 'overhead', header: headerRight('Overhead'), cell: ({ row }) => <Num>{(row.original.is_outsourced || row.original.is_fixed) ? '—' : money(row.original.hours * (data?.cost?.overhead_rate ?? 0), currency)}</Num>, size: 110 },
      { id: 'total', header: headerRight('Total'), cell: ({ row }) => <Num strong>{money(row.original.amount + ((row.original.is_outsourced || row.original.is_fixed) ? 0 : row.original.hours * (data?.cost?.overhead_rate ?? 0)), currency)}</Num>, size: 120 },
    ];
    if (tab === 'plan') return [
      { accessorKey: 'label', header: 'Month', cell: ({ row }) => <TextCell value={`${row.original.label} ${row.original.year}`} strong /> },
      { accessorKey: 'planned', header: headerRight('Planned units'), cell: ({ row }) => <Num>{row.original.planned}</Num>, size: 120 },
      { accessorKey: 'actual', header: headerRight('Built units'), cell: ({ row }) => <Num>{row.original.actual}</Num>, size: 110 },
      { id: 'achieved', header: headerRight('Achieved'), size: 100, cell: ({ row }) => { const st = planStatus(row.original).label; const p = st === 'Planned' ? null : planMath(row.original).achieved; return <div className="text-right"><ToneText label={p == null ? '—' : `${Math.round(p)}%`} tone={p == null || st === 'In progress' ? 'muted' : p >= 100 ? 'success' : p < 90 ? 'warning' : 'muted'} /></div>; } },
      { id: 'cost', header: headerRight('Planned cost'), cell: ({ row }) => <Num strong>{a ? money(planMath(row.original).plannedCost, currency) : '—'}</Num>, size: 130 },
      { id: 'built', header: headerRight('Built cost'), cell: ({ row }) => <Num>{row.original.actual ? money(planMath(row.original).builtCost, currency) : '—'}</Num>, size: 120 },
      { id: 'budget', header: headerRight('Material budget'), cell: ({ row }) => <Num>{a?.plan_unit_cost ? money(planMath(row.original).budget, currency) : '—'}</Num>, size: 130 },
      { id: 'spent', header: headerRight('Material spend'), cell: ({ row }) => <Num>{row.original.spend ? money(row.original.spend, currency) : '—'}</Num>, size: 120 },
      { id: 'status', header: 'Status', size: 110, cell: ({ row }) => { const s = planStatus(row.original); return <ToneText label={s.label} tone={s.tone} />; } },
    ];
    if (tab === 'standard') return [
      { accessorKey: 'created_at', header: 'Proposed', cell: ({ row }) => <DateCell value={row.original.created_at} />, size: 110 },
      { accessorKey: 'fy', header: 'Year', cell: ({ row }) => <TextCell value={fyText(row.original.fy)} />, size: 90 },
      { id: 'bom', header: headerRight('BOM (parts and scrap)'), cell: ({ row }) => <Num>{money(row.original.material + row.original.scrap, currency)}</Num>, size: 170 },
      { id: 'steps', header: headerRight('Build operations'), cell: ({ row }) => <Num>{money(row.original.conversion + row.original.fixed, currency)}</Num>, size: 120 },
      { accessorKey: 'overhead', header: headerRight('Overhead'), cell: ({ row }) => <Num>{money(row.original.overhead, currency)}</Num>, size: 120 },
      { accessorKey: 'freight', header: headerRight('Freight'), cell: ({ row }) => <Num>{money(row.original.freight, currency)}</Num>, size: 110 },
      { accessorKey: 'warranty', header: headerRight('Warranty'), cell: ({ row }) => <Num>{money(row.original.warranty, currency)}</Num>, size: 110 },
      { accessorKey: 'total', header: headerRight('Unit cost'), cell: ({ row }) => <Num strong>{money(row.original.total, currency)}</Num>, size: 120 },
      { accessorKey: 'status', header: 'Status', size: 110, cell: ({ row }) => { const s = row.original.status; return <ToneText label={s === 'APPROVED' ? 'Approved' : s === 'PROPOSED' ? 'Proposed' : s === 'REJECTED' ? 'Rejected' : 'Replaced'} tone={s === 'APPROVED' ? 'success' : s === 'PROPOSED' ? 'warning' : s === 'REJECTED' ? 'danger' : 'muted'} />; } },
      { accessorKey: 'approved_by_name', header: 'Approved by', cell: ({ row }) => <TextCell value={row.original.approved_by_name} muted /> },
    ];
    return [
      { accessorKey: 'part_no', header: 'Part', cell: ({ row }) => <IdCell value={row.original.part_no} />, size: 110 },
      { accessorKey: 'name', header: 'Name', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[300px] truncate" /> },
      { accessorKey: 'sourcing', header: 'Make / Buy', cell: ({ row }) => <TextCell value={sourcingText(row.original.sourcing)} />, size: 90 },
      { id: 'allow', header: headerRight('Standard allowance'), cell: ({ row }) => <Num>{money(lineVar(row.original).allow, currency)}</Num>, size: 150 },
      { id: 'pct', header: headerRight('Price change'), size: 120,
        cell: ({ row }) => { const p = priceChange(row.original); return <div className="text-right"><ToneText label={p == null ? '—' : `${p > 0 ? '+' : ''}${p.toFixed(1)}%`} tone={driftTone(row.original)} /></div>; } },
      { id: 'price', header: headerRight('Price variance'), size: 140,
        cell: ({ row }) => { const x = lineVar(row.original).price; return <div className="text-right"><ToneText label={signed(x)} tone={toneOf(x)} /></div>; } },
      { id: 'status', header: 'Status', size: 130, cell: ({ row }) => <ToneText label={driftOf(row.original)} tone={driftTone(row.original)} /> },
    ];
  }, [tab, currency, c, units, a?.unit_cost, a?.plan_unit_cost]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false,
    onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected: any = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const switchTab = (t: Tab) => { setTab(t); setSelection({}); };
  const newestStandardId = Math.max(0, ...(data?.standards.map((s) => s.id) ?? []));

  const itemActions: DetailActionDef[] = !selected ? [] :
    tab === 'bom' ? (isFinance ? [{ label: 'Edit', onClick: () => { setEditBom(selected); setBomOpen(true); } }, { label: 'Delete', variant: 'danger', onClick: () => setDelBom(selected) }] : []) :
    tab === 'operations' ? (isFinance ? [{ label: 'Edit', onClick: () => { setEditOp(selected); setOpOpen(true); } }, { label: 'Delete', variant: 'danger', onClick: () => setDelOp(selected) }] : []) :
    tab === 'plan' ? [{ label: 'Edit', onClick: () => { setEditPlan(selected); setPlanOpen(true); } }] :
    tab === 'standard' && selected.status === 'PROPOSED' && selected.id === newestStandardId && isFinance ? [{ label: 'Approve', variant: 'primary', onClick: () => setApprove(selected.id) }, { label: 'Reject', variant: 'danger', onClick: () => setReject(selected.id) }] : [];

  const standardToApprove = data?.standards.find((s) => s.id === approve) ?? null;
  const standardToReject = data?.standards.find((s) => s.id === reject) ?? null;
  const staleYear = data?.approved != null && data.approved.fy < data.fy;

  const costSummary = (
    <div className="space-y-4">
      <DetailSummary title={data?.product.name ?? 'Product'} subtitle={data?.product.code ?? undefined} status={std != null ? `Standard cost ${money(std, currency)}` : 'No approved standard cost'}
        statusClass={std != null && c && c.total > std * 1.05 ? 'text-[var(--warning)]' : 'text-[var(--shell-text-muted)]'} figure={money(c?.total, currency)} figureLabel="Unit cost" />
      <DetailSection title="Cost per unit">
        <DetailGrid>
          <DetailField label="Material" value={money(c?.material, currency)} />
          <DetailField label="Scrap" value={money(c?.scrap, currency)} />
          <DetailField label={`Freight and handling${data?.bom ? ` (${data.bom.freight_pct}%)` : ''}`} value={money(c?.freight, currency)} />
          <DetailField label="Build operations" value={money((c?.conversion ?? 0) + (c?.fixed ?? 0), currency)} />
          <DetailField label={c ? `Overhead (${money(c.overhead_rate, currency)}/h)` : 'Overhead'} value={money(c?.overhead, currency)} />
          <DetailField label={`Warranty${data?.bom ? ` (${data.bom.warranty_pct}%)` : ''}`} value={money(c?.warranty, currency)} />
        </DetailGrid>
        {data?.bom?.adjust_reason && <p className="text-[12px] text-[var(--warning)]">Adjusted from the defaults: {data.bom.adjust_reason}</p>}
        {c?.pool_missing && !data?.bom?.overhead_rate_override && <p role="alert" className="text-[12px] text-[var(--warning)]">There are no overhead pools for {fyText(c.fy)}, so this cost carries no overhead. Add them under Cost rates.</p>}
        {staleYear && data?.approved && <p role="alert" className="text-[12px] text-[var(--warning)]">The approved standard cost is for {fyText(data.approved.fy)}. Propose a new one for {fyText(data.fy)}.</p>}
      </DetailSection>
      {pr && (
        <DetailSection title={`Price and margin, ${fyText(pr.fy)}`}>
          {pr.price == null && pr.target_margin_pct == null && pr.min_margin_pct == null ? (
            <p className="text-[12px] text-[var(--shell-text-muted)]">No selling price is set for {fyText(pr.fy)}.{isFinance ? ' Use Price and costing to add one.' : ' Ask Finance to add one.'}</p>
          ) : (
            <>
              <DetailGrid>
                <DetailField label="Selling price" value={pr.price != null ? money(pr.price, currency) : 'Not set'} />
                <DetailField label="Cost per unit" value={pr.unit_cost > 0 ? money(pr.unit_cost, currency) : undefined} />
                <DetailField label="Profit per unit" value={pr.profit_unit != null ? signed(pr.profit_unit) : undefined} tone={pr.profit_unit != null && pr.profit_unit < 0 ? 'danger' : 'muted'} />
                <DetailField label="Margin" value={pr.margin_pct != null ? `${pr.margin_pct.toFixed(1)}%` : undefined} tone={marginTone(pr.margin_pct, pr.target_margin_pct, pr.min_margin_pct)} />
                <DetailField label="Target margin" value={pr.target_margin_pct != null ? `${pr.target_margin_pct}%` : 'Not set'} />
                <DetailField label="Minimum margin" value={pr.min_margin_pct != null ? `${pr.min_margin_pct}%` : 'Not set'} />
                {pr.margin_at_rolled_pct != null && pr.rolled_cost != null && Math.abs(pr.rolled_cost - pr.unit_cost) > 0.5 && (
                  <DetailField wide label="Margin at today's cost" value={`${pr.margin_at_rolled_pct.toFixed(1)}% (cost ${money(pr.rolled_cost, currency)})`} tone={marginTone(pr.margin_at_rolled_pct, pr.target_margin_pct, pr.min_margin_pct)} />
                )}
                {pr.price_for_target != null && (pr.price == null || Math.abs(pr.price - pr.price_for_target) > 0.5) && (
                  <DetailField wide label="Price for the target margin" value={money(pr.price_for_target, currency)} />
                )}
              </DetailGrid>
              {pr.margin_pct != null && pr.margin_pct < 0 && <p role="alert" className="text-[12px] text-[var(--danger)]">The cost per unit is above the selling price, so each unit sold makes a loss.</p>}
              {pr.margin_pct != null && pr.margin_pct >= 0 && pr.min_margin_pct != null && pr.margin_pct < pr.min_margin_pct && (
                <p role="alert" className="text-[12px] text-[var(--danger)]">Margin is below the minimum of {pr.min_margin_pct}%.{pr.price_for_min != null ? ` A price of ${money(pr.price_for_min, currency)} or more would meet it.` : ''}</p>
              )}
              {pr.margin_pct != null && (pr.min_margin_pct == null || pr.margin_pct >= pr.min_margin_pct) && pr.target_margin_pct != null && pr.margin_pct < pr.target_margin_pct && (
                <p className="text-[12px] text-[var(--warning)]">Margin is below the target of {pr.target_margin_pct}%.{pr.price_for_target != null ? ` A price of ${money(pr.price_for_target, currency)} would reach it.` : ''}</p>
              )}
              {pr.margin_at_rolled_pct != null && pr.margin_pct != null && pr.margin_at_rolled_pct < pr.margin_pct - 0.05 && pr.rolled_cost != null && Math.abs(pr.rolled_cost - pr.unit_cost) > 0.5 && (
                <p className="text-[12px] text-[var(--warning)]">Parts or rates have moved since the standard cost was approved. At today's cost of {money(pr.rolled_cost, currency)} the margin would be {pr.margin_at_rolled_pct.toFixed(1)}%. The selling price stays as set.</p>
              )}
              <p className="text-[12px] text-[var(--shell-text-muted)]">Margin is the profit per unit as a share of the selling price. {pr.basis === 'STANDARD' ? 'Cost is the approved standard cost.' : 'No standard cost is approved yet, so cost is the current rolled-up cost.'}</p>
            </>
          )}
        </DetailSection>
      )}
      {tab === 'plan' && a && (
        <DetailSection title="Year">
          <DetailGrid>
            <DetailField label="Planned units" value={a.planned_units} />
            <DetailField label="Built units" value={a.actual_units} />
            <DetailField label="Year cost at standard" value={money(a.budget, currency)} />
            <DetailField label="For the budget plan (E200)" value={money(a.plan_budget, currency)} />
            {pr?.planned_revenue != null && <DetailField label="Planned sales" value={money(pr.planned_revenue, currency)} />}
            {pr?.planned_profit != null && <DetailField label="Planned profit" value={signed(pr.planned_profit)} tone={pr.planned_profit < 0 ? 'danger' : 'muted'} />}
            {pr?.built_revenue != null && a.actual_units > 0 && <DetailField label="Sales at built units" value={money(pr.built_revenue, currency)} />}
            {pr?.built_profit != null && a.actual_units > 0 && <DetailField label="Profit at built units" value={signed(pr.built_profit)} tone={pr.built_profit < 0 ? 'danger' : 'muted'} />}
          </DetailGrid>
          <p className="text-[12px] text-[var(--shell-text-muted)]">{a.basis === 'STANDARD' ? 'Year cost uses the approved standard cost.' : 'There is no approved standard yet, so year cost uses the current rolled-up cost.'} The budget plan gets the bought part only: material, scrap, freight and outsourced work. Labour and overhead are not product expenses.</p>
          {data?.plan_status !== 'DRAFT' && <p className="text-[12px] text-[var(--warning)]">{data?.plan_status ? `The current plan is ${data.plan_status.toLowerCase()}, so its lines are locked. Ask Finance to raise a budget change for this product.` : 'There is no budget plan for the current year yet.'}</p>}
          {data && data.plan_status && !data.budget_line && <p className="text-[12px] text-[var(--warning)]">This product has no E200 budget line in the current plan, so its purchases are not checked against a budget. Add to budget plan creates one while the plan is a draft; otherwise ask Finance to raise a budget change.</p>}
        </DetailSection>
      )}
    </div>
  );

  const spend = v?.spend_variance ?? 0; const price = v?.price_variance ?? 0; const usage = spend - price;
  const topPrice = (data?.lines ?? []).filter((l) => l.item_drift > 0.005).sort((x, y) => y.item_drift - x.item_drift).slice(0, 3).map((l) => l.name);
  const notes: string[] = [];
  if (!units) notes.push('No units built yet. Enter built units on the Build plan tab to measure variances.');
  else if (Math.abs(spend) < 1) notes.push('Spend on materials and outsourced work is on the standard.');
  else if (spend > 0) {
    const pct = v && v.standard_material_for_units > 0 ? (spend / v.standard_material_for_units) * 100 : 0;
    notes.push(`Spend on materials and outsourced work is ${pct.toFixed(1)}% (${money(spend, currency)}) over the standard for ${units} units built.`);
    if (price >= usage) notes.push(`Price is the main driver${topPrice.length ? `: ${topPrice.join(', ')} cost more than standard` : ''}. Recommendation: check supplier quotes. If the increase is lasting, update the item standard price and propose a new standard cost.`);
    else notes.push('Quantity and scrap are the main driver: more material is used than the BOM allows. Recommendation: check scrap and BOM quantities on the shop floor, and look for purchases the BOM does not plan for.');
  } else notes.push(`Spend on materials and outsourced work is ${money(-spend, currency)} under the standard. Recommendation: confirm every material purchase for this product is recorded against its budget line, since savings can also mean missing invoices.`);
  notes.push('Only approved expenses of type E200 (materials and production) charged to this product in the current financial year are counted. Purchases charged elsewhere are not included.');

  const varianceSummary = (
    <div className="space-y-4">
      <DetailSummary title="Material variance" subtitle={`${units} units built`} status={!units ? undefined : spend > 0 ? 'Over the standard' : 'Within the standard'}
        statusClass={spend > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'} figure={signed(spend)} figureLabel="Spend variance" />
      <DetailSection title="This year">
        <DetailGrid>
          <DetailField label="Spent (E200)" value={money(v?.actual_spend, currency)} />
          <DetailField label="Standard allows" value={money(v?.standard_material_for_units, currency)} />
        </DetailGrid>
        <p className="text-[12px] text-[var(--shell-text-muted)]">The standard covers material, scrap, freight and outsourced work for the units built. Per-part allowances in the table cover parts and scrap only.</p>
        {v?.basis === 'ROLLED' && <p className="text-[12px] text-[var(--warning)]">There is no approved standard yet, so the current cost is used.</p>}
        {v?.bom_changed && <p className="text-[12px] text-[var(--warning)]">The BOM has changed since the standard was approved. Totals use the approved standard; the per-part figures use the current BOM.</p>}
      </DetailSection>
      <DetailSection title="The three variances">
        <DetailGrid>
          <DetailField label="Spend" value={signed(spend)} tone={toneOf(spend)} />
          <DetailField label="Price" value={signed(price)} tone={toneOf(price)} />
          <DetailField label="Usage (quantity and scrap)" value={signed(usage)} tone={toneOf(usage)} wide />
        </DetailGrid>
        <p className="text-[12px] text-[var(--shell-text-muted)]">Spend = price + usage. Usage is what price does not explain. Purchases are not yet tagged to single parts, so usage is shown for the whole product.</p>
      </DetailSection>
      <DetailSection title="What is going on">
        {notes.map((n, i) => <p key={i} className="text-[13px] text-[var(--shell-text)]">{n}</p>)}
      </DetailSection>
    </div>
  );

  const detail = (() => {
    if (!selected) return null;
    if (tab === 'variances') {
      const l = selected as BomLineRow;
      const r = lineVar(l);
      return (
        <div className="space-y-4">
          <DetailSummary title={l.name} subtitle={`${l.part_no} · ${sourcingText(l.sourcing)}`} status={driftOf(l)} statusClass={driftTone(l) === 'warning' ? 'text-[var(--warning)]' : driftTone(l) === 'success' ? 'text-[var(--success)]' : 'text-[var(--shell-text-muted)]'}
            figure={signed(r.price)} figureLabel="Price variance" />
          <DetailSection title="Standard">
            <DetailGrid>
              <DetailField label="Qty per unit, with scrap" value={(l.quantity * (1 + l.scrap_pct / 100)).toFixed(2)} />
              <DetailField label="Standard unit cost" value={unitPrice(l.unit_cost, currency)} />
              <DetailField label="Standard allowance" value={money(r.allow, currency)} />
              <DetailField label="Price change" value={priceChange(l) == null ? undefined : `${(priceChange(l) ?? 0) > 0 ? '+' : ''}${(priceChange(l) ?? 0).toFixed(1)}%`} tone={driftTone(l)} />
            </DetailGrid>
          </DetailSection>
          <DetailSection title="What to do"><p className="text-[13px] text-[var(--shell-text)]">{advice(l, priceChange(l))}</p></DetailSection>
        </div>
      );
    }
    if (tab === 'bom') {
      const l = selected as BomLineRow;
      return (
        <div className="space-y-4">
          <DetailSummary title={l.name} subtitle={`${l.part_no} · ${sourcingText(l.sourcing)}`} figure={unitPrice(l.amount, currency)} figureLabel="Line cost" />
          <DetailSection title="Line">
            <DetailGrid>
              <DetailField label="Quantity" value={l.quantity} />
              <DetailField label="Scrap" value={`${l.scrap_pct}%`} />
              <DetailField label="Unit cost" value={unitPrice(l.unit_cost, currency)} />
              <DetailField label="Sourcing" value={sourcingText(l.sourcing)} />
              {Math.abs(l.item_drift) > 0.005 && <DetailField label="Price drift per unit" value={`${l.item_drift > 0 ? '+' : ''}${money(l.item_drift, currency)}`} tone={l.item_drift > 0 ? 'warning' : 'success'} wide />}
            </DetailGrid>
          </DetailSection>
        </div>
      );
    }
    if (tab === 'operations') {
      const o = selected as OperationRow;
      const ohRate = data?.cost?.overhead_rate ?? 0;
      const oh = (o.is_outsourced || o.is_fixed) ? 0 : o.hours * ohRate;
      return (
        <div className="space-y-4">
          <DetailSummary title={o.type_name} subtitle={o.is_fixed ? 'Fixed cost' : o.is_outsourced ? 'Outsourced' : 'In-house'} figure={money(o.amount + oh, currency)} figureLabel="Operation cost" />
          <DetailSection title="Cost">
            <DetailGrid>
              {o.is_fixed ? <DetailField label="Fixed cost per unit" value={money(o.fixed_cost, currency)} wide /> : o.is_outsourced ? <DetailField label="Outsourced cost" value={o.outsourced_cost != null ? money(o.outsourced_cost, currency) : '—'} wide /> : (
                <>
                  <DetailField label="Role" value={o.role} wide />
                  <DetailField label="Cost per hour" value={o.rate ? money(o.rate, currency) : '—'} />
                  <DetailField label="Hours per unit" value={o.hours} />
                  <DetailField label="Labour (hours × cost per hour)" value={money(o.hours * o.rate, currency)} />
                  <DetailField label={`Overhead (${money(ohRate, currency)}/h)`} value={money(oh, currency)} />
                </>
              )}
            </DetailGrid>
          </DetailSection>
        </div>
      );
    }
    if (tab === 'plan') {
      const m = selected as PlanMonth;
      const st = planStatus(m); const pm = planMath(m);
      const diff = m.actual - m.planned; const left = pm.budget - m.spend;
      const ap = data?.approved ?? null;
      const split = ap ? [['Material (BOM)', ap.material], ['Scrap (BOM)', ap.scrap], ['Build operations', ap.conversion + ap.fixed], ['Overhead', ap.overhead], ['Freight and handling', ap.freight], ['Warranty', ap.warranty]] as const : [];
      const notes: string[] = [];
      if (st.label === 'Planned') notes.push('This month is still ahead. Nothing is built yet.');
      else if (st.label === 'In progress') notes.push('This month is in progress. Built units are the count so far.');
      else if (diff < 0) notes.push(`${Math.abs(diff)} fewer than planned were built. Check capacity and parts availability, and if the shortfall carries over, update the next months.`);
      else if (diff > 0) notes.push(`${diff} more than planned were built. Check that the E200 budget for the month can cover the extra material.`);
      else if (m.planned > 0) notes.push('Built units match the plan.');
      if (pm.budget > 0 && m.spend > pm.budget) notes.push(`Spend on bought items is ${money(m.spend - pm.budget, currency)} over this month's E200 budget.`);
      else if (pm.budget > 0 && m.spend > 0) notes.push(`Spend on bought items is within this month's E200 budget, with ${money(left, currency)} left.`);
      return (
        <div className="space-y-4">
          <DetailSummary title={`${m.label} ${m.year}`} subtitle="Build plan" status={st.label} statusClass={st.tone === 'success' ? 'text-[var(--success)]' : st.tone === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--shell-text-muted)]'} figure={a ? money(pm.plannedCost, currency) : '—'} figureLabel="Planned cost" />
          <DetailSection title="Units">
            <DetailGrid>
              <DetailField label="Planned" value={m.planned} />
              <DetailField label="Built" value={m.actual} />
            </DetailGrid>
          </DetailSection>
          <DetailSection title="Cost at standard">
            <DetailGrid>
              <DetailField label="Planned" value={money(pm.plannedCost, currency)} />
              <DetailField label="Built" value={m.actual ? money(pm.builtCost, currency) : undefined} />
            </DetailGrid>
          </DetailSection>
          {pr?.price != null && (
            <DetailSection title="Sales at the planned price">
              <DetailGrid>
                <DetailField label="Planned sales" value={m.planned ? money(pr.price * m.planned, currency) : undefined} />
                <DetailField label="Planned profit" value={m.planned && pr.profit_unit != null ? signed(pr.profit_unit * m.planned) : undefined} tone={pr.profit_unit != null && pr.profit_unit < 0 ? 'danger' : 'muted'} />
                <DetailField label="Sales at built units" value={m.actual ? money(pr.price * m.actual, currency) : undefined} />
                <DetailField label="Profit at built units" value={m.actual && pr.profit_unit != null ? signed(pr.profit_unit * m.actual) : undefined} tone={pr.profit_unit != null && pr.profit_unit < 0 ? 'danger' : 'muted'} />
              </DetailGrid>
            </DetailSection>
          )}
          <DetailSection title="Bought items (budget line E200)">
            <DetailGrid>
              <DetailField label="Budget" value={a?.plan_unit_cost ? money(pm.budget, currency) : undefined} />
              <DetailField label={left >= 0 ? 'Left' : 'Over'} value={pm.budget > 0 ? money(Math.abs(left), currency) : undefined} tone={left < 0 ? 'danger' : 'muted'} />
            </DetailGrid>
          </DetailSection>
          {ap && m.planned > 0 && (
            <DetailSection title="Planned cost by type">
              <DetailAllocation
                items={split.map(([label, v]) => ({ label, amount: money(v * m.planned, currency), pct: ap.total > 0 ? (v / ap.total) * 100 : 0 }))}
                total={<span className="text-[12px] text-[var(--shell-text-muted)]">Total {money(ap.total * m.planned, currency)}</span>}
              />
            </DetailSection>
          )}
          {notes.length > 0 && <DetailSection title="What is going on">{notes.map((t, i) => <p key={i} className="text-[13px] text-[var(--shell-text)]">{t}</p>)}</DetailSection>}
        </div>
      );
    }
    const s = selected as Standard;
    return (
      <div className="space-y-4">
        <DetailSummary title={`Standard cost ${fyText(s.fy)}`} status={s.status === 'APPROVED' ? 'Approved' : s.status === 'PROPOSED' ? 'Proposed' : s.status === 'REJECTED' ? 'Rejected' : 'Replaced'}
          statusClass={s.status === 'APPROVED' ? 'text-[var(--success)]' : s.status === 'PROPOSED' ? 'text-[var(--warning)]' : s.status === 'REJECTED' ? 'text-[var(--danger)]' : 'text-[var(--shell-text-muted)]'} figure={money(s.total, currency)} figureLabel="Unit cost" />
        <DetailSection title="Cost per unit">
          <DetailAllocation
            items={[
              { label: 'Material (BOM)', amount: money(s.material, currency), pct: s.total > 0 ? (s.material / s.total) * 100 : 0 },
              { label: 'Scrap (BOM)', amount: money(s.scrap, currency), pct: s.total > 0 ? (s.scrap / s.total) * 100 : 0 },
              { label: 'Build operations', amount: money(s.conversion + s.fixed, currency), pct: s.total > 0 ? ((s.conversion + s.fixed) / s.total) * 100 : 0 },
              { label: 'Overhead', amount: money(s.overhead, currency), pct: s.total > 0 ? (s.overhead / s.total) * 100 : 0 },
              { label: 'Freight and handling', amount: money(s.freight, currency), pct: s.total > 0 ? (s.freight / s.total) * 100 : 0 },
              { label: 'Warranty', amount: money(s.warranty, currency), pct: s.total > 0 ? (s.warranty / s.total) * 100 : 0 },
            ]}
            total={<span className="text-[12px] text-[var(--shell-text-muted)]">Total {money(s.total, currency)}</span>}
          />
        </DetailSection>
        <DetailSection title="History">
          <DetailGrid cols={1}>
            <DetailField label="Proposed by" value={s.proposed_by_name ? `${s.proposed_by_name}, ${formatDate(s.created_at)}` : formatDate(s.created_at)} />
            <DetailField label="Approved by" value={s.approved_by_name ? `${s.approved_by_name}, ${formatDate(s.approved_at!)}` : undefined} />
            {s.status === 'REJECTED' && <DetailField label="Rejected by" value={`${s.rejected_by_name ?? ''}${s.rejected_at ? `, ${formatDate(s.rejected_at)}` : ''}`} />}
          </DetailGrid>
          {s.reject_reason && <p className="text-[12px] text-[var(--danger)]">Rejected: {s.reject_reason}</p>}
        </DetailSection>
        {s.overhead_rate != null && (
          <DetailSection title="Built with">
            <DetailGrid>
              <DetailField label="Overhead per hour" value={money(s.overhead_rate, currency)} />
              <DetailField label="Freight and handling" value={s.freight_pct != null ? `${s.freight_pct}%` : undefined} />
              <DetailField label="Warranty" value={s.warranty_pct != null ? `${s.warranty_pct}%` : undefined} />
            </DetailGrid>
            {s.adjust_reason && <p className="text-[12px] text-[var(--warning)]">Adjusted from the defaults: {s.adjust_reason}</p>}
          </DetailSection>
        )}
      </div>
    );
  })();

  const alwaysActions: DetailActionDef[] = [
    ...(tab === 'bom' && isFinance ? [{ label: 'Add part', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditBom(null); setBomOpen(true); } }] : []),
    ...(tab === 'operations' && isFinance ? [{ label: 'Add build operation', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditOp(null); setOpOpen(true); } }] : []),
    ...(tab === 'operations' && isFinance ? [{ label: 'Manage operation types', icon: <Settings2 className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setTypesOpen(true) }] : []),
    ...(tab === 'plan' && isFinance ? [{ label: 'Add to budget plan', icon: <CalendarPlus className="h-4 w-4 text-[var(--nav-cyan)]" />, disabled: data?.plan_status !== 'DRAFT', onClick: () => setPlanConfirm(true) }] : []),
    ...(tab === 'standard' && isFinance && data && data.lines.length > 0 ? [{ label: 'Propose standard cost', icon: <Calculator className="h-4 w-4 text-[var(--info)]" />, onClick: () => act(() => api.post(`/budgets/products/${id}/standard-cost`, {}), 'Standard cost proposed. Approve it on the Standard cost tab.') }] : []),
    ...(isFinance && data ? [{ label: 'Price and costing', icon: <Tag className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setPricingOpen(true) }] : []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<Tab> value={tab} onChange={switchTab} tabs={TABS} />
      <div className="min-h-0 flex-1">
        <ModuleShell
          showPanel={!!selected}
          searchRow={
            <DataTableToolbar
              table={table}
              actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>}
              filterDefs={tab === 'bom' || tab === 'variances' ? [
                { id: 'sourcing', label: 'Make or buy', value: sourcing, onChange: (v) => { setSourcing(v); setSelection({}); }, options: [{ value: 'ALL', label: 'Make and buy' }, { value: 'MAKE', label: 'Make' }, { value: 'BUY', label: 'Buy' }] },
              ] : undefined}
            />
          }
          intelligencePanel={
            <ModuleIntelligencePanel title={selected ? (tab === 'operations' ? 'Build operation' : tab === 'standard' ? 'Standard cost' : tab === 'plan' ? 'Month' : 'Part') : 'Product cost'} onClose={() => setSelection({})} hasSelection={!!selected}
              idle={tab === 'variances' ? varianceSummary : costSummary} footer={itemActions.length ? <DetailActions actions={itemActions} /> : undefined}>
              {detail}
            </ModuleIntelligencePanel>
          }
        >
          <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={EMPTY[tab]} />
        </ModuleShell>
      </div>

      <BomLineModal isOpen={bomOpen} onClose={() => setBomOpen(false)} data={data} editing={editBom} />
      <BuildStepModal isOpen={opOpen} onClose={() => setOpOpen(false)} data={data} editing={editOp} />
      <StepTypesModal isOpen={typesOpen} onClose={() => setTypesOpen(false)} types={data?.operation_types ?? []} />
      <BuildPlanModal isOpen={planOpen} onClose={() => setPlanOpen(false)} productId={id} editing={editPlan} />
      <ProductPricingModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} data={data} />
      <RejectCostModal isOpen={reject != null} onClose={() => { setReject(null); setSelection({}); }} data={data} standard={standardToReject} />
      <StandardCostModal isOpen={approve != null} onClose={() => { setApprove(null); setSelection({}); }} data={data} standard={standardToApprove} />
      <ConfirmDialog open={!!delBom} destructive title="Remove part" message={`Remove ${delBom?.name} from the BOM?`} confirmLabel="Remove" onCancel={() => setDelBom(null)}
        onConfirm={async () => { const l = delBom; setDelBom(null); if (l) { await act(() => api.delete(`/budgets/bom-lines/${l.id}`), 'Part removed.'); setSelection({}); } }} />
      <ConfirmDialog open={!!delOp} destructive title="Remove build operation" message={`Remove ${delOp?.type_name ?? delOp?.name}?`} confirmLabel="Remove" onCancel={() => setDelOp(null)}
        onConfirm={async () => { const o = delOp; setDelOp(null); if (o) { await act(() => api.delete(`/budgets/operations/${o.id}`), 'Build operation removed.'); setSelection({}); } }} />
      <ConfirmDialog open={planConfirm} title="Add to budget plan" confirmLabel="Add to plan" message={`Write ${money(a?.plan_budget, currency)} (planned units × the bought part of the approved standard: material, scrap, freight and outsourced work) into the current year’s draft plan as this product’s E200 line. Labour and overhead are not included.`}
        onCancel={() => setPlanConfirm(false)} onConfirm={async () => { setPlanConfirm(false); await act(() => api.post(`/budgets/products/${id}/to-plan`, {}), 'Product line updated in the plan.'); }} />
    </div>
  );
}
