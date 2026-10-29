'use client';

import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect, CurrencyInput, SegmentedControl, inp } from '@/components/shared/modal-primitives';
import { TypeCategoryFields } from '@/components/shared/type-category-fields';
import type { TypeCategory } from '@/hooks/use-queries';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (form: any) => void;
  editing: any | null;
  clients: any[];
  projectTypes: any[];
  users: any[];
  categories: TypeCategory[];
}

const EMPTY = {
  name: '', client_id: '', type_id: '',
  lead: '', category: '', budget: '', start_date: '', end_date: '',
  status: 'Active', description: '',
};

export function ProjectModal({
  isOpen, onClose, onSave, editing, clients, projectTypes, users, categories,
}: ProjectModalProps) {
  const [form, setForm] = useState(EMPTY);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name || '',
        client_id: String(editing.client_id || ''),
        type_id: String(editing.type_id || ''),
        lead: String(editing.lead_id || editing.lead || ''),
        category: editing.category || '',
        budget: editing.budget || '',
        start_date: editing.start_date ? String(editing.start_date).split('T')[0] : '',
        end_date: editing.end_date ? String(editing.end_date).split('T')[0] : '',
        status: editing.status || 'Active',
        description: editing.description || '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing, isOpen]);

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error('Project name is required'); return; }
    if (!form.client_id) { toast.error('Client is required'); return; }
    if (!form.type_id) { toast.error('Project type is required'); return; }
    onSave({
      ...form,
      client_id: Number(form.client_id) || undefined,
      type_id: Number(form.type_id) || undefined,
      lead_id: Number(form.lead) || undefined,
    });
  };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Project' : 'Add New Project'}
      icon={editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={handleSubmit}
      canSave={!!form.name.trim() && !!form.client_id && !!form.type_id}
      saveLabel={editing ? 'Save Changes' : 'Create Project'}
      size="xl"
    >
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 md:grid-cols-3">

        {/* Column 1: the project and its schedule */}
        <div className="space-y-3">
          <Field label="Project Name" required>
            <Input className={inp} placeholder="e.g. Phoenix Infrastructure Overhaul" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Start Date">
            <Input className={inp} type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </Field>
          <Field label="End Date">
            <Input className={inp} type="date" min={form.start_date || undefined} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </Field>
        </div>

        {/* Column 2: classification, top to bottom: client, then its types, then the type's categories */}
        <div className="space-y-3">
          <Field label="Client" required>
            <NativeSelect
              value={form.client_id}
              onChange={(e) => set("client_id", e.target.value)}
            >
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <TypeCategoryFields
            typeLabel="Project Type"
            categoryLabel="Project Category"
            typeRequired
            types={projectTypes}
            categories={categories}
            typeId={form.type_id}
            category={form.category}
            categoryBy="name"
            onChange={(v) => setForm((p) => ({ ...p, type_id: v.typeId, category: v.category }))}
            typeEmptyHint="No types yet. An admin can add them with Types."
            categoryEmptyHint="No categories for this type yet. An admin can add them with Types."
          />
        </div>

        {/* Column 3: who leads it and what it costs */}
        <div className="space-y-3">
          <Field label="Lead / Manager">
            <NativeSelect value={form.lead} onChange={(e) => set('lead', e.target.value)}>
              <option value="">Assign lead</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.username || u.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Estimated Budget">
            <CurrencyInput value={form.budget} onChange={(v) => set('budget', v)} />
          </Field>
        </div>

        <div className="md:col-span-3">
          <p id="project-status-label" className="mb-2 block text-[13px] font-medium" style={{ color: 'var(--shell-text)' }}>Project Status</p>
          <SegmentedControl
            labelledBy="project-status-label"
            value={form.status}
            onChange={(v) => set('status', v)}
            options={[
              { value: 'Active', label: 'Active', tone: 'success' },
              { value: 'Proposed', label: 'Proposed', tone: 'neutral' },
              { value: 'On-Hold', label: 'On-Hold', tone: 'warning' },
              { value: 'Completed', label: 'Completed', tone: 'info' },
              { value: 'Canceled', label: 'Canceled', tone: 'danger' },
            ]}
          />
        </div>

        <div className="md:col-span-3">
          <Field label="Description">
            <Textarea
              className="min-h-[72px] w-full resize-none rounded-md border border-input bg-transparent text-sm text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus-visible:border-[var(--shell-accent)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]"
              placeholder="Detailed scope of work and milestones..."
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
        </div>

      </div>
    </ModuleModal>
  );
}
