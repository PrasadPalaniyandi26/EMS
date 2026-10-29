import { cn } from '@/lib/utils';
import { getStatusConfig } from '@/lib/status';

// Approval-workflow status pill. Colour is never the only signal: the label is always shown, and the
// dot is decorative. Colours come from the --status-* tokens (AA-safe in light and dark).
export function StatusBadge({ status, dot = true, className }: { status?: string | null; dot?: boolean; className?: string }) {
  const cfg = getStatusConfig(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', cfg.bg, cfg.color, className)}>
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cfg.dot)} />}
      {cfg.label}
    </span>
  );
}
