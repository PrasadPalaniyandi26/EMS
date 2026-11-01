'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowLeftRight, CheckCircle2, XCircle, ClipboardList, Clock } from 'lucide-react';
import { fyLabel } from '@/hooks/use-budget-queries';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { ConfirmDialog, Field, NativeSelect, CurrencyInput, SectionHeader, SegmentedControl, inp } from '@/components/shared/modal-primitives';
import { PickSelect } from '@/components/shared/pick-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCategoryTypes, useInvalidate } from '@/hooks/use-queries';
import { useBudgetMonitor } from '@/hooks/use-budget-queries';
import type { BaselineRow, BudgetChangeRow, CloseLine, EstimateLineRow, Item, JobBom, Milestone, OperationRow, OperationType, BomLineRow, OverheadRate, RateCard, ProductCosting, ProjectBudget } from '@/hooks/use-planning-queries';
import { money, plain, unitPrice } from '@/components/budgets/budget-ui';
import { useItemCategories, useEstimatePhases, type ItemCategory } from '@/hooks/use-planning-queries';
import { ManageList } from '@/components/manage/manage-list';
import { sortByCode } from '@/lib/codes';
import { cn } from '@/lib/utils';

const ctl = `${inp} border-input bg-transparent text-[var(--shell-text)]`;
const text = (v: string, set: (s: string) => void, extra: Record<string, unknown> = {}) => (
  <Input className={ctl} value={v} onChange={(e) => set(e.target.value)} {...extra} />
);
const textarea = 'h-20 w-full resize-none rounded-md border border-input bg-transparent p-3 text-[13px] text-[var(--shell-text)] outline-none focus-visible:border-[var(--shell-accent)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]';

// Shared save wrapper: one request, a toast, a refresh of every budget query, then close
// Today's date in the user's own time zone, as the date inputs expect it
const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function useSaver(onClose: () => void) {
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);
  const run = async (job: () => Promise<unknown>, done: string, after?: () => void) => {
    if (saving) return;
    setSaving(true);
    try { await job(); toast.success(done); invalidate('budgets'); after?.(); onClose(); }
    catch (e: any) { toast.error(e?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };
  return { saving, run };
}

interface Base { isOpen: boolean; onClose: () => void }

// One layout for the product and project "Price and costing" dialogs: what it sells for on the left, what it costs on the right
const pricingGrid = (two: boolean) => cn('grid grid-cols-1 gap-y-5', two && 'md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]');
const priceColumn = (two: boolean) => cn(two && 'md:pr-6');
const COST_COLUMN = 'md:border-l md:border-[var(--shell-border)] md:pl-6';

// ─── Project settings ────────────────────────────────────────────────────────

export function ProjectSettingsModal({ isOpen, onClose, data }: Base & { data: ProjectBudget | undefined }) {
  const { saving, run } = useSaver(onClose);
  const [cv, setCv] = useState(''); const [tm, setTm] = useState(''); const [risk, setRisk] = useState('');
  const [cont, setCont] = useState(''); const [war, setWar] = useState('');
  // Fill the fields when the dialog opens only, so a refresh in the background never wipes what is being typed
  const latest = useRef(data); latest.current = data;
  useEffect(() => {
    const d = latest.current;
    if (!isOpen || !d) return;
    setCv(d.project.contract_value != null ? String(d.project.contract_value) : '');
    setTm(d.project.target_margin_pct != null ? String(d.project.target_margin_pct) : '');
    setRisk(d.project.risk_rating ?? '');
    setCont(String(d.estimate?.contingency_pct ?? d.suggested_contingency_pct));
    setWar(String(d.estimate?.warranty_pct ?? 2));
  }, [isOpen]);
  const est = data?.estimate ?? null;
  const num = (v: string) => (v === '' ? NaN : Number(v));
  const cvN = num(cv); const tmN = num(tm); const contN = num(cont); const warN = num(war);
  const cvOk = cv === '' || cvN >= 0;
  const tmOk = tm === '' || (tmN >= 0 && tmN <= 100);
  const allowOk = !est || (contN >= 0 && contN <= 100 && warN >= 0 && warN <= 100);
  // What the estimate comes to with these allowances: warranty is charged on direct cost plus contingency
  const direct = data?.totals.direct ?? 0;
  const contAmt = allowOk && est ? direct * (contN / 100) : 0;
  const warAmt = allowOk && est ? (direct + contAmt) * (warN / 100) : 0;
  const total = direct + contAmt + warAmt;
  const hasCv = cv !== '' && cvOk && cvN > 0;
  const margin = est && allowOk && hasCv ? ((cvN - total) / cvN) * 100 : null;
  const target = tm !== '' && tmOk ? tmN : null;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} title="Price and costing" icon={<Pencil className="h-4 w-4" />} size={est ? 'xl' : 'sm'} saveLabel="Save changes" canSave={!saving && cvOk && tmOk && allowOk}
      onSave={() => run(() => api.put(`/budgets/projects/${data!.project.id}/settings`, {
        contract_value: cv === '' ? null : Number(cv), target_margin_pct: tm === '' ? null : Number(tm), risk_rating: risk || null,
        ...(est ? { contingency_pct: Number(cont), warranty_pct: Number(war) } : {}),
      }), 'Project updated.')}>
      <div className={pricingGrid(!!est)}>
        <section aria-label="Contract price" className={priceColumn(!!est)}>
          <SectionHeader label="Contract price" />
          <div className="space-y-3">
            <Field label="Contract value" hint="What the client pays for the project." error={!cvOk ? 'Enter zero or more.' : undefined}><CurrencyInput value={cv} onChange={setCv} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target margin %" error={!tmOk ? 'Enter 0 to 100.' : undefined}><Input type="number" min="0" max="100" step="0.5" className={ctl} value={tm} onChange={(e) => setTm(e.target.value)} /></Field>
              <Field label="Risk">
                <NativeSelect value={risk} onChange={(e) => setRisk(e.target.value)}>
                  <option value="">Not rated</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
                </NativeSelect>
              </Field>
            </div>
          </div>
        </section>

        {est && data && (
          <section aria-label="Cost settings" className={COST_COLUMN}>
            <SectionHeader label="Cost settings" />
            <div className="space-y-3">
              <p className="text-[12px] text-[var(--shell-text-muted)]">Added on top of the direct cost of the estimate lines. Warranty is charged on the direct cost plus contingency.</p>
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="Contingency %" hint={`Suggested ${data.suggested_contingency_pct}% for this risk.`} error={!(contN >= 0 && contN <= 100) ? 'Enter 0 to 100.' : undefined}><Input type="number" min="0" max="100" step="0.5" className={ctl} value={cont} onChange={(e) => setCont(e.target.value)} /></Field>
                <Field label="Warranty %" error={!(warN >= 0 && warN <= 100) ? 'Enter 0 to 100.' : undefined}><Input type="number" min="0" max="100" step="0.5" className={ctl} value={war} onChange={(e) => setWar(e.target.value)} /></Field>
              </div>
              <div className="space-y-1 rounded-md border border-[var(--shell-border)] p-3 text-[13px]">
                <div className="flex justify-between"><span className="text-[var(--shell-text-muted)]">Direct cost</span><span className="tabular-nums">{money(direct)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--shell-text-muted)]">Contingency</span><span className="tabular-nums">{money(contAmt)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--shell-text-muted)]">Warranty</span><span className="tabular-nums">{money(warAmt)}</span></div>
                <div className="flex justify-between border-t border-[var(--shell-border)] pt-1 font-medium"><span>Estimate</span><span className="tabular-nums">{money(total)}</span></div>
              </div>
              {margin != null && (
                <p className={cn('text-[13px]', target != null && margin < target ? 'text-[var(--warning)]' : 'text-[var(--shell-text)]')}>
                  Profit at estimate <strong className="tabular-nums">{money(cvN - total)}</strong>. Margin <strong className="tabular-nums">{margin.toFixed(1)}%</strong> of the contract value
                  {target != null ? (margin >= target ? `, which meets the ${target}% target.` : `, below the ${target}% target. The contract value would need to be ${money(total / (1 - target / 100))} to reach it.`) : '.'}
                </p>
              )}
              {!hasCv && <p className="text-[12px] text-[var(--shell-text-muted)]">Enter the contract value to see the margin.</p>}
            </div>
          </section>
        )}
      </div>
    </ModuleModal>
  );
}

// ─── Estimate line ───────────────────────────────────────────────────────────

