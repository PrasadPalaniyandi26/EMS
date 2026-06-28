"use client"

import { ColumnDef } from "@tanstack/react-table"
import { User } from "@/lib/types"
import { cn } from "@/lib/utils"

const getRoleTextColor = (roleName?: string) => {
  switch (roleName?.toLowerCase()) {
    case 'admin': return 'text-red-500';
    case 'finance': return 'text-[var(--shell-accent)]';
    case 'manager': return 'text-orange-500';
    case 'employee': return 'text-blue-500';
    default: return '';
  }
};

export const columns = (users: User[]): ColumnDef<User>[] => [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-[11px] font-bold text-blue-500">
        NT{10000 + row.original.id}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: "username",
    header: "Name / Identity",
    cell: ({ row }) => {
      const u = row.original;
      return (
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase shrink-0"
            style={{ background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' }}>
            {(() => { const p = u.username.trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0].slice(0, 2).toUpperCase(); })()}
          </div>
          <span className="font-semibold text-[12px]" style={{ color: 'var(--shell-text)' }}>{u.username}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "department",
    header: "Department",
    cell: ({ row }) => (
      <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--shell-text)' }}>
        {row.getValue("department") || "—"}
      </span>
    ),
  },
  {
    accessorKey: "role_name",
    header: "Role",
    cell: ({ row }) => {
      const roleName = row.getValue("role_name") as string;
      return (
        <span className={cn("text-[11px] font-bold uppercase tracking-wider", getRoleTextColor(roleName))}>
          {roleName || 'Staff'}
        </span>
      );
    },
  },
  {
    accessorKey: "manager_id",
    header: "Manager",
    cell: ({ row }) => {
      const managerId = row.getValue("manager_id") as number;
      const managerName = row.original.manager_name || users.find(u => u.id === managerId)?.username || '—';
      return (
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
            style={{ background: 'var(--shell-bg)', border: '1px solid var(--shell-border)', color: 'var(--shell-text-muted)' }}>
            {(() => { const p = managerName.trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0].slice(0, 2).toUpperCase(); })()}
          </div>
          <span className="text-[12px] font-medium" style={{ color: 'var(--shell-text)' }}>{managerName}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.user_status || (row.getValue("is_active") !== 0 ? 'ACTIVE' : 'INACTIVE');
      const cfg = {
        'ACTIVE':   { dot: 'bg-emerald-400 ring-emerald-400/20', text: 'text-[var(--shell-accent)]', label: 'Active' },
        'ON_HOLD':  { dot: 'bg-amber-400 ring-amber-400/20',   text: 'text-amber-500',  label: 'On Hold' },
        'INACTIVE': { dot: 'bg-rose-400 ring-rose-400/20',     text: 'text-rose-500',   label: 'Inactive' },
      }[status.toUpperCase()] || { dot: 'bg-gray-300 ring-gray-200', text: '', label: status };
      return (
        <div className="flex items-center justify-center gap-2">
          <div className={cn("h-1.5 w-1.5 rounded-full ring-4", cfg.dot)} />
          <span className={cn("text-[10px] font-bold uppercase tracking-widest", cfg.text)}>{cfg.label}</span>
        </div>
      );
    },
  },
]
