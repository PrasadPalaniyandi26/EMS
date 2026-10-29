import React from 'react';
import { Ban, Info, Lightbulb, TriangleAlert, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'danger' | 'warning' | 'info' | 'success' | 'tip';

// Tint, border and icon colour come from the semantic tokens. Body text stays the normal text colour,
// so contrast never depends on the tint. The icon is decorative: the message is always in words.
const TONES: Record<Tone, { box: string; icon: string; Icon: React.ComponentType<{ className?: string }> }> = {
  danger: {
    box: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_35%,transparent)]',
    icon: 'text-[var(--danger)]',
    Icon: Ban,
  },
  warning: {
    box: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_35%,transparent)]',
    icon: 'text-[var(--warning)]',
    Icon: TriangleAlert,
  },
  info: {
    box: 'bg-[color-mix(in_srgb,var(--info)_10%,transparent)] border-[color-mix(in_srgb,var(--info)_35%,transparent)]',
    icon: 'text-[var(--info)]',
    Icon: Info,
  },
  success: {
    box: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_35%,transparent)]',
    icon: 'text-[var(--success)]',
    Icon: CircleCheck,
  },
  tip: {
    box: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_35%,transparent)]',
    icon: 'text-[var(--warning)]',
    Icon: Lightbulb,
  },
};

interface InlineAlertProps {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons or links shown under the message */
  actions?: React.ReactNode;
  className?: string;
}

// In-form notice (budget warning, duplicate warning, validation summary). Danger announces itself
// immediately (role="alert"); the others are polite status messages.
export function InlineAlert({ tone = 'info', title, children, actions, className }: InlineAlertProps) {
  const t = TONES[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-lg border px-3 py-2.5 text-[12px]', t.box, className)}>
      <div className="flex items-start gap-2">
        <t.Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', t.icon)} />
        <div className="min-w-0 flex-1 space-y-1.5" style={{ color: 'var(--shell-text)' }}>
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className="leading-relaxed">{children}</div>}
          {actions && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
