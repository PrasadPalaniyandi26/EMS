"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Client } from "@/lib/types"
import { IdCell, TextCell, ToneText, WholeCell, headerRight } from "@/components/data-table/cells"
import type { ClientOwing } from "@/hooks/use-invoicing"

export const columns: ColumnDef<Client>[] = [
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => <IdCell value={(row.original as any).code || ""} />,
    size: 100,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <TextCell value={row.getValue("name") as string} strong className="block max-w-[220px] truncate" />,
  },
  {
    accessorKey: "is_active",
    header: "Status",
    size: 110,
    cell: ({ row }) => {
      const v = row.getValue("is_active")
      const isActive = v === 1 || v === true
      return <ToneText label={isActive ? "Active" : "Inactive"} tone={isActive ? "success" : "muted"} />
    },
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
]

// What each client owes on issued invoices, shown to the roles that can see invoices
export const owingColumns = (owing: Map<number, ClientOwing>): ColumnDef<Client>[] => [
  {
    id: "outstanding",
    header: headerRight("Outstanding"),
    size: 120,
    sortUndefined: "last",
    accessorFn: (row) => owing.get(row.id)?.outstanding ?? 0,
    cell: ({ row }) => { const v = owing.get(row.original.id)?.outstanding ?? 0; return v > 0 ? <WholeCell symbol value={v} /> : <div className="text-right"><TextCell value="" /></div> },
  },
  {
    id: "overdue",
    header: headerRight("Overdue"),
    size: 110,
    accessorFn: (row) => owing.get(row.id)?.overdue ?? 0,
    cell: ({ row }) => { const o = owing.get(row.original.id); return o && o.overdue > 0 ? <div className="text-right"><ToneText label={String(Math.round(o.overdue).toLocaleString("en-IN"))} tone="danger" /></div> : <div className="text-right"><TextCell value="" /></div> },
  },
]
