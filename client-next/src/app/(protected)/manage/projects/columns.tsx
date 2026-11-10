"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Project } from "@/lib/types"
import { IdCell, TextCell, DateCell, ToneText } from "@/components/data-table/cells"

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  'Active': 'success',
  'Proposed': 'muted',
  'On-Hold': 'warning',
  'Completed': 'info',
  'Canceled': 'danger',
  'Overdue': 'danger',
}
export const PROJECT_STATUS_TONE = STATUS_TONE

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
const RANK: Record<string, number> = { Overdue: 0, 'On-Hold': 1, Active: 2, Proposed: 3, Completed: 4, Canceled: 5 }

export const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "code",
    header: "Project ID",
    cell: ({ row }) => <IdCell value={(row.getValue("code") as string) || ""} />,
  },
  {
    accessorKey: "name",
    header: "Project name",
    // The client is the second line: project names repeat across clients
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
  },
  {
    accessorKey: "lead",
    header: "Lead",
    cell: ({ row }) => <TextCell value={(row.original as any).lead} muted />,
  },
  {
    accessorKey: "end_date",
    header: "Ends",
    cell: ({ row }) => <DateCell value={(row.original as any).end_date} />,
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (row) => RANK[projectState(row)] ?? 9,
    cell: ({ row }) => {
      const s = projectState(row.original)
      return <ToneText label={s} tone={STATUS_TONE[s] || 'muted'} />
    },
  },
]
