"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Client } from "@/lib/types"
import { IdCell, TextCell, ToneText } from "@/components/data-table/cells"

export const columns: ColumnDef<Client>[] = [
  {
    accessorKey: "code",
    header: "ID",
    cell: ({ row }) => <IdCell value={(row.original as any).code || `CL-XX-${1000 + row.original.id}`} />,
    size: 140,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <TextCell value={row.getValue("name") as string} strong />,
  },
  {
    accessorKey: "business_type",
    header: "Industry",
    cell: ({ row }) => <TextCell value={row.getValue("business_type") as string} />,
  },
  {
    accessorKey: "contact_name",
    header: "Contact",
    cell: ({ row }) => <TextCell value={row.getValue("contact_name") as string} />,
  },
  {
    id: "country",
    header: "Country",
    cell: ({ row }) => <TextCell value={(row.original as any).country} />,
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const isActive = row.getValue("is_active") === 1
      return <ToneText label={isActive ? "Active" : "Inactive"} tone={isActive ? "success" : "muted"} />
    },
  },
]
