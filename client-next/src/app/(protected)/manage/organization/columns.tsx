"use client"

import { ColumnDef } from "@tanstack/react-table"
import { User } from "@/lib/types"
import { cn } from "@/lib/utils"

const getRoleBadge = (roleName?: string) => {
  switch (roleName?.toLowerCase()) {
    case 'admin': return 'bg-red-100 text-red-700 border-red-200';
    case 'finance': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'manager': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'employee': return 'bg-blue-100 text-blue-600 border-blue-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

export const columns = (users: User[]): ColumnDef<User>[] => [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-juniper font-bold">
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
          <div className="h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-black uppercase bg-[#F0F4F5] text-juniper border border-casper/30 shrink-0">
            {u.username.substring(0, 2)}
          </div>
          <span className="font-bold text-[12px] text-charcoal leading-none">{u.username}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "department",
    header: "Department",
    cell: ({ row }) => (
      <span className="text-[12px] font-bold text-charcoal uppercase tracking-wide">
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
        <div className="flex justify-center">
          <span className={cn(
            "px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border",
            getRoleBadge(roleName)
          )}>
            {roleName || 'Staff'}
          </span>
        </div>
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
          <div className="h-5 w-5 rounded-full bg-[#F0F4F5] border border-casper/30 flex items-center justify-center text-[8px] text-casper font-bold shrink-0">
            {managerName[0]?.toUpperCase()}
          </div>
          <span className="text-[12px] text-charcoal font-bold">{managerName}</span>
        </div>
      );
    },
  },
  {
    id: "lastLogin",
    header: "Last Session",
    cell: () => (
      <span className="text-[12px] text-charcoal/40 italic">Today, 09:42 AM</span>
    ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.user_status || (row.getValue("is_active") !== 0 ? 'ACTIVE' : 'INACTIVE');
      const cfg = {
        'ACTIVE':   { dot: 'bg-emerald-500 ring-emerald-500/10', text: 'text-emerald-600', label: 'Active' },
        'ON_HOLD':  { dot: 'bg-amber-400 ring-amber-400/10',    text: 'text-amber-600',   label: 'On Hold' },
        'INACTIVE': { dot: 'bg-rose-500 ring-rose-500/10',       text: 'text-rose-500',    label: 'Inactive' },
      }[status.toUpperCase()] || { dot: 'bg-slate-400 ring-slate-400/10', text: 'text-slate-500', label: status };
      return (
        <div className="flex items-center justify-center gap-2">
          <div className={cn("h-1.5 w-1.5 rounded-full ring-4", cfg.dot)} />
          <span className={cn("text-[10px] font-black uppercase tracking-widest", cfg.text)}>{cfg.label}</span>
        </div>
      );
    },
  },
]
