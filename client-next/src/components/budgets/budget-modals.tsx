'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { X, Plus, CheckCircle, Download, Send, Info, Trash2 } from 'lucide-react';
import { useUsers } from '@/hooks/use-queries';

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

  const inp = 'w-full bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg h-8 text-[12px] text-charcoal';
  const sel = 'w-full bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg h-8 text-[12px] text-charcoal';
  const lbl = 'text-[9px] font-bold text-juniper uppercase tracking-[0.1em]';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[860px] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="h-[52px] px-5 bg-juniper text-white flex flex-row items-center justify-between shrink-0 border-none space-y-0">
          <DialogTitle className="text-[12px] font-bold uppercase tracking-[0.2em] mt-0.5">
            {editingData ? 'Edit Budget' : 'Add Budget'}
          </DialogTitle>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="p-6 overflow-y-auto max-h-[82vh] space-y-4">
          {/* Row 1: Budget Name | Category */}
          <div className="grid grid-cols-2 gap-x-6">
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
          <div className="grid grid-cols-2 gap-x-6">
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
          <div className="grid grid-cols-2 gap-x-6">
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
              <Label className={lbl}>Total Allocation ($)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-juniper text-sm font-bold">$</span>
                <Input
                  type="number"
                  className={`pl-7 ${inp}`}
                  placeholder="0.00"
                  value={form.allocated}
                  onChange={e => set('allocated', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Row 4: Start Date | End Date */}
          <div className="grid grid-cols-2 gap-x-6">
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
              className="w-full bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg text-[12px] text-charcoal resize-none"
              style={{ minHeight: '64px', maxHeight: '64px' }}
              placeholder="Budget scope, objectives, and allocation rationale..."
              value={form.details}
              onChange={e => set('details', e.target.value)}
            />
          </div>

          {/* Controls */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-casper/20">
            <div className="flex items-center justify-between p-4 bg-white border border-casper/50 rounded-xl">
              <div>
                <p className="text-[11px] font-bold text-charcoal">Strict Enforcement</p>
                <p className="text-[9px] text-casper font-medium">Prevent overspending strictly</p>
              </div>
              <Switch checked={form.strict} onCheckedChange={v => set('strict', v)} className="data-[state=checked]:bg-juniper" />
            </div>
            <div className="flex items-center justify-between p-4 bg-white border border-casper/50 rounded-xl">
              <div>
                <p className="text-[11px] font-bold text-charcoal">Auto-Rollover</p>
                <p className="text-[9px] text-casper font-medium">Carry over unused balance</p>
              </div>
              <Switch checked={form.rollover} onCheckedChange={v => set('rollover', v)} className="data-[state=checked]:bg-juniper" />
            </div>
          </div>
        </div>

        <DialogFooter className="bg-mystic/20 border-t border-casper/30 px-6 py-3 flex flex-row items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="bg-white border-casper text-juniper font-bold text-[10px] uppercase tracking-widest hover:bg-casper/10 h-9 px-5">
            Cancel
          </Button>
          <Button className="bg-juniper hover:brightness-110 text-white font-bold text-[10px] uppercase tracking-widest h-9 px-6 rounded-lg shadow-lg shadow-juniper/20 transition-all active:scale-95" onClick={() => onSave?.(form)}>
            {editingData ? 'Update Budget' : 'Save Budget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExportBudgetModal({ isOpen, onClose }: BudgetModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-[500px] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="h-[52px] px-5 bg-juniper text-white flex flex-row items-center justify-between shrink-0 border-none space-y-0">
          <DialogTitle className="text-[12px] font-bold uppercase tracking-[0.2em] mt-0.5">Export Reports</DialogTitle>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="p-8 space-y-6">
          <div className="space-y-3">
            <Label className="text-[10px] font-bold text-juniper uppercase tracking-widest">Select Format</Label>
            <div className="grid grid-cols-2 gap-4">
              <button className="flex flex-col items-center justify-center p-6 bg-white border border-juniper/20 rounded-xl hover:border-juniper hover:bg-juniper/5 transition-all group scale-100 active:scale-95 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Download className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-charcoal">Excel Spreadsheet</span>
                <span className="text-[9px] text-casper mt-1 font-bold">.XLSX Format</span>
              </button>
              <button className="flex flex-col items-center justify-center p-6 bg-white border border-rose-200/50 rounded-xl hover:border-rose-300 hover:bg-rose-50/50 transition-all group scale-100 active:scale-95 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Download className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-charcoal">PDF Document</span>
                <span className="text-[9px] text-casper mt-1 font-bold">Portable Format</span>
              </button>
            </div>
          </div>
          
          <div className="p-4 bg-juniper/5 rounded-lg border border-juniper/10 flex gap-3">
            <Info className="w-4 h-4 text-juniper shrink-0 mt-0.5" />
            <p className="text-[10px] text-juniper/80 font-medium leading-relaxed">
              Export will include all filtered budget lines and current utilization metrics. Generated reports are secured and logged.
            </p>
          </div>
        </div>

        <DialogFooter className="bg-mystic/20 border-t border-casper/30 p-8 pt-4 flex flex-row items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="bg-white border-casper text-juniper font-bold text-[11px] uppercase tracking-widest hover:bg-casper/10 h-11 px-6 shadow-sm">
            Cancel
          </Button>
          <Button className="bg-juniper hover:brightness-110 text-white font-bold text-[11px] uppercase tracking-widest h-11 px-8 rounded-lg shadow-lg shadow-juniper/20 transition-all active:scale-95">
             Generate Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SubmitBudgetModal({ isOpen, onClose, onSubmit }: BudgetModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-[450px] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="h-[52px] px-5 bg-juniper text-white flex flex-row items-center justify-between shrink-0 border-none space-y-0">
          <DialogTitle className="text-[12px] font-bold uppercase tracking-[0.2em] mt-0.5">Budget Allocation</DialogTitle>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="p-8 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-juniper/10 flex items-center justify-center">
            <Send className="w-8 h-8 text-juniper" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-charcoal tracking-tight">Finalize Allocation?</h3>
            <p className="text-[11px] text-juniper leading-relaxed font-medium">
              You are about to submit the current budget allocation for approval. Once submitted, changes may requires administrative override.
            </p>
          </div>
          
          <div className="w-full space-y-2 text-left">
            <Label className="text-[9px] font-bold text-juniper uppercase tracking-widest ml-1">Comments (Optional)</Label>
            <Textarea 
              className="bg-white border-casper/50 focus:border-juniper focus:ring-1 focus:ring-juniper min-h-[80px] text-xs resize-none rounded-lg p-3" 
              placeholder="Provide justification for this allocation..." 
            />
          </div>
        </div>

        <DialogFooter className="bg-mystic/20 border-t border-casper/30 p-8 pt-4 flex flex-row items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="bg-white border-casper text-juniper font-bold text-[11px] uppercase tracking-widest hover:bg-casper/10 h-11 px-6 shadow-sm">
            Review
          </Button>
          <Button className="bg-juniper hover:brightness-110 text-white font-bold text-[11px] uppercase tracking-widest h-11 px-8 rounded-lg shadow-lg shadow-juniper/20 transition-all active:scale-95" onClick={onSubmit}>
            Submit Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteBudgetModal({ isOpen, onClose, onConfirm, count }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; count: number }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-[450px] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="h-[52px] px-5 bg-rose-600 text-white flex flex-row items-center justify-between shrink-0 border-none space-y-0">
          <DialogTitle className="text-[12px] font-bold uppercase tracking-[0.2em] mt-0.5">Confirm Deletion</DialogTitle>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="p-8 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center">
             <Trash2 className="w-8 h-8 text-rose-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-charcoal tracking-tight">Delete {count} budget record(s)?</h3>
            <p className="text-[11px] text-casper leading-relaxed font-medium">
              This action is irreversible. All data associated with these budget allocations will be permanently removed from the system.
            </p>
          </div>
        </div>

        <DialogFooter className="bg-rose-50/30 border-t border-casper/20 p-8 pt-4 flex flex-row items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="border-rose-200 text-rose-600 font-bold text-[11px] uppercase tracking-widest hover:bg-rose-50 h-11 px-6 shadow-sm">
            Cancel
          </Button>
          <Button className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] uppercase tracking-widest h-11 px-8 rounded-lg shadow-lg shadow-rose-600/20 transition-all active:scale-95" onClick={onConfirm}>
            Yes, Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
