import React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'info' | 'accent';

// Value colour per tone, from the semantic tokens (AA-safe on the card surface in both themes)
const TONE_TEXT: Record<Tone, string> = {
  default: 'text-[var(--shell-text)]',
  success: 'text-[var(--success)]',
  danger: 'text-[var(--danger)]',
  warning: 'text-[var(--warning)]',
  info: 'text-[var(--info)]',
  accent: 'text-[var(--shell-accent)]',
};

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  hint?: React.ReactNode;
  /** Makes the whole card a real button (focusable, Enter/Space) instead of a click-only div */
  onClick?: () => void;
  className?: string;
}

// KPI tile used by dashboard-style pages. Each page used to hand-roll this markup.
export function StatCard({ label, value, icon, tone = 'default', hint, onClick, className }: StatCardProps) {
  const body = (
    <>
      {icon && <div className="mt-0.5 shrink-0" aria-hidden>{icon}</div>}
      <div className="min-w-0 text-left">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--shell-text-muted)]">{label}</p>
        <p className={cn('text-[16px] font-black mt-0.5 truncate', TONE_TEXT[tone])}>{value}</p>
        {hint && <p className="text-[11px] mt-0.5 text-[var(--shell-text-muted)]">{hint}</p>}
      </div>
    </>
  );
  const base = 'rounded-xl px-4 py-3 flex items-start gap-3 border border-[var(--shell-border)] bg-[var(--shell-surface)]';

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, 'w-full cursor-pointer transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-accent)]', className)}>
        {body}
      </button>
    );
  }
  return <div className={cn(base, className)}>{body}</div>;
}
