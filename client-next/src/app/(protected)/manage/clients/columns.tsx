"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Client } from "@/lib/types"
import { IdCell, TextCell, ToneText } from "@/components/data-table/cells"

export const columns: ColumnDef<Client>[] = [
  {
    accessorKey: "code",
    header: "ID",
    cell: ({ row }) => <IdCell value={(row.original as any).code || ""} />,
    size: 140,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <TextCell value={row.getValue("name") as string} strong className="block max-w-[220px] truncate" />,
  },
  {
    accessorKey: "business_type",
    header: "Industry",
    cell: ({ row }) => <TextCell value={row.getValue("business_type") as string} muted />,
  },
  {
    accessorKey: "contact_name",
    header: "Contact",
    // Who to call, with the way to reach them as a second line
    cell: ({ row }) => {
      const o = row.original as any
      return (
        <div className="min-w-0 max-w-[200px]">
          <TextCell value={row.getValue("contact_name") as string} className="block truncate" />
          {(o.contact_email || o.contact_phone) && <TextCell value={o.contact_email || o.contact_phone} muted className="block truncate text-[12px]" />}
        </div>
      )
    },
  },
  {
    id: "country",
    header: "Country",
    cell: ({ row }) => <TextCell value={(row.original as any).country} muted />,
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const v = row.getValue("is_active")
      const isActive = v === 1 || v === true
      return <ToneText label={isActive ? "Active" : "Inactive"} tone={isActive ? "success" : "muted"} />
    },
  },
]
