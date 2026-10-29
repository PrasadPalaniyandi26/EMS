"use client"

import { ColumnDef } from "@tanstack/react-table"
import { User } from "@/lib/types"
import { IdCell, TextCell, ToneText } from "@/components/data-table/cells"

const ROLE_LABEL = (name?: string) => (name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : 'Staff')

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  ON_HOLD: { label: 'On hold', tone: 'warning' },
  INACTIVE: { label: 'Inactive', tone: 'danger' },
}

export const columns = (users: User[]): ColumnDef<User>[] => [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => <IdCell value={`NT${10000 + row.original.id}`} />,
    size: 110,
  },
  {
    accessorKey: "username",
    header: "Name",
    cell: ({ row }) => <TextCell value={row.original.username} strong />,
  },
  {
    accessorKey: "department",
    header: "Department",
    cell: ({ row }) => <TextCell value={row.getValue("department") as string} />,
  },
  {
    accessorKey: "role_name",
    header: "Role",
    cell: ({ row }) => <TextCell value={ROLE_LABEL(row.getValue("role_name") as string)} />,
  },
  {
    accessorKey: "manager_id",
    header: "Manager",
    cell: ({ row }) => {
      const managerId = row.getValue("manager_id") as number
      const managerName = row.original.manager_name || users.find(u => u.id === managerId)?.username
      return <TextCell value={managerName} />
    },
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const status = String(row.original.user_status || (row.getValue("is_active") !== 0 ? 'ACTIVE' : 'INACTIVE')).toUpperCase()
      const cfg = STATUS[status] || { label: status, tone: 'muted' as const }
      return <ToneText label={cfg.label} tone={cfg.tone} />
    },
  },
]
