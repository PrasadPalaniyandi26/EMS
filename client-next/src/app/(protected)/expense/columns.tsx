"use client"

import { ColumnDef } from "@tanstack/react-table"
import { formatCurrency, formatDate } from "@/lib/currency"
import { getStatusConfig } from "@/lib/status"

export const columns = (currency: string): ColumnDef<any>[] => [
  {
    accessorKey: "reference_id",
    header: "ID",
    cell: ({ row }) => (
      <span className="text-[12px] font-bold font-mono text-blue-400">
        {row.getValue("reference_id") || `#${row.original.id}`}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: "receipt_number",
    header: "Receipt",
    cell: ({ row }) => (
      <span className="text-[12px] font-medium text-black/50 dark:text-white/60">
        {row.getValue("receipt_number") || "—"}
      </span>
    ),
  },
  {
    id: "code",
    header: "Code",
    cell: ({ row }) => (
      <span className="text-[12px] font-bold text-black/50 dark:text-white/60 font-mono">
        {row.original.project_name
          ? (row.original.context_code || row.original.project_name)
          : row.original.product_name
          ? (row.original.context_code || row.original.product_name)
          : "—"}
      </span>
    ),
  },
  {
    accessorKey: "category_name",
    header: "Category",
    cell: ({ row }) => (
      <span className="text-[12px] text-indigo-600 dark:text-indigo-300 font-medium">
        {row.getValue("category_name") || "—"}
      </span>
    ),
  },
  {
    accessorKey: "date_recorded",
    header: () => <div className="text-center">Date</div>,
    cell: ({ row }) => (
      <div className="text-[12px] text-black/50 dark:text-white/60 text-center">
        {formatDate(row.getValue("date_recorded"))}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: () => <div className="text-center">Status</div>,
    cell: ({ row }) => {
      const c = getStatusConfig(row.getValue("status") as string);
      return (
        <div className="flex items-center justify-center">
          <span className={`text-[12px] font-semibold ${c.color}`}>{c.label}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "total_amount",
    header: () => <div className="text-right">Total Amount</div>,
    cell: ({ row }) => (
      <div className="text-[12px] font-bold text-right text-black dark:text-white">
        {formatCurrency(row.getValue("total_amount"), currency)}
      </div>
    ),
  },
]
