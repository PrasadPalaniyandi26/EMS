// Approval workflow states. Colours come from the --status-* tokens in globals.css, which are chosen to
// be AA-safe as text in both themes, so every status pill is readable without per-component tuning.
// The class strings are written out in full so Tailwind can see them.
// The one list of approval status names and tones. Every table, panel and filter reads from here so a
// state is called the same thing everywhere: Draft, With Manager, With Finance, Approved, Rejected, Sent Back, Voided.
export type StatusTone = 'success' | 'warning' | 'danger' | 'muted';
export const STATUS_LIST = {
  DRAFT: { label: 'Draft', tone: 'muted' },
  PENDING_MANAGER: { label: 'With Manager', tone: 'warning' },
  PENDING_FINANCE: { label: 'With Finance', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  SENT_BACK: { label: 'Sent Back', tone: 'muted' },
  VOIDED: { label: 'Voided', tone: 'danger' },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;
// Older rows may say VOID
const ALIAS: Record<string, keyof typeof STATUS_LIST> = { VOID: 'VOIDED' };
export function statusWord(code: string | undefined | null): { label: string; tone: StatusTone } {
  const key = (code || '').toUpperCase();
  const hit = (STATUS_LIST as Record<string, { label: string; tone: StatusTone }>)[ALIAS[key] ?? key];
  return hit ?? { label: code || '—', tone: 'muted' };
}

export const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  DRAFT: {
    label: STATUS_LIST.DRAFT.label,
    color: 'text-[var(--status-draft)]',
    dot: 'bg-[var(--status-draft)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-draft)_12%,transparent)] border-[color-mix(in_srgb,var(--status-draft)_30%,transparent)]',
  },
  PENDING_MANAGER: {
    label: STATUS_LIST.PENDING_MANAGER.label,
    color: 'text-[var(--status-pending-manager)]',
    dot: 'bg-[var(--status-pending-manager)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-pending-manager)_12%,transparent)] border-[color-mix(in_srgb,var(--status-pending-manager)_30%,transparent)]',
  },
  PENDING_FINANCE: {
    label: STATUS_LIST.PENDING_FINANCE.label,
    color: 'text-[var(--status-pending-finance)]',
    dot: 'bg-[var(--status-pending-finance)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-pending-finance)_12%,transparent)] border-[color-mix(in_srgb,var(--status-pending-finance)_30%,transparent)]',
  },
  APPROVED: {
    label: STATUS_LIST.APPROVED.label,
    color: 'text-[var(--status-approved)]',
    dot: 'bg-[var(--status-approved)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-approved)_12%,transparent)] border-[color-mix(in_srgb,var(--status-approved)_30%,transparent)]',
  },
  REJECTED: {
    label: STATUS_LIST.REJECTED.label,
    color: 'text-[var(--status-rejected)]',
    dot: 'bg-[var(--status-rejected)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-rejected)_12%,transparent)] border-[color-mix(in_srgb,var(--status-rejected)_30%,transparent)]',
  },
  SENT_BACK: {
    label: STATUS_LIST.SENT_BACK.label,
    color: 'text-[var(--status-sent-back)]',
    dot: 'bg-[var(--status-sent-back)]',
    bg: 'bg-[color-mix(in_srgb,var(--status-sent-back)_12%,transparent)] border-[color-mix(in_srgb,var(--status-sent-back)_30%,transparent)]',
  },
  VOIDED: {
    label: STATUS_LIST.VOIDED.label,
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
