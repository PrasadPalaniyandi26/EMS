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
import { PickSelect } from '@/components/manage/pick-select';
import { useCategoryTypes } from '@/hooks/use-queries';

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
  const isEdit = !!editing;
  const { data: categoryTypes } = useCategoryTypes(form.type);

  // The type is not stored on the schedule: it is the type of the chosen category.
  const [typeId, setTypeId] = React.useState('');
  React.useEffect(() => {
    if (!isOpen) return;
    const saved = categories.find((c) => String(c.id) === String(form.category_id));
    setTypeId(saved?.type_id ? String(saved.type_id) : '');
  }, [isOpen, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = (categoryTypes || []).map((t) => ({ id: t.id, name: t.name }));
  const categoryOptions = categories
    .filter((c) => c.type === form.type && String(c.type_id ?? '') === typeId)
    .map((c) => ({ id: c.id, name: c.name }));
  if (form.category_id && !categoryOptions.some((o) => String(o.id) === String(form.category_id))) {
    const saved = categories.find((c) => String(c.id) === String(form.category_id));
    if (saved) categoryOptions.push({ id: saved.id, name: saved.name });
  }

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Recurring Transaction' : 'Add Recurring Transaction'}
      icon={isEdit ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={onSave}
      canSave={!!form.description?.trim() && !!form.amount && Number(form.amount) > 0 && !!form.category_id && !!form.frequency && !!form.next_run}
      saveLabel={isEdit ? 'Update Schedule' : 'Schedule Transaction'}
      size="xl"
    >
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 md:grid-cols-3">

        {/* Column 1: what is billed and when */}
        <div className="space-y-3">
          <Field label="Service / Vendor" required>
            <Input
              className={ctl}
              placeholder="Enter vendor name..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Frequency" required>
            <NativeSelect value={form.frequency.toLowerCase()} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              <option value="">Select frequency</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </NativeSelect>
          </Field>
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
              min={form.next_run || undefined}
              value={form.end_date || ''}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              disabled={form.open_ended}
            />
          </Field>
          <label className="flex h-10 cursor-pointer items-center justify-between gap-3 rounded-md border border-input px-3 text-[13px] font-medium text-[var(--shell-text)]">
            <span>Open-ended (no end date)</span>
            <Switch
              checked={form.open_ended}
              onCheckedChange={(v) => setForm({ ...form, open_ended: v, end_date: v ? '' : form.end_date })}
              aria-label="Open-ended"
            />
          </label>
        </div>

        {/* Column 2: what kind of transaction, and its type and category */}
        <div className="space-y-3">
          <div>
            <p id="recurring-type-label" className="mb-2 block text-[13px] font-medium" style={{ color: 'var(--shell-text)' }}>Transaction Type</p>
            <SegmentedControl
              labelledBy="recurring-type-label"
              value={form.type}
              onChange={(v) => { setForm({ ...form, type: v, category_id: '' }); setTypeId(''); }}
              options={[
                { value: 'expense', label: 'Expense', tone: 'danger' },
                { value: 'income', label: 'Income', tone: 'success' },
              ]}
            />
          </div>
          <PickSelect
            label={form.type === 'income' ? 'Income Type' : 'Expense Type'}
            placeholder="Select type..."
            value={typeId}
            onChange={(id) => { setTypeId(id); setForm({ ...form, category_id: '' }); }}
            options={typeOptions}
            emptyHint="No types yet. An admin can add them with Category."
          />
          <PickSelect
            label={form.type === 'income' ? 'Income Category' : 'Expense Category'}
            required
            placeholder="Select category..."
            value={form.category_id ? String(form.category_id) : ''}
            onChange={(id) => setForm({ ...form, category_id: id })}
            options={categoryOptions}
            disabled={!typeId}
            emptyHint="No categories for this type yet. An admin can add them with Category."
          />
        </div>

        {/* Column 3: how it is paid and how much */}
        <div className="space-y-3">
          <Field label="Payment Method">
            <NativeSelect value={form.payment_method || 'cash'} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
            </NativeSelect>
          </Field>
          <Field label="GST & Inclusion">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <GstRateSelect value={form.gst_rate} onChange={(v) => setForm({ ...form, gst_rate: v })} emptyLabel="No GST" />
              </div>
              <GstIncludedSwitch checked={form.gst_included} onChange={(v) => setForm({ ...form, gst_included: v })} />
            </div>
          </Field>
          <Field label={`Amount ${amountLabel(form.gst_rate, form.gst_included)}`} required>
            <CurrencyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          </Field>
          <label className="flex h-10 cursor-pointer items-center justify-between gap-3 rounded-md border border-input px-3 text-[13px] font-medium text-[var(--shell-text)]">
            <span>Auto-submit for approval</span>
            <Switch checked={!!form.auto_submit} onCheckedChange={(v) => setForm({ ...form, auto_submit: v })} aria-label="Auto-submit for approval" />
          </label>
        </div>

        {/* Notes and proof, across the full width */}
        <div className="md:col-span-2">
          <Field label="Recurring Purpose / Notes">
            <Textarea
              className="min-h-[96px] w-full resize-none rounded-md border border-input bg-transparent text-sm text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus-visible:border-[var(--shell-accent)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]"
              placeholder="Provide a reason for this recurring transaction..."
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-1.5">
          <FileDropzone label="Supporting document" onFile={onFileChange} />
          {(file || (isEdit && editing?.receipt_path)) && (
            <div className="mt-1 flex items-center justify-between rounded-lg border border-[var(--shell-border)] px-3 py-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText aria-hidden className="h-5 w-5 shrink-0 text-[var(--shell-accent)]" />
                <div className="min-w-0 leading-tight">
                  <p className="max-w-[200px] truncate text-[12px] font-semibold text-[var(--shell-text)]">
                    {file?.name || (editing?.receipt_path ? editing.receipt_path.split('/').pop() : '')}
                  </p>
                  {file && <p className="text-[12px] text-[var(--shell-text-muted)]">{(file.size / 1024 / 1024).toFixed(1)} MB</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {file && (
                  <button type="button" aria-label="View file" onClick={() => window.open(URL.createObjectURL(file), '_blank')}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-accent)]">
                    <Eye aria-hidden className="h-4 w-4" />
                  </button>
                )}
                <button type="button" aria-label="Remove file" onClick={() => onFileChange(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--shell-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[var(--danger)]">
                  <XIcon aria-hidden className="h-4 w-4" />
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
