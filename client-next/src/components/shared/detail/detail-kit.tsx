'use client';

import type { ReactNode } from 'react';
import { FileText, ArrowUpRight, Send, Pencil, Trash2, CheckCircle2, XCircle, CornerUpLeft, Ban, PauseCircle, PlayCircle, Shield, UserX, Briefcase, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getAccessToken, API_BASE } from '@/lib/api-client';

// The one layout for the right-hand detail panel on every page:
//
//   DetailSummary   what it is (title, reference, status) and the headline figure
//   DetailSection   a titled group of facts
//     DetailGrid > DetailField   compact tiles (label above value), two per row
//     DetailTimeline / DetailAllocation / DetailAttachment for the other kinds of content
//   DetailActions   the actions that apply to this item, pinned to the bottom (the panel's `footer`)
//
// Pages fill these in; they do not style their own panels.

const TONE_TEXT = {
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger: 'text-[var(--danger)]',
  info: 'text-[var(--info)]',
  muted: 'text-[var(--shell-text-muted)]',
} as const;
export type DetailTone = keyof typeof TONE_TEXT;

export function DetailSummary({
  title, subtitle, status, statusClass, figure, figureLabel,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  /** Tailwind text colour class for the status (for example the colour from getStatusConfig) */
  statusClass?: string;
  figure?: ReactNode;
  figureLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--shell-border)] pb-4">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold leading-tight text-[var(--shell-text)]">{title}</p>
        {subtitle && <p className="mt-1 truncate text-[12px] text-[var(--shell-text-muted)]">{subtitle}</p>}
        {status && <p className={cn('mt-1.5 text-[13px] font-medium', statusClass)}>{status}</p>}
      </div>
      {figure !== undefined && (
        <div className="shrink-0 text-right">
          <p className="text-[18px] font-semibold leading-tight tabular-nums text-[var(--shell-text)]">{figure}</p>
          {figureLabel && <p className="mt-1 text-[12px] text-[var(--shell-text-muted)]">{figureLabel}</p>}
        </div>
      )}
    </div>
  );
}

export function DetailSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[var(--shell-text)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DetailGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 }) {
  return <div className={cn('grid gap-2', cols === 2 ? 'grid-cols-2' : 'grid-cols-1')}>{children}</div>;
}

export function DetailField({
  label, value, tone = 'muted', wide,
}: {
  label: string;
  value?: ReactNode;
  /** Colours the value (for example warning for "needs reimbursement"); default is the normal text colour */
  tone?: DetailTone;
  wide?: boolean;
}) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className={cn('min-w-0 rounded-md bg-[var(--secondary)] px-3 py-2', wide && 'col-span-2')}>
      <p className="text-[12px] text-[var(--shell-text-muted)]">{label}</p>
      <p className={cn('mt-0.5 break-words text-[13px] font-medium', empty ? 'text-[var(--shell-text-muted)]' : tone === 'muted' ? 'text-[var(--shell-text)]' : TONE_TEXT[tone])}>
        {empty ? '—' : value}
      </p>
    </div>
  );
}

export function DetailTimeline({ items }: { items: Array<{ title: ReactNode; meta?: ReactNode; tone?: DetailTone }> }) {
  if (items.length === 0) return <p className="text-[12px] text-[var(--shell-text-muted)]">Nothing recorded yet.</p>;
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="relative pl-5">
          <span aria-hidden className={cn('absolute left-0 top-[7px] h-2 w-2 rounded-full bg-current', TONE_TEXT[it.tone ?? 'muted'])} />
          {i < items.length - 1 && <span aria-hidden className="absolute bottom-[-12px] left-[3.5px] top-[17px] w-px bg-[var(--shell-border)]" />}
          <p className="text-[13px] font-medium text-[var(--shell-text)]">{it.title}</p>
          {it.meta && <p className="text-[12px] text-[var(--shell-text-muted)]">{it.meta}</p>}
        </li>
      ))}
    </ol>
  );
}

export function DetailAllocation({ items, total }: { items: Array<{ label: string; amount?: ReactNode; pct: number; note?: string }>; total?: ReactNode }) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-[var(--shell-text)]">{it.label}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-[var(--shell-text-muted)]">
              {it.amount !== undefined && <span className="mr-2 text-[var(--shell-text)]">{it.amount}</span>}
              {it.pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-sm bg-[var(--shell-hover)]">
            <div className="h-full rounded-sm bg-[var(--shell-accent)]" style={{ width: `${Math.min(100, Math.max(0, it.pct))}%` }} />
          </div>
          {it.note && <p className="mt-1 truncate text-[12px] text-[var(--shell-text-muted)]">{it.note}</p>}
        </div>
      ))}
      {total !== undefined && (
        <div className="flex items-center justify-between border-t border-[var(--shell-border)] pt-2 text-[13px]">
          <span className="text-[var(--shell-text-muted)]">Total</span>
          <span className="font-medium tabular-nums text-[var(--shell-text)]">{total}</span>
        </div>
      )}
    </div>
  );
}

