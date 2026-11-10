'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Clock, Plus } from 'lucide-react';
import { ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidate } from '@/hooks/use-queries';
import { useRates, type OverheadRate, type RateCard } from '@/hooks/use-planning-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { DateCell, TextCell, headerRight } from '@/components/data-table/cells';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, DetailAllocation, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { OverheadBaseModal, OverheadModal, RateCardModal } from '@/components/budgets/planning-modals';
import { ImportModal } from '@/components/budgets/import-modal';
import { TabBar, money, useTabParam } from '@/components/budgets/budget-ui';
import { fyLabel } from '@/hooks/use-budget-queries';
import { formatDate } from '@/lib/currency';
import { cn } from '@/lib/utils';

type Tab = 'cards' | 'overheads';
const TABS: { value: Tab; label: string }[] = [{ value: 'cards', label: 'Rate card' }, { value: 'overheads', label: 'Overhead pools' }];
const TAB_VALUES = TABS.map((t) => t.value);

const Num = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => (
  <div className={cn('text-right text-[13px] tabular-nums text-[var(--shell-text)]', strong && 'font-medium')}>{children}</div>
);

export default function RatesPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  const canEdit = ['ADMIN', 'FINANCE'].includes((user?.role_name || '').toUpperCase());
  const invalidate = useInvalidate();
  const { data, isLoading } = useRates();
  const [tab, setTab] = useTabParam<Tab>(TAB_VALUES, 'cards');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [cardOpen, setCardOpen] = useState(false); const [card, setCard] = useState<RateCard | null>(null); const [delCard, setDelCard] = useState<RateCard | null>(null);
  const [impOpen, setImpOpen] = useState(false);
  const [ohOpen, setOhOpen] = useState(false); const [baseOpen, setBaseOpen] = useState(false); const [oh, setOh] = useState<OverheadRate | null>(null); const [delOh, setDelOh] = useState<OverheadRate | null>(null);
  useEffect(() => { setHeader('Cost rates','Labour rates and overhead pools used in estimates and product costs'); }, [setHeader]);
  const fy = data?.current_fy ?? new Date().getFullYear();
  const [fyView, setFyView] = useState<number | null>(null);
  const viewFy = fyView ?? fy;

  const pools = useMemo(() => (data?.overheads ?? []).filter((o) => o.fy === viewFy), [data, viewFy]);
  const poolTotal = pools.reduce((a, o) => a + o.pool_amount, 0);
  const viewBase = (data?.bases ?? []).find((b) => b.fy === viewFy)?.base_hours ?? 0;
  const viewRate = viewBase > 0 ? poolTotal / viewBase : 0;
  const poolShare = (amount: number) => (poolTotal > 0 ? `${Math.round((amount / poolTotal) * 1000) / 10}%` : '—');
  const rows = useMemo<any[]>(() => (tab === 'cards' ? data?.cards ?? [] : pools), [data, tab, pools]);
  const columns = useMemo<ColumnDef<any, any>[]>(() => tab === 'cards' ? [
    { accessorKey: 'role', header: 'Role', cell: ({ row }) => <TextCell value={row.original.role} strong /> },
    { accessorKey: 'rate_per_hour', header: headerRight('Cost per hour'), cell: ({ row }) => <Num strong>{money(row.original.rate_per_hour, currency)}</Num>, size: 150 },
    { accessorKey: 'used_in', header: headerRight('Operations using it'), cell: ({ row }) => <Num>{row.original.used_in}</Num>, size: 150 },
    { accessorKey: 'effective_from', header: 'Effective from', cell: ({ row }) => <DateCell value={row.original.effective_from} />, size: 140 },
    {
      id: 'next', header: 'Next rate', size: 200, sortUndefined: 'last', accessorFn: (r) => r.next_from ?? undefined,
      cell: ({ row }) => row.original.next_from
        ? <span className="text-[13px] font-medium text-[var(--warning)]">{money(row.original.next_rate, currency)} from {formatDate(row.original.next_from)}</span>
        : <TextCell value="None scheduled" muted />,
    },
  ] : [
    { accessorKey: 'name', header: 'Pool', cell: ({ row }) => <TextCell value={row.original.name} strong /> },
    { accessorKey: 'pool_amount', header: headerRight('Annual cost'), cell: ({ row }) => <Num>{money(row.original.pool_amount, currency)}</Num>, size: 170 },
    { accessorKey: 'rate_per_hour', header: headerRight('Rate per hour'), cell: ({ row }) => <Num strong>{money(row.original.rate_per_hour, currency)}</Num>, size: 130 },
    { id: 'share', header: headerRight('Share of total'), cell: ({ row }) => <Num>{poolShare(row.original.pool_amount)}</Num>, size: 130 },
  ], [tab, currency, poolTotal]);

  const table = useDataTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const selected: any = rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null;
  const switchTab = (t: Tab) => { setTab(t); setSelection({}); };

  const itemActions: DetailActionDef[] = !selected || !canEdit ? [] : tab === 'cards'
    ? [{ label: 'Edit', onClick: () => { setCard(selected); setCardOpen(true); } }, { label: 'Delete', variant: 'danger', onClick: () => setDelCard(selected) }]
    : [{ label: 'Edit', onClick: () => { setOh(selected); setOhOpen(true); } }, { label: 'Delete', variant: 'danger', onClick: () => setDelOh(selected) }];
  const exportRates = () => downloadCsv('cost-rates.csv', toCsv(['role', 'rate_per_hour', 'effective_from'], (data?.cards ?? []).map((c) => [c.role, c.rate_per_hour, String(c.effective_from).slice(0, 10)])));
  const alwaysActions: DetailActionDef[] = tab === 'cards'
    ? [
        ...(canEdit ? [{ label: 'Add rate', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setCard(null); setCardOpen(true); } }] : []),
      ]
    : !canEdit ? [] : [{ label: 'Add pool', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setOh(null); setOhOpen(true); } }, { label: 'Base hours', icon: <Clock className="h-4 w-4 text-[var(--nav-cyan)]" />, onClick: () => setBaseOpen(true) }];

  const remove = async (job: () => Promise<any>, ok: string, archivedMsg?: string) => { try { const r = await job(); toast.success(r?.data?.archived && archivedMsg ? archivedMsg : ok); invalidate('budgets'); setSelection({}); } catch (e: any) { toast.error(e?.message || 'Could not remove.'); } };

  const cards = data?.cards ?? [];
  const cardSummary = (
    <div className="space-y-4">
      <DetailSummary title="Labour rates" subtitle="Cost per hour by role" figure={cards.length ? money(Math.max(...cards.map((c) => c.rate_per_hour)), currency) : undefined} figureLabel="Highest cost per hour" />
      <DetailSection title="Where they stand">
        <DetailGrid>
          <DetailField label="Roles" value={cards.length} />
          <DetailField label="Rate change scheduled" value={cards.filter((c) => c.next_from).length} tone={cards.some((c) => c.next_from) ? 'warning' : 'muted'} />
          <DetailField label="Not used by any operation" value={cards.filter((c) => c.used_in === 0).length} />
          <DetailField label="Operations using a rate" value={cards.reduce((a, c) => a + c.used_in, 0)} />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">A new rate applies from its effective date. Overhead is on the Overhead pools tab.</p>
    </div>
  );
  const summary = tab === 'cards' ? cardSummary : (
    <div className="space-y-4">
      <DetailSummary title="Overhead rate" subtitle={fyLabel(viewFy)} figure={money(viewRate, currency)} figureLabel="Per hour, all pools" />
      <DetailSection title={viewFy === fy ? 'This year' : fyLabel(viewFy)}>
        <DetailGrid>
          <DetailField label="Overhead pools" value={pools.length} />
          <DetailField label="Pool total" value={money(poolTotal, currency)} />
          <DetailField label="Base hours for the year" value={viewBase > 0 ? viewBase.toLocaleString('en-IN') : 'Not set'} wide />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="Share of pools">
        <DetailAllocation items={pools.map((o) => ({ label: o.name, amount: money(o.pool_amount, currency), pct: poolTotal > 0 ? (o.pool_amount / poolTotal) * 100 : 0 }))} total={money(poolTotal, currency)} />
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Product costs add overhead as in-house build-operation hours × the combined rate.</p>
    </div>
  );

  const detail = !selected ? null : tab === 'cards' ? (
    <div className="space-y-4">
      <DetailSummary title={selected.role} subtitle="Labour rate" figure={money(selected.rate_per_hour, currency)} figureLabel="Per hour" />
      <DetailSection title="Use">
        <DetailGrid>
          <DetailField label="Build operations using it" value={selected.used_in} />
          <DetailField label="Effective from" value={formatDate(selected.effective_from)} />
        </DetailGrid>
        {selected.next_from && <p role="status" className="text-[12px] text-[var(--warning)]">From {formatDate(selected.next_from)} the rate becomes {money(selected.next_rate, currency)}.</p>}
      </DetailSection>
      <DetailSection title="Rate history">
        <ul className="space-y-1.5">
          {(data?.history ?? []).filter((h) => h.card_id === selected.id).map((h) => (
            <li key={h.effective_from} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-[var(--shell-text-muted)]">{formatDate(h.effective_from)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}</span>
              <span className="tabular-nums text-[var(--shell-text)]">{money(h.rate_per_hour, currency)}</span>
            </li>
          ))}
        </ul>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">A new rate applies from its effective date. From then, live costs of every build operation that uses the role change. Approved standard costs are not affected. If operations use the role, deleting it archives it instead.</p>
    </div>
  ) : (
    <div className="space-y-4">
      <DetailSummary title={selected.name} subtitle={`Overhead pool ${fyLabel(viewFy)}`} figure={money(selected.rate_per_hour, currency)} figureLabel="Per hour" />
      <DetailSection title="Pool">
        <DetailGrid>
          <DetailField label="Cost for the year" value={money(selected.pool_amount, currency)} />
          <DetailField label="Share of this year" value={poolShare(selected.pool_amount)} />
          <DetailField label="Rate per hour" value={money(selected.rate_per_hour, currency)} />
          <DetailField label="Combined rate, all pools" value={money(viewRate, currency)} />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Pool cost ÷ base hours = rate per hour. Every pool is recovered over the same base hours for the year, and the combined rate is added to in-house build-operation hours.</p>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <TabBar<Tab> value={tab} onChange={switchTab} tabs={TABS} />
      {data?.base_missing && !data?.pools_missing && (
        <p role="alert" className="border-b border-[var(--shell-border)] px-4 py-2 text-[13px] text-[var(--warning)]">
          The base hours for {fyLabel(fy)} are not set, so overhead is not recovered on product costs. Set them with Base hours on the Overhead pools tab.
        </p>
      )}
      {data?.pools_missing && (
        <p role="alert" className="border-b border-[var(--shell-border)] px-4 py-2 text-[13px] text-[var(--warning)]">
          There are no overhead pools for {fyLabel(fy)}, so product costs carry no overhead this year. Add the pools on the Overhead pools tab.
        </p>
      )}
      {tab === 'overheads' && !data?.pools_missing && !data?.base_missing && (
        <p className="border-b border-[var(--shell-border)] px-4 py-2 text-[13px] text-[var(--shell-text-muted)]">
          Combined overhead rate for {fyLabel(viewFy)}: <span className="font-medium tabular-nums text-[var(--shell-text)]">{money(viewRate, currency)}</span> per hour, over {viewBase.toLocaleString('en-IN')} base hours.
        </p>
      )}
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1">
        <ModuleShell
          showPanel={!!selected}
          searchRow={<DataTableToolbar table={table} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>}
            onImport={tab === 'cards' && canEdit ? () => setImpOpen(true) : undefined} onExport={tab === 'cards' ? exportRates : undefined}
            filterDefs={tab === 'overheads' ? [
              { id: 'fy', label: 'Financial year', value: String(viewFy), defaultValue: String(fy), onChange: (v) => { setFyView(Number(v)); setSelection({}); }, options: (data?.fys ?? [fy]).map((y) => ({ value: String(y), label: `${fyLabel(y)}${y === fy ? ' (this year)' : ''}` })) },
            ] : undefined} />}
          intelligencePanel={
            <ModuleIntelligencePanel title={selected ? (tab === 'cards' ? 'Rate' : 'Overhead pool') : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected}
              idle={summary} footer={itemActions.length ? <DetailActions actions={itemActions} /> : undefined}>
              {detail}
            </ModuleIntelligencePanel>
          }
        >
          <DataTable isLoading={isLoading} columns={columns} data={rows} tableInstance={table}
            emptyMessage={tab === 'cards' ? 'No rates yet. Add the roles you cost project labour at.' : `No pools for ${fyLabel(viewFy)}. Product costs add overhead as hours × the combined rate of the pools.`} />
        </ModuleShell>
      </div>

      <ImportModal isOpen={impOpen} onClose={() => setImpOpen(false)} title="Import rates" endpoint="/budgets/rate-cards/import" templateName="cost-rates-template.csv"
        headers={['role', 'rate_per_hour', 'effective_from']} sample={[['Technician', '950', '2026-11-01'], ['Controls engineer', '1900', '']]}
        notes="One row per role. A new role is added. For an existing role the rate becomes a new dated rate: leave effective_from blank to apply it today." />
      <RateCardModal isOpen={cardOpen} onClose={() => setCardOpen(false)} editing={card} />
      <OverheadModal isOpen={ohOpen} onClose={() => setOhOpen(false)} editing={oh} fy={viewFy} />
      <OverheadBaseModal isOpen={baseOpen} onClose={() => setBaseOpen(false)} fy={viewFy} current={viewBase} />
      <ConfirmDialog open={!!delCard} destructive title="Remove rate" message={`Remove the rate for ${delCard?.role}? If operations use it, it is archived instead.`} confirmLabel="Remove" onCancel={() => setDelCard(null)}
        onConfirm={async () => { const c = delCard; setDelCard(null); if (c) await remove(() => api.delete(`/budgets/rate-cards/${c.id}`), 'Rate removed.', 'Rate archived. Operations that use it keep the rate they have now.'); }} />
      <ConfirmDialog open={!!delOh} destructive title="Remove overhead pool" message={`Remove ${delOh?.name}? The combined overhead rate falls from ${money(viewRate, currency)} to ${money(viewBase > 0 ? (poolTotal - (delOh?.pool_amount ?? 0)) / viewBase : 0, currency)} per hour, and live product costs fall with it.`} confirmLabel="Remove" onCancel={() => setDelOh(null)}
        onConfirm={async () => { const o = delOh; setDelOh(null); if (o) await remove(() => api.delete(`/budgets/overhead-rates/${o.id}`), 'Pool removed.'); }} />
    </div>
  );
}
