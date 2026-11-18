'use client';

import { canConfigure, isFinanceRole } from '@/lib/permissions';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarX2, Layers, Network, Plus, Replace, ShoppingCart, Tags } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/currency';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { useItems, useItemPrices, useItemUsage, usePartHistory, type Item } from '@/hooks/use-planning-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { IdCell, TextCell, ToneText, headerRight, WholeCell } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { ItemCategoriesModal, ItemModal, PartAlternatesModal, PartHistoryModal, PartReplaceModal, PartUsageModal, RecordPurchaseModal } from '@/components/budgets/planning-modals';
import { useItemCategories } from '@/hooks/use-planning-queries';
import { ImportModal } from '@/components/budgets/import-modal';
import { money, unitPlain } from '@/components/budgets/budget-ui';
import { PageFrame } from '@/components/shared/module/page-frame';


type Sourcing = 'ALL' | 'BUY' | 'MAKE';
type Price = 'ALL' | 'DRIFT' | 'NO_LAST';
type Use = 'ALL' | 'USED' | 'UNUSED';
type Life = 'ACTIVE' | 'ENDED' | 'ALL';
const lifeText = (i: Item) => (i.status === 'REPLACED' ? `Replaced ${formatDate(i.status_from)}` : i.status === 'RETIRED' ? `Retired${i.status_from ? ` ${formatDate(i.status_from)}` : ''}` : i.scheduled ? `${i.scheduled.successor_id ? 'Replaced' : 'Retired'} from ${formatDate(i.scheduled.effective_from)}` : '');
const driftOf = (i: Item) => Math.abs(i.price_drift_pct) >= 5;
// One word for where a part stands, the ones that need a decision first. The dates are in the panel and in the hover text.
const lifeWord = (i: Item): { label: 'Scheduled' | 'Replaced' | 'Retired' | 'Active'; rank: number; tone: 'warning' | 'muted' | 'success' } =>
  i.status === 'REPLACED' ? { label: 'Replaced', rank: 1, tone: 'muted' } : i.status === 'RETIRED' ? { label: 'Retired', rank: 2, tone: 'muted' } : i.scheduled ? { label: 'Scheduled', rank: 0, tone: 'warning' } : { label: 'Active', rank: 3, tone: 'success' };
const LIFE_TONE = { warning: 'text-[var(--warning)]', muted: 'text-[var(--shell-text-muted)]', success: 'text-[var(--success)]' } as const;
const PART_HEADERS = ['part_no', 'name', 'category', 'make_or_buy', 'uom', 'standard_price', 'material_cost', 'manufacturing_cost', 'last_price', 'supplier', 'lead_time_days', 'oem_part_no'];

