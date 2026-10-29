'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, AutoLabel, CurrencyInput } from '@/components/shared/modal-primitives';

// ─── Shared Styles ─────────────────────────────────────────────────────────────
const inp = 'w-full h-10 text-sm border-input bg-transparent text-[var(--shell-text)] rounded-lg';
const sel = 'w-full h-10 text-sm border-input bg-transparent text-[var(--shell-text)] rounded-lg';

// ─── Field ─────────────────────────────────────────────────────────────────────
// ─── Props ─────────────────────────────────────────────────────────────────────
interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (form: any) => void;
  editing: any | null;
  clients: any[];
  projectTypes: any[];
  users: any[];
  onSaveType: (form: any) => Promise<any>;
}

// ─── ProjectModal ──────────────────────────────────────────────────────────────
export function ProjectModal({
  isOpen, onClose, onSave, editing, clients, projectTypes, users, onSaveType,
}: ProjectModalProps) {
  const [form, setForm] = useState({
    name: '', client_id: '', type_id: '',
    lead: '', category: '', budget: '', start_date: '', end_date: '',
    status: 'Active', description: '',
  });
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

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
      setForm({ name: '', client_id: '', type_id: '', lead: '', category: '', budget: '', start_date: '', end_date: '', status: 'Active', description: '' });
    }
    setShowNewType(false);
    setNewTypeName('');
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

  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const created = await onSaveType({ name: newTypeName.trim(), client_id: Number(form.client_id) || undefined });
      if (created?.id) set('type_id', String(created.id));
      setNewTypeName('');
      setShowNewType(false);
    } catch {
      // error handled in parent
    }
  };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Project' : 'Add New Project'}
      icon={editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={handleSubmit}
      saveLabel={editing ? 'Save Changes' : 'Create Project'}
      size="lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">

        {/* LEFT column: name / client / type */}
        <div className="space-y-2.5">

          <Field label="Project Name *">
            <Input className={inp} placeholder="e.g. Phoenix Infrastructure Overhaul" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>

          <Field label="Client *">
            <Select value={form.client_id} onValueChange={(v) => set('client_id', v)}>
              <SelectTrigger className={sel}><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <div className="space-y-1">
            <AutoLabel className="text-xs font-bold text-[var(--shell-text)] normal-case tracking-normal">Project Type *</AutoLabel>
            <Select value={form.type_id} onValueChange={(v) => set('type_id', v)}>
              <SelectTrigger className={sel}><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {projectTypes.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => { setShowNewType(!showNewType); setNewTypeName(''); }}
              className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--shell-accent)] hover:underline mt-1"
            >
              <PlusCircle className="w-3 h-3" /> {showNewType ? 'Cancel' : 'Create new type'}
            </button>
            {showNewType && (
              <div className="mt-1 flex gap-2">
                <Input
                  className="h-10 text-sm border-input bg-transparent text-[var(--shell-text)] border-[var(--shell-border)] text-[var(--shell-text)] rounded-lg flex-1"
                  placeholder="e.g. Infrastructure"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
                />
                <Button type="button" onClick={handleAddType}
                  className="h-10 px-3 btn-action-primary rounded-lg text-[11px] font-bold border border-[var(--shell-border)]">
                  Add
                </Button>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT column: lead / category / budget / dates */}
        <div className="space-y-2.5">

          <Field label="Lead / Manager">
            <Select value={form.lead} onValueChange={(v) => set('lead', v)}>
              <SelectTrigger className={sel}><SelectValue placeholder="Assign lead" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.username || u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Project Category">
            <Select value={form.category} onValueChange={(v) => set('category', v)}>
              <SelectTrigger className={sel}><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {['Enterprise Level', 'Internal Operations', 'R&D Initiatives', 'Client Delivery', 'Infrastructure'].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Estimated Budget">
            <CurrencyInput value={form.budget} onChange={(v) => set('budget', v)} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Start Date">
              <Input className={inp} type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </Field>
            <Field label="End Date">
              <Input className={inp} type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
            </Field>
          </div>

        </div>

        {/* Full-width: status + description */}
        <div className="sm:col-span-2">
          <p id="project-status-label" className="mb-2 block text-[13px] font-medium" style={{ color: "var(--shell-text)" }}>Project Status</p>
          <div role="radiogroup" aria-labelledby="project-status-label" className="flex p-1 rounded-lg border bg-[var(--shell-hover)] rounded-lg gap-1">
            {([
              { val: 'Active',    active: 'text-[var(--success)] border border-[var(--success)]' },
              { val: 'Proposed',  active: 'text-[var(--shell-text)] border border-[var(--shell-border)]' },
              { val: 'On-Hold',   active: 'text-[var(--warning)] border border-[var(--warning)]' },
              { val: 'Completed', active: 'text-[var(--info)] border border-[var(--info)]' },
              { val: 'Canceled',  active: 'text-[var(--danger)] border border-[var(--danger)]' },
            ]).map(({ val, active }) => (
              <button
                key={val}
                type="button" role="radio" aria-checked={form.status === val}
                onClick={() => set('status', val)}
                className={`flex-1 py-1.5 text-center text-[11px] font-bold rounded-md transition-all ${
                  form.status === val ? active : 'text-[var(--shell-text-muted)] border border-transparent hover:text-[var(--shell-text)]'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <Field label="Description">
            <Textarea
              className="w-full text-sm border-input bg-transparent text-[var(--shell-text)] border-[var(--shell-border)] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--info)] rounded-lg resize-none min-h-[72px]"
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
