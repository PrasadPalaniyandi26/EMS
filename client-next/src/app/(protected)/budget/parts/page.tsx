'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Network, Plus, ShoppingCart, Tags, Upload } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/currency';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { useItems, useItemPrices, useItemUsage, type Item } from '@/hooks/use-planning-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { IdCell, TextCell, ToneText, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog, NativeSelect } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { ItemCategoriesModal, ItemModal, PartUsageModal, RecordPurchaseModal } from '@/components/budgets/planning-modals';
import { useItemCategories } from '@/hooks/use-planning-queries';
import { ImportModal } from '@/components/budgets/import-modal';
import { money, unitPlain } from '@/components/budgets/budget-ui';

const Whole = ({ value, currency }: { value: number | null; currency: string }) => (
  <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{value == null ? '—' : unitPlain(value, currency)}</div>
);

type Sourcing = 'ALL' | 'BUY' | 'MAKE';
type Price = 'ALL' | 'DRIFT' | 'NO_LAST';
type Use = 'ALL' | 'USED' | 'UNUSED';
const driftOf = (i: Item) => Math.abs(i.price_drift_pct) >= 5;
const PART_HEADERS = ['part_no', 'name', 'category', 'make_or_buy', 'uom', 'standard_price', 'material_cost', 'manufacturing_cost', 'last_price', 'supplier', 'lead_time_days'];

