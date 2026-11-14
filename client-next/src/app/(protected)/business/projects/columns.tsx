"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Project } from "@/lib/types"
import type { ProjectRow } from "@/hooks/use-planning-queries"
import { IdCell, TextCell, DateCell, ToneText, WholeCell, headerRight } from "@/components/data-table/cells"
import { marginTone, projectVerdict, VERDICT_RANK } from "@/components/budgets/budget-ui"

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  'Active': 'success',
  'Proposed': 'muted',
  'On-Hold': 'warning',
  'Completed': 'info',
  'Canceled': 'danger',
  'Overdue': 'danger',
}
export const PROJECT_STATUS_TONE = STATUS_TONE
export const PROJECT_STATES = ['Overdue', 'On-Hold', 'Active', 'Proposed', 'Completed', 'Canceled']

// Past its end date and still active: the one thing to look at first
export const projectState = (p: any): string => {
  const status = p.status || 'Active'
  if (status === 'Active' && p.end_date) {
    const end = new Date(String(p.end_date).slice(0, 10) + 'T00:00:00')
    const today = new Date(); today.setHours(0, 0, 0, 0)
    if (end < today) return 'Overdue'
  }
  return status
}

export const verdictOf = (r: ProjectRow, currency: string) =>
  projectVerdict({ estimate: r.estimate_total, spent: r.actual, margin: r.projected_margin_pct, target: r.target_margin_pct, min: r.min_margin_pct }, currency)
export const spentPct = (r: ProjectRow) => (r.estimate_total ? (r.actual / r.estimate_total) * 100 : null)
const barColor = (p: number) => (p >= 100 ? 'var(--danger)' : p >= 80 ? 'var(--warning)' : 'var(--success)')

// Projects that need a look come first: past their end date, on hold, then active ones by how their costing stands
export const projectAttention = (p: any, cost: ProjectRow | undefined, currency: string): number => {
  const s = projectState(p)
  if (s === 'Overdue') return 0
  if (s === 'On-Hold') return 1
  if (s === 'Active') return 2 + (cost ? VERDICT_RANK[verdictOf(cost, currency).label] ?? 5 : 5) / 10
  return s === 'Proposed' ? 4 : 5
}

export const columns = (currency: string, costOf: (id: number) => ProjectRow | undefined): ColumnDef<Project>[] => [
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => <IdCell value={(row.getValue("code") as string) || ""} />,
    size: 100,
  },
  {
    accessorKey: "name",
    header: "Project",
    // The client is the second line: project names repeat across clients
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[220px]">
        <TextCell value={row.getValue("name") as string} strong className="block truncate" />
        {(row.original as any).client_name && <TextCell value={(row.original as any).client_name} muted className="block truncate text-[12px]" />}
      </div>
    ),
  },
  {
    accessorKey: "end_date",
    header: "Ends",
    cell: ({ row }) => <DateCell value={(row.original as any).end_date} />,
    size: 110,
  },
  {
    id: "status",
    header: "Status",
    size: 110,
    accessorFn: (row) => projectAttention(row, costOf(row.id), currency),
    cell: ({ row }) => {
      const s = projectState(row.original)
      return <ToneText label={s} tone={STATUS_TONE[s] || 'muted'} />
    },
  },
  {
    id: "costing",
    header: "Costing",
    size: 120,
    accessorFn: (row) => { const c = costOf(row.id); return c ? VERDICT_RANK[verdictOf(c, currency).label] : 9 },
    cell: ({ row }) => { const c = costOf(row.original.id); if (!c) return <TextCell value="" />; const v = verdictOf(c, currency); return <span title={v.reason}><ToneText label={v.label} tone={v.tone} /></span> },
  },
  {
    id: "projected_margin_pct",
    header: headerRight("Margin"),
    size: 90,
    sortUndefined: "last",
    accessorFn: (row) => costOf(row.id)?.projected_margin_pct ?? undefined,
    cell: ({ row }) => {
      const c = costOf(row.original.id)
      const m = c?.projected_margin_pct ?? null
      return <div className="text-right"><ToneText label={m == null ? '' : `${m.toFixed(1)}%`} tone={c ? marginTone(m, c.target_margin_pct, c.min_margin_pct) : 'muted'} /></div>
    },
  },
  {
    id: "actual",
    header: headerRight("Spent"),
    size: 110,
    sortUndefined: "last",
    accessorFn: (row) => costOf(row.id)?.actual ?? undefined,
    cell: ({ row }) => <WholeCell value={costOf(row.original.id)?.actual ?? null} currency={currency} />,
  },
  {
    id: "spent_pct",
    header: headerRight("Of estimate"),
    size: 130,
    sortUndefined: "last",
    accessorFn: (row) => { const c = costOf(row.id); return c ? spentPct(c) ?? undefined : undefined },
    cell: ({ row }) => {
      const c = costOf(row.original.id)
      const p = c ? spentPct(c) : null
      if (p == null) return <div className="text-right"><ToneText label="" /></div>
      return (
        <div className="flex items-center justify-end gap-2">
          <div aria-hidden className="h-1.5 w-12 overflow-hidden rounded-md bg-[var(--shell-hover)]">
            <div className="h-full rounded-md" style={{ width: `${Math.min(p, 100)}%`, background: barColor(p) }} />
          </div>
          <span className="w-9 text-right text-[13px] font-medium tabular-nums text-[var(--shell-text)]">{Math.round(p)}%</span>
        </div>
      )
    },
  },
] as ColumnDef<Project>[]
