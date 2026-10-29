import { cn } from '@/lib/utils';
import { getRoleStyle } from '@/lib/roles';

// Role pill (Admin / Finance / Manager / Employee) using the --role-* tokens.
export function RoleBadge({ role, className }: { role?: string | null; className?: string }) {
  const s = getRoleStyle(role);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', s.badge, className)}>
      <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}
