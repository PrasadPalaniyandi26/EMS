'use client';

import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useClients, useProducts, useProductTypes, useUsers, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { CURRENCY_SYMBOL } from '@/lib/currency';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Plus, PlusCircle, Pencil, Trash2,
  Package,
} from 'lucide-react';
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
  category: string; status: string;
}
const defaultForm = (): ProductForm => ({
  name: '', description: '', typeId: '', clientId: '',
  model: '', leadEngineer: '', unitCost: '', category: '', status: 'R&D',
});


// ─── Page ─────────────────────────────────────────────────────────────────────


export default function ProductsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currencySymbol = CURRENCY_SYMBOL[user?.currency || 'INR'] || '₹';
  const { data: clients } = useClients();
  const { data: usersData } = useUsers();
  const allUsers = Array.isArray(usersData) ? usersData : [];
  const invalidate = useInvalidate();

  const { data: products, isLoading } = useProducts();
  const { data: types } = useProductTypes();
  const allTypes = types || [];

  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState<ProductForm>(defaultForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

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

  // ── Add type ──
  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const res = await api.post('/product-types', { name: newTypeName.trim() });
      invalidate('productTypes');
      setForm(prev => ({ ...prev, typeId: String((res.data as any).id) }));
      setNewTypeName('');
      setShowNewType(false);
    } catch { toast.error('Failed to create type'); }
  };

  // ── Add ──
  const openAdd = () => { setForm(defaultForm()); setEditingId(null); setShowNewType(false); setNewTypeName(''); setAddOpen(true); };

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
    });
    setEditingId(selectedProduct.id);
    setShowNewType(false);
    setNewTypeName('');
    setEditOpen(true);
  };

  // ── Save ──
  const handleSave = async (isEdit: boolean) => {
    if (!form.name.trim()) { toast.error('Product name is required'); return; }
    if (!form.clientId) { toast.error('Client is required'); return; }
    if (!form.typeId) { toast.error('Product type is required'); return; }
    try {
      const payload = { name: form.name, description: form.description, client_id: Number(form.clientId) || undefined, type_id: Number(form.typeId), lead_id: Number(form.leadEngineer) || undefined, budget: form.unitCost ? Number(form.unitCost) : undefined, category: form.category || undefined, model: form.model || undefined, status: form.status };
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
          saveLabel={isEdit ? 'Save Changes' : 'Create Product'}
          size="lg"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <div className="space-y-3">
                <Field label="Product Name *">
                  <input className={inp} placeholder="e.g. Heavy-Duty Industrial Robot" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Client *">
                  <NativeSelect value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })}>
                    <option value="">Select Client</option>
                    {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Product Type *">
                  <NativeSelect value={form.typeId} onChange={e => setForm({ ...form, typeId: e.target.value })}>
                    <option value="">Select Type</option>
                    {allTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </NativeSelect>
                  <button
                    type="button"
                    onClick={() => { setShowNewType(!showNewType); setNewTypeName(''); }}
                    className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--info)] hover:underline"
                  >
                    <PlusCircle aria-hidden className="h-3 w-3" /> {showNewType ? 'Cancel' : 'Create new type'}
                  </button>
                  {showNewType && (
                    <div className="mt-1 flex gap-2">
                      <input
                        aria-label="New product type name"
                        className={`${inp} flex-1`}
                        placeholder="e.g. Robotic Assembly"
                        value={newTypeName}
                        onChange={e => setNewTypeName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddType()}
                      />
                      <Button type="button" onClick={handleAddType} className="h-10 px-4 text-[12px] font-semibold">
                        Add
                      </Button>
                    </div>
                  )}
                </Field>
              </div>
              <div className="space-y-3">
                <Field label="Lead / Manager">
                  <NativeSelect value={form.leadEngineer} onChange={e => setForm({ ...form, leadEngineer: e.target.value })}>
                    <option value="">Assign Lead</option>
                    {allUsers.map((u: any) => <option key={u.id} value={String(u.id)}>{u.username}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Production Category">
                  <NativeSelect value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    <option value="">Select Category</option>
                    <option value="Mechanical">Mechanical Assembly</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Software">Software</option>
                    <option value="Hybrid">Hybrid System</option>
                  </NativeSelect>
                </Field>
                <Field label="Model / Version">
                  <input className={inp} placeholder="e.g. v2.1.0" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
                </Field>
                <Field label="Est. Unit Cost">
                  <CurrencyInput value={form.unitCost} onChange={(v) => setForm({ ...form, unitCost: v })} />
                </Field>
              </div>
            </div>
            <div>
              <p id="product-status-label" className="mb-1 text-xs font-semibold" style={{ color: 'var(--shell-text-muted)' }}>Production Status</p>
              <SegmentedControl
                wrap
                labelledBy="product-status-label"
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={['R&D', 'Prototype', 'Assembly', 'Quality', 'Market Ready'].map((opt) => ({ value: opt, label: opt }))}
              />
            </div>
            <Field label="Description">
              <textarea className={`${inp} h-auto resize-none py-2`} rows={3} placeholder="Describe the manufacturing process..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
        </ModuleModal>
      ))}

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
