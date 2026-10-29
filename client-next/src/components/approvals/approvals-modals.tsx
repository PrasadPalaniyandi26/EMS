'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  Settings,
  FileText,
  CornerUpLeft,
  Wallet,
  Ban,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { useAuthStore } from '@/stores/auth-store';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: any) => void;
  selectedRequest?: any;
}

export function ApproveModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const [comment, setComment] = React.useState('');
  const [isClaimable, setIsClaimable] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Sync isClaimable whenever modal opens or selected request changes — prevents stale init value
  React.useEffect(() => {
    if (isOpen) {
      setIsClaimable(selectedRequest?.is_claimable ?? false);
      setComment('');
      setSaving(false);
    }
  }, [isOpen, selectedRequest?.id]);

  if (!selectedRequest) return null;

  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onConfirm({ comment, isClaimable });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Approve Expense Request"
      icon={<CheckCircle2 className="w-4 h-4" />}
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-4 text-[12px] font-medium"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Cancel
          </Button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-8 py-2.5 btn-action-primary border border-[var(--shell-border)] text-[var(--shell-text)] text-[12px] font-semibold rounded-lg shadow-none active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />}
            Confirm Approval
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className={`rounded-lg border overflow-x-auto ${selectedRequest.needs_reimbursement ? 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_5%,transparent)]' : 'border-[var(--shell-border)] rounded-lg border'}`}>
          {selectedRequest.needs_reimbursement && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]">
              <Wallet className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
              <span className="text-[12px] font-semibold text-[var(--warning)]">Reimbursement Required — Employee paid out-of-pocket</span>
            </div>
          )}
          <table className="w-full text-[12px]">
            <thead className={`border-b font-semibold ${selectedRequest.needs_reimbursement ? 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)]' : 'rounded-lg border border-[var(--shell-border)] text-[var(--shell-text)]'}`}>
              <tr>
                <th className="px-4 py-2 text-left">Reference ID</th>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className={`border-b ${selectedRequest.needs_reimbursement ? 'border-[color-mix(in_srgb,var(--warning)_20%,transparent)]' : 'border-[var(--shell-border)]'}`}>
                <td className="px-4 py-3 font-semibold text-[var(--info)]">{selectedRequest.code || `#${selectedRequest.id}`}</td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--shell-text)' }}>{selectedRequest.submitted_by_name || '—'}</td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--shell-text)' }}>{formatCurrency(selectedRequest.amount, currency)}</td>
              </tr>
              {selectedRequest.description && (
                <tr>
                  <td colSpan={3} className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-[var(--shell-text)] mb-1 flex items-center gap-1.5">
                      <FileText size={11} /> Internal Notes
                    </p>
                    <p className="text-[12px]" style={{ color: 'var(--shell-text)' }}>{selectedRequest.description}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <label htmlFor="approve-comment" className="text-[13px] font-medium text-[var(--shell-text)] flex items-center gap-2">
            <MessageSquare size={14} /> Approval Comments (Optional)
          </label>
          <Textarea id="approve-comment"
            className="w-full h-24 p-3 border-input bg-transparent text-[var(--shell-text)] border border-[var(--shell-border)] rounded-lg text-[13px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--shell-accent)]/50 resize-none"
            placeholder="Enter any notes or justification for this approval..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        {selectedRequest.gst_rate != null && (
          <div className="flex items-center justify-between rounded-lg border p-4 rounded-lg border border-[var(--shell-border)]">
            <div className="flex items-center gap-3">
              <Settings className="text-[var(--success)]" size={20} />
              <div>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--shell-text)' }}>Is Claimable?</p>
                <p className="text-[12px] text-[var(--shell-text-muted)] font-medium">GST ({selectedRequest.gst_rate}%) can be claimed back from Government</p>
              </div>
            </div>
            <Switch checked={isClaimable} onCheckedChange={setIsClaimable} />
          </div>
        )}

        {selectedRequest.needs_reimbursement && (
          <div className="flex items-center justify-between rounded-lg border p-4 rounded-lg border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_5%,transparent)]">
            <div className="flex items-center gap-3">
              <Wallet className="text-[var(--warning)]" size={20} />
              <div>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--shell-text)' }}>Reimbursement Requested</p>
                <p className="text-[12px] text-[var(--shell-text-muted)] font-medium">Employee paid out-of-pocket and needs to be reimbursed</p>
              </div>
            </div>
            <span className="text-[12px] font-semibold text-[var(--warning)] px-2 py-1 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] rounded-md">Pending</span>
          </div>
        )}

      </div>
    </ModuleModal>
  );
}

