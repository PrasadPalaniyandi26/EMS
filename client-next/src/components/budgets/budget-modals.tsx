'use client';

import { useState, useMemo, useEffect } from 'react';
import { CURRENCY_SYMBOL } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Download, Send, Info, Trash2 } from 'lucide-react';
import { useUsers, useDepartments } from '@/hooks/use-queries';
import { PickSelect } from '@/components/manage/pick-select';
import { useAuthStore } from '@/stores/auth-store';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, CurrencyInput, inp, sel } from '@/components/shared/modal-primitives';
import { FormGrid } from '@/components/shared/form-grid';



interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: any) => void;
  onSubmit?: (data: any) => void;
  editingData?: any;
}

export function AddBudgetModal({ isOpen, onClose, onSave, editingData }: BudgetModalProps) {
  const currentYear = new Date().getFullYear();
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const currencySymbol = CURRENCY_SYMBOL[currency] || '₹';
  const { data: usersData } = useUsers();
  const { data: departments } = useDepartments();
  const managers = useMemo(() =>
    (Array.isArray(usersData) ? usersData : []).filter((u: any) =>
      u.role_name?.toLowerCase() === 'manager' ||
      (u.roles || []).some((r: any) => r.role_name?.toLowerCase() === 'manager')
    ),
  [usersData]);

  const [form, setForm] = useState({
    name: '', department: '', owner_id: '', financial_year: String(currentYear),
    category: '', details: '', start_date: '', end_date: '', allocated: '',
    strict: true, rollover: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    if (editingData) {
      setForm({
        name: editingData.name || '',
        department: editingData.department || '',
        owner_id: editingData.owner_id ? String(editingData.owner_id) : '',
        financial_year: String(editingData.financial_year || currentYear),
        category: editingData.category_name || '',
        details: editingData.details || '',
        start_date: editingData.start_date ? String(editingData.start_date).slice(0, 10) : '',
        end_date: editingData.end_date ? String(editingData.end_date).slice(0, 10) : '',
        allocated: editingData.amount ? String(editingData.amount) : '',
        strict: editingData.strict !== false,
        rollover: editingData.rollover === true,
      });
    } else {
      setForm({ name: '', department: '', owner_id: '', financial_year: String(currentYear), category: '', details: '', start_date: '', end_date: '', allocated: '', strict: true, rollover: false });
    }
  }, [isOpen, editingData]);

  // The department is stored by name; keep a saved one that is no longer listed (archived)
  const departmentOptions = (departments ?? []).map((d) => ({ id: d.name, name: d.name }));
  if (form.department && !departmentOptions.some((o) => o.id === form.department)) departmentOptions.push({ id: form.department, name: form.department });

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const yearOptions = [
    { value: String(currentYear - 1), label: `${currentYear - 1} (Closed)` },
    { value: String(currentYear),     label: `${currentYear} (Active)` },
    { value: String(currentYear + 1), label: `${currentYear + 1} (Forecast)` },
  ];

  const ctl = inp;

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingData ? 'Edit Budget' : 'Add Budget'}
      icon={editingData ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={() => onSave?.(form)}
      canSave={!!form.name.trim() && Number(form.allocated) > 0}
      saveLabel={editingData ? 'Update Budget' : 'Save Budget'}
      size="md"
    >
      <div className="space-y-3">
        <FormGrid className="gap-x-4 gap-y-3">
          <Field label="Budget Name" required>
            <Input className={ctl} placeholder="e.g. Q1 Marketing Campaign" value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger className={sel}><SelectValue placeholder="Select Expense Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="opex">Operational Expenditure (OPEX)</SelectItem>
                <SelectItem value="capex">Capital Expenditure (CAPEX)</SelectItem>
                <SelectItem value="rnd">Research & Development (R&D)</SelectItem>
                <SelectItem value="hr">HR & Benefits</SelectItem>
                <SelectItem value="admin">Office & Admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <PickSelect
            label="Department"
            placeholder="Select department"
            value={form.department}
            onChange={(name) => set('department', name)}
            options={departmentOptions}
            emptyHint="No departments yet. An admin can add them on the Team page."
          />
          <Field label="Owner (Manager)">
            <Select value={form.owner_id} onValueChange={v => set('owner_id', v)}>
              <SelectTrigger className={sel}><SelectValue placeholder="Assign Owner" /></SelectTrigger>
              <SelectContent>
                {managers.length > 0
                  ? managers.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.username || u.name}</SelectItem>
                    ))
                  : (Array.isArray(usersData) ? usersData : []).map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.username || u.name}</SelectItem>
                    ))
                }
              </SelectContent>
            </Select>
          </Field>

          <Field label="Financial Year">
            <Select value={form.financial_year} onValueChange={v => set('financial_year', v)}>
              <SelectTrigger className={sel}><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={`Total Allocation (${currencySymbol})`} required>
            <CurrencyInput value={form.allocated} onChange={(v) => set('allocated', v)} symbol={currencySymbol} />
          </Field>

          <Field label="Start Date">
            <Input type="date" className={ctl} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </Field>
          <Field label="End Date">
            <Input type="date" className={ctl} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
          </Field>
        </FormGrid>

        <Field label="Details">
          <Textarea
            className="w-full border-input bg-transparent text-[var(--shell-text)] border-[var(--shell-border)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)] rounded-lg text-sm text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] resize-none"
            style={{ minHeight: '64px', maxHeight: '64px' }}
            placeholder="Budget scope, objectives, and allocation rationale..."
            value={form.details}
            onChange={e => set('details', e.target.value)}
          />
        </Field>

        {/* Switch cards: the whole card is the label, so clicking the text toggles it and it is announced */}
        <FormGrid className="gap-4 border-t border-[var(--shell-border)] pt-3">
          <label className="rounded-lg border flex cursor-pointer items-center justify-between rounded-lg border border-[var(--shell-border)] p-4">
            <span>
              <span className="block text-[12px] font-semibold" style={{ color: 'var(--shell-text)' }}>Strict Enforcement</span>
              <span className="block text-[12px] font-medium text-[var(--shell-text-muted)]">Prevent overspending strictly</span>
            </span>
            <Switch checked={form.strict} onCheckedChange={v => set('strict', v)} aria-label="Strict enforcement" />
          </label>
          <label className="rounded-lg border flex cursor-pointer items-center justify-between rounded-lg border border-[var(--shell-border)] p-4">
            <span>
              <span className="block text-[12px] font-semibold" style={{ color: 'var(--shell-text)' }}>Auto-Rollover</span>
              <span className="block text-[12px] font-medium text-[var(--shell-text-muted)]">Carry over unused balance</span>
            </span>
            <Switch checked={form.rollover} onCheckedChange={v => set('rollover', v)} aria-label="Auto-rollover" />
          </label>
        </FormGrid>
      </div>
    </ModuleModal>
  );
}

