'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Ban, Hammer, PackageOpen, Pencil, Plus, Rocket, Tag, Undo2 } from 'lucide-react';
import { formatDate } from '@/lib/currency';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { CurrencyInput, Field, NativeSelect, SegmentedControl } from '@/components/shared/modal-primitives';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useBuildOrderDefaults, useBuildOrderOptions, type BuildOrder, type BuildOrderRow } from '@/hooks/use-build-orders';
import { useSaver, localToday } from '@/components/budgets/planning-modals';
import { unitPrice } from '@/components/budgets/budget-ui';
import { cn } from '@/lib/utils';

interface Base { isOpen: boolean; onClose: () => void }

const ctl = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-[13px] text-[var(--shell-text)] outline-none focus-visible:border-[var(--shell-accent)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]';
const day = (v: string) => String(v).slice(0, 10);

// Add or change an order: who it is for, how many, and the dates that set how long the parts have to arrive
export function BuildOrderModal({ isOpen, onClose, editing }: Base & { editing: BuildOrderRow | null }) {
  const { saving, run } = useSaver(onClose);
  const options = useBuildOrderOptions(isOpen);
  const blank = { product_id: '', client_id: '', quantity: '1', start_date: '', delivery_date: '', unit_price: '', customer_po: '', notes: '' };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (!isOpen) return;
    setF(editing
      ? { product_id: String(editing.product_id), client_id: String(editing.client_id), quantity: String(editing.quantity), start_date: day(editing.start_date), delivery_date: day(editing.delivery_date),
          unit_price: editing.unit_price != null ? String(editing.unit_price) : '', customer_po: editing.customer_po ?? '', notes: editing.notes ?? '' }
      : { ...blank, start_date: localToday() });
  }, [isOpen, editing]);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const qty = Number(f.quantity);
  const datesOk = !!f.start_date && !!f.delivery_date && f.delivery_date > f.start_date;
  const product = options.data?.products.find((p) => String(p.id) === f.product_id);
  const canSave = !saving && !!f.product_id && !!f.client_id && Number.isInteger(qty) && qty >= 1 && datesOk;

  // A new order starts from what the product says: its price for the year, its customer, and a delivery date its parts can meet.
  // Anything the user has typed or chosen is left alone, and every value can be changed.
  const [touched, setTouched] = useState({ price: false, client: false, delivery: false });
  useEffect(() => { if (isOpen) setTouched({ price: false, client: false, delivery: false }); }, [isOpen]);
  const defs = useBuildOrderDefaults(f.product_id, Number.isInteger(qty) && qty >= 1 ? qty : 1, f.start_date, isOpen && !editing && !!f.product_id);
  const d = !editing && defs.data && String(defs.data.product_id) === f.product_id ? defs.data : null;
  useEffect(() => {
    if (!d) return;
    const known = (options.data?.clients ?? []).some((c) => c.id === d.client_id);
    setF((x) => ({
      ...x,
      unit_price: touched.price ? x.unit_price : d.unit_price != null ? String(d.unit_price) : '',
      client_id: !touched.client && d.client_id != null && known ? String(d.client_id) : x.client_id,
      delivery_date: !touched.delivery && d.suggested_delivery ? d.suggested_delivery : x.delivery_date,
    }));
  }, [d, options.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const unitCost = d ? d.standard_cost ?? d.unit_cost : null;
  const priceNow = Number(f.unit_price);
  const marginNow = unitCost != null && unitCost > 0 && priceNow > 0 ? ((priceNow - unitCost) / priceNow) * 100 : null;
  const marginTone = marginNow == null ? 'text-[var(--shell-text)]' : marginNow < 0 || (d?.min_margin_pct != null && marginNow < d.min_margin_pct) ? 'text-[var(--danger)]' : d?.target_margin_pct != null && marginNow < d.target_margin_pct ? 'text-[var(--warning)]' : 'text-[var(--success)]';
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="lg" title={editing ? `Edit ${editing.code}` : 'Add order'} icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      canSave={canSave} saveLabel={editing ? 'Update order' : 'Add order'}
      onSave={() => run(async () => {
        const body = { client_id: Number(f.client_id), quantity: qty, start_date: f.start_date, delivery_date: f.delivery_date, unit_price: f.unit_price === '' ? null : Number(f.unit_price), customer_po: f.customer_po, notes: f.notes };
        if (editing) await api.put(`/build-orders/${editing.id}`, body);
        else await api.post('/build-orders', { ...body, product_id: Number(f.product_id) });
      }, editing ? 'Order updated.' : 'Order added. Import the standard BOM next.')}>
      <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2">
        <Field label="Product" required hint={editing ? 'The product cannot change once the order exists.' : product && !product.has_bom ? 'This product has no BOM yet, so it cannot be built.' : undefined}>
          <NativeSelect aria-label="Product" value={f.product_id} disabled={!!editing} onChange={(e) => { setTouched((t) => ({ ...t, price: false, delivery: false })); set('product_id')(e.target.value); }}>
            <option value="">Choose a product</option>
            {(options.data?.products ?? []).map((p) => <option key={p.id} value={p.id}>{[p.code, p.name].filter(Boolean).join(' ')}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Customer" required hint={d?.client_name && !touched.client && f.client_id === String(d.client_id) ? 'The customer the product is set up for. Change it if this order is for someone else.' : undefined}>
          <NativeSelect aria-label="Customer" value={f.client_id} onChange={(e) => { setTouched((t) => ({ ...t, client: true })); set('client_id')(e.target.value); }}>
            <option value="">Choose a customer</option>
            {(options.data?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Units" required><Input type="number" min="1" step="1" className={ctl} value={f.quantity} onChange={(e) => set('quantity')(e.target.value)} /></Field>
        <Field label="Customer PO"><Input className={ctl} maxLength={60} value={f.customer_po} onChange={(e) => set('customer_po')(e.target.value)} /></Field>
        <Field label="Start" required hint={f.start_date ? `${formatDate(f.start_date)}. Parts are bought from this date.` : 'Parts are bought from this date.'}>
          <Input type="date" className={ctl} value={f.start_date} onChange={(e) => set('start_date')(e.target.value)} />
        </Field>
        <Field label="Promised delivery" required error={f.start_date && f.delivery_date && !datesOk ? 'Delivery must be after the start.' : undefined}
          hint={d?.suggested_delivery && !touched.delivery && f.delivery_date === d.suggested_delivery ? `Suggested: the earliest the parts and the build allow, ${formatDate(d.suggested_delivery)}. Change it to what you promise.` : `${f.delivery_date ? `${formatDate(f.delivery_date)}. ` : ''}The parts must arrive and the build finish between the two dates.`}>
          <Input type="date" min={f.start_date || undefined} className={ctl} value={f.delivery_date} onChange={(e) => { setTouched((t) => ({ ...t, delivery: true })); set('delivery_date')(e.target.value); }} />
        </Field>
        <Field label="Selling price per unit" hint={editing ? undefined : d ? (d.unit_price != null ? `Filled from the product's price for ${d.fy}-${String(d.fy + 1).slice(2)}. Change it if this customer pays something else.` : 'The product has no price set for the year. Enter the price for this order.') : 'Choose a product to fill the price, customer and a suggested delivery date.'}>
          <CurrencyInput value={f.unit_price} onChange={(v) => { setTouched((t) => ({ ...t, price: true })); set('unit_price')(v); }} />
        </Field>
        <Field label="Notes"><Textarea className={cn(ctl, 'h-[72px] resize-none py-2')} rows={2} maxLength={500} value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
        {d && (
          <div className="space-y-2 rounded-md border border-[var(--shell-border)] p-3 md:col-span-2">
            <p className="text-[13px] font-medium text-[var(--shell-text)]">From the product, for reference</p>
            {!d.has_bom ? <p className="text-[12px] text-[var(--warning)]">This product has no BOM yet, so it cannot be costed or built. Build its BOM on the product first.</p> : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] md:grid-cols-4">
                <div><dt className="text-[12px] text-[var(--shell-text-muted)]">{d.standard_cost != null ? 'Standard cost per unit' : 'Cost per unit (no standard yet)'}</dt><dd className="font-medium text-[var(--shell-text)]">{unitCost != null ? unitPrice(unitCost) : '—'}</dd></div>
                <div><dt className="text-[12px] text-[var(--shell-text-muted)]">Margin at this price</dt><dd className={cn('font-medium', marginTone)}>{marginNow != null ? `${marginNow.toFixed(1)}%` : '—'}</dd></div>
                <div><dt className="text-[12px] text-[var(--shell-text-muted)]">Target and minimum margin</dt><dd className="font-medium text-[var(--shell-text)]">{d.target_margin_pct != null || d.min_margin_pct != null ? `${d.target_margin_pct ?? '—'}% and ${d.min_margin_pct ?? '—'}%` : 'Not set'}</dd></div>
                <div><dt className="text-[12px] text-[var(--shell-text-muted)]">BOM to be copied</dt><dd className="font-medium text-[var(--shell-text)]">Version {d.bom_version}, {d.bom_lines} line{d.bom_lines === 1 ? '' : 's'}</dd></div>
                <div className="col-span-2 md:col-span-4"><dt className="text-[12px] text-[var(--shell-text-muted)]">Parts and build time</dt><dd className="font-medium text-[var(--shell-text)]">Longest lead time {d.longest_lead_days} days, build about {d.assembly_days} days for {Number.isInteger(qty) && qty >= 1 ? qty : 1} unit{qty === 1 ? '' : 's'}. {d.missing_lead_time > 0 && <span className="font-normal text-[var(--warning)]">{d.missing_lead_time} part{d.missing_lead_time === 1 ? ' has' : 's have'} no lead time on the Part master.</span>}</dd></div>
              </dl>
            )}
            <p className="text-[12px] text-[var(--shell-text-muted)]">The price, customer and delivery date above start from these. You can change any of them, and the order is costed from its own BOM copy once you import it.</p>
          </div>
        )}
      </div>
    </ModuleModal>
  );
}

// The one change a copied BOM allows: use another part that meets the same spec. Shows what it costs and whether it can arrive in time.
export function SwapPartModal({ isOpen, onClose, order, lineId: startLine }: Base & { order: BuildOrder | null; lineId?: number | null }) {
  const { saving, run } = useSaver(onClose);
  const lines = useMemo(() => (order?.lines ?? []).filter((l) => l.alternates.length > 0), [order]);
  const [lineId, setLineId] = useState(''); const [pick, setPick] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    const first = lines.find((l) => l.id === startLine) ?? lines[0];
    setLineId(first ? String(first.id) : ''); setPick('');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!order) return null;
  const line = lines.find((l) => String(l.id) === lineId) ?? null;
  const fits = (lead: number | null) => (lead ?? 0) + (line?.tail_days ?? order.lead.assembly_days) <= order.lead.window_days;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="lg" title={`Swap a part on ${order.code}`} icon={<ArrowLeftRight className="h-4 w-4" />}
      canSave={!saving && !!line && !!pick} saveLabel="Swap part"
      onSave={() => run(() => api.post(`/build-orders/${order.id}/lines/${lineId}/swap`, { item_id: Number(pick) }), 'Part swapped and the order costed again.')}>
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--shell-text-muted)]">The BOM is a locked copy. A part can only be swapped for one of its alternates, for example when the customer wants a particular make or supplier. Quantities and operations stay as they are.</p>
        {lines.length === 0 ? <p className="text-[13px] text-[var(--shell-text)]">None of the parts on this order has an alternate. Alternates are set up on the Part master.</p> : (
          <>
            <Field label="Part to swap" required>
              <NativeSelect aria-label="Part to swap" value={lineId} onChange={(e) => { setLineId(e.target.value); setPick(''); }}>
                {lines.map((l) => <option key={l.id} value={l.id}>{l.part_no} {l.name}{l.swapped ? ` (swapped from ${l.source_part_no})` : ''}</option>)}
              </NativeSelect>
            </Field>
            {line && (
              <div role="radiogroup" aria-label="Alternate" className="overflow-hidden rounded-md border border-[var(--shell-border)]">
                <div className="grid grid-cols-[minmax(0,1fr)_110px_90px_120px] gap-3 border-b border-[var(--shell-border)] bg-[var(--table-header)] px-3 py-2 text-[12px] font-semibold text-[var(--shell-text-muted)]">
                  <span>Alternate</span><span className="text-right">Price</span><span className="text-right">Lead time</span><span className="text-right">Change per unit</span>
                </div>
                {line.alternates.map((a) => (
                  <label key={a.id} className={cn('grid cursor-pointer grid-cols-[minmax(0,1fr)_110px_90px_120px] items-baseline gap-3 border-b border-[var(--shell-border)] px-3 py-2 text-[13px] last:border-b-0 hover:bg-[var(--shell-hover)]', pick === String(a.id) && 'bg-[var(--shell-hover)]')}>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <input type="radio" name="alternate" value={a.id} checked={pick === String(a.id)} onChange={() => setPick(String(a.id))} className="translate-y-0.5 accent-[var(--shell-accent)]" />
                      <span className="min-w-0">
                        <span className="text-[var(--shell-text-muted)]">{a.part_no}</span> <span className="font-medium text-[var(--shell-text)]">{a.name}</span>
                        {a.id === line.source_item_id && <span className="text-[var(--shell-text-muted)]"> · original part</span>}
                        {a.is_default && <span className="font-medium text-[var(--success)]"> · default</span>}
                        {a.supplier && <span className="block truncate text-[12px] text-[var(--shell-text-muted)]">{a.supplier}</span>}
                      </span>
                    </span>
                    <span className="text-right tabular-nums">{unitPrice(a.standard_price)}</span>
                    <span className={cn('text-right tabular-nums', fits(a.lead_time_days) ? 'text-[var(--shell-text-muted)]' : 'font-medium text-[var(--warning)]')}>{a.lead_time_days != null ? `${a.lead_time_days} d` : '—'}</span>
                    <span className={cn('text-right tabular-nums', a.cost_change > 0 ? 'text-[var(--danger)]' : a.cost_change < 0 ? 'text-[var(--success)]' : 'text-[var(--shell-text-muted)]')}>{a.cost_change > 0 ? '+' : ''}{unitPrice(a.cost_change)}</span>
                  </label>
                ))}
              </div>
            )}
            {line && (
              <p className="text-[12px] text-[var(--shell-text-muted)]">
                Now on the order: {line.part_no}, lead time {line.lead_time_days != null ? `${line.lead_time_days} days` : 'not set'}. This part has {Math.max(0, order.lead.window_days - (line.tail_days ?? order.lead.assembly_days))} days to arrive before the build it belongs to must start. A lead time in amber does not fit.
              </p>
            )}
          </>
        )}
      </div>
    </ModuleModal>
  );
}

