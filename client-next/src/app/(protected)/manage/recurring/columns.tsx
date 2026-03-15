"use client";

import { ColumnDef } from "@tanstack/react-table";
import { formatDate } from "@/lib/currency";
import { Building2 } from "lucide-react";
import type { RecurringTransaction } from "@/lib/types";

export const columns = (currency: string): ColumnDef<RecurringTransaction>[] => [
  {
    accessorKey: "id",
    header: "Code",
    cell: ({ row }) => (
      <span className="text-[12px] font-bold text-juniper font-mono">
        REC-{String(row.getValue("id")).padStart(3, "0")}
      </span>
    ),
    size: 100,
  },
  {
    accessorKey: "description",
    header: "Vendor",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Building2 className="w-3.5 h-3.5 text-juniper shrink-0" />
        <span className="truncate text-[12px] font-bold text-charcoal">
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
      <span className="text-[12px] font-medium text-charcoal">
        {row.getValue("category_name") || "Operating Expenses"}
      </span>
    ),
  },
  {
    accessorKey: "frequency",
    header: "Frequency",
    cell: ({ row }) => (
      <div className="flex justify-center">
        <span className="px-2 py-0.5 bg-[#F0F4F5] text-[9px] font-bold text-juniper rounded-md uppercase border border-casper/30">
          {row.getValue("frequency")}
        </span>
      </div>
    ),
    size: 120,
  },
  {
    accessorKey: "next_run",
    header: "Next Run",
    cell: ({ row }) => (
      <span className="text-[12px] text-charcoal/70">
        {row.getValue("next_run") ? formatDate(row.getValue("next_run") as string) : "—"}
      </span>
    ),
    size: 130,
  },
  {
    accessorKey: "last_run",
    header: "Last Run",
    cell: ({ row }) => (
      <span className="text-[12px] text-charcoal/40 italic">
        {(row.original as any).last_run ? formatDate((row.original as any).last_run) : "—"}
      </span>
    ),
    size: 130,
  },
  {
    id: "status",
    accessorFn: (row) => (row.is_active ? "Active" : "Paused"),
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <div className="flex justify-center">
          {status === "Active" ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">Active</span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">Paused</span>
          )}
        </div>
      );
    },
    size: 100,
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount"));
      return (
        <div className="text-[12px] font-bold text-right text-charcoal">
          ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      );
    },
    size: 140,
  },
];
