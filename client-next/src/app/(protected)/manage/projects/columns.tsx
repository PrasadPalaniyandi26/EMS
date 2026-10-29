"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Project } from "@/lib/types"
import { IdCell, TextCell, MoneyCell, ToneText, headerRight } from "@/components/data-table/cells"

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  'Active': 'success',
  'Proposed': 'muted',
  'On-Hold': 'warning',
  'Completed': 'info',
  'Canceled': 'danger',
}

export const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "code",
    header: "Project ID",
    cell: ({ row }) => <IdCell value={row.getValue("code") || `PRJ-${String(row.original.id).padStart(3, '0')}`} />,
  },
  {
    accessorKey: "name",
    header: "Project name",
    cell: ({ row }) => <TextCell value={row.getValue("name") as string} strong />,
  },
  {
    accessorKey: "type_name",
    header: "Type",
    cell: ({ row }) => <TextCell value={row.getValue("type_name") as string} />,
  },
  {
    accessorKey: "lead",
    header: "Lead",
    cell: ({ row }) => <TextCell value={(row.original as any).lead} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = (row.original as any).status || "Active"
      return <ToneText label={status} tone={STATUS_TONE[status] || 'muted'} />
    },
  },
  {
    accessorKey: "budget",
    header: headerRight("Est. budget"),
    cell: ({ row }) => <MoneyCell value={(row.original as any).budget} currency="INR" />,
  },
]
