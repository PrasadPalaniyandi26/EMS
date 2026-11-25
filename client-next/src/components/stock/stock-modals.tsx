'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Boxes, ClipboardList, MinusCircle, PackagePlus } from 'lucide-react';
import api from '@/lib/api-client';
import { toLocalYMD, formatDate } from '@/lib/currency';
import { useCategories, useCategoryTypes, useInvalidate } from '@/hooks/use-queries';
import { useHeadroom } from '@/hooks/use-budget-queries';
import { BudgetHeadroom } from '@/components/budgets/budget-headroom';
import { money } from '@/lib/money';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect, CurrencyInput, inp } from '@/components/shared/modal-primitives';
import { TypeCategoryFields } from '@/components/shared/type-category-fields';
import { qty, useStockCount, type JobStock, type StockMoveRow } from '@/hooks/use-stock-queries';

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

// One save for every dialog here: call, say what happened, refresh stock and budget figures
function useSave(onClose: () => void) {
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);
  const save = async (call: () => Promise<unknown>, done: string) => {
    setSaving(true);
    try { await call(); toast.success(done); invalidate('stock', 'budgets'); onClose(); }
    catch (e: any) { toast.error(e?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };
  return { saving, save };
}

export interface SettingsPart { id: number; part_no: string; name: string; uom: string; supply_mode: 'DIRECT' | 'STOCK'; purchase_uom: string | null; purchase_factor: number | null; reorder_level: number | null; category_id: number | null }

// How a part is bought and used. With no part given, one is picked from `choices` and made a stock part.
export function StockSettingsModal({ isOpen, onClose, part, choices }: { isOpen: boolean; onClose: () => void; part: SettingsPart | null; choices?: SettingsPart[] }) {
  const { saving, save } = useSave(onClose);
  const { data: categories } = useCategories();
  const { data: types } = useCategoryTypes('expense');
  const [pickId, setPickId] = useState('');
  const [mode, setMode] = useState<'DIRECT' | 'STOCK'>('STOCK');
  const [typeId, setTypeId] = useState(''); const [categoryId, setCategoryId] = useState('');
  const [purchaseUom, setPurchaseUom] = useState(''); const [factor, setFactor] = useState(''); const [reorder, setReorder] = useState('');
  const current = part ?? choices?.find((c) => String(c.id) === pickId) ?? null;
  const expense = (categories ?? []).filter((c) => c.type === 'expense');

  useEffect(() => {
    if (!isOpen) return;
    setPickId('');
    setMode(part ? part.supply_mode : 'STOCK');
    setCategoryId(part?.category_id ? String(part.category_id) : '');
    setTypeId(String(expense.find((c) => c.id === part?.category_id)?.type_id ?? ''));
    setPurchaseUom(part?.purchase_uom ?? ''); setFactor(part?.purchase_factor != null ? String(part.purchase_factor) : ''); setReorder(part?.reorder_level != null ? String(part.reorder_level) : '');
  }, [isOpen, part?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const stock = mode === 'STOCK';
  const valid = !!current && (!stock || (!!categoryId && (!purchaseUom.trim() || num(factor) > 0) && (reorder === '' || num(reorder) >= 0)));
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} title={part ? `Stock settings for ${part.part_no}` : 'Add stock part'} icon={<Boxes className="h-4 w-4" />} size="lg" saveLabel="Save" canSave={valid && !saving}
      onSave={() => current && save(() => api.put(`/stock/items/${current.id}/settings`, { supply_mode: mode, category_id: categoryId ? Number(categoryId) : null, purchase_uom: purchaseUom.trim(), purchase_factor: factor, reorder_level: reorder }), 'Stock settings saved.')}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        <div className="space-y-3">
          {!part && (
            <Field label="Part" required hint="Bought parts from the Part master that are not stock parts yet.">
              <NativeSelect value={pickId} onChange={(e) => setPickId(e.target.value)}>
                <option value="">Select part...</option>
                {(choices ?? []).map((c) => <option key={c.id} value={c.id}>{c.part_no} · {c.name}</option>)}
              </NativeSelect>
            </Field>
          )}
          <Field label="Supply mode" hint={stock ? 'Bought into the Store. A job is charged when it uses the part.' : 'Charged to the job when bought.'}>
            <NativeSelect value={mode} onChange={(e) => setMode(e.target.value as 'DIRECT' | 'STOCK')} disabled={!part}>
              <option value="DIRECT">Direct</option>
              <option value="STOCK">Stock</option>
            </NativeSelect>
          </Field>
          {stock && (
            <TypeCategoryFields typeLabel="Expense type" categoryLabel="Expense category" types={types || []} categories={expense} typeId={typeId} category={categoryId} categoryBy="id"
              onChange={(v) => { setTypeId(v.typeId); setCategoryId(v.category); }} typeRequired categoryRequired categoryEmptyHint="No categories for this type yet." />
          )}
        </div>
        {stock && (
          <div className="space-y-3">
            <Field label="Purchase unit" hint={`Leave blank when it is bought in ${current?.uom ?? 'the stock unit'}, the unit it is stocked in.`}>
              <input className={inp} value={purchaseUom} maxLength={12} placeholder="bar" onChange={(e) => setPurchaseUom(e.target.value)} />
            </Field>
            <Field label={`Quantity in one purchase unit (${current?.uom ?? 'stock units'})`} required={!!purchaseUom.trim()}>
              <input className={inp} type="number" min="0" step="0.001" value={factor} disabled={!purchaseUom.trim()} onChange={(e) => setFactor(e.target.value)} />
            </Field>
            <Field label={`Reorder level (${current?.uom ?? 'units'})`} hint="An alert opens when the quantity on hand reaches this level.">
              <input className={inp} type="number" min="0" step="0.001" value={reorder} onChange={(e) => setReorder(e.target.value)} />
            </Field>
          </div>
        )}
      </div>
    </ModuleModal>
  );
}

export function OpeningStockModal({ isOpen, onClose, part }: { isOpen: boolean; onClose: () => void; part: { id: number; part_no: string; uom: string; standard_price: number } | null }) {
  const { saving, save } = useSave(onClose);
  const [quantity, setQuantity] = useState(''); const [cost, setCost] = useState(''); const [date, setDate] = useState(toLocalYMD()); const [note, setNote] = useState('');
  useEffect(() => { if (isOpen) { setQuantity(''); setCost(part ? String(part.standard_price) : ''); setDate(toLocalYMD()); setNote(''); } }, [isOpen, part?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const valid = num(quantity) > 0 && num(cost) >= 0 && !!date;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} title={`Opening stock for ${part?.part_no ?? ''}`} icon={<PackagePlus className="h-4 w-4" />} saveLabel="Add opening stock" canSave={valid && !saving}
      onSave={() => part && save(() => api.post('/stock/opening', { item_id: part.id, quantity: Number(quantity), unit_cost: Number(cost), date, reason: note }), 'Opening stock added.')}>
      <div className="space-y-3">
        <Field label={`Counted quantity (${part?.uom ?? ''})`} required><input className={inp} type="number" min="0" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
        <Field label={`Agreed cost per ${part?.uom ?? 'unit'}`} required hint={valid ? `Stock value ${money(Number(quantity) * Number(cost))}` : 'Entered once, before any other entry for the part.'}><CurrencyInput value={cost} onChange={setCost} symbol="₹" /></Field>
        <Field label="Date" required hint={date ? formatDate(date) : undefined}><input className={inp} type="date" value={date} max={toLocalYMD()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note"><input className={inp} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </ModuleModal>
  );
}

export type UsedMode = 'add' | 'edit' | 'correct';

// Stock used on a job: a new entry, a change to an entry in an open month, or a correction to one in a closed month
export function StockUsedModal({ isOpen, onClose, job, mode, entry, itemId }: { isOpen: boolean; onClose: () => void; job: JobStock | undefined; mode: UsedMode; entry: StockMoveRow | null; itemId?: number | null }) {
  const { saving, save } = useSave(onClose);
  const [partId, setPartId] = useState(''); const [quantity, setQuantity] = useState(''); const [date, setDate] = useState(toLocalYMD()); const [reason, setReason] = useState('');

  // The quantity starts at what the BOM still asks for, as far as the Store can supply it
  const suggestion = (id: string) => { const l = job?.parts.find((x) => String(x.item_id) === id); return l?.suggested_qty ? String(Math.min(l.suggested_qty, l.on_hand) || '') : ''; };
  useEffect(() => {
    if (!isOpen) return;
    const first = entry ? String(entry.item_id) : itemId && job?.parts.some((p) => p.item_id === itemId) ? String(itemId) : '';
    setPartId(first);
    setQuantity(mode === 'edit' && entry ? String(entry.quantity) : mode === 'add' ? suggestion(first) : '');
    setDate(toLocalYMD()); setReason(mode === 'edit' ? entry?.reason ?? '' : '');
  }, [isOpen, mode, entry?.id, itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  const part = job?.parts.find((x) => String(x.item_id) === partId) ?? job?.lines.find((x) => String(x.item_id) === partId) ?? null;
  const q = num(quantity);
  const unitCost = mode === 'add' ? part?.avg_cost ?? 0 : entry?.unit_cost ?? 0;
  const added = mode === 'edit' && entry ? q - entry.quantity : q;
  const cost = Number.isFinite(added) ? Math.round(added * unitCost * 100) / 100 : 0;
  const offBom = mode === 'add' && !!job?.has_bom && !!part && !part.on_bom;
  const showHeadroom = isOpen && !!job && !!part?.category_id && cost > 0;
  const { data: headroom } = useHeadroom({
    date: mode === 'edit' ? entry?.moved_on : date, contextType: job?.build_order_id ? 'product' : 'project', categoryId: part?.category_id ?? undefined, amount: cost,
    projectId: job?.project_id ?? undefined, productId: job?.product_id ?? undefined, buildOrderId: job?.build_order_id ?? undefined,
  }, showHeadroom);
  const overBudget = showHeadroom && !!headroom && ['OVER', 'BLOCKED', 'NO_LINE'].includes(headroom.state);
  const needsReason = offBom || overBudget || mode === 'correct';
  const tooMany = mode === 'add' && !!part && q > part.on_hand;
  const validQty = mode === 'edit' ? q >= 0 : mode === 'correct' ? Number.isFinite(q) && q !== 0 : q > 0;
  const valid = !!partId && validQty && !tooMany && !!date && (!needsReason || !!reason.trim());
  const title = mode === 'add' ? `Add stock used on ${job?.label ?? ''}` : mode === 'edit' ? 'Edit stock used' : 'Correct stock used';

  const submit = () => {
    if (!job) return;
    if (mode === 'add') return save(() => api.post('/stock/used', { item_id: Number(partId), project_id: job.project_id, build_order_id: job.build_order_id, quantity: q, date, reason }), 'Stock used added.');
    if (mode === 'edit') return save(() => api.put(`/stock/used/${entry!.id}`, { quantity: q, reason }), 'Entry updated.');
    return save(() => api.post(`/stock/used/${entry!.id}/correction`, { quantity: q, date, reason }), 'Correction added.');
  };

  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} title={title} icon={<MinusCircle className="h-4 w-4" />} saveLabel={mode === 'add' ? 'Add stock used' : mode === 'edit' ? 'Save' : 'Add correction'} canSave={valid && !saving} onSave={submit}>
      <div className="space-y-3">
        <Field label="Part" required hint={part ? `${qty(part.on_hand)} ${part.uom} in the Store, average ${money(part.avg_cost)}` : undefined}>
          <NativeSelect value={partId} disabled={mode !== 'add'} onChange={(e) => { setPartId(e.target.value); setQuantity(suggestion(e.target.value)); }}>
            <option value="">Select part...</option>
            {(mode === 'add' ? job?.parts ?? [] : job?.lines ?? []).map((p) => <option key={p.item_id} value={p.item_id}>{p.part_no} · {p.name}{p.on_bom ? '' : job?.has_bom ? ' (not on the BOM)' : ''}</option>)}
          </NativeSelect>
        </Field>
        {mode === 'correct' && entry && <p className="text-[13px] text-[var(--shell-text-muted)]">The entry of {formatDate(entry.moved_on)} is in a closed month. Enter the extra quantity used, or a minus quantity to take usage back. It is charged at {money(entry.unit_cost)} each.</p>}
        <Field label={`${mode === 'correct' ? 'Quantity to add or take back' : 'Quantity used'}${part ? ` (${part.uom})` : ''}`} required
          hint={mode === 'add' && part?.bom_qty != null ? `BOM needs ${qty(part.bom_qty)}, ${qty(part.used_qty)} recorded so far.` : validQty && !!partId ? `Job cost ${cost < 0 ? 'reduces by ' : mode === 'edit' ? 'changes by ' : ''}${money(Math.abs(cost))}` : undefined}
          error={tooMany ? `Only ${qty(part!.on_hand)} ${part!.uom} is on hand.` : undefined}>
          <input className={inp} type="number" step="0.001" min={mode === 'correct' ? undefined : '0'} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        {mode !== 'edit' && <Field label="Date" required hint={date ? formatDate(date) : undefined}><input className={inp} type="date" value={date} max={toLocalYMD()} onChange={(e) => setDate(e.target.value)} /></Field>}
        {showHeadroom && headroom && <BudgetHeadroom headroom={{
          ...headroom,
          // Stock used never blocks, so the expense wording does not fit
          state: headroom.state === 'BLOCKED' ? 'OVER' : headroom.state,
          message: headroom.state === 'NO_LINE' ? 'There is no budget line for this material on the job. Give a reason.' : headroom.state === 'OVER' || headroom.state === 'BLOCKED' ? 'This takes the budget line over. Give a reason.' : headroom.message,
        }} />}
        <Field label="Reason" required={needsReason} hint={offBom ? 'This part is not on the BOM.' : overBudget ? 'Shown with the budget line. Stock used is never blocked.' : undefined}>
          <input className={inp} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {mode === 'add' && <p className="text-[13px] text-[var(--shell-text-muted)]">Enter only what was consumed. A spare that goes back on the shelf is not counted.</p>}
      </div>
    </ModuleModal>
  );
}

export function NewCountModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { saving, save } = useSave(onClose);
  const thisMonth = toLocalYMD().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  useEffect(() => { if (isOpen) setMonth(thisMonth); }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} title="New stock count" icon={<ClipboardList className="h-4 w-4" />} saveLabel="Start count" canSave={!!month && !saving}
      onSave={() => save(() => api.post('/stock/counts', { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) }), 'Stock count started.')}>
      <Field label="Month" required hint="Count before the month is closed."><input className={inp} type="month" value={month} max={thisMonth} onChange={(e) => setMonth(e.target.value)} /></Field>
    </ModuleModal>
  );
}

