'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { X, PlusCircle, Save, Send } from 'lucide-react';
import { toast } from 'sonner';

// ─── Shared Styles ─────────────────────────────────────────────────────────────
const inp = 'w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg';
const sel = 'w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg';

// ─── Field ─────────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">{label}</Label>
      {children}
    </div>
  );
}

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[860px] w-[95vw] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="h-[52px] px-5 bg-juniper text-white flex flex-row items-center justify-between shrink-0 border-none space-y-0">
          <div className="flex items-center gap-2.5">
            <span className="text-white/80">{editing ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}</span>
            <DialogTitle className="text-[12px] font-bold uppercase tracking-[0.15em] leading-none">
              {editing ? 'Edit Project' : 'Add New Project'}
            </DialogTitle>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </DialogHeader>

        {/* Body */}
        <div className="pt-3 px-6 pb-4 max-h-[82vh] overflow-y-auto custom-scrollbar flex-1">
          <div className="grid grid-cols-2 gap-x-6">

            {/* LEFT — Project Name, Client, Project Type */}
            <div className="space-y-3">
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
                <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">Project Type *</Label>
                <Select value={form.type_id} onValueChange={(v) => set('type_id', v)}>
                  <SelectTrigger className={sel}><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {projectTypes.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => { setShowNewType(!showNewType); setNewTypeName(''); }}
                  className="flex items-center gap-1.5 text-[9px] font-bold text-juniper hover:underline mt-1"
                >
                  <PlusCircle className="w-3 h-3" /> {showNewType ? 'CANCEL' : 'CREATE NEW TYPE'}
                </button>
                {showNewType && (
                  <div className="mt-1 flex gap-2">
                    <Input
                      className="h-8 text-[12px] bg-white border-casper/40 rounded-lg flex-1"
                      placeholder="e.g. Infrastructure"
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
                    />
                    <Button type="button" onClick={handleAddType}
                      className="h-8 px-3 bg-juniper hover:brightness-110 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest">
                      Add
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — Lead/Manager, Project Category, Budget, Dates */}
            <div className="space-y-3">
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
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[12px] font-semibold">$</span>
                  <Input className={`${inp} pl-7`} type="number" placeholder="0.00" value={form.budget} onChange={(e) => set('budget', e.target.value)} />
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date">
                  <Input className={inp} type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
                </Field>
                <Field label="End Date">
                  <Input className={inp} type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
                </Field>
              </div>
            </div>
          </div>

          {/* Status & Description */}
          <div className="space-y-3 mt-4">
            <div>
              <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em] block mb-2">Project Status</Label>
              <div className="flex p-1 bg-slate-100 rounded-xl h-10 border border-slate-200/50">
                {[
                  { val: 'Active',    cls: 'text-emerald-600' },
                  { val: 'Proposed',  cls: 'text-slate-500' },
                  { val: 'On-Hold',   cls: 'text-amber-600' },
                  { val: 'Completed', cls: 'text-blue-600' },
                  { val: 'Canceled',  cls: 'text-rose-500' },
                ].map(({ val, cls }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set('status', val)}
                    className={`flex-1 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all duration-200 ${
                      form.status === val
                        ? `bg-white ${cls} shadow border border-slate-100`
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Description">
              <Textarea
                className="w-full text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg resize-none min-h-[72px]"
                placeholder="Detailed scope of work and milestones..."
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="bg-mystic/20 border-t border-casper/30 px-6 py-3 flex flex-row items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose}
            className="bg-white border-casper text-juniper font-bold text-[10px] uppercase tracking-widest hover:bg-casper/10 h-9 px-5">
            Cancel
          </Button>
          <Button onClick={handleSubmit}
            className="bg-juniper hover:brightness-110 text-white font-bold text-[10px] uppercase tracking-widest h-9 px-6 flex items-center gap-2">
            {editing ? <><Save className="w-3.5 h-3.5" /> Save Changes</> : <><Send className="w-3.5 h-3.5" /> Create Project</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
