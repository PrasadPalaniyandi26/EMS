'use client';

import { cn } from '@/lib/utils';
import { inputStyle } from '@/components/shared/modal-primitives';

// The period picker for dashboard and analysis pages: one segmented group of presets, and the exact dates beside it.
export function PeriodBar({ presets, active, onPreset, from, to, onFrom, onTo }: {
  presets: { label: string; key: string }[];
  active: string;
  onPreset: (key: string, label: string) => void;
  from: string; to: string;
  onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  const dateClass = 'h-9 max-lg:h-10 max-sm:min-w-0 max-sm:flex-1 rounded-md border px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="group" aria-label="Period" className="flex max-w-full flex-wrap gap-1 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-surface)] p-1 max-sm:w-full">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={active === p.label}
            onClick={() => onPreset(p.key, p.label)}
            className={cn(
              'h-8 shrink-0 rounded-md px-3 text-[13px] font-medium transition-colors max-lg:h-10 focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]',
              active === p.label
                ? 'bg-[var(--shell-accent)] text-[var(--shell-accent-fg)]'
                : 'text-[var(--shell-text-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)]',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 max-sm:w-full lg:ml-auto">
        <input type="date" aria-label="From date" value={from} onChange={(e) => onFrom(e.target.value)} className={dateClass} style={inputStyle} />
        <span className="text-[13px] text-[var(--shell-text-muted)]">to</span>
        <input type="date" aria-label="To date" value={to} onChange={(e) => onTo(e.target.value)} className={dateClass} style={inputStyle} />
      </div>
    </div>
  );
}