export function EstimateLineModal({ isOpen, onClose, data, editing }: Base & { data: ProjectBudget | undefined; editing: EstimateLineRow | null }) {
  const { saving, run } = useSaver(onClose);
  const { data: types } = useCategoryTypes('expense');
  const { data: phaseList } = useEstimatePhases();
  const [phase, setPhase] = useState(''); const [typeId, setTypeId] = useState(''); const [desc, setDesc] = useState('');
  const [costed, setCosted] = useState<'LABOUR' | 'FIXED'>('FIXED'); const [card, setCard] = useState('');
  const [qty, setQty] = useState(''); const [unit, setUnit] = useState('nos'); const [rate, setRate] = useState(''); const [basis, setBasis] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    // A line is not stored as labour or fixed: hours on the rate card (unit "hr") mean labour
    const labour = editing?.unit === 'hr';
    setPhase(editing?.phase ?? ''); setTypeId(editing?.type_id ? String(editing.type_id) : ''); setDesc(editing?.description ?? '');
    setCosted(labour ? 'LABOUR' : 'FIXED');
    setCard(labour ? String(data?.rate_cards.find((c) => c.rate_per_hour === editing?.rate)?.id ?? '') : '');
    setQty(editing ? String(editing.quantity) : ''); setUnit(editing?.unit ?? 'nos'); setRate(editing ? String(editing.rate) : ''); setBasis(editing?.basis ?? '');
  }, [isOpen, editing, data]);
  const typeOptions = sortByCode((types ?? []).filter((t) => !t.applies_to?.length || t.applies_to.includes('PROJECT'))).map((t) => ({ id: String(t.id), name: t.code ? `${t.code} ${t.name}` : t.name }));
  // A phase that has been archived keeps its lines, so an edited line still shows it
  const phaseOptions = (phaseList ?? []).map((p) => ({ id: p.name, name: p.name }));
  if (phase && !phaseOptions.some((o) => o.id === phase)) phaseOptions.push({ id: phase, name: `${phase} (archived)` });
  const labour = costed === 'LABOUR';
  const amount = (Number(qty) || 0) * (Number(rate) || 0);
  const id = data?.project.id;
  const box = 'flex h-9 items-center rounded-md border border-[var(--input)] bg-transparent px-3 text-[13px] tabular-nums text-[var(--shell-text)]';
  const pickCosted = (v: 'LABOUR' | 'FIXED') => { setCosted(v); setCard(''); setRate(''); setUnit(v === 'LABOUR' ? 'hr' : unit === 'hr' ? 'nos' : unit); };
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="xl" title={editing ? 'Edit estimate line' : 'Add estimate line'} icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      canSave={!saving && !!phase && !!desc.trim() && Number(qty) > 0 && Number(rate) >= 0 && rate !== ''} saveLabel={editing ? 'Update line' : 'Add line'}
      onSave={() => run(() => {
        const body = { phase, type_id: typeId ? Number(typeId) : null, description: desc, quantity: Number(qty), unit: labour ? 'hr' : unit, rate: Number(rate), basis };
        return editing ? api.put(`/budgets/projects/${id}/estimate-lines/${editing.id}`, body) : api.post(`/budgets/projects/${id}/estimate-lines`, body);
      }, editing ? 'Estimate line updated.' : 'Estimate line added.')}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
        <div className="space-y-3">
          <PickSelect label="Phase" required placeholder="Select phase" value={phase} onChange={setPhase} options={phaseOptions} emptyHint="Add phases with Manage phases." />
          <Field label="Description" required>{text(desc, setDesc, { maxLength: 200, placeholder: 'What is being bought or done' })}</Field>
          <PickSelect label="Expense type" placeholder="Select type" value={typeId} onChange={setTypeId} options={typeOptions} emptyHint="No types allowed for projects." />
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p id="est-costed" className="text-[13px] font-medium text-[var(--shell-text)]">Costed as</p>
            <SegmentedControl labelledBy="est-costed" value={costed} onChange={pickCosted} options={[{ value: 'LABOUR' as const, label: 'Labour' }, { value: 'FIXED' as const, label: 'Fixed' }]} />
          </div>
          {labour ? (
            <>
              <PickSelect label="Role" required placeholder="Select role" value={card}
                onChange={(v) => { setCard(v); const c = data?.rate_cards.find((x) => String(x.id) === v); if (c) { setRate(String(c.rate_per_hour)); setUnit('hr'); if (!desc) setDesc(c.role); } }}
                options={(data?.rate_cards ?? []).map((c) => ({ id: String(c.id), name: c.role }))} emptyHint="Add roles under Cost rates in the Costing menu." />
              <Field label="Cost per hour" hint="From the rate card."><div className={box}>{rate !== '' ? money(Number(rate)) : '—'}</div></Field>
            </>
          ) : (
            <Field label="Fixed cost per unit" required hint="What one unit costs, such as a bought-in part or a vendor charge."><CurrencyInput value={rate} onChange={setRate} /></Field>
          )}
        </div>
        <div className="space-y-3">
          {labour ? (
            <Field label="Hours" required><Input type="number" min="0" step="0.5" className={ctl} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity" required><Input type="number" min="0" step="0.5" className={ctl} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
              <Field label="Unit">{text(unit, setUnit, { maxLength: 20 })}</Field>
            </div>
          )}
          <Field label="Basis" hint="Quote, past project or assumption.">{text(basis, setBasis, { maxLength: 200 })}</Field>
          <div className="rounded-lg border border-[var(--shell-border)] p-3">
            <p className="text-[12px] text-[var(--shell-text-muted)]">Line amount</p>
            <p className="text-[18px] font-semibold tabular-nums text-[var(--shell-text)]">{money(amount)}</p>
          </div>
        </div>
      </div>
    </ModuleModal>
  );
}

// The managed list of phases the estimate line dialog picks from
export function EstimatePhasesModal({ isOpen, onClose }: Base) {
  const invalidate = useInvalidate();
  const { data } = useEstimatePhases();
  const phases = data ?? [];
  const done = async <T,>(job: Promise<T>) => { const r = await job; invalidate('budgets'); return r; };
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} title="Manage phases" size="md" footer={<Button onClick={onClose} className="h-8 px-5 text-[12px] font-semibold">Done</Button>}>
      <ManageList
        heading="Phases"
        sectionLabel="Phases"
        noun="phase"
        items={phases.map((p) => ({ id: p.id, name: p.name, used: p.used_in }))}
        emptyText="No phases yet."
        taken={(name, exceptId) => phases.some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === name.trim().toLowerCase()) ? `A phase named "${name}" already exists` : null}
        onAdd={(name) => done(api.post('/budgets/estimate-phases', { name }))}
        onRename={(id, name) => done(api.put(`/budgets/estimate-phases/${id}`, { name }))}
        onRemove={async (id) => (await done(api.delete(`/budgets/estimate-phases/${id}`))).data as any}
        usedBy="estimate lines"
      />
    </ModuleModal>
  );
}

// ─── Milestone ───────────────────────────────────────────────────────────────

export function MilestoneModal({ isOpen, onClose, projectId, editing, weightLeft }: Base & { projectId: number; editing: Milestone | null; weightLeft: number }) {
  const { saving, run } = useSaver(onClose);
  const [name, setName] = useState(''); const [w, setW] = useState(''); const [planned, setPlanned] = useState(''); const [done, setDone] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setName(editing?.name ?? ''); setW(editing ? String(editing.weight_pct) : weightLeft > 0 ? String(weightLeft) : ''); setPlanned(editing?.planned_date?.slice(0, 10) ?? ''); setDone(editing?.done_date?.slice(0, 10) ?? '');
  }, [isOpen, editing, weightLeft]);
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title={editing ? 'Edit milestone' : 'Add milestone'} icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      canSave={!saving && !!name.trim() && Number(w) > 0 && Number(w) <= 100 && !!planned} saveLabel={editing ? 'Update milestone' : 'Add milestone'}
      onSave={() => run(() => {
        const body = { name, weight_pct: Number(w), planned_date: planned, done_date: done || null };
        return editing ? api.put(`/budgets/projects/${projectId}/milestones/${editing.id}`, body) : api.post(`/budgets/projects/${projectId}/milestones`, body);
      }, editing ? 'Milestone updated.' : 'Milestone added.')}>
      <div className="space-y-3">
        <Field label="Milestone" required>{text(name, setName, { maxLength: 120 })}</Field>
        <Field label="Weight %" required hint={`${weightLeft > 0 ? `${weightLeft}% of the project is not yet assigned.` : 'The weights already add up to 100%.'}`}><Input type="number" min="0" max="100" step="0.5" className={ctl} value={w} onChange={(e) => setW(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Planned date" required><Input type="date" className={ctl} value={planned} onChange={(e) => setPlanned(e.target.value)} /></Field>
          <Field label="Done on"><Input type="date" className={ctl} value={done} onChange={(e) => setDone(e.target.value)} /></Field>
        </div>
      </div>
    </ModuleModal>
  );
}