// Every counted quantity in one dialog, saved together
export function EnterCountsModal({ isOpen, onClose, countId }: { isOpen: boolean; onClose: () => void; countId: number | null }) {
  const { saving, save } = useSave(onClose);
  const { data } = useStockCount(isOpen ? countId : null);
  const [values, setValues] = useState<Record<number, string>>({});
  useEffect(() => { if (isOpen && data) setValues(Object.fromEntries(data.lines.map((l) => [l.item_id, l.counted_qty == null ? '' : String(l.counted_qty)]))); }, [isOpen, data]);
  const bad = Object.values(values).some((v) => v !== '' && !(Number(v) >= 0));
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} title={`Enter counts for ${data?.label ?? ''}`} icon={<ClipboardList className="h-4 w-4" />} size="lg" saveLabel="Save counts" canSave={!!data && !bad && !saving}
      onSave={() => data && save(() => api.put(`/stock/counts/${data.id}`, { lines: data.lines.map((l) => ({ item_id: l.item_id, counted_qty: values[l.item_id] ?? '' })) }), 'Counts saved.')}>
      <p className="mb-3 text-[13px] text-[var(--shell-text-muted)]">Enter what is in the Store now. Enter 0 when there is none. Leave a part blank to count it later.</p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        {(data?.lines ?? []).map((l) => (
          <Field key={l.item_id} label={`${l.part_no} (${l.uom})`} hint={`${l.name}. Books show ${qty(l.expected_qty)}.`}>
            <input className={inp} type="number" min="0" step="0.001" value={values[l.item_id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [l.item_id]: e.target.value }))} />
          </Field>
        ))}
      </div>
    </ModuleModal>
  );
}

export function SendBackCountModal({ isOpen, onClose, count }: { isOpen: boolean; onClose: () => void; count: { id: number; label: string } | null }) {
  const { saving, save } = useSave(onClose);
  const [note, setNote] = useState('');
  useEffect(() => { if (isOpen) setNote(''); }, [isOpen]);
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} title={`Send back the ${count?.label ?? ''} count`} icon={<ClipboardList className="h-4 w-4" />} saveLabel="Send back" canSave={!!note.trim() && !saving}
      onSave={() => count && save(() => api.post(`/stock/counts/${count.id}/decision`, { decision: 'send_back', note }), 'Count sent back.')}>
      <Field label="What needs to change" required><input className={inp} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
    </ModuleModal>
  );
}
