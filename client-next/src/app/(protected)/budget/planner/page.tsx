'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Send, CheckCircle2, CornerUpLeft, Settings2, FilePlus2, Search } from 'lucide-react';
import api from '@/lib/api-client';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { useBudgetPlan, useBudgetPlans, useBudgetSettings, type BudgetLine } from '@/hooks/use-budget-queries';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog, NativeSelect } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAllocation, DetailActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { BudgetLineModal, NewPlanModal, PlanDecisionModal, PlanDetailsModal } from '@/components/budgets/budget-modals';
import { FySelect, Kpi, KpiStrip, PlanStatusText, money, plain } from '@/components/budgets/budget-ui';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const GROUPS: { key: string; title: string; match: (l: BudgetLine) => boolean }[] = [
  { key: 'PROJECT', title: 'Projects', match: (l) => l.cost_object === 'PROJECT' },
  { key: 'PRODUCT', title: 'Products', match: (l) => l.cost_object === 'PRODUCT' },
  { key: 'DEPARTMENT', title: 'Overheads', match: (l) => l.cost_object === 'DEPARTMENT' },
  { key: 'RESERVE', title: 'Company reserve', match: (l) => l.cost_object === 'RESERVE' },
];

// One month of one line. Click to type a new amount while the plan is a draft; Enter or leaving the cell saves.
function MonthCell({ value, editable, onSave }: { value: number; editable: boolean; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  const commit = async () => {
    setEditing(false);
    const next = Math.max(0, Number(text) || 0);
    if (next !== value) await onSave(next);
  };

  if (editing) {
    return (
      <input
        ref={ref} type="number" min="0" step="1" value={text} aria-label="Amount for the month"
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="h-7 w-full rounded-md border border-[var(--shell-accent)] bg-transparent px-1.5 text-right text-[13px] tabular-nums text-[var(--shell-text)] outline-none"
      />
    );
  }
  const shown = value ? plain(value) : '–';
  if (!editable) return <span className={cn('block px-1.5 text-right tabular-nums', !value && 'text-[var(--shell-text-muted)]')}>{shown}</span>;
  return (
    <button
      type="button" onClick={(e) => { e.stopPropagation(); setText(value ? String(value) : ''); setEditing(true); }}
      className={cn('block w-full rounded-md border border-transparent px-1.5 py-0.5 text-right tabular-nums hover:border-[var(--input)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]', !value && 'text-[var(--shell-text-muted)]')}
    >
      {shown}
    </button>
  );
}

export default function BudgetPlannerPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const role = (user?.role_name || '').toUpperCase();
  const isFinance = role === 'ADMIN' || role === 'FINANCE';
  const currency = user?.currency || 'INR';
  const invalidate = useInvalidate();

  const { data: plansData } = useBudgetPlans();
  const { data: settings } = useBudgetSettings();
  const startMonth = settings?.fy_start_month ?? 4;
  const [fy, setFy] = useState<number | null>(null);
  useEffect(() => { if (fy == null && plansData) setFy(plansData.current_fy); }, [plansData, fy]);

  const planExists = !!plansData?.plans.some((p) => p.fy === fy);
  const { data: view, isLoading } = useBudgetPlan(planExists ? fy : null);
  const plan = view?.plan;

  const [group, setGroup] = useState<'object' | 'none'>('object');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lineOpen, setLineOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<BudgetLine | null>(null);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [decision, setDecision] = useState<'approve' | 'send_back' | null>(null);
  const [deleteLine, setDeleteLine] = useState<BudgetLine | null>(null);
  const [deletePlan, setDeletePlan] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  useEffect(() => { setHeader('Budget planner', 'Plan the year by project, product and overhead'); }, [setHeader]);
  useEffect(() => { setSelectedId(null); }, [fy]);

  const lines = view?.lines ?? [];
  const selected = lines.find((l) => l.id === selectedId) ?? null;
  const draft = plan?.status === 'DRAFT';
  const editableCells = draft;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? lines.filter((l) => `${l.label} ${l.owner_name ?? ''} ${l.object_name}`.toLowerCase().includes(q)) : lines;
  }, [lines, search]);
  const grouped = group === 'object'
    ? GROUPS.map((g) => ({ ...g, rows: visible.filter(g.match) })).filter((g) => g.rows.length)
    : [{ key: 'ALL', title: '', rows: visible }];
  const monthTotals = (view?.months ?? []).map((_, i) => visible.reduce((a, l) => a + (l.periods[i] || 0), 0));
  const shownTotal = visible.reduce((a, l) => a + l.total, 0);

  const saveCell = async (line: BudgetLine, index: number, amount: number, reason?: string) => {
    const m = view!.months[index];
    try {
      await api.put(`/budgets/lines/${line.id}/period`, { year: m.year, month: m.month, amount, reason });
      invalidate('budgets');
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the amount.');
    }
  };

  const submitPlan = async () => {
    if (!plan) return;
    try {
      await api.post(`/budgets/plans/${plan.fy}/submit`, {});
      toast.success('Plan submitted for approval.');
      invalidate('budgets');
    } catch (err: any) {
      toast.error(err?.message || 'Could not submit the plan.');
    } finally { setSubmitOpen(false); }
  };

  const removePlan = async () => {
    if (!plan) return;
    try {
      await api.delete(`/budgets/plans/${plan.fy}`);
      toast.success('Plan deleted.');
      invalidate('budgets');
      setFy(plansData?.current_fy ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete the plan.');
    } finally { setDeletePlan(false); }
  };

  const removeLine = async () => {
    if (!deleteLine) return;
    try {
      await api.delete(`/budgets/lines/${deleteLine.id}`);
      toast.success('Budget line removed.');
      setSelectedId(null);
      invalidate('budgets');
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove the line.');
    } finally { setDeleteLine(null); }
  };

  const openAdd = () => { setEditingLine(null); setLineOpen(true); };
  const openEdit = (l: BudgetLine) => { setEditingLine(l); setLineOpen(true); };
  const canEditLines = !!plan && (draft || (isFinance && (plan.status === 'APPROVED' || plan.status === 'ACTIVE')));

  const lineActions: DetailActionDef[] = selected && canEditLines ? [
    { label: 'Edit', variant: 'primary', onClick: () => openEdit(selected) },
    { label: 'Delete', variant: 'danger', onClick: () => setDeleteLine(selected) },
  ] : [];

  const used = selected ? selected.actual + selected.committed : 0;

  return (
    <ModuleShell
      showPanel={!!selected}
      panelOnSelect
      searchRow={
        <div className="flex w-full flex-wrap items-center gap-2">
          <FySelect plans={plansData?.plans ?? []} value={fy} onChange={setFy} currentFy={plansData?.current_fy} startMonth={startMonth} />
          {plan && <PlanStatusText status={plan.status} />}
          {isFinance && <button className="btn-action" onClick={() => setNewPlanOpen(true)}><FilePlus2 className="h-4 w-4 text-[var(--success)]" /> New plan</button>}
          {plan && canEditLines && <button className="btn-action" onClick={openAdd}><Plus className="h-4 w-4 text-[var(--success)]" /> Add line</button>}
          {plan && draft && lines.length > 0 && <button className="btn-action" onClick={() => setSubmitOpen(true)}><Send className="h-4 w-4 text-[var(--shell-accent)]" /> Submit for approval</button>}
          {plan?.status === 'SUBMITTED' && isFinance && (
            <>
              <button className="btn-action" onClick={() => setDecision('approve')}><CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> Approve</button>
              <button className="btn-action" onClick={() => setDecision('send_back')}><CornerUpLeft className="h-4 w-4 text-[var(--info)]" /> Send back</button>
            </>
          )}
          {plan && isFinance && <button className="btn-action" onClick={() => setDetailsOpen(true)}><Settings2 className="h-4 w-4 text-[var(--warning)]" /> Plan details</button>}
          {plan && isFinance && draft && <button className="btn-action" onClick={() => setDeletePlan(true)}><Trash2 className="h-4 w-4 text-[var(--danger)]" /> Delete plan</button>}
          <div className="ml-auto flex items-center gap-2">
            <NativeSelect aria-label="Group lines" value={group} onChange={(e) => setGroup(e.target.value as 'object' | 'none')} className="!h-8 !w-auto">
              <option value="object">Group: cost object</option>
              <option value="none">No grouping</option>
            </NativeSelect>
            <div className="relative w-[200px]">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--shell-text-muted)]" />
              <Input aria-label="Search lines" placeholder="Search lines" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 rounded-md bg-transparent pl-8 pr-2 text-[13px]" style={{ border: '1px solid var(--input)', color: 'var(--shell-text)' }} />
            </div>
          </div>
        </div>
      }
      intelligencePanel={
        <ModuleIntelligencePanel title="Budget line" onClose={() => setSelectedId(null)} hasSelection={!!selected} footer={lineActions.length ? <DetailActions actions={lineActions} /> : undefined}>
          {selected && (
            <>
              <DetailSummary title={selected.label} subtitle={selected.object_name} figure={money(selected.total, currency)} figureLabel="Planned for the year" />
              <DetailSection title="Used so far">
                <DetailAllocation
                  items={[
                    { label: 'Actual', amount: money(selected.actual, currency), pct: selected.total > 0 ? (selected.actual / selected.total) * 100 : 0 },
                    { label: 'Committed', amount: money(selected.committed, currency), pct: selected.total > 0 ? (selected.committed / selected.total) * 100 : 0 },
                  ]}
                  total={<span className="text-[12px] text-[var(--shell-text-muted)]">{money(selected.total - used, currency)} left</span>}
                />
              </DetailSection>
              <DetailSection title="Details">
                <DetailGrid>
                  <DetailField label="Budget for" value={selected.cost_object === 'DEPARTMENT' ? 'Overhead' : selected.cost_object === 'RESERVE' ? 'Company reserve' : selected.cost_object === 'PROJECT' ? 'Project' : 'Product'} />
                  <DetailField label="Expense type" value={selected.is_contingency ? 'Contingency (held)' : selected.type_label} />
                  <DetailField label="Controlled at" value={selected.control_level === 'CATEGORY' ? `Category ${selected.category_label ?? ''}` : 'Expense type'} />
                  <DetailField label="Strict" value={selected.strict ? 'Yes, blocks at the limit' : 'No, reason required'} />
                  <DetailField label="Owner" value={selected.owner_name} />
                  {selected.note && <DetailField label="Note" value={selected.note} wide />}
                </DetailGrid>
              </DetailSection>
            </>
          )}
        </ModuleIntelligencePanel>
      }
    >
      {!plansData ? (
        <div className="p-6 text-[13px] text-[var(--shell-text-muted)]">Loading…</div>
      ) : !planExists ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-[15px] font-semibold text-[var(--shell-text)]">No budget plan for this year yet</p>
          <p className="max-w-md text-[13px] text-[var(--shell-text-muted)]">
            A plan holds a line for each project, product and overhead department, phased by month. Spending is checked against it once it is approved.
          </p>
          {isFinance
            ? <button className="btn-action btn-action-primary" onClick={() => setNewPlanOpen(true)}><FilePlus2 className="h-4 w-4" /> Create plan</button>
            : <p className="text-[12px] text-[var(--shell-text-muted)]">Finance or an admin creates the plan.</p>}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <KpiStrip>
            <Kpi label="Company envelope" value={plan?.envelope != null ? money(plan.envelope, currency) : 'Not set'} />
            <Kpi label="Planned" value={money(view?.totals.planned, currency)} sub={`${lines.length} line${lines.length === 1 ? '' : 's'}`} />
            <Kpi label="Held in reserve" value={money(view?.totals.reserve, currency)} sub="Reserve and contingency" />
            <Kpi
              label="Left to allocate" value={view?.totals.unallocated != null ? money(view.totals.unallocated, currency) : '–'}
              tone={view?.totals.unallocated != null && view.totals.unallocated < 0 ? 'danger' : undefined}
              sub={view?.totals.unallocated != null && view.totals.unallocated < 0 ? 'Plan is over the envelope' : undefined}
            />
          </KpiStrip>
          {plan?.decision_note && plan.status === 'DRAFT' && (
            <p className="shrink-0 border-b border-[var(--shell-border)] px-4 py-2 text-[13px] text-[var(--warning)]">Sent back: {plan.decision_note}</p>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-left text-[12px] font-semibold text-[var(--shell-text-muted)]">
                  <th className="sticky left-0 top-0 z-20 min-w-[260px] border-b border-[var(--shell-border)] bg-[var(--table-header)] px-4 py-2">Line</th>
                  <th className="sticky top-0 z-10 min-w-[90px] border-b border-[var(--shell-border)] bg-[var(--table-header)] px-2 py-2">Owner</th>
                  {(view?.months ?? []).map((m, i) => <th key={i} className="sticky top-0 z-10 min-w-[84px] border-b border-[var(--shell-border)] bg-[var(--table-header)] px-1.5 py-2 text-right">{m.label}</th>)}
                  <th className="sticky top-0 z-10 min-w-[110px] border-b border-[var(--shell-border)] bg-[var(--table-header)] px-3 py-2 text-right">FY total</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={15} className="px-4 py-6 text-[var(--shell-text-muted)]">Loading…</td></tr>}
                {!isLoading && lines.length === 0 && (
                  <tr><td colSpan={15} className="px-4 py-8 text-center text-[var(--shell-text-muted)]">No lines yet. {canEditLines ? 'Click Add line to start the plan.' : ''}</td></tr>
                )}
                {grouped.map((g) => (
                  <GroupRows key={g.key} title={g.title} rows={g.rows} selectedId={selectedId} onSelect={setSelectedId} editable={!!editableCells}
                    onSaveCell={(line, i, v) => saveCell(line, i, v)} currency={currency} />
                ))}
              </tbody>
              {visible.length > 0 && (
                <tfoot>
                  <tr className="font-semibold text-[var(--shell-text)]">
                    <td className="sticky bottom-0 left-0 z-20 border-t border-[var(--shell-border)] bg-[var(--shell-surface)] px-4 py-2">{visible.length === lines.length ? 'All lines' : 'Shown lines'}</td>
                    <td className="sticky bottom-0 border-t border-[var(--shell-border)] bg-[var(--shell-surface)]" />
                    {monthTotals.map((t, i) => <td key={i} className="sticky bottom-0 border-t border-[var(--shell-border)] bg-[var(--shell-surface)] px-1.5 py-2 text-right tabular-nums">{t ? plain(t, currency) : '–'}</td>)}
                    <td className="sticky bottom-0 border-t border-[var(--shell-border)] bg-[var(--shell-surface)] px-3 py-2 text-right tabular-nums">{plain(shownTotal, currency)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {draft && lines.length > 0 && <p className="shrink-0 border-t border-[var(--shell-border)] px-4 py-1.5 text-[12px] text-[var(--shell-text-muted)]">Click a month to change its amount. After approval, changes are made from Edit and need a reason.</p>}
        </div>
      )}

      <NewPlanModal isOpen={newPlanOpen} onClose={() => setNewPlanOpen(false)} plans={plansData?.plans ?? []} currentFy={plansData?.current_fy ?? new Date().getFullYear()} startMonth={startMonth} onCreated={setFy} />
      <PlanDetailsModal isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} plan={plan ?? null} />
      <PlanDecisionModal isOpen={decision !== null} onClose={() => setDecision(null)} plan={plan ?? null} mode={decision ?? 'approve'} planned={view?.totals.planned ?? 0} onDone={() => setDecision(null)} />
      <BudgetLineModal isOpen={lineOpen} onClose={() => setLineOpen(false)} view={view} editing={editingLine} canReserve={isFinance} onSaved={(id) => { if (id) setSelectedId(id); }} />
      <ConfirmDialog open={submitOpen} title="Submit plan for approval" message={`Submit ${plan?.label ?? ''} with ${lines.length} line${lines.length === 1 ? '' : 's'} and ${money(view?.totals.planned, currency)} planned? It cannot be edited while it waits for approval.`} confirmLabel="Submit" onConfirm={submitPlan} onCancel={() => setSubmitOpen(false)} />
      <ConfirmDialog open={deletePlan} destructive title="Delete this plan" message={`Delete the draft plan for ${plan?.label ?? ''} and all of its lines? This cannot be undone.`} confirmLabel="Delete plan" onConfirm={removePlan} onCancel={() => setDeletePlan(false)} />
      <ConfirmDialog open={!!deleteLine} destructive title="Remove budget line" message={`Remove ${deleteLine?.label ?? 'this line'}? Expenses already charged to it will show as having no budget line.`} confirmLabel="Remove" onConfirm={removeLine} onCancel={() => setDeleteLine(null)} />
    </ModuleShell>
  );
}

