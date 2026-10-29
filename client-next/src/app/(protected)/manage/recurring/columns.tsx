"use client";

import { ColumnDef } from "@tanstack/react-table";
import { formatCurrency, formatDate } from "@/lib/currency";
import { Building2 } from "lucide-react";
import type { RecurringTransaction } from "@/lib/types";
import { getStatusConfig } from "@/lib/status";

export const columns = (currency: string): ColumnDef<RecurringTransaction>[] => [
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => (
      <span className="text-[12px] font-bold text-[var(--info)] font-mono">
        {row.getValue("code")}
      </span>
    ),
    size: 100,
  },
  {
    accessorKey: "description",
    header: "Vendor",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Building2 className="w-3.5 h-3.5 text-black/40 dark:text-white/50 shrink-0" />
        <span className="truncate text-[12px] font-bold text-black dark:text-white">
          {row.getValue("description") || "Unknown"}
        </span>
      </div>
    ),
    size: 200,
  },
  {
    accessorKey: "category_name",
    header: "Description",
    cell: ({ row }) => (
      <span className="text-[12px] font-medium text-black/60 dark:text-white/70">
        {row.getValue("category_name") || "Operating Expenses"}
      </span>
    ),
  },
  {
    accessorKey: "frequency",
    header: "Frequency",
    cell: ({ row }) => (
      <span className="text-[12px] font-semibold text-[var(--info)] uppercase">
        {row.getValue("frequency")}
      </span>
    ),
    size: 120,
  },
  {
    accessorKey: "next_run_date",
    header: "Next Run",
    cell: ({ row }) => (
      <span className="text-[12px] text-black/60 dark:text-white/70">
        {row.getValue("next_run_date") ? formatDate(row.getValue("next_run_date") as string) : "—"}
      </span>
    ),
    size: 130,
  },
  {
    accessorKey: "last_run_date",
    header: "Last Run",
    cell: ({ row }) => (
      <span className="text-[12px] text-black/40 dark:text-white/45 italic">
        {row.getValue("last_run_date") ? formatDate(row.getValue("last_run_date") as string) : "—"}
      </span>
    ),
    size: 130,
  },
  {
    id: "status",
    accessorFn: (row) => (row as any).status ?? 'DRAFT',
    header: "Status",
    cell: ({ row }) => {
      const c = getStatusConfig(row.getValue("status") as string);
      return <span className={`text-[12px] font-semibold ${c.color}`}>{c.label}</span>;
    },
    size: 130,
  },
  {
    id: "state",
    accessorFn: (row) => (row as any).status === 'APPROVED' ? (row.is_active ? 'Active' : 'Inactive') : null,
    header: "State",
    cell: ({ row }) => {
      const state = row.getValue("state") as string | null;
      if (!state) return <span className="text-[12px] text-black/25 dark:text-white/25">—</span>;
      return (
        <span className={`text-[12px] font-semibold ${state === 'Active' ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
          {state}
        </span>
      );
    },
    size: 90,
  },
  {
    accessorKey: "total_amount",
    header: () => <div className="text-right">Total Amount</div>,
    cell: ({ row }) => {
      const val = row.getValue("total_amount");
      const amount = val != null ? parseFloat(String(val)) : parseFloat(String((row.original as any).amount ?? 0));
      return (
        <div className="text-[12px] font-bold text-right text-black dark:text-white">
          {formatCurrency(amount, currency || 'INR')}
        </div>
      );
    },
    size: 140,
  },
];
