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
import { useUsers } from '@/hooks/use-queries';
import { useAuthStore } from '@/stores/auth-store';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { CurrencyInput } from '@/components/shared/modal-primitives';



interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: any) => void;
  onSubmit?: (data: any) => void;
  editingData?: any;
}

const DEPARTMENTS = [
  'Product Development', 'Marketing Operations', 'IT Infrastructure',
  'Human Resources', 'Finance', 'Operations', 'Legal', 'Sales', 'Research & Development',
];

export function AddBudgetModal({ isOpen, onClose, onSave, editingData }: BudgetModalProps) {
  const currentYear = new Date().getFullYear();
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const currencySymbol = CURRENCY_SYMBOL[currency] || '₹';
  const { data: usersData } = useUsers();
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

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const yearOptions = [
    { value: String(currentYear - 1), label: `${currentYear - 1} (Closed)` },
    { value: String(currentYear),     label: `${currentYear} (Active)` },
    { value: String(currentYear + 1), label: `${currentYear + 1} (Forecast)` },
  ];

  const inp = 'w-full modal-input rounded-lg h-10 text-sm text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)]';
  const sel = 'w-full modal-input rounded-lg h-10 text-sm text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)]';
  const lbl = 'text-xs font-bold modal-label normal-case tracking-normal';

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingData ? 'Edit Budget' : 'Add Budget'}
      icon={editingData ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={() => onSave?.(form)}
      saveLabel={editingData ? 'Update Budget' : 'Save Budget'}
      maxWidth="sm:max-w-[680px]"
    >
      <div className="space-y-2.5">
        {/* Row 1: Budget Name | Category */}
        <div className="grid grid-cols-2 gap-x-4">
          <div className="space-y-1">
            <Label className={lbl}>Budget Name</Label>
            <Input className={inp} placeholder="e.g. Q1 Marketing Campaign" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={lbl}>Category</Label>
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
          </div>
        </div>

        {/* Row 2: Department | Owner */}
        <div className="grid grid-cols-2 gap-x-4">
          <div className="space-y-1">
            <Label className={lbl}>Department</Label>
            <Select value={form.department} onValueChange={v => set('department', v)}>
              <SelectTrigger className={sel}><SelectValue placeholder="Select Department" /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className={lbl}>Owner (Manager)</Label>
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
          </div>
        </div>

        {/* Row 3: Financial Year | Total Allocation */}
        <div className="grid grid-cols-2 gap-x-4">
          <div className="space-y-1">
            <Label className={lbl}>Financial Year</Label>
            <Select value={form.financial_year} onValueChange={v => set('financial_year', v)}>
              <SelectTrigger className={sel}><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className={lbl}>Total Allocation ({currencySymbol})</Label>
            <CurrencyInput value={form.allocated} onChange={(v) => set('allocated', v)} symbol={currencySymbol} />
          </div>
        </div>

        {/* Row 4: Start Date | End Date */}
        <div className="grid grid-cols-2 gap-x-4">
          <div className="space-y-1">
            <Label className={lbl}>Start Date</Label>
            <Input type="date" className={inp} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={lbl}>End Date</Label>
            <Input type="date" className={inp} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
          </div>
        </div>

        {/* Row 5: Details (2-row height) */}
        <div className="space-y-1">
          <Label className={lbl}>Details</Label>
          <Textarea
            className="w-full modal-input border-[var(--shell-border)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 rounded-lg text-sm text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] resize-none"
            style={{ minHeight: '64px', maxHeight: '64px' }}
            placeholder="Budget scope, objectives, and allocation rationale..."
            value={form.details}
            onChange={e => set('details', e.target.value)}
          />
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--shell-border)]">
          <div className="flex items-center justify-between p-4 modal-section border border-[var(--shell-border)] rounded-xl">
            <div>
              <p className="text-[11px] font-bold" style={{ color: 'var(--shell-text)' }}>Strict Enforcement</p>
              <p className="text-[9px] text-[var(--shell-text-muted)] font-medium">Prevent overspending strictly</p>
            </div>
            <Switch checked={form.strict} onCheckedChange={v => set('strict', v)} className="data-[state=checked]:bg-[var(--shell-accent)]" />
          </div>
          <div className="flex items-center justify-between p-4 modal-section border border-[var(--shell-border)] rounded-xl">
            <div>
              <p className="text-[11px] font-bold" style={{ color: 'var(--shell-text)' }}>Auto-Rollover</p>
              <p className="text-[9px] text-[var(--shell-text-muted)] font-medium">Carry over unused balance</p>
            </div>
            <Switch checked={form.rollover} onCheckedChange={v => set('rollover', v)} className="data-[state=checked]:bg-[var(--shell-accent)]" />
          </div>
        </div>
      </div>
    </ModuleModal>
  );
}

