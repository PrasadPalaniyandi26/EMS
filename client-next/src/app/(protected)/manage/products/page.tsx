'use client';

import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useClients, useProducts, useProductTypes, useUsers, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { CURRENCY_SYMBOL } from '@/lib/currency';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Plus, PlusCircle, Pencil, Trash2, X, ListTree, CalendarClock,
  Package, Search, ChevronDown, ArrowUpRight,
  CircleDollarSign, Layers,
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
  useReactTable,
  getFacetedRowModel,
  getFacetedUniqueValues,
} from "@tanstack/react-table";
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { CurrencyInput } from '@/components/shared/modal-primitives';

// ─── Style tokens ─────────────────────────────────────────────────────────────
const LABEL = 'block text-[10px] font-bold text-[var(--shell-text-muted)] normal-case tracking-normal mb-1';
const INPUT = 'w-full bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg h-10 px-3 text-[13px] text-[var(--shell-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50 placeholder:text-[var(--shell-text-muted)]';
const SELECT_CLS = 'w-full bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg h-10 px-3 text-[13px] text-[var(--shell-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50 appearance-none pr-8';
const TEXTAREA = 'w-full bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--shell-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50 placeholder:text-[var(--shell-text-muted)] resize-none';

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

interface BomItem { id: number; code: string; name: string; qty: number; unit: string; unitCost: number; }
const MOCK_BOM: BomItem[] = [
  { id: 1, code: 'CMP-001', name: 'Servo Motor 24V', qty: 4, unit: 'PCS', unitCost: 210.00 },
  { id: 2, code: 'CMP-002', name: 'Control Board PCB', qty: 1, unit: 'PCS', unitCost: 540.00 },
  { id: 3, code: 'CMP-003', name: 'Aluminium Frame Section', qty: 6, unit: 'MTR', unitCost: 85.50 },
  { id: 4, code: 'CMP-004', name: 'Pneumatic Actuator', qty: 2, unit: 'PCS', unitCost: 320.00 },
];