// The selling price of this order, with the margin it gives against the cost and the product's goals
export function OrderPricingModal({ isOpen, onClose, order }: Base & { order: BuildOrder | null }) {
  const { saving, run } = useSaver(onClose);
  const [price, setPrice] = useState('');
  useEffect(() => { if (isOpen && order) setPrice(order.unit_price != null ? String(order.unit_price) : ''); }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!order) return null;
  const cost = order.unit_cost ?? order.live_unit_cost ?? 0;
  const p = Number(price);
  const valid = price === '' || (Number.isFinite(p) && p > 0);
  const margin = price !== '' && p > 0 && cost > 0 ? ((p - cost) / p) * 100 : null;
  const { target_margin_pct: target, min_margin_pct: floor, list_price: list } = order.targets;
  const forGoal = (m: number | null) => (m != null && cost > 0 ? cost / (1 - m / 100) : null);
  const tone = margin == null ? 'text-[var(--shell-text-muted)]' : margin < 0 || (floor != null && margin < floor) ? 'text-[var(--danger)]' : target != null && margin < target ? 'text-[var(--warning)]' : 'text-[var(--success)]';
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title={`Price and costing for ${order.code}`} icon={<Tag className="h-4 w-4" />} canSave={!saving && valid && price !== ''} saveLabel="Save price"
      onSave={() => run(() => api.put(`/build-orders/${order.id}`, { unit_price: Number(price) }), 'Price saved.')}>
      <div className="space-y-4">
        <Field label="Selling price per unit" required hint={list != null ? `The product's price for the year is ${unitPrice(list)}.` : 'No price is set on the product for the year.'}>
          <CurrencyInput value={price} onChange={setPrice} />
        </Field>
        <dl className="grid grid-cols-2 gap-2 text-[13px]">
          <div className="rounded-md bg-[var(--secondary)] px-3 py-2"><dt className="text-[12px] text-[var(--shell-text-muted)]">Cost per unit</dt><dd className="mt-0.5 font-medium text-[var(--shell-text)]">{cost > 0 ? unitPrice(cost) : '—'}</dd></div>
          <div className="rounded-md bg-[var(--secondary)] px-3 py-2"><dt className="text-[12px] text-[var(--shell-text-muted)]">Margin at this price</dt><dd className={cn('mt-0.5 font-medium', tone)}>{margin != null ? `${margin.toFixed(1)}%` : '—'}</dd></div>
          <div className="rounded-md bg-[var(--secondary)] px-3 py-2"><dt className="text-[12px] text-[var(--shell-text-muted)]">Target margin</dt><dd className="mt-0.5 font-medium text-[var(--shell-text)]">{target != null ? `${target}%${forGoal(target) != null ? ` · price ${unitPrice(forGoal(target)!)}` : ''}` : 'Not set'}</dd></div>
          <div className="rounded-md bg-[var(--secondary)] px-3 py-2"><dt className="text-[12px] text-[var(--shell-text-muted)]">Minimum margin</dt><dd className="mt-0.5 font-medium text-[var(--shell-text)]">{floor != null ? `${floor}%${forGoal(floor) != null ? ` · price ${unitPrice(forGoal(floor)!)}` : ''}` : 'Not set'}</dd></div>
        </dl>
        <p className="text-[12px] text-[var(--shell-text-muted)]">Margin is the profit per unit as a share of the selling price. Cost is this order&apos;s own BOM, so a swap to an alternate moves it.</p>
      </div>
    </ModuleModal>
  );
}

