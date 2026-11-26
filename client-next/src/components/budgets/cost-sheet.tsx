'use client';

import { ColumnDef } from '@tanstack/react-table';
import { money, unitPrice } from '@/lib/money';
import { TextCell, ToneText, headerRight, NumCell } from '@/components/data-table/cells';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAllocation } from '@/components/shared/detail/detail-kit';
import type { OperationRow } from '@/hooks/use-planning-queries';

// A unit cost built up element by element. Orders, products and project job BOMs show it the same way.

export interface CostParts { material: number; scrap: number; freight: number; conversion: number; outsourced: number; fixed: number; overhead: number; warranty: number; total: number; hours: number; overhead_rate: number }
export type StandardParts = Pick<CostParts, 'material' | 'scrap' | 'freight' | 'conversion' | 'fixed' | 'overhead' | 'warranty' | 'total'> & { fy: number };
export interface SheetLine { item_id: number | null; part_no: string; quantity: number; scrap_pct: number; unit_cost: number }

export type CostElement = 'material' | 'scrap' | 'freight' | 'operations' | 'overhead' | 'warranty';
export interface CostRow { id: CostElement; label: string; basis: string; mine: number; many: number; share: number; std: number | null; diff: number | null }

export interface CostSheetInput {
  cost: CostParts; lines: SheetLine[]; operations: OperationRow[]; currency: string;
  /** What the part prices are, for the Material row */
  priceNote: string;
  freightPct?: number | null;
  warrantyPct?: number | null;
  /** A job takes its warranty from the project estimate, so its sheet has no warranty row */
  withWarranty?: boolean;
  /** How many units the second money column covers */
  units?: number;
  standard?: StandardParts | null;
}