// ─── Item ────────────────────────────────────────────────────────────────────

export function ItemModal({ isOpen, onClose, editing }: Base & { editing: Item | null }) {
  const { saving, run } = useSaver(onClose);
  const blank = { part_no: '', name: '', sourcing: 'BUY' as 'BUY' | 'MAKE', uom: 'nos', standard_price: '', material_cost: '', manufacturing_cost: '', last_price: '', supplier: '', lead_time_days: '', category_id: '' };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (!isOpen) return;
    setF(editing
      ? { part_no: editing.part_no, name: editing.name, sourcing: editing.sourcing ?? 'BUY', uom: editing.uom, standard_price: String(editing.standard_price),
          material_cost: editing.material_cost != null ? String(editing.material_cost) : '', manufacturing_cost: editing.manufacturing_cost != null ? String(editing.manufacturing_cost) : '',
          last_price: editing.last_price != null ? String(editing.last_price) : '', supplier: editing.supplier ?? '', category_id: editing.category_id != null ? String(editing.category_id) : '', lead_time_days: editing.lead_time_days != null ? String(editing.lead_time_days) : '' }
      : blank);
  }, [isOpen, editing]);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const make = f.sourcing === 'MAKE';
  // For a made part the standard price is the sum of its material and manufacturing cost, so it is never typed in
  const standard = make ? (Number(f.material_cost) || 0) + (Number(f.manufacturing_cost) || 0) : Number(f.standard_price);
  const priceOk = make ? f.material_cost !== '' || f.manufacturing_cost !== '' : f.standard_price !== '' && Number(f.standard_price) >= 0;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="lg" title={editing ? 'Edit part' : 'Add part'} icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      canSave={!saving && !!f.part_no.trim() && !!f.name.trim() && priceOk && standard >= 0} saveLabel={editing ? 'Update part' : 'Add part'}
      onSave={() => run(() => {
        const body = {
          part_no: f.part_no, name: f.name, sourcing: f.sourcing, uom: f.uom, supplier: f.supplier, lead_time_days: f.lead_time_days ? Number(f.lead_time_days) : null,
          standard_price: standard, material_cost: make ? Number(f.material_cost) || 0 : null, manufacturing_cost: make ? Number(f.manufacturing_cost) || 0 : null,
          last_price: f.last_price === '' ? null : Number(f.last_price),
          category_id: f.category_id === '' ? null : Number(f.category_id),
        };
        return editing ? api.put(`/budgets/items/${editing.id}`, body) : api.post('/budgets/items', body);
      }, editing ? 'Part updated.' : 'Part added.')}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <p id="item-sourcing" className="text-[13px] font-medium text-[var(--shell-text)]">Sourcing</p>
          <SegmentedControl labelledBy="item-sourcing" value={f.sourcing} onChange={(v) => setF((x) => ({ ...x, sourcing: v }))} options={[{ value: 'BUY' as const, label: 'Buy' }, { value: 'MAKE' as const, label: 'Make' }]} />
        </div>
        <Field label="Part number" required>{text(f.part_no, set('part_no'), { maxLength: 40 })}</Field>
        <Field label="Name" required>{text(f.name, set('name'), { maxLength: 150 })}</Field>
        <Field label="Category" hint="Groups parts in the Part master. Manage the list there."><CategoryPicker value={f.category_id} onChange={set('category_id')} /></Field>
        {make ? (
          <>
            <Field label="Material cost" required hint="Raw material per unit."><CurrencyInput value={f.material_cost} onChange={set('material_cost')} /></Field>
            <Field label="Manufacturing cost" required hint="Machining, bending or other work per unit."><CurrencyInput value={f.manufacturing_cost} onChange={set('manufacturing_cost')} /></Field>
            <Field label="Standard price" hint="Material plus manufacturing. Calculated, not typed.">
              <div className="flex h-9 items-center rounded-md border border-[var(--input)] bg-transparent px-3 text-[13px] tabular-nums text-[var(--shell-text)]">
                <span className="mr-2 text-[var(--shell-text-muted)]">₹</span>{standard.toFixed(2)}
              </div>
            </Field>
          </>
        ) : (
          <Field label="Standard price" required><CurrencyInput value={f.standard_price} onChange={set('standard_price')} /></Field>
        )}
        <Field label="Last paid price" hint="Shows the drift from standard."><CurrencyInput value={f.last_price} onChange={set('last_price')} /></Field>
        <Field label="Unit of measure">{text(f.uom, set('uom'), { maxLength: 12 })}</Field>
        <Field label="Lead time (days)"><Input type="number" min="0" className={ctl} value={f.lead_time_days} onChange={(e) => set('lead_time_days')(e.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="Supplier">{text(f.supplier, set('supplier'), { maxLength: 120 })}</Field></div>
      </div>
    </ModuleModal>
  );
}

// Part categories from the managed list; a category that has been archived keeps its parts but leaves the picker
function CategoryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useItemCategories();
  const list = data ?? [];
  const missing = value !== '' && !list.some((c) => String(c.id) === value);
  return (
    <NativeSelect aria-label="Category" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No category</option>
      {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      {missing && <option value={value}>Archived category</option>}
    </NativeSelect>
  );
}

export function ItemCategoriesModal({ isOpen, onClose }: Base) {
  const invalidate = useInvalidate();
  const { data } = useItemCategories();
  const list: ItemCategory[] = data ?? [];
  const [mode, setMode] = useState<'new' | number | null>(null);
  const [name, setName] = useState(''); const [saving, setSaving] = useState(false); const [del, setDel] = useState<ItemCategory | null>(null);
  useEffect(() => { if (isOpen) setMode(null); }, [isOpen]);
  const begin = (c: ItemCategory | null) => { setMode(c ? c.id : 'new'); setName(c?.name ?? ''); };
  const save = async () => {
    setSaving(true);
    try {
      if (mode === 'new') await api.post('/budgets/item-categories', { name }); else await api.put(`/budgets/item-categories/${mode}`, { name });
      toast.success('Category saved.'); invalidate('budgets'); setMode(null);
    } catch (e: any) { toast.error(e?.message || 'Could not save.'); } finally { setSaving(false); }
  };
  const remove = async (c: ItemCategory) => {
    try {
      const r: any = await api.delete(`/budgets/item-categories/${c.id}`);
      toast.success(r?.data?.archived ? 'Category archived. Its parts keep it.' : 'Category removed.'); invalidate('budgets');
    } catch (e: any) { toast.error(e?.message || 'Could not remove.'); }
  };
  const iconBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--shell-text-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]';
  return (
    <>
      <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title="Part categories" icon={<ClipboardList className="h-4 w-4" />} canSave={mode === null || !!name.trim()}
        footer={<button type="button" className="btn-action" onClick={onClose}>Close</button>}>
        <div className="space-y-3">
          <div className="divide-y divide-[var(--shell-border)] rounded-md border border-[var(--shell-border)]">
            {list.length === 0 && <p className="px-3 py-2 text-[13px] text-[var(--shell-text-muted)]">No categories yet.</p>}
            {list.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[var(--shell-text)]">{c.name}</p>
                  <p className="text-[12px] text-[var(--shell-text-muted)]">{c.used_in ? `${c.used_in} part${c.used_in === 1 ? '' : 's'}` : 'No parts'}</p>
                </div>
                <div className="flex shrink-0">
                  <button type="button" aria-label={`Edit ${c.name}`} className={iconBtn} onClick={() => begin(c)}><Pencil className="h-4 w-4 text-[var(--info)]" /></button>
                  <button type="button" aria-label={`Remove ${c.name}`} className={iconBtn} onClick={() => setDel(c)}><Trash2 className="h-4 w-4 text-[var(--danger)]" /></button>
                </div>
              </div>
            ))}
          </div>
          {mode !== null ? (
            <div className="space-y-2 rounded-md border border-[var(--shell-border)] p-3">
              <Field label="Name" required>{text(name, setName, { maxLength: 60, placeholder: 'Electronics' })}</Field>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-action" onClick={() => setMode(null)}>Cancel</button>
                <button type="button" className="btn-action-primary" disabled={saving || !name.trim()} onClick={save}>{mode === 'new' ? 'Add category' : 'Save category'}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-action" onClick={() => begin(null)}><Plus className="h-4 w-4 text-[var(--success)]" /> Add category</button>
          )}
        </div>
      </ModuleModal>
      <ConfirmDialog open={!!del} destructive title={del?.used_in ? 'Archive category' : 'Remove category'} confirmLabel={del?.used_in ? 'Archive' : 'Remove'}
        message={del?.used_in ? `${del.name} is used by ${del.used_in} part${del.used_in === 1 ? '' : 's'}. It is archived: the parts keep it and it leaves the picker.` : `Remove ${del?.name}?`}
        onCancel={() => setDel(null)} onConfirm={async () => { const c = del; setDel(null); if (c) await remove(c); }} />
    </>
  );
}

