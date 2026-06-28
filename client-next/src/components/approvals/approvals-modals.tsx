'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  BellRing,
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
  const [notify, setNotify] = React.useState(true);
  const [isClaimable, setIsClaimable] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Sync isClaimable whenever modal opens or selected request changes — prevents stale init value
  React.useEffect(() => {
    if (isOpen) {
      setIsClaimable(selectedRequest?.is_claimable ?? false);
      setComment('');
      setNotify(true);
      setSaving(false);
    }
  }, [isOpen, selectedRequest?.id]);

  if (!selectedRequest) return null;

  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onConfirm({ comment, notify, isClaimable });
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
      maxWidth="sm:max-w-[540px]"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-4 text-[11.5px] font-medium"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Cancel
          </Button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-8 py-2.5 btn-action-primary border border-[var(--shell-border)] text-[var(--shell-text)] text-[12px] font-bold uppercase tracking-widest rounded-lg shadow-none active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />}
            Confirm Approval
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className={`rounded-lg border overflow-x-auto ${selectedRequest.needs_reimbursement ? 'border-amber-400/40 bg-amber-500/5' : 'border-[var(--shell-border)] modal-section'}`}>
          {selectedRequest.needs_reimbursement && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-400/30 bg-amber-500/10">
              <Wallet className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Reimbursement Required — Employee paid out-of-pocket</span>
            </div>
          )}
          <table className="w-full text-[12px]">
            <thead className={`border-b font-bold uppercase tracking-tighter ${selectedRequest.needs_reimbursement ? 'border-amber-400/30 text-amber-600' : 'modal-section border-[var(--shell-border)] modal-label'}`}>
              <tr>
                <th className="px-4 py-2 text-left">Reference ID</th>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className={`border-b ${selectedRequest.needs_reimbursement ? 'border-amber-400/20' : 'border-[var(--shell-border)]'}`}>
                <td className="px-4 py-3 font-bold font-mono text-blue-400">{selectedRequest.code || `#${selectedRequest.id}`}</td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--shell-text)' }}>{selectedRequest.submitted_by_name || '—'}</td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--shell-text)' }}>{formatCurrency(selectedRequest.amount, currency)}</td>
              </tr>
              {selectedRequest.description && (
                <tr>
                  <td colSpan={3} className="px-4 py-2.5">
                    <p className="text-[10px] font-bold modal-label uppercase tracking-widest mb-1 flex items-center gap-1.5">
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
          <label className="text-[11px] font-bold modal-label uppercase tracking-widest flex items-center gap-2">
            <MessageSquare size={14} /> Approval Comments (Optional)
          </label>
          <Textarea
            className="w-full h-24 p-3 modal-input border border-[var(--shell-border)] rounded-lg text-[13px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--shell-accent)]/50 resize-none"
            placeholder="Enter any notes or justification for this approval..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        {selectedRequest.gst_rate != null && (
          <div className="flex items-center justify-between modal-section p-4 rounded-xl border border-[var(--shell-border)]">
            <div className="flex items-center gap-3">
              <Settings className="text-emerald-500" size={20} />
              <div>
                <p className="text-[12px] font-bold" style={{ color: 'var(--shell-text)' }}>Is Claimable?</p>
                <p className="text-[10px] text-[var(--shell-text-muted)] font-medium">GST ({selectedRequest.gst_rate}%) can be claimed back from Government</p>
              </div>
            </div>
            <Switch checked={isClaimable} onCheckedChange={setIsClaimable} />
          </div>
        )}

        {selectedRequest.needs_reimbursement && (
          <div className="flex items-center justify-between modal-section p-4 rounded-xl border border-amber-400/30 bg-amber-500/5">
            <div className="flex items-center gap-3">
              <Wallet className="text-amber-500" size={20} />
              <div>
                <p className="text-[12px] font-bold" style={{ color: 'var(--shell-text)' }}>Reimbursement Requested</p>
                <p className="text-[10px] text-[var(--shell-text-muted)] font-medium">Employee paid out-of-pocket and needs to be reimbursed</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider px-2 py-1 bg-amber-500/10 rounded">Pending</span>
          </div>
        )}

        <div className="flex items-center justify-between modal-section p-4 rounded-xl border border-[var(--shell-border)]">
          <div className="flex items-center gap-3">
            <BellRing className="text-[var(--shell-accent)]" size={20} />
            <div>
              <p className="text-[12px] font-bold" style={{ color: 'var(--shell-text)' }}>Notify Employee upon Approval</p>
              <p className="text-[10px] text-[var(--shell-text-muted)] font-medium">Automatic email will be sent to {selectedRequest.submitted_by_name || '—'}</p>
            </div>
          </div>
          <Switch checked={notify} onCheckedChange={setNotify} />
        </div>
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
      maxWidth="sm:max-w-[540px]"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-4 text-[11.5px] font-medium"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Cancel
          </Button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-8 py-2.5 bg-red-600 text-white text-[12px] font-bold uppercase tracking-widest rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />}
            Confirm Rejection
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-[var(--shell-border)] modal-section overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="modal-section border-b border-[var(--shell-border)] modal-label font-bold uppercase tracking-tighter">
              <tr>
                <th className="px-4 py-2 text-left">Reference ID</th>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--shell-border)]">
                <td className="px-4 py-3 font-bold font-mono text-blue-400">{selectedRequest.code || `#${selectedRequest.id}`}</td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--shell-text)' }}>{selectedRequest.submitted_by_name || '—'}</td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--shell-text)' }}>{formatCurrency(selectedRequest.amount, currency)}</td>
              </tr>
              {selectedRequest.description && (
                <tr>
                  <td colSpan={3} className="px-4 py-2.5">
                    <p className="text-[10px] font-bold modal-label uppercase tracking-widest mb-1 flex items-center gap-1.5">
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
          <label className="text-[11px] font-bold modal-label uppercase tracking-widest flex items-center gap-2">
            <MessageSquare size={14} /> Rejection Reason <span className="text-red-500">*</span>
          </label>
          <Textarea
            className={`w-full h-24 p-3 modal-input border rounded-lg text-[13px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--shell-accent)]/50 resize-none ${error ? 'border-red-500' : 'border-[var(--shell-border)]'}`}
            placeholder="Provide a detailed reason for rejecting this request..."
            value={comment}
            onChange={(e) => { setComment(e.target.value); if (e.target.value.trim()) setError(''); }}
          />
          {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
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
      maxWidth="sm:max-w-[540px]"
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
            onClick={handleConfirm}
            disabled={saving}
            className="px-8 py-2.5 bg-red-600 text-white text-[12px] font-bold uppercase tracking-widest rounded-lg shadow-lg shadow-red-600/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'Voiding...' : 'Confirm Void'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-[var(--shell-border)] modal-section overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="modal-section border-b border-[var(--shell-border)] modal-label font-bold uppercase tracking-tighter">
              <tr>
                <th className="px-4 py-2 text-left">Reference ID</th>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--shell-border)]">
                <td className="px-4 py-3 font-bold font-mono text-blue-400">{selectedRequest.code || `#${selectedRequest.transaction_id}`}</td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--shell-text)' }}>{selectedRequest.submitted_by_name || '—'}</td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--shell-text)' }}>{formatCurrency(selectedRequest.amount, currency)}</td>
              </tr>
              {selectedRequest.description && (
                <tr>
                  <td colSpan={3} className="px-4 py-2.5">
                    <p className="text-[10px] font-bold modal-label uppercase tracking-widest mb-1 flex items-center gap-1.5">
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
          <label className="text-[11px] font-bold modal-label uppercase tracking-widest flex items-center gap-2">
            <MessageSquare size={14} /> Reason for Voiding (optional)
          </label>
          <Textarea
            className="w-full h-24 p-3 modal-input border border-[var(--shell-border)] rounded-lg text-[13px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-red-500/50 focus:border-red-500/50 resize-none"
            placeholder="Explain why this approved transaction is being voided..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="p-3 bg-red-500/10 border border-red-400/20 rounded-xl text-[11px] text-red-500 dark:text-red-400 font-medium">
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
      headerBg="bg-blue-600/80"
      maxWidth="sm:max-w-[540px]"
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
            onClick={() => onConfirm({ comment })}
            className="px-8 py-2.5 bg-blue-600 text-white text-[12px] font-bold uppercase tracking-widest rounded-lg shadow-lg shadow-blue-600/20 hover:brightness-110 active:scale-95 transition-all"
          >
            Send Back
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-[var(--shell-border)] modal-section overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="modal-section border-b border-[var(--shell-border)] modal-label font-bold uppercase tracking-tighter">
              <tr>
                <th className="px-4 py-2 text-left">Reference ID</th>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--shell-border)]">
                <td className="px-4 py-3 font-bold font-mono text-blue-400">{selectedRequest.code || `#${selectedRequest.id}`}</td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--shell-text)' }}>{selectedRequest.submitted_by_name || '—'}</td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--shell-text)' }}>{formatCurrency(selectedRequest.amount, currency)}</td>
              </tr>
              {selectedRequest.description && (
                <tr>
                  <td colSpan={3} className="px-4 py-2.5">
                    <p className="text-[10px] font-bold modal-label uppercase tracking-widest mb-1 flex items-center gap-1.5">
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
          <label className="text-[11px] font-bold modal-label uppercase tracking-widest flex items-center gap-2">
            <MessageSquare size={14} /> Reason for Sending Back
          </label>
          <Textarea
            className="w-full h-24 p-3 modal-input border border-[var(--shell-border)] rounded-lg text-[13px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--shell-accent)]/50 resize-none"
            placeholder="Explain what the employee needs to correct or provide..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        <div className="p-3 bg-blue-500/10 border border-blue-400/20 rounded-xl text-[11px] text-blue-600 dark:text-blue-300 font-medium">
          The expense will return to <strong>DRAFT</strong> status and the employee can edit and resubmit it.
        </div>
      </div>
    </ModuleModal>
  );
}

