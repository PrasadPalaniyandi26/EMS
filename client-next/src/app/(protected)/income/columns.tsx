"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Paperclip } from "lucide-react"
import { IdCell, TextCell, DateCell, MoneyCell, StatusText, headerRight } from "@/components/data-table/cells"

export const columns = (currency: string): ColumnDef<any>[] => [
  {
    accessorKey: "reference_id",
    header: "Code",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <IdCell value={row.getValue("reference_id") || `#${row.original.id}`} />
        {row.original.receipt_path && <Paperclip aria-label="Invoice attached" className="h-3 w-3 shrink-0 text-[var(--shell-text-muted)]" />}
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
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusText status={row.getValue("status") as string} />,
  },
  {
    accessorKey: "client_name",
    header: "Client",
    cell: ({ row }) => <TextCell value={row.getValue("client_name")} muted className="block max-w-[120px] truncate" />,
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
    accessorKey: "total_amount",
    header: headerRight("Amount"),
    cell: ({ row }) => <MoneyCell value={row.getValue("total_amount")} currency={currency} />,
  },
]
