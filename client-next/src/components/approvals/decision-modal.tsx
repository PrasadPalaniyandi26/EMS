'use client';

import React from 'react';
import { FileText } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field } from '@/components/shared/modal-primitives';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

// Reference, employee and amount of the request being decided, plus its description when it has one.
export function RequestSummary({ request, refId }: { request: any; refId?: string | number }) {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--shell-border)' }}>
      <table className="w-full text-[12px]">
        <thead className="border-b font-semibold" style={{ borderColor: 'var(--shell-border)', background: 'var(--table-header)', color: 'var(--shell-text)' }}>
          <tr>
            <th className="px-4 py-2 text-left">Reference</th>
            <th className="px-4 py-2 text-left">Employee</th>
            <th className="px-4 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-4 py-3 font-semibold" style={{ color: 'var(--shell-accent)' }}>{request.code || `#${refId ?? request.id}`}</td>
            <td className="px-4 py-3 font-medium" style={{ color: 'var(--shell-text)' }}>{request.submitted_by_name || '—'}</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: 'var(--shell-text)' }}>{formatCurrency(request.amount, currency)}</td>
          </tr>
          {request.description && (
            <tr className="border-t" style={{ borderColor: 'var(--shell-border)' }}>
              <td colSpan={3} className="px-4 py-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-[13px] font-medium" style={{ color: 'var(--shell-text)' }}>
                  <FileText aria-hidden size={12} /> Internal notes
                </p>
                <p className="text-[12px]" style={{ color: 'var(--shell-text)' }}>{request.description}</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

type Tone = 'primary' | 'danger' | 'info';

const TONE_BUTTON: Record<Tone, { className?: string; style?: React.CSSProperties }> = {
  primary: { style: { background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' } },
  danger: { className: 'bg-[var(--danger)] text-[var(--danger-foreground)] hover:bg-[var(--danger)]/90' },
  info: { className: 'bg-[var(--info)] text-[var(--info-foreground)] hover:bg-[var(--info)]/90' },
};

interface DecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  request?: any;
  /** Shown in the summary when the request has no reference code */
  refId?: string | number;
  title: string;
  icon: React.ReactNode;
  tone?: Tone;
  confirmLabel: string;
  busyLabel?: string;
  /** The note box: id, label, hint text and whether it must be filled in */
  field: { id: string; label: string; placeholder: string; required?: boolean; requiredMessage?: string };
  onConfirm: (text: string) => void | Promise<void>;
  /** Content before the note box, after the summary */
  top?: React.ReactNode;
  /** Content after the note box */
  children?: React.ReactNode;
}

// The one approval-style decision dialog (approve, reject, send back, void): request summary, one note box,
// Cancel and the main action. Each caller only supplies its wording, tone and extras.
export function DecisionModal({
  isOpen, onClose, request, refId, title, icon, tone = 'primary', confirmLabel, busyLabel, field, onConfirm, top, children,
}: DecisionModalProps) {
  const [text, setText] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) { setText(''); setError(''); setSaving(false); }
  }, [isOpen, request?.id]);

  if (!request) return null;

  const handleConfirm = async () => {
    if (field.required && !text.trim()) { setError(field.requiredMessage ?? 'This field is required.'); return; }
    if (saving) return;
    setSaving(true);
    try { await onConfirm(text); }
    finally { setSaving(false); }
  };

  const btn = TONE_BUTTON[tone];

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={icon}
      isDestructive={tone === 'danger'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving} className="h-8 px-4 text-[12px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving || (field.required && !text.trim())} className={cn('h-8 px-5 text-[12px] font-semibold', btn.className)} style={btn.style}>
            {saving && <span aria-hidden className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {saving && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <RequestSummary request={request} refId={refId} />
        {top}
        <Field label={field.label} required={field.required} error={error}>
          <Textarea
            id={field.id}
            className="h-24 w-full resize-none rounded-md border border-input bg-transparent p-3 text-[13px] outline-none aria-invalid:border-[var(--danger)] focus-visible:border-[var(--shell-accent)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]"
            style={{ color: 'var(--shell-text)' }}
            placeholder={field.placeholder}
            value={text}
            onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) setError(''); }}
          />
        </Field>
        {children}
      </div>
    </ModuleModal>
  );
}