// ─── Rate card and overhead pool ─────────────────────────────────────────────

export function RateCardModal({ isOpen, onClose, editing }: Base & { editing: RateCard | null }) {
  const { saving, run } = useSaver(onClose);
  const [role, setRole] = useState(''); const [rate, setRate] = useState(''); const [when, setWhen] = useState('');
  useEffect(() => { if (isOpen) { setRole(editing?.role ?? ''); setRate(editing ? String(editing.rate_per_hour) : ''); setWhen(localToday()); } }, [isOpen, editing]);
  const later = when > localToday();
  const changed = !editing || Number(rate) !== editing.rate_per_hour;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title={editing ? 'Edit rate' : 'Add rate'} icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      canSave={!saving && !!role.trim() && Number(rate) > 0 && !!when} saveLabel={editing ? (later ? 'Schedule rate' : 'Update rate') : 'Add rate'}
      onSave={() => run(() => (editing ? api.put(`/budgets/rate-cards/${editing.id}`, { role, rate_per_hour: Number(rate), effective_from: when }) : api.post('/budgets/rate-cards', { role, rate_per_hour: Number(rate), effective_from: when })), later ? 'Rate scheduled.' : 'Rate saved.')}>
      <div className="space-y-3">
        <Field label="Role" required>{text(role, setRole, { maxLength: 80, placeholder: 'Controls engineer' })}</Field>
        <Field label="Cost per hour" required><CurrencyInput value={rate} onChange={setRate} /></Field>
        <Field label="Effective from" required hint={!changed ? 'The rate is unchanged, so no new dated rate is added.' : later ? 'Live costs switch to this rate on that date. Until then the current rate applies.' : 'From this date, live costs use the new rate. Approved standard costs do not change.'}>
          <Input type="date" className={ctl} value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </div>
    </ModuleModal>
  );
}

export function OverheadBaseModal({ isOpen, onClose, fy, current }: Base & { fy: number; current: number }) {
  const { saving, run } = useSaver(onClose);
  const [hours, setHours] = useState('');
  useEffect(() => { if (isOpen) setHours(current > 0 ? String(current) : ''); }, [isOpen, current]);
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title={`Base hours for ${fyLabel(fy)}`} icon={<Clock className="h-4 w-4" />}
      canSave={!saving && Number(hours) > 0} saveLabel="Save base hours"
      onSave={() => run(() => api.put(`/budgets/overhead-base/${fy}`, { base_hours: Number(hours) }), 'Base hours saved.')}>
      <div className="space-y-3">
        <p className="text-[12px] text-[var(--shell-text-muted)]">The in-house hours the year's overhead is spread over. Every pool is recovered over these hours, so one figure is used for all of them.</p>
        <Field label="Base hours for the year" required hint={Number(hours) > 0 ? `Each pool's rate is its cost divided by ${Number(hours).toLocaleString('en-IN')} hours.` : undefined}><Input type="number" min="1" className={ctl} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
      </div>
    </ModuleModal>
  );
}

export function OverheadModal({ isOpen, onClose, editing, fy }: Base & { editing: OverheadRate | null; fy: number }) {
  const { saving, run } = useSaver(onClose);
  const [name, setName] = useState(''); const [pool, setPool] = useState('');
  useEffect(() => { if (isOpen) { setName(editing?.name ?? ''); setPool(editing ? String(editing.pool_amount) : ''); } }, [isOpen, editing]);
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title={editing ? 'Edit overhead pool' : 'Add overhead pool'} icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      canSave={!saving && !!name.trim() && pool !== ''} saveLabel={editing ? 'Update pool' : 'Add pool'}
      onSave={() => run(() => {
        const body = { fy: editing?.fy ?? fy, name, pool_amount: Number(pool) };
        return editing ? api.put(`/budgets/overhead-rates/${editing.id}`, body) : api.post('/budgets/overhead-rates', body);
      }, 'Overhead pool saved.')}>
      <div className="space-y-3">
        <Field label="Pool" required>{text(name, setName, { maxLength: 80, placeholder: 'Factory and utilities' })}</Field>
        <Field label="Cost for the year" required><CurrencyInput value={pool} onChange={setPool} /></Field>
      </div>
    </ModuleModal>
  );
}

// ─── BOM line and operation ──────────────────────────────────────────────────

