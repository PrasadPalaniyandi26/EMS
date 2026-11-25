'use client';

import { Plus, Trash2 } from 'lucide-react';
import { money } from '@/lib/money';
import { NativeSelect, inp } from '@/components/shared/modal-primitives';
import { qty, type StockPart } from '@/hooks/use-stock-queries';

export interface StockLineForm { itemId: string; quantity: string; amount: string }
export const emptyStockLine = (): StockLineForm => ({ itemId: '', quantity: '', amount: '' });

export const stockLinesTotal = (lines: StockLineForm[]) => Math.round(lines.reduce((a, l) => a + (Number(l.amount) || 0), 0) * 100) / 100;
export const stockLinesReady = (lines: StockLineForm[], netAmount: number) =>
  lines.length > 0 && lines.every((l) => !!l.itemId && Number(l.quantity) > 0 && Number(l.amount) > 0) && Math.abs(stockLinesTotal(lines) - netAmount) <= 0.01;

// The parts on a stock purchase. The amounts are before GST and must add up to the expense amount before GST.
export function StockLinesField({ lines, onChange, parts, netAmount }: { lines: StockLineForm[]; onChange: (l: StockLineForm[]) => void; parts: StockPart[]; netAmount: number }) {
  const set = (i: number, patch: Partial<StockLineForm>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = stockLinesTotal(lines);
  const matches = netAmount > 0 && Math.abs(total - netAmount) <= 0.01;
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium text-[var(--shell-text)]">Parts bought<span aria-hidden className="ml-0.5 text-[var(--danger)]">*</span></legend>
      {!parts.length && <p className="text-[12px] text-[var(--warning)]">There are no stock parts yet. Add them under Costing data, Stock.</p>}
      {lines.map((l, i) => {
        const part = parts.find((p) => String(p.id) === l.itemId);
        const converted = part && part.purchase_factor !== 1 && Number(l.quantity) > 0 ? `${qty(Number(l.quantity) * part.purchase_factor)} ${part.uom} into stock` : null;
        return (
          <div key={i} className="space-y-1">
            <div className="grid grid-cols-[minmax(0,1fr)_96px_128px_40px] gap-2">
              <NativeSelect aria-label={`Part on line ${i + 1}`} value={l.itemId} onChange={(e) => set(i, { itemId: e.target.value })}>
                <option value="">Select part...</option>
                {parts.map((p) => <option key={p.id} value={p.id}>{p.part_no} · {p.name}</option>)}
              </NativeSelect>
              <input className={inp} type="number" min="0" step="0.001" aria-label={`Quantity on line ${i + 1}${part ? ` in ${part.purchase_uom}` : ''}`} placeholder={part ? part.purchase_uom : 'Qty'} value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
              <input className={inp} type="number" min="0" step="0.01" aria-label={`Amount before GST on line ${i + 1}`} placeholder="Amount ₹" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} />
              <button type="button" disabled={lines.length === 1} onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}
                className="flex h-10 items-center justify-center rounded-md border border-[var(--shell-border)] hover:border-[var(--danger)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)] disabled:opacity-40">
                <Trash2 aria-hidden className="h-3.5 w-3.5 text-[var(--danger)]" />
              </button>
            </div>
            {part && <p className="text-[12px] text-[var(--shell-text-muted)]">Quantity in {part.purchase_uom}{converted ? `: ${converted}` : ''}. {qty(part.on_hand)} {part.uom} on hand now.</p>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => onChange([...lines, emptyStockLine()])} className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">
          <Plus aria-hidden className="h-3.5 w-3.5" /> Add another part
        </button>
        <p aria-live="polite" className={`text-[12px] tabular-nums ${matches ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
          Lines {money(total)} of {money(netAmount)} before GST{matches ? '' : '. They must match.'}
        </p>
      </div>
    </fieldset>
  );
}
