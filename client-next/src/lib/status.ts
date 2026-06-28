export const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  DRAFT:           { label: 'Draft',            color: 'text-sky-500',     dot: 'bg-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20' },
  PENDING_MANAGER: { label: 'Awaiting Manager', color: 'text-amber-500',   dot: 'bg-amber-500',   bg: 'bg-amber-500/10 border-amber-500/20' },
  PENDING_FINANCE: { label: 'Awaiting Finance', color: 'text-orange-400',  dot: 'bg-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20' },
  APPROVED:        { label: 'Approved',          color: 'text-emerald-500', dot: 'bg-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  REJECTED:        { label: 'Rejected',          color: 'text-red-400',     dot: 'bg-red-400',     bg: 'bg-red-500/10 border-red-400/20' },
  SENT_BACK:       { label: 'Sent Back',         color: 'text-blue-400',    dot: 'bg-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20' },
  VOIDED:          { label: 'Voided',            color: 'text-slate-400',   dot: 'bg-slate-400',   bg: 'bg-slate-500/10 border-slate-500/20' },
};

export function getStatusConfig(status: string | undefined | null) {
  const key = (status || '').toUpperCase();
  return STATUS_CONFIG[key] || {
    label: key || '—',
    color: 'text-black/40 dark:text-white/50',
    dot: 'bg-slate-400',
    bg: 'bg-[var(--shell-hover)] border-[var(--shell-border)]',
  };
}