// Replace the order's whole BOM copy with the same product's BOM again, or with a different product's
export function ReimportOrderBomModal({ isOpen, onClose, order }: Base & { order: BuildOrderRow | null }) {
  const { saving, run } = useSaver(onClose);
  const options = useBuildOrderOptions(isOpen);
  const [which, setWhich] = useState<'same' | 'other'>('same'); const [other, setOther] = useState('');
  useEffect(() => { if (isOpen) { setWhich('same'); setOther(''); } }, [isOpen]);
  if (!order) return null;
  const products = options.data?.products ?? [];
  const current = products.find((p) => p.id === order.product_id);
  const candidates = products.filter((p) => p.has_bom && p.id !== order.product_id);
  const target = which === 'same' ? current : products.find((p) => String(p.id) === other);
  const name = (p?: { code: string | null; name: string }) => (p ? [p.code, p.name].filter(Boolean).join(' ') : '');
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title={`Reimport BOM for ${order.code}`} icon={<PackageOpen className="h-4 w-4" />}
      canSave={!saving && !!target && target.has_bom} saveLabel="Reimport BOM"
      onSave={() => run(() => api.post(`/build-orders/${order.id}/import-bom`, { product_id: which === 'same' ? order.product_id : Number(other) }), which === 'same' ? 'BOM imported again from the same product.' : 'BOM replaced with the other product\'s. The order is now for that product.')}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p id="reimport-which" className="text-[13px] font-medium text-[var(--shell-text)]">Which BOM</p>
          <SegmentedControl labelledBy="reimport-which" value={which} onChange={setWhich} options={[{ value: 'same' as const, label: 'Same product' }, { value: 'other' as const, label: 'A different product' }]} />
        </div>
        {which === 'same' ? (
          <p className="text-[13px] text-[var(--shell-text)]">Copies the BOM of {name(current) || order.product_name} in force now{current?.bom_version != null ? ` (version ${current.bom_version})` : ''}. The order was last copied from version {order.source_bom_version ?? '—'}. Use this after the product&apos;s BOM has changed.</p>
        ) : (
          <>
            <Field label="Product" required hint="Only products that have a BOM are listed.">
              <NativeSelect aria-label="Product" value={other} onChange={(e) => setOther(e.target.value)}>
                <option value="">Choose a product</option>
                {candidates.map((p) => <option key={p.id} value={p.id}>{name(p)}{p.bom_version != null ? ` · BOM version ${p.bom_version}` : ''}</option>)}
              </NativeSelect>
            </Field>
            <p className="text-[13px] text-[var(--shell-text)]">The order becomes an order for {name(target) || 'that product'}. The build plan it counts against, the standard it is compared with and the margin goals follow the new product. The selling price stays{order.unit_price != null ? ` at ${unitPrice(order.unit_price)}` : ''}, so check it under Price and costing.</p>
          </>
        )}
        <p className="text-[12px] text-[var(--warning)]">Either way the whole BOM and its build operations are replaced, and any parts swapped for alternates go back to the standard.</p>
      </div>
    </ModuleModal>
  );
}

