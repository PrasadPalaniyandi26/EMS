"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { Product } from "@/lib/types"
import { IdCell, TextCell, ToneText, MoneyCell, headerRight } from "@/components/data-table/cells"

// One list of lifecycle stages, used by the table, the panel and the Add and Edit dialog
export const PRODUCT_STATUSES = ['R&D', 'Prototype', 'Pilot', 'Assembly', 'Quality', 'Production', 'Market Ready']

export const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  'R&D': 'muted',
  'Prototype': 'warning',
  'Pilot': 'warning',
  'Assembly': 'warning',
  'Quality': 'info',
  'Production': 'success',
  'Market Ready': 'success',
  'Active': 'success',
  'Inactive': 'muted',
}

export type CostFacts = { bom_lines: number; standard_cost: number | null }

// Products that cannot be costed yet come first, then the rest by how early they are in their life
export const productAttention = (p: any, cost?: CostFacts): number => {
  if (cost && !cost.bom_lines) return 0
  if (cost && cost.standard_cost == null) return 1
  const i = PRODUCT_STATUSES.indexOf(p.status || '')
  return 2 + (i < 0 ? 9 : i)
}

export const columns = (currency: string, costOf: (id: number) => CostFacts | undefined): ColumnDef<Product>[] => [
  {
    accessorKey: "code",
    header: "ID",
    cell: ({ row }) => <IdCell value={(row.getValue("code") as string) || ""} />,
    size: 110,
  },
  {
    accessorKey: "name",
    header: "Name",
    // Client as the second line: product names repeat across clients
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[220px]">
        <TextCell value={row.getValue("name") as string} strong className="block truncate" />
        {(row.original as any).client_name && <TextCell value={(row.original as any).client_name} muted className="block truncate text-[12px]" />}
      </div>
    ),
  },
  {
    accessorKey: "type_name",
    header: "Type",
    cell: ({ row }) => <TextCell value={row.getValue("type_name") as string} muted />,
    size: 120,
  },
  {
    id: "status",
    accessorFn: (row) => productAttention(row, costOf(row.id)),
    header: "Status",
    cell: ({ row }) => {
      const status = ((row.original as any).status || (row.original.is_active ? "Active" : "Inactive")) as string
      const c = costOf(row.original.id)
      const note = c && !c.bom_lines ? "No BOM" : c && c.standard_cost == null ? "No standard cost" : ""
      return (
        <div>
          <ToneText label={status} tone={STATUS_TONE[status] || 'muted'} />
          {note && <span className="block text-[12px] text-[var(--warning)]">{note}</span>}
        </div>
      )
    },
    size: 130,
  },
  {
    id: "standard_cost",
    header: headerRight("Standard cost"),
    accessorFn: (row) => costOf(row.id)?.standard_cost ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => {
      const v = costOf(row.original.id)?.standard_cost
      return v == null ? <div className="text-right"><TextCell value="" /></div> : <MoneyCell value={v} currency={currency} />
    },
  },
]
