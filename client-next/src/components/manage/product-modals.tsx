'use client';

import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Plus, Pencil } from 'lucide-react';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect, SegmentedControl, inp } from '@/components/shared/modal-primitives';
import { TypeCategoryFields } from '@/components/shared/type-category-fields';
import type { TypeCategory } from '@/hooks/use-queries';
import { PRODUCT_STATUSES } from '@/app/(protected)/business/products/columns';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (form: any) => void;
  editing: any | null;
  clients: any[];
  productTypes: any[];
  users: any[];
  categories: TypeCategory[];
}

const EMPTY = { name: '', client_id: '', type_id: '', lead: '', category: '', start_date: '', end_date: '', status: 'R&D', description: '' };

// Add or change a product: what it is and who it is for on the left, who leads it and when on the right
export function ProductModal({ isOpen, onClose, onSave, editing, clients, productTypes, users, categories }: ProductModalProps) {
  const [form, setForm] = useState(EMPTY);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name || '',
        client_id: String(editing.client_id || ''),
        type_id: String(editing.type_id || ''),
        lead: String(editing.lead_id || ''),
        category: editing.category || '',
        start_date: editing.start_date ? String(editing.start_date).split('T')[0] : '',
        end_date: editing.end_date ? String(editing.end_date).split('T')[0] : '',
        status: editing.status || 'R&D',
        description: editing.description || '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing, isOpen]);

  const [touched, setTouched] = useState(false);
  useEffect(() => { if (isOpen) setTouched(false); }, [isOpen]);
  const dateBad = !!form.start_date && !!form.end_date && form.end_date < form.start_date;
  const hint = (v: string) => (v ? new Date(v + 'T00:00:00').toLocaleDateString('en-GB') : undefined);
  // Only people who can be given work: active users, A to Z
  const leads = [...users].filter((u: any) => (u.user_status || 'ACTIVE') === 'ACTIVE').sort((a: any, b: any) => String(a.username).localeCompare(String(b.username)));

  const handleSubmit = () => {
    setTouched(true);
    if (!form.name.trim() || !form.client_id || !form.type_id || dateBad) return;
    onSave({
      name: form.name, description: form.description,
      client_id: Number(form.client_id), type_id: Number(form.type_id),
      lead_id: Number(form.lead) || null, category: form.category || null, status: form.status,
      start_date: form.start_date || null, end_date: form.end_date || null,
    });
  };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Product' : 'Add Product'}
      icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      onSave={handleSubmit}
      canSave={!!form.name.trim() && !!form.client_id && !!form.type_id && !dateBad}
      saveLabel={editing ? 'Save product' : 'Add product'}
      size="lg"
    >
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Product Name" required error={touched && !form.name.trim() ? 'Enter a product name.' : undefined}>
            <Input className={inp} placeholder="e.g. Heavy-Duty Industrial Robot" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Client" required error={touched && !form.client_id ? 'Choose a client.' : undefined}>
            <NativeSelect value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
              <option value="">Select client</option>
              {clients.filter((c) => c.is_active || String(c.id) === form.client_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <TypeCategoryFields
            typeLabel="Product Type"
            categoryLabel="Product Category"
            typeRequired
            types={productTypes}
            categories={categories}
            typeId={form.type_id}
            category={form.category}
            categoryBy="name"
            onChange={(v) => setForm((p) => ({ ...p, type_id: v.typeId, category: v.category }))}
            typeEmptyHint="No types yet. An admin can add them with Types."
            categoryEmptyHint="No categories for this type yet. An admin can add them with Types."
          />
          {touched && !form.type_id && <p role="alert" className="text-[12px] text-[var(--danger)]">Choose a product type.</p>}
        </div>

        <div className="space-y-3">
          <Field label="Product Lead">
            <NativeSelect value={form.lead} onChange={(e) => set('lead', e.target.value)}>
              <option value="">Assign lead</option>
              {leads.map((u: any) => <option key={u.id} value={String(u.id)}>{u.username}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Start Date" hint={hint(form.start_date)}>
            <Input className={inp} type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </Field>
          <Field label="End Date" hint={hint(form.end_date)} error={dateBad ? 'The end date is before the start date.' : undefined}>
            <Input className={inp} type="date" min={form.start_date || undefined} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </Field>
        </div>

        <div className="md:col-span-2">
          <p id="product-status-label" className="mb-2 block text-[13px] font-medium text-[var(--shell-text)]">Production Status</p>
          <SegmentedControl
            wrap
            labelledBy="product-status-label"
            value={form.status}
            onChange={(v) => set('status', v)}
            options={[...PRODUCT_STATUSES, ...(form.status && !PRODUCT_STATUSES.includes(form.status) ? [form.status] : [])].map((opt) => ({ value: opt, label: opt }))}
          />
        </div>
        <div className="md:col-span-2">
          <Field label="Description">
            <Textarea
              className="min-h-[72px] w-full resize-none rounded-md border border-input bg-transparent text-sm text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus-visible:border-[var(--shell-accent)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]"
              placeholder="Optional notes"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
        </div>
      </div>
    </ModuleModal>
  );
}
