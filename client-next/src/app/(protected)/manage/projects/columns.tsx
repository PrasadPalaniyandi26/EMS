"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Project } from "@/lib/types"
import { formatCurrency } from "@/lib/currency"

export const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "code",
    header: "Project ID",
    cell: ({ row }) => (
      <span className="font-mono text-[12px] text-[var(--info)] font-bold">
        {row.getValue("code") || `PRJ-${String(row.original.id).padStart(3, '0')}`}
      </span>
    ),
  },
  {
    accessorKey: "name",
    header: "Project Name",
    cell: ({ row }) => (
      <span className="font-bold text-[13px] text-black dark:text-white leading-tight">
        {row.getValue("name")}
      </span>
    ),
  },
  {
    accessorKey: "type_name",
    header: "Type",
    cell: ({ row }) => (
      <span className="text-[12px] text-[var(--info)] font-medium">
        {row.getValue("type_name") || <span className="text-black/30 dark:text-white/35">—</span>}
      </span>
    ),
  },
  {
    accessorKey: "lead",
    header: "Lead",
    cell: ({ row }) => {
      const lead = (row.original as any).lead;
      if (!lead) return <span className="text-black/30 dark:text-white/35">—</span>;
      const leadParts = lead.trim().split(/\s+/);
      const leadInitials = leadParts.length >= 2 ? (leadParts[0][0] + leadParts[leadParts.length - 1][0]).toUpperCase() : leadParts[0].slice(0, 2).toUpperCase();
      return (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[var(--shell-hover)] flex items-center justify-center text-[11px] font-black text-[var(--shell-text)] uppercase border border-[var(--shell-border)] shrink-0">
            {leadInitials}
          </div>
          <span className="text-[12px] font-semibold text-black/70 dark:text-white/80">{lead}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = (row.original as any).status || "Active";
      const statusColor: Record<string, string> = {
        'Active':    'text-[var(--success)]',
        'Proposed':  'text-black/40 dark:text-white/50',
        'On-Hold':   'text-[var(--warning)]',
        'Completed': 'text-[var(--info)]',
        'Canceled':  'text-[var(--danger)]',
      };
      return (
        <span className={`text-[12px] font-semibold ${statusColor[status] || 'text-black/40 dark:text-white/50'}`}>
          {status}
        </span>
      );
    },
  },
  {
    accessorKey: "budget",
    header: () => <div className="text-right">Est. Budget</div>,
    cell: ({ row }) => (
      <div className="text-[12px] font-bold text-right text-[var(--shell-accent)]">
        {formatCurrency(Number((row.original as any).budget || 0), 'INR')}
      </div>
    ),
  },
]