// With `job` the line goes on a bespoke project's job BOM, where a sub-assembly is a standard product priced at its approved standard
export function BomLineModal({ isOpen, onClose, data, job, editing }: Base & { data?: ProductCosting | undefined; job?: JobBom | undefined; editing: BomLineRow | null }) {
  const { saving, run } = useSaver(onClose);
  const [kind, setKind] = useState<'item' | 'sub'>('item');
  const [itemId, setItemId] = useState(''); const [subId, setSubId] = useState(''); const [qty, setQty] = useState(''); const [scrap, setScrap] = useState('0');
  useEffect(() => {
    if (!isOpen) return;
    const sub = job ? editing?.sub_product_id : editing?.sub_bom_id;
    setKind(sub ? 'sub' : 'item'); setItemId(editing?.item_id ? String(editing.item_id) : ''); setSubId(sub ? String(sub) : '');
    setQty(editing ? String(editing.quantity) : ''); setScrap(editing ? String(editing.scrap_pct) : '0');
  }, [isOpen, editing, job]);
  const item = (job ?? data)?.items.find((i) => String(i.id) === itemId);
  const base = job ? `/budgets/projects/${job.project.id}/job-bom/lines` : `/budgets/products/${data?.product.id}/bom-lines`;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title={editing ? 'Edit BOM line' : 'Add BOM line'} icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      canSave={!saving && (kind === 'item' ? !!itemId : !!subId) && Number(qty) > 0} saveLabel={editing ? 'Update line' : 'Add line'}
      onSave={() => run(() => {
        const body = job
          ? { item_id: kind === 'item' ? Number(itemId) : null, sub_product_id: kind === 'sub' ? Number(subId) : null, quantity: Number(qty), scrap_pct: Number(scrap) || 0 }
          : { item_id: kind === 'item' ? Number(itemId) : null, sub_bom_id: kind === 'sub' ? Number(subId) : null, quantity: Number(qty), scrap_pct: Number(scrap) || 0 };
        return editing ? api.put(`${base}/${editing.id}`, body) : api.post(base, body);
      }, editing ? 'BOM line updated.' : 'BOM line added.')}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <p id="bom-kind" className="text-[13px] font-medium text-[var(--shell-text)]">Part is</p>
          <SegmentedControl labelledBy="bom-kind" value={kind} onChange={setKind} options={[{ value: 'item' as const, label: 'An item' }, { value: 'sub' as const, label: job ? 'A standard product' : 'A sub-assembly' }]} />
        </div>
        {kind === 'item' ? (
          <PickSelect label="Item" required placeholder="Select item" value={itemId} onChange={setItemId} options={((job ?? data)?.items ?? []).map((i) => ({ id: String(i.id), name: `${i.part_no} ${i.name}` }))} emptyHint="Add parts in the Part master first." />
        ) : job ? (
          <PickSelect label="Standard product" required placeholder="Select a product" value={subId} onChange={setSubId} options={job.sub_products.map((p) => ({ id: String(p.id), name: `${[p.code, p.name].filter(Boolean).join(' ')} · ${money(p.standard_cost)}` }))} emptyHint="No product has an approved standard cost yet." />
        ) : (
          <PickSelect label="Sub-assembly" required placeholder="Select a product's BOM" value={subId} onChange={setSubId} options={(data?.sub_boms ?? []).map((b) => ({ id: String(b.id), name: `Product ${b.productId}, BOM v${b.version}` }))} emptyHint="No other product has a BOM yet." />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" required hint={item ? `Per ${item.uom} at ${unitPrice(item.standard_price)}` : undefined}><Input type="number" min="0" step="0.01" className={ctl} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Scrap %"><Input type="number" min="0" max="100" step="0.5" className={ctl} value={scrap} onChange={(e) => setScrap(e.target.value)} /></Field>
        </div>
      </div>
    </ModuleModal>
  );
}

export function BuildStepModal({ isOpen, onClose, data: productData, job, editing }: Base & { data?: ProductCosting | undefined; job?: JobBom | undefined; editing: OperationRow | null }) {
  const data = job ?? productData;
  const { saving, run } = useSaver(onClose);
  const [typeId, setTypeId] = useState(''); const [hours, setHours] = useState(''); const [card, setCard] = useState(''); const [out, setOut] = useState(''); const [fix, setFix] = useState(''); const [costed, setCosted] = useState<'ALL' | 'LABOUR' | 'OUT' | 'FIXED'>('ALL');
  useEffect(() => {
    if (!isOpen) return;
    setTypeId(editing?.type_id ? String(editing.type_id) : ''); setHours(editing ? String(editing.hours) : ''); setCard(editing?.rate_card_id ? String(editing.rate_card_id) : '');
    setOut(editing?.outsourced_cost != null ? String(editing.outsourced_cost) : ''); setFix(editing?.fixed_cost != null ? String(editing.fixed_cost) : '');
  }, [isOpen, editing]);
  const type = data?.operation_types?.find((t) => String(t.id) === typeId);
  const kindOf = (t: OperationType) => (t.is_fixed ? 'FIXED' : t.is_outsourced ? 'OUT' : 'LABOUR');
  const typeChoices = (data?.operation_types ?? []).filter((t) => costed === 'ALL' || kindOf(t) === costed);
  const outsourced = !!type?.is_outsourced;
  const isFixed = !!type?.is_fixed;
  const rate = data?.rate_cards.find((c) => String(c.id) === card)?.rate_per_hour ?? 0;
  const ready = !!type && (isFixed ? Number(fix) > 0 : outsourced ? Number(out) > 0 : !!card && hours !== '' && Number(hours) >= 0);
  const base = job ? `/budgets/projects/${job.project.id}/job-bom/operations` : `/budgets/products/${productData?.product.id}/operations`;
  const box = 'flex h-9 items-center rounded-md border border-[var(--input)] bg-transparent px-3 text-[13px] tabular-nums text-[var(--shell-text)]';
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title={editing ? 'Edit build operation' : 'Add build operation'} icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      canSave={!saving && ready} saveLabel={editing ? 'Update build operation' : 'Add build operation'}
      onSave={() => run(() => {
        const noLabour = outsourced || isFixed;
        const body = { operation_type_id: Number(typeId), rate_card_id: noLabour ? null : Number(card), hours: noLabour ? 0 : Number(hours), outsourced_cost: outsourced ? Number(out) : null, fixed_cost: isFixed ? Number(fix) : null };
        return editing ? api.put(`${base}/${editing.id}`, body) : api.post(base, body);
      }, 'Build operation saved.')}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <p id="op-costed" className="text-[13px] font-medium text-[var(--shell-text)]">Costed as</p>
          <SegmentedControl labelledBy="op-costed" value={costed} onChange={setCosted} options={[{ value: 'ALL' as const, label: 'All' }, { value: 'LABOUR' as const, label: 'Labour' }, { value: 'OUT' as const, label: 'Outsourced' }, { value: 'FIXED' as const, label: 'Fixed' }]} />
        </div>
        <PickSelect label="Operation type" required placeholder="Select operation type" value={typeId} onChange={setTypeId} options={typeChoices.map((t) => ({ id: String(t.id), name: t.name }))} emptyHint="Add operation types with Manage operation types." />
        {isFixed ? (
          <Field label="Fixed cost per unit" required hint="A fixed amount for one unit, such as a share of a test jig or a certification fee."><CurrencyInput value={fix} onChange={setFix} /></Field>
        ) : outsourced ? (
          <Field label="Outsourced cost" required hint="What the vendor charges for one unit."><CurrencyInput value={out} onChange={setOut} /></Field>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <PickSelect label="Role" required placeholder="Select role" value={card} onChange={setCard} options={(data?.rate_cards ?? []).map((c) => ({ id: String(c.id), name: c.role }))} emptyHint="Add roles under Cost rates in the Costing menu." />
              <Field label="Cost per hour" hint="From the rate card."><div className={box}>{card ? money(rate) : '—'}</div></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hours per unit" required><Input type="number" min="0" step="0.1" className={ctl} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
              <Field label="Step cost" hint="Hours × cost per hour."><div className={box}>{money((Number(hours) || 0) * rate)}</div></Field>
            </div>
          </>
        )}
      </div>
    </ModuleModal>
  );
}

// The managed list of operation types the Build operation dialog picks from
export function StepTypesModal({ isOpen, onClose, types }: Base & { types: OperationType[] }) {
  const invalidate = useInvalidate();
  const [mode, setMode] = useState<'new' | number | null>(null);
  const [name, setName] = useState(''); const [kind, setKind] = useState<'IN' | 'OUT' | 'FIXED'>('IN');
  const [saving, setSaving] = useState(false); const [del, setDel] = useState<OperationType | null>(null);
  useEffect(() => { if (isOpen) setMode(null); }, [isOpen]);
  const begin = (t: OperationType | null) => { setMode(t ? t.id : 'new'); setName(t?.name ?? ''); setKind(t?.is_fixed ? 'FIXED' : t?.is_outsourced ? 'OUT' : 'IN'); };
  const current = typeof mode === 'number' ? types.find((t) => t.id === mode) : undefined;
  const save = async () => {
    setSaving(true);
    try {
      const body = { name, cost_kind: kind === 'FIXED' ? 'FIXED' : kind === 'OUT' ? 'OUTSOURCED' : 'LABOUR' };
      if (mode === 'new') await api.post('/budgets/operation-types', body); else await api.put(`/budgets/operation-types/${mode}`, body);
      toast.success('Operation type saved.'); invalidate('budgets'); setMode(null);
    } catch (e: any) { toast.error(e?.message || 'Could not save.'); } finally { setSaving(false); }
  };
  const remove = async (t: OperationType) => {
    try {
      const r: any = await api.delete(`/budgets/operation-types/${t.id}`);
      toast.success(r?.data?.archived ? 'Operation type archived. Existing build operations keep it.' : 'Operation type removed.'); invalidate('budgets');
    } catch (e: any) { toast.error(e?.message || 'Could not remove.'); }
  };
  const iconBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--shell-text-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]';
  return (
    <>
      <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title="Manage operation types" icon={<ClipboardList className="h-4 w-4" />} canSave={mode === null || !!name.trim()}
        footer={<button type="button" className="btn-action" onClick={onClose}>Close</button>}>
        <div className="space-y-3">
          <div className="divide-y divide-[var(--shell-border)] rounded-md border border-[var(--shell-border)]">
            {types.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[var(--shell-text)]">{t.name}</p>
                  <p className="text-[12px] text-[var(--shell-text-muted)]">{t.is_fixed ? 'Fixed' : t.is_outsourced ? 'Outsourced' : 'Labour'}{t.used_in ? ` · used in ${t.used_in}` : ''}</p>
                </div>
                <div className="flex shrink-0">
                  <button type="button" aria-label={`Edit ${t.name}`} className={iconBtn} onClick={() => begin(t)}><Pencil className="h-4 w-4 text-[var(--info)]" /></button>
                  <button type="button" aria-label={`Remove ${t.name}`} className={iconBtn} onClick={() => setDel(t)}><Trash2 className="h-4 w-4 text-[var(--danger)]" /></button>
                </div>
              </div>
            ))}
            {types.length === 0 && <p className="px-3 py-3 text-[13px] text-[var(--shell-text-muted)]">No operation types yet.</p>}
          </div>
          {mode === null ? (
            <button type="button" className="btn-action" onClick={() => begin(null)}><Plus className="h-4 w-4 text-[var(--success)]" /> Add operation type</button>
          ) : (
            <div className="space-y-3 rounded-md border border-[var(--shell-border)] p-3">
              <Field label="Name" required>{text(name, setName, { maxLength: 80, placeholder: 'Final assembly' })}</Field>
              <div className="space-y-1.5">
                <p id="step-kind" className="text-[13px] font-medium text-[var(--shell-text)]">Costed as</p>
                <SegmentedControl labelledBy="step-kind" value={kind} onChange={setKind} options={[{ value: 'IN' as const, label: 'Labour' }, { value: 'OUT' as const, label: 'Outsourced' }, { value: 'FIXED' as const, label: 'Fixed' }]} />
                <p className="text-[12px] text-[var(--shell-text-muted)]">{kind === 'IN' ? 'Priced from a role on the rate card and the hours it takes.' : kind === 'OUT' ? 'A vendor charge per unit, with no role or hours.' : 'A fixed amount per unit, with no role or hours.'}</p>
                {current && current.used_in > 0 && <p className="text-[12px] text-[var(--shell-text-muted)]">This type is in use, so how it is costed cannot change.</p>}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-action" onClick={() => setMode(null)}>Cancel</button>
                <button type="button" className="btn-action btn-action-primary" disabled={saving || !name.trim()} onClick={save}>{mode === 'new' ? 'Add operation type' : 'Update operation type'}</button>
              </div>
            </div>
          )}
        </div>
      </ModuleModal>
      <ConfirmDialog open={!!del} destructive title="Remove operation type" confirmLabel="Remove" message={`Remove ${del?.name}? If build operations use it, it is archived instead and they keep it.`} onCancel={() => setDel(null)}
        onConfirm={async () => { const t = del; setDel(null); if (t) await remove(t); }} />
    </>
  );
}