export default function PartMasterPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const canEdit = useAuthStore((s) => ['ADMIN', 'FINANCE'].includes((s.user?.role_name || '').toUpperCase()));
  const invalidate = useInvalidate();
  const { data, isLoading } = useItems();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [sourcing, setSourcing] = useState<Sourcing>('ALL'); const [price, setPrice] = useState<Price>('ALL'); const [use, setUse] = useState<Use>('ALL');
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [del, setDel] = useState<Item | null>(null); const [buyFor, setBuyFor] = useState<Item | null>(null); const [catsOpen, setCatsOpen] = useState(false); const [whereFor, setWhereFor] = useState<Item | null>(null); const [category, setCategory] = useState('ALL');
  const categories = useItemCategories(); const [impOpen, setImpOpen] = useState(false);
  useEffect(() => { setHeader('Part master', 'Parts, bought or made, and their standard prices'); }, [setHeader]);

  const rows = useMemo(() => (data ?? []).filter((i) =>
    (sourcing === 'ALL' || i.sourcing === sourcing)
    && (price === 'ALL' || (price === 'DRIFT' ? driftOf(i) : i.last_price == null))
    && (use === 'ALL' || (use === 'USED' ? i.used_in > 0 : i.used_in === 0))
    && (category === 'ALL' || (category === 'NONE' ? i.category_id == null : String(i.category_id) === category))), [data, sourcing, price, use, category]);

  const columns = useMemo<ColumnDef<Item, any>[]>(() => [
    { accessorKey: 'part_no', header: 'Part', cell: ({ row }) => <IdCell value={row.original.part_no} />, size: 120 },
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[280px] truncate" /> },
    { accessorKey: 'category_name', header: 'Category', cell: ({ row }) => <TextCell value={row.original.category_name} muted />, size: 140 },
    { accessorKey: 'sourcing', header: 'Make / Buy', cell: ({ row }) => <TextCell value={row.original.sourcing === 'MAKE' ? 'Make' : 'Buy'} />, size: 90 },
    { accessorKey: 'uom', header: 'Unit', cell: ({ row }) => <TextCell value={row.original.uom} muted />, size: 70 },
    { accessorKey: 'standard_price', header: headerRight('Standard'), cell: ({ row }) => <Whole value={row.original.standard_price} currency={currency} />, size: 110 },
    { accessorKey: 'last_price', header: headerRight('Last paid'), cell: ({ row }) => <Whole value={row.original.last_price} currency={currency} />, size: 110 },
    {
      accessorKey: 'price_drift_pct', header: headerRight('Drift'), size: 90,
      cell: ({ row }) => { const d = row.original.price_drift_pct; return <div className="text-right">{d ? <ToneText label={`${d > 0 ? '+' : ''}${d.toFixed(1)}%`} tone={Math.abs(d) >= 5 ? 'warning' : 'muted'} /> : <TextCell value="" />}</div>; },
    },
    { accessorKey: 'supplier', header: 'Supplier', cell: ({ row }) => <TextCell value={row.original.supplier} muted /> },
    { accessorKey: 'lead_time_days', header: headerRight('Lead time'), cell: ({ row }) => <div className="text-right"><TextCell value={row.original.lead_time_days != null ? `${row.original.lead_time_days} d` : ''} muted /></div>, size: 90 },
    { accessorKey: 'used_in', header: headerRight('In BOMs'), cell: ({ row }) => <div className="text-right"><TextCell value={row.original.used_in || ''} /></div>, size: 80 },
  ], [currency]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((i) => String(i.id) === Object.keys(selection)[0]) ?? null;
  const usage = useItemUsage(selected?.id ?? null);
  const prices = useItemPrices(selected?.id ?? null);
  const canUseLast = !!selected && selected.sourcing === 'BUY' && selected.last_price != null && selected.last_price !== selected.standard_price;

  // Anyone can see where a part is used; changing it is for Finance and Admin
  const itemActions: DetailActionDef[] = !selected ? [] : [
    ...(canEdit ? [
      { label: 'Edit', onClick: () => { setEditing(selected); setOpen(true); } },
      { label: 'Record purchase', variant: 'primary' as const, icon: <ShoppingCart className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setBuyFor(selected) },
    ] : []),
    { label: 'Where used', icon: <Network className="h-4 w-4 text-[var(--nav-orange)]" />, onClick: () => setWhereFor(selected) },
    ...(canEdit ? [{ label: selected.used_in ? 'Archive' : 'Delete', variant: 'danger' as const, onClick: () => setDel(selected) }] : []),
  ];
  const exportParts = () => downloadCsv('part-master.csv', toCsv(PART_HEADERS, (data ?? []).map((i) => [i.part_no, i.name, i.category_name ?? '', i.sourcing === 'MAKE' ? 'Make' : 'Buy', i.uom, i.standard_price, i.material_cost ?? '', i.manufacturing_cost ?? '', i.last_price ?? '', i.supplier ?? '', i.lead_time_days ?? ''])));
  const alwaysActions: DetailActionDef[] = [
    ...(canEdit ? [{ label: 'Add part', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditing(null); setOpen(true); } }, { label: 'Import', icon: <Upload className="h-4 w-4 text-[var(--warning)]" />, onClick: () => setImpOpen(true) }, { label: 'Categories', icon: <Tags className="h-4 w-4 text-[var(--nav-cyan)]" />, onClick: () => setCatsOpen(true) }] : []),
    { label: 'Export', icon: <Download className="h-4 w-4 text-[var(--shell-text-muted)]" />, onClick: exportParts },
  ];

  const all = data ?? [];
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="Part master" subtitle="Standard prices used in every BOM" figure={all.length} figureLabel="Parts" />
      <DetailSection title="Mix">
        <DetailGrid>
          <DetailField label="Bought" value={all.filter((i) => i.sourcing === 'BUY').length} />
          <DetailField label="Made" value={all.filter((i) => i.sourcing === 'MAKE').length} />
          <DetailField label="Price moved 5% or more" value={all.filter(driftOf).length} />
          <DetailField label="Not in any BOM" value={all.filter((i) => i.used_in === 0).length} />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Changing a standard price reprices every live product cost that uses the part. Approved standard costs are not affected. Drift compares the last price paid with the standard.</p>
    </div>
  );

  const detail = !selected ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.name} subtitle={`${selected.part_no} · ${selected.sourcing === 'MAKE' ? 'Made' : 'Bought'}`} figure={unitPlain(selected.standard_price, currency)} figureLabel={`Standard per ${selected.uom}`} />
      <DetailSection title="Pricing">
        <DetailGrid>
          <DetailField label="Standard" value={money(selected.standard_price, currency)} />
          <DetailField label="Last paid" value={selected.last_price != null ? `${money(selected.last_price, currency)}${selected.last_paid_on ? `, ${formatDate(selected.last_paid_on)}` : ''}` : undefined} />
          <DetailField label="Drift" value={selected.price_drift_pct ? `${selected.price_drift_pct > 0 ? '+' : ''}${selected.price_drift_pct.toFixed(1)}%` : undefined} />
          <DetailField label="Unit" value={selected.uom} />
          {selected.sourcing === 'MAKE' && <><DetailField label="Material" value={money(selected.material_cost, currency)} /><DetailField label="Manufacturing" value={money(selected.manufacturing_cost, currency)} /></>}
        </DetailGrid>
        {canUseLast && canEdit && <p className="text-[12px] text-[var(--warning)]">Last paid differs from the standard. Record a purchase and tick the standard price box to adopt it.</p>}
      </DetailSection>
      <DetailSection title="Prices paid">
        {!prices.data?.length ? <p className="text-[12px] text-[var(--shell-text-muted)]">No purchases recorded yet.</p> : (
          <ul className="space-y-1.5">
            {prices.data.slice(0, 5).map((x) => (
              <li key={x.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-[var(--shell-text-muted)]">{formatDate(x.paid_on)}{x.supplier ? ` · ${x.supplier}` : ''}</span>
                <span className="shrink-0 tabular-nums text-[var(--shell-text)]">{money(x.price, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
      <DetailSection title="Supply">
        <DetailGrid>
          <DetailField label="Category" value={selected.category_name ?? undefined} />
          <DetailField label="Supplier" value={selected.supplier ?? undefined} />
          <DetailField label="Lead time" value={selected.lead_time_days != null ? `${selected.lead_time_days} days` : undefined} />
        </DetailGrid>
      </DetailSection>
      <DetailSection title={`Where used${usage.data ? ` (${usage.data.length})` : ''}`}>
        {usage.isLoading ? <p className="text-[12px] text-[var(--shell-text-muted)]">Loading…</p>
          : !usage.data?.length ? <p className="text-[12px] text-[var(--shell-text-muted)]">Not in any BOM. It can be deleted.</p>
          : (
            <ul className="space-y-1.5">
              {usage.data.map((u, i) => (
                <li key={`${u.kind}-${u.id}-${i}`} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-[var(--shell-text)]">{[u.code, u.name].filter(Boolean).join(' ')}<span className="text-[var(--shell-text-muted)]">{u.kind === 'JOB' ? ' · job BOM' : ''}</span></span>
                  <span className="shrink-0 tabular-nums text-[var(--shell-text-muted)]">× {u.quantity}</span>
                </li>
              ))}
            </ul>
          )}
      </DetailSection>
    </div>
  );

  const filters = (
    <>
      <NativeSelect aria-label="Make or buy" value={sourcing} onChange={(e) => setSourcing(e.target.value as Sourcing)} className="!h-8 !w-auto">
        <option value="ALL">Make and buy</option><option value="BUY">Bought</option><option value="MAKE">Made</option>
      </NativeSelect>
      <NativeSelect aria-label="Price" value={price} onChange={(e) => setPrice(e.target.value as Price)} className="!h-8 !w-auto">
        <option value="ALL">Any price</option><option value="DRIFT">Moved 5% or more</option><option value="NO_LAST">No last paid</option>
      </NativeSelect>
      <NativeSelect aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="!h-8 !w-auto">
        <option value="ALL">Any category</option><option value="NONE">No category</option>
        {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="Use" value={use} onChange={(e) => setUse(e.target.value as Use)} className="!h-8 !w-auto">
        <option value="ALL">Used or not</option><option value="USED">In BOMs</option><option value="UNUSED">Not in a BOM</option>
      </NativeSelect>
    </>
  );

  return (
    <ModuleShell
      showPanel={!!selected}
      searchRow={<DataTableToolbar table={table} filters={filters} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>} />}
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Part' : 'Part master'} onClose={() => setSelection({})} hasSelection={!!selected}
          idle={summary} footer={itemActions.length ? <DetailActions actions={itemActions} /> : undefined}>
          {detail}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={canEdit ? 'No parts match. Click Add part to create one.' : 'No parts match.'} />
      <ItemModal isOpen={open} onClose={() => setOpen(false)} editing={editing} />
      <ConfirmDialog open={!!del} destructive title={del?.used_in ? 'Archive part' : 'Delete part'} confirmLabel={del?.used_in ? 'Archive' : 'Delete'}
        message={del?.used_in ? `${del.name} is in ${del.used_in} BOM line(s). It will be archived and leave the pickers. Adding a part with the same number brings it back.` : `Delete ${del?.name}?`} onCancel={() => setDel(null)}
        onConfirm={async () => { const i = del; setDel(null); if (!i) return; try { await api.delete(`/budgets/items/${i.id}`); toast.success(i.used_in ? 'Part archived.' : 'Part deleted.'); invalidate('budgets'); setSelection({}); } catch (e: any) { toast.error(e?.message || 'Could not remove.'); } }} />
      <ItemCategoriesModal isOpen={catsOpen} onClose={() => setCatsOpen(false)} />
      <PartUsageModal isOpen={!!whereFor} onClose={() => setWhereFor(null)} item={whereFor} />
      <RecordPurchaseModal isOpen={!!buyFor} onClose={() => setBuyFor(null)} item={buyFor} />
      <ImportModal isOpen={impOpen} onClose={() => setImpOpen(false)} title="Import parts" endpoint="/budgets/items/import" templateName="part-master-template.csv" headers={PART_HEADERS}
        sample={[['CONN-24', '24-pin terminal block', 'Electronics', 'Buy', 'nos', '95', '', '', '102', 'Phoenix', '10'], ['SUB-FRAME', 'Welded frame', 'Mechanical', 'Make', 'nos', '', '4200', '1800', '', '', '']]}
        notes="One row per part, matched by part_no. Category must match a name under Part categories. A new part is added and an existing one is updated. Blank cells keep the current value. Make_or_buy is Buy or Make; a made part is priced from its material and manufacturing cost." />
    </ModuleShell>
  );
}
