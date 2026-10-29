import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/currency';
import { getStatusConfig } from '@/lib/status';

// The one vocabulary for table cells. Every cell is a plain string: no pills, dots or avatars.
// The only visual signal is text colour on state columns, and amounts are right-aligned with tabular figures.

const EMPTY = '—';

export function TextCell({ value, muted, strong, className }: { value?: ReactNode; muted?: boolean; strong?: boolean; className?: string }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <span
      className={cn('text-[13px]', strong && 'font-medium', empty || muted ? 'text-[var(--shell-text-muted)]' : 'text-[var(--shell-text)]', className)}
    >
      {empty ? EMPTY : value}
    </span>
  );
}

// Identifiers (codes, references): same face and size as every other cell; tabular numerals keep digits aligned.
export function IdCell({ value }: { value?: string | number | null }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <span className={cn('text-[13px]', empty ? 'text-[var(--shell-text-muted)]' : 'text-[var(--shell-text)]')}>
      {empty ? EMPTY : value}
    </span>
  );
}

export function DateCell({ value }: { value?: string | Date | null }) {
  const text = value ? formatDate(value) : '';
  return <TextCell value={text} muted />;
}

export function MoneyCell({ value, currency, symbol = true }: { value?: number | string | null; currency?: string; symbol?: boolean }) {
  return (
    <div className="text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">
      {formatCurrency(Number(value || 0), currency || 'INR', symbol)}
    </div>
  );
}

// Approval-workflow status: plain text, coloured by the --status-* tokens through lib/status.ts.
export function StatusText({ status }: { status?: string | null }) {
  const c = getStatusConfig(status);
  return <span className={cn('text-[13px] font-medium', c.color)}>{c.label}</span>;
}

const TONES = {
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger: 'text-[var(--danger)]',
  info: 'text-[var(--info)]',
  muted: 'text-[var(--shell-text-muted)]',
} as const;

// State columns that are not the approval workflow (Active / Inactive / On hold / Completed ...).
export function ToneText({ label, tone = 'muted' }: { label?: string | null; tone?: keyof typeof TONES }) {
  return <span className={cn('text-[13px] font-medium', TONES[tone])}>{label || EMPTY}</span>;
}

export const headerRight = (label: string) => () => <div className="text-right">{label}</div>;
