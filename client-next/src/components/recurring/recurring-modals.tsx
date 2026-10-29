'use client';

import React from 'react';
import { amountLabel, restoreEnteredAmount } from '@/lib/gst';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Pencil,
  Settings,
  Pause,
  Play,
  CalendarDays,
  Trash2,
  FileText,
  X as XIcon,
  Eye,
} from 'lucide-react';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect, CurrencyInput, SegmentedControl, inp, sel } from '@/components/shared/modal-primitives';
import { FileDropzone } from '@/components/shared/file-dropzone';
import { GstRateSelect, GstIncludedSwitch } from '@/components/shared/gst-fields';

// Shared control styles for these dialogs: 40px, keyboard focus ring
const ctl = inp;

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

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Recurring Transaction' : 'Add Recurring Transaction'}
      icon={isEdit ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={onSave}
      canSave={!!form.description?.trim() && !!form.amount && Number(form.amount) > 0 && !!form.category_id && !!form.frequency && !!form.next_run}
      saveLabel={isEdit ? 'Update Schedule' : 'Schedule Transaction'}
      size="lg"
    >
      <div className="space-y-3">

        {/* Vendor + Type */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label="Service / Vendor" required>
              <Input
                className={ctl}
                placeholder="Enter vendor name..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>
          <div className="space-y-1.5">
            <p id="recurring-type-label" className="text-[13px] font-medium" style={{ color: "var(--shell-text)" }}>Transaction Type</p>
            <SegmentedControl
              labelledBy="recurring-type-label"
              className="h-10"
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v, category_id: '' })}
              options={[
                { value: 'expense', label: 'Expense', tone: 'danger' },
                { value: 'income', label: 'Income', tone: 'success' },
              ]}
            />
          </div>
        </div>

        {/* Category | Frequency | Payment Method */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="Category" required>
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger className={sel}><SelectValue placeholder="Select Category" /></SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem className="text-sm" key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Frequency" required>
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
          </Field>
          <Field label="Payment Method">
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
          </Field>
        </div>

        {/* GST Rate | GST Included | Amount */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="GST rate">
            <GstRateSelect value={form.gst_rate} onChange={(v) => setForm({ ...form, gst_rate: v })} emptyLabel="No GST" />
          </Field>
          <Field label="GST included">
            <GstIncludedSwitch checked={form.gst_included} onChange={(v) => setForm({ ...form, gst_included: v })} />
          </Field>
          <Field label={`Amount ${amountLabel(form.gst_rate, form.gst_included)}`} required>
            <CurrencyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          </Field>
        </div>

        {/* Start Date | End Date | Open-Ended */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="Start Date" required>
            <Input
              type="date"
              className={ctl}
              value={form.next_run}
              onChange={(e) => setForm({ ...form, next_run: e.target.value })}
            />
          </Field>
          <Field label="End Date (optional)">
            <Input
              type="date"
              className={`${ctl} disabled:opacity-40`}
              value={form.end_date || ''}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              disabled={form.open_ended}
            />
          </Field>
          <Field label="Open-Ended">
            <label className="flex h-10 cursor-pointer items-center gap-2.5 text-[12px] font-semibold text-[var(--shell-text-muted)]">
              <Switch
                checked={form.open_ended}
                onCheckedChange={(v) => setForm({ ...form, open_ended: v, end_date: v ? '' : form.end_date })}
              />
              <span className="whitespace-nowrap">{form.open_ended ? 'No end date' : 'Set end date'}</span>
            </label>
          </Field>
        </div>

        {/* Automation Rules */}
        <div className="pt-2 border-t border-[var(--shell-border)]">
          <div className="flex items-center gap-2 mb-2">
            <Settings aria-hidden className="w-3.5 h-3.5 text-[var(--shell-accent)]" />
            <span className="text-xs font-semibold text-[var(--shell-accent)]">Automation Rules</span>
            <div className="h-[1px] flex-1 bg-[var(--shell-border)]" />
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium" style={{ color: "var(--shell-text)" }}>Next Run Date</p>
              <p className="flex h-10 items-center text-[12px] text-[var(--shell-text-muted)]">
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
            <Field label="Auto-submit for Approval">
              <label className="flex h-10 cursor-pointer items-center gap-2.5 text-[12px] font-medium text-[var(--shell-text)]">
                <Switch checked={!!form.auto_submit} onCheckedChange={(v) => setForm({ ...form, auto_submit: v })} />
                <span>{form.auto_submit ? 'Enabled' : 'Disabled'}</span>
              </label>
            </Field>
          </div>
        </div>

        {/* Notes */}
        <Field label="Recurring Purpose / Notes">
          <Textarea
            className="w-full text-sm border-input bg-transparent text-[var(--shell-text)] rounded-lg resize-none min-h-[64px]"
            placeholder="Provide a reason for this recurring transaction..."
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        {/* File upload */}
        <div className="space-y-1.5">
          <FileDropzone label="Supporting document" onFile={onFileChange} />
          {(file || (isEdit && editing?.receipt_path)) && (
            <div className="mt-1 rounded-lg border border border-[var(--shell-border)] rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText aria-hidden className="w-5 h-5 text-[var(--shell-accent)] shrink-0" />
                <div className="leading-tight min-w-0">
                  <p className="text-[12px] font-semibold text-[var(--shell-text)] truncate max-w-[280px]">
                    {file?.name || (editing?.receipt_path ? editing.receipt_path.split('/').pop() : '')}
                  </p>
                  {file && <p className="text-[12px] text-[var(--shell-text-muted)]">{(file.size / 1024 / 1024).toFixed(1)} MB</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {file && (
                  <button type="button" aria-label="View file" onClick={() => window.open(URL.createObjectURL(file), '_blank')}
                    className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-[var(--shell-hover)] text-[var(--shell-text-muted)] hover:text-[var(--shell-accent)] transition-colors">
                    <Eye aria-hidden className="w-4 h-4" />
                  </button>
                )}
                <button type="button" aria-label="Remove file" onClick={() => onFileChange(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--shell-text-muted)] hover:text-[var(--danger)] transition-colors">
                  <XIcon aria-hidden className="w-4 h-4" />
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
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-8 px-4 text-[12px] font-medium"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Keep Active
          </Button>
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 bg-[var(--warning)] hover:opacity-90 text-[var(--warning-foreground)] rounded-lg text-[12px] font-semibold shadow-none transition-all flex items-center gap-2"
          >
            <Pause className="w-4 h-4" /> Pause Schedule
          </button>
        </>
      }
    >
      <div className="p-4 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] rounded-lg border border-[color-mix(in_srgb,var(--warning)_20%,transparent)] flex gap-3">
        <Pause className="w-5 h-5 text-[var(--warning)] shrink-0 mt-0.5" />
        <p className="text-[12px] text-[var(--warning)] leading-relaxed">
          Are you sure you want to pause <span className="font-semibold underline">{targetName}</span>? No new transactions will be auto-generated until resumed.
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
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-8 px-4 text-[12px] font-medium"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Keep Paused
          </Button>
          <button
            onClick={() => onConfirm(form)}
            disabled={!form.next_run || !form.amount || Number(form.amount) <= 0 || !form.frequency}
            className="px-6 py-2.5 btn-action-primary border border-[var(--shell-border)] text-[var(--shell-text)] rounded-lg text-[12px] font-semibold shadow-none transition-all flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> Resume Schedule
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="border border-[var(--shell-border)] rounded-lg p-4 flex items-center justify-between" style={{ background: 'var(--shell-bg)' }}>
          <div>
            <p className="text-[12px] text-[var(--info)] font-semibold">Target Schedule</p>
            <p className="text-[14px] font-semibold" style={{ color: 'var(--shell-text)' }}>{target.description}</p>
          </div>
          <div className="text-right">
            <p className="text-[12px] text-[var(--info)] font-semibold">Last Run</p>
            <p className="text-[14px] font-semibold" style={{ color: 'var(--shell-text)' }}>
              {target.last_run ? new Date(target.last_run).toLocaleDateString() : 'None'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Next Billing Date" required>
            <div className="relative">
              <CalendarDays aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--shell-accent)]" />
              <Input
                type="date"
                className={`${ctl} pl-10`}
                value={form.next_run}
                onChange={(e) => setForm({ ...form, next_run: e.target.value })}
              />
            </div>
          </Field>
          <Field label={`Amount ${amountLabel(form.gst_rate, form.gst_included)}`} required>
            <CurrencyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          </Field>
        </div>

        <Field label="Frequency" required>
          <Select value={form.frequency.toLowerCase()} onValueChange={(v) => setForm({ ...form, frequency: v })}>
            <SelectTrigger className={sel}>
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
        </Field>
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
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-8 px-4 text-[12px] font-medium"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 bg-[var(--danger)] text-[var(--danger-foreground)] rounded-lg text-[12px] font-semibold transition-all flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete Permanently
          </button>
        </>
      }
    >
      <div className="space-y-2.5">
        <div className="p-4 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] rounded-lg border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex gap-3">
          <Trash2 className="w-5 h-5 text-[var(--danger)] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[var(--danger)] leading-relaxed">
            Are you sure you want to delete <span className="font-semibold text-[var(--danger)]">{count} recurring schedule(s)</span>? Future transactions will no longer be generated. This action cannot be undone.
          </p>
        </div>
      </div>
    </ModuleModal>
  );
}
