'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useHeaderStore } from '@/stores/header-store';
import { useRoles, useInvalidate } from '@/hooks/use-queries';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import {
  User, MapPin, Briefcase, Shield,
  ArrowLeft, Save, Send, Eye, EyeOff,
  RefreshCw, Check, Star, PlusCircle, Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { COUNTRY_LIST } from '@/components/manage/client-modals';
import { getRoleStyle } from '@/lib/roles';
import { Field } from '@/components/shared/modal-primitives';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generatePassword(firstName: string, lastName: string): string {
  const specials = ['!', '@', '#', '$', '%', '&', '*'];
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const special = specials[Math.floor(Math.random() * specials.length)];
  const fi = (firstName?.[0] || 'U').toUpperCase();
  const li = (lastName?.[0] || 'X').toUpperCase();
  return `${fi}${li}${digits}${special}`;
}

// ─── Field ─────────────────────────────────────────────────────────────────────
const INP = 'w-full h-10 text-sm focus:ring-1 focus:outline-none rounded-xl';

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'personal',    label: 'Personal',    icon: User },
  { id: 'employment',  label: 'Employment',  icon: Briefcase },
  { id: 'address',     label: 'Address',     icon: MapPin },
  { id: 'permissions', label: 'Permissions', icon: Shield },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UserFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('id');
  const isEdit = !!userId;

  const setHeader = useHeaderStore((s) => s.setHeader);
  const { data: roles } = useRoles();
  const invalidate = useInvalidate();

  const { data: managersData } = useQuery({
    queryKey: ['managers'],
    queryFn: () => api.get<any[]>('/users/by-role/managers').then((r) => r.data),
    staleTime: 2 * 60 * 1000,
  });
  const managers: any[] = Array.isArray(managersData) ? managersData : [];

  const [activeTab, setActiveTab] = useState('personal');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    first_name: '', last_name: '', date_of_birth: '', email: '',
    contact_no: '', password: '',
    house_apt: '', address: '', city: '', country: '', postal_code: '',
    reporting_manager_id: '', department: '', clearance_level: 'Level 1',
    joining_date: '', status: 'ACTIVE',
  });
  const [selectedRoles, setSelectedRoles] = useState<{ roleId: number; isDefault: boolean }[]>([]);
  const [permissions, setPermissions] = useState({
    single_limit: '10000', monthly_limit: '50000', data_scope: 'Department',
    permissions: {} as Record<string, boolean>,
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    setHeader(
      isEdit ? 'Edit Team Member' : 'Add Team Member',
      isEdit ? `Editing user #${userId}` : 'Complete all tabs to create a new member',
    );
  }, [setHeader, isEdit, userId]);

  // Load existing user if editing
  useEffect(() => {
    if (!userId) return;
    api.get(`/users/${userId}`).then((res) => {
      const u = res.data as any;
      const names = (u.username || '').split(' ');
      setForm({
        first_name: names[0] || '',
        last_name: names.slice(1).join(' ') || '',
        date_of_birth: u.date_of_birth ? new Date(u.date_of_birth).toISOString().split('T')[0] : '',
        email: u.email || '',
        contact_no: u.contact_no || '',
        password: '',
        house_apt: u.house_apt || '',
        address: u.address || '',
        city: u.city || '',
        country: u.country || '',
        postal_code: u.postal_code || '',
        reporting_manager_id: (u.manager_id ?? u.reporting_manager_id)?.toString() || '',
        department: u.department || '',
        clearance_level: u.clearance_level || 'Level 1',
        joining_date: u.joining_date ? new Date(u.joining_date).toISOString().split('T')[0] : '',
        status: u.user_status === 'ON_HOLD' ? 'On Hold' : u.user_status === 'INACTIVE' ? 'Inactive' : 'ACTIVE',
      });
      if (u.roles?.length > 0) {
        setSelectedRoles(u.roles.map((r: any) => ({ roleId: r.id, isDefault: r.is_default })));
      } else if (u.role_id) {
        setSelectedRoles([{ roleId: u.role_id, isDefault: true }]);
      }
    }).catch(() => toast.error('Failed to load user'));

    api.get(`/users/${userId}/permissions`).then((res) => {
      const p = res.data as any;
      if (p) setPermissions({
        single_limit: String(p.single_limit || 10000),
        monthly_limit: String(p.monthly_limit || 50000),
        data_scope: p.data_scope || 'Department',
        permissions: p.permissions || {},
      });
    }).catch(() => {});
  }, [userId]);

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

  const setDefaultRole = (roleId: number) =>
    setSelectedRoles((prev) => prev.map((r) => ({ ...r, isDefault: r.roleId === roleId })));

  const handleSave = async () => {
    if (!form.first_name || !form.email) {
      toast.error('First name and email are required');
      setActiveTab('personal');
      return;
    }
    if (selectedRoles.length === 0) {
      toast.error('Assign at least one role');
      setActiveTab('employment');
      return;
    }
    setSaving(true);
    try {
      const defaultRole = selectedRoles.find((r) => r.isDefault) || selectedRoles[0];
      const statusMap: Record<string, { isActive: boolean; user_status: string }> = {
        'ACTIVE':   { isActive: true,  user_status: 'ACTIVE' },
        'On Hold':  { isActive: false, user_status: 'ON_HOLD' },
        'Inactive': { isActive: false, user_status: 'INACTIVE' },
      };
      const statusData = statusMap[form.status] || { isActive: true, user_status: 'ACTIVE' };
      const payload = {
        ...form,
        username: `${form.first_name} ${form.last_name}`.trim(),
        ...statusData,
        role_id: defaultRole.roleId,
        roles: selectedRoles,
      };

      if (isEdit) {
        await api.put(`/users/${userId}`, payload);
        await api.put(`/users/${userId}/permissions`, permissions);
        toast.success('User updated successfully');
      } else {
        const res = await api.post('/users', payload);
        const newId = (res.data as any).id;
        if (newId) await api.put(`/users/${newId}/permissions`, permissions);
        toast.success('User created successfully');
      }
      invalidate('users');
      router.push('/manage/organization');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const defaultRoleName = (roles || []).find(
    (r) => r.id === (selectedRoles.find((s) => s.isDefault) || selectedRoles[0])?.roleId
  )?.name;

  const PERM_MODULES = [
    { key: 'expense_submit', label: 'Submit Expenses' },
    { key: 'expense_approve', label: 'Approve Expenses' },
    { key: 'income_view', label: 'View Income' },
    { key: 'budget_view', label: 'View Budgets' },
    { key: 'budget_edit', label: 'Edit Budgets' },
    { key: 'reports_view', label: 'View Reports' },
    { key: 'users_manage', label: 'Manage Users' },
    { key: 'audit_view', label: 'View Audit Logs' },
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--shell-hover)] overflow-hidden">
      {/* Page header bar */}
      <div className="h-12 border-b flex items-center justify-between px-6 shrink-0" style={{ background: 'var(--shell-surface)', borderColor: 'var(--shell-border)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/manage/organization')}
            className="flex items-center gap-1.5 text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Team
          </button>
          <span className="text-[var(--shell-text-muted)]">/</span>
          <span className="text-sm font-semibold text-[var(--shell-text)]">
            {isEdit ? `Edit — ${form.first_name} ${form.last_name}`.trim() || `User #${userId}` : 'New Member'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/manage/organization')}
            className="h-8 px-4 text-xs border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-hover)] rounded-lg">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}
            className="h-8 px-4 text-xs rounded-lg flex items-center gap-1.5 text-white" style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}>
            {isEdit ? <><Save className="w-3.5 h-3.5" /> Save Changes</> : <><Send className="w-3.5 h-3.5" /> Create Member</>}
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b px-6 flex items-end gap-1 shrink-0" style={{ background: 'var(--shell-surface)', borderColor: 'var(--shell-border)' }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all',
                active
                  ? 'border-[var(--shell-accent)] text-[var(--shell-accent)]'
                  : 'border-transparent text-[var(--shell-text-muted)] hover:text-[var(--shell-text)] hover:border-[var(--shell-border)]',
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-3xl mx-auto py-8 px-6">

          {/* ── PERSONAL ── */}
          {activeTab === 'personal' && (
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--shell-text)]">Personal Information</h2>
                <p className="text-sm text-[var(--shell-text-muted)] mt-0.5">Basic identity and contact details</p>
              </div>
              <div className="rounded-2xl p-6 space-y-5" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="First Name" required>
                    <Input className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }} placeholder="Jonathan" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
                  </Field>
                  <Field label="Last Name">
                    <Input className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }} placeholder="Doe" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Date of Birth">
                    <Input className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }} type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
                  </Field>
                  <Field label="Contact No">
                    <Input className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }} placeholder="+91 98765 43210" value={form.contact_no} onChange={(e) => set('contact_no', e.target.value)} />
                  </Field>
                </div>
                <Field label="Email Address" required>
                  <Input className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }} type="email" placeholder="j.doe@company.com" value={form.email}
                    readOnly={!!isEdit} onChange={(e) => set('email', e.target.value)} />
                </Field>
                <Field label={isEdit ? 'New Password (leave blank to keep current)' : 'Password'}>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input className={INP + ' pr-10'} type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••" value={form.password} onChange={(e) => set('password', e.target.value)} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] hover:text-[var(--shell-text-muted)]">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Button type="button" variant="outline" onClick={() => { set('password', generatePassword(form.first_name, form.last_name)); setShowPassword(true); }}
                      className="h-10 px-3 border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:text-[var(--info)] hover:border-[color-mix(in_srgb,var(--success)_35%,transparent)] rounded-xl">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </Field>
              </div>

              {/* Status card */}
              <div className="rounded-2xl p-6" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                <Label className="text-xs font-medium text-[var(--shell-text-muted)] block mb-3">Account Status</Label>
                <div className="flex p-1 border rounded-xl gap-1">
                  {[
                    { val: 'ACTIVE',   label: 'Active',   color: 'text-[var(--info)]' },
                    { val: 'On Hold',  label: 'On Hold',  color: 'text-[var(--warning)]' },
                    { val: 'Inactive', label: 'Inactive', color: 'text-[var(--danger)]' },
                  ].map(({ val, label, color }) => (
                    <button key={val} onClick={() => set('status', val)}
                      className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-all',
                        form.status === val ? `bg-[var(--shell-surface)] ${color}` : 'text-[var(--shell-text-muted)] hover:text-[var(--shell-text-muted)]'
                      )}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── EMPLOYMENT ── */}
          {activeTab === 'employment' && (
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--shell-text)]">Employment & Access</h2>
                <p className="text-sm text-[var(--shell-text-muted)] mt-0.5">Role assignments, department, and reporting structure</p>
              </div>

              <div className="rounded-2xl p-6 space-y-5" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Department">
                    <Select value={form.department} onValueChange={(v) => set('department', v)}>
                      <SelectTrigger className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }}><SelectValue placeholder="Select department" /></SelectTrigger>
                      <SelectContent>
                        {['Engineering', 'Finance', 'Operations', 'Human Resource', 'Logistics', 'Sales'].map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Clearance Level">
                    <Select value={form.clearance_level} onValueChange={(v) => set('clearance_level', v)}>
                      <SelectTrigger className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'].map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Reporting Manager">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--shell-text-muted)] pointer-events-none z-10" />
                      <Select value={form.reporting_manager_id} onValueChange={(v) => set('reporting_manager_id', v)}>
                        <SelectTrigger className={INP + ' pl-9'}><SelectValue placeholder="Select manager" /></SelectTrigger>
                        <SelectContent>
                          {managers.map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>{m.username}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </Field>
                  <Field label="Joining Date">
                    <Input className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }} type="date" value={form.joining_date} onChange={(e) => set('joining_date', e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Roles */}
              <div className="rounded-2xl p-6 space-y-2.5" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--shell-text)]">Roles Assigned</h3>
                  <p className="text-xs text-[var(--shell-text-muted)] mt-0.5">A user can hold multiple roles. Star (★) marks the default active role.</p>
                </div>
                <div className="border rounded-xl overflow-hidden divide-y divide-[var(--shell-border)]">
                  {(roles || []).map((r) => {
                    const isChecked = selectedRoles.some((s) => s.roleId === r.id);
                    const isDefault = selectedRoles.find((s) => s.roleId === r.id)?.isDefault ?? false;
                    const key = (r.role_name || '').toLowerCase();
                    const dotCls = getRoleStyle(key).dot;
                    const labelCls = getRoleStyle(key).badge;
                    return (
                      <div key={r.id}
                        className={cn('flex items-center px-4 py-3 transition-colors', isChecked ? 'bg-[color-mix(in_srgb,var(--info)_50%,transparent)]' : 'hover:bg-[var(--shell-hover)]')}>
                        <div onClick={() => toggleRole(r.id)}
                          className={cn('w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer shrink-0 mr-3',
                            isChecked ? 'bg-[var(--info)] border-[var(--info)]' : 'border-[var(--shell-border)]')}>
                          {isChecked && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className={cn('w-2 h-2 rounded-full shrink-0 mr-3', dotCls)} />
                        <span onClick={() => toggleRole(r.id)}
                          className={cn('text-sm font-medium cursor-pointer flex-1', isChecked ? 'text-[var(--shell-text)]' : 'text-[var(--shell-text-muted)]')}>
                          {r.role_name}
                        </span>
                        {isChecked && (
                          <span className={cn('text-xs px-2 py-0.5 rounded-full border mr-3', labelCls)}>{r.role_name}</span>
                        )}
                        {isChecked && (
                          <button type="button" onClick={() => setDefaultRole(r.id)}>
                            <Star className={cn('w-4 h-4 transition-colors', isDefault ? 'fill-[var(--warning)] text-[var(--warning)]' : 'text-[var(--shell-text-muted)] hover:text-[var(--warning)]')} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {defaultRoleName && (
                  <p className="text-xs text-[var(--shell-text-muted)]">
                    Default active role: <span className="text-[var(--info)] font-semibold">{defaultRoleName}</span> <span className="text-[var(--warning)]">★</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── ADDRESS ── */}
          {activeTab === 'address' && (
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--shell-text)]">Address & Location</h2>
                <p className="text-sm text-[var(--shell-text-muted)] mt-0.5">Residential or mailing address</p>
              </div>
              <div className="rounded-2xl p-6 space-y-5" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                <Field label="Street / House / Apt">
                  <Input className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }} placeholder="123 Main Street, Apt 4B" value={form.house_apt} onChange={(e) => set('house_apt', e.target.value)} />
                </Field>
                <Field label="Address line 2">
                  <Input className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }} placeholder="Building, landmark (optional)" value={form.address} onChange={(e) => set('address', e.target.value)} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="City">
                    <Input className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }} placeholder="Mumbai" value={form.city} onChange={(e) => set('city', e.target.value)} />
                  </Field>
                  <Field label="Postal Code">
                    <Input className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }} placeholder="400001" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
                  </Field>
                </div>
                <Field label="Country">
                  <Select value={form.country} onValueChange={(v) => set('country', v)}>
                    <SelectTrigger className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }}><SelectValue placeholder="Select country" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {COUNTRY_LIST.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {/* ── PERMISSIONS ── */}
          {activeTab === 'permissions' && (
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--shell-text)]">Permissions & Limits</h2>
                <p className="text-sm text-[var(--shell-text-muted)] mt-0.5">Financial limits and module access controls</p>
              </div>

              <div className="rounded-2xl p-6 space-y-5" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                <h3 className="text-sm font-semibold text-[var(--shell-text)]">Spending Limits</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Single Transaction Limit (₹)">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] font-medium text-sm select-none">₹</span>
                      <Input className={INP + ' pl-7'} type="number" placeholder="10000"
                        value={permissions.single_limit}
                        onChange={(e) => setPermissions((p) => ({ ...p, single_limit: e.target.value }))} />
                    </div>
                  </Field>
                  <Field label="Monthly Limit (₹)">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] font-medium text-sm select-none">₹</span>
                      <Input className={INP + ' pl-7'} type="number" placeholder="50000"
                        value={permissions.monthly_limit}
                        onChange={(e) => setPermissions((p) => ({ ...p, monthly_limit: e.target.value }))} />
                    </div>
                  </Field>
                </div>
                <Field label="Data Scope">
                  <Select value={permissions.data_scope} onValueChange={(v) => setPermissions((p) => ({ ...p, data_scope: v }))}>
                    <SelectTrigger className={INP} style={{ background: 'var(--shell-bg)', borderColor: 'var(--shell-border)', color: 'var(--shell-text)' }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Own', 'Department', 'Organization'].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="rounded-2xl p-6 space-y-2.5" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
                <h3 className="text-sm font-semibold text-[var(--shell-text)]">Module Access</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PERM_MODULES.map(({ key, label }) => {
                    const enabled = !!permissions.permissions[key];
                    return (
                      <button key={key} type="button"
                        onClick={() => setPermissions((p) => ({ ...p, permissions: { ...p.permissions, [key]: !enabled } }))}
                        className={cn('flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all',
                          enabled
                            ? 'bg-[color-mix(in_srgb,var(--info)_12%,transparent)] border-[color-mix(in_srgb,var(--info)_35%,transparent)] text-[var(--info)]'
                            : 'border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:border-[var(--shell-border)]',
                        )}>
                        {label}
                        <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center',
                          enabled ? 'bg-[var(--info)] border-[var(--info)]' : 'border-[var(--shell-border)]')}>
                          {enabled && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Bottom save bar */}
          <div className="mt-8 pt-6 border-t border-[var(--shell-border)] flex items-center justify-between">
            <button onClick={() => router.push('/manage/organization')}
              className="text-sm text-[var(--shell-text-muted)] hover:text-[var(--shell-text-muted)] transition-colors">
              ← Back to Team
            </button>
            <Button onClick={handleSave} disabled={saving}
              className="h-10 px-6 bg-[var(--info)] hover:opacity-90 text-[var(--info-foreground)] rounded-xl text-sm font-semibold flex items-center gap-2">
              {saving ? 'Saving…' : isEdit ? <><Save className="w-4 h-4" /> Save Changes</> : <><Send className="w-4 h-4" /> Create Member</>}
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
