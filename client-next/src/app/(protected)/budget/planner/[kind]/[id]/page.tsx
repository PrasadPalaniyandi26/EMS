'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useDepartments, useInvalidate } from '@/hooks/use-queries';
import { useBudgetLine, useBudgetMonitor, useBudgetPlan, useBudgetPlans, type MonitorLine } from '@/hooks/use-budget-queries';
import { useBudgetChanges, useBudgetProducts, useBudgetProjects } from '@/hooks/use-planning-queries';
import { useBuildOrders } from '@/hooks/use-build-orders';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { IdCell, StatusText, TextCell, headerRight, WholeCell } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog, Field, inp } from '@/components/shared/modal-primitives';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Input } from '@/components/ui/input';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { BudgetLineModal } from '@/components/budgets/budget-modals';
import { ChangeRequestModal } from '@/components/budgets/planning-modals';
import { CHANGE_KIND, CHANGE_STATUS, ObjectChanges } from '@/components/budgets/object-changes';
import { Kpi, KpiStrip, LevelText, LineStatusText, STATUS_TEXT, TabBar, UtilBar, money, plain, useTabParam } from '@/components/budgets/budget-ui';
import { KIND_COST_OBJECT, KIND_LABEL, changesFor, isKind, linesOf, rollUp, type PlannerKind } from '@/components/budgets/planner-objects';
import { formatDate } from '@/lib/currency';

type Tab = 'lines' | 'changes';
// The same record on the Costing and Manage pages