// Freight % (and warranty % on a product) that the BOM roll-up adds
export function BomSettingsModal({ isOpen, onClose, url, freight, warranty }: Base & { url: string; freight: number; warranty?: number }) {
  const { saving, run } = useSaver(onClose);
  const [fr, setFr] = useState(''); const [wa, setWa] = useState('');
  useEffect(() => { if (isOpen) { setFr(String(freight)); setWa(warranty != null ? String(warranty) : ''); } }, [isOpen, freight, warranty]);
  const pct = (v: string) => v !== '' && Number(v) >= 0 && Number(v) <= 100;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title="Freight and handling" icon={<Pencil className="h-4 w-4" />}
      canSave={!saving && pct(fr) && (warranty == null || pct(wa))} saveLabel="Save"
      onSave={() => run(() => api.put(url, warranty == null ? { freight_pct: Number(fr) } : { freight_pct: Number(fr), warranty_pct: Number(wa) }), 'Saved.')}>
      <div className="space-y-3">
        <Field label="Freight and handling %" required hint="Added to parts and scrap."><Input type="number" min="0" max="100" step="0.5" className={ctl} value={fr} onChange={(e) => setFr(e.target.value)} /></Field>
        {warranty != null && <Field label="Warranty %" required hint="Added to the whole cost."><Input type="number" min="0" max="100" step="0.5" className={ctl} value={wa} onChange={(e) => setWa(e.target.value)} /></Field>}
      </div>
    </ModuleModal>
  );
}

// A product's selling price for the year and its cost settings (overhead rate, freight, warranty against the company defaults), in one dialog.
// The price takes effect at once; the cost settings apply to the next standard cost that is proposed.
export function ProductPricingModal({ isOpen, onClose, data }: Base & { data: ProductCosting | undefined }) {
  const { saving, run } = useSaver(onClose);
  const invalidate = useInvalidate();
  const [price, setPrice] = useState('');
  const [oh, setOh] = useState(''); const [fr, setFr] = useState(''); const [wa, setWa] = useState(''); const [why, setWhy] = useState('');
  const c = data?.cost ?? null; const bom = data?.bom ?? null;
  const dOh = c?.default_overhead_rate ?? 0; const dFr = c?.default_freight_pct ?? 2; const dWa = c?.default_warranty_pct ?? 1.5;
  // Fill the fields when the dialog opens only, so a refresh in the background never wipes what is being typed
  const latest = useRef(data); latest.current = data;
  useEffect(() => {
    const d = latest.current;
    if (!isOpen || !d) return;
    setPrice(d.pricing.price != null ? String(d.pricing.price) : '');
    if (d.cost && d.bom) {
      setOh(String(d.bom.overhead_rate_override ?? d.cost.default_overhead_rate)); setFr(String(d.bom.freight_pct)); setWa(String(d.bom.warranty_pct)); setWhy(d.bom.adjust_reason ?? '');
    }
  }, [isOpen]);
  if (!data) return null;

  const p = data.pricing;
  const fy = `${p.fy}-${String(p.fy + 1).slice(2)}`;
  const num = (v: string) => (v === '' ? NaN : Number(v));

  // Selling price
  const sell = num(price);
  const priceValid = price === '' || (Number.isFinite(sell) && sell > 0);
  const priceDirty = price === '' ? p.price != null : Number(price) !== p.price;
  const unit = p.unit_cost;
  const margin = price !== '' && priceValid && unit > 0 ? ((sell - unit) / sell) * 100 : null;

  // Cost settings, only when the product has a cost to adjust
  const ohN = num(oh); const frN = num(fr); const waN = num(wa);
  const costValid = !c || !bom || (ohN >= 0 && frN >= 0 && frN <= 100 && waN >= 0 && waN <= 100);
  const costDirty = !!c && !!bom && costValid && (Math.abs(ohN - (bom.overhead_rate_override ?? dOh)) > 0.005 || frN !== bom.freight_pct || waN !== bom.warranty_pct || why.trim() !== (bom.adjust_reason ?? '').trim());
  const rolled = c && costValid ? (c.base_cost + c.freight_base * (frN / 100) + c.hours * ohN) * (1 + waN / 100) : (c?.total ?? 0);
  const diff = c ? rolled - c.total : 0; const diffPct = c && c.total > 0 ? (diff / c.total) * 100 : 0;
  const overridden = !!c && costValid && (Math.abs(ohN - dOh) > 0.005 || frN !== dFr || waN !== dWa);
  const needReason = costDirty && overridden && !why.trim();
  const notes: string[] = [];
  if (c && costValid) {
    if (c.hours <= 0) notes.push('This product has no in-house build hours, so the overhead rate changes nothing yet.');
    else if (ohN === 0) notes.push('Zero overhead means in-house work is costed as if the workshop were free. The overhead pools will not be recovered from this product.');
    else if (ohN < dOh - 0.005) notes.push(`Below the combined rate of ${money(dOh)}/h. The shortfall is not recovered from this product, so other products or the budget absorb it.`);
    else if (ohN > dOh * 2) notes.push(`More than double the combined rate of ${money(dOh)}/h. Check the rate is a per hour figure.`);
    if (frN === 0) notes.push('Freight and handling is zero. Bought-in parts normally cost something to bring in.');
    else if (frN > dFr * 2) notes.push(`Freight and handling is more than double the usual ${dFr}%. Is it mostly heavy or imported parts?`);
    if (waN === 0) notes.push('Warranty is zero. Repairs after sale will not be covered by the standard cost.');
    else if (waN > dWa * 2) notes.push(`Warranty is more than double the usual ${dWa}%. Use this only if the product has a known repair history.`);
    if (Math.abs(diffPct) >= 5) notes.push(`This moves the standard cost by ${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%. Finance will see the change when it is proposed.`);
  }
  const marginAtNew = costDirty && price !== '' && priceValid && rolled > 0 ? ((sell - rolled) / sell) * 100 : null;

  const canSave = !saving && priceValid && costValid && (priceDirty || costDirty) && !needReason;
  const save = async () => {
    const savedPrice = priceDirty;
    if (savedPrice) await api.put(`/budgets/products/${data.product.id}/price`, { price: price === '' ? null : sell });
    if (costDirty) {
      try {
        await api.put(`/budgets/products/${data.product.id}/bom`, { overhead_rate: Math.abs(ohN - dOh) <= 0.005 ? null : ohN, freight_pct: frN, warranty_pct: waN, reason: why });
      } catch (e: any) {
        // The price is already saved, so refresh the page behind and keep the dialog open for the cost settings
        if (savedPrice) { invalidate('budgets'); throw new Error(`The selling price was saved, but the cost settings were not: ${e?.message || 'could not save'}`); }
        throw e;
      }
    }
  };
  const done = costDirty && priceDirty ? 'Selling price and cost settings saved. Propose a new standard cost to use the cost settings.'
    : costDirty ? 'Cost settings saved. Propose a new standard cost to use them.' : price === '' ? 'Selling price removed.' : 'Selling price saved.';

  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size={c && bom ? 'xl' : 'sm'} title="Price and costing" icon={<Pencil className="h-4 w-4" />} canSave={canSave} saveLabel="Save changes" onSave={() => run(save, done)}>
      <div className={pricingGrid(!!(c && bom))}>
        <section aria-label="Selling price" className={priceColumn(!!(c && bom))}>
          <SectionHeader label={`Selling price, ${fy}`} />
          <div className="space-y-3">
            <Field label="Selling price per unit" hint="What you plan to sell one unit for this financial year. Leave blank to remove it." error={!priceValid ? 'Enter a selling price above zero.' : undefined}>
              <CurrencyInput value={price} onChange={setPrice} />
            </Field>
            <div className="space-y-1 text-[13px] text-[var(--shell-text)]">
              <p>{unit > 0 ? <>Cost per unit: <strong className="tabular-nums">{money(unit)}</strong> ({p.basis === 'STANDARD' ? 'approved standard cost' : 'rolled-up cost, no standard cost approved yet'}).</> : 'There is no cost for this product yet, so margin cannot be worked out.'}</p>
              {margin != null && <p>Profit per unit: <strong className="tabular-nums">{money(sell - unit)}</strong>. Margin: <strong className="tabular-nums">{margin.toFixed(1)}%</strong> of the selling price.</p>}
              {marginAtNew != null && <p className="text-[var(--shell-text-muted)]">With the cost settings below, the rolled-up cost is {money(rolled)} and the margin would be {marginAtNew.toFixed(1)}%.</p>}
            </div>
          </div>
        </section>

        {c && bom && (
          <section aria-label="Cost settings" className={COST_COLUMN}>
            <SectionHeader label="Cost settings" />
            <div className="space-y-3">
              <p className="text-[12px] text-[var(--shell-text-muted)]">Apply to the next standard cost you propose. Approved figures do not change.</p>
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Field label="Overhead per hour" required hint={`Default ${money(dOh)}/h`}><Input type="number" min="0" step="0.5" className={ctl} value={oh} onChange={(e) => setOh(e.target.value)} /></Field>
                <Field label="Freight and handling %" required hint={`Default ${dFr}%`}><Input type="number" min="0" max="100" step="0.5" className={ctl} value={fr} onChange={(e) => setFr(e.target.value)} /></Field>
                <Field label="Warranty %" required hint={`Default ${dWa}%`}><Input type="number" min="0" max="100" step="0.5" className={ctl} value={wa} onChange={(e) => setWa(e.target.value)} /></Field>
              </div>
              <div className="space-y-1.5">
                <div className="flex h-8 items-center justify-between">
                  <p id="reason-label" className="text-[13px] font-medium text-[var(--shell-text)]">Reason{overridden && <span className="text-[var(--danger)]"> *</span>}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setOh(String(dOh)); setFr(String(dFr)); setWa(String(dWa)); setWhy(''); }} className="h-8 px-3 text-[13px] font-medium">Set default</Button>
                </div>
                <Textarea aria-labelledby="reason-label" className={ctl} rows={2} maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} />
                <p className="text-[12px] text-[var(--shell-text-muted)]">{overridden ? 'Required while any value differs from the default.' : 'Optional while everything is at the default.'}</p>
              </div>
              <div className="rounded-md border border-[var(--shell-border)] p-3 text-[13px]">
                <div className="flex justify-between"><span className="text-[var(--shell-text-muted)]">Rolled-up cost per unit</span><span className="tabular-nums">{money(c.total)} → <strong>{money(rolled)}</strong></span></div>
                {costValid && Math.abs(diff) >= 0.005 && <div className="mt-1 text-[12px] text-[var(--shell-text-muted)]">{diff < 0 ? 'Lowers' : 'Raises'} the cost by {money(Math.abs(diff))} a unit ({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%).</div>}
              </div>
              {notes.length > 0 && (
                <ul className="space-y-1 text-[12px] text-[var(--warning)]" aria-label="Warnings">{notes.map((t) => <li key={t}>{t}</li>)}</ul>
              )}
            </div>
          </section>
        )}
      </div>
    </ModuleModal>
  );
}

