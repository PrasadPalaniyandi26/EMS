'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, PlusCircle, Eye, EyeOff, Check, Plus, Pencil, RefreshCw, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toLocalYMD } from '@/lib/currency';
import { roleColor } from '@/lib/roles';
import { toast } from 'sonner';
import { COUNTRY_LIST } from './client-modals';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, AutoLabel, EmailInput, PhoneInput, SegmentedControl, isValidEmail, isValidPhone, inp } from '@/components/shared/modal-primitives';

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
          <div className="flex items-center gap-3 rounded-lg border bg-[var(--secondary)] rounded-lg px-4 py-2">
            <span className="text-[12px] font-semibold text-[var(--shell-text-muted)]">Employee ID</span>
            <span className="text-[13px] font-semibold text-[var(--shell-text)]">{getEmployeeId(editing.id)}</span>
            <span className="ml-auto px-2 py-0.5 rounded-md text-[12px] font-semibold border border-[var(--shell-border)] text-[var(--shell-text)]">
              {editing.role_name || 'Staff'}
            </span>
          </div>
        )}

        {/* 3-COLUMN LAYOUT */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 items-start">

          {/* COL 1 — Personal & Contact */}
          <div className="space-y-2.5">
            <Field label="First Name">
              <Input className={inp} placeholder="Jonathan" value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
                onBlur={() => {
                  if (!loginNameManuallyEdited && !editing)
                    set('login_name', deriveLoginName(form.first_name, form.last_name));
                }}
              />
            </Field>
            <Field label="Last Name">
              <Input className={inp} placeholder="Doe" value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
                onBlur={(e) => {
                  if (!loginNameManuallyEdited && !editing)
                    set('login_name', deriveLoginName(form.first_name, e.target.value));
                }}
              />
            </Field>
            <Field label="Date of Birth">
              <Input className={inp} type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
            </Field>
            <Field label="Email Address">
              <EmailInput value={form.email} onChange={(v) => set('email', v)} placeholder="j.doe@company.com" readOnly={!!editing} required />
            </Field>
            <Field label="Contact No">
              <PhoneInput value={form.contact_no} onChange={(v) => set('contact_no', v)} placeholder="+91 98765 43210" />
            </Field>
            <Field label="User Name">
              <Input
                className={inp}
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
                  <Input className={inp + ' pr-8'} type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={(e) => set('password', e.target.value)} />
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
                <SelectTrigger className={inp}>
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  {['Engineering', 'Finance', 'Operations', 'Human Resource', 'Logistics', 'Sales'].map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => setShowNewDeptForm(!showNewDeptForm)} className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] mt-1">
                <PlusCircle className="w-3 h-3" /> Create new department
              </button>
              {showNewDeptForm && (
                <div className="mt-2 p-3 border border-[var(--shell-border)] rounded-lg space-y-2" style={{ background: 'var(--shell-bg)' }}>
                  <Input className={inp} placeholder="Department name" />
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
                      <div onClick={() => toggleRole(r.role_id)} className={cn('w-3.5 h-3.5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer shrink-0 mr-2.5', isChecked ? 'bg-[var(--shell-accent)] border-[var(--shell-accent)]' : 'border-[var(--shell-border)]')}>
                        {isChecked && <Check className="w-2 h-2 text-white" />}
                      </div>
                      <div className={cn('w-2 h-2 rounded-full shrink-0 mr-2', rc.dot)} />
                      <span onClick={() => toggleRole(r.role_id)} className={cn('text-[12px] font-semibold select-none flex-1 cursor-pointer', isChecked ? 'text-[var(--shell-text)]' : 'text-[var(--shell-text-muted)]')}>
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
                <p className="text-[12px] text-[var(--shell-text-muted)] pt-0.5">
                  <span className="text-[var(--shell-accent)] font-semibold">{defaultRoleName}</span> is the default active role <span className="text-[var(--warning)]">★</span>
                </p>
              )}
            </div>
            <Field label="Reporting Manager">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--shell-text-muted)] z-10 pointer-events-none" />
                <Select value={form.reporting_manager_id} onValueChange={(v) => set('reporting_manager_id', v)}>
                  <SelectTrigger className={inp + ' pl-8'}>
                    <SelectValue placeholder="Search manager..." />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => <SelectItem key={m.id} value={m.id.toString()}>{m.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </Field>
            <Field label="Joining Date">
              <Input className={inp} type="date" value={form.joining_date} onChange={(e) => set('joining_date', e.target.value)} />
            </Field>
          </div>

          {/* COL 3 — Address */}
          <div className="space-y-2.5">
            <Field label="Street">
              <Input className={inp} placeholder="123 Main Street" value={form.house_apt} onChange={(e) => set('house_apt', e.target.value)} />
            </Field>
            <Field label="Address (optional)">
              <Input className={inp} placeholder="Apt / Suite / Building" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <Field label="City">
              <Input className={inp} placeholder="Mumbai" value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="Country">
              <Select value={form.country} onValueChange={(v) => set('country', v)}>
                <SelectTrigger className={inp}>
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
              <Input className={inp} placeholder="400001" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
            </Field>
            {/* Status segmented */}
            <div className="space-y-1 pt-1">
              <p id="user-status-label" className="text-[13px] font-medium" style={{ color: "var(--shell-text)" }}>Status</p>
              <SegmentedControl
                labelledBy="user-status-label"
                value={form.status}
                onChange={(v) => set("status", v)}
                options={[
                  { value: 'ACTIVE', label: 'ACTIVE', tone: 'success' },
                  { value: 'On Hold', label: 'On Hold', tone: 'warning' },
                  { value: 'Inactive', label: 'Inactive', tone: 'danger' },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </ModuleModal>
  );
}