export function RejectModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) { setComment(''); setError(''); setSaving(false); }
  }, [isOpen]);

  if (!selectedRequest) return null;

  const handleConfirm = async () => {
    if (!comment.trim()) { setError('Rejection reason is required.'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await onConfirm({ comment });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Reject Expense Request"
      icon={<XCircle className="w-4 h-4" />}
      isDestructive={true}
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-4 text-[12px] font-medium"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Cancel
          </Button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-8 py-2.5 bg-[var(--danger)] text-[var(--danger-foreground)] text-[12px] font-semibold rounded-lg active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />}
            Confirm Rejection
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-[var(--shell-border)] rounded-lg border overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="rounded-lg border border-b border-[var(--shell-border)] text-[var(--shell-text)] font-semibold">
              <tr>
                <th className="px-4 py-2 text-left">Reference ID</th>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--shell-border)]">
                <td className="px-4 py-3 font-semibold text-[var(--info)]">{selectedRequest.code || `#${selectedRequest.id}`}</td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--shell-text)' }}>{selectedRequest.submitted_by_name || '—'}</td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--shell-text)' }}>{formatCurrency(selectedRequest.amount, currency)}</td>
              </tr>
              {selectedRequest.description && (
                <tr>
                  <td colSpan={3} className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-[var(--shell-text)] mb-1 flex items-center gap-1.5">
                      <FileText size={11} /> Internal Notes
                    </p>
                    <p className="text-[12px]" style={{ color: 'var(--shell-text)' }}>{selectedRequest.description}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <label htmlFor="reject-reason" className="text-[13px] font-medium text-[var(--shell-text)] flex items-center gap-2">
            <MessageSquare size={14} /> Rejection Reason <span className="text-[var(--danger)]">*</span>
          </label>
          <Textarea id="reject-reason" aria-required="true" aria-invalid={error ? true : undefined} aria-describedby={error ? "reject-reason-error" : undefined}
            className={`w-full h-24 p-3 border-input bg-transparent text-[var(--shell-text)] border rounded-lg text-[13px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--shell-accent)]/50 resize-none ${error ? 'border-[var(--danger)]' : 'border-[var(--shell-border)]'}`}
            placeholder="Provide a detailed reason for rejecting this request..."
            value={comment}
            onChange={(e) => { setComment(e.target.value); if (e.target.value.trim()) setError(''); }}
          />
          {error && <p id="reject-reason-error" role="alert" className="text-[12px] text-[var(--danger)] font-medium">{error}</p>}
        </div>
      </div>
    </ModuleModal>
  );
}

