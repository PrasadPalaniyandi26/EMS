'use client';

import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useClients, useProducts, useProductTypes, useProductCategories, useUsers, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { CURRENCY_SYMBOL, formatDate } from '@/lib/currency';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { PickSelect } from '@/components/manage/pick-select';
import { toast } from 'sonner';
import {
  Plus, Pencil, Tags,
  Package,
} from 'lucide-react';
import { ManageTypesDialog } from '@/components/manage/manage-types-dialog';
import type { Product } from '@/lib/types';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { columns } from './columns';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
} from "@tanstack/react-table";
import { useDataTable } from '@/hooks/use-data-table';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAllocation, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { CurrencyInput, Field, NativeSelect, ConfirmDialog, SegmentedControl, inp } from '@/components/shared/modal-primitives';

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface ProductForm {
  name: string; description: string; typeId: string; clientId: string;
  model: string; leadEngineer: string; unitCost: string;
  category: string; status: string; startDate: string; endDate: string;
}
const defaultForm = (): ProductForm => ({
  name: '', description: '', typeId: '', clientId: '',
  model: '', leadEngineer: '', unitCost: '', category: '', status: 'R&D', startDate: '', endDate: '',
});


// ─── Page ─────────────────────────────────────────────────────────────────────


export default function ProductsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  // Managing types and categories is admin-only; the API checks the active role the same way
  const isAdmin = (user?.role_name || '').toUpperCase() === 'ADMIN';
  const currencySymbol = CURRENCY_SYMBOL[user?.currency || 'INR'] || '₹';
  const { data: clients } = useClients();
  const { data: usersData } = useUsers();
  const allUsers = Array.isArray(usersData) ? usersData : [];
  const invalidate = useInvalidate();

  const { data: products, isLoading } = useProducts();
  const { data: types } = useProductTypes();
  const allTypes = types || [];
  const { data: categories } = useProductCategories();

  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState<ProductForm>(defaultForm());
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => { setHeader('Products', 'Product Catalog & Manufacturing Hub'); }, [setHeader]);

  const table = useDataTable<Product>({
    data: products || [],
    columns,
    state: { rowSelection, globalFilter },
    enableRowSelection: true,
    enableMultiRowSelection: false,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedProduct = selectedRows.length > 0 ? selectedRows[0].original : null;

  // Types belong to a client, as for projects, so the list follows the chosen client
  const clientTypes = allTypes.filter((t: any) => String(t.client_id) === form.clientId);

  // Categories follow the chosen type; the category is stored by name, so keep a saved one that is no longer listed
  const categoryOptions = (categories || []).filter((c) => String(c.type_id) === form.typeId).map((c) => ({ id: c.name, name: c.name }));
  if (form.category && form.typeId && !categoryOptions.some((o) => o.id === form.category)) categoryOptions.push({ id: form.category, name: form.category });

  // ── Add ──
  const openAdd = () => { setForm(defaultForm()); setEditingId(null); setAddOpen(true); };

  // ── Edit ──
  const openEdit = () => {
    if (!selectedProduct) { toast.error('Select one product to edit'); return; }
    setForm({
      name: selectedProduct.name,
      description: selectedProduct.description || '',
      typeId: selectedProduct.type_id ? String(selectedProduct.type_id) : '',
      clientId: String(selectedProduct.client_id),
      model: (selectedProduct as any).model || '',
      leadEngineer: String((selectedProduct as any).lead_id || ''),
      unitCost: (selectedProduct as any).budget ? String((selectedProduct as any).budget) : '',
      category: (selectedProduct as any).category || '',
      status: (selectedProduct as any).status || 'R&D',
      startDate: (selectedProduct as any).start_date ? String((selectedProduct as any).start_date).split('T')[0] : '',
      endDate: (selectedProduct as any).end_date ? String((selectedProduct as any).end_date).split('T')[0] : '',
    });
    setEditingId(selectedProduct.id);
    setEditOpen(true);
  };

  // ── Save ──
  const handleSave = async (isEdit: boolean) => {
    if (!form.name.trim()) { toast.error('Product name is required'); return; }
    if (!form.clientId) { toast.error('Client is required'); return; }
    if (!form.typeId) { toast.error('Product type is required'); return; }
    try {
      const payload = { name: form.name, description: form.description, client_id: Number(form.clientId) || undefined, type_id: Number(form.typeId), lead_id: Number(form.leadEngineer) || undefined, budget: form.unitCost ? Number(form.unitCost) : undefined, category: form.category || undefined, model: form.model || undefined, status: form.status, start_date: form.startDate || null, end_date: form.endDate || null };
      if (isEdit && editingId) { await api.put(`/products/${editingId}`, payload); toast.success('Product updated'); setEditOpen(false); }
      else { await api.post('/products', payload); toast.success('Product created'); setAddOpen(false); }
      invalidate('products'); setRowSelection({});
    } catch { toast.error('Failed to save product'); }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/products/${deleteId}`);
      toast.success('Product deleted');
      invalidate('products');
      setDeleteId(null); setRowSelection({});
    } catch { toast.error('Failed to delete'); }
  };

  const itemActions: DetailActionDef[] = selectedProduct ? [
    { label: 'Edit', variant: 'primary', onClick: openEdit },
    { label: 'Delete', variant: 'danger', onClick: () => setDeleteId(selectedProduct.id) },
  ] : [];

  return (
    <ModuleShell
      showPanel={!!selectedProduct}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={<>
            <button className="btn-action" onClick={openAdd}>
              <Plus className="h-4 w-4 text-[var(--success)]" /> Add
            </button>
            {isAdmin && (
              <button className="btn-action" onClick={() => setManageOpen(true)}>
                <Tags aria-hidden className="h-4 w-4 text-[var(--nav-violet)]" /> Types
              </button>
            )}
          <ToolbarActions actions={itemActions} /></>}
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title="Product Intelligence"
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedProduct}
            footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}
          >
            {selectedProduct && (() => {
              const pd: any = selectedProduct;
              const status = pd.status || (pd.is_active ? 'Active' : 'Inactive');
              return (
                <>
                  <DetailSummary
                    title={pd.name}
                    subtitle={pd.code || `PRD-${String(pd.id).padStart(3, '0')}`}
                    status={status}
                    statusClass="text-[var(--shell-text-muted)]"
                    figure={pd.unit_cost != null && pd.unit_cost !== '' ? `${currencySymbol}${Number(pd.unit_cost).toLocaleString()}` : undefined}
                    figureLabel="Est. unit cost"
                  />
                  <DetailSection title="Details">
                    <DetailGrid>
                      <DetailField label="Type" value={pd.type_name} />
                      <DetailField label="Client" value={pd.client_name} />
                      <DetailField label="Lead / manager" value={pd.lead} />
                      <DetailField label="Category" value={pd.category} />
                      <DetailField label="Model / version" value={pd.model} wide />
                      <DetailField label="Start date" value={formatDate(pd.start_date)} />
                      <DetailField label="End date" value={formatDate(pd.end_date)} />
                    </DetailGrid>
                  </DetailSection>
                  {pd.description && (
                    <DetailSection title="Description">
                      <p className="text-[13px] leading-relaxed text-[var(--shell-text)]">{pd.description}</p>
                    </DetailSection>
                  )}
                </>
              );
            })()}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable isLoading={isLoading} columns={columns} data={products || []} tableInstance={table} emptyMessage="No products found. Click Add to create one." />

      {/* ══ ADD / EDIT PRODUCT (shared layout) ══ */}
      {[
        { open: addOpen, onClose: () => setAddOpen(false), isEdit: false },
        { open: editOpen, onClose: () => setEditOpen(false), isEdit: true },
      ].map(({ open, onClose, isEdit }) => (
        <ModuleModal
          key={isEdit ? 'edit' : 'add'}
          isOpen={open}
          onClose={onClose}
          title={isEdit ? 'Edit Product' : 'Add New Product'}
          icon={isEdit ? <Pencil className="h-4 w-4" /> : <Package className="h-4 w-4" />}
          onSave={() => handleSave(isEdit)}
          canSave={!!form.name.trim() && !!form.clientId && !!form.typeId}
          saveLabel={isEdit ? 'Save Changes' : 'Create Product'}
          size="xl"
        >
          <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 md:grid-cols-3">
            {/* Column 1: the product and its schedule */}
            <div className="space-y-3">
              <Field label="Product Name" required>
                <input className={inp} placeholder="e.g. Heavy-Duty Industrial Robot" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Start Date">
                <input className={inp} type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </Field>
              <Field label="End Date">
                <input className={inp} type="date" min={form.startDate || undefined} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </Field>
            </div>

            {/* Column 2: classification, top to bottom: client, type, then the type's categories */}
            <div className="space-y-3">
              <Field label="Client" required>
                <NativeSelect value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value, typeId: '', category: '' })}>
                  <option value="">Select client</option>
                  {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </NativeSelect>
              </Field>
              <PickSelect
                label="Product Type"
                required
                placeholder="Select type"
                value={form.typeId}
                onChange={(id) => setForm(prev => ({ ...prev, typeId: id, category: '' }))}
                options={clientTypes}
                disabled={!form.clientId}
                emptyHint="No types for this client yet. An admin can add them with Types."
              />
              <PickSelect
                label="Product Category"
                placeholder="Select category"
                value={form.category}
                onChange={(name) => setForm(prev => ({ ...prev, category: name }))}
                options={categoryOptions}
                disabled={!form.typeId}
                emptyHint="No categories for this type yet. An admin can add them with Types."
              />
            </div>

            {/* Column 3: who leads it, model and cost */}
            <div className="space-y-3">
              <Field label="Lead / Manager">
                <NativeSelect value={form.leadEngineer} onChange={e => setForm({ ...form, leadEngineer: e.target.value })}>
                  <option value="">Assign lead</option>
                  {allUsers.map((u: any) => <option key={u.id} value={String(u.id)}>{u.username}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Model / Version">
                <input className={inp} placeholder="e.g. v2.1.0" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
              </Field>
              <Field label="Est. Unit Cost">
                <CurrencyInput value={form.unitCost} onChange={(v) => setForm({ ...form, unitCost: v })} />
              </Field>
            </div>

            <div className="md:col-span-3">
              <p id="product-status-label" className="mb-2 block text-[13px] font-medium" style={{ color: 'var(--shell-text)' }}>Production Status</p>
              <SegmentedControl
                wrap
                labelledBy="product-status-label"
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={['R&D', 'Prototype', 'Assembly', 'Quality', 'Market Ready'].map((opt) => ({ value: opt, label: opt }))}
              />
            </div>
            <div className="md:col-span-3">
              <Field label="Description">
                <textarea className={`${inp} h-auto resize-none py-2`} rows={3} placeholder="Describe the manufacturing process..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>
          </div>
        </ModuleModal>
      ))}

      <ManageTypesDialog
        kind="product"
        isOpen={manageOpen}
        onClose={() => setManageOpen(false)}
        clients={clients || []}
        types={allTypes}
        categories={categories || []}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Product"
        message="Are you sure you want to permanently delete this product? This action cannot be undone."
        confirmLabel="Yes, Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </ModuleShell>
  );
}
