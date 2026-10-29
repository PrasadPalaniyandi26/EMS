'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, XCircle, CornerUpLeft, Ban, Settings } from 'lucide-react';
import { InlineAlert } from '@/components/shared/inline-alert';
import { DecisionModal } from './decision-modal';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: any) => void;
  selectedRequest?: any;
}

export function ApproveModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  const [isClaimable, setIsClaimable] = React.useState(false);

  // Sync whenever the dialog opens or the request changes, so a stale value never carries over
  React.useEffect(() => {
    if (isOpen) setIsClaimable(selectedRequest?.is_claimable ?? false);
  }, [isOpen, selectedRequest?.id]);

  return (
    <DecisionModal
      isOpen={isOpen}
      onClose={onClose}
      request={selectedRequest}
      title="Approve expense request"
      icon={<CheckCircle2 className="h-4 w-4" />}
      confirmLabel="Confirm approval"
      field={{ id: 'approve-comment', label: 'Approval comments (optional)', placeholder: 'Enter any notes or justification for this approval...' }}
      onConfirm={(comment) => onConfirm({ comment, isClaimable })}
      top={selectedRequest?.needs_reimbursement && (
        <InlineAlert tone="warning" title="Reimbursement required">
          The employee paid out of pocket and needs to be reimbursed.
        </InlineAlert>
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
      title="Reject expense request"
      icon={<XCircle className="h-4 w-4" />}
      tone="danger"
      confirmLabel="Confirm rejection"
      field={{ id: 'reject-reason', label: 'Rejection reason', required: true, requiredMessage: 'Rejection reason is required.', placeholder: 'Provide a detailed reason for rejecting this request...' }}
      onConfirm={(comment) => onConfirm({ comment })}
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
      field={{ id: 'void-reason', label: 'Reason for voiding (optional)', placeholder: 'Explain why this approved transaction is being voided...' }}
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
      field={{ id: 'sendback-reason', label: 'Reason for sending back', placeholder: 'Explain what the employee needs to correct or provide...' }}
      onConfirm={(comment) => onConfirm({ comment })}
    >
      <InlineAlert tone="info">
        The expense returns to <strong>draft</strong> and the employee can edit and resubmit it.
      </InlineAlert>
    </DecisionModal>
  );
}
