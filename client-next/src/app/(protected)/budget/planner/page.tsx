'use client';

import { canPropose } from '@/lib/permissions';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, Send, CheckCircle2, CornerUpLeft, Settings2, FilePlus2, FolderOpen, Plus } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useDepartments, useInvalidate } from '@/hooks/use-queries';
import { useBudgetMonitor, useBudgetPlan, useBudgetPlans, useBudgetSettings, type MonitorLine } from '@/hooks/use-budget-queries';
import { useBudgetChanges, useBudgetProducts, useBudgetProjects } from '@/hooks/use-planning-queries';
import { useBuildOrders } from '@/hooks/use-build-orders';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { IdCell, TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { BudgetLineModal, NewPlanModal, PlanDecisionModal, PlanDetailsModal } from '@/components/budgets/budget-modals';
import { Kpi, KpiStrip, PlanStatusText, TabBar, UtilBar, fyOptions, money, plain, useTabParam } from '@/components/budgets/budget-ui';
import { KIND_COST_OBJECT, KIND_LABEL, STATUS_TONE, changesFor, detailHref, linesOf, rollUp, statusSort, type ObjectStatus, type PlannerKind } from '@/components/budgets/planner-objects';

type Tab = 'projects' | 'products' | 'orders' | 'overheads';
const TABS: { value: Tab; label: string }[] = [{ value: 'projects', label: 'Projects' }, { value: 'products', label: 'Products' }, { value: 'orders', label: 'Orders' }, { value: 'overheads', label: 'Overheads' }];
const TAB_KIND: Record<Tab, PlannerKind> = { projects: 'project', products: 'product', orders: 'order', overheads: 'overhead' };
const EMPTY: Record<Tab, string> = {
  projects: 'No projects yet. Add them under Manage, then plan their budget here.',
  products: 'No products yet. Add them under Manage, then plan their budget here.',
  orders: 'No orders yet. Commit an order under Order costing, then plan its budget here.',
  overheads: 'No departments yet.',
};

interface ObjRow { key: string; kind: PlannerKind; id: number; code: string | null; name: string; client: string | null; lines: MonitorLine[]; r: ReturnType<typeof rollUp>; waiting: number }

const Whole = ({ value, currency }: { value: number; currency: string }) => <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{plain(value, currency)}</div>;

export default function BudgetPlannerPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const role = (user?.role_name || '').toUpperCase();
  const isFinance = role === 'ADMIN' || role === 'FINANCE';
  const canPlan = canPropose(role); // Operations prepares the plan; Finance and Admin also approve and delete it
  const currency = user?.currency || 'INR';
  const invalidate = useInvalidate();

  const { data: plansData } = useBudgetPlans();
  const { data: settings } = useBudgetSettings();
  const startMonth = settings?.fy_start_month ?? 4;
  const [fy, setFy] = useState<number | null>(null);
  useEffect(() => { if (fy == null && plansData) setFy(plansData.current_fy); }, [plansData, fy]);
  const planExists = !!plansData?.plans.some((p) => p.fy === fy);
  const { data: view } = useBudgetPlan(planExists ? fy : null);
  const plan = view?.plan;
  const draft = plan?.status === 'DRAFT';
  const canEditLines = role !== 'CONFIGURATOR' && !!plan && (draft || (isFinance && (plan.status === 'APPROVED' || plan.status === 'ACTIVE')));

  const { data: mon, isLoading } = useBudgetMonitor(fy);
  const { data: projects } = useBudgetProjects();
  const { data: products } = useBudgetProducts();
  const { data: orders } = useBuildOrders();
  const { data: departments } = useDepartments();
  const { data: pending } = useBudgetChanges('PENDING');

  const [tab, setTab] = useTabParam<Tab>(['projects', 'products', 'orders', 'overheads'], 'projects');
  const [budget, setBudget] = useState('ALL');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'rank', desc: false }]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [lineFor, setLineFor] = useState<ObjRow | null>(null);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [decision, setDecision] = useState<'approve' | 'send_back' | null>(null);
  const [deletePlan, setDeletePlan] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  useEffect(() => { setHeader('Budget planner', 'Plan the year for each project, product, order and overhead'); }, [setHeader]);
  useEffect(() => { setSelection({}); }, [tab, fy]);

  const allLines = mon?.lines ?? [];
  const pendingRows = pending?.rows ?? [];
  const make = (kind: PlannerKind, id: number, code: string | null, name: string, client: string | null): ObjRow => {
    const lines = linesOf(allLines, kind, id);
    return { key: `${kind}-${id}`, kind, id, code, name, client, lines, r: rollUp(lines), waiting: changesFor(pendingRows, lines.map((l) => l.id)).length };
  };
  const all = useMemo<ObjRow[]>(() => {
    if (tab === 'projects') return (projects ?? []).map((p) => make('project', p.id, p.code, p.name, p.client_name));
    if (tab === 'products') return (products ?? []).map((p) => make('product', p.id, p.code, p.name, p.client_name));
    if (tab === 'orders') return (orders ?? []).filter((o) => o.status !== 'CANCELLED').map((o) => make('order', o.id, o.code, `${o.product_name ?? 'Order'} × ${o.quantity}`, o.client_name));
    return [...(departments ?? []).map((d) => make('overhead', d.id, null, d.name, null)), make('reserve', 0, null, 'Company reserve', null)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, projects, products, orders, departments, mon, pending]);
  const rows = useMemo(() => all.filter((o) => (budget === 'ALL' ? true : budget === 'NONE' ? o.r.count === 0 : budget === 'ATTENTION' ? ['Warning', 'Critical'].includes(o.r.status) : o.r.count > 0)), [all, budget]);

  const columns = useMemo<ColumnDef<ObjRow, any>[]>(() => [
    ...(tab === 'overheads' ? [] : [{ id: 'code', accessorFn: (o: ObjRow) => o.code ?? '', header: 'Code', cell: ({ row }: any) => <IdCell value={row.original.code} />, size: 90 } as ColumnDef<ObjRow, any>]),
    { accessorKey: 'name', header: tab === 'orders' ? 'Product' : 'Name', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[180px] truncate" />, size: 190 },
    ...(tab === 'overheads' ? [] : [{ accessorKey: 'client', header: tab === 'orders' ? 'Customer' : 'Client', cell: ({ row }: any) => <TextCell value={row.original.client} muted className="block max-w-[120px] truncate" />, size: 130 } as ColumnDef<ObjRow, any>]),
    { id: 'status', header: 'Status', size: 100, accessorFn: (o) => o.r.status, cell: ({ row }) => <ToneText label={row.original.r.status} tone={STATUS_TONE[row.original.r.status as ObjectStatus]} /> },
    { id: 'rank', header: 'Rank', accessorFn: (o) => statusSort(o.r.status), cell: () => null, enableHiding: true },
    { id: 'planned', header: headerRight('Budget'), size: 100, accessorFn: (o) => o.r.planned, cell: ({ row }) => (row.original.r.count ? <Whole value={row.original.r.planned} currency={currency} /> : <div className="text-right"><TextCell value="—" muted /></div>) },
    { id: 'used', header: headerRight('Used'), size: 100, accessorFn: (o) => o.r.used, cell: ({ row }) => (row.original.r.count ? <Whole value={row.original.r.used} currency={currency} /> : <div className="text-right"><TextCell value="—" muted /></div>) },
    {
      id: 'pct', header: 'Used %', size: 110, accessorFn: (o) => o.r.pct,
      cell: ({ row }) => row.original.r.count ? (
        <div className="flex items-center gap-2">
          <UtilBar pct={row.original.r.pct} className="w-14" />
          <span className="w-10 text-right text-[13px] tabular-nums">{row.original.r.pct >= 999 ? '—' : `${Math.round(row.original.r.pct)}%`}</span>
        </div>
      ) : <TextCell value="" />,
    },
  ], [tab, currency]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection, columnVisibility: { rank: false } }, onSortingChange: setSorting, getRowId: (r) => r.key,
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((r) => r.key === Object.keys(selection)[0]) ?? null;

  const filterDefs: FilterDef[] = [
    { id: 'fy', label: 'Financial year', value: fy == null ? '' : String(fy), onChange: (v) => setFy(Number(v)), defaultValue: plansData?.current_fy != null ? String(plansData.current_fy) : undefined, options: fyOptions(plansData?.plans ?? [], plansData?.current_fy, startMonth) },
    { id: 'budget', label: 'Budget', value: budget, onChange: setBudget, options: [{ value: 'ALL', label: 'All' }, { value: 'WITH', label: 'With a budget' }, { value: 'NONE', label: 'No budget yet' }, { value: 'ATTENTION', label: 'Needs attention' }] },
  ];

  const submitPlan = async () => {
    if (!plan) return;
    try { await api.post(`/budgets/plans/${plan.fy}/submit`, {}); toast.success('Plan submitted for approval.'); invalidate('budgets'); } catch (err: any) { toast.error(err?.message || 'Could not submit the plan.'); } finally { setSubmitOpen(false); }
  };
  const removePlan = async () => {
    if (!plan) return;
    try { await api.delete(`/budgets/plans/${plan.fy}`); toast.success('Plan deleted.'); invalidate('budgets'); setFy(plansData?.current_fy ?? null); } catch (err: any) { toast.error(err?.message || 'Could not delete the plan.'); } finally { setDeletePlan(false); }
  };

  const actions: DetailActionDef[] = selected ? [
    { label: 'Open', variant: 'primary', icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(detailHref(selected.kind, selected.id, fy)) },
    ...(canEditLines ? [{ label: 'Add budget line', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => setLineFor(selected) }] : []),
  ] : [];

  const k = mon?.kpis;
  const summary = (
    <div className="space-y-4">
      <DetailSummary title={`All ${TABS.find((t) => t.value === tab)!.label.toLowerCase()}`} subtitle="Select one to see its budget, then open it to plan its lines" figure={all.length} figureLabel={TABS.find((t) => t.value === tab)!.label} />
      <DetailSection title="Where they stand">
        <DetailGrid>
          <DetailField label="With a budget" value={all.filter((o) => o.r.count > 0).length} />
          <DetailField label="No budget yet" value={all.filter((o) => o.r.count === 0).length} tone={all.some((o) => o.r.count === 0) ? 'warning' : 'muted'} />
          <DetailField label="Needs attention" value={all.filter((o) => ['Warning', 'Critical'].includes(o.r.status)).length} tone={all.some((o) => ['Warning', 'Critical'].includes(o.r.status)) ? 'danger' : 'muted'} />
          <DetailField label="Changes waiting" value={all.reduce((a, o) => a + o.waiting, 0)} />
        </DetailGrid>
      </DetailSection>
      {tab === 'orders' && <p className="text-[12px] text-[var(--shell-text-muted)]">An order budget takes the order&apos;s own expenses first. Expenses it does not cover count against the product&apos;s budget.</p>}
    </div>
  );

  const panel = selected && (
    <div className="space-y-4">
      <DetailSummary title={selected.name} subtitle={[selected.code, selected.client].filter(Boolean).join(' · ') || KIND_LABEL[selected.kind]}
        status={selected.r.status} statusClass={{ success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', muted: 'text-[var(--shell-text-muted)]' }[STATUS_TONE[selected.r.status as ObjectStatus]]}
        figure={selected.r.count ? money(selected.r.planned, currency) : undefined} figureLabel="Budget for the year" />
      {selected.r.count ? (
        <DetailSection title="This year">
          <DetailGrid>
            <DetailField label="Used" value={money(selected.r.used, currency)} />
            <DetailField label="Left" value={money(selected.r.left, currency)} tone={selected.r.left < 0 ? 'danger' : undefined} />
            <DetailField label="Forecast" value={selected.r.forecast ? money(selected.r.forecast, currency) : '–'} tone={selected.r.forecast > selected.r.planned ? 'warning' : undefined} />
            <DetailField label="Budget lines" value={selected.r.count} />
            <DetailField label="Open alerts" value={selected.r.alerts} tone={selected.r.alerts ? 'warning' : 'muted'} />
            <DetailField label="Changes waiting" value={selected.waiting} tone={selected.waiting ? 'warning' : 'muted'} />
          </DetailGrid>
        </DetailSection>
      ) : (
        <p className="text-[13px] text-[var(--shell-text-muted)]">No budget lines yet.{canEditLines ? ' Open it to add the first line.' : ''}</p>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<Tab> value={tab} onChange={setTab} tabs={TABS} />
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1">
        {!plansData ? (
          <div className="p-6 text-[13px] text-[var(--shell-text-muted)]">Loading…</div>
        ) : !planExists ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-[15px] font-semibold text-[var(--shell-text)]">No budget plan for this year yet</p>
            <p className="max-w-md text-[13px] text-[var(--shell-text-muted)]">A plan holds a budget for each project, product, order and overhead, phased by month. Spending is checked against it once it is approved.</p>
            {canPlan
              ? <button className="btn-action btn-action-primary" onClick={() => setNewPlanOpen(true)}><FilePlus2 className="h-4 w-4" /> Create plan</button>
              : <p className="text-[12px] text-[var(--shell-text-muted)]">Finance, Operations or an admin creates the plan.</p>}
          </div>
        ) : (
          <ModuleShell
            showPanel={!!selected}
            searchRow={
              <DataTableToolbar table={table} filterDefs={filterDefs} actions={
                <>
                  {canPlan && <button className="btn-action" onClick={() => setNewPlanOpen(true)}><FilePlus2 className="h-4 w-4 text-[var(--success)]" /> New plan</button>}
                  {plan && draft && (view?.lines.length ?? 0) > 0 && <button className="btn-action" onClick={() => setSubmitOpen(true)}><Send className="h-4 w-4 text-[var(--shell-accent)]" /> Submit for approval</button>}
                  {plan?.status === 'SUBMITTED' && isFinance && (
                    <>
                      <button className="btn-action" onClick={() => setDecision('approve')}><CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> Approve</button>
                      <button className="btn-action" onClick={() => setDecision('send_back')}><CornerUpLeft className="h-4 w-4 text-[var(--info)]" /> Send back</button>
                    </>
                  )}
                  {plan && canPlan && <button className="btn-action" onClick={() => setDetailsOpen(true)}><Settings2 className="h-4 w-4 text-[var(--warning)]" /> Plan details</button>}
                  {plan && isFinance && draft && <button className="btn-action" onClick={() => setDeletePlan(true)}><Trash2 className="h-4 w-4 text-[var(--danger)]" /> Delete plan</button>}
                  <ToolbarActions actions={actions} />
                </>
              } />
            }
            intelligencePanel={
              <ModuleIntelligencePanel title={selected ? KIND_LABEL[selected.kind] : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected} idle={summary} footer={actions.length ? <DetailActions actions={actions} /> : undefined}>
                {panel}
              </ModuleIntelligencePanel>
            }
          >
            <div className="flex h-full min-h-0 flex-col">
              <KpiStrip>
                <Kpi label="Plan" value={plan ? <PlanStatusText status={plan.status} /> : '–'} sub={plan?.label} />
                <Kpi label="Company envelope" value={plan?.envelope != null ? money(plan.envelope, currency) : 'Not set'} />
                <Kpi label="Planned" value={money(view?.totals.planned, currency)} sub={`${view?.lines.length ?? 0} line${view?.lines.length === 1 ? '' : 's'}`} />
                <Kpi label="Used" value={money(k ? k.actual + k.committed : 0, currency)} sub="Actual and committed" />
                <Kpi label="Left to allocate" value={view?.totals.unallocated != null ? money(view.totals.unallocated, currency) : '–'} tone={view?.totals.unallocated != null && view.totals.unallocated < 0 ? 'danger' : undefined} sub={view?.totals.unallocated != null && view.totals.unallocated < 0 ? 'Plan is over the envelope' : undefined} />
                <Kpi label="Changes waiting" value={pendingRows.length ? <Link href="/budget/changes" className="hover:underline">{pendingRows.length}</Link> : 0} />
              </KpiStrip>
              {plan?.decision_note && plan.status === 'DRAFT' && <p className="shrink-0 border-b border-[var(--shell-border)] px-4 py-2 text-[13px] text-[var(--warning)]">Sent back: {plan.decision_note}</p>}
              <div className="min-h-0 flex-1">
                <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={all.length === 0 ? EMPTY[tab] : 'Nothing matches this filter.'} />
              </div>
            </div>
          </ModuleShell>
        )}
      </div>

      <NewPlanModal isOpen={newPlanOpen} onClose={() => setNewPlanOpen(false)} plans={plansData?.plans ?? []} currentFy={plansData?.current_fy ?? new Date().getFullYear()} startMonth={startMonth} onCreated={setFy} />
      <PlanDetailsModal isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} plan={plan ?? null} />
      <PlanDecisionModal isOpen={decision !== null} onClose={() => setDecision(null)} plan={plan ?? null} mode={decision ?? 'approve'} planned={view?.totals.planned ?? 0} onDone={() => setDecision(null)} />
      <BudgetLineModal isOpen={!!lineFor} onClose={() => setLineFor(null)} view={view} editing={null} canReserve={isFinance}
        preset={lineFor ? { cost_object: KIND_COST_OBJECT[lineFor.kind], object_id: lineFor.kind === 'reserve' ? null : lineFor.id, object_name: [lineFor.code, lineFor.name].filter(Boolean).join(' ') } : null}
        onSaved={() => { if (lineFor) router.push(detailHref(lineFor.kind, lineFor.id, fy)); }} />
      <ConfirmDialog open={submitOpen} title="Submit plan for approval" message={`Submit ${plan?.label ?? ''} with ${view?.lines.length ?? 0} line${view?.lines.length === 1 ? '' : 's'} and ${money(view?.totals.planned, currency)} planned? It cannot be edited while it waits for approval.`} confirmLabel="Submit" onConfirm={submitPlan} onCancel={() => setSubmitOpen(false)} />
      <ConfirmDialog open={deletePlan} destructive title="Delete this plan" message={`Delete the draft plan for ${plan?.label ?? ''} and all of its lines? This cannot be undone.`} confirmLabel="Delete plan" onConfirm={removePlan} onCancel={() => setDeletePlan(false)} />
    </div>
  );
}
