"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Paperclip } from "lucide-react"
import { IdCell, TextCell, DateCell, MoneyCell, StatusText, headerRight } from "@/components/data-table/cells"

// What the employee has to act on first: sent back, rejected, draft; then what is waiting on others
export const EXPENSE_STATUS_RANK: Record<string, number> = { SENT_BACK: 0, REJECTED: 1, DRAFT: 2, PENDING_MANAGER: 3, PENDING_FINANCE: 4, APPROVED: 5, VOIDED: 6 }

export const columns = (currency: string): ColumnDef<any>[] => [
  {
    accessorKey: "reference_id",
    header: "ID",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <IdCell value={row.getValue("reference_id") || `#${row.original.id}`} />
        {row.original.receipt_path && <Paperclip aria-label="Receipt attached" className="h-3 w-3 shrink-0 text-[var(--shell-text-muted)]" />}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => <TextCell value={row.getValue("description")} strong className="block max-w-[130px] truncate" />,
  },
  {
    id: "code",
    header: "Charged to",
    cell: ({ row }) => {
      const o = row.original
      const code = o.project_name
        ? (o.context_code || o.project_name)
        : o.product_name
        ? (o.context_code || o.product_name)
        : o.context_type === "overhead"
        ? "Overhead"
        : ""
      return <IdCell value={code} />
    },
  },
  {
    accessorKey: "category_name",
    header: "Category",
    cell: ({ row }) => <TextCell value={row.getValue("category_name")} muted className="block max-w-[100px] truncate" />,
  },
  {
    accessorKey: "date_recorded",
    header: "Date",
    cell: ({ row }) => <DateCell value={row.getValue("date_recorded")} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    sortingFn: (a, b) => (EXPENSE_STATUS_RANK[String(a.original.status || "").toUpperCase()] ?? 9) - (EXPENSE_STATUS_RANK[String(b.original.status || "").toUpperCase()] ?? 9),
    cell: ({ row }) => <StatusText status={row.getValue("status") as string} />,
  },
  {
    accessorKey: "total_amount",
    header: headerRight("Total amount"),
    cell: ({ row }) => <MoneyCell value={row.getValue("total_amount")} currency={currency} />,
  },
]