// Opens a stored receipt. The files sit behind the login, so a plain link would be refused: fetch it with the
// access token and open the blob.
export async function openReceipt(path: string) {
  const url = path.startsWith('/') ? path : `${API_BASE}/receipts/${path}`;
  try {
    const token = getAccessToken();
    const res = await fetch(url, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) { toast.error(`Receipt load failed: ${res.status}`); return; }
    const blobUrl = URL.createObjectURL(await res.blob());
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    toast.error('Could not load receipt. Please try again.');
  }
}

export function DetailAttachment({ path, emptyLabel = 'No document attached', action }: { path?: string | null; emptyLabel?: string; action?: ReactNode }) {
  const name = path ? path.split('/').pop() : null;
  return (
    <div className="flex items-center gap-2.5 rounded-md bg-[var(--secondary)] px-3 py-2">
      <FileText aria-hidden className="h-4 w-4 shrink-0 text-[var(--shell-text-muted)]" />
      {path ? (
        <button
          type="button"
          onClick={() => openReceipt(path)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"
        >
          <span className="truncate text-[13px] font-medium text-[var(--shell-text)]">{name}</span>
          <span className="flex shrink-0 items-center gap-1 text-[12px] text-[var(--shell-accent)]">Open <ArrowUpRight aria-hidden className="h-3 w-3" /></span>
        </button>
      ) : (
        <span className="flex-1 text-[13px] text-[var(--shell-text-muted)]">{emptyLabel}</span>
      )}
      {action}
    </div>
  );
}

export type DetailActionDef = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  icon?: ReactNode;
};

// Pinned to the bottom of the panel. At most three actions, same order and styling everywhere:
// the main action first (filled), then secondary (outlined), then destructive (red outline).
export function DetailActions({ actions }: { actions: DetailActionDef[] }) {
  const list = actions.filter(Boolean);
  if (list.length === 0) return null;
  return (
    <div className={cn('grid gap-2', list.length === 1 ? 'grid-cols-1' : list.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {list.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          disabled={a.disabled}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-accent)] disabled:cursor-not-allowed disabled:opacity-40',
            (a.variant ?? 'secondary') === 'primary' && 'border-transparent bg-[var(--shell-accent)] text-[var(--shell-accent-fg)] hover:opacity-90',
            (a.variant ?? 'secondary') === 'secondary' && 'border-[var(--input)] bg-transparent text-[var(--shell-text)] hover:bg-[var(--shell-hover)]',
            a.variant === 'danger' && 'border-[var(--danger)] bg-transparent text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]',
          )}
        >
          {a.icon}{a.label}
        </button>
      ))}
    </div>
  );
}

// The same actions as the panel footer, shown in the table toolbar next to Add, so a user can act from either
// place. Pages build the list once (`DetailActionDef[]`, empty when nothing is selected) and pass it to both.
const TOOLBAR_ICONS: Record<string, { icon: ReactNode; tone: string }> = {
  Submit: { icon: <Send className="h-4 w-4" />, tone: 'text-[var(--shell-accent)]' },
  Edit: { icon: <Pencil className="h-4 w-4" />, tone: 'text-[var(--info)]' },
  Delete: { icon: <Trash2 className="h-4 w-4" />, tone: 'text-[var(--danger)]' },
  Approve: { icon: <CheckCircle2 className="h-4 w-4" />, tone: 'text-[var(--success)]' },
  Reject: { icon: <XCircle className="h-4 w-4" />, tone: 'text-[var(--danger)]' },
  'Send back': { icon: <CornerUpLeft className="h-4 w-4" />, tone: 'text-[var(--info)]' },
  Void: { icon: <Ban className="h-4 w-4" />, tone: 'text-[var(--danger)]' },
  Pause: { icon: <PauseCircle className="h-4 w-4" />, tone: 'text-[var(--warning)]' },
  Resume: { icon: <PlayCircle className="h-4 w-4" />, tone: 'text-[var(--info)]' },
  Permissions: { icon: <Shield className="h-4 w-4" />, tone: 'text-[var(--warning)]' },
  Deactivate: { icon: <UserX className="h-4 w-4" />, tone: 'text-[var(--danger)]' },
  Allocation: { icon: <Briefcase className="h-4 w-4" />, tone: 'text-[var(--info)]' },
  Process: { icon: <CreditCard className="h-4 w-4" />, tone: 'text-[var(--shell-accent)]' },
  'Process payment': { icon: <CreditCard className="h-4 w-4" />, tone: 'text-[var(--shell-accent)]' },
};

export function ToolbarActions({ actions }: { actions: DetailActionDef[] }) {
  return (
    <>
      {actions.map((a) => {
        const meta = TOOLBAR_ICONS[a.label];
        return (
          <button key={a.label} type="button" className="btn-action" onClick={a.onClick} disabled={a.disabled}>
            {a.icon ?? (meta && <span aria-hidden className={meta.tone}>{meta.icon}</span>)}
            {a.label}
          </button>
        );
      })}
    </>
  );
}