// What was paid for a part: it becomes the part's last paid price, and can become the standard price too
export function RecordPurchaseModal({ isOpen, onClose, item }: Base & { item: Item | null }) {
  const { saving, run } = useSaver(onClose);
  const [price, setPrice] = useState(''); const [paidOn, setPaidOn] = useState(''); const [supplier, setSupplier] = useState(''); const [makeStd, setMakeStd] = useState(false);
  useEffect(() => { if (isOpen && item) { setPrice(item.last_price != null ? String(item.last_price) : ''); setPaidOn(localToday()); setSupplier(item.supplier ?? ''); setMakeStd(false); } }, [isOpen, item]);
  if (!item) return null;
  const buy = item.sourcing === 'BUY';
  const p = Number(price);
  const drift = price !== '' && item.standard_price > 0 ? ((p - item.standard_price) / item.standard_price) * 100 : 0;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title="Record a purchase" icon={<Plus className="h-4 w-4" />}
      canSave={!saving && price !== '' && p >= 0 && !!paidOn && paidOn <= localToday()} saveLabel="Save purchase"
      onSave={() => run(() => api.post(`/budgets/items/${item.id}/purchase`, { price: p, paid_on: paidOn, supplier, make_standard: buy && makeStd }), 'Purchase recorded.')}>
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--shell-text)]">{item.part_no} {item.name}. Standard price {money(item.standard_price)}.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Price paid per ${item.uom}`} required><CurrencyInput value={price} onChange={setPrice} /></Field>
          <Field label="Paid on" required><Input type="date" max={localToday()} className={ctl} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        </div>
        <Field label="Supplier"><Input className={ctl} maxLength={150} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
        {buy && (
          <label className="flex items-center gap-2 text-[13px] text-[var(--shell-text)]">
            <input type="checkbox" checked={makeStd} onChange={(e) => setMakeStd(e.target.checked)} className="h-4 w-4" />
            Also make this the standard price
          </label>
        )}
        {Math.abs(drift) >= 5 && <p className="text-[12px] text-[var(--warning)]">{drift > 0 ? 'Above' : 'Below'} the standard price by {Math.abs(drift).toFixed(1)}%. Tick the box above if this is the new normal price.</p>}
        {makeStd && <p className="text-[12px] text-[var(--shell-text-muted)]">Live product costs that use this part will change. Approved standard costs will not.</p>}
      </div>
    </ModuleModal>
  );
}

// ─── Standard cost approval ──────────────────────────────────────────────────

export function RejectCostModal({ isOpen, onClose, data, standard }: Base & { data: ProductCosting | undefined; standard: ProductCosting['standards'][number] | null }) {
  const { saving, run } = useSaver(onClose);
  const [why, setWhy] = useState('');
  useEffect(() => { if (isOpen) setWhy(''); }, [isOpen]);
  if (!standard || !data) return null;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title="Reject standard cost" isDestructive icon={<XCircle className="h-4 w-4" />} canSave={!saving && !!why.trim()} saveLabel="Reject standard cost"
      onSave={() => run(() => api.post(`/budgets/standard-costs/${standard.id}/reject`, { reason: why }), 'Standard cost rejected.')}>
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--shell-text)]">{data.product.name} stays at its current standard cost. The proposed {money(standard.total)} is kept in the history as rejected.</p>
        <Field label="Reason" required hint="Shown with the proposal so whoever proposed it knows what to change."><Textarea className={ctl} rows={3} maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
      </div>
    </ModuleModal>
  );
}

export function RejectBaselineModal({ isOpen, onClose, baseline }: Base & { baseline: BaselineRow | null }) {
  const { saving, run } = useSaver(onClose);
  const [why, setWhy] = useState('');
  useEffect(() => { if (isOpen) setWhy(''); }, [isOpen]);
  if (!baseline) return null;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title="Reject baseline" isDestructive icon={<XCircle className="h-4 w-4" />} canSave={!saving && !!why.trim()} saveLabel="Reject baseline"
      onSave={() => run(() => api.post(`/budgets/baselines/${baseline.id}/reject`, { reason: why }), 'Baseline rejected.')}>
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--shell-text)]">The proposed {money(baseline.total)} is kept in the history as rejected. The current baseline, if there is one, stays in force.</p>
        <Field label="Reason" required hint="Shown with the proposal so whoever proposed it knows what to change."><Textarea className={ctl} rows={3} maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
      </div>
    </ModuleModal>
  );
}

