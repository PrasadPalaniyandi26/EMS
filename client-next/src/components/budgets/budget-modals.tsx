'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, CheckCircle2, CornerUpLeft } from 'lucide-react';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect, CurrencyInput, SegmentedControl, inp } from '@/components/shared/modal-primitives';
import { PickSelect } from '@/components/shared/pick-select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCategories, useCategoryTypes, useDepartments, useProducts, useProjects, useUsers, useInvalidate } from '@/hooks/use-queries';
import { useBuildOrders } from '@/hooks/use-build-orders';
import { fyLabel, useLineSuggestion, type BudgetLine, type BudgetPlanInfo, type CostObject, type PlanView } from '@/hooks/use-budget-queries';
import { money } from '@/components/budgets/budget-ui';
import { sortByCode } from '@/lib/codes';

const KIND_OF: Record<CostObject, string> = { PROJECT: 'PROJECT', PRODUCT: 'PRODUCT', ORDER: 'PRODUCT', DEPARTMENT: 'OVERHEAD', RESERVE: '' };
const OBJECT_LABEL: Record<CostObject, string> = { PROJECT: 'Project', PRODUCT: 'Product', ORDER: 'Order', DEPARTMENT: 'Department', RESERVE: 'Company reserve' };
const labelOf = (o: { name: string; code?: string | null }) => (o.code ? `${o.code} ${o.name}` : o.name);

// ─── New plan ────────────────────────────────────────────────────────────────

export function NewPlanModal({ isOpen, onClose, plans, currentFy, startMonth, onCreated }: {
  isOpen: boolean; onClose: () => void; plans: BudgetPlanInfo[]; currentFy: number; startMonth: number; onCreated: (fy: number) => void;
}) {
  const invalidate = useInvalidate();
  // This year, if it has no plan, and the next two; earlier years cannot be planned any more
  const free = useMemo(() => [currentFy, currentFy + 1, currentFy + 2].filter((fy) => !plans.some((p) => p.fy === fy)), [plans, currentFy]);
  const [fy, setFy] = useState('');
  const [name, setName] = useState('');
  const [envelope, setEnvelope] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const first = free[0];
    setFy(first != null ? String(first) : '');
    setName('');
    setEnvelope('');
    setCopyFrom('');
    setSaving(false);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.post('/budgets/plans', {
        fy: Number(fy), name: name.trim() || undefined, envelope: envelope ? Number(envelope) : null, copy_from_fy: copyFrom ? Number(copyFrom) : undefined,
      });
      toast.success('Budget plan created.');
      invalidate('budgets');
      onCreated(Number(fy));
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Could not create the plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModuleModal
      isOpen={isOpen} onClose={onClose} title="New budget plan" icon={<Plus className="h-4 w-4" />}
      onSave={save} canSave={!!fy && !saving} saveLabel="Create plan" size="sm"
    >
      <div className="space-y-3">
        <Field label="Financial year" required hint={free.length === 0 ? 'This year and the next two already have a plan.' : undefined}>
          <NativeSelect value={fy} onChange={(e) => setFy(e.target.value)} disabled={free.length === 0}>
            {free.map((f) => <option key={f} value={f}>{fyLabel(f, startMonth)}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Plan name">
          <Input className={`${inp} border-input bg-transparent text-[var(--shell-text)]`} placeholder={fy ? `Budget ${fyLabel(Number(fy), startMonth)}` : ''} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
        <Field label="Company envelope" hint="The most the company will allow for the year. Leave empty if not set yet.">
          <CurrencyInput value={envelope} onChange={setEnvelope} />
        </Field>
        <Field label="Start from" hint="Overhead and reserve lines carry over with their monthly amounts; projects and products start empty.">
          <NativeSelect value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Blank plan</option>
            {plans.map((p) => <option key={p.fy} value={p.fy}>Copy overheads from {p.label}</option>)}
          </NativeSelect>
        </Field>
      </div>
    </ModuleModal>
  );
}

// ─── Plan name and envelope ──────────────────────────────────────────────────

export function PlanDetailsModal({ isOpen, onClose, plan }: { isOpen: boolean; onClose: () => void; plan: BudgetPlanInfo | null }) {
  const invalidate = useInvalidate();
  const [name, setName] = useState('');
  const [envelope, setEnvelope] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !plan) return;
    setName(plan.name);
    setEnvelope(plan.envelope != null ? String(plan.envelope) : '');
    setSaving(false);
  }, [isOpen, plan]);

  const save = async () => {
    if (!plan || saving) return;
    setSaving(true);
    try {
      await api.put(`/budgets/plans/${plan.fy}`, { name: name.trim(), envelope: envelope ? Number(envelope) : null });
      toast.success('Plan updated.');
      invalidate('budgets');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Could not update the plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} title="Plan details" icon={<Pencil className="h-4 w-4" />} onSave={save} canSave={!!name.trim() && !saving} size="sm">
      <div className="space-y-3">
        <Field label="Plan name" required>
          <Input className={`${inp} border-input bg-transparent text-[var(--shell-text)]`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
        <Field label="Company envelope" hint="Shown against the planned total so you can see what is left to allocate.">
          <CurrencyInput value={envelope} onChange={setEnvelope} />
        </Field>
      </div>
    </ModuleModal>
  );
}

