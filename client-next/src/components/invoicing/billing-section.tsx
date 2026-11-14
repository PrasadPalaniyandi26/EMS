'use client';

import Link from 'next/link';
import { DetailSection, DetailGrid, DetailField } from '@/components/shared/detail/detail-kit';
import { useAuthStore } from '@/stores/auth-store';
import { useBilling, INVOICE_STATUS, PO_STATUS } from '@/hooks/use-invoicing';
import { money } from '@/lib/money';
import { formatDate } from '@/lib/currency';
import { cn } from '@/lib/utils';

const BILLING_ROLES = ['ADMIN', 'FINANCE', 'MANAGER', 'OPERATIONS'];
const TONE = { success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]', info: 'text-[var(--info)]', muted: 'text-[var(--shell-text-muted)]' } as const;

// The Billing block of a project or order panel: the client's POs, what has been invoiced against the contract, and what is still owed
export function BillingSection({ kind, id }: { kind: 'project' | 'order'; id: number }) {
  const role = (useAuthStore((s) => s.user?.role_name) || '').toUpperCase();
  const currency = useAuthStore((s) => s.user?.currency) || 'INR';
  const allowed = BILLING_ROLES.includes(role);
  const { data, isLoading, isError } = useBilling(kind, id, allowed);
  if (!allowed) return null;
  const what = kind === 'project' ? 'contract value' : 'order value';
  const b = data;
  const empty = !!b && b.pos.length === 0 && b.invoices.length === 0;

  return (
    <DetailSection title="Billing">
      {isLoading ? <p className="text-[12px] text-[var(--shell-text-muted)]">Loading…</p> : isError || !b ? <p className="text-[12px] text-[var(--shell-text-muted)]">Billing could not be loaded.</p> : empty ? (
        <p className="text-[12px] text-[var(--shell-text-muted)]">No client PO or invoice for this {kind} yet. Add them on the Clients page.</p>
      ) : (
        <>
          <DetailGrid>
            <DetailField label={kind === 'project' ? 'Contract value' : 'Order value'} value={b.contract_value != null ? money(b.contract_value, currency) : 'Not set'} />
            <DetailField label="Client POs" value={b.pos.length > 0 ? money(b.po_value, currency) : undefined} />
            <DetailField label="Invoiced" value={money(b.invoiced, currency)} />
            <DetailField label={`Of the ${what}`} value={b.invoiced_pct != null ? `${b.invoiced_pct.toFixed(0)}%` : undefined} tone={b.invoiced_pct != null && b.invoiced_pct > 100.5 ? 'warning' : 'muted'} />
            <DetailField label="Received" value={money(b.received, currency)} />
            <DetailField label="Outstanding" value={money(b.outstanding, currency)} />
            {b.overdue > 0 && <DetailField label="Overdue" value={money(b.overdue, currency)} tone="danger" wide />}
          </DetailGrid>
          {b.invoiced_pct != null && (
            <div role="img" aria-label={`${b.invoiced_pct.toFixed(0)}% of the ${what} invoiced`} className="h-1.5 overflow-hidden rounded-md bg-[var(--shell-hover)]">
              <div className="h-full rounded-md bg-[var(--chart-1)]" style={{ width: `${Math.min(100, b.invoiced_pct)}%` }} />
            </div>
          )}
          {b.pos.length > 0 && (
            <ul className="divide-y divide-[var(--shell-border)] rounded-md border border-[var(--shell-border)]">
              {b.pos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
                  <span className="min-w-0 truncate text-[var(--shell-text)]">PO {p.po_number}</span>
                  <span className="shrink-0 tabular-nums text-[var(--shell-text-muted)]">{money(p.invoiced, currency)} of {money(p.value, currency)}<span className={cn('ml-2', TONE[PO_STATUS[p.status].tone])}>{PO_STATUS[p.status].label}</span></span>
                </li>
              ))}
            </ul>
          )}
          {b.invoices.length > 0 && (
            <ul className="divide-y divide-[var(--shell-border)] rounded-md border border-[var(--shell-border)]">
              {b.invoices.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <Link href={`/manage/clients/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px] hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)]">
                    <span className="min-w-0 truncate text-[var(--shell-accent)]">{i.number ?? 'Draft'}<span className="ml-2 text-[var(--shell-text-muted)]">{formatDate(i.invoice_date)}</span></span>
                    <span className="shrink-0 tabular-nums text-[var(--shell-text)]">{money(i.total, currency)}<span className={cn('ml-2', i.overdue ? TONE.danger : TONE[INVOICE_STATUS[i.status].tone])}>{i.overdue ? 'Overdue' : INVOICE_STATUS[i.status].label}</span></span>
                  </Link>
                </li>
              ))}
              {b.invoices.length > 6 && <li className="px-3 py-2 text-[12px] text-[var(--shell-text-muted)]">and {b.invoices.length - 6} more on the Clients page</li>}
            </ul>
          )}
        </>
      )}
    </DetailSection>
  );
}
