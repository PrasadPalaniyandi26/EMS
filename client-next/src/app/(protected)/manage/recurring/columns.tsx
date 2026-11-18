"use client";

import { ColumnDef } from "@tanstack/react-table";
import type { RecurringTransaction } from "@/lib/types";
import { STATUS_LIST } from "@/lib/status";
import { IdCell, TextCell, DateCell, MoneyCell, ToneText, headerRight } from "@/components/data-table/cells";

// One wording for how often a schedule runs, used in the table, the panel and the dialogs
export const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly',
};
export const frequencyLabel = (f?: string) => (f ? FREQUENCY_LABELS[f.toLowerCase()] ?? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : '');

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysUntil = (v?: string | null) => (v ? Math.round((new Date(String(v).slice(0, 10) + 'T00:00:00').getTime() - startOfToday().getTime()) / 86400000) : null);

// One word for where a schedule stands, the ones that need a look first
export type RecurringState = 'Overdue' | 'Due soon' | 'Active' | 'With Manager' | 'With Finance' | 'Sent Back' | 'Draft' | 'Paused' | 'Ended' | 'Rejected';
const RANK: Record<RecurringState, number> = { Overdue: 0, 'Due soon': 1, Active: 2, 'With Manager': 3, 'With Finance': 4, 'Sent Back': 5, Draft: 6, Paused: 7, Ended: 8, Rejected: 9 };
const TONE: Record<RecurringState, 'success' | 'warning' | 'danger' | 'muted'> = { Overdue: 'danger', 'Due soon': 'warning', Active: 'success', 'With Manager': 'warning', 'With Finance': 'warning', 'Sent Back': 'warning', Draft: 'muted', Paused: 'muted', Ended: 'muted', Rejected: 'danger' };
export const recurringState = (r: any): RecurringState => {
  const st = String(r.status ?? 'DRAFT').toUpperCase();
  if (st === 'APPROVED') {
    const end = daysUntil(r.end_date);
    if (end != null && end < 0) return 'Ended';
    if (!r.is_active) return 'Paused';
    const d = daysUntil(r.next_run_date);
    if (d != null && d < 0) return 'Overdue';
    if (d != null && d <= 7) return 'Due soon';
    return 'Active';
  }
  if (st === 'PENDING_MANAGER') return STATUS_LIST.PENDING_MANAGER.label;
  if (st === 'PENDING_FINANCE') return STATUS_LIST.PENDING_FINANCE.label;
  if (st === 'SENT_BACK') return STATUS_LIST.SENT_BACK.label;
  if (st === 'REJECTED') return STATUS_LIST.REJECTED.label;
  return 'Draft';
};
export const recurringTone = (s: RecurringState) => TONE[s];
export const RECURRING_STATES = Object.keys(RANK) as RecurringState[];

export const columns = (currency: string): ColumnDef<RecurringTransaction>[] => [
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => <IdCell value={row.getValue("code")} />,
    size: 100,
  },
  {
    accessorKey: "description",
    header: "Name",
    cell: ({ row }) => <TextCell value={row.getValue("description") || "Unknown"} strong className="block max-w-[200px] truncate" />,
    size: 200,
  },
  {
    id: "status",
    accessorFn: (row) => RANK[recurringState(row)],
    header: "Status",
    cell: ({ row }) => { const s = recurringState(row.original); return <ToneText label={s} tone={TONE[s]} />; },
    size: 110,
  },
  {
    accessorKey: "category_name",
    header: "Category",
    cell: ({ row }) => <TextCell value={row.getValue("category_name") || "Operating Expenses"} muted className="block max-w-[160px] truncate" />,
  },
  {
    accessorKey: "frequency",
    header: "Frequency",
    cell: ({ row }) => <TextCell value={frequencyLabel(row.getValue("frequency") as string)} />,
    size: 120,
  },
  {
    accessorKey: "next_run_date",
    header: "Next run",
    cell: ({ row }) => {
      const r = row.original as any;
      const late = recurringState(r) === 'Overdue';
      return late ? <ToneText label={new Date(String(r.next_run_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB')} tone="danger" /> : <DateCell value={row.getValue("next_run_date") as string} />;
    },
    size: 130,
  },
  {
    accessorKey: "total_amount",
    header: headerRight("Amount per run"),
    cell: ({ row }) => {
      const val = row.getValue("total_amount");
      const amount = val != null ? parseFloat(String(val)) : parseFloat(String((row.original as any).amount ?? 0));
      return <MoneyCell value={amount} currency={currency || 'INR'} />;
    },
    size: 140,
  },
];