export default function PartMasterPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const canEdit = useAuthStore((s) => canConfigure(s.user?.role_name));
  const isFinance = useAuthStore((s) => isFinanceRole(s.user?.role_name)); // a purchase price changes cost, so Finance records it
  const invalidate = useInvalidate();
  const { data, isLoading } = useItems(true);
  // Parts with a change coming first
  const [sorting, setSorting] = useState<SortingState>([{ id: 'life', desc: false }]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [sourcing, setSourcing] = useState<Sourcing>('ALL'); const [price, setPrice] = useState<Price>('ALL'); const [use, setUse] = useState<Use>('ALL'); const [life, setLife] = useState<Life>('ACTIVE');
  const [replaceId, setReplaceId] = useState<number | null>(null); const [altId, setAltId] = useState<number | null>(null); const [historyFor, setHistoryFor] = useState<Item | null>(null); const [cancelRep, setCancelRep] = useState<Item | null>(null);
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [del, setDel] = useState<Item | null>(null); const [buyFor, setBuyFor] = useState<Item | null>(null); const [catsOpen, setCatsOpen] = useState(false); const [whereFor, setWhereFor] = useState<Item | null>(null); const [category, setCategory] = useState('ALL');
  const categories = useItemCategories(); const [impOpen, setImpOpen] = useState(false);
  useEffect(() => { setHeader('Part master', 'Parts, bought or made, and their standard prices'); }, [setHeader]);

  const rows = useMemo(() => (data ?? []).filter((i) =>
    (life === 'ALL' || (life === 'ACTIVE' ? i.status === 'ACTIVE' : i.status !== 'ACTIVE'))
    && (sourcing === 'ALL' || i.sourcing === sourcing)
    && (price === 'ALL' || (price === 'DRIFT' ? driftOf(i) : i.last_price == null))
    && (use === 'ALL' || (use === 'USED' ? i.used_in > 0 : i.used_in === 0))
    && (category === 'ALL' || (category === 'NONE' ? i.category_id == null : String(i.category_id) === category))), [data, life, sourcing, price, use, category]);

  const columns = useMemo<ColumnDef<Item, any>[]>(() => [
    { accessorKey: 'part_no', header: 'Code', cell: ({ row }) => <IdCell value={row.original.part_no} />, size: 120 },
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <TextCell value={row.original.name} strong className="block max-w-[220px] truncate" /> },
    { id: 'life', header: 'Status', size: 110, accessorFn: (i) => lifeWord(i).rank, cell: ({ row }) => { const w = lifeWord(row.original); return <span title={lifeText(row.original) || undefined}><ToneText label={w.label} tone={w.tone} /></span>; } },
    { accessorKey: 'oem_part_no', header: 'OEM part number' },
    { accessorKey: 'category_name', header: 'Category', cell: ({ row }) => <TextCell value={row.original.category_name} muted className="block max-w-[130px] truncate" />, size: 130 },
    { accessorKey: 'sourcing', header: 'Make / Buy', cell: ({ row }) => <TextCell value={row.original.sourcing === 'MAKE' ? 'Make' : 'Buy'} />, size: 90 },
    { accessorKey: 'standard_price', header: headerRight('Standard'), cell: ({ row }) => <WholeCell unit value={row.original.standard_price} currency={currency} />, size: 110 },
    {
      accessorKey: 'price_drift_pct', header: headerRight('Drift'), size: 90,
      cell: ({ row }) => { const d = row.original.price_drift_pct; return <div className="text-right">{d ? <ToneText label={`${d > 0 ? '+' : ''}${d.toFixed(1)}%`} tone={Math.abs(d) >= 5 ? 'warning' : 'muted'} /> : <TextCell value="" />}</div>; },
    },
    { accessorKey: 'lead_time_days', header: headerRight('Lead time (days)'), sortUndefined: 'last', accessorFn: (i) => i.lead_time_days ?? undefined, cell: ({ row }) => <div className="text-right">{row.original.lead_time_days != null ? <TextCell value={String(row.original.lead_time_days)} muted /> : <ToneText label="Not set" tone="warning" />}</div>, size: 90 },
    { accessorKey: 'used_in', header: headerRight('In BOMs'), cell: ({ row }) => <div className="text-right"><TextCell value={row.original.used_in || ''} /></div>, size: 80 },
  ], [currency]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection, columnVisibility: { oem_part_no: false } }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getColumnCanGlobalFilter: () => true, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected = rows.find((i) => String(i.id) === Object.keys(selection)[0]) ?? null;
  const usage = useItemUsage(selected?.id ?? null);
  const history = usePartHistory(selected?.id ?? null);
  const replaceItem = replaceId != null ? (data ?? []).find((i) => i.id === replaceId) ?? null : null;
  const altItem = altId != null ? (data ?? []).find((i) => i.id === altId) ?? null : null;
  const prices = useItemPrices(selected?.id ?? null);
  const canUseLast = !!selected && selected.sourcing === 'BUY' && selected.last_price != null && selected.last_price !== selected.standard_price;

  // Anyone can see where a part is used; changing it is for Finance and Admin
  const itemActions: DetailActionDef[] = !selected ? [] : [
    ...(canEdit && selected.status === 'ACTIVE' ? [{ label: 'Edit', onClick: () => { setEditing(selected); setOpen(true); } }] : []),
    { label: 'Where used', icon: <Network className="h-4 w-4 text-[var(--nav-orange)]" />, onClick: () => setWhereFor(selected) },
    ...(selected.sourcing === 'BUY' && selected.status === 'ACTIVE' && selected.project_id == null ? [{ label: 'Alternates', icon: <Layers className="h-4 w-4 text-[var(--nav-purple)]" />, onClick: () => setAltId(selected.id) }] : []),
    ...(canEdit && selected.status === 'ACTIVE' ? [selected.scheduled
      ? { label: 'Cancel replacement', icon: <CalendarX2 className="h-4 w-4 text-[var(--nav-indigo)]" />, onClick: () => setCancelRep(selected) }
      : { label: 'Replace', icon: <Replace className="h-4 w-4 text-[var(--nav-indigo)]" />, onClick: () => setReplaceId(selected.id) }] : []),
    // A made part is not bought, so Record purchase is only for bought parts
    ...(isFinance && selected.status === 'ACTIVE' && selected.sourcing === 'BUY' ? [{ label: 'Record purchase', variant: 'primary' as const, icon: <ShoppingCart className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setBuyFor(selected) }] : []),
    // A part that has been on a BOM is replaced or retired, never deleted, so its history stays
    ...(canEdit && !selected.ever_used ? [{ label: 'Delete', variant: 'danger' as const, onClick: () => setDel(selected) }] : []),
  ];
  // The panel footer holds the three actions that change the part; Where used and Alternates are links in the panel and buttons in the toolbar
  const panelActions = itemActions.filter((a) => ['Edit', 'Replace', 'Cancel replacement', 'Record purchase', 'Delete'].includes(a.label)).slice(0, 3);
  const exportParts =() => downloadCsv('part-master.csv', toCsv(PART_HEADERS, (data ?? []).map((i) => [i.part_no, i.name, i.category_name ?? '', i.sourcing === 'MAKE' ? 'Make' : 'Buy', i.uom, i.standard_price, i.material_cost ?? '', i.manufacturing_cost ?? '', i.last_price ?? '', i.supplier ?? '', i.lead_time_days ?? '', i.oem_part_no ?? ''])));
  const alwaysActions: DetailActionDef[] = [
    ...(canEdit ? [{ label: 'Add part', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditing(null); setOpen(true); } }, { label: 'Categories', icon: <Tags className="h-4 w-4 text-[var(--nav-cyan)]" />, onClick: () => setCatsOpen(true) }] : []),
  ];

  const all = (data ?? []).filter((i) => i.status === 'ACTIVE');
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="Active parts" subtitle={`${all.filter((i) => i.sourcing === 'BUY').length} bought, ${all.filter((i) => i.sourcing === 'MAKE').length} made`} figure={all.length} figureLabel="Parts" />
      <DetailSection title="Needs attention">
        <DetailGrid>
          <DetailField label="Change scheduled" value={all.filter((i) => i.scheduled).length} tone={all.some((i) => i.scheduled) ? 'warning' : 'muted'} />
          <DetailField label="Lead time not set" value={all.filter((i) => i.lead_time_days == null).length} tone={all.some((i) => i.lead_time_days == null) ? 'warning' : 'muted'} />
          <DetailField label="Price moved 5% or more" value={all.filter(driftOf).length} />
          <DetailField label="Not in any BOM" value={all.filter((i) => i.used_in === 0).length} />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Changing a standard price reprices every live product cost that uses the part. Approved standard costs are not affected.</p>
    </div>
  );

  const sw = selected ? lifeWord(selected) : null;
  const detail = !selected || !sw ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.name} subtitle={`${selected.part_no} · ${selected.sourcing === 'MAKE' ? 'Made' : 'Bought'}`} status={sw.label} statusClass={LIFE_TONE[sw.tone]} figure={money(selected.standard_price, currency)} figureLabel={`Standard per ${selected.uom}`} />
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
      {(selected.status !== 'ACTIVE' || selected.scheduled) && (
        <DetailSection title={selected.status === 'ACTIVE' ? 'Due to change' : selected.status === 'REPLACED' ? 'Replaced' : 'Retired'}>
          <DetailGrid>
            {selected.status === 'ACTIVE' && selected.scheduled ? (
              <>
                <DetailField label={selected.scheduled.successor_id ? 'Replaced by' : 'Retired'} value={selected.scheduled.successor_id ? `${selected.scheduled.successor_part_no} ${selected.scheduled.successor_name ?? ''}` : 'No replacement'} wide />
                <DetailField label="From" value={formatDate(selected.scheduled.effective_from)} />
              </>
            ) : (
              <>
                {selected.status === 'REPLACED' && <DetailField label="Replaced by" value={`${selected.replaced_by_part_no ?? ''} ${selected.replaced_by_name ?? ''}`.trim()} wide />}
                <DetailField label="From" value={selected.status_from ? formatDate(selected.status_from) : undefined} />
              </>
            )}
          </DetailGrid>
          {(selected.scheduled?.reason ?? selected.status_reason) && <p className="text-[12px] text-[var(--shell-text-muted)]">Reason: {selected.scheduled?.reason ?? selected.status_reason}</p>}
        </DetailSection>
      )}
      {selected.sourcing === 'BUY' && selected.status === 'ACTIVE' && (
        <DetailSection title={`Alternates${selected.alternates.length ? ` (${selected.alternates.length})` : ''}`}
          action={<button type="button" onClick={() => setAltId(selected.id)} className="text-[12px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">{canEdit ? (selected.alternates.length ? 'Manage' : 'Add') : 'See all'}</button>}>
          {!selected.alternates.length ? <p className="text-[12px] text-[var(--shell-text-muted)]">No alternates. Add bought parts that meet the same spec.</p> : (
            <ul className="space-y-1.5">
              {[{ id: selected.id, part_no: selected.part_no, oem_part_no: selected.oem_part_no, standard_price: selected.standard_price, is_default: selected.is_default_alternate, self: true }, ...selected.alternates.map((a) => ({ ...a, self: false }))]
                .sort((x, y) => Number(y.is_default) - Number(x.is_default) || x.part_no.localeCompare(y.part_no)).map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-[var(--shell-text)]">{a.part_no}{a.oem_part_no ? <span className="text-[var(--shell-text-muted)]"> · OEM {a.oem_part_no}</span> : null}{a.self ? <span className="text-[var(--shell-text-muted)]"> (this part)</span> : null}{a.is_default ? <span className="font-medium text-[var(--success)]"> · Default</span> : null}</span>
                  <span className="shrink-0 tabular-nums text-[var(--shell-text-muted)]">{unitPlain(a.standard_price, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      )}
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
          {selected.sourcing === 'BUY' && <DetailField label="OEM part number" value={selected.oem_part_no ?? undefined} wide />}
          {selected.project_id != null && <DetailField label="Used on" value={`${selected.project_code ?? 'One project'} only`} wide />}
          <DetailField label="Category" value={selected.category_name ?? undefined} />
          <DetailField label="Supplier" value={selected.supplier ?? undefined} />
          <DetailField label="Lead time" value={selected.lead_time_days != null ? `${selected.lead_time_days} working days` : undefined} />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="History" action={<button type="button" onClick={() => setHistoryFor(selected)} className="text-[12px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">See all</button>}>
        {!history.data?.length ? <p className="text-[12px] text-[var(--shell-text-muted)]">{history.isLoading ? 'Loading…' : 'Nothing recorded yet.'}</p> : (
          <ul className="space-y-1.5">
            {history.data.slice(0, 4).map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-[var(--shell-text)]">{e.text}</span>
                <span className="shrink-0 tabular-nums text-[var(--shell-text-muted)]">{formatDate(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </div>
  );

  const filterDefs: FilterDef[] = [
    { id: 'life', label: 'Part status', value: life, onChange: (v) => setLife(v as Life), options: [{ value: 'ACTIVE', label: 'Active parts' }, { value: 'ENDED', label: 'Replaced or retired' }, { value: 'ALL', label: 'All parts' }] },
    { id: 'sourcing', label: 'Make or buy', value: sourcing, onChange: (v) => setSourcing(v as Sourcing), options: [{ value: 'ALL', label: 'Make and buy' }, { value: 'BUY', label: 'Bought' }, { value: 'MAKE', label: 'Made' }] },
    { id: 'price', label: 'Price', value: price, onChange: (v) => setPrice(v as Price), options: [{ value: 'ALL', label: 'Any price' }, { value: 'DRIFT', label: 'Moved 5% or more' }, { value: 'NO_LAST', label: 'No last paid' }] },
    { id: 'category', label: 'Category', value: category, onChange: setCategory, options: [{ value: 'ALL', label: 'Any category' }, { value: 'NONE', label: 'No category' }, ...(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))] },
    { id: 'use', label: 'In BOMs', value: use, onChange: (v) => setUse(v as Use), options: [{ value: 'ALL', label: 'Used or not' }, { value: 'USED', label: 'In BOMs' }, { value: 'UNUSED', label: 'Not in a BOM' }] },
  ];

  return (
    <PageFrame label="Part master">
    <ModuleShell
      showPanel={!!selected}
      searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} onImport={canEdit ? () => setImpOpen(true) : undefined} onExport={exportParts} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>} />}
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Part' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected}
          idle={summary} footer={panelActions.length ? <DetailActions actions={panelActions} /> : undefined}>
          {detail}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table} emptyMessage={canEdit ? 'No parts match. Click Add part to create one.' : 'No parts match.'} />
      <ItemModal isOpen={open} onClose={() => setOpen(false)} editing={editing} />
      <ConfirmDialog open={!!del} destructive title="Delete part" confirmLabel="Delete"
        message={`Delete ${del?.name}? It has never been on a BOM. Its price history goes with it. A part that has been used is replaced or retired instead.`} onCancel={() => setDel(null)}
        onConfirm={async () => { const i = del; setDel(null); if (!i) return; try { await api.delete(`/budgets/items/${i.id}`); toast.success('Part deleted.'); invalidate('budgets'); setSelection({}); } catch (e: any) { toast.error(e?.message || 'Could not remove.'); } }} />
      <ItemCategoriesModal isOpen={catsOpen} onClose={() => setCatsOpen(false)} />
      <PartReplaceModal isOpen={!!replaceItem} onClose={() => setReplaceId(null)} item={replaceItem} items={data ?? []} />
      <PartAlternatesModal isOpen={!!altItem} onClose={() => setAltId(null)} item={altItem} items={data ?? []} canEdit={canEdit} />
      <PartHistoryModal isOpen={!!historyFor} onClose={() => setHistoryFor(null)} item={historyFor} />
      <ConfirmDialog open={!!cancelRep} title="Cancel replacement" confirmLabel="Cancel replacement" message={`Keep ${cancelRep?.name} as it is? The change scheduled for ${cancelRep?.scheduled ? formatDate(cancelRep.scheduled.effective_from) : ''} will not happen.`} onCancel={() => setCancelRep(null)}
        onConfirm={async () => { const i = cancelRep; setCancelRep(null); if (!i?.scheduled) return; try { await api.delete(`/budgets/part-replacements/${i.scheduled.id}`); toast.success('Replacement cancelled.'); invalidate('budgets'); } catch (e: any) { toast.error(e?.message || 'Could not cancel.'); } }} />
      <PartUsageModal isOpen={!!whereFor} onClose={() => setWhereFor(null)} item={whereFor} />
      <RecordPurchaseModal isOpen={!!buyFor} onClose={() => setBuyFor(null)} item={buyFor} />
      <ImportModal isOpen={impOpen} onClose={() => setImpOpen(false)} title="Import parts" endpoint="/budgets/items/import" templateName="part-master-template.csv" headers={PART_HEADERS}
        sample={[['CONN-24', '24-pin terminal block', 'Electronics', 'Buy', 'nos', '95', '', '', '102', 'Phoenix', '10', '1757019'], ['SUB-FRAME', 'Welded frame', 'Mechanical', 'Make', 'nos', '', '4200', '1800', '', '', '21', '']]}
        notes="One row per part, matched by part_no. Category must match a name under Part categories. A new part is added and an existing one is updated. Blank cells keep the current value, except lead_time_days: every part needs one, in working days (zero means on hand). Make_or_buy is Buy or Make; a bought part needs its oem_part_no (the manufacturer's number); a made part is priced from its material and manufacturing cost." />
    </ModuleShell>
    </PageFrame>
  );
}