export function StandardCostModal({ isOpen, onClose, data, standard }: Base & { data: ProductCosting | undefined; standard: ProductCosting['standards'][number] | null }) {
  const { saving, run } = useSaver(onClose);
  if (!standard || !data) return null;
  const old = data.product.standard_cost;
  const diff = old != null && old > 0 ? ((standard.total - old) / old) * 100 : null;
  const live = data.cost?.total ?? null;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title="Approve standard cost" icon={<CheckCircle2 className="h-4 w-4" />} canSave={!saving} saveLabel="Approve standard cost"
      onSave={() => run(() => api.post(`/budgets/standard-costs/${standard.id}/approve`, {}), 'Standard cost approved.')}>
      <div className="space-y-2 text-[13px] text-[var(--shell-text)]">
        <p>{data.product.name} will be costed at <strong className="tabular-nums">{money(standard.total)}</strong> a unit for {standard.fy}-{String(standard.fy + 1).slice(2)}.</p>
        <p className="text-[var(--shell-text-muted)]">{old != null ? `Current standard: ${money(old)}${diff != null ? ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)` : ''}.` : 'There is no approved standard yet.'} Unit cost variances are measured against the approved figure.</p>
        {live != null && Math.abs(live - standard.total) > 0.5 && <p className="text-[var(--warning)]">The current rolled-up cost is {money(live)}, which differs from this proposal. Propose again to approve the current cost.</p>}
      </div>
    </ModuleModal>
  );
}

export function BuildPlanModal({ isOpen, onClose, productId, editing }: Base & { productId: number; editing: ProductCosting['build_plan'][number] | null }) {
  const { saving, run } = useSaver(onClose);
  const [planned, setPlanned] = useState(''); const [built, setBuilt] = useState('');
  useEffect(() => { if (isOpen) { setPlanned(editing ? String(editing.planned) : ''); setBuilt(editing ? String(editing.actual) : ''); } }, [isOpen, editing]);
  if (!editing) return null;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title={`Build plan for ${editing.label} ${editing.year}`} icon={<Pencil className="h-4 w-4" />}
      canSave={!saving && Number(planned) >= 0 && Number(built) >= 0} saveLabel="Update plan"
      onSave={() => run(() => api.put(`/budgets/products/${productId}/build-plan`, { year: editing.year, month: editing.month, planned_units: Number(planned) || 0, actual_units: Number(built) || 0 }), 'Build plan saved.')}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Planned units"><Input type="number" min="0" step="1" className={ctl} value={planned} onChange={(e) => setPlanned(e.target.value)} /></Field>
        <Field label="Built units"><Input type="number" min="0" step="1" className={ctl} value={built} onChange={(e) => setBuilt(e.target.value)} /></Field>
      </div>
    </ModuleModal>
  );
}

// ─── Change request and decision ─────────────────────────────────────────────

const KINDS = [
  { value: 'TRANSFER' as const, label: 'Transfer' },
  { value: 'DRAWDOWN' as const, label: 'Drawdown' },
  { value: 'REVISION' as const, label: 'Revision' },
  { value: 'RELEASE' as const, label: 'Release' },
];
const KIND_HELP: Record<string, string> = {
  TRANSFER: 'Move money from one line to another.',
  DRAWDOWN: 'Use a project’s held contingency for a line that needs it.',
  REVISION: 'Add money to a line from outside the plan, for example a change order.',
  RELEASE: 'Give unused money back to the company reserve.',
};

export function ChangeRequestModal({ isOpen, onClose, prefill }: Base & { prefill?: { kind?: 'TRANSFER' | 'DRAWDOWN' | 'REVISION' | 'RELEASE'; to_line_id?: number; from_line_id?: number } | null }) {
  const { saving, run } = useSaver(onClose);
  const { data: monitor } = useBudgetMonitor(null);
  const [kind, setKind] = useState<'TRANSFER' | 'DRAWDOWN' | 'REVISION' | 'RELEASE'>('TRANSFER');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [amount, setAmount] = useState(''); const [reason, setReason] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setKind(prefill?.kind ?? 'TRANSFER'); setFrom(prefill?.from_line_id ? String(prefill.from_line_id) : ''); setTo(prefill?.to_line_id ? String(prefill.to_line_id) : ''); setAmount(''); setReason('');
  }, [isOpen, prefill]);
  const lines = monitor?.lines ?? [];
  const fromOptions = lines.filter((l) => (kind === 'DRAWDOWN' ? l.is_contingency : kind === 'RELEASE' ? l.cost_object !== 'RESERVE' : true)).map((l) => ({ id: String(l.id), name: `${l.label} · ${money(l.available)} left` }));
  const toOptions = lines.filter((l) => (kind === 'RELEASE' ? l.cost_object === 'RESERVE' : !l.is_contingency)).map((l) => ({ id: String(l.id), name: l.label }));
  const src = lines.find((l) => String(l.id) === from);
  const over = src && Number(amount) > src.available;
  const needFrom = kind !== 'REVISION'; const needTo = kind !== 'RELEASE';
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title="Request a budget change" icon={<ArrowLeftRight className="h-4 w-4" />} saveLabel="Send request"
      canSave={!saving && Number(amount) > 0 && !!reason.trim() && (!needFrom || !!from) && (!needTo || !!to) && !over && !(from && from === to)}
      onSave={() => run(() => api.post('/budgets/changes', { kind, from_line_id: needFrom ? Number(from) : null, to_line_id: needTo && to ? Number(to) : null, amount: Number(amount), reason }), 'Request sent for approval.')}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <p id="chg-kind" className="text-[13px] font-medium text-[var(--shell-text)]">Kind of change</p>
          <SegmentedControl labelledBy="chg-kind" value={kind} onChange={(v) => { setKind(v); setFrom(''); setTo(''); }} options={KINDS} />
          <p className="text-[12px] text-[var(--shell-text-muted)]">{KIND_HELP[kind]}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {needFrom && <PickSelect label="From" required placeholder="Select line" value={from} onChange={setFrom} options={fromOptions} emptyHint={kind === 'DRAWDOWN' ? 'No contingency lines in this plan.' : 'No lines to take from.'} />}
          {needTo && <PickSelect label={kind === 'REVISION' ? 'Line to increase' : 'To'} required placeholder="Select line" value={to} onChange={setTo} options={toOptions} />}
          {kind === 'RELEASE' && <PickSelect label="Reserve line" placeholder="Select reserve line" value={to} onChange={setTo} options={toOptions} emptyHint="No reserve line in this plan, so the money is only removed." />}
        </div>
        <Field label="Amount" required error={over ? `Only ${money(src!.available)} is left on that line.` : undefined}><CurrencyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Reason" required><Textarea className={textarea} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Why the money has to move" /></Field>
      </div>
    </ModuleModal>
  );
}

export function ChangeDecisionModal({ isOpen, onClose, change, mode }: Base & { change: BudgetChangeRow | null; mode: 'approve' | 'reject' }) {
  const { saving, run } = useSaver(onClose);
  const [note, setNote] = useState('');
  useEffect(() => { if (isOpen) setNote(''); }, [isOpen]);
  if (!change) return null;
  const approve = mode === 'approve';
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title={approve ? 'Approve change' : 'Reject change'} icon={approve ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      isDestructive={!approve} saveLabel={approve ? 'Approve' : 'Reject'} canSave={!saving && (approve || !!note.trim())}
      onSave={() => run(() => api.post(`/budgets/changes/${change.id}/decision`, { decision: mode, note }), approve ? 'Change approved and applied.' : 'Change rejected.')}>
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--shell-text)]">{change.kind.charAt(0) + change.kind.slice(1).toLowerCase()} of <strong className="tabular-nums">{money(change.amount)}</strong>{change.from_label ? ` from ${change.from_label}` : ''}{change.to_label ? ` to ${change.to_label}` : ''}.</p>
        <p className="text-[12px] text-[var(--shell-text-muted)]">Reason: {change.reason}</p>
        {approve && change.needs_admin && <p className="text-[12px] text-[var(--warning)]">This is above the approval threshold, so an Admin has to approve it.</p>}
        <Field label={approve ? 'Note' : 'Why it is rejected'} required={!approve}><Textarea className={textarea} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </ModuleModal>
  );
}

// ─── Variance reason for the monthly close ───────────────────────────────────

export const VARIANCE_REASONS: { value: string; label: string }[] = [
  { value: 'PRICE', label: 'Price change' }, { value: 'VOLUME', label: 'Volume or usage' }, { value: 'TIMING', label: 'Timing: moves to another month' },
  { value: 'ONE_OFF', label: 'One-off cost' }, { value: 'SCOPE', label: 'Scope change' }, { value: 'ERROR', label: 'Booking error' }, { value: 'OTHER', label: 'Other' },
];

export function VarianceModal({ isOpen, onClose, line, year, month }: Base & { line: CloseLine | null; year: number; month: number }) {
  const { saving, run } = useSaver(onClose);
  const [code, setCode] = useState(''); const [comment, setComment] = useState('');
  useEffect(() => { if (isOpen) { setCode(line?.note?.reason_code ?? ''); setComment(line?.note?.comment ?? ''); } }, [isOpen, line]);
  if (!line) return null;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="sm" title="Explain the variance" icon={<ClipboardList className="h-4 w-4" />} canSave={!saving && !!code} saveLabel="Save reason"
      onSave={() => run(() => api.post('/budgets/close/variance', { line_id: line.line_id, year, month, reason_code: code, comment }), 'Reason saved.')}>
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--shell-text)]">{line.label}: {money(line.actual)} against {money(line.budget)} ({line.variance >= 0 ? 'under' : 'over'} by {money(Math.abs(line.variance))}).</p>
        <PickSelect label="Main reason" required placeholder="Select reason" value={code} onChange={setCode} options={VARIANCE_REASONS.map((r) => ({ id: r.value, name: r.label }))} />
        <Field label="Comment"><Textarea className={textarea} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} /></Field>
      </div>
    </ModuleModal>
  );
}