interface ScheduleForm {
  productId: string; clientId: string; bomVersion: string; batchQty: string;
  productionLine: string; leadSupervisor: string; startDate: string; endDate: string;
  priority: 'Standard' | 'Urgent' | 'Critical';
  checkMaterial: boolean; checkEquipment: boolean; checkQC: boolean;
}
const defaultSchedule = (): ScheduleForm => ({
  productId: '', clientId: '', bomVersion: 'v1.0.0', batchQty: '1',
  productionLine: '', leadSupervisor: '', startDate: '', endDate: '',
  priority: 'Standard', checkMaterial: false, checkEquipment: false, checkQC: false,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ModalHeader({ icon, title, onClose }: { icon: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="h-[52px] bg-[var(--shell-surface)] flex items-center justify-between px-5 shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="text-[var(--shell-text-muted)]">{icon}</span>
        <h2 className="text-black dark:text-white text-[12px] font-bold tracking-[0.15em] uppercase">{title}</h2>
      </div>
      <button onClick={onClose} className="text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function SegmentedControl({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex p-1 bg-[var(--shell-hover)] border border-[var(--shell-border)] rounded-xl gap-1">
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
            value === opt ? 'bg-[var(--shell-surface)] text-white border border-[var(--shell-border)] shadow-sm' : 'text-[var(--shell-text-muted)] hover:text-[var(--shell-text-muted)]'
          }`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function SelectField({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`${SELECT_CLS} ${className || ''}`} {...props}>{children}</select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-casper pointer-events-none" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────


export default function ProductsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);
  const currencySymbol = CURRENCY_SYMBOL[user?.currency || 'INR'] || '₹';
  const { data: clients } = useClients();
  const { data: usersData } = useUsers();
  const allUsers = Array.isArray(usersData) ? usersData : [];
  const invalidate = useInvalidate();

  const { data: products } = useProducts();
  const { data: types } = useProductTypes();
  const allTypes = types || [];

  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [bomOpen, setBomOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState<ProductForm>(defaultForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [bomItems, setBomItems] = useState<BomItem[]>(MOCK_BOM);
  const [bomSearch, setBomSearch] = useState('');
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(defaultSchedule());

  useEffect(() => { setHeader('Products', 'Product Catalog & Manufacturing Hub'); }, [setHeader]);

  const table = useReactTable<Product>({
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

  // ── BOM ──
  const openBOM = () => {
    if (!selectedProduct) { toast.error('Select one product to manage BOM'); return; }
    setBomItems(MOCK_BOM); setBomSearch(''); setBomOpen(true);
  };

  // ── Schedule ──
  const openSchedule = () => {
    setScheduleForm({ ...defaultSchedule(), productId: selectedProduct ? String(selectedProduct.id) : '' });
    setScheduleOpen(true);
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

  const bomTotal = bomItems.reduce((sum, i) => sum + i.qty * i.unitCost, 0);

  return (
    <ModuleShell
      showPanel={!!selectedProduct}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={
            <>
              <button className="btn-action" onClick={openAdd}>
                <Plus className="h-4 w-4 text-green-600" /> Add
              </button>
              <button className="btn-action" disabled={selectedRows.length !== 1} onClick={openEdit}>
                <Pencil className="h-4 w-4 text-blue-500" /> Edit
              </button>
              <button className="btn-action" disabled={selectedRows.length !== 1} onClick={openBOM}>
                <ListTree className="h-4 w-4 text-teal-600" /> BOM
              </button>
              <button className="btn-action" onClick={openSchedule}>
                <CalendarClock className="h-4 w-4 text-violet-600" /> Schedule
              </button>
              <button className="btn-action" disabled={selectedRows.length === 0} onClick={() => setDeleteId(selectedRows[0].original.id)}>
                <Trash2 className="h-4 w-4 text-rose-500" /> Delete
              </button>
            </>
          }
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title="Product Intelligence"
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedProduct}
          >
            {selectedProduct && (<>
            {/* Identity card */}
            <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-[15px] text-black dark:text-white leading-tight">{selectedProduct.name}</h4>
                  <p className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest mt-0.5">
                    {selectedProduct.code || `PRD-${String(selectedProduct.id).padStart(3, '0')}`}
                  </p>
                </div>
                <span className="p-2 bg-[var(--shell-hover)] rounded-lg text-[var(--shell-text-muted)]">
                  <Package className="h-5 w-5" />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-[var(--shell-hover)] rounded-lg border border-[var(--shell-border)]">
                  <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-1">Type</p>
                  <p className="text-sm font-black text-[var(--shell-text-muted)] truncate">{selectedProduct.type_name || '—'}</p>
                </div>
                <div className="p-3 bg-[var(--shell-hover)] rounded-lg border border-[var(--shell-border)]">
                  <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase mb-1">Client</p>
                  <p className="text-sm font-black text-[var(--shell-accent)] truncate">{selectedProduct.client_name || '—'}</p>
                </div>
              </div>
              {selectedProduct.description && (
                <p className="text-[11px] text-[var(--shell-text-muted)] leading-relaxed border-t border-[var(--shell-border)] pt-3">{selectedProduct.description}</p>
              )}
            </div>

            {/* Production metrics */}
            <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-4 space-y-2.5">
              <h4 className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-[var(--shell-text-muted)]" /> Production Metrics
              </h4>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1.5 uppercase tracking-wider">
                    <span className="text-[var(--shell-text-muted)]">Quality Score</span>
                    <span className="text-emerald-500">94%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--shell-hover)] rounded-full overflow-hidden">
                    <div className="w-[94%] h-full bg-[var(--shell-accent)] rounded-full" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1.5 uppercase tracking-wider">
                    <span className="text-[var(--shell-text-muted)]">Production Efficiency</span>
                    <span className="text-[var(--shell-accent)]">78%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--shell-hover)] rounded-full overflow-hidden">
                    <div className="w-[78%] h-full bg-[var(--shell-accent)] rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* Production lifecycle */}
            <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[var(--shell-text-muted)]" /> Lifecycle Stage
                </h4>
              </div>
              <div className="flex items-center gap-1">
                {['R&D', 'Proto', 'Assembly', 'QA', 'Ready'].map((stage, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full h-1.5 rounded-full ${i <= 1 ? 'bg-[var(--shell-accent)]' : 'bg-[var(--shell-hover)]'}`} />
                    <span className="text-[8px] font-bold text-[var(--shell-text-muted)] uppercase tracking-tighter">{stage}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Unit run output trend */}
            <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider">Unit Output Trend</h4>
                <p className="text-[9px] font-bold text-emerald-500 uppercase">+8% Monthly</p>
              </div>
              <div className="h-24 w-full flex items-end justify-between px-1 gap-1">
                {[30, 45, 38, 60, 52, 75, 68].map((h, i) => (
                  <div key={i} style={{ height: `${h}%` }}
                    className={`w-full rounded-t-sm transition-all duration-500 ${i === 5 ? 'bg-[var(--shell-accent)]' : 'bg-[var(--shell-hover)]'}`} />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[8px] font-bold text-[var(--shell-text-muted)] uppercase tracking-tighter">
                <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span>
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-[var(--shell-hover)] rounded-xl border border-[var(--shell-border)] p-4 space-y-3">
              <h4 className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider">Quick Actions</h4>
              <button onClick={openBOM} className="w-full flex items-center justify-between p-3 bg-[var(--shell-hover)] border border-[var(--shell-border)] rounded-lg hover:bg-[var(--shell-hover)] transition-colors group">
                <div className="flex items-center gap-2">
                  <ListTree className="h-4 w-4 text-teal-600" />
                  <span className="text-[11px] font-bold text-[var(--shell-text-muted)]">Manage BOM</span>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-[var(--shell-text-muted)] group-hover:text-[var(--shell-accent)] transition-colors" />
              </button>
              <button onClick={openSchedule} className="w-full flex items-center justify-between p-3 bg-[var(--shell-hover)] border border-[var(--shell-border)] rounded-lg hover:bg-[var(--shell-hover)] transition-colors group">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-violet-600" />
                  <span className="text-[11px] font-bold text-[var(--shell-text-muted)]">Schedule Production</span>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-[var(--shell-text-muted)] group-hover:text-[var(--shell-accent)] transition-colors" />
              </button>
            </div>
            </>)}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable columns={columns} data={products || []} tableInstance={table} emptyMessage="No products found. Click Add to create one." />

      {/* ══ ADD / EDIT PRODUCT (shared layout) ══ */}
      {[
        { open: addOpen, onClose: () => setAddOpen(false), isEdit: false },
        { open: editOpen, onClose: () => setEditOpen(false), isEdit: true },
      ].map(({ open, onClose, isEdit }) => (
        <Dialog key={isEdit ? 'edit' : 'add'} open={open} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-[860px] w-[95vw] p-0 overflow-hidden border-none shadow-2xl flex flex-col bg-[var(--shell-surface)] rounded-xl" showCloseButton={false}>
            <ModalHeader
              icon={isEdit ? <Pencil className="h-4 w-4" /> : <Package className="h-4 w-4" />}
              title={isEdit ? 'Edit Product' : 'Add New Product'}
              onClose={onClose}
            />
            <div className="pt-2 px-4 pb-3 max-h-[82vh] overflow-y-auto custom-scrollbar flex-1 space-y-2.5">
              <div className="grid grid-cols-2 gap-x-4">
                {/* LEFT — Product Name, Client, Product Type */}
                <div className="space-y-3">
                  <div><label className={LABEL}>Product Name *</label>
                    <input className={INPUT} placeholder="e.g. Heavy-Duty Industrial Robot" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                  <div><label className={LABEL}>Client *</label>
                    <SelectField value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })}>
                      <option value="">Select Client</option>
                      {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </SelectField></div>
                  <div>
                    <label className={LABEL}>Product Type *</label>
                    <SelectField value={form.typeId} onChange={e => setForm({ ...form, typeId: e.target.value })}>
                      <option value="">Select Type</option>
                      {allTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </SelectField>
                    <button
                      type="button"
                      onClick={() => { setShowNewType(!showNewType); setNewTypeName(''); }}
                      className="flex items-center gap-1.5 text-[9px] font-bold text-indigo-600 hover:underline mt-1"
                    >
                      <PlusCircle className="w-3 h-3" /> {showNewType ? 'CANCEL' : 'CREATE NEW TYPE'}
                    </button>
                    {showNewType && (
                      <div className="mt-1 flex gap-2">
                        <input
                          className="h-8 text-[12px] rounded-lg flex-1 px-3 focus:outline-none focus:ring-1" style={{ background: 'var(--shell-surface)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)', border: '1px solid var(--shell-border)' }}
                          placeholder="e.g. Robotic Assembly"
                          value={newTypeName}
                          onChange={e => setNewTypeName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddType()}
                        />
                        <button
                          type="button"
                          onClick={handleAddType}
                          className="h-8 px-3 bg-[var(--shell-accent)] hover:bg-indigo-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {/* RIGHT — Lead/Manager, Production Category, Model/Version, Est Unit Cost */}
                <div className="space-y-3">
                  <div><label className={LABEL}>Lead / Manager</label>
                    <SelectField value={form.leadEngineer} onChange={e => setForm({ ...form, leadEngineer: e.target.value })}>
                      <option value="">Assign Lead</option>
                      {allUsers.map((u: any) => <option key={u.id} value={String(u.id)}>{u.username}</option>)}
                    </SelectField></div>
                  <div><label className={LABEL}>Production Category</label>
                    <SelectField value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                      <option value="">Select Category</option>
                      <option value="Mechanical">Mechanical Assembly</option>
                      <option value="Electronics">Electronics</option>
                      <option value="Software">Software</option>
                      <option value="Hybrid">Hybrid System</option>
                    </SelectField></div>
                  <div><label className={LABEL}>Model / Version</label>
                    <input className={INPUT} placeholder="e.g. v2.1.0" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></div>
                  <div><label className={LABEL}>Est. Unit Cost</label>
                    <CurrencyInput value={form.unitCost} onChange={(v) => setForm({ ...form, unitCost: v })} />
                  </div>
                </div>
              </div>
              <div>
                <label className={LABEL}>Production Status</label>
                <SegmentedControl options={['R&D', 'Prototype', 'Assembly', 'Quality', 'Market Ready']} value={form.status} onChange={v => setForm({ ...form, status: v })} />
              </div>
              <div>
                <label className={LABEL}>Description</label>
                <textarea className={`${TEXTAREA} w-full`} rows={3} placeholder="Describe the manufacturing process..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-[var(--shell-border)] bg-[var(--shell-surface)] flex justify-end gap-3 shrink-0">
              <button onClick={onClose} className="h-9 px-5 text-[11px] font-bold uppercase tracking-wider text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] transition-colors">Cancel</button>
              <button onClick={() => handleSave(isEdit)} className="h-9 px-6 bg-[var(--shell-surface)] hover:bg-[#566070] text-white rounded-lg text-[11px] font-bold uppercase tracking-wider border border-[var(--shell-border)] shadow-sm">
                {isEdit ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      ))}

      {/* ══ BOM MODAL ══ */}
      <Dialog open={bomOpen} onOpenChange={setBomOpen}>
        <DialogContent className="sm:max-w-[860px] w-[95vw] p-0 overflow-hidden border-none shadow-2xl flex flex-col rounded-xl bg-[var(--shell-surface)]" showCloseButton={false}>
          <ModalHeader icon={<ListTree className="h-4 w-4" />} title="Bill of Materials" onClose={() => setBomOpen(false)} />
          <div className="pt-3 px-5 pb-4 overflow-y-auto max-h-[82vh] flex-1 space-y-3">
            <div className="grid grid-cols-3 gap-x-5 gap-y-3">
              <div><label className={LABEL}>Assembly Name</label>
                <input className="w-full h-8 text-[12px] bg-[var(--shell-hover)] border border-[var(--shell-border)] rounded-lg px-3 text-[var(--shell-text-muted)] font-medium cursor-not-allowed focus:outline-none" readOnly value={selectedProduct?.name || '—'} /></div>
              <div><label className={LABEL}>BOM Version</label>
                <input className="w-full h-8 text-[12px] bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg px-3 text-[var(--shell-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50" placeholder="e.g. v1.0.0" defaultValue="v1.0.0" /></div>
              <div><label className={LABEL}>Effective Date</label>
                <input className="w-full h-8 text-[12px] bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg px-3 text-[var(--shell-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50" type="date" /></div>
            </div>
            <div><label className={LABEL}>Revision Notes</label>
              <input className="w-full h-8 text-[12px] bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg px-3 text-[var(--shell-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50" placeholder="Optional notes..." /></div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-casper" />
                <input className="w-full pl-8 h-8 bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg text-[12px] text-[var(--shell-text)] focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50 font-medium placeholder:text-[var(--shell-text-muted)]"
                  placeholder="Search components..." value={bomSearch} onChange={e => setBomSearch(e.target.value)} />
              </div>
              <div className="relative">
                <select className="h-8 pl-3 pr-7 bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg text-[12px] font-medium text-[var(--shell-text)] focus:outline-none appearance-none">
                  <option value="">All Categories</option>
                  <option>Mechanical</option><option>Electronics</option><option>Consumables</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-casper pointer-events-none" />
              </div>
              <button className="flex items-center gap-1.5 h-8 px-3 bg-[var(--shell-accent)] hover:bg-indigo-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">
                <PlusCircle className="h-3 w-3" /> Add Component
              </button>
              <button className="flex items-center gap-1.5 h-8 px-3 bg-[var(--shell-hover)] border border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-hover)] rounded-lg text-[10px] font-bold uppercase tracking-wider">
                Import
              </button>
            </div>
            <div className="flex items-center justify-between bg-[var(--shell-hover)] border border-[var(--shell-border)] rounded-lg px-4 py-2">
              <div>
                <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest">Total Items</p>
                <p className="text-lg font-black text-black dark:text-white">{bomItems.length}</p>
              </div>
              <div className="h-6 w-px bg-casper/30" />
              <div className="text-right">
                <p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest">Total BOM Cost</p>
                <p className="text-lg font-black text-[var(--shell-accent)]">{currencySymbol}{bomTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
            <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden">
              <table className="w-full text-[12px] border-collapse">
                <thead className="dialog-header">
                  <tr>
                    <th className="px-3 py-2 text-center text-[9px] font-bold tracking-wider uppercase border-r border-[var(--shell-border)] w-24">Item Code</th>
                    <th className="px-3 py-2 text-left text-[9px] font-bold tracking-wider uppercase border-r border-[var(--shell-border)]">Component Name</th>
                    <th className="px-3 py-2 text-center text-[9px] font-bold tracking-wider uppercase border-r border-[var(--shell-border)] w-20">Qty</th>
                    <th className="px-3 py-2 text-center text-[9px] font-bold tracking-wider uppercase border-r border-[var(--shell-border)] w-16">Unit</th>
                    <th className="px-3 py-2 text-right text-[9px] font-bold tracking-wider uppercase border-r border-[var(--shell-border)] w-28">Unit Cost</th>
                    <th className="px-3 py-2 text-right text-[9px] font-bold tracking-wider uppercase w-28">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-casper/20">
                  {bomItems
                    .filter(i => !bomSearch || i.name.toLowerCase().includes(bomSearch.toLowerCase()) || i.code.toLowerCase().includes(bomSearch.toLowerCase()))
                    .map(item => (
                      <tr key={item.id} className="hover:bg-[var(--shell-hover)]">
                        <td className="px-3 py-2 text-center border-r border-zinc-100">
                          <span className="font-mono font-black text-[11px] text-[var(--shell-accent)]">{item.code}</span></td>
                        <td className="px-3 py-2 font-medium text-[var(--shell-text-muted)] border-r border-zinc-100">{item.name}</td>
                        <td className="px-3 py-2 text-center border-r border-zinc-100">
                          <input className="w-14 h-6 text-center bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded text-[11px] font-bold text-[var(--shell-text)] focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50"
                            type="number" min="0" value={item.qty}
                            onChange={e => setBomItems(prev => prev.map(i => i.id === item.id ? { ...i, qty: Number(e.target.value) } : i))}
                            onKeyDown={(e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }} /></td>
                        <td className="px-3 py-2 text-center border-r border-zinc-100 text-[var(--shell-text-muted)] font-bold text-[10px] uppercase">{item.unit}</td>
                        <td className="px-3 py-2 text-right border-r border-zinc-100 font-medium text-[var(--shell-text-muted)]">{currencySymbol}{item.unitCost.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-bold text-[var(--shell-accent)]">{currencySymbol}{(item.qty * item.unitCost).toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-[var(--shell-border)] bg-[var(--shell-surface)] flex justify-end gap-3 shrink-0">
            <button onClick={() => setBomOpen(false)} className="h-9 px-5 text-[11px] font-bold uppercase tracking-wider text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] transition-colors">Close</button>
            <button onClick={() => { toast.success('BOM saved'); setBomOpen(false); }}
              className="h-9 px-6 bg-[var(--shell-accent)] hover:bg-indigo-600 text-white rounded-lg text-[11px] font-bold uppercase tracking-wider shadow-sm">Save BOM</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ SCHEDULE PRODUCTION ══ */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-[860px] w-[95vw] p-0 overflow-hidden border-none shadow-2xl flex flex-col rounded-xl bg-[var(--shell-surface)]" showCloseButton={false}>
          <ModalHeader icon={<CalendarClock className="h-4 w-4" />} title="Schedule Production Run" onClose={() => setScheduleOpen(false)} />
          <div className="pt-3 px-5 pb-4 overflow-y-auto max-h-[82vh] flex-1 space-y-3">
            <div className="grid grid-cols-3 gap-x-5 gap-y-3">
              <div><label className={LABEL}>Product Name</label>
                <div className="relative">
                  <input className="w-full h-8 text-[12px] bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg px-3 pr-8 text-[var(--shell-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50 placeholder:text-[var(--shell-text-muted)]" placeholder="Search products..."
                    value={scheduleForm.productId ? ((products || []).find(p => String(p.id) === scheduleForm.productId)?.name || scheduleForm.productId) : ''}
                    onChange={e => setScheduleForm({ ...scheduleForm, productId: e.target.value })} />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-casper" />
                </div></div>
              <div><label className={LABEL}>Client</label>
                <SelectField value={scheduleForm.clientId} onChange={e => setScheduleForm({ ...scheduleForm, clientId: e.target.value })}
                  className="!h-8 !text-[12px]">
                  <option value="">Select Client</option>
                  {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField></div>
              <div><label className={LABEL}>BOM Version</label>
                <SelectField value={scheduleForm.bomVersion} onChange={e => setScheduleForm({ ...scheduleForm, bomVersion: e.target.value })}
                  className="!h-8 !text-[12px]">
                  <option value="v1.0.0">v1.0.0 (Current Stable)</option>
                  <option value="v0.9.0">v0.9.0 (Legacy)</option>
                </SelectField></div>
              <div><label className={LABEL}>Batch Quantity</label>
                <input className="w-full h-8 text-[12px] bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg px-3 text-[var(--shell-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50" type="number" min="1" value={scheduleForm.batchQty} onChange={e => setScheduleForm({ ...scheduleForm, batchQty: e.target.value })} onKeyDown={(e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }} /></div>
              <div><label className={LABEL}>Production Line</label>
                <SelectField value={scheduleForm.productionLine} onChange={e => setScheduleForm({ ...scheduleForm, productionLine: e.target.value })}
                  className="!h-8 !text-[12px]">
                  <option value="">Select Line</option>
                  <option value="A">Line A — Assembly North</option>
                  <option value="B">Line B — Assembly South</option>
                </SelectField></div>
              <div><label className={LABEL}>Lead Supervisor</label>
                <SelectField value={scheduleForm.leadSupervisor} onChange={e => setScheduleForm({ ...scheduleForm, leadSupervisor: e.target.value })}
                  className="!h-8 !text-[12px]">
                  <option value="">Assign Supervisor</option>
                  {allUsers.map((u: any) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
                </SelectField></div>
              <div><label className={LABEL}>Start Date</label>
                <input className="w-full h-8 text-[12px] bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg px-3 text-[var(--shell-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50" type="date" value={scheduleForm.startDate} onChange={e => setScheduleForm({ ...scheduleForm, startDate: e.target.value })} /></div>
              <div><label className={LABEL}>Target Completion</label>
                <input className="w-full h-8 text-[12px] bg-[var(--shell-surface)] border border-[var(--shell-border)] rounded-lg px-3 text-[var(--shell-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--shell-accent)]/50" type="date" value={scheduleForm.endDate} onChange={e => setScheduleForm({ ...scheduleForm, endDate: e.target.value })} /></div>
            </div>
            <div><label className={LABEL}>Run Priority</label>
              <SegmentedControl options={['Standard', 'Urgent', 'Critical']} value={scheduleForm.priority} onChange={v => setScheduleForm({ ...scheduleForm, priority: v as any })} /></div>
            <div className="flex items-center justify-between bg-[var(--shell-hover)] border border-[var(--shell-border)] rounded-lg px-4 py-2">
              <div><p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest">Material Readiness</p><p className="text-base font-black text-black dark:text-white">—</p></div>
              <div className="h-6 w-px bg-casper/30" />
              <div><p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest">Estimated Labor</p><p className="text-base font-black text-black dark:text-white">—</p></div>
              <div className="h-6 w-px bg-casper/30" />
              <div className="text-right"><p className="text-[9px] font-bold text-[var(--shell-text-muted)] uppercase tracking-widest">Projected Run Cost</p><p className="text-base font-black text-[var(--shell-accent)]">—</p></div>
            </div>
            <div><label className={LABEL}>Pre-Run Checklist</label>
              <div className="space-y-1.5">
                {([['checkMaterial', 'Material Staging Verified'], ['checkEquipment', 'Equipment Calibration Complete'], ['checkQC', 'QC Personnel Assigned']] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3 px-3 py-2 bg-[var(--shell-hover)] border border-[var(--shell-border)] rounded-lg">
                    <Checkbox id={key} checked={scheduleForm[key]}
                      onCheckedChange={v => setScheduleForm({ ...scheduleForm, [key]: !!v })}
                      className="border-[var(--shell-border)] data-[state=checked]:bg-[var(--shell-accent)] data-[state=checked]:text-white" />
                    <label htmlFor={key} className="text-[11px] font-medium text-[var(--shell-text-muted)] cursor-pointer select-none">{label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-[var(--shell-border)] bg-[var(--shell-surface)] flex justify-end gap-3 shrink-0">
            <button onClick={() => setScheduleOpen(false)} className="h-9 px-5 text-[11px] font-bold uppercase tracking-wider text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] transition-colors">Cancel</button>
            <button onClick={() => { toast.success('Production run scheduled'); setScheduleOpen(false); }}
              className="flex items-center gap-2 h-9 px-6 bg-[var(--shell-accent)] hover:bg-indigo-600 text-white rounded-lg text-[11px] font-bold uppercase tracking-wider shadow-sm">
              <CalendarClock className="h-3.5 w-3.5" /> Initiate Run
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ DELETE CONFIRM ══ */}
      {deleteId && (
        <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-[var(--shell-border)] shadow-2xl flex flex-col bg-[var(--shell-surface)]" showCloseButton={false}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--shell-border)] bg-[var(--shell-surface)]">
              <h3 className="text-sm font-black text-rose-600 uppercase tracking-widest">Destructive Action</h3>
            </div>
            <p className="text-xs text-[var(--shell-text-muted)] p-4">
              Are you sure you want to permanently delete this product? This action cannot be undone.
            </p>
            <div className="flex items-center gap-3 mt-2 p-4 pt-0">
              <Button variant="outline" className="flex-1 text-[11px] font-bold border-[var(--shell-border)] text-[var(--shell-text-muted)]" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1 text-[11px] font-bold" onClick={handleDelete}>Yes, Delete</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ModuleShell>
  );
}
