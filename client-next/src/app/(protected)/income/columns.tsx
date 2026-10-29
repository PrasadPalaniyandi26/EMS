"use client"

import { ColumnDef } from "@tanstack/react-table"
import { IdCell, TextCell, DateCell, MoneyCell, StatusText, headerRight } from "@/components/data-table/cells"

export const columns = (currency: string): ColumnDef<any>[] => [
  {
    accessorKey: "reference_id",
    header: "ID",
    cell: ({ row }) => <IdCell value={row.getValue("reference_id") || `#${row.original.id}`} />,
    size: 110,
  },
  {
    accessorKey: "receipt_number",
    header: "Invoice",
    cell: ({ row }) => <TextCell value={row.getValue("receipt_number")} />,
  },
  {
    id: "code",
    header: "Code",
    cell: ({ row }) => {
      const o = row.original
      const code = o.project_name
        ? (o.context_code || o.project_name)
        : o.product_name
        ? (o.context_code || o.product_name)
        : ""
      return <IdCell value={code} />
    },
  },
  {
    accessorKey: "category_name",
    header: "Category",
    cell: ({ row }) => <TextCell value={row.getValue("category_name")} />,
  },
  {
    accessorKey: "date_recorded",
    header: "Date",
    cell: ({ row }) => <DateCell value={row.getValue("date_recorded")} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusText status={row.getValue("status") as string} />,
  },
  {
    accessorKey: "total_amount",
    header: headerRight("Total amount"),
    cell: ({ row }) => <MoneyCell value={row.getValue("total_amount")} currency={currency} />,
  },
]