export default function PlannerObjectPage() {
  const params = useParams<{ kind: string; id: string }>();
  const kind: PlannerKind = isKind(params.kind) ? params.kind : 'project';
  const id = Number(params.id) || 0;
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const role = (user?.role_name || '').toUpperCase();
  const isFinance = role === 'ADMIN' || role === 'FINANCE';
  const currency = user?.currency || 'INR';
  const invalidate = useInvalidate();

  const { data: plansData } = useBudgetPlans();
  const [fy, setFy] = useState<number | null>(null);
  useEffect(() => {
    if (fy != null || !plansData) return;
    const q = Number(new URLSearchParams(window.location.search).get('fy'));
    setFy(q || plansData.current_fy);
  }, [plansData, fy]);
  const planExists = !!plansData?.plans.some((p) => p.fy === fy);
  const { data: view } = useBudgetPlan(planExists ? fy : null);
  const plan = view?.plan;
  const draft = plan?.status === 'DRAFT';
  const canEditLines = role !== 'CONFIGURATOR' && !!plan && (draft || (isFinance && (plan.status === 'APPROVED' || plan.status === 'ACTIVE')));
  const { data: mon, isLoading } = useBudgetMonitor(fy);
  const { data: allChanges } = useBudgetChanges('ALL');

  // Who this budget is for
  const { data: projects } = useBudgetProjects();
  const { data: products } = useBudgetProducts();
  const { data: orders } = useBuildOrders();
  const { data: departments } = useDepartments();
  const about = useMemo(() => {
    if (kind === 'project') { const p = projects?.find((x) => x.id === id); return p && { code: p.code, name: p.name, sub: p.client_name }; }
    if (kind === 'product') { const p = products?.find((x) => x.id === id); return p && { code: p.code, name: p.name, sub: p.client_name }; }
    if (kind === 'order') { const o = orders?.find((x) => x.id === id); return o && { code: o.code, name: `${o.product_name ?? 'Order'} × ${o.quantity}`, sub: o.client_name }; }
    if (kind === 'overhead') { const d = departments?.find((x) => x.id === id); return d && { code: null, name: d.name, sub: null }; }
    return { code: null, name: 'Company reserve', sub: null };
  }, [kind, id, projects, products, orders, departments]);
  const title = [about?.code, about?.name].filter(Boolean).join(' ') || KIND_LABEL[kind];
  useEffect(() => {
    setHeader(title, [KIND_LABEL[kind], about?.sub, plan?.label].filter(Boolean).join(' · '));
  }, [setHeader, title, kind, about?.sub, plan?.label]);

  const lines = useMemo(() => linesOf(mon?.lines ?? [], kind, id), [mon, kind, id]);
  const lineIds = useMemo(() => lines.map((l) => l.id), [lines]);
  const r = rollUp(lines);
  const waiting = changesFor(allChanges?.rows ?? [], lineIds).filter((c) => c.status === 'PENDING').length;

  const [tab, setTab] = useTabParam<Tab>(['lines', 'changes'], 'lines');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'pct', desc: true }]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [lineOpen, setLineOpen] = useState(false);
  const [editing, setEditing] = useState<MonitorLine | null>(null);
  const [deleting, setDeleting] = useState<MonitorLine | null>(null);
  const [changeFor, setChangeFor] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => { setSelection({}); }, [tab, fy]);

  const columns = useMemo<ColumnDef<MonitorLine, any>[]>(() => [
    {
      id: 'label', header: 'Budget line', accessorFn: (l) => (l.is_contingency ? 'Contingency (held)' : l.category_label ?? l.type_label),
      cell: ({ row }) => (
        <div className="min-w-0">
          <TextCell value={row.original.is_contingency ? 'Contingency (held)' : row.original.category_label ?? row.original.type_label} strong className="block max-w-[300px] truncate" />
          <span className="block max-w-[300px] truncate text-[12px] text-[var(--shell-text-muted)]">
            {row.original.is_contingency ? 'Held by Finance' : row.original.category_label ? row.original.type_label : 'All of this expense type'}{row.original.strict ? ' · strict' : ''}
          </span>
        </div>
      ),
    },
    { accessorKey: 'owner_name', header: 'Owner', cell: ({ row }) => <TextCell value={row.original.owner_name} muted />, size: 100 },
    { accessorKey: 'total', header: headerRight('Budget'), cell: ({ row }) => <WholeCell value={row.original.total} currency={currency} />, size: 120 },
    { accessorKey: 'used', header: headerRight('Used'), cell: ({ row }) => <WholeCell value={row.original.used} currency={currency} />, size: 120 },
    {
      accessorKey: 'pct', header: 'Used %', size: 150,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <UtilBar pct={row.original.pct} className="w-16" />
          <span className="w-12 text-right text-[13px] tabular-nums">{row.original.pct >= 999 ? '—' : `${Math.round(row.original.pct)}%`}</span>
        </div>
      ),
    },
    { accessorKey: 'status', header: 'Status', size: 100, cell: ({ row }) => <LineStatusText status={row.original.status} /> },
  ], [currency]);

  const table = useDataTable({
    data: lines, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (l) => String(l.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = lines.find((l) => String(l.id) === Object.keys(selection)[0]) ?? null;
  const { data: detail } = useBudgetLine(selected ? selected.id : null);
  const onLine = selected ? changesFor(allChanges?.rows ?? [], [selected.id]) : [];

  const addAction: DetailActionDef[] = canEditLines ? [{ label: 'Add budget line', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditing(null); setLineOpen(true); } }] : [];
  const lineActions: DetailActionDef[] = selected ? [
    ...(canEditLines ? [{ label: 'Edit', variant: 'primary' as const, onClick: () => { setEditing(selected); setLineOpen(true); } }] : []),
    ...(role !== 'CONFIGURATOR' ? [{ label: 'Request change', icon: <ArrowLeftRight className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setChangeFor(selected.id) }] : []),
    ...(canEditLines ? [{ label: 'Delete', variant: 'danger' as const, onClick: () => { setReason(''); setDeleting(selected); } }] : []),
  ] : [];

  const removeLine = async () => {
    const l = deleting;
    if (!l) return;
    try {
      await api.delete(`/budgets/lines/${l.id}${plan && plan.status !== 'DRAFT' && reason.trim() ? `?reason=${encodeURIComponent(reason.trim())}` : ''}`);
      toast.success('Budget line removed.');
      setSelection({});
      invalidate('budgets');
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove the line.');
    } finally { setDeleting(null); }
  };

  const summary = (
    <div className="space-y-4">
      <DetailSummary title={about?.name ?? KIND_LABEL[kind]} subtitle={[about?.code, about?.sub].filter(Boolean).join(' · ') || KIND_LABEL[kind]} figure={r.count ? money(r.planned, currency) : undefined} figureLabel="Budget for the year" />
      {r.count ? (
        <DetailSection title="This year">
          <DetailGrid>
            <DetailField label="Used" value={money(r.used, currency)} />
            <DetailField label="Left" value={money(r.left, currency)} tone={r.left < 0 ? 'danger' : undefined} />
            <DetailField label="Forecast" value={r.forecast ? money(r.forecast, currency) : '–'} tone={r.forecast > r.planned ? 'warning' : undefined} />
            <DetailField label="Open alerts" value={r.alerts} tone={r.alerts ? 'warning' : 'muted'} />
          </DetailGrid>
        </DetailSection>
      ) : (
        <p className="text-[13px] text-[var(--shell-text-muted)]">{planExists ? `No budget lines yet.${canEditLines ? ' Use Add budget line to start.' : ''}` : 'There is no plan for this year.'}</p>
      )}
      {kind === 'order' && <p className="text-[12px] text-[var(--shell-text-muted)]">Expenses charged to this order use these lines first. Any type without a line here falls back to the product&apos;s budget.</p>}
    </div>
  );

  const panel = selected && (
    <div className="space-y-4">
      <DetailSummary title={selected.is_contingency ? 'Contingency (held)' : selected.category_label ?? selected.type_label} subtitle={selected.category_label ? selected.type_label : about?.name} status={selected.status} statusClass={STATUS_TEXT[selected.status]} figure={money(selected.available, currency)} figureLabel="Left" />
      <DetailSection title="This year">
        <DetailGrid>
          <DetailField label="Budget" value={money(selected.total, currency)} />
          <DetailField label="Actual" value={money(selected.actual, currency)} />
          <DetailField label="Committed" value={money(selected.committed, currency)} />
          <DetailField label="Run-rate forecast" value={selected.forecast != null ? money(selected.forecast, currency) : '–'} tone={selected.forecast_over ? 'warning' : undefined} />
          <DetailField label="Controlled at" value={selected.control_level === 'CATEGORY' ? 'Category' : 'Expense type'} />
          <DetailField label="Strict" value={selected.strict ? 'Yes, blocks at the limit' : 'No, reason required'} />
          {selected.note && <DetailField label="Note" value={selected.note} wide />}
        </DetailGrid>
      </DetailSection>
      <DetailSection title="Month by month">
        <ul className="space-y-1.5">
          {(detail?.months ?? []).filter((m) => m.budget > 0 || m.actual > 0 || m.committed > 0).map((m) => {
            const used = m.actual + m.committed;
            const pct = m.budget > 0 ? (used / m.budget) * 100 : used > 0 ? 100 : 0;
            return (
              <li key={`${m.year}-${m.month}`} className="text-[12px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="w-9 text-[var(--shell-text-muted)]">{m.label}</span>
                  <span className="flex-1 text-right tabular-nums text-[var(--shell-text)]">{plain(used, currency)} <span className="text-[var(--shell-text-muted)]">of {plain(m.budget, currency)}</span></span>
                </div>
                <UtilBar pct={pct} className="mt-1" />
              </li>
            );
          })}
          {detail && !detail.months.some((m) => m.budget > 0 || m.actual > 0 || m.committed > 0) && <li className="text-[12px] text-[var(--shell-text-muted)]">Nothing phased or spent yet.</li>}
        </ul>
      </DetailSection>
      <DetailSection title={`Alerts${detail?.alerts.length ? ` (${detail.alerts.length})` : ''}`}>
        {detail?.alerts.length ? (
          <ul className="space-y-1.5">{detail.alerts.map((a) => <li key={a.id} className="text-[13px]"><LevelText level={a.level} /> <span className="text-[var(--shell-text)]">{a.message}</span></li>)}</ul>
        ) : <p className="text-[13px] text-[var(--shell-text-muted)]">No open alerts.</p>}
      </DetailSection>
      <DetailSection title={`Changes${onLine.length ? ` (${onLine.length})` : ''}`}>
        {onLine.length ? (
          <ul className="divide-y divide-[var(--shell-border)]">
            {onLine.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                <div className="min-w-0">
                  <p className="text-[var(--shell-text)]">{CHANGE_KIND[c.kind]}{c.from_line_id === selected.id ? ' out' : c.to_line_id === selected.id ? ' in' : ''}</p>
                  <p className="truncate text-[var(--shell-text-muted)]">{c.reason}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums text-[var(--shell-text)]">{plain(c.amount, currency)}</p>
                  <span className={{ warning: 'text-[var(--warning)]', success: 'text-[var(--success)]', danger: 'text-[var(--danger)]' }[CHANGE_STATUS[c.status].tone]}>{CHANGE_STATUS[c.status].label}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-[var(--shell-text-muted)]">No changes on this line.</p>}
      </DetailSection>
      <DetailSection title="Latest expenses">
        {detail?.expenses.length ? (
          <ul className="divide-y divide-[var(--shell-border)]">
            {detail.expenses.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                <div className="min-w-0">
                  <IdCell value={e.reference_id} />
                  <p className="truncate text-[var(--shell-text-muted)]">{e.description || formatDate(e.date_recorded)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums text-[var(--shell-text)]">{plain(e.amount, currency)}</p>
                  <StatusText status={e.status} />
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-[var(--shell-text-muted)]">No expenses on this line yet.</p>}
      </DetailSection>
    </div>
  );

  const TABS: { value: Tab; label: string }[] = [{ value: 'lines', label: 'Budget lines' }, { value: 'changes', label: waiting ? `Changes (${waiting})` : 'Changes' }];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<Tab> value={tab} onChange={setTab} tabs={TABS} />
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1">
        {tab === 'changes' ? (
          <ObjectChanges lineIds={lineIds} allowRequest={role !== 'CONFIGURATOR'} />
        ) : (
          <ModuleShell
            showPanel={!!selected}
            searchRow={<DataTableToolbar table={table} actions={<><ToolbarActions actions={addAction} /><ToolbarActions actions={lineActions} /></>} />}
            intelligencePanel={
              <ModuleIntelligencePanel title={selected ? 'Budget line' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected} idle={summary} footer={lineActions.length ? <DetailActions actions={lineActions} /> : undefined}>
                {panel}
              </ModuleIntelligencePanel>
            }
          >
            <div className="flex h-full min-h-0 flex-col">
              <KpiStrip>
                <Kpi label="Budget" value={r.count ? money(r.planned, currency) : '–'} sub={`${r.count} line${r.count === 1 ? '' : 's'}`} />
                <Kpi label="Used" value={r.count ? money(r.used, currency) : '–'} sub={r.count && r.planned > 0 ? `${Math.round(r.pct)}% of budget` : undefined} />
                <Kpi label="Left" value={r.count ? money(r.left, currency) : '–'} tone={r.left < 0 ? 'danger' : undefined} />
                <Kpi label="Forecast" value={r.forecast ? money(r.forecast, currency) : '–'} sub="At the current run-rate" tone={r.forecast > r.planned && r.planned > 0 ? 'warning' : undefined} />
                <Kpi label="Open alerts" value={r.alerts} tone={r.alerts ? 'warning' : undefined} />
              </KpiStrip>
              <div className="flex min-h-0 flex-1 flex-col">
                <DataTable isLoading={isLoading} columns={columns} data={lines} tableInstance={table} fullHeight
                  emptyMessage={planExists ? `No budget lines for this ${KIND_LABEL[kind].toLowerCase()} yet.${canEditLines ? ' Click Add budget line to start.' : ''}` : 'There is no budget plan for this year. Create one in the budget planner.'} />
              </div>
            </div>
          </ModuleShell>
        )}
      </div>

      <BudgetLineModal isOpen={lineOpen} onClose={() => setLineOpen(false)} view={view} editing={editing} canReserve={isFinance}
        preset={{ cost_object: KIND_COST_OBJECT[kind], object_id: kind === 'reserve' ? null : id, object_name: title }}
        onSaved={(newId) => { if (newId) setSelection({ [String(newId)]: true }); }} />
      <ChangeRequestModal isOpen={changeFor != null} onClose={() => setChangeFor(null)} prefill={changeFor != null ? { kind: 'TRANSFER', to_line_id: changeFor } : null} />
      {plan && plan.status !== 'DRAFT' ? (
        <ModuleModal isOpen={!!deleting} onClose={() => setDeleting(null)} size="sm" title="Remove budget line" isDestructive saveLabel="Remove" canSave={!!reason.trim()} onSave={removeLine}>
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--shell-text)]">Remove {deleting?.category_label ?? deleting?.type_label ?? 'this line'}? Expenses already charged to it will show as having no budget line.</p>
            <Field label="Reason for the change" required hint="The plan is approved. Finance records why it changed.">
              <Input className={`${inp} border-input bg-transparent text-[var(--shell-text)]`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>
          </div>
        </ModuleModal>
      ) : (
        <ConfirmDialog open={!!deleting} destructive title="Remove budget line" message={`Remove ${deleting?.category_label ?? deleting?.type_label ?? 'this line'}? Expenses already charged to it will show as having no budget line.`} confirmLabel="Remove" onConfirm={removeLine} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}