export function ExportBudgetModal({ isOpen, onClose }: BudgetModalProps) {
  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Reports"
      icon={<Download className="w-4 h-4" />}
      saveLabel="Generate Report"
      maxWidth="sm:max-w-[680px]"
    >
      <div className="space-y-3">
        <div className="space-y-2.5">
          <Label className="text-xs font-bold modal-label normal-case tracking-normal">Select Format</Label>
          <div className="grid grid-cols-2 gap-4">
            <button className="flex flex-col items-center justify-center p-6 modal-section border border-[var(--shell-border)] rounded-xl hover:border-[var(--shell-accent)]/30 hover:modal-section transition-all group scale-100 active:scale-95 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-[var(--shell-accent)]/20 text-emerald-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Download className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold" style={{ color: 'var(--shell-text)' }}>Excel Spreadsheet</span>
              <span className="text-[9px] text-[var(--shell-text-muted)] mt-1 font-bold">.XLSX Format</span>
            </button>
            <button className="flex flex-col items-center justify-center p-6 modal-section border border-[var(--shell-border)] rounded-xl hover:border-[var(--shell-accent)]/30 hover:modal-section transition-all group scale-100 active:scale-95 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Download className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold" style={{ color: 'var(--shell-text)' }}>PDF Document</span>
              <span className="text-[9px] text-[var(--shell-text-muted)] mt-1 font-bold">Portable Format</span>
            </button>
          </div>
        </div>

        <div className="p-4 bg-[var(--shell-accent)]/8 rounded-lg border border-[var(--shell-accent)]/15 flex gap-3">
          <Info className="w-4 h-4 text-[var(--shell-accent)] shrink-0 mt-0.5" />
          <p className="text-[10px] text-[var(--shell-accent)]/80 font-medium leading-relaxed">
            Export will include all filtered budget lines and current utilization metrics. Generated reports are secured and logged.
          </p>
        </div>
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
      maxWidth="sm:max-w-[680px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="h-8 px-4 text-[11.5px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>
            Review
          </Button>
          <Button
            className="font-semibold text-[11.5px] h-8 px-5 rounded-lg transition-all active:scale-95"
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
          <h3 className="text-lg font-bold tracking-tight" style={{ color: 'var(--shell-text)' }}>Finalize Allocation?</h3>
          <p className="text-[11px] modal-label leading-relaxed font-medium">
            You are about to submit the current budget allocation for approval. Once submitted, changes may requires administrative override.
          </p>
        </div>

        <div className="w-full space-y-2 text-left">
          <Label className="text-xs font-bold modal-label normal-case tracking-normal ml-1">Comments (Optional)</Label>
          <Textarea
            className="modal-input border-[var(--shell-border)] focus:border-[var(--shell-accent)]/50 focus:ring-1 focus:ring-[var(--shell-accent)]/50 min-h-[80px] text-xs text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] resize-none rounded-lg p-3"
            placeholder="Provide justification for this allocation..."
          />
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
      maxWidth="sm:max-w-[680px]"
    >
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-rose-500/15 flex items-center justify-center">
           <Trash2 className="w-8 h-8 text-rose-600" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold tracking-tight" style={{ color: 'var(--shell-text)' }}>Delete {count} budget record(s)?</h3>
          <p className="text-[11px] modal-label leading-relaxed font-medium">
            This action is irreversible. All data associated with these budget allocations will be permanently removed from the system.
          </p>
        </div>
      </div>
    </ModuleModal>
  );
}
