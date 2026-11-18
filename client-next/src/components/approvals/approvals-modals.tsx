'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, XCircle, CornerUpLeft, Ban, Settings } from 'lucide-react';
import { InlineAlert } from '@/components/shared/inline-alert';
import { DecisionModal } from './decision-modal';
import { useAuthStore } from '@/stores/auth-store';

// What the request is, in words, so the dialogs name it correctly
const kindOf = (r?: any) => (r?.record_type === 'recurring' ? 'recurring schedule' : r?.type === 'income' ? 'income' : 'expense');

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: any) => void;
  selectedRequest?: any;
}

export function ApproveModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  const [isClaimable, setIsClaimable] = React.useState(false);
  const meId = useAuthStore((s) => s.user?.id);

  // Sync whenever the dialog opens or the request changes, so a stale value never carries over
  React.useEffect(() => {
    if (isOpen) setIsClaimable(selectedRequest?.is_claimable ?? false);
  }, [isOpen, selectedRequest?.id]);

  return (
    <DecisionModal
      isOpen={isOpen}
      onClose={onClose}
      request={selectedRequest}
      title={`Approve ${kindOf(selectedRequest)} request`}
      icon={<CheckCircle2 className="h-4 w-4" />}
      confirmLabel="Confirm approval"
      field={{ id: 'approve-comment', label: 'Approval comments (optional)', placeholder: 'Enter any notes or justification for this approval...' }}
      onConfirm={(comment) => onConfirm({ comment, isClaimable })}
      top={(
        <>
          {selectedRequest?.submitted_by_id != null && selectedRequest.submitted_by_id === meId && (
            <InlineAlert tone="warning" title={`You submitted this ${kindOf(selectedRequest)}`}>
              Approving your own {kindOf(selectedRequest)} may be blocked by policy.
            </InlineAlert>
          )}
          {selectedRequest && !selectedRequest.receipt_path && (
            <InlineAlert tone="warning" title="No receipt attached">
              Check that the amount is supported before approving.
            </InlineAlert>
          )}
          {selectedRequest?.needs_reimbursement && (
            <InlineAlert tone="warning" title="Reimbursement required">
              The employee paid out of pocket and needs to be reimbursed.
            </InlineAlert>
          )}
        </>
      )}
    >
      {selectedRequest?.gst_rate != null && (
        <div className="flex items-center justify-between rounded-lg border p-4" style={{ borderColor: 'var(--shell-border)' }}>
          <div className="flex items-center gap-3">
            <Settings aria-hidden className="text-[var(--success)]" size={20} />
            <div>
              <p id="claimable-label" className="text-[12px] font-semibold" style={{ color: 'var(--shell-text)' }}>Is claimable?</p>
              <p className="text-[12px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>GST ({selectedRequest.gst_rate}%) can be claimed back from the government</p>
            </div>
          </div>
          <Switch aria-labelledby="claimable-label" checked={isClaimable} onCheckedChange={setIsClaimable} />
        </div>
      )}
    </DecisionModal>
  );
}

export function RejectModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  return (
    <DecisionModal
      isOpen={isOpen}
      onClose={onClose}
      request={selectedRequest}
      title={`Reject ${kindOf(selectedRequest)} request`}
      icon={<XCircle className="h-4 w-4" />}
      tone="danger"
      confirmLabel="Confirm rejection"
      field={{ id: 'reject-reason', label: 'Rejection reason', required: true, requiredMessage: 'Rejection reason is required.', placeholder: 'Provide a detailed reason for rejecting this request...' }}
      onConfirm={(comment) => onConfirm({ comment })}
      top={<InlineAlert tone="danger">The submitter is notified and the {kindOf(selectedRequest)} is closed. They can see your reason.</InlineAlert>}
    />
  );
}

export function VoidModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  return (
    <DecisionModal
      isOpen={isOpen}
      onClose={onClose}
      request={selectedRequest}
      refId={selectedRequest?.transaction_id}
      title="Void transaction"
      icon={<Ban className="h-4 w-4" />}
      tone="danger"
      confirmLabel="Confirm void"
      busyLabel="Voiding..."
      field={{ id: 'void-reason', label: 'Reason for voiding', required: true, requiredMessage: 'Say why this approved transaction is being voided.', placeholder: 'Explain why this approved transaction is being voided...' }}
      onConfirm={(reason) => onConfirm({ reason })}
    >
      <InlineAlert tone="danger">
        The transaction will be marked <strong>voided</strong>. The record is kept for audit purposes but is excluded from reports and balances.
      </InlineAlert>
    </DecisionModal>
  );
}

export function SendBackModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  return (
    <DecisionModal
      isOpen={isOpen}
      onClose={onClose}
      request={selectedRequest}
      title="Send back to employee"
      icon={<CornerUpLeft className="h-4 w-4" />}
      tone="info"
      confirmLabel="Send back"
      field={{ id: 'sendback-reason', label: 'Reason for sending back', required: true, requiredMessage: 'Tell the employee what to correct.', placeholder: 'Explain what the employee needs to correct or provide...' }}
      onConfirm={(comment) => onConfirm({ comment })}
    >
      <InlineAlert tone="info">
        The {kindOf(selectedRequest)} returns to <strong>draft</strong> and the employee can edit and resubmit it.
      </InlineAlert>
    </DecisionModal>
  );
}
