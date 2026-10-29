"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { Product } from "@/lib/types"

const statusColor: Record<string, string> = {
  'R&D':          'text-black/40 dark:text-white/50',
  'Prototype':    'text-[var(--warning)]',
  'Assembly':     'text-[var(--warning)]',
  'Quality':      'text-[var(--info)]',
  'Market Ready': 'text-[var(--shell-accent)]',
  'Active':       'text-[var(--success)]',
  'Inactive':     'text-[var(--shell-text-muted)]',
}

export const columns: ColumnDef<Product>[] = [
  {
    accessorKey: "code",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-[var(--info)] font-black">
        {row.getValue("code") || `PRD-${String(row.original.id).padStart(3, '0')}`}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-bold text-[12px] text-black dark:text-white leading-tight truncate">
        {row.getValue("name")}
      </span>
    ),
  },
  {
    accessorKey: "client_name",
    header: "Client",
    cell: ({ row }) => (
      <span className="text-[12px] text-[var(--shell-text)]">
        {row.getValue("client_name") || "—"}
      </span>
    ),
  },
  {
    id: "lead_manager",
    header: "Lead / Manager",
    cell: ({ row }) => {
      const lead = (row.original as any).lead || "—";
      return (
        <div className="flex items-center gap-2">
          {lead !== "—" && (
            <div className="w-5 h-5 rounded-full bg-[var(--shell-hover)] flex items-center justify-center text-[11px] font-bold text-[var(--shell-accent)] border border-[var(--shell-border)] shrink-0">
              {lead[0]?.toUpperCase()}
            </div>
          )}
          <span className="text-[12px] text-black/70 dark:text-white/80">{lead}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "type_name",
    header: "Type",
    cell: ({ row }) => (
      <span className="text-[12px] text-[var(--info)] font-medium">
        {row.getValue("type_name") || <span className="text-black/30 dark:text-white/35">—</span>}
      </span>
    ),
    size: 120,
  },
  {
    id: "category",
    accessorFn: (row) => (row as any).category,
    header: "Category",
    cell: ({ row }) => (
      <span className="text-[12px] text-[var(--shell-text)]">
        {row.getValue("category") || "—"}
      </span>
    ),
  },
  {
    id: "status",
    accessorFn: (row) => (row as any).status || (row.is_active ? "Active" : "Inactive"),
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <span className={`text-[12px] font-semibold ${statusColor[status] || 'text-black/40 dark:text-white/50'}`}>
          {status}
        </span>
      );
    },
    size: 110,
  },
]
