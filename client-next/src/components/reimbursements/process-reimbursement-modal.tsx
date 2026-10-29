'use client';

import React from 'react';
import { CreditCard } from 'lucide-react';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProcessReimbursementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { status: 'PAID' | 'ON_HOLD'; reference: string; note: string }) => Promise<void>;
  selectedCount: number;
  mode: 'single' | 'bulk';
}

export function ProcessReimbursementModal({
  isOpen,
  onClose,
  onConfirm,
  selectedCount,
  mode,
}: ProcessReimbursementModalProps) {
  const [status, setStatus] = React.useState<'PAID' | 'ON_HOLD'>('PAID');
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [referenceError, setReferenceError] = React.useState('');

  React.useEffect(() => {
    if (isOpen) {
      setStatus('PAID');
      setReference('');
      setNote('');
      setSaving(false);
      setReferenceError('');
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (saving) return; // prevent double-click
    if (status === 'PAID' && !reference.trim()) {
      setReferenceError('Payment reference is required when marking as Paid.');
      return;
    }
    setSaving(true);
    try {
      await onConfirm({ status, reference: reference.trim(), note: note.trim() });
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'bulk'
    ? `Process Payment — ${selectedCount} Transaction${selectedCount !== 1 ? 's' : ''}`
    : 'Process Payment';

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={<CreditCard className="w-4 h-4" />}
      onSave={handleSave}
      saveLabel={saving ? 'Processing...' : 'Confirm'}
      canSave={!saving && (status !== 'PAID' || !!reference.trim())}
      size="sm"
    >
      <div className="space-y-4 p-1">
        <div className="space-y-1.5">
          <label htmlFor="reimb-status" className="text-[12px] font-semibold text-[var(--shell-text)] block">Status</label>
          <Select value={status} onValueChange={(v) => setStatus(v as 'PAID' | 'ON_HOLD')}>
            <SelectTrigger id="reimb-status" className="border-input bg-transparent text-[var(--shell-text)] border border-[var(--shell-border)] rounded-lg h-9 text-xs text-[var(--shell-text)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PAID">Mark as Paid</SelectItem>
              <SelectItem value="ON_HOLD">Put On Hold</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reimb-reference" className="text-[12px] font-semibold text-[var(--shell-text)] block">
            Payment Reference
            {status === 'PAID' && <span className="text-[var(--danger)] ml-0.5">*</span>}
            {status === 'ON_HOLD' && <span className="text-[12px] font-normal text-[var(--shell-text-muted)] ml-1">(optional)</span>}
          </label>
          <Input id="reimb-reference" aria-required={status === "PAID"} aria-invalid={referenceError ? true : undefined}
            className="border-input bg-transparent text-[var(--shell-text)] border border-[var(--shell-border)] rounded-lg h-9 text-xs text-[var(--shell-text)]"
            placeholder="UTR / Cheque No / Bank Ref"
            value={reference}
            onChange={(e) => { setReference(e.target.value); setReferenceError(''); }}
          />
          {referenceError && (
            <p role="alert" className="text-[12px] text-[var(--danger)] mt-0.5">{referenceError}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reimb-note" className="text-[12px] font-semibold text-[var(--shell-text)] block">
            Note <span className="text-[12px] font-normal text-[var(--shell-text-muted)]">(optional)</span>
          </label>
          <Textarea id="reimb-note"
            className="border-input bg-transparent text-[var(--shell-text)] border border-[var(--shell-border)] rounded-lg text-xs text-[var(--shell-text)] resize-none"
            rows={2}
            placeholder="Additional notes about this payment..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {mode === 'bulk' && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-[12px]"
            style={{ background: 'var(--shell-hover)', borderColor: 'var(--shell-border)', color: 'var(--shell-text-muted)' }}>
            <CreditCard className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>This status and reference will be applied to all <strong>{selectedCount}</strong> selected transactions.</span>
          </div>
        )}
      </div>
    </ModuleModal>
  );
}