export function SubmitBudgetModal({ isOpen, onClose, onSubmit }: BudgetModalProps) {
  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Budget Allocation"
      icon={<Send className="w-4 h-4" />}
      onSave={() => onSubmit?.({})}
      saveLabel="Submit Now"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="h-8 px-4 text-[12px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>
            Review
          </Button>
          <Button
            className="font-semibold text-[12px] h-8 px-5 rounded-lg transition-all active:scale-95"
            style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}
            onClick={onSubmit}
          >
            Submit Now
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-[var(--shell-accent)]/10 flex items-center justify-center">
          <Send className="w-8 h-8 text-[var(--shell-accent)]" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--shell-text)' }}>Finalize Allocation?</h3>
          <p className="text-[12px] text-[var(--shell-text)] leading-relaxed font-medium">
            You are about to submit the current budget allocation for approval. Once submitted, changes may requires administrative override.
          </p>
        </div>

        <div className="w-full text-left">
          <Field label="Comments (Optional)">
            <Textarea
              className="border-input bg-transparent text-[var(--shell-text)] border-[var(--shell-border)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)] min-h-[80px] text-xs text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] resize-none rounded-lg p-3"
              placeholder="Provide justification for this allocation..."
            />
          </Field>
        </div>
      </div>
    </ModuleModal>
  );
}

export function DeleteBudgetModal({ isOpen, onClose, onConfirm, count }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; count: number }) {
  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Deletion"
      icon={<Trash2 className="w-4 h-4" />}
      onSave={onConfirm}
      saveLabel="Yes, Delete"
      isDestructive={true}
      size="md"
    >
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] flex items-center justify-center">
           <Trash2 className="w-8 h-8 text-[var(--danger)]" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--shell-text)' }}>Delete {count} budget record(s)?</h3>
          <p className="text-[12px] text-[var(--shell-text)] leading-relaxed font-medium">
            This action is irreversible. All data associated with these budget allocations will be permanently removed from the system.
          </p>
        </div>
      </div>
    </ModuleModal>
  );
}