export type OrderStep = 'release' | 'start' | 'reopen';

const STEPS: Record<OrderStep, { title: string; label: string; done: string; icon: React.ReactNode; why: string; changes: string; next: string }> = {
  release: {
    title: 'Release', label: 'Release order', done: 'Order released.', icon: <Rocket className="h-4 w-4" />,
    why: 'Releasing confirms the order and hands it over for building. Do it once the customer has committed, the BOM and any swaps are right, and the price is set.',
    changes: 'The BOM copy is final: it can no longer be imported again. Dates, units and price can still be edited, and a part can still be swapped for an alternate.',
    next: 'Click Start build when work begins. Until then you can Reopen the order to bring it back to Committed.',
  },
  start: {
    title: 'Start build', label: 'Start build', done: 'Build started.', icon: <Hammer className="h-4 w-4" />,
    why: 'Start build records that production has begun: parts are being bought and received, and the units are being assembled.',
    changes: 'The order is frozen. Dates, units, price and parts can no longer change, and it can no longer be reopened, because materials are now committed.',
    next: 'Click Deliver when the units are handed to the customer. If the customer withdraws, the order can still be cancelled with a reason.',
  },
  reopen: {
    title: 'Reopen', label: 'Reopen order', done: 'Order reopened.', icon: <Undo2 className="h-4 w-4" />,
    why: 'Reopening puts a released order back to Committed so it can be corrected, for example to import the BOM again after the product changed.',
    changes: 'Nothing is lost. The BOM copy and any swaps stay as they are until you import again. This is only possible before the build starts.',
    next: 'Make the changes, then click Release again.',
  },
};

