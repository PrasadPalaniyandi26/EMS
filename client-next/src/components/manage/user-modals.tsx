'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  X, Shield, Search, PlusCircle, Save, Trash2, Send, Eye, EyeOff, Check, Plus,
  RefreshCw, Star, History, ShieldCheck, Lock,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useClients, useProjects, useProducts, useProjectTypes, useProductTypes } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { COUNTRY_LIST } from './client-modals';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generatePassword(firstName: string, lastName: string): string {
  const specials = ['!', '@', '#', '$', '%', '&', '*'];
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const special = specials[Math.floor(Math.random() * specials.length)];
  const fi = (firstName?.[0] || 'U').toUpperCase();
  const li = (lastName?.[0] || 'X').toUpperCase();
  return `${fi}${li}${digits}${special}`;
}

function getEmployeeId(userId?: number): string {
  if (!userId) return 'Auto-assigned';
  return `NT${10000 + userId}`;
}

const ROLE_COLORS: Record<string, { dot: string; label: string }> = {
  admin:    { dot: 'bg-red-500',     label: 'bg-red-100 text-red-700 border-red-200' },
  finance:  { dot: 'bg-emerald-500', label: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  manager:  { dot: 'bg-orange-500',  label: 'bg-orange-100 text-orange-700 border-orange-200' },
  employee: { dot: 'bg-blue-500',    label: 'bg-blue-100 text-blue-600 border-blue-200' },
};

function roleColor(name?: string) {
  return ROLE_COLORS[(name || '').toLowerCase()] || { dot: 'bg-slate-400', label: 'bg-slate-100 text-slate-600 border-slate-200' };
}

// ─── Standard Modal Wrapper ──────────────────────────────────────────────────

function Modal({
  isOpen, onClose, title, subtitle, children, footer, maxWidth = 'sm:max-w-[860px]',
}: {
  isOpen: boolean; onClose: () => void; title: string; subtitle?: string;
  children: React.ReactNode; footer?: React.ReactNode; maxWidth?: string;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn('p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col', maxWidth)} showCloseButton={false}>
        <DialogHeader className="h-[48px] px-5 bg-juniper text-white flex flex-row items-center justify-between shrink-0 border-none space-y-0">
          <div>
            <DialogTitle className="text-[11px] font-bold uppercase tracking-[0.2em] leading-none">
              {title}
            </DialogTitle>
            {subtitle && <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </DialogHeader>
        <div className="pt-3 px-6 pb-6 max-h-[82vh] overflow-y-auto custom-scrollbar flex-1">
          {children}
        </div>
        {footer && (
          <DialogFooter className="bg-mystic/20 border-t border-casper/30 px-6 py-3 flex flex-row items-center justify-end gap-3 shrink-0">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-juniper">{label}</span>
      <div className="h-[1px] flex-1 bg-slate-100" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">{label}</Label>
      {children}
    </div>
  );
}

// ─── UserModal ───────────────────────────────────────────────────────────────

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (form: any) => void;
  editing: any | null;
  roles: any[];
  managers: any[];
}

export function UserModal({ isOpen, onClose, onSave, editing, roles, managers }: UserModalProps) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', contact_no: '', password: '',
    house_apt: '', address: '', city: '', country: '', postal_code: '',
    reporting_manager_id: '', department: '', clearance_level: 'Level 1',
    joining_date: '', status: 'ACTIVE',
  });
  const [selectedRoles, setSelectedRoles] = useState<{ roleId: number; isDefault: boolean }[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewDeptForm, setShowNewDeptForm] = useState(false);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const toggleRole = (roleId: number) => {
    setSelectedRoles((prev) => {
      const exists = prev.find((r) => r.roleId === roleId);
      if (exists) {
        const next = prev.filter((r) => r.roleId !== roleId);
        if (exists.isDefault && next.length > 0) return next.map((r, i) => ({ ...r, isDefault: i === 0 }));
        return next;
      }
      return [...prev, { roleId, isDefault: prev.length === 0 }];
    });
  };

  const setDefaultRole = (roleId: number) => {
    setSelectedRoles((prev) => prev.map((r) => ({ ...r, isDefault: r.roleId === roleId })));
  };

  useEffect(() => {
    if (editing) {
      const names = (editing.username || '').split(' ');
      setForm({
        first_name: names[0] || '', last_name: names.slice(1).join(' ') || '',
        email: editing.email || '', contact_no: editing.contact_no || '',
        password: '',
        house_apt: (editing as any).house_apt || '',
        address: (editing as any).address || '',
        city: (editing as any).city || '',
        country: (editing as any).country || '',
        postal_code: (editing as any).postal_code || '',
        reporting_manager_id: (editing.manager_id ?? (editing as any).reporting_manager_id)?.toString() || '',
        department: editing.department || '', clearance_level: editing.clearance_level || 'Level 1',
        joining_date: editing.joining_date ? new Date(editing.joining_date).toISOString().split('T')[0] : '',
        status: (() => { const s = (editing as any).user_status || ''; if (s === 'ON_HOLD') return 'On Hold'; if (s === 'INACTIVE') return 'In Active'; return s || (editing.is_active ? 'ACTIVE' : 'In Active'); })(),
      });
      if (editing.roles && editing.roles.length > 0) {
        setSelectedRoles(editing.roles.map((r: any) => ({ roleId: r.role_id, isDefault: r.is_default })));
      } else if (editing.role_id) {
        setSelectedRoles([{ roleId: editing.role_id, isDefault: true }]);
      } else setSelectedRoles([]);
    } else {
      const employeeRole = roles.find((r) => r.role_name?.toLowerCase() === 'employee');
      setForm({
        first_name: '', last_name: '', email: '', contact_no: '', password: '',
        house_apt: '', address: '', city: '', country: '', postal_code: '',
        reporting_manager_id: '', department: '', clearance_level: 'Level 1',
        joining_date: new Date().toISOString().split('T')[0], status: 'ACTIVE',
      });
      setSelectedRoles(employeeRole ? [{ roleId: employeeRole.role_id, isDefault: true }] : []);
    }
    setShowNewDeptForm(false);
  }, [editing, isOpen]);

  const handleGenPassword = () => {
    set('password', generatePassword(form.first_name, form.last_name));
    setShowPassword(true);
  };

  const handleSubmit = () => {
    if (!form.first_name || !form.email) { toast.error('First Name and Email are required.'); return; }
    if (selectedRoles.length === 0) { toast.error('Please assign at least one role.'); return; }
    const defaultRole = selectedRoles.find((r) => r.isDefault) || selectedRoles[0];
    const statusMap: Record<string, { isActive: boolean; user_status: string }> = {
      'ACTIVE':    { isActive: true,  user_status: 'ACTIVE' },
      'On Hold':   { isActive: false, user_status: 'ON_HOLD' },
      'In Active': { isActive: false, user_status: 'INACTIVE' },
    };
    const statusData = statusMap[form.status] || { isActive: true, user_status: 'ACTIVE' };
    onSave({
      ...form,
      username: `${form.first_name} ${form.last_name}`.trim(),
      ...statusData,
      role_id: defaultRole.roleId,
      roles: selectedRoles,
    });
  };

  const defaultRoleName = roles.find((r) => r.role_id === (selectedRoles.find((s) => s.isDefault) || selectedRoles[0])?.roleId)?.role_name;

  return (
    <Modal
      isOpen={isOpen} onClose={onClose}
      title={editing ? 'Edit User Profile' : 'Add New User'}
      subtitle="SYSTEM ADMINISTRATION"
      maxWidth="sm:max-w-[1100px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="bg-white border-casper text-juniper font-bold text-[10px] uppercase tracking-widest hover:bg-casper/10 h-9 px-5">
            Cancel
          </Button>
          <Button className="bg-juniper hover:brightness-110 text-white font-bold text-[10px] uppercase tracking-widest h-9 px-6 flex items-center gap-2" onClick={handleSubmit}>
            {editing ? <><Save className="w-3.5 h-3.5" /> Save Changes</> : <><Send className="w-3.5 h-3.5" /> Add User</>}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Employee ID badge for edit mode */}
        {editing && (
          <div className="flex items-center gap-3 bg-juniper/5 border border-juniper/20 rounded-lg px-4 py-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-juniper">Employee ID</span>
            <span className="font-mono text-[13px] font-black text-juniper">{getEmployeeId(editing.id)}</span>
            <span className={cn('ml-auto px-2 py-0.5 rounded text-[9px] font-black uppercase border', roleColor(editing.role_name).label)}>
              {editing.role_name || 'Staff'}
            </span>
          </div>
        )}

        {/* 3-COLUMN LAYOUT */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-3 items-start">

          {/* COL 1 — Personal & Contact */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-juniper">Personal & Contact</span>
              <div className="h-[1px] flex-1 bg-slate-100" />
            </div>
            <Field label="First Name">
              <Input className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg" placeholder="Jonathan" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
            </Field>
            <Field label="Last Name">
              <Input className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg" placeholder="Doe" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
            </Field>
            <Field label="Email Address">
              <Input className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg" type="email" placeholder="j.doe@company.com" value={form.email} readOnly={!!editing} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Contact No">
              <Input className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg" placeholder="+91 98765 43210" value={form.contact_no} onChange={(e) => set('contact_no', e.target.value)} />
            </Field>
            <Field label={editing ? 'New Password' : 'Password *'}>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg pr-8" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={(e) => set('password', e.target.value)} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-juniper transition-colors">
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button type="button" onClick={handleGenPassword} title="Auto-generate password" className="h-8 px-2 bg-juniper/10 border border-juniper/30 rounded-lg text-juniper hover:bg-juniper/20 transition-colors shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </Field>
            {/* Status segmented */}
            <div className="space-y-1 pt-1">
              <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">Status</Label>
              <div className="flex p-1 bg-[#FAF9F6] border border-casper/50 rounded-lg gap-1">
                {(['ACTIVE', 'On Hold', 'In Active']).map((s) => (
                  <button key={s} onClick={() => set('status', s)}
                    className={cn('flex-1 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider rounded-md transition-all', form.status === s ? 'bg-juniper text-white shadow-sm' : 'text-casper hover:text-charcoal')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* COL 2 — Employment & Access */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-juniper">Employment & Access</span>
              <div className="h-[1px] flex-1 bg-slate-100" />
            </div>
            <Field label="Reporting Manager">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 z-10 pointer-events-none" />
                <Select value={form.reporting_manager_id} onValueChange={(v) => set('reporting_manager_id', v)}>
                  <SelectTrigger className="w-full pl-8 h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg">
                    <SelectValue placeholder="Search manager..." />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => <SelectItem key={m.id} value={m.id.toString()}>{m.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </Field>
            <Field label="Joining Date">
              <Input className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg" type="date" value={form.joining_date} onChange={(e) => set('joining_date', e.target.value)} />
            </Field>
            <div className="space-y-1">
              <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">Department</Label>
              <Select value={form.department} onValueChange={(v) => set('department', v)}>
                <SelectTrigger className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg">
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  {['Engineering', 'Finance', 'Operations', 'Human Resource', 'Logistics', 'Sales'].map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => setShowNewDeptForm(!showNewDeptForm)} className="flex items-center gap-1.5 text-[9px] font-bold text-juniper hover:underline mt-1">
                <PlusCircle className="w-3 h-3" /> CREATE NEW DEPARTMENT
              </button>
              {showNewDeptForm && (
                <div className="mt-2 p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-2">
                  <Input className="h-8 text-[12px] border-casper/30 bg-white rounded" placeholder="Department name" />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">Roles Assigned</Label>
              <div className="border border-casper/40 rounded-lg bg-white overflow-hidden divide-y divide-casper/20">
                {roles.map((r) => {
                  const isChecked = selectedRoles.some((s) => s.roleId === r.role_id);
                  const isDefault = selectedRoles.find((s) => s.roleId === r.role_id)?.isDefault ?? false;
                  const rc = roleColor(r.role_name);
                  return (
                    <div key={r.role_id} className={cn('flex items-center px-3 py-2 transition-colors', isChecked ? 'bg-slate-50' : 'hover:bg-slate-50/50')}>
                      <div onClick={() => toggleRole(r.role_id)} className={cn('w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all cursor-pointer shrink-0 mr-2.5', isChecked ? 'bg-juniper border-juniper' : 'border-casper/60')}>
                        {isChecked && <Check className="w-2 h-2 text-white" />}
                      </div>
                      <div className={cn('w-2 h-2 rounded-full shrink-0 mr-2', rc.dot)} />
                      <span onClick={() => toggleRole(r.role_id)} className={cn('text-[11px] font-bold uppercase tracking-wide select-none flex-1 cursor-pointer', isChecked ? 'text-charcoal' : 'text-slate-400')}>
                        {r.role_name}
                      </span>
                      {isChecked && (
                        <button type="button" onClick={() => setDefaultRole(r.role_id)} className="ml-2 transition-colors">
                          <Star className={cn('w-3 h-3', isDefault ? 'fill-amber-400 text-amber-400' : 'text-casper hover:text-amber-300')} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {defaultRoleName && (
                <p className="text-[9px] text-slate-400 pt-0.5">
                  <span className="text-juniper font-bold">{defaultRoleName}</span> is the default active role <span className="text-amber-400">★</span>
                </p>
              )}
            </div>
          </div>

          {/* COL 3 — Address */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-juniper">Address</span>
              <div className="h-[1px] flex-1 bg-slate-100" />
            </div>
            <Field label="Street">
              <Input className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg" placeholder="123 Main Street" value={form.house_apt} onChange={(e) => set('house_apt', e.target.value)} />
            </Field>
            <Field label="Address (optional)">
              <Input className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg" placeholder="Apt / Suite / Building" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <Field label="City">
              <Input className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg" placeholder="Mumbai" value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="Country">
              <Select value={form.country} onValueChange={(v) => set('country', v)}>
                <SelectTrigger className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {COUNTRY_LIST.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Postal Code">
              <Input className="w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg" placeholder="400001" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── AllocationModal ─────────────────────────────────────────────────────────

export function AllocationModal({ isOpen, onClose, user }: { isOpen: boolean; onClose: () => void; user: any }) {
  const { data: clients } = useClients();
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [form, setForm] = useState({ client_id: '', category: 'Project', type_id: '', code: '' });
  const setF = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const clientId = form.client_id ? Number(form.client_id) : undefined;
  const typeId = form.type_id ? Number(form.type_id) : undefined;

  const { data: projectTypes } = useProjectTypes(clientId);
  const { data: productTypes } = useProductTypes(clientId);
  const { data: projects } = useProjects(clientId);
  const { data: products } = useProducts(clientId);

  // Type options based on category — real types from API
  const typeOptions = form.category === 'Project'
    ? (projectTypes || [])
    : (productTypes || []);

  // Code options: filter by selected type_id
  const codeOptions = form.category === 'Project'
    ? (projects || []).filter((p: any) => !typeId || p.type_id === typeId).map((p: any) => ({ id: p.id, label: p.code || p.name, name: p.name }))
    : (products || []).filter((p: any) => !typeId || p.type_id === typeId).map((p: any) => ({ id: p.id, label: p.code || p.name, name: p.name }));

  const fetchAllocations = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/users/${user.id}/allocations`);
      setAllocations(res.data as any[]);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => {
    if (isOpen && user?.id) fetchAllocations();
  }, [isOpen, user]);

  // When category changes, reset type and code
  useEffect(() => {
    setF('type_id', '');
    setF('code', '');
  }, [form.category]);

  // When client or type changes, reset code
  useEffect(() => { setF('code', ''); }, [form.client_id, form.type_id]);

  const handleAddAllocation = async () => {
    if (!form.client_id) { toast.error('Please select a client.'); return; }
    if (!form.code) { toast.error('Please select a project/product code.'); return; }
    setSaving(true);
    try {
      await api.post(`/users/${user.id}/allocations`, {
        client_id: Number(form.client_id),
        category: form.category,
        type: typeOptions.find((t: any) => String(t.id) === form.type_id)?.name || form.category,
        code: form.code,
      });
      toast.success('Allocation added.');
      await fetchAllocations();
      setF('code', '');
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Failed to add allocation.';
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const handleRemove = async () => {
    if (selected.size === 0) { toast.error('Select allocations to remove.'); return; }
    setSaving(true);
    try {
      await Promise.all([...selected].map((id) => api.delete(`/users/allocations/${id}`)));
      toast.success(`${selected.size} allocation(s) removed.`);
      setSelected(new Set());
      await fetchAllocations();
    } catch { toast.error('Failed to remove allocations.'); } finally { setSaving(false); }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col" showCloseButton={false}>
        {/* Header — Add Client theme */}
        <DialogHeader className="h-[52px] px-5 bg-juniper text-white flex flex-row items-center justify-between shrink-0 border-none space-y-0">
          <div>
            <DialogTitle className="text-[12px] font-bold uppercase tracking-[0.2em] leading-none">
              Resource Allocation — {user?.username || ''}
            </DialogTitle>
            <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mt-0.5">EMPLOYMENT TRACKING</p>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="pt-4 px-6 pb-4 max-h-[82vh] overflow-y-auto custom-scrollbar flex-1 space-y-4">
          {/* Add form — 4 equal-width fields in one row, no section box */}
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">Client</Label>
              <Select value={form.client_id} onValueChange={(v) => setF('client_id', v)}>
                <SelectTrigger className="h-9 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper rounded-lg w-full">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {(clients as any[] || []).map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">Category</Label>
              <Select value={form.category} onValueChange={(v) => setF('category', v)}>
                <SelectTrigger className="h-9 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper rounded-lg w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Project">Project</SelectItem>
                  <SelectItem value="Product">Product</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">Type</Label>
              <Select value={form.type_id} onValueChange={(v) => setF('type_id', v)} disabled={typeOptions.length === 0}>
                <SelectTrigger className="h-9 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper rounded-lg w-full">
                  <SelectValue placeholder={!form.client_id ? 'Select client first' : typeOptions.length === 0 ? 'No types available' : 'Select type'} />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">{form.category} Code</Label>
              <Select value={form.code} onValueChange={(v) => setF('code', v)} disabled={codeOptions.length === 0}>
                <SelectTrigger className="h-9 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper rounded-lg w-full">
                  <SelectValue placeholder={codeOptions.length === 0 ? 'Select type first' : 'Select code'} />
                </SelectTrigger>
                <SelectContent>
                  {codeOptions.map((o: any) => <SelectItem key={o.id} value={o.label}>{o.label} — {o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button className="bg-juniper hover:brightness-110 text-white font-bold text-[10px] uppercase h-8 px-4 rounded-lg flex items-center gap-1.5 shadow-md shadow-juniper/10" onClick={handleAddAllocation} disabled={saving}>
                <Plus className="w-3.5 h-3.5" /> Add Allocation
              </Button>
              <Button variant="outline" className="border-rose-200 text-rose-500 hover:bg-rose-50 font-bold text-[10px] uppercase h-8 px-4 rounded-lg flex items-center gap-1.5" onClick={handleRemove} disabled={saving || selected.size === 0}>
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </Button>
            </div>
            <span className="text-[9px] font-bold text-juniper uppercase tracking-widest">{allocations.length} Allocation{allocations.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Table */}
          <div className="border border-casper/30 rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-juniper text-white">
                <tr className="text-[9px] font-black uppercase tracking-widest">
                  <th className="w-10 px-4 py-3 text-center">
                    <input type="checkbox" className="size-3.5 rounded border-white/50" onChange={(e) => setSelected(e.target.checked ? new Set(allocations.map((a) => a.id)) : new Set())} checked={selected.size === allocations.length && allocations.length > 0} />
                  </th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-casper/20 text-[12px]">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-300 italic">Loading...</td></tr>
                ) : allocations.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-300 italic font-medium">No allocations yet.</td></tr>
                ) : allocations.map((a) => (
                  <tr key={a.id} className={cn('hover:bg-slate-50/50 transition-colors', selected.has(a.id) ? 'bg-juniper/5' : '')}>
                    <td className="px-4 py-3 text-center">
                      <input type="checkbox" className="size-3.5 rounded border-slate-300" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} />
                    </td>
                    <td className="px-4 py-3 font-bold text-charcoal">{a.client_name}</td>
                    <td className="px-4 py-3 text-slate-500">{a.category}</td>
                    <td className="px-4 py-3 text-slate-500">{a.type}</td>
                    <td className="px-4 py-3 font-mono text-juniper font-bold">{a.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="bg-mystic/20 border-t border-casper/30 px-6 py-3 flex flex-row items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="bg-white border-casper text-juniper font-bold text-[10px] uppercase tracking-widest hover:bg-casper/10 h-9 px-5">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── PermissionsModal ─────────────────────────────────────────────────────────

const MODULES = [
  { name: 'Dashboard & Analytics', category: 'Core' },
  { name: 'Expense Management', category: 'Finance' },
  { name: 'Income Tracking', category: 'Finance' },
  { name: 'Budgets & Forecasts', category: 'Finance' },
  { name: 'Client Database', category: 'Operations' },
  { name: 'Projects & Milestones', category: 'Operations' },
  { name: 'Products & BOM', category: 'Operations' },
  { name: 'Approvals & Workflow', category: 'Governance' },
  { name: 'Organization & Users', category: 'Governance' },
  { name: 'Reports & Audit', category: 'Governance' },
];

const PERMISSIONS = ['View', 'Create', 'Edit', 'Delete', 'Approve'];

const DEFAULT_PERMS: Record<string, boolean[]> = {
  'Dashboard & Analytics':    [true,  false, false, false, false],
  'Expense Management':       [true,  true,  true,  false, false],
  'Income Tracking':          [true,  true,  true,  false, false],
  'Budgets & Forecasts':      [true,  false, false, false, false],
  'Client Database':          [true,  false, false, false, false],
  'Projects & Milestones':    [true,  false, false, false, false],
  'Products & BOM':           [true,  false, false, false, false],
  'Approvals & Workflow':     [true,  false, false, false, false],
  'Organization & Users':     [false, false, false, false, false],
  'Reports & Audit':          [false, false, false, false, false],
};

type PermMap = Record<string, boolean[]>;

const ROLE_TEMPLATES: Record<string, PermMap> = {
  Employee: DEFAULT_PERMS,
  Manager: Object.fromEntries(MODULES.map((m) => [m.name, [true, true, true, false, true]])),
  Finance: Object.fromEntries(MODULES.map((m) => [m.name, m.category === 'Finance' ? [true, true, true, true, true] : [true, false, false, false, false]])),
  Admin: Object.fromEntries(MODULES.map((m) => [m.name, [true, true, true, true, true]])),
};

const CATEGORY_COLORS: Record<string, string> = {
  Core: 'text-juniper', Finance: 'text-emerald-600', Operations: 'text-blue-600', Governance: 'text-amber-600',
};

export function PermissionsModal({ isOpen, onClose, user }: { isOpen: boolean; onClose: () => void; user: any }) {
  const [perms, setPerms] = useState<PermMap>(() => JSON.parse(JSON.stringify(DEFAULT_PERMS)));
  const [template, setTemplate] = useState('Employee');
  const [thresholds, setThresholds] = useState({ single: '10000', monthly: '50000' });
  const [scope, setScope] = useState('Department');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && user?.id) {
      setPerms(JSON.parse(JSON.stringify(DEFAULT_PERMS)));
      setTemplate('Employee');
      // Load existing permissions
      api.get(`/users/${user.id}/permissions`).then((res) => {
        const d = res.data as any;
        if (d && d.permissions && Object.keys(d.permissions).length > 0) {
          setPerms(d.permissions);
          setTemplate('Custom');
          setThresholds({
            single: String(d.single_limit || 10000),
            monthly: String(d.monthly_limit || 50000),
          });
          setScope(d.data_scope || 'Department');
        }
      }).catch(() => {});
    }
  }, [isOpen, user]);

  const applyTemplate = (name: string) => {
    setTemplate(name);
    setPerms(JSON.parse(JSON.stringify(ROLE_TEMPLATES[name] || DEFAULT_PERMS)));
  };

  const togglePerm = (module: string, idx: number) => {
    setPerms((prev) => {
      const updated = [...(prev[module] || [false, false, false, false, false])];
      updated[idx] = !updated[idx];
      return { ...prev, [module]: updated };
    });
  };

  const toggleAllModule = (module: string) => {
    const current = perms[module] || [];
    const allOn = current.every(Boolean);
    setPerms((prev) => ({ ...prev, [module]: PERMISSIONS.map(() => !allOn) }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await api.put(`/users/${user.id}/permissions`, {
        permissions: perms,
        single_limit: Number(thresholds.single.replace(/,/g, '')) || 10000,
        monthly_limit: Number(thresholds.monthly.replace(/,/g, '')) || 50000,
        data_scope: scope,
      });
      toast.success('Permissions saved. Audit log entry created.');
      onClose();
    } catch {
      toast.error('Failed to save permissions.');
    } finally {
      setSaving(false);
    }
  };

  const categories = [...new Set(MODULES.map((m) => m.category))];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Permissions — ${user?.username || ''}`} subtitle="ACCESS POLICY CONFIGURATION" maxWidth="sm:max-w-[1100px]"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-juniper text-[10px] font-bold italic">
            <ShieldCheck className="w-3.5 h-3.5" />
            Audit log entry will be created on save.
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="bg-white border-casper text-juniper font-bold text-[10px] uppercase tracking-widest h-9 px-5">Discard</Button>
            <Button className="bg-juniper hover:brightness-110 text-white font-bold text-[10px] uppercase tracking-widest h-9 px-6 flex items-center gap-2" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Permissions'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex gap-6">
        {/* Left: Matrix */}
        <div className="flex-1 min-w-0">
          {/* Role template selector */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Apply Template:</span>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(ROLE_TEMPLATES).map((t) => {
                const c = roleColor(t);
                return (
                  <button key={t} onClick={() => applyTemplate(t)}
                    className={cn('px-3 py-1 rounded-lg text-[10px] font-black uppercase border transition-all', template === t ? `${c.label} shadow-sm` : 'bg-white text-slate-400 border-slate-200 hover:border-casper')}
                  >
                    <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle', c.dot)} />
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permission matrix grouped by category */}
          <div className="border border-casper/30 rounded-xl overflow-hidden shadow-sm bg-white">
            <table className="w-full text-left border-collapse table-fixed">
              <thead className="bg-[#F8FAFB] border-b border-casper/20">
                <tr className="text-[9px] font-black text-juniper uppercase tracking-widest">
                  <th className="px-4 py-3 w-[220px]">Module</th>
                  {PERMISSIONS.map((p) => <th key={p} className="py-3 text-center w-[60px]">{p}</th>)}
                  <th className="py-3 text-center w-[50px]">All</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <>
                    <tr key={`cat-${cat}`} className="bg-slate-50/70">
                      <td colSpan={7} className={cn('px-4 py-1.5 text-[9px] font-black uppercase tracking-widest', CATEGORY_COLORS[cat] || 'text-slate-400')}>
                        {cat}
                      </td>
                    </tr>
                    {MODULES.filter((m) => m.category === cat).map((mod) => {
                      const modPerms = perms[mod.name] || [false, false, false, false, false];
                      const allOn = modPerms.every(Boolean);
                      return (
                        <tr key={mod.name} className="hover:bg-slate-50/50 transition-colors border-t border-slate-50 group">
                          <td className="px-4 py-2.5 text-[11px] font-bold text-charcoal group-hover:text-juniper transition-colors">{mod.name}</td>
                          {modPerms.map((on, i) => (
                            <td key={i} className="py-2.5 text-center">
                              <div onClick={() => togglePerm(mod.name, i)}
                                className={cn('w-4 h-4 mx-auto rounded border-2 flex items-center justify-center cursor-pointer transition-all', on ? 'bg-juniper border-juniper' : 'border-slate-200 bg-white hover:border-juniper/40')}
                              >
                                {on && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                            </td>
                          ))}
                          <td className="py-2.5 text-center">
                            <div onClick={() => toggleAllModule(mod.name)}
                              className={cn('w-4 h-4 mx-auto rounded border-2 flex items-center justify-center cursor-pointer transition-all', allOn ? 'bg-amber-400 border-amber-400' : 'border-slate-200 bg-white hover:border-amber-300')}
                            >
                              {allOn && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Config panel */}
        <div className="w-[220px] shrink-0 space-y-4">
          {/* Approval Thresholds */}
          <div className="border border-casper/30 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="bg-[#F8FAFB] px-4 py-2.5 border-b border-casper/20">
              <span className="text-[9px] font-black uppercase tracking-widest text-juniper">Approval Limits</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-[9px] font-bold text-slate-400 uppercase">Single Transaction</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-juniper text-[11px] font-bold">₹</span>
                  <Input className="pl-6 h-8 text-[12px] border-casper/30 bg-stone-50 rounded-lg" value={thresholds.single} onChange={(e) => setThresholds((p) => ({ ...p, single: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[9px] font-bold text-slate-400 uppercase">Monthly Ceiling</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-juniper text-[11px] font-bold">₹</span>
                  <Input className="pl-6 h-8 text-[12px] border-casper/30 bg-stone-50 rounded-lg" value={thresholds.monthly} onChange={(e) => setThresholds((p) => ({ ...p, monthly: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* Data Scope */}
          <div className="border border-casper/30 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="bg-[#F8FAFB] px-4 py-2.5 border-b border-casper/20">
              <span className="text-[9px] font-black uppercase tracking-widest text-juniper">Data Visibility</span>
            </div>
            <div className="p-3 space-y-2">
              {['Own Records', 'Department', 'Global'].map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={cn('w-full text-left px-3 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2',
                    scope === s ? 'bg-juniper text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100')}
                >
                  <div className={cn('w-2 h-2 rounded-full shrink-0', scope === s ? 'bg-white' : 'bg-slate-300')} />
                  {s}
                </button>
              ))}
              <p className="text-[9px] text-slate-400 font-bold leading-relaxed pt-1 italic">
                {scope === 'Own Records' && 'User sees only their own transactions and records.'}
                {scope === 'Department' && 'Access limited to their department branch.'}
                {scope === 'Global' && 'Full access across all departments and records.'}
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="border border-casper/30 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="bg-[#F8FAFB] px-4 py-2.5 border-b border-casper/20">
              <span className="text-[9px] font-black uppercase tracking-widest text-juniper">Summary</span>
            </div>
            <div className="p-4 space-y-2">
              {PERMISSIONS.map((p, i) => {
                const count = MODULES.filter((m) => perms[m.name]?.[i]).length;
                const pct = Math.round((count / MODULES.length) * 100);
                return (
                  <div key={p}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">{p}</span>
                      <span className="text-[9px] font-black text-juniper">{count}/{MODULES.length}</span>
                    </div>
                    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-juniper rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