// ─── Approve or send back a submitted plan ───────────────────────────────────

export function PlanDecisionModal({ isOpen, onClose, plan, mode, planned, onDone }: {
  isOpen: boolean; onClose: () => void; plan: BudgetPlanInfo | null; mode: 'approve' | 'send_back'; planned: number; onDone: () => void;
}) {
  const invalidate = useInvalidate();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const approve = mode === 'approve';

  useEffect(() => { if (isOpen) { setNote(''); setSaving(false); } }, [isOpen]);

  const save = async () => {
    if (!plan || saving) return;
    setSaving(true);
    try {
      await api.post(`/budgets/plans/${plan.fy}/decision`, { decision: mode, note });
      toast.success(approve ? 'Plan approved. Spending is now checked against it.' : 'Plan sent back to draft.');
      invalidate('budgets');
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Could not record the decision.');
    } finally {
      setSaving(false);
    }
  };

  if (!plan) return null;
  return (
    <ModuleModal
      isOpen={isOpen} onClose={onClose} size="sm"
      title={approve ? `Approve ${plan.label}` : `Send ${plan.label} back`}
      icon={approve ? <CheckCircle2 className="h-4 w-4" /> : <CornerUpLeft className="h-4 w-4" />}
      onSave={save} canSave={!saving && (approve || !!note.trim())} saveLabel={approve ? 'Approve plan' : 'Send back'}
    >
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--shell-text)]">
          {approve
            ? <>Planned total <strong className="tabular-nums">{money(planned)}</strong>{plan.envelope != null && <> against an envelope of <strong className="tabular-nums">{money(plan.envelope)}</strong></>}. Once approved, new expenses are checked against the lines and changes need a reason.</>
            : <>The plan goes back to draft so its owner can change it and submit again.</>}
        </p>
        <Field label={approve ? 'Note' : 'What needs to change'} required={!approve}>
          <Textarea
            className="h-24 w-full resize-none rounded-md border border-input bg-transparent p-3 text-[13px] outline-none focus-visible:border-[var(--shell-accent)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]"
            style={{ color: 'var(--shell-text)' }}
            value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
            placeholder={approve ? 'Optional' : 'Say what to fix'}
          />
        </Field>
      </div>
    </ModuleModal>
  );
}

// ─── Budget line ─────────────────────────────────────────────────────────────

