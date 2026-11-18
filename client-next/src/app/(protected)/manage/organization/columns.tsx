"use client"

import { ColumnDef } from "@tanstack/react-table"
import { User } from "@/lib/types"
import { IdCell, TextCell, ToneText } from "@/components/data-table/cells"

const ROLE_LABEL = (name?: string) => (name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : 'Staff')

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted'; rank: number }> = {
  ON_HOLD: { label: 'On hold', tone: 'warning', rank: 0 },
  INACTIVE: { label: 'Inactive', tone: 'danger', rank: 1 },
  ACTIVE: { label: 'Active', tone: 'success', rank: 2 },
}
// The same three values wherever a user's status is read
export const userStatus = (u: any): string => String(u.user_status || (u.is_active !== 0 ? 'ACTIVE' : 'INACTIVE')).toUpperCase()
export const USER_STATUS = STATUS

export const columns = (users: User[]): ColumnDef<User>[] => [
  {
    id: "employee_id",
    accessorFn: (row) => `NT${10000 + row.id}`,
    header: "Code",
    cell: ({ row }) => <IdCell value={`NT${10000 + row.original.id}`} />,
    size: 110,
  },
  {
    accessorKey: "username",
    header: "Name",
    cell: ({ row }) => <TextCell value={row.original.username} strong />,
  },
  {
    id: "status",
    accessorFn: (row) => (STATUS[userStatus(row)] ?? { rank: 9 }).rank,
    header: "Status",
    size: 110,
    cell: ({ row }) => {
      const cfg = STATUS[userStatus(row.original)] || { label: userStatus(row.original), tone: 'muted' as const }
      return <ToneText label={cfg.label} tone={cfg.tone} />
    },
  },
  {
    accessorKey: "department",
    header: "Department",
    cell: ({ row }) => <TextCell value={row.getValue("department") as string} muted />,
  },
  {
    accessorKey: "role_name",
    header: "Role",
    // The active role, with how many others the person holds under it
    cell: ({ row }) => {
      const extra = Math.max(0, ((row.original as any).roles?.length ?? 1) - 1)
      return (
        <div>
          <TextCell value={ROLE_LABEL(row.getValue("role_name") as string)} className="block" />
          {extra > 0 && <TextCell value={`+${extra} more`} muted className="block text-[12px]" />}
        </div>
      )
    },
  },
  {
    accessorKey: "manager_id",
    header: "Manager",
    cell: ({ row }) => {
      const managerId = row.getValue("manager_id") as number
      const managerName = row.original.manager_name || users.find(u => u.id === managerId)?.username
      return <TextCell value={managerName} muted />
    },
  },
]