// Moving an order forward or back: what it means, what changes, and what comes next, with a warning when the dates or plan are at risk
export function OrderStepModal({ isOpen, onClose, order, step }: Base & { order: BuildOrder | null; step: OrderStep }) {
  const { saving, run } = useSaver(onClose);
  if (!order) return null;
  const s = STEPS[step];
  const warnings: string[] = [];
  if (step !== 'reopen' && order.lead.late) warnings.push(`The parts cannot all arrive in time. The earliest delivery is ${formatDate(order.lead.earliest_delivery)}, against the promised ${formatDate(order.delivery_date)}.`);
  if (step === 'release' && order.plan.over) warnings.push('The orders starting this month take more units than the build plan allows.');
  if (step === 'release' && order.lead.missing_lead_time > 0) warnings.push(`${order.lead.missing_lead_time} part${order.lead.missing_lead_time === 1 ? ' has' : 's have'} no lead time on the Part master, so the date check may be too hopeful.`);
  // Cost and margin risks, so a release is never a surprise
  if (step === 'release' && order.cost_drift != null && Math.abs(order.cost_drift) >= 0.005 && order.live_unit_cost != null) {
    const live = order.unit_price ? ((order.unit_price - order.live_unit_cost) / order.unit_price) * 100 : null;
    warnings.push(`Part prices have moved by ${unitPrice(order.cost_drift)} per unit since this was costed${live != null ? `. At today's prices the margin is ${live.toFixed(1)}%` : ''}. Recost first if you want the margin to match.`);
  }
  if (step === 'release' && order.margin_pct != null && order.margin_pct < 0) warnings.push('The cost per unit is above the selling price, so this order makes a loss.');
  if (step === 'release' && order.unit_price == null) warnings.push('No selling price is set for this order.');
  const section = (heading: string, body: string) => (
    <div className="space-y-1"><p className="text-[13px] font-medium text-[var(--shell-text)]">{heading}</p><p className="text-[13px] leading-relaxed text-[var(--shell-text-muted)]">{body}</p></div>
  );
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title={`${s.title} ${order.code}?`} icon={s.icon} canSave={!saving} saveLabel={s.label}
      onSave={() => run(() => api.post(`/build-orders/${order.id}/${step}`, {}), s.done)}>
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--shell-text)]">{order.quantity} unit{order.quantity === 1 ? '' : 's'} of {order.product_name} for {order.client_name}, promised {formatDate(order.delivery_date)}.</p>
        {warnings.map((w) => <p key={w} role="alert" className="text-[13px] font-medium text-[var(--warning)]">{w}</p>)}
        {section('Why', s.why)}
        {section('What changes', s.changes)}
        {section('What comes next', s.next)}
      </div>
    </ModuleModal>
  );
}

export function CancelOrderModal({ isOpen, onClose, order }: Base & { order: BuildOrderRow | null }) {
  const { saving, run } = useSaver(onClose);
  const [why, setWhy] = useState('');
  useEffect(() => { if (isOpen) setWhy(''); }, [isOpen]);
  if (!order) return null;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title={`Cancel ${order.code}`} icon={<Ban className="h-4 w-4" />} isDestructive canSave={!saving && !!why.trim()} saveLabel="Cancel this order"
      onSave={() => run(() => api.post(`/build-orders/${order.id}/cancel`, { reason: why }), 'Order cancelled.')}>
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--shell-text)]">The {order.quantity} unit{order.quantity === 1 ? '' : 's'} of {order.product_name} no longer count against the build plan. The order stays in the list for the record.</p>
        <Field label="Reason" required><Textarea className={cn(ctl, 'h-20 resize-none py-2')} rows={3} maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
      </div>
    </ModuleModal>
  );
}
