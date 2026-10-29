// Approval workflow states. Colours come from the --status-* tokens in globals.css, which are chosen to
// be AA-safe as text in both themes, so every status pill is readable without per-component tuning.
// The class strings are written out in full so Tailwind can see them.
export const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  DRAFT: {
    label: 'Draft',
    color: 'text-[var(--status-draft)]',
    dot: 'bg-[var(--status-draft)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-draft)_12%,transparent)] border-[color-mix(in_srgb,var(--status-draft)_30%,transparent)]',
  },
  PENDING_MANAGER: {
    label: 'Awaiting Manager',
    color: 'text-[var(--status-pending-manager)]',
    dot: 'bg-[var(--status-pending-manager)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-pending-manager)_12%,transparent)] border-[color-mix(in_srgb,var(--status-pending-manager)_30%,transparent)]',
  },
  PENDING_FINANCE: {
    label: 'Awaiting Finance',
    color: 'text-[var(--status-pending-finance)]',
    dot: 'bg-[var(--status-pending-finance)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-pending-finance)_12%,transparent)] border-[color-mix(in_srgb,var(--status-pending-finance)_30%,transparent)]',
  },
  APPROVED: {
    label: 'Approved',
    color: 'text-[var(--status-approved)]',
    dot: 'bg-[var(--status-approved)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-approved)_12%,transparent)] border-[color-mix(in_srgb,var(--status-approved)_30%,transparent)]',
  },
  REJECTED: {
    label: 'Rejected',
    color: 'text-[var(--status-rejected)]',
    dot: 'bg-[var(--status-rejected)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-rejected)_12%,transparent)] border-[color-mix(in_srgb,var(--status-rejected)_30%,transparent)]',
  },
  SENT_BACK: {
    label: 'Sent Back',
    color: 'text-[var(--status-sent-back)]',
    dot: 'bg-[var(--status-sent-back)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-sent-back)_12%,transparent)] border-[color-mix(in_srgb,var(--status-sent-back)_30%,transparent)]',
  },
  VOIDED: {
    label: 'Voided',
    color: 'text-[var(--status-voided)]',
    dot: 'bg-[var(--status-voided)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-voided)_12%,transparent)] border-[color-mix(in_srgb,var(--status-voided)_30%,transparent)]',
  },
};

export function getStatusConfig(status: string | undefined | null) {
  const key = (status || '').toUpperCase();
  return STATUS_CONFIG[key] || {
    label: key || '—',
    color: 'text-[var(--shell-text-muted)]',
    dot: 'bg-[var(--shell-text-muted)]',
    bg: 'bg-[var(--shell-hover)] border-[var(--shell-border)]',
  };
}
