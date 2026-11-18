"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { Product } from "@/lib/types"
import type { ProductRow } from "@/hooks/use-planning-queries"
import { IdCell, TextCell, ToneText, headerRight, WholeCell } from "@/components/data-table/cells"
import { marginTone } from "@/components/budgets/budget-ui"

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

// Where a product stands on its standard cost: approved, due to be done again, or not yet approved
export const costStatus = (r: ProductRow): { label: string; tone: 'success' | 'warning' | 'muted' } => {
  if (r.standard_cost != null) {
    const newYear = r.standard_fy != null && r.standard_fy < r.fy
    const drifted = r.rolled_cost != null && Math.abs(r.rolled_cost - r.standard_cost) > 0.5
    return { label: newYear ? 'Re-cost for new year' : drifted ? 'Re-cost due' : 'Approved', tone: newYear || drifted ? 'warning' : 'success' }
  }
  return { label: r.bom_lines ? 'Not approved' : 'No BOM', tone: 'muted' }
}
export const COST_STATUSES = ['Approved', 'Re-cost due', 'Re-cost for new year', 'Not approved', 'No BOM']

// Products that cannot be costed yet come first, then the rest by how early they are in their life
export const productAttention = (p: any, cost?: ProductRow): number => {
  if (cost && !cost.bom_lines) return 0
  if (cost && cost.standard_cost == null) return 1
  const i = PRODUCT_STATUSES.indexOf(p.status || '')
  return 2 + (i < 0 ? 9 : i)
}

export const columns = (currency: string, costOf: (id: number) => ProductRow | undefined): ColumnDef<Product>[] => [
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => <IdCell value={(row.getValue("code") as string) || ""} />,
    size: 100,
  },
  {
    accessorKey: "name",
    header: "Product",
    // Client as the second line: product names repeat across clients
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[220px]">
        <TextCell value={row.getValue("name") as string} strong className="block truncate" />
        {(row.original as any).client_name && <TextCell value={(row.original as any).client_name} muted className="block truncate text-[12px]" />}
      </div>
    ),
  },
  {
    id: "status",
    accessorFn: (row) => productAttention(row, costOf(row.id)),
    header: "Status",
    cell: ({ row }) => {
      const status = ((row.original as any).status || (row.original.is_active ? "Active" : "Inactive")) as string
      return <ToneText label={status} tone={STATUS_TONE[status] || 'muted'} />
    },
    size: 110,
  },
  {
    id: "cost_status",
    header: "Costing",
    size: 130,
    accessorFn: (row) => { const c = costOf(row.id); return c ? costStatus(c).label : '' },
    cell: ({ row }) => { const c = costOf(row.original.id); if (!c) return <TextCell value="" />; const s = costStatus(c); return <ToneText label={s.label} tone={s.tone} /> },
  },
  {
    id: "margin_pct",
    header: headerRight("Margin"),
    size: 90,
    sortUndefined: "last",
    accessorFn: (row) => costOf(row.id)?.margin_pct ?? undefined,
    cell: ({ row }) => {
      const c = costOf(row.original.id)
      const m = c?.margin_pct ?? null
      return <div className="text-right"><ToneText label={m == null ? '' : `${m.toFixed(1)}%`} tone={c ? marginTone(m, c.target_margin_pct, c.min_margin_pct) : 'muted'} /></div>
    },
  },
  {
    id: "standard_cost",
    header: headerRight("Standard cost"),
    size: 110,
    sortUndefined: "last",
    accessorFn: (row) => costOf(row.id)?.standard_cost ?? undefined,
    cell: ({ row }) => <WholeCell value={costOf(row.original.id)?.standard_cost ?? null} currency={currency} />,
  },
  {
    id: "selling_price",
    header: headerRight("Selling price"),
    size: 110,
    sortUndefined: "last",
    accessorFn: (row) => costOf(row.id)?.selling_price ?? undefined,
    cell: ({ row }) => <WholeCell value={costOf(row.original.id)?.selling_price ?? null} currency={currency} />,
  },
] as ColumnDef<Product>[]
