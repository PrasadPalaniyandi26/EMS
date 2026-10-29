'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, PlusCircle, Trash2, Eye, EyeOff, Check, Plus, Pencil,
  RefreshCw, Star, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toLocalYMD } from '@/lib/currency';
import { getRoleStyle } from '@/lib/roles';
import { toast } from 'sonner';
import { useClients, useProjects, useProducts, useProjectTypes, useProductTypes } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { COUNTRY_LIST } from './client-modals';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, AutoLabel, EmailInput, PhoneInput, CurrencyInput, isValidEmail, isValidPhone } from '@/components/shared/modal-primitives';

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

function roleColor(name?: string) {
  const s = getRoleStyle(name);
  return { dot: s.dot, label: s.badge };
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[11px] font-black text-[var(--shell-text-muted)]">{label}</span>
      <div className="h-[1px] flex-1" style={{ background: 'var(--shell-border)' }} />
    </div>
  );
}

// ─── Shared input class ───────────────────────────────────────────────────────
const INP = 'w-full h-10 text-sm border-input bg-transparent text-[var(--shell-text)] border-[var(--shell-border)] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--shell-accent)]/50 rounded-lg';

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
    first_name: '', last_name: '', date_of_birth: '', email: '', contact_no: '',
    login_name: '', password: '',
    house_apt: '', address: '', city: '', country: '', postal_code: '',
    reporting_manager_id: '', department: '', clearance_level: 'Level 1',
    joining_date: '', status: 'ACTIVE',
  });
  const [selectedRoles, setSelectedRoles] = useState<{ roleId: number; isDefault: boolean }[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewDeptForm, setShowNewDeptForm] = useState(false);
  const [loginNameManuallyEdited, setLoginNameManuallyEdited] = useState(false);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const deriveLoginName = (firstName: string, lastName: string) =>
    (firstName.toLowerCase().replace(/[^a-z0-9]/g, '') +
     (lastName?.[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '')).trim();

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
      setLoginNameManuallyEdited(true); // in edit mode, always treat as manual
      setForm({
        first_name: names[0] || '', last_name: names.slice(1).join(' ') || '',
        date_of_birth: (editing as any).date_of_birth ? new Date((editing as any).date_of_birth).toISOString().split('T')[0] : '',
        email: editing.email || '', contact_no: editing.contact_no || '',
        login_name: (editing as any).login_name || deriveLoginName(names[0] || '', names.slice(1).join(' ')),
        password: '',
        house_apt: (editing as any).house_apt || '',
        address: (editing as any).address || '',
        city: (editing as any).city || '',
        country: (editing as any).country || '',
        postal_code: (editing as any).postal_code || '',
        reporting_manager_id: (editing.manager_id ?? (editing as any).reporting_manager_id)?.toString() || '',
        department: editing.department || '', clearance_level: editing.clearance_level || 'Level 1',
        joining_date: editing.joining_date ? new Date(editing.joining_date).toISOString().split('T')[0] : '',
        status: (() => { const s = (editing as any).user_status || ''; if (s === 'ON_HOLD') return 'On Hold'; if (s === 'INACTIVE') return 'Inactive'; return s || (editing.is_active ? 'ACTIVE' : 'Inactive'); })(),
      });
      if (editing.roles && editing.roles.length > 0) {
        setSelectedRoles(editing.roles.map((r: any) => ({ roleId: r.role_id, isDefault: r.is_default })));
      } else if (editing.role_id) {
        setSelectedRoles([{ roleId: editing.role_id, isDefault: true }]);
      } else setSelectedRoles([]);
    } else {
      const employeeRole = roles.find((r) => r.role_name?.toLowerCase() === 'employee');
      setLoginNameManuallyEdited(false);
      setForm({
        first_name: '', last_name: '', date_of_birth: '', email: '', contact_no: '',
        login_name: '', password: '',
        house_apt: '', address: '', city: '', country: '', postal_code: '',
        reporting_manager_id: '', department: '', clearance_level: 'Level 1',
        joining_date: toLocalYMD(), status: 'ACTIVE',
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
    if (!isValidEmail(form.email)) { toast.error('Enter a valid email address'); return; }
    if (!isValidPhone(form.contact_no)) { toast.error('Invalid phone number. Include country code e.g. +91 98765 43210'); return; }
    if (!form.login_name) { toast.error('User Name is required.'); return; }
    if (selectedRoles.length === 0) { toast.error('Please assign at least one role.'); return; }
    const defaultRole = selectedRoles.find((r) => r.isDefault) || selectedRoles[0];
    const statusMap: Record<string, { isActive: boolean; user_status: string }> = {
      'ACTIVE':    { isActive: true,  user_status: 'ACTIVE' },
      'On Hold':   { isActive: false, user_status: 'ON_HOLD' },
      'Inactive':  { isActive: false, user_status: 'INACTIVE' },
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
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit User Profile' : 'Add New User'}
      icon={editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={handleSubmit}
      saveLabel={editing ? 'Save Changes' : 'Add User'}
      size="xl"
    >
      <div className="space-y-2.5">
        {/* Employee ID badge for edit mode */}
        {editing && (
          <div className="flex items-center gap-3 rounded-lg border bg-[var(--shell-hover)] rounded-lg px-4 py-2">
            <span className="text-[11px] font-black text-[var(--shell-text-muted)]">Employee ID</span>
            <span className="text-[13px] font-black text-[var(--info)]">{getEmployeeId(editing.id)}</span>
            <span className="ml-auto px-2 py-0.5 rounded text-[11px] font-black border border-[var(--shell-border)] text-[var(--shell-text)]">
              {editing.role_name || 'Staff'}
            </span>
          </div>
        )}

        {/* 3-COLUMN LAYOUT */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 items-start">

          {/* COL 1 — Personal & Contact */}
          <div className="space-y-2.5">
            <Field label="First Name">
              <Input className={INP} placeholder="Jonathan" value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
                onBlur={() => {
                  if (!loginNameManuallyEdited && !editing)
                    set('login_name', deriveLoginName(form.first_name, form.last_name));
                }}
              />
            </Field>
            <Field label="Last Name">
              <Input className={INP} placeholder="Doe" value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
                onBlur={(e) => {
                  if (!loginNameManuallyEdited && !editing)
                    set('login_name', deriveLoginName(form.first_name, e.target.value));
                }}
              />
            </Field>
            <Field label="Date of Birth">
              <Input className={INP} type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
            </Field>
            <Field label="Email Address">
              <EmailInput value={form.email} onChange={(v) => set('email', v)} placeholder="j.doe@company.com" readOnly={!!editing} required />
            </Field>
            <Field label="Contact No">
              <PhoneInput value={form.contact_no} onChange={(v) => set('contact_no', v)} placeholder="+91 98765 43210" />
            </Field>
            <Field label="User Name">
              <Input
                className={INP}
                placeholder="Auto-generated"
                value={form.login_name}
                onChange={(e) => {
                  const v = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
                  setLoginNameManuallyEdited(true);
                  set('login_name', v);
                }}
              />
            </Field>
            <Field label={editing ? 'New Password' : 'Password *'}>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input className={INP + ' pr-8'} type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={(e) => set('password', e.target.value)} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] transition-colors">
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button type="button" onClick={handleGenPassword} title="Auto-generate password" className="h-8 px-2 bg-[var(--shell-border)] border border-[var(--shell-border)] rounded-lg text-[var(--shell-text)] hover:bg-[var(--shell-hover)] transition-colors shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </Field>
          </div>

          {/* COL 2 — Employment & Access */}
          <div className="space-y-2.5">
            <div className="space-y-1">
              <AutoLabel className="text-xs font-medium text-[var(--shell-text)] normal-case tracking-normal">Department</AutoLabel>
              <Select value={form.department} onValueChange={(v) => set('department', v)}>
                <SelectTrigger className={INP}>
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  {['Engineering', 'Finance', 'Operations', 'Human Resource', 'Logistics', 'Sales'].map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => setShowNewDeptForm(!showNewDeptForm)} className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] mt-1">
                <PlusCircle className="w-3 h-3" /> Create new department
              </button>
              {showNewDeptForm && (
                <div className="mt-2 p-3 border border-[var(--shell-border)] rounded-lg space-y-2" style={{ background: 'var(--shell-bg)' }}>
                  <Input className={INP} placeholder="Department name" />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <p id="user-roles-label" className="text-[13px] font-medium" style={{ color: "var(--shell-text)" }}>Roles Assigned</p>
              <div role="group" aria-labelledby="user-roles-label" className="border border-[var(--shell-border)] rounded-lg overflow-hidden divide-y" style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)' }}>
                {roles.map((r) => {
                  const isChecked = selectedRoles.some((s) => s.roleId === r.role_id);
                  const isDefault = selectedRoles.find((s) => s.roleId === r.role_id)?.isDefault ?? false;
                  const rc = roleColor(r.role_name);
                  return (
                    <div key={r.role_id} className={cn('flex items-center px-3 py-2 transition-colors', isChecked ? 'rounded-lg border' : 'hover:rounded-lg border')} style={{ borderColor: 'var(--shell-border)' }}>
                      <div onClick={() => toggleRole(r.role_id)} className={cn('w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all cursor-pointer shrink-0 mr-2.5', isChecked ? 'bg-[var(--shell-accent)] border-[var(--shell-accent)]' : 'border-[var(--shell-border)]')}>
                        {isChecked && <Check className="w-2 h-2 text-white" />}
                      </div>
                      <div className={cn('w-2 h-2 rounded-full shrink-0 mr-2', rc.dot)} />
                      <span onClick={() => toggleRole(r.role_id)} className={cn('text-[11px] font-bold select-none flex-1 cursor-pointer', isChecked ? 'text-[var(--shell-text)]' : 'text-[var(--shell-text-muted)]')}>
                        {r.role_name}
                      </span>
                      {isChecked && (
                        <button type="button" onClick={() => setDefaultRole(r.role_id)} className="ml-2 transition-colors">
                          <Star className={cn('w-3 h-3', isDefault ? 'fill-[var(--warning)] text-[var(--warning)]' : 'text-[var(--shell-text-muted)] hover:text-[var(--warning)]')} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {defaultRoleName && (
                <p className="text-[11px] text-[var(--shell-text-muted)] pt-0.5">
                  <span className="text-[var(--shell-accent)] font-bold">{defaultRoleName}</span> is the default active role <span className="text-[var(--warning)]">★</span>
                </p>
              )}
            </div>
            <Field label="Reporting Manager">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--shell-text-muted)] z-10 pointer-events-none" />
                <Select value={form.reporting_manager_id} onValueChange={(v) => set('reporting_manager_id', v)}>
                  <SelectTrigger className={INP + ' pl-8'}>
                    <SelectValue placeholder="Search manager..." />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => <SelectItem key={m.id} value={m.id.toString()}>{m.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </Field>
            <Field label="Joining Date">
              <Input className={INP} type="date" value={form.joining_date} onChange={(e) => set('joining_date', e.target.value)} />
            </Field>
          </div>

          {/* COL 3 — Address */}
          <div className="space-y-2.5">
            <Field label="Street">
              <Input className={INP} placeholder="123 Main Street" value={form.house_apt} onChange={(e) => set('house_apt', e.target.value)} />
            </Field>
            <Field label="Address (optional)">
              <Input className={INP} placeholder="Apt / Suite / Building" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <Field label="City">
              <Input className={INP} placeholder="Mumbai" value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="Country">
              <Select value={form.country} onValueChange={(v) => set('country', v)}>
                <SelectTrigger className={INP}>
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
              <Input className={INP} placeholder="400001" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
            </Field>
            {/* Status segmented */}
            <div className="space-y-1 pt-1">
              <p id="user-status-label" className="text-[13px] font-medium" style={{ color: "var(--shell-text)" }}>Status</p>
              <div role="radiogroup" aria-labelledby="user-status-label" className="flex p-1 rounded-lg border bg-[var(--shell-hover)] rounded-lg gap-1">
                {([
                  { s: 'ACTIVE',   active: 'text-[var(--success)] border border-[var(--success)]' },
                  { s: 'On Hold',  active: 'text-[var(--warning)] border border-[var(--warning)]' },
                  { s: 'Inactive', active: 'text-[var(--danger)] border border-[var(--danger)]' },
                ] as const).map(({ s, active: activeClass }) => (
                  <button key={s} type="button" role="radio" aria-checked={form.status === s} onClick={() => set("status", s)}
                    className={cn('flex-1 py-1.5 text-center text-[11px] font-bold rounded-md transition-all',
                      form.status === s ? activeClass : 'text-[var(--shell-text-muted)] border border-transparent hover:text-[var(--shell-text)]')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModuleModal>
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

  // Only load type/code data once a client is selected
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
    } catch { setAllocations([]); } finally { setLoading(false); }
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
      const msg = err?.message || 'Failed to add allocation.';
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

  const INP2 = 'h-10 text-sm border-input bg-transparent text-[var(--shell-text)] border-[var(--shell-border)] text-[var(--shell-text)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 rounded-lg w-full';

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resource Allocation — ${user?.username || ''}`}
      icon={<Pencil className="w-4 h-4" />}
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose} className="h-8 px-4 text-[11.5px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>Close</Button>
      }
    >
      <div className="space-y-2.5">
        {/* Add form — 4 equal-width fields in one row, no section box */}
        <div className="grid grid-cols-4 gap-2">
          <div className="space-y-1">
            <AutoLabel className="text-xs font-medium text-[var(--shell-text)] normal-case tracking-normal">Client</AutoLabel>
            <Select value={form.client_id} onValueChange={(v) => setF('client_id', v)}>
              <SelectTrigger className={INP2}>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {(clients as any[] || []).map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <AutoLabel className="text-xs font-medium text-[var(--shell-text)] normal-case tracking-normal">Category</AutoLabel>
            <Select value={form.category} onValueChange={(v) => setF('category', v)}>
              <SelectTrigger className={INP2}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Project">Project</SelectItem>
                <SelectItem value="Product">Product</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <AutoLabel className="text-xs font-medium text-[var(--shell-text)] normal-case tracking-normal">Type</AutoLabel>
            <Select value={form.type_id} onValueChange={(v) => setF('type_id', v)} disabled={typeOptions.length === 0}>
              <SelectTrigger className={INP2}>
                <SelectValue placeholder={!form.client_id ? 'Select client first' : typeOptions.length === 0 ? 'No types available' : 'Select type'} />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <AutoLabel className="text-xs font-medium text-[var(--shell-text)] normal-case tracking-normal">{form.category} Code</AutoLabel>
            <Select value={form.code} onValueChange={(v) => setF('code', v)} disabled={codeOptions.length === 0}>
              <SelectTrigger className={INP2}>
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
            <Button className="btn-action-primary border border-[var(--shell-border)] text-[var(--shell-text)] font-bold text-[11px] h-8 px-4 rounded-lg flex items-center gap-1.5" onClick={handleAddAllocation} disabled={saving}>
              <Plus className="w-3.5 h-3.5" /> Add Allocation
            </Button>
            <Button variant="outline" className="border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] font-bold text-[11px] h-8 px-4 rounded-lg flex items-center gap-1.5" onClick={handleRemove} disabled={saving || selected.size === 0}>
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </Button>
          </div>
          <span className="text-[11px] font-bold text-[var(--shell-text-muted)]">{allocations.length} Allocation{allocations.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden" style={{ background: 'var(--shell-surface)' }}>
          <table className="w-full text-left">
            <thead className="dialog-header">
              <tr className="text-[11px] font-black">
                <th className="w-10 px-4 py-3 text-center">
                  <input type="checkbox" className="size-3.5 rounded border-[var(--shell-border)]" onChange={(e) => setSelected(e.target.checked ? new Set(allocations.map((a) => a.id)) : new Set())} checked={selected.size === allocations.length && allocations.length > 0} />
                </th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--shell-border)] text-[12px]">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--shell-text-muted)] italic">Loading...</td></tr>
              ) : allocations.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--shell-text-muted)] italic font-medium">No allocations yet.</td></tr>
              ) : allocations.map((a) => (
                <tr key={a.id} className={cn('transition-colors', selected.has(a.id) ? 'bg-[var(--shell-accent)]/10' : 'hover:rounded-lg border')}>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" className="size-3.5 rounded border-[var(--shell-border)]" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} />
                  </td>
                  <td className="px-4 py-3 font-bold text-[var(--shell-text)]">{a.client_name}</td>
                  <td className="px-4 py-3 text-[var(--shell-text)]">{a.category}</td>
                  <td className="px-4 py-3 text-[var(--shell-text)]">{a.type}</td>
                  <td className="px-4 py-3 text-[var(--info)] font-bold">{a.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ModuleModal>
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

// Mirrors sidebar NAV_GROUPS structure
const MODULE_GROUPS = [
  {
    label: 'MAIN',
    color: 'var(--shell-text)',
    items: ['Dashboard & Analytics'],
  },
  {
    label: 'Transactions',
    color: 'var(--shell-text)',
    items: ['Approvals & Workflow', 'Expense Management', 'Income Tracking'],
  },
  {
    label: 'Operations',
    color: 'var(--shell-text)',
    items: ['Client Database', 'Projects & Milestones', 'Products & BOM'],
  },
  {
    label: 'Manage',
    color: 'var(--shell-text)',
    items: ['Organization & Users', 'Budgets & Forecasts'],
  },
  {
    label: 'Analytics',
    color: 'var(--shell-text)',
    items: ['Reports & Audit'],
  },
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
  Core: 'text-[var(--shell-text)]', Finance: 'text-[var(--success)]', Operations: 'text-[var(--info)]', Governance: 'text-[var(--warning)]',
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

  const INP3 = 'pl-6 h-10 text-sm border-input bg-transparent text-[var(--shell-text)] border-[var(--shell-border)] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] rounded-lg';

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Permissions — ${user?.username || ''}`}
      icon={<ShieldCheck className="w-4 h-4" />}
      onSave={handleSave}
      saveLabel={saving ? 'Saving...' : 'Save Permissions'}
      size="xl"
      footerLeft={
        <div className="flex items-center gap-2 text-[var(--shell-text-muted)] text-[11px] font-bold italic">
          <ShieldCheck className="w-3.5 h-3.5" />
          Audit log entry will be created on save.
        </div>
      }
    >
      <div className="flex gap-6">
        {/* Left: Matrix */}
        <div className="flex-1 min-w-0">
          {/* Role template selector */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--shell-border)]">
            <span className="text-[11px] font-black text-[var(--shell-text-muted)] shrink-0">Apply Template:</span>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(ROLE_TEMPLATES).map((t) => {
                const c = roleColor(t);
                return (
                  <button key={t} onClick={() => applyTemplate(t)}
                    className={cn('px-3 py-1 rounded-lg text-[11px] font-black border transition-all', template === t ? 'border-input bg-transparent text-[var(--shell-text)] border-[var(--shell-border)] text-[var(--shell-text)]' : 'text-[var(--shell-text-muted)] border-[var(--shell-border)] hover:text-[var(--shell-text)]')}
                    style={template !== t ? { background: 'var(--shell-bg)' } : {}}
                  >
                    <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle', c.dot)} />
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permission matrix — sidebar-mirrored tree view */}
          <div className="overflow-x-auto rounded-lg">
          <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden min-w-[480px]" style={{ background: 'var(--shell-surface)' }}>
            {/* Column header */}
            <div className="dialog-header flex items-center text-[11px] font-black">
              <div className="flex-1 px-4 py-3">Module</div>
              {PERMISSIONS.map((p) => (
                <div key={p} className="w-[70px] py-3 text-center shrink-0">{p}</div>
              ))}
              <div className="w-[56px] py-3 text-center shrink-0">All</div>
            </div>

            {MODULE_GROUPS.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? 'border-t border-[var(--shell-border)]' : ''}>
                {/* Group label */}
                <div className="px-4 py-1.5 flex items-center gap-2" style={{ background: 'var(--shell-hover)' }}>
                  <span className="text-[11px] font-black" style={{ color: 'var(--shell-text)' }}>
                    {group.label}
                  </span>
                  <div className="h-px flex-1" style={{ background: 'var(--shell-border)' }} />
                </div>

                {/* Module rows */}
                {group.items.map((modName) => {
                  const modPerms = perms[modName] || [false, false, false, false, false];
                  const allOn = modPerms.every(Boolean);
                  return (
                    <div key={modName} className="flex items-center hover:rounded-lg border transition-colors border-t border-[var(--shell-border)] group">
                      <div className="flex-1 flex items-center gap-2 pl-7 pr-4 py-2.5 min-w-0">
                        <div className="w-px h-3 shrink-0" style={{ background: 'var(--shell-border)' }} />
                        <div className="w-3 h-px shrink-0" style={{ background: 'var(--shell-border)' }} />
                        <span className="text-[11px] font-semibold text-[var(--shell-text)] truncate">
                          {modName}
                        </span>
                      </div>
                      {modPerms.map((on, i) => (
                        <div key={i} className="w-[70px] py-2.5 flex items-center justify-center shrink-0">
                          <div
                            onClick={() => togglePerm(modName, i)}
                            className={cn('w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all',
                              on ? 'bg-[var(--shell-accent)] border-[var(--shell-accent)]' : 'border-[var(--shell-border)] hover:border-[var(--shell-accent)]/50')}
                            style={!on ? { background: 'var(--shell-bg)' } : {}}
                          >
                            {on && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                        </div>
                      ))}
                      <div className="w-[56px] py-2.5 flex items-center justify-center shrink-0">
                        <div
                          onClick={() => toggleAllModule(modName)}
                          className={cn('w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all',
                            allOn ? 'bg-[var(--warning)] border-[var(--warning)]' : 'border-[var(--shell-border)] hover:border-[color-mix(in_srgb,var(--warning)_50%,transparent)]')}
                          style={!allOn ? { background: 'var(--shell-bg)' } : {}}
                        >
                          {allOn && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          </div>
        </div>

        {/* Right: Config panel */}
        <div className="w-[220px] shrink-0 space-y-2.5">
          {/* Approval Thresholds */}
          <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden" style={{ background: 'var(--shell-surface)' }}>
            <div className="dialog-header px-4 py-2.5">
              <span className="text-[11px] font-black">Approval Limits</span>
            </div>
            <div className="p-4 space-y-2.5">
              <div className="space-y-1">
                <AutoLabel className="text-xs font-medium text-[var(--shell-text)]">Single Transaction</AutoLabel>
                <CurrencyInput value={thresholds.single} onChange={(v) => setThresholds((p) => ({ ...p, single: v }))} className={INP3} />
              </div>
              <div className="space-y-1">
                <AutoLabel className="text-xs font-medium text-[var(--shell-text)]">Monthly Ceiling</AutoLabel>
                <CurrencyInput value={thresholds.monthly} onChange={(v) => setThresholds((p) => ({ ...p, monthly: v }))} className={INP3} />
              </div>
            </div>
          </div>

          {/* Data Scope */}
          <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden" style={{ background: 'var(--shell-surface)' }}>
            <div className="dialog-header px-4 py-2.5">
              <span className="text-[11px] font-black">Data Visibility</span>
            </div>
            <div className="p-3 space-y-2">
              {['Own Records', 'Department', 'Global'].map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={cn('w-full text-left px-3 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2',
                    scope === s ? 'bg-[var(--shell-accent)] text-[var(--shell-accent-fg)]' : 'text-[var(--shell-text-muted)] hover:text-[var(--shell-text)]')}
                  style={scope !== s ? { background: 'var(--shell-bg)' } : {}}
                >
                  <div className={cn('w-2 h-2 rounded-full shrink-0', scope === s ? 'bg-white' : 'bg-[var(--shell-border)]')} />
                  {s}
                </button>
              ))}
              <p className="text-[11px] text-[var(--shell-text-muted)] font-bold leading-relaxed pt-1 italic">
                {scope === 'Own Records' && 'User sees only their own transactions and records.'}
                {scope === 'Department' && 'Access limited to their department branch.'}
                {scope === 'Global' && 'Full access across all departments and records.'}
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden" style={{ background: 'var(--shell-surface)' }}>
            <div className="dialog-header px-4 py-2.5">
              <span className="text-[11px] font-black">Summary</span>
            </div>
            <div className="p-4 space-y-2">
              {PERMISSIONS.map((p, i) => {
                const count = MODULES.filter((m) => perms[m.name]?.[i]).length;
                const pct = Math.round((count / MODULES.length) * 100);
                return (
                  <div key={p}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-[var(--shell-text-muted)]">{p}</span>
                      <span className="text-[11px] font-black text-[var(--shell-accent)]">{count}/{MODULES.length}</span>
                    </div>
                    <div className="w-full h-1 rounded-lg border bg-[var(--shell-hover)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--shell-accent)] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ModuleModal>
  );
}
