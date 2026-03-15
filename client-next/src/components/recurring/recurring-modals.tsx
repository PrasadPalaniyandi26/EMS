'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Edit,
  PlusCircle,
  X,
  Calendar,
  Settings,
  CheckCircle2,
  Send,
  Building2,
  CreditCard,
  Repeat,
  Pause,
  PlayCircle,
  Play,
  Check,
  CalendarDays,
  Trash2
} from 'lucide-react';

interface RecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editing: any | null;
  form: any;
  setForm: (form: any) => void;
  categories: any[];
}

export function RecurringModal({
  isOpen,
  onClose,
  onSave,
  editing,
  form,
  setForm,
  categories,
}: RecurringModalProps) {
  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const isEdit = !!editing;

  const inp = 'w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg';
  const sel = 'w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg';
  const lbl = 'text-[9px] font-bold text-juniper uppercase tracking-[0.1em] block mb-1';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[860px] w-[95vw] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="h-[48px] px-5 bg-juniper text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5 text-white">
            {isEdit ? <Edit className="w-4 h-4 opacity-80" /> : <PlusCircle className="w-4 h-4 opacity-80" />}
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">
              {isEdit ? 'Edit Recurring Transaction' : 'Add Recurring Transaction'}
            </h3>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="pt-3 px-6 pb-4 overflow-y-auto max-h-[82vh] custom-scrollbar bg-[#FAF9F6] space-y-3">

          {/* Row 1: Vendor + Type */}
          <div className="grid grid-cols-3 gap-x-6">
            <div className="col-span-2 space-y-1">
              <label className={lbl}>Service / Vendor</label>
              <Input
                className={inp}
                placeholder="Enter vendor name..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className={lbl}>Transaction Type</label>
              <div className="flex p-1 bg-[#FAF9F6] border border-casper/50 rounded-lg gap-1 h-8">
                {['expense', 'income'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, type: t })}
                    className={`flex-1 text-[10px] font-bold rounded-md transition-all ${
                      form.type === t ? 'bg-juniper text-white shadow-sm' : 'text-casper hover:text-charcoal'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Category, Amount, Frequency */}
          <div className="grid grid-cols-3 gap-x-6">
            <div className="space-y-1">
              <label className={lbl}>Category</label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger className={sel}><SelectValue placeholder="Select Category" /></SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((c) => (
                    <SelectItem className="text-[12px]" key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className={lbl}>Amount</label>
              <Input
                type="number"
                className={inp}
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className={lbl}>Frequency</label>
              <Select value={form.frequency.toLowerCase()} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger className={sel}><SelectValue placeholder="Select Frequency" /></SelectTrigger>
                <SelectContent>
                  <SelectItem className="text-[12px]" value="daily">Daily</SelectItem>
                  <SelectItem className="text-[12px]" value="weekly">Weekly</SelectItem>
                  <SelectItem className="text-[12px]" value="monthly">Monthly</SelectItem>
                  <SelectItem className="text-[12px]" value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Start Date, End Date, Payment Method */}
          <div className="grid grid-cols-3 gap-x-6">
            <div className="space-y-1">
              <label className={lbl}>Start Date</label>
              <Input
                type="date"
                className={inp}
                value={form.next_run}
                onChange={(e) => setForm({ ...form, next_run: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className={lbl}>End Date / Occurrences</label>
              <div className="relative">
                <Input className={`${inp} pr-8`} placeholder="Till end or #..." />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-casper" />
              </div>
            </div>
            <div className="space-y-1">
              <label className={lbl}>Payment Method</label>
              <Select value={form.payment_method || 'corporate_ach'} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger className={sel}><SelectValue placeholder="Select Method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem className="text-[12px]" value="corporate_amex">Corporate Amex</SelectItem>
                  <SelectItem className="text-[12px]" value="corporate_ach">Corporate ACH</SelectItem>
                  <SelectItem className="text-[12px]" value="wire_transfer">Wire Transfer</SelectItem>
                  <SelectItem className="text-[12px]" value="digital_wallet">Digital Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Automation Rules */}
          <div className="pt-2 border-t border-casper/30">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-3.5 h-3.5 text-juniper" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-juniper">Automation Rules</span>
              <div className="h-[1px] flex-1 bg-slate-100" />
            </div>
            <div className="grid grid-cols-3 gap-x-6">
              <div className="space-y-1">
                <label className={lbl}>Process On</label>
                <Select value={form.schedule_on || '1st_of_month'} onValueChange={(v) => setForm({ ...form, schedule_on: v })}>
                  <SelectTrigger className={sel}><SelectValue placeholder="Select Timing" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem className="text-[12px]" value="1st_of_month">1st day of Month</SelectItem>
                    <SelectItem className="text-[12px]" value="last_of_month">Last day of Month</SelectItem>
                    <SelectItem className="text-[12px]" value="mid_month">Specific Date (15th)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className={lbl}>Auto-submit for Approval</label>
                <div className="flex items-center h-8">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <Checkbox
                      checked={form.auto_submit}
                      onCheckedChange={(checked) => setForm({ ...form, auto_submit: !!checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-casper/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-casper after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-juniper"></div>
                    <span className="ml-2.5 text-[11px] font-medium text-charcoal">{form.auto_submit ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>
              </div>
              <div className="space-y-1">
                <label className={lbl}>Project Association</label>
                <Select value={form.project_id || 'none'} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger className={sel}><SelectValue placeholder="Select Project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem className="text-[12px]" value="none">None</SelectItem>
                    <SelectItem className="text-[12px]" value="p1">Phoenix Revamp (PHX-23)</SelectItem>
                    <SelectItem className="text-[12px]" value="p2">Internal Infrastructure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className={lbl}>Recurring Purpose / Notes</label>
            <Textarea
              className="w-full text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg resize-none min-h-[64px]"
              placeholder="Provide a reason for this recurring transaction..."
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-mystic/20 border-t border-casper/30 px-6 py-3 flex items-center justify-end gap-3 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-white border-casper text-juniper font-bold text-[10px] uppercase tracking-widest hover:bg-casper/10 h-9 px-5"
          >
            Cancel
          </Button>
          <button
            onClick={onSave}
            className="bg-juniper hover:brightness-110 text-white font-bold text-[10px] uppercase tracking-widest h-9 px-6 rounded-lg flex items-center gap-2 shadow-lg shadow-juniper/20 active:scale-95 transition-all"
          >
            {isEdit ? (
              <><CheckCircle2 className="w-3.5 h-3.5" /> Update Schedule</>
            ) : (
              <><Send className="w-3.5 h-3.5" /> Schedule Transaction</>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PauseRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, resumeDate: string | null) => void;
  targetName: string;
}

interface ResumeRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (updatedData: any) => void;
  target: any;
}

export function PauseRecurringModal({
  isOpen,
  onClose,
  onConfirm,
  targetName,
}: PauseRecurringModalProps) {
  const [reason, setReason] = React.useState('Budget Review');
  const [resumeDate, setResumeDate] = React.useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [isScheduled, setIsScheduled] = React.useState(true);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-[500px] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col"
        showCloseButton={false}
      >
        <div className="h-[52px] px-5 bg-juniper text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <Pause className="w-5 h-5 text-white/80" />
            <h3 className="text-[12px] font-bold uppercase tracking-[0.2em] mt-0.5">Pause Schedule</h3>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex gap-3">
            <Pause className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-900 leading-relaxed">
              Are you sure you want to pause <span className="font-bold underline">{targetName}</span>? No new expenses will be generated until resumed.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-juniper uppercase tracking-wider block">Reason</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="bg-white border-casper/50 rounded-lg h-10 text-xs text-charcoal shadow-sm">
                  <SelectValue placeholder="Select Reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Budget Review">Budget Review</SelectItem>
                  <SelectItem value="Service Temporary Suspension">Service Temporary Suspension</SelectItem>
                  <SelectItem value="Internal Audit">Internal Audit</SelectItem>
                  <SelectItem value="Vendor Negotiation">Vendor Negotiation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-juniper uppercase tracking-wider block">Scheduled Resume</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-juniper" />
                <Input
                  type="date"
                  disabled={!isScheduled}
                  className="bg-white border-casper/50 rounded-lg pl-10 h-10 text-xs text-charcoal shadow-sm disabled:opacity-50"
                  value={resumeDate}
                  onChange={(e) => setResumeDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer p-4 bg-white border border-casper rounded-xl">
            <Checkbox
              checked={isScheduled}
              onCheckedChange={(checked) => setIsScheduled(!!checked)}
              className="data-[state=checked]:bg-juniper"
            />
            <span className="text-[11px] font-bold text-charcoal">Enable auto-resume on selected date</span>
          </label>
        </div>

        <div className="p-6 bg-mystic/20 border-t border-casper/30 flex justify-end gap-3 shrink-0">
          <Button 
            variant="outline" 
            onClick={onClose} 
            className="bg-white border-casper px-5 py-2.5 h-11 text-[11px] font-bold text-juniper uppercase tracking-widest hover:bg-casper/10 rounded-lg transition-all shadow-sm"
          >
            Keep Active
          </Button>
          <button
            onClick={() => onConfirm(reason, isScheduled ? resumeDate : null)}
            className="px-6 py-2.5 bg-amber-600 text-white rounded-lg text-[11px] font-bold uppercase tracking-widest hover:brightness-110 shadow-lg shadow-amber-200 transition-all flex items-center gap-2"
          >
            <Pause className="w-4 h-4" /> Pause Schedule
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ResumeRecurringModal({
  isOpen,
  onClose,
  onConfirm,
  target,
}: ResumeRecurringModalProps) {
  const [form, setForm] = React.useState({
    next_run: '',
    amount: '',
    frequency: 'monthly',
    reason: 'Project Restarted',
  });

  React.useEffect(() => {
    if (target) {
      setForm({
        next_run: (target.next_run || '').split('T')[0],
        amount: String(target.amount || ''),
        frequency: target.frequency || 'monthly',
        reason: 'Project Restarted',
      });
    }
  }, [target]);

  if (!target) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-[500px] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col"
        showCloseButton={false}
      >
        <div className="h-[52px] px-5 bg-juniper text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <PlayCircle className="w-5 h-5 text-white/80" />
            <h3 className="text-[12px] font-bold uppercase tracking-[0.2em] mt-0.5">Resume Schedule</h3>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-wider">Target Schedule</p>
              <p className="text-[14px] font-bold text-charcoal">{target.description}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-wider">Last Run</p>
              <p className="text-[14px] font-bold text-charcoal">
                {target.last_run ? new Date(target.last_run).toLocaleDateString() : 'None'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-juniper uppercase tracking-wider block">Next Billing Date</label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-juniper" />
                <Input
                  type="date"
                  className="bg-white border-casper/50 rounded-lg pl-10 h-10 text-xs text-charcoal shadow-sm"
                  value={form.next_run}
                  onChange={(e) => setForm({ ...form, next_run: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-juniper uppercase tracking-wider block">Monthly Amount ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-juniper text-xs font-bold">$</span>
                <Input
                  type="number"
                  className="bg-white border-casper/50 rounded-lg pl-7 h-10 text-xs font-bold text-charcoal shadow-sm"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-juniper uppercase tracking-wider block">Frequency</label>
              <Select value={form.frequency.toLowerCase()} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger className="bg-white border-casper/50 rounded-lg h-10 text-xs text-charcoal shadow-sm">
                  <SelectValue placeholder="Frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-juniper uppercase tracking-wider block">Resume Reason</label>
              <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                <SelectTrigger className="bg-white border-casper/50 rounded-lg h-10 text-xs text-charcoal shadow-sm">
                  <SelectValue placeholder="Reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Project Restarted">Project Restarted</SelectItem>
                  <SelectItem value="Budget Approved">Budget Approved</SelectItem>
                  <SelectItem value="Audit Complete">Audit Complete</SelectItem>
                  <SelectItem value="Alternative Found">Alternative Found</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="p-6 bg-mystic/20 border-t border-casper/30 flex justify-end gap-3 shrink-0">
          <Button 
            variant="outline" 
            onClick={onClose} 
            className="bg-white border-casper px-5 py-2.5 h-11 text-[11px] font-bold text-juniper uppercase tracking-widest hover:bg-casper/10 rounded-lg transition-all shadow-sm"
          >
            Keep Paused
          </Button>
          <button
            onClick={() => onConfirm(form)}
            className="px-6 py-2.5 bg-cyan-600 text-white rounded-lg text-[11px] font-bold uppercase tracking-widest hover:brightness-110 shadow-lg shadow-cyan-200 transition-all flex items-center gap-2"
          >
            <Play className="w-4 h-4" /> Resume Schedule
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRecurringModal({ isOpen, onClose, onConfirm, count }: any) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[480px] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col"
        showCloseButton={false}
      >
        <div className="h-[52px] px-5 bg-red-600 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <Trash2 className="w-5 h-5 text-white/80" />
            <h3 className="text-[12px] font-bold uppercase tracking-[0.2em] mt-0.5">Delete Schedule</h3>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-4">
          <div className="p-4 bg-red-50 rounded-xl border border-red-200 flex gap-3">
            <Trash2 className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-[12px] text-red-900 leading-relaxed">
              Are you sure you want to delete <span className="font-bold">{count} recurring schedule(s)</span>? Future transactions will no longer be generated. This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="px-6 py-5 bg-mystic/20 border-t border-casper/30 flex justify-end gap-3 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-white border-casper px-5 py-2.5 h-11 text-[11px] font-bold text-juniper uppercase tracking-widest hover:bg-casper/10 rounded-lg transition-all shadow-sm"
          >
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 bg-red-600 text-white rounded-lg text-[11px] font-bold uppercase tracking-widest hover:brightness-110 shadow-lg shadow-red-200 transition-all flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete Permanently
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