function GroupRows({ title, rows, selectedId, onSelect, editable, onSaveCell, currency }: {
  title: string; rows: BudgetLine[]; selectedId: number | null; onSelect: (id: number) => void; editable: boolean;
  onSaveCell: (line: BudgetLine, index: number, amount: number) => Promise<void>; currency: string;
}) {
  return (
    <>
      {title && (
        <tr>
          <td colSpan={15} className="sticky left-0 border-b border-[var(--shell-border)] bg-[var(--shell-hover)] px-4 py-1.5 text-[12px] font-semibold text-[var(--shell-text-muted)]">
            {title} <span className="font-normal">· {rows.length}</span>
          </td>
        </tr>
      )}
      {rows.map((l) => {
        const sel = l.id === selectedId;
        return (
          <tr
            key={l.id} onClick={() => onSelect(l.id)} aria-selected={sel}
            className={cn('cursor-pointer text-[var(--shell-text)] hover:bg-[var(--shell-hover)]', sel && 'bg-[var(--shell-hover)]')}
          >
            <td className={cn('sticky left-0 z-10 border-b border-[var(--shell-border)] px-4 py-1.5', sel ? 'bg-[var(--shell-hover)] shadow-[inset_2px_0_0_var(--shell-accent)]' : 'bg-[var(--shell-surface)]')}>
              <p className="truncate font-medium">{l.label}</p>
              <p className="truncate text-[12px] text-[var(--shell-text-muted)]">
                {l.is_contingency ? 'Held by Finance' : l.object_name}{l.strict ? ' · strict' : ''}{l.control_level === 'CATEGORY' ? ' · by category' : ''}
              </p>
            </td>
            <td className="border-b border-[var(--shell-border)] px-2 py-1.5 text-[var(--shell-text-muted)]">{l.owner_name ?? '–'}</td>
            {l.periods.map((v, i) => (
              <td key={i} className="border-b border-[var(--shell-border)] px-0.5 py-1">
                <MonthCell value={v} editable={editable} onSave={(next) => onSaveCell(l, i, next)} />
              </td>
            ))}
            <td className="border-b border-[var(--shell-border)] px-3 py-1.5 text-right font-medium tabular-nums">{plain(l.total, currency)}</td>
          </tr>
        );
      })}
    </>
  );
}
