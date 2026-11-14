'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FolderOpen, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, type SortingState } from '@tanstack/react-table';
import api from '@/lib/api-client';
import { formatDate } from '@/lib/currency';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useClients, useProducts, useProductTypes, useProductCategories, useUsers, useInvalidate } from '@/hooks/use-queries';
import { useBudgetProducts, type ProductRow } from '@/hooks/use-planning-queries';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { type FilterDef } from '@/components/data-table/filters';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { ManageTypesDialog } from '@/components/manage/manage-types-dialog';
import { ProductModal } from '@/components/manage/product-modals';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { marginAtCost, marginTone, plain, productVerdict, TONE_CLASS } from '@/components/budgets/budget-ui';
import type { Product } from '@/lib/types';
import { columns as buildColumns, costStatus, COST_STATUSES, PRODUCT_STATUSES, STATUS_TONE } from './columns';
import { PageFrame } from '@/components/shared/module/page-frame';

export default function ProductsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency || 'INR';
  // Managing types and categories is admin-only; the API checks the active role the same way
  const role = (user?.role_name || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  // The API lets managers and admins change products; the other roles read them and open their costing
  const canManage = role === 'ADMIN' || role === 'MANAGER';
  const invalidate = useInvalidate();
  const router = useRouter();

  const { data: products, isLoading } = useProducts();
  const { data: costRows } = useBudgetProducts();
  const { data: clients } = useClients();
  const { data: usersData } = useUsers();
  const allUsers = Array.isArray(usersData) ? usersData : [];
  const { data: types } = useProductTypes();
  const allTypes = types || [];
  const { data: categories } = useProductCategories();

  const costById = useMemo(() => new Map<number, ProductRow>((costRows ?? []).map((r) => [r.id, r])), [costRows]);
  const columns = useMemo(() => buildColumns(currency, (id) => costById.get(id)), [currency, costById]);

  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [client, setClient] = useState('ALL'); const [stage, setStage] = useState('ALL'); const [costFilter, setCostFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const real = useMemo(() => ((products || []) as any[]).filter((p) => !p.is_system), [products]);
  useEffect(() => { setHeader('Products', products ? `${real.length} products` : 'What you make: BOM, standard cost, price and margin'); }, [setHeader, products]); // eslint-disable-line react-hooks/exhaustive-deps

  const clientNames = useMemo(() => [...new Set(real.map((p) => p.client_name).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b)), [real]);
  const stageOf = (p: any) => p.status || (p.is_active ? 'Active' : 'Inactive');
  const rows = useMemo(() => real.filter((p) =>
    (client === 'ALL' || p.client_name === client) &&
    (stage === 'ALL' || stageOf(p) === stage) &&
    (costFilter === 'ALL' || (costById.get(p.id) ? costStatus(costById.get(p.id)!).label === costFilter : false))), [real, client, stage, costFilter, costById]);
  const filterDefs: FilterDef[] = [
    { id: 'client', label: 'Client', value: client, onChange: setClient, options: [{ value: 'ALL', label: 'All clients' }, ...clientNames.map((c) => ({ value: c, label: c }))] },
    { id: 'stage', label: 'Stage', value: stage, onChange: setStage, options: [{ value: 'ALL', label: 'All stages' }, ...PRODUCT_STATUSES.map((s) => ({ value: s, label: s }))] },
    { id: 'cost', label: 'Cost status', value: costFilter, onChange: setCostFilter, options: [{ value: 'ALL', label: 'All cost statuses' }, ...COST_STATUSES.map((s) => ({ value: s, label: s }))] },
  ];

  // Products that cannot be costed yet first
  const [sorting, setSorting] = useState<SortingState>([{ id: 'status', desc: false }]);
  const table = useDataTable<Product>({
    data: rows as Product[], columns, state: { rowSelection: selection, globalFilter, sorting }, onSortingChange: setSorting, getRowId: (r) => String(r.id),
    enableRowSelection: true, enableMultiRowSelection: false, onRowSelectionChange: (u) => setSelection(typeof u === 'function' ? u(selection) : u),
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  // /business/products?id=7 opens the list with that product selected (other pages link here)
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !real.length) return;
    const wanted = Number(new URLSearchParams(window.location.search).get('id'));
    if (!wanted) return;
    linked.current = true;
    if (real.some((r) => r.id === wanted)) { setClient('ALL'); setStage('ALL'); setCostFilter('ALL'); setSelection({ [String(wanted)]: true }); }
  }, [real]);

  const selected = (rows.find((r) => String(r.id) === Object.keys(selection)[0]) ?? null) as any;
  const cost = selected ? costById.get(selected.id) : undefined;

  const handleSave = async (payload: any) => {
    try {
      if (editing) { await api.put(`/products/${editing.id}`, payload); toast.success('Product updated'); }
      else { await api.post('/products', payload); toast.success('Product added'); }
      invalidate('products'); invalidate('budgets'); setModalOpen(false); setSelection({});
    } catch (e: any) { toast.error(e?.message || 'Could not save the product.'); }
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/products/${deleteId}`);
      toast.success('Product deleted');
      invalidate('products'); invalidate('budgets');
      setDeleteId(null); setSelection({});
    } catch (e: any) { setDeleteId(null); toast.error(e?.message || 'Could not delete the product.'); }
  };

  const alwaysActions: DetailActionDef[] = [
    ...(canManage ? [{ label: 'Add', icon: <Plus className="h-4 w-4 text-[var(--success)]" />, onClick: () => { setEditing(null); setModalOpen(true); } }] : []),
    ...(isAdmin ? [{ label: 'Types', icon: <Tags aria-hidden className="h-4 w-4 text-[var(--nav-violet)]" />, onClick: () => setManageOpen(true) }] : []),
  ];
  const itemActions: DetailActionDef[] = selected ? [
    { label: 'Open', variant: 'primary', icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(`/business/products/${selected.id}`) },
    ...(canManage ? [{ label: 'Edit', icon: <Pencil className="h-4 w-4 text-[var(--info)]" />, onClick: () => { setEditing(selected); setModalOpen(true); } }] : []),
    ...(canManage ? [{ label: 'Delete', variant: 'danger' as const, icon: <Trash2 className="h-4 w-4 text-[var(--danger)]" />, onClick: () => setDeleteId(selected.id) }] : []),
  ] : [];

  const costed = [...costById.values()].filter((c) => real.some((p) => p.id === c.id));
  const noBom = costed.filter((c) => !c.bom_lines).length;
  const noStd = costed.filter((c) => c.bom_lines && c.standard_cost == null).length;
  const vcount = (...labels: string[]) => costed.filter((r) => labels.includes(productVerdict(r).label)).length;
  const summary = (
    <div className="space-y-4">
      <DetailSummary title="All products" subtitle="What you make" figure={real.length} figureLabel="Products" />
      <DetailSection title="Where they stand">
        <DetailGrid>
          <DetailField label="Below minimum margin" value={vcount('Loss', 'Below minimum')} tone={vcount('Loss', 'Below minimum') ? 'danger' : 'muted'} />
          <DetailField label="Below target" value={vcount('Below target')} tone={vcount('Below target') ? 'warning' : 'muted'} />
          <DetailField label="On target" value={vcount('On target')} />
          <DetailField label="No price or BOM" value={vcount('No price', 'No BOM')} />
          <DetailField label="No BOM yet" value={noBom} tone={noBom ? 'warning' : 'muted'} />
          <DetailField label="No standard cost" value={noStd} tone={noStd ? 'warning' : 'muted'} />
        </DetailGrid>
      </DetailSection>
      <DetailSection title="By stage">
        <DetailGrid>
          {PRODUCT_STATUSES.filter((s) => real.some((p) => (p.status || '') === s)).map((s) => <DetailField key={s} label={s} value={real.filter((p) => (p.status || '') === s).length} />)}
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Margin is judged at the standard cost and at today&apos;s cost, whichever is worse. Select a product, then Open it for its BOM, operations and standard cost.</p>
    </div>
  );

  const status = selected ? stageOf(selected) : '';
  const cs = cost ? costStatus(cost) : null;
  const sv = cost ? productVerdict(cost) : null;
  const nowMargin = cost ? marginAtCost(cost.selling_price, cost.rolled_cost) : null;
  const panel = !selected ? null : (
    <div className="space-y-4">
      <DetailSummary title={selected.name} subtitle={selected.code || undefined} status={status}
        statusClass={{ success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', info: 'text-[var(--info)]', danger: 'text-[var(--danger)]', muted: 'text-[var(--shell-text-muted)]' }[STATUS_TONE[status] || 'muted']}
        figure={cost?.standard_cost != null ? plain(cost.standard_cost, currency) : cost?.rolled_cost != null ? plain(cost.rolled_cost, currency) : undefined}
        figureLabel={cost?.standard_cost != null ? 'Standard cost' : cost?.rolled_cost != null ? 'Rolled-up cost' : undefined} />
      {sv && <p className={`text-[13px] ${sv.tone === 'danger' ? TONE_CLASS.danger : 'text-[var(--shell-text-muted)]'}`}>{sv.label}. {sv.reason}</p>}
      <DetailSection title="Details">
        <DetailGrid>
          <DetailField label="Type" value={selected.type_name} />
          <DetailField label="Client" value={selected.client_name} />
          <DetailField label="Lead / manager" value={selected.lead} />
          <DetailField label="Category" value={selected.category} />
          <DetailField label="Start date" value={formatDate(selected.start_date)} />
          <DetailField label="End date" value={formatDate(selected.end_date)} />
        </DetailGrid>
      </DetailSection>
      {cost && cs && (
        <DetailSection title="Cost and margin">
          <DetailGrid>
            <DetailField label="Rolled-up cost" value={cost.rolled_cost != null ? plain(cost.rolled_cost, currency) : undefined} />
            <DetailField label="Standard cost" value={cost.standard_cost != null ? plain(cost.standard_cost, currency) : 'None yet'} />
            <DetailField label="Selling price" value={cost.selling_price != null ? plain(cost.selling_price, currency) : undefined} />
            <DetailField label="Margin at standard" value={cost.margin_pct != null ? `${cost.margin_pct.toFixed(1)}%` : undefined} tone={marginTone(cost.margin_pct, cost.target_margin_pct, cost.min_margin_pct)} />
            <DetailField label="Margin at current cost" value={nowMargin != null ? `${nowMargin.toFixed(1)}%` : undefined} tone={marginTone(nowMargin, cost.target_margin_pct, cost.min_margin_pct)} />
            <DetailField label="Cost status" value={cs.label} tone={cs.tone === 'warning' ? 'warning' : 'muted'} />
            <DetailField label="Target margin" value={cost.target_margin_pct != null ? `${cost.target_margin_pct}%` : 'Not set'} />
            <DetailField label="Minimum margin" value={cost.min_margin_pct != null ? `${cost.min_margin_pct}%` : 'Not set'} />
          </DetailGrid>
        </DetailSection>
      )}
      {cost && (
        <DetailSection title="BOM and plan">
          <DetailGrid>
            <DetailField label="BOM" value={cost.bom_lines ? `${cost.bom_lines} lines` : 'No BOM yet'} tone={cost.bom_lines ? 'muted' : 'warning'} />
            <DetailField label="Year" value={`${cost.fy}-${String(cost.fy + 1).slice(2)}`} />
            <DetailField label="Budget plan" value={!cost.plan_status ? 'No budget plan' : cost.budget_line ? 'In budget plan' : 'Not in budget plan'} wide />
          </DetailGrid>
        </DetailSection>
      )}
      {selected.description && (
        <DetailSection title="Description">
          <p className="text-[13px] leading-relaxed text-[var(--shell-text)]">{selected.description}</p>
        </DetailSection>
      )}
    </div>
  );

  return (
    <PageFrame label="Products">
    <ModuleShell
      showPanel={!!selected}
      searchRow={<DataTableToolbar table={table} filterDefs={filterDefs} actions={<><ToolbarActions actions={alwaysActions} /><ToolbarActions actions={itemActions} /></>} />}
      intelligencePanel={
        <ModuleIntelligencePanel title={selected ? 'Product' : 'Summary'} onClose={() => setSelection({})} hasSelection={!!selected}
          idle={summary} footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}>
          {panel}
        </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={rows as Product[]} tableInstance={table}
        emptyMessage={globalFilter || client !== 'ALL' || stage !== 'ALL' || costFilter !== 'ALL' ? 'No products match. Clear a filter or the search to see more.' : canManage ? 'No products yet. Use Add to create the first one.' : 'No products yet.'} />

      <ProductModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} editing={editing} clients={clients || []} productTypes={allTypes} users={allUsers} categories={categories || []} />
      <ManageTypesDialog kind="product" isOpen={manageOpen} onClose={() => setManageOpen(false)} types={allTypes} categories={categories || []} />
      <ConfirmDialog open={!!deleteId} title="Delete product" message={`Delete ${(real.find((p) => p.id === deleteId)?.name) ?? 'this product'}? A product with a BOM or orders cannot be deleted. This cannot be undone.`} confirmLabel="Delete product" destructive onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </ModuleShell>
    </PageFrame>
  );
}