const fyShort = (fy: number) => `${fy}-${String(fy + 1).slice(2)}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const same = (d: number) => Math.abs(d) < 0.5;
export const signedMoney = (x: number, currency: string) => `${same(x) ? '' : x > 0 ? '+' : '-'}${money(Math.abs(x), currency)}`;

export function costSheetRows({ cost: c, lines, operations, currency, priceNote, freightPct, warrantyPct, withWarranty = true, units = 1, standard: sn }: CostSheetInput): CostRow[] {
  if (!lines.length && !operations.length) return [];
  const parts = lines.filter((l) => l.item_id != null).length;
  const scrapped = lines.filter((l) => l.scrap_pct > 0).length;
  const outside = c.outsourced > 0 ? `, ${money(c.outsourced, currency)} outsourced` : '';
  const flat = c.fixed > 0 ? `, ${money(c.fixed, currency)} fixed` : '';
  const items: [CostElement, string, string, number, number | null][] = [
    ['material', 'Material', `${plural(parts, 'part')} at ${priceNote}`, c.material, sn?.material ?? null],
    ['scrap', 'Scrap', `Waste allowance on ${plural(scrapped, 'part')}${c.material > 0 ? `, ${((c.scrap / c.material) * 100).toFixed(1)}% of material` : ''}`, c.scrap, sn?.scrap ?? null],
    ['freight', 'Freight and handling', freightPct != null ? `${freightPct}% of material and scrap` : '', c.freight, sn?.freight ?? null],
    ['operations', 'Build operations', `${plural(operations.length, 'operation')}, ${c.hours} h per unit${outside}${flat}`, c.conversion + c.fixed, sn ? sn.conversion + sn.fixed : null],
    ['overhead', 'Overhead', `${c.hours} h at ${money(c.overhead_rate, currency)} per hour`, c.overhead, sn?.overhead ?? null],
    ...(withWarranty ? [['warranty', 'Warranty', warrantyPct != null ? `${warrantyPct}% of all the costs above` : '', c.warranty, sn?.warranty ?? null] as [CostElement, string, string, number, number | null]] : []),
  ];
  return items.map(([id, label, basis, mine, std]) => ({ id, label, basis, mine, many: mine * units, share: c.total > 0 ? (mine / c.total) * 100 : 0, std, diff: std == null ? null : mine - std }));
}

export function costSheetColumns({ currency, manyHeader, standardFy }: { currency: string; manyHeader?: string | null; standardFy?: number | null }): ColumnDef<any, any>[] {
  return [
    { accessorKey: 'label', header: 'Cost element', cell: ({ row }) => <TextCell value={row.original.label} strong />, size: 130 },
    { accessorKey: 'basis', header: 'How it is worked out', size: 200, cell: ({ row }) => <span title={row.original.basis}><TextCell value={row.original.basis} muted className="block max-w-[230px] truncate" /></span> },
    { accessorKey: 'mine', header: headerRight('Per unit'), cell: ({ row }) => <NumCell strong>{money(row.original.mine, currency)}</NumCell>, size: 80 },
    { accessorKey: 'share', header: headerRight('Share'), cell: ({ row }) => <NumCell>{`${row.original.share.toFixed(1)}%`}</NumCell>, size: 60 },
    ...(manyHeader ? [{ accessorKey: 'many', header: headerRight(manyHeader), cell: ({ row }: any) => <NumCell>{money(row.original.many, currency)}</NumCell>, size: 100 } as ColumnDef<any, any>] : []),
    // With no approved standard there is nothing to compare, so the two columns are left out
    ...(standardFy != null ? [
      { accessorKey: 'std', header: headerRight('Standard'), cell: ({ row }: any) => <NumCell>{row.original.std == null ? '—' : money(row.original.std, currency)}</NumCell>, size: 90 } as ColumnDef<any, any>,
      {
        accessorKey: 'diff', header: headerRight('Difference'), size: 90,
        cell: ({ row }: any) => { const d = row.original.diff as number | null; return <div className="text-right"><ToneText label={d == null ? '—' : same(d) ? '0' : signedMoney(d, currency)} tone={d == null || same(d) ? 'muted' : d > 0 ? 'warning' : 'success'} /></div>; },
      } as ColumnDef<any, any>,
    ] : []),
  ];
}

// The line under the panel title: how this cost sits against the approved standard
export function standardStatus(total: number, standard: StandardParts | null | undefined, currency: string) {
  if (!standard) return { text: 'No approved standard cost', className: 'text-[var(--shell-text-muted)]' };
  const d = total - standard.total;
  return {
    text: `${same(d) ? 'Same as' : `${money(Math.abs(d), currency)} ${d > 0 ? 'above' : 'below'}`} the ${fyShort(standard.fy)} standard`,
    className: same(d) ? 'text-[var(--shell-text-muted)]' : d > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]',
  };
}

export function CostGoesSection({ cost: c, currency }: { cost: CostParts; currency: string }) {
  const groups: [string, number][] = [
    ['Material and outsourced work', c.material + c.scrap + c.freight + c.outsourced],
    ['In-house labour', c.conversion - c.outsourced],
    ['Fixed costs', c.fixed],
    ['Overhead', c.overhead],
    ['Warranty', c.warranty],
  ];
  return (
    <DetailSection title="Where the cost goes">
      <DetailAllocation items={groups.filter(([, v]) => v > 0).map(([label, v]) => ({ label, amount: money(v, currency), pct: c.total > 0 ? (v / c.total) * 100 : 0 }))} total={money(c.total, currency)} />
    </DetailSection>
  );
}

export function AgainstStandardSection({ total, standard, currency, units, unitsLabel, missing, note }: { total: number; standard: StandardParts | null | undefined; currency: string; units?: number; unitsLabel?: string; missing: string; note?: string }) {
  const d = standard ? total - standard.total : 0;
  const tone = same(d) ? 'muted' : d > 0 ? 'warning' : 'success';
  return (
    <DetailSection title="Against the approved standard">
      {standard ? (
        <DetailGrid>
          <DetailField label={`Standard ${fyShort(standard.fy)} per unit`} value={money(standard.total, currency)} />
          <DetailField label="Difference per unit" value={signedMoney(d, currency)} tone={tone} />
          {units != null && units > 0 && <DetailField label={`Difference for ${unitsLabel ?? 'all units'}`} value={signedMoney(d * units, currency)} tone={tone} wide />}
        </DetailGrid>
      ) : <p className="text-[12px] text-[var(--shell-text-muted)]">{missing}</p>}
      {standard && note && <p className="text-[12px] text-[var(--shell-text-muted)]">{note}</p>}
    </DetailSection>
  );
}

// What makes up one element: the parts behind a bought cost, or the operations behind a build cost
export function CostElementDetail({ row, lines, operations, overheadRate, currency, manyLabel }: { row: CostRow; lines: SheetLine[]; operations: OperationRow[]; overheadRate: number; currency: string; manyLabel?: string | null }) {
  const parts = row.id === 'material' || row.id === 'scrap'
    ? lines.map((l) => { const base = l.quantity * l.unit_cost; return { name: l.part_no, note: row.id === 'scrap' ? `${l.scrap_pct}% allowance` : `${l.quantity} × ${unitPrice(l.unit_cost, currency)}`, value: row.id === 'scrap' ? base * (l.scrap_pct / 100) : base }; })
    : row.id === 'operations' ? operations.map((op) => ({ name: op.type_name, note: op.is_fixed ? 'Fixed cost' : op.is_outsourced ? 'Outsourced' : `${op.hours} h`, value: op.amount }))
    : row.id === 'overhead' ? operations.filter((op) => !op.is_fixed && !op.is_outsourced).map((op) => ({ name: op.type_name, note: `${op.hours} h`, value: op.hours * overheadRate }))
    : [];
  const top = parts.filter((p) => p.value > 0).sort((p, q) => q.value - p.value);
  return (
    <div className="space-y-4">
      <DetailSummary title={row.label} subtitle={row.basis} figure={money(row.mine, currency)} figureLabel="Per unit" />
      <DetailGrid>
        {manyLabel && <DetailField label={manyLabel} value={money(row.many, currency)} />}
        <DetailField label="Share of cost per unit" value={`${row.share.toFixed(1)}%`} wide={!manyLabel} />
      </DetailGrid>
      {top.length > 0 && (
        <DetailSection title="What makes it up, per unit">
          <ul className="space-y-2">
            {top.map((p, i) => (
              <li key={`${p.name}-${i}`} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate text-[var(--shell-text)]">{p.name}</span><span className="shrink-0 font-semibold tabular-nums text-[var(--shell-text)]">{unitPrice(p.value, currency)}</span></div>
                <div className="text-[12px] text-[var(--shell-text-muted)]">{p.note}</div>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
    </div>
  );
}
