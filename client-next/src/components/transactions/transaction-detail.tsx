'use client';

import { Trash2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/currency';
import { getStatusConfig } from '@/lib/status';
import {
  DetailSummary, DetailSection, DetailGrid, DetailField, DetailAttachment, DetailAllocation, DetailTimeline,
  type DetailTone,
} from '@/components/shared/detail/detail-kit';

interface NotesState {
  items: any[];
  loading: boolean;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  saving: boolean;
  onDelete: (id: number) => void;
  currentUserId?: number;
}

interface TransactionDetailProps {
  kind: 'expense' | 'income';
  txn: any;
  currency: string;
  approvalTrail?: any[];
  split: { details: any[]; loading: boolean; onSplit?: () => void };
  notes: NotesState;
  upload: { uploading: boolean; onPick: () => void };
  onDuplicate: () => void;
  /** Shown to Finance/Admin next to a reimbursement that is still open */
  onProcessReimbursement?: () => void;
}

const textBtn = 'text-[12px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]';

// The detail panel body shared by Expense and Income (same layout as every other page's panel, see detail-kit).
export function TransactionDetail({ kind, txn, currency, approvalTrail, split, notes, upload, onDuplicate, onProcessReimbursement }: TransactionDetailProps) {
  const statusCfg = getStatusConfig(txn.status);
  const total = txn.total_amount ?? txn.amount;
  const net = txn.net_amount ?? txn.amount;
  const comment = (s: string) => approvalTrail?.find((r: any) => r.status === s)?.comments;
  const linked = txn.project_name || txn.product_name;
  const canSplit = ['DRAFT', 'SENT_BACK'].includes((txn.status || '').toUpperCase()) && split.onSplit;

  const trail: Array<{ title: React.ReactNode; meta?: React.ReactNode; tone: DetailTone }> = [];
  const withRole = (name?: string, role?: string) => `${name || ''}${role ? ` (${role})` : ''}`;
  if (txn.submitted_at) trail.push({ title: `Submitted by ${txn.submitted_by_name || 'user'}`, meta: formatDate(txn.submitted_at), tone: 'info' });
  if (txn.sent_back_at) trail.push({ title: `Sent back by ${withRole(txn.sent_back_by_name, txn.sent_back_by_role)}`, meta: [formatDate(txn.sent_back_at), comment('SENT_BACK') && `“${comment('SENT_BACK')}”`].filter(Boolean).join(' · '), tone: 'warning' });
  if (txn.approved_at) trail.push({ title: `Approved by ${withRole(txn.approved_by_name, txn.approved_by_role)}`, meta: [formatDate(txn.approved_at), comment('APPROVED') && `“${comment('APPROVED')}”`].filter(Boolean).join(' · '), tone: 'success' });
  if (txn.rejected_at) trail.push({ title: `Rejected by ${withRole(txn.rejected_by_name, txn.rejected_by_role)}`, meta: [formatDate(txn.rejected_at), comment('REJECTED') && `“${comment('REJECTED')}”`].filter(Boolean).join(' · '), tone: 'danger' });
  if (txn.voided_at) trail.push({ title: `Voided by ${txn.voided_by_name || ''}`, meta: [formatDate(txn.voided_at), txn.void_reason && `“${txn.void_reason}”`].filter(Boolean).join(' · '), tone: 'muted' });

  const reimb = txn.reimbursement_status;

  return (
    <>
      <DetailSummary
        title={txn.reference_id || `#${txn.id}`}
        subtitle={txn.description || 'No description'}
        status={statusCfg.label}
        statusClass={statusCfg.color}
        figure={formatCurrency(total, currency)}
        figureLabel="Total"
      />

      <DetailSection title="Details" action={<button type="button" onClick={onDuplicate} className={textBtn}>Duplicate</button>}>
        <DetailGrid>
          <DetailField label="Date" value={formatDate(txn.date_recorded)} />
          <DetailField label="Payment method" value={txn.payment_method ? String(txn.payment_method).replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase()) : undefined} />
          <DetailField label="Category" value={txn.category_name} />
          {kind === 'expense'
            ? <DetailField label="Reimbursement" value={txn.needs_reimbursement ? 'Needed' : 'Not needed'} tone={txn.needs_reimbursement ? 'warning' : 'muted'} />
            : <DetailField label="Client" value={txn.client_name} />}
          {txn.gst_rate != null && (
            <>
              <DetailField label="Net amount" value={formatCurrency(net, currency)} />
              <DetailField label={`GST (${txn.gst_rate}%)`} value={formatCurrency(total - net, currency)} />
            </>
          )}
        </DetailGrid>
      </DetailSection>

      <DetailSection title={kind === 'income' ? 'Invoice' : 'Receipt'}>
        <DetailAttachment
          path={txn.receipt_path}
          emptyLabel={kind === 'income' ? 'No invoice attached' : 'No receipt attached'}
          action={
            upload.uploading
              ? <span className="text-[12px] text-[var(--shell-text-muted)]">Uploading…</span>
              : <button type="button" onClick={upload.onPick} className={textBtn}>{txn.receipt_path ? 'Replace' : 'Upload'}</button>
          }
        />
      </DetailSection>

      <DetailSection
        title="Fund allocation"
        action={canSplit ? <button type="button" onClick={split.onSplit} className={textBtn}>{txn.is_split === 1 ? 'Re-split' : 'Split'}</button> : undefined}
      >
        {txn.is_split === 1 ? (
          split.loading ? (
            <p className="text-[12px] text-[var(--shell-text-muted)]">Loading split details...</p>
          ) : split.details.length > 0 ? (
            <DetailAllocation
              items={split.details.map((s: any, i: number) => ({
                label: s.category_name || `Split ${i + 1}`,
                amount: formatCurrency(Number(s.amount), currency),
                pct: (Number(s.amount) / (Number(txn.amount) || 1)) * 100,
                note: [s.description, s.project_name && `[${s.project_name}]`].filter(Boolean).join(' '),
              }))}
              total={`${split.details.length} splits · ${formatCurrency(txn.amount, currency)}`}
            />
          ) : (
            <p className="text-[12px] text-[var(--shell-text-muted)]">No split details available.</p>
          )
        ) : linked ? (
          <DetailAllocation items={[{ label: linked, pct: 100 }]} />
        ) : (
          <p className="text-[12px] text-[var(--shell-text-muted)]">Not linked to a project or product.</p>
        )}
      </DetailSection>

      <DetailSection title="Timeline">
        {trail.length > 0 ? <DetailTimeline items={trail} /> : <p className="text-[12px] text-[var(--shell-text-muted)]">{kind === 'income' ? 'Recorded, no approval needed.' : 'Draft, not yet submitted.'}</p>}
      </DetailSection>

      {kind === 'expense' && txn.needs_reimbursement && (
        <DetailSection
          title="Reimbursement"
          action={reimb !== 'PAID' && onProcessReimbursement ? <button type="button" onClick={onProcessReimbursement} className={textBtn}>Process</button> : undefined}
        >
          <DetailGrid>
            <DetailField label="Status" value={reimb === 'PAID' ? 'Paid' : reimb === 'ON_HOLD' ? 'On hold' : 'Pending'} tone={reimb === 'PAID' ? 'success' : 'warning'} />
            <DetailField label="Handled by" value={txn.reimbursed_by_name} />
            {txn.reimbursement_reference && <DetailField label="Reference" value={txn.reimbursement_reference} />}
            {txn.reimbursed_at && <DetailField label="Date" value={formatDate(txn.reimbursed_at)} />}
            {txn.reimbursement_note && <DetailField label="Note" value={txn.reimbursement_note} wide />}
          </DetailGrid>
        </DetailSection>
      )}

      <DetailSection title="Notes">
        {notes.loading ? (
          <p className="text-[12px] text-[var(--shell-text-muted)]">Loading notes...</p>
        ) : (
          <div className="space-y-2">
            {notes.items.map((n: any) => (
              <div key={n.id} className="flex items-start gap-2 rounded-md bg-[var(--secondary)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-[var(--shell-accent)]">{n.username}</p>
                  <p className="text-[13px] leading-snug text-[var(--shell-text)]">{n.note}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--shell-text-muted)]">{formatDate(n.created_at)}</p>
                </div>
                {n.user_id === notes.currentUserId && (
                  <button type="button" aria-label="Delete note" onClick={() => notes.onDelete(n.id)} className="mt-0.5 shrink-0 text-[var(--shell-text-muted)] transition-colors hover:text-[var(--danger)]">
                    <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {notes.items.length === 0 && <p className="text-[12px] text-[var(--shell-text-muted)]">No notes yet.</p>}
          </div>
        )}
        <div className="flex gap-2">
          <input
            aria-label="New note"
            className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-[13px] text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]"
            placeholder="Add a note..."
            value={notes.value}
            onChange={(e) => notes.onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') notes.onAdd(); }}
          />
          <button
            type="button"
            onClick={notes.onAdd}
            disabled={!notes.value.trim() || notes.saving}
            className="h-9 rounded-md bg-[var(--shell-accent)] px-4 text-[13px] font-medium text-[var(--shell-accent-fg)] transition-opacity disabled:opacity-40"
          >
            {notes.saving ? '...' : 'Add'}
          </button>
        </div>
      </DetailSection>
    </>
  );
}
