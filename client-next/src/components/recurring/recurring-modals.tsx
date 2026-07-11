'use client';

import React, { useRef, useCallback } from 'react';
import { amountLabel, restoreEnteredAmount, GST_RATES } from '@/lib/gst';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Plus,
  Pencil,
  Settings,
  Pause,
  Play,
  CalendarDays,
  Trash2,
  UploadCloud,
  FileText,
  X as XIcon,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { CurrencyInput } from '@/components/shared/modal-primitives';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

interface RecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editing: any | null;
  form: any;
  setForm: (form: any) => void;
  categories: any[];
  file: File | null;
  onFileChange: (f: File | null) => void;
}

export function RecurringModal({
  isOpen,
  onClose,
  onSave,
  editing,
  form,
  setForm,
  categories,
  file,
  onFileChange,
}: RecurringModalProps) {
  const filteredCategories = categories.filter((c) => c.type === form.type);
  const isEdit = !!editing;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const validateFile = (f: File) => {
    if (!ALLOWED_TYPES.includes(f.type)) { toast.error('Only PDF, JPG, PNG, WEBP allowed.'); return false; }
    if (f.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB.'); return false; }
    return true;
  };
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && validateFile(dropped)) onFileChange(dropped);
  }, [onFileChange]);
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && validateFile(f)) onFileChange(f);
    e.target.value = '';
  };

  const inp = 'w-full h-10 text-sm modal-input border border-[var(--shell-border)] text-[var(--shell-text)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--shell-accent)]/50 rounded-lg placeholder:text-[var(--shell-text-muted)]';
  const sel = 'w-full h-10 text-sm modal-input border border-[var(--shell-border)] text-[var(--shell-text)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--shell-accent)]/50 rounded-lg';
  const lbl = 'text-[10px] font-bold modal-label';

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Recurring Transaction' : 'Add Recurring Transaction'}
      icon={isEdit ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={onSave}
      saveLabel={isEdit ? 'Update Schedule' : 'Schedule Transaction'}
      maxWidth="sm:max-w-[860px]"
    >
      <div className="space-y-2.5">

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
            <div className="flex p-1 modal-toggle-track rounded-xl gap-1 h-10">
              {([
                { val: 'expense', active: 'text-rose-400 border border-rose-400 shadow-sm' },
                { val: 'income',  active: 'text-emerald-500 border border-emerald-500 shadow-sm' },
              ]).map(({ val, active }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setForm({ ...form, type: val, category_id: '' })}
                  className={`flex-1 text-xs font-bold rounded-md transition-all ${
                    form.type === val ? active : 'text-[var(--shell-text-muted)] border border-transparent hover:text-[var(--shell-text)]'
                  }`}
                >
                  {val.charAt(0).toUpperCase() + val.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Category, Amount, Frequency */}
        {/* Row 2: Category | Frequency | Payment Method */}
        <div className="grid grid-cols-3 gap-x-6">
          <div className="space-y-1">
            <label className={lbl}>Category</label>
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger className={sel}><SelectValue placeholder="Select Category" /></SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem className="text-sm" key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className={lbl}>Frequency</label>
            <Select value={form.frequency.toLowerCase()} onValueChange={(v) => setForm({ ...form, frequency: v })}>
              <SelectTrigger className={sel}><SelectValue placeholder="Select Frequency" /></SelectTrigger>
              <SelectContent>
                <SelectItem className="text-sm" value="daily">Daily</SelectItem>
                <SelectItem className="text-sm" value="weekly">Weekly</SelectItem>
                <SelectItem className="text-sm" value="biweekly">Bi-Weekly</SelectItem>
                <SelectItem className="text-sm" value="monthly">Monthly</SelectItem>
                <SelectItem className="text-sm" value="quarterly">Quarterly</SelectItem>
                <SelectItem className="text-sm" value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className={lbl}>Payment Method</label>
            <Select value={form.payment_method || 'cash'} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger className={sel}><SelectValue placeholder="Select Method" /></SelectTrigger>
              <SelectContent>
                <SelectItem className="text-sm" value="cash">Cash</SelectItem>
                <SelectItem className="text-sm" value="card">Card</SelectItem>
                <SelectItem className="text-sm" value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem className="text-sm" value="upi">UPI</SelectItem>
                <SelectItem className="text-sm" value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2b: GST Rate | GST Included | Amount */}
        <div className="grid grid-cols-3 gap-x-6">
          <div className="space-y-1">
            <label className={lbl}>GST Rate</label>
            <div className="relative">
              <select
                className={`${sel} appearance-none pr-8`}
                value={form.gst_rate}
                onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}
              >
                <option value="">No GST</option>
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
          <div className="space-y-1">
            <label className={lbl}>GST Included</label>
            <div className="flex items-center gap-2.5 h-10">
              <button
                type="button"
                role="switch"
                aria-checked={form.gst_included}
                onClick={() => setForm({ ...form, gst_included: !form.gst_included })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${form.gst_included ? 'bg-[var(--shell-accent)]' : 'bg-[var(--shell-border)]'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform ${form.gst_included ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase tracking-wide whitespace-nowrap">
                {form.gst_included ? 'Included' : 'Not Included'}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <label className={lbl}>Amount {amountLabel(form.gst_rate, form.gst_included)}</label>
            <CurrencyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          </div>
        </div>

        {/* Row 3: Start Date | End Date | Open-Ended toggle */}
        <div className="grid grid-cols-3 gap-x-6">
          <div className="space-y-1">
            <label className={lbl}>Start Date</label>
            <input
              type="date"
              className={inp}
              value={form.next_run}
              onChange={(e) => setForm({ ...form, next_run: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={lbl}>End Date <span className="text-[9px] font-normal normal-case opacity-60">(optional)</span></label>
            <input
              type="date"
              className={inp}
              value={form.end_date || ''}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              disabled={form.open_ended}
              style={form.open_ended ? { opacity: 0.35, pointerEvents: 'none' } : {}}
            />
          </div>
          <div className="space-y-1">
            <label className={lbl}>Open-Ended</label>
            <div className="flex items-center gap-2.5 h-10">
              <button
                type="button"
                role="switch"
                aria-checked={form.open_ended}
                onClick={() => setForm({ ...form, open_ended: !form.open_ended, end_date: !form.open_ended ? '' : form.end_date })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${form.open_ended ? 'bg-[var(--shell-accent)]' : 'bg-[var(--shell-border)]'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform ${form.open_ended ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-[11px] font-semibold text-[var(--shell-text-muted)] whitespace-nowrap">
                {form.open_ended ? 'No end date' : 'Set end date'}
              </span>
            </div>
          </div>
        </div>

        {/* Automation Rules */}
        <div className="pt-2 border-t border-[var(--shell-border)]">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="w-3.5 h-3.5 text-[var(--shell-accent)]" />
            <span className="text-xs font-black uppercase tracking-[0.2em] text-[var(--shell-accent)]">Automation Rules</span>
            <div className="h-[1px] flex-1 modal-divider" />
          </div>
          <div className="grid grid-cols-2 gap-x-6">
            <div className="space-y-1">
              <label className={lbl}>Next Run Date</label>
              <p className="text-[11px] text-[var(--shell-text-muted)] h-10 flex items-center">
                {form.next_run
                  ? (() => {
                      const d = new Date(form.next_run + 'T00:00:00');
                      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
                    })()
                  : '—'}
                {form.next_run && form.frequency && (
                  <span className="ml-1.5 text-[var(--shell-accent)] font-semibold capitalize">· {form.frequency}</span>
                )}
              </p>
            </div>
            <div className="space-y-1">
              <label className={lbl}>Auto-submit for Approval</label>
              <div className="flex items-center h-10">
                <label className="relative inline-flex items-center cursor-pointer">
                  <Checkbox
                    checked={form.auto_submit}
                    onCheckedChange={(checked) => setForm({ ...form, auto_submit: !!checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-casper after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--shell-accent)]" style={{ background: 'var(--shell-border)' }}></div>
                  <span className="ml-2.5 text-[11px] font-medium text-[var(--shell-text)]">{form.auto_submit ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <label className={lbl}>Recurring Purpose / Notes</label>
          <Textarea
            className="w-full text-sm modal-input rounded-lg resize-none min-h-[64px]"
            placeholder="Provide a reason for this recurring transaction..."
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        {/* File Upload */}
        <div className="space-y-1.5">
          <label className={lbl}>Supporting Document</label>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileInput} />
          <div
            className={`border-2 border-dashed rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer transition-all group ${dragging ? 'border-[var(--shell-accent)]/50 modal-section' : 'border-[var(--shell-border)] modal-section hover:border-[var(--shell-accent)]/50'}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
          >
            <UploadCloud className={`w-7 h-7 shrink-0 transition-colors ${dragging ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-muted)] group-hover:text-[var(--shell-accent)]'}`} />
            <div>
              <p className="text-[12px] text-[var(--shell-text-muted)] font-medium">
                Drag & drop or <span className="text-[var(--shell-accent)] font-bold">browse files</span>
              </p>
              <p className="text-[10px] text-[var(--shell-text-muted)] uppercase tracking-tight">PDF, JPG, PNG · max 10 MB</p>
            </div>
          </div>
          {(file || (isEdit && editing?.receipt_path)) && (
            <div className="mt-1 modal-section border border-[var(--shell-border)] rounded-lg px-3 py-2 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-5 h-5 text-[var(--shell-accent)] shrink-0" />
                <div className="leading-tight min-w-0">
                  <p className="text-[12px] font-bold text-[var(--shell-text)] truncate max-w-[280px]">
                    {file?.name || (editing?.receipt_path ? editing.receipt_path.split('/').pop() : '')}
                  </p>
                  {file && <p className="text-[10px] text-[var(--shell-text-muted)] uppercase tracking-tighter">{(file.size / 1024 / 1024).toFixed(1)} MB</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {file && (
                  <button type="button" onClick={() => window.open(URL.createObjectURL(file), '_blank')}
                    className="p-1.5 rounded hover:bg-[var(--shell-hover)] text-[var(--shell-text-muted)] hover:text-[var(--shell-accent)] transition-colors">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => onFileChange(null)}
                  className="p-1.5 rounded hover:bg-rose-500/10 text-[var(--shell-text-muted)] hover:text-rose-400 transition-colors">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModuleModal>
  );
}

interface PauseRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
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
  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Pause Schedule"
      icon={<Pause className="w-4 h-4" />}
      maxWidth="sm:max-w-[480px]"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-8 px-4 text-[11.5px] font-medium"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Keep Active
          </Button>
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold uppercase tracking-widest shadow-none transition-all flex items-center gap-2"
          >
            <Pause className="w-4 h-4" /> Pause Schedule
          </button>
        </>
      }
    >
      <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-400/20 flex gap-3">
        <Pause className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-600 dark:text-amber-300 leading-relaxed">
          Are you sure you want to pause <span className="font-bold underline">{targetName}</span>? No new transactions will be auto-generated until resumed.
        </p>
      </div>
    </ModuleModal>
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
    gst_rate: '',
    gst_included: false,
  });

  React.useEffect(() => {
    if (target) {
      const gstIncluded = target.gst_included ?? false;
      setForm({
        next_run: (target.next_run_date || '').split('T')[0],
        amount: String(restoreEnteredAmount(target.net_amount, target.total_amount, gstIncluded, target.amount ?? 0)),
        frequency: target.frequency || 'monthly',
        gst_rate: target.gst_rate ? `${target.gst_rate}%` : '',
        gst_included: gstIncluded,
      });
    }
  }, [target]);

  if (!target) return null;

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Resume Schedule"
      icon={<Play className="w-4 h-4" />}
      maxWidth="sm:max-w-[500px]"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-8 px-4 text-[11.5px] font-medium"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Keep Paused
          </Button>
          <button
            onClick={() => onConfirm(form)}
            className="px-6 py-2.5 btn-action-primary border border-[var(--shell-border)] text-[var(--shell-text)] rounded-lg text-[11px] font-bold uppercase tracking-widest shadow-none transition-all flex items-center gap-2"
          >
            <Play className="w-4 h-4" /> Resume Schedule
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="border border-[var(--shell-border)] rounded-xl p-4 flex items-center justify-between shadow-sm" style={{ background: 'var(--shell-bg)' }}>
          <div>
            <p className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold uppercase tracking-wider">Target Schedule</p>
            <p className="text-[14px] font-bold" style={{ color: 'var(--shell-text)' }}>{target.description}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold uppercase tracking-wider">Last Run</p>
            <p className="text-[14px] font-bold" style={{ color: 'var(--shell-text)' }}>
              {target.last_run ? new Date(target.last_run).toLocaleDateString() : 'None'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold modal-label block">Next Billing Date</label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--shell-accent)]" />
              <Input
                type="date"
                className="modal-input border border-[var(--shell-border)] rounded-lg pl-10 h-10 text-xs text-[var(--shell-text)] shadow-sm"
                value={form.next_run}
                onChange={(e) => setForm({ ...form, next_run: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold modal-label block">Amount {amountLabel(form.gst_rate, form.gst_included)}</label>
            <CurrencyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold modal-label block">Frequency</label>
          <Select value={form.frequency.toLowerCase()} onValueChange={(v) => setForm({ ...form, frequency: v })}>
            <SelectTrigger className="modal-input border border-[var(--shell-border)] rounded-lg h-10 text-xs text-[var(--shell-text)] shadow-sm">
              <SelectValue placeholder="Frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="biweekly">Bi-Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </ModuleModal>
  );
}

export function DeleteRecurringModal({ isOpen, onClose, onConfirm, count }: any) {
  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Schedule"
      icon={<Trash2 className="w-4 h-4" />}
      isDestructive={true}
      maxWidth="sm:max-w-[480px]"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-8 px-4 text-[11.5px] font-medium"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 bg-red-600 text-white rounded-lg text-[11px] font-bold uppercase tracking-widest hover:brightness-110 shadow-lg shadow-red-200/10 transition-all flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete Permanently
          </button>
        </>
      }
    >
      <div className="space-y-2.5">
        <div className="p-4 bg-rose-500/10 rounded-xl border border-rose-400/20 flex gap-3">
          <Trash2 className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-rose-600 dark:text-rose-300 leading-relaxed">
            Are you sure you want to delete <span className="font-bold text-rose-600 dark:text-rose-300">{count} recurring schedule(s)</span>? Future transactions will no longer be generated. This action cannot be undone.
          </p>
        </div>
      </div>
    </ModuleModal>
  );
}
