"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { Product } from "@/lib/types"
import { IdCell, TextCell, ToneText } from "@/components/data-table/cells"

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  'R&D': 'muted',
  'Prototype': 'warning',
  'Assembly': 'warning',
  'Quality': 'info',
  'Market Ready': 'success',
  'Active': 'success',
  'Inactive': 'muted',
}

export const columns: ColumnDef<Product>[] = [
  {
    accessorKey: "code",
    header: "ID",
    cell: ({ row }) => <IdCell value={row.getValue("code") || `PRD-${String(row.original.id).padStart(3, '0')}`} />,
    size: 110,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <TextCell value={row.getValue("name") as string} strong />,
  },
  {
    accessorKey: "client_name",
    header: "Client",
    cell: ({ row }) => <TextCell value={row.getValue("client_name") as string} />,
  },
  {
    id: "lead_manager",
    header: "Lead / manager",
    cell: ({ row }) => <TextCell value={(row.original as any).lead} />,
  },
  {
    accessorKey: "type_name",
    header: "Type",
    cell: ({ row }) => <TextCell value={row.getValue("type_name") as string} />,
    size: 120,
  },
  {
    id: "category",
    accessorFn: (row) => (row as any).category,
    header: "Category",
    cell: ({ row }) => <TextCell value={row.getValue("category") as string} />,
  },
  {
    id: "status",
    accessorFn: (row) => (row as any).status || (row.is_active ? "Active" : "Inactive"),
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string
      return <ToneText label={status} tone={STATUS_TONE[status] || 'muted'} />
    },
    size: 110,
  },
]