export function BudgetLineModal({ isOpen, onClose, view, editing, canReserve, onSaved, preset }: {
  isOpen: boolean; onClose: () => void; view: PlanView | undefined; editing: BudgetLine | null; canReserve: boolean; onSaved?: (id?: number) => void;
  // Opened from a project, product or order: the line is for that one and the object cannot be changed
  preset?: { cost_object: CostObject; object_id: number | null; object_name: string } | null;
}) {
  const invalidate = useInvalidate();
  const { data: projects } = useProjects();
  const { data: products } = useProducts();
  const { data: orders } = useBuildOrders();
  const { data: departments } = useDepartments();
  const { data: types } = useCategoryTypes('expense');
  const { data: categories } = useCategories();
  const { data: users } = useUsers();

  const [costObject, setCostObject] = useState<CostObject>('DEPARTMENT');
  const [objectId, setObjectId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [controlLevel, setControlLevel] = useState<'TYPE' | 'CATEGORY'>('TYPE');
  const [strict, setStrict] = useState(false);
  const [contingency, setContingency] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'even' | 'month'>('even');
  const [total, setTotal] = useState('');
  const [fromIdx, setFromIdx] = useState('0');
  const [toIdx, setToIdx] = useState('11');
  const [periods, setPeriods] = useState<string[]>(Array(12).fill(''));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  // Once the person planning has changed the amount or the months, a new starting amount never replaces them
  const [dirty, setDirty] = useState(false);

  const plan = view?.plan;
  const months = view?.months ?? [];
  const approved = !!plan && plan.status !== 'DRAFT';

  useEffect(() => {
    if (!isOpen) return;
    setSaving(false);
    setReason('');
    setDirty(false);
    if (editing) {
      setCostObject(editing.cost_object);
      setObjectId(String(editing.project_id ?? editing.product_id ?? editing.build_order_id ?? editing.department_id ?? ''));
      setTypeId(editing.type_id ? String(editing.type_id) : '');
      setCategoryId(editing.category_id ? String(editing.category_id) : '');
      setControlLevel(editing.control_level);
      setStrict(editing.strict);
      setContingency(editing.is_contingency);
      setOwnerId(editing.owner_id ? String(editing.owner_id) : '');
      setNote(editing.note || '');
      setMode('month');
      setTotal(String(editing.total));
      setFromIdx('0');
      setToIdx('11');
      setPeriods(editing.periods.map((p) => (p ? String(p) : '')));
    } else {
      setCostObject(preset?.cost_object ?? 'DEPARTMENT');
      setObjectId(preset?.object_id != null ? String(preset.object_id) : ''); setTypeId(''); setCategoryId(''); setControlLevel('TYPE');
      setStrict(false); setContingency(false); setOwnerId(''); setNote('');
      setMode('even'); setTotal(''); setFromIdx('0'); setToIdx('11'); setPeriods(Array(12).fill(''));
    }
  // The preset arrives as a new object on every render of the page, so only what is in it can restart the form; otherwise a refetch or a resize would wipe what was typed
  }, [isOpen, editing, preset?.cost_object, preset?.object_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const objectOptions = costObject === 'PROJECT'
    ? (projects || []).map((p) => ({ id: String(p.id), name: p.code ? `${p.code} ${p.name}` : p.name }))
    : costObject === 'PRODUCT'
      ? (products || []).map((p) => ({ id: String(p.id), name: p.code ? `${p.code} ${p.name}` : p.name }))
      : costObject === 'ORDER'
        ? (orders || []).filter((o) => o.status !== 'CANCELLED').map((o) => ({ id: String(o.id), name: `${o.code} ${o.product_name ?? ''} × ${o.quantity}`.trim() }))
        : costObject === 'DEPARTMENT' ? (departments || []).map((d) => ({ id: String(d.id), name: d.name })) : [];

  const typeOptions = sortByCode(types || [])
    .filter((t) => (costObject === 'DEPARTMENT' && departments?.find((d) => String(d.id) === objectId)?.name === 'Store') || !t.applies_to?.length || t.applies_to.includes(KIND_OF[costObject]) || String(t.id) === typeId)
    .map((t) => ({ id: String(t.id), name: labelOf(t) }));
  const categoryOptions = sortByCode((categories || []).filter((c) => c.type === 'expense' && String(c.type_id ?? '') === typeId))
    .map((c) => ({ id: String(c.id), name: labelOf(c) }));

  // A new line starts from a number the system can work out: the order's expected cost, the product's build plan at its standard cost, the project's estimate
  // for this expense type, or last year's spend for the overhead. It is only a starting point to add to or reduce.
  const suggestable = !editing && costObject !== 'RESERVE' && !!objectId;
  const { data: suggestion, isFetching: suggesting } = useLineSuggestion(costObject, objectId, typeId, plan?.fy, suggestable);
  const apply = (sug: NonNullable<typeof suggestion>) => {
    if (sug.amount == null) { setTotal(''); setPeriods(Array(12).fill('')); if (autoNote.current) { setNote(''); autoNote.current = false; } return; }
    if (sug.shape === 'month' && sug.months) { setMode('month'); setPeriods(Array.from({ length: 12 }, (_, i) => (sug.months![i] ? String(sug.months![i]) : ''))); }
    else { setMode('even'); setTotal(String(sug.amount)); setFromIdx(String(sug.from)); setToIdx(String(sug.to)); }
    if (sug.note && (!note.trim() || autoNote.current)) { setNote(sug.note); autoNote.current = true; }
    if (sug.type_id && !typeId) setTypeId(String(sug.type_id));
  };
  const autoNote = useRef(false);
  const appliedFor = useRef('');
  useEffect(() => { if (!isOpen) { appliedFor.current = ''; autoNote.current = false; } }, [isOpen]);
  useEffect(() => {
    // Apply once for each thing chosen (and each expense type, for a project or an overhead), and never over what the person has changed
    if (!suggestable || !suggestion) return;
    const key = `${costObject}-${objectId}-${costObject === 'PROJECT' || costObject === 'DEPARTMENT' ? typeId : ''}`;
    if (appliedFor.current === key) return;
    appliedFor.current = key;
    if (!dirty) apply(suggestion);
  }, [suggestion, suggestable, costObject, objectId, typeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = !!suggestion && suggestion.amount != null && (suggestion.shape === 'even'
    ? mode !== 'even' || Number(total) !== suggestion.amount || Number(fromIdx) !== suggestion.from || Number(toIdx) !== suggestion.to
    : mode !== 'month' || (suggestion.months ?? []).some((v, i) => Number(periods[i] || 0) !== v));

  const needsType = costObject !== 'RESERVE' && !contingency;
  const sum = periods.reduce((a, p) => a + (Number(p) || 0), 0);
  const amount = mode === 'even' ? Number(total) || 0 : sum;
  const canSave = !saving
    && (costObject === 'RESERVE' || !!objectId)
    && (!needsType || !!typeId)
    && (controlLevel !== 'CATEGORY' || !needsType || !!categoryId)
    && amount > 0
    && Number(toIdx) >= Number(fromIdx)
    && (!approved || !!reason.trim());

  const save = async () => {
    if (!plan || saving) return;
    setSaving(true);
    try {
      const body: any = {
        plan_id: plan.id, cost_object: costObject,
        project_id: costObject === 'PROJECT' ? Number(objectId) : null,
        product_id: costObject === 'PRODUCT' ? Number(objectId) : null,
        build_order_id: costObject === 'ORDER' ? Number(objectId) : null,
        department_id: costObject === 'DEPARTMENT' ? Number(objectId) : null,
        type_id: needsType ? Number(typeId) : null,
        category_id: needsType && controlLevel === 'CATEGORY' ? Number(categoryId) : null,
        control_level: needsType ? controlLevel : 'TYPE',
        strict, is_contingency: costObject === 'PROJECT' && contingency,
        owner_id: ownerId ? Number(ownerId) : null, note: note.trim() || null, reason: reason.trim() || undefined,
      };
      if (mode === 'even') Object.assign(body, { total: Number(total), from_index: Number(fromIdx), to_index: Number(toIdx) });
      else body.periods = periods.map((p) => Number(p) || 0);
      const res: any = editing ? await api.put(`/budgets/lines/${editing.id}`, body) : await api.post('/budgets/lines', body);
      toast.success(editing ? 'Budget line updated.' : 'Budget line added.');
      invalidate('budgets');
      onSaved?.(res?.data?.id);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the budget line.');
    } finally {
      setSaving(false);
    }
  };

  const objectLabel = OBJECT_LABEL[costObject];
  const owners = (users || []).filter((u) => u.is_active !== 0).map((u) => ({ id: String(u.id), name: u.username }));

  return (
    <ModuleModal
      isOpen={isOpen} onClose={onClose} size="xl"
      title={editing ? 'Edit budget line' : 'Add budget line'}
      icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      onSave={save} canSave={canSave} saveLabel={editing ? 'Update line' : 'Add line'}
    >
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 md:grid-cols-3">
        {/* Column 1: what the money is for */}
        <div className="space-y-3">
          {preset ? (
            <div className="space-y-0.5">
              <p className="text-[13px] font-medium text-[var(--shell-text)]">Budget for</p>
              <p className="text-[13px] text-[var(--shell-text)]">{preset.object_name}</p>
              <p className="text-[12px] text-[var(--shell-text-muted)]">{objectLabel}</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <p id="bl-for" className="text-[13px] font-medium text-[var(--shell-text)]">Budget for</p>
                <SegmentedControl
                  labelledBy="bl-for" value={costObject}
                  onChange={(v) => { setCostObject(v); setObjectId(''); setTypeId(''); setCategoryId(''); if (v !== 'PROJECT') setContingency(false); }}
                  options={[
                    { value: 'DEPARTMENT' as CostObject, label: 'Overhead' },
                    { value: 'PROJECT' as CostObject, label: 'Project' },
                    { value: 'PRODUCT' as CostObject, label: 'Product' },
                    { value: 'ORDER' as CostObject, label: 'Order' },
                    ...(canReserve || costObject === 'RESERVE' ? [{ value: 'RESERVE' as CostObject, label: 'Reserve' }] : []),
                  ]}
                />
              </div>
              {costObject !== 'RESERVE' && (
                <PickSelect label={objectLabel} required placeholder={`Select ${objectLabel.toLowerCase()}`} value={objectId} onChange={setObjectId} options={objectOptions} emptyHint={`No ${objectLabel.toLowerCase()}s yet.`} />
              )}
            </>
          )}
          {needsType && (
            <>
              <PickSelect label="Expense type" required placeholder="Select type" value={typeId} onChange={(v) => { setTypeId(v); setCategoryId(''); }} options={typeOptions} emptyHint="No types allowed for this budget." />
              <div className="space-y-1.5">
                <p id="bl-control" className="text-[13px] font-medium text-[var(--shell-text)]">Controlled at</p>
                <SegmentedControl
                  labelledBy="bl-control" value={controlLevel} onChange={setControlLevel}
                  options={[{ value: 'TYPE' as const, label: 'Expense type' }, { value: 'CATEGORY' as const, label: 'Category' }]}
                />
              </div>
              {controlLevel === 'CATEGORY' && (
                <PickSelect label="Category" required placeholder="Select category" value={categoryId} onChange={setCategoryId} options={categoryOptions} disabled={!typeId} emptyHint="No categories for this type." />
              )}
            </>
          )}
          {costObject === 'PROJECT' && (
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[var(--shell-text)]">
              <Switch checked={contingency} onCheckedChange={setContingency} aria-label="Held contingency" />
              Held contingency for this project
            </label>
          )}
        </div>

        {/* Column 2: how much, and when */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p id="bl-phase" className="text-[13px] font-medium text-[var(--shell-text)]">Phasing</p>
            <SegmentedControl
              labelledBy="bl-phase" value={mode} onChange={(v) => { setDirty(true); setMode(v); }}
              options={[{ value: 'even' as const, label: 'Spread evenly' }, { value: 'month' as const, label: 'By month' }]}
            />
          </div>
          {mode === 'even' ? (
            <>
              <Field label="Amount for the period" required>
                <CurrencyInput value={total} onChange={(v) => { setDirty(true); setTotal(v); }} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="From">
                  <NativeSelect value={fromIdx} onChange={(e) => { setDirty(true); setFromIdx(e.target.value); }}>
                    {months.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="To">
                  <NativeSelect value={toIdx} onChange={(e) => { setDirty(true); setToIdx(e.target.value); }}>
                    {months.map((m, i) => <option key={i} value={i} disabled={i < Number(fromIdx)}>{m.label}</option>)}
                  </NativeSelect>
                </Field>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-[var(--shell-text)]">Amount by month</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                {months.map((m, i) => (
                  <label key={i} className="flex items-center gap-2 text-[12px] text-[var(--shell-text-muted)]">
                    <span className="w-10 shrink-0">{m.label}</span>
                    <Input
                      aria-label={`Amount for ${m.label}`} type="number" min="0" step="1"
                      className={`${inp} border-input bg-transparent text-right tabular-nums text-[var(--shell-text)] !h-8`}
                      value={periods[i] ?? ''} onChange={(e) => { setDirty(true); setPeriods((p) => p.map((x, j) => (j === i ? e.target.value : x))); }}
                    />
                  </label>
                ))}
              </div>
              <p className="text-[12px] text-[var(--shell-text-muted)]">Total <strong className="tabular-nums text-[var(--shell-text)]">{money(sum)}</strong></p>
            </div>
          )}
          {suggestable && (
            <p className="text-[12px] text-[var(--shell-text-muted)]">
              {!suggestion || suggesting && !suggestion
                ? 'Working out a starting amount…'
                : suggestion.amount == null
                  ? suggestion.reason
                  : <>
                      Starting amount: <strong className="tabular-nums text-[var(--shell-text)]">{money(suggestion.amount)}</strong>. {suggestion.note}. Add to it or reduce it to plan for more or less.
                      {changed && <> <button type="button" onClick={() => { setDirty(false); apply(suggestion); }} className="rounded-md px-1 font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">Use it again</button></>}
                    </>}
            </p>
          )}
        </div>

        {/* Column 3: who answers for it, and how hard it is enforced */}
        <div className="space-y-3">
          <PickSelect label="Owner" placeholder="Select owner" value={ownerId} onChange={setOwnerId} options={owners} />
          {costObject !== 'RESERVE' && (
            <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-[var(--shell-text)]">
              <Switch className="mt-0.5" checked={strict} onCheckedChange={setStrict} aria-label="Strict line" />
              <span>Strict: block new expenses once the budget is used<span className="block text-[12px] text-[var(--shell-text-muted)]">Otherwise they go ahead with a written reason.</span></span>
            </label>
          )}
          <Field label="Note">
            <Input className={`${inp} border-input bg-transparent text-[var(--shell-text)]`} placeholder="Basis or assumption" value={note} onChange={(e) => { autoNote.current = false; setNote(e.target.value); }} maxLength={500} />
          </Field>
          {approved && (
            <Field label="Reason for the change" required hint="The plan is approved. Finance records why it changed.">
              <Input className={`${inp} border-input bg-transparent text-[var(--shell-text)]`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>
          )}
        </div>
      </div>
    </ModuleModal>
  );
}