export function VoidModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (isOpen) { setReason(''); setSaving(false); } }, [isOpen]);

  if (!selectedRequest) return null;

  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    try { await onConfirm({ reason }); }
    finally { setSaving(false); }
  };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Void Transaction"
      icon={<Ban className="w-4 h-4" />}
      isDestructive
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
            onClick={handleConfirm}
            disabled={saving}
            className="px-8 py-2.5 bg-[var(--danger)] text-[var(--danger-foreground)] text-[12px] font-semibold rounded-lg active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'Voiding...' : 'Confirm Void'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-[var(--shell-border)] rounded-lg border overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="rounded-lg border border-b border-[var(--shell-border)] text-[var(--shell-text)] font-semibold">
              <tr>
                <th className="px-4 py-2 text-left">Reference ID</th>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--shell-border)]">
                <td className="px-4 py-3 font-semibold text-[var(--info)]">{selectedRequest.code || `#${selectedRequest.transaction_id}`}</td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--shell-text)' }}>{selectedRequest.submitted_by_name || '—'}</td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--shell-text)' }}>{formatCurrency(selectedRequest.amount, currency)}</td>
              </tr>
              {selectedRequest.description && (
                <tr>
                  <td colSpan={3} className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-[var(--shell-text)] mb-1 flex items-center gap-1.5">
                      <FileText size={11} /> Internal Notes
                    </p>
                    <p className="text-[12px]" style={{ color: 'var(--shell-text)' }}>{selectedRequest.description}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <label htmlFor="void-reason" className="text-[13px] font-medium text-[var(--shell-text)] flex items-center gap-2">
            <MessageSquare size={14} /> Reason for Voiding (optional)
          </label>
          <Textarea id="void-reason"
            className="w-full h-24 p-3 border-input bg-transparent text-[var(--shell-text)] border border-[var(--shell-border)] rounded-lg text-[13px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--danger)_50%,transparent)] focus:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] resize-none"
            placeholder="Explain why this approved transaction is being voided..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="p-3 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] rounded-lg text-[12px] text-[var(--danger)] font-medium">
          The transaction will be marked <strong>VOIDED</strong>. The record is kept for audit purposes but will be excluded from reports and balances.
        </div>
      </div>
    </ModuleModal>
  );
}

export function SendBackModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const [comment, setComment] = React.useState('');

  React.useEffect(() => { if (isOpen) setComment(''); }, [isOpen]);

  if (!selectedRequest) return null;

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Send Back to Employee"
      icon={<CornerUpLeft className="w-4 h-4" />}
      headerBg="bg-[color-mix(in_srgb,var(--info)_80%,transparent)]"
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
            onClick={() => onConfirm({ comment })}
            className="px-8 py-2.5 bg-[var(--info)] text-[var(--info-foreground)] text-[12px] font-semibold rounded-lg active:scale-95 transition-all"
          >
            Send Back
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-[var(--shell-border)] rounded-lg border overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="rounded-lg border border-b border-[var(--shell-border)] text-[var(--shell-text)] font-semibold">
              <tr>
                <th className="px-4 py-2 text-left">Reference ID</th>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--shell-border)]">
                <td className="px-4 py-3 font-semibold text-[var(--info)]">{selectedRequest.code || `#${selectedRequest.id}`}</td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--shell-text)' }}>{selectedRequest.submitted_by_name || '—'}</td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--shell-text)' }}>{formatCurrency(selectedRequest.amount, currency)}</td>
              </tr>
              {selectedRequest.description && (
                <tr>
                  <td colSpan={3} className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-[var(--shell-text)] mb-1 flex items-center gap-1.5">
                      <FileText size={11} /> Internal Notes
                    </p>
                    <p className="text-[12px]" style={{ color: 'var(--shell-text)' }}>{selectedRequest.description}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <label htmlFor="sendback-reason" className="text-[13px] font-medium text-[var(--shell-text)] flex items-center gap-2">
            <MessageSquare size={14} /> Reason for Sending Back
          </label>
          <Textarea id="sendback-reason"
            className="w-full h-24 p-3 border-input bg-transparent text-[var(--shell-text)] border border-[var(--shell-border)] rounded-lg text-[13px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--shell-accent)]/50 resize-none"
            placeholder="Explain what the employee needs to correct or provide..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        <div className="p-3 bg-[color-mix(in_srgb,var(--info)_10%,transparent)] border border-[color-mix(in_srgb,var(--info)_20%,transparent)] rounded-lg text-[12px] text-[var(--info)] font-medium">
          The expense will return to <strong>DRAFT</strong> status and the employee can edit and resubmit it.
        </div>
      </div>
    </ModuleModal>
  );
}

