'use client';

import { InlineAlert } from '@/components/shared/inline-alert';
import { useHeadroom } from '@/hooks/use-budget-queries';
import { money as fmt } from '@/components/budgets/budget-ui';
import type { Headroom } from '@/hooks/use-budget-queries';

// What the expense being entered does to its budget line: headroom while within budget, a reason field
// (rendered by the dialog) when over, and a stop when the line is strict or the type is not allowed.
// Renders nothing when there is no budget to show, so dialogs stay as they were for uncontrolled spend.
export function BudgetHeadroom({ headroom, currency = 'INR', className }: { headroom?: Headroom; currency?: string; className?: string }) {
  if (!headroom || headroom.state === 'NONE' || headroom.state === 'NO_PLAN') return null;
  const money = (v: number) => fmt(v, currency);

  if (headroom.state === 'NOT_ALLOWED') {
    return <InlineAlert className={className} tone="danger">{headroom.message}</InlineAlert>;
  }
  if (headroom.state === 'NO_LINE') {
    return <InlineAlert className={className} tone="warning" title="No budget line">{headroom.message}</InlineAlert>;
  }

  const budget = headroom.budget ?? 0;
  const used = headroom.used ?? 0;
  const left = headroom.left ?? 0;
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 100;
  const tone = headroom.state === 'OK' ? 'success' : headroom.state === 'OVER' ? 'warning' : 'danger';

  return (
    <div className={className}>
      <div className="rounded-lg border border-[var(--shell-border)] p-3">
        <p className="text-[12px] text-[var(--shell-text-muted)]">Budget · {headroom.line_label} · to {headroom.to_month}</p>
        <p className="mt-0.5 text-[13px] font-medium text-[var(--shell-text)]">
          {left >= 0 ? `${money(left)} left of ${money(budget)}` : `${money(-left)} over ${money(budget)}`}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--shell-border)]" role="img" aria-label={`${Math.round(pct)}% of the line used`}>
          <div className={tone === 'success' ? 'h-full bg-[var(--shell-accent)]' : tone === 'warning' ? 'h-full bg-[var(--warning)]' : 'h-full bg-[var(--danger)]'} style={{ width: `${pct}%` }} />
        </div>
        {headroom.message && (
          <p className={`mt-2 text-[12px] ${headroom.state === 'BLOCKED' ? 'text-[var(--danger)]' : 'text-[var(--shell-text)]'}`}>{headroom.message}</p>
        )}
      </div>
    </div>
  );
}

// Whether the form may be saved given the headroom, and whether a reason must be given
export function headroomGate(h?: Headroom) {
  const blocked = h?.state === 'BLOCKED' || h?.state === 'NOT_ALLOWED';
  const needsReason = h?.state === 'OVER' || h?.state === 'NO_LINE';
  return { blocked, needsReason };
}

// One line of text under a split part: what is left on the line that part lands on
export function SplitRowHeadroom({ txn, categoryId, amount, currency = 'INR' }: { txn: any; categoryId: string; amount: string; currency?: string }) {
  const ctx = txn?.context_type || 'project';
  const objectId = ctx === 'product' ? txn?.product_id : ctx === 'overhead' ? txn?.department_id : txn?.project_id;
  const on = !!txn && !!categoryId && Number(amount) > 0 && !!objectId;
  const { data } = useHeadroom({
    date: String(txn?.date_recorded ?? '').split('T')[0], contextType: ctx, categoryId, amount,
    projectId: ctx === 'project' ? objectId : undefined, productId: ctx === 'product' ? objectId : undefined, departmentId: ctx === 'overhead' ? objectId : undefined,
    excludeId: txn?.id,
  }, on);
  if (!on || !data || data.state === 'NONE' || data.state === 'NO_PLAN') return null;
  const money = (v: number) => fmt(v, currency);
  if (data.state === 'NOT_ALLOWED' || data.state === 'NO_LINE') return <p className="px-1 text-[12px] text-[var(--warning)]">{data.message}</p>;
  const left = data.left ?? 0;
  const bad = data.state !== 'OK';
  return (
    <p className={`px-1 text-[12px] ${bad ? 'text-[var(--warning)]' : 'text-[var(--shell-text-muted)]'}`}>
      {left >= 0 ? `${money(left)} left of ${money(data.budget ?? 0)}` : `${money(-left)} over ${money(data.budget ?? 0)}`} in {data.line_label}
      {data.state === 'BLOCKED' ? '. Strict line: this part cannot be submitted.' : ''}
    </p>
  );
}
