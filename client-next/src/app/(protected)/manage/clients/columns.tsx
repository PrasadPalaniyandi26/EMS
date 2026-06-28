"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Client } from "@/lib/types"

export const columns: ColumnDef<Client>[] = [
  {
    accessorKey: "code",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-[12px] text-blue-400 font-bold">
        {(row.original as any).code || `CL-XX-${1000 + row.original.id}`}
      </span>
    ),
    size: 140,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const name = row.getValue("name") as string;
      return (
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-[var(--shell-hover)] rounded flex items-center justify-center font-bold text-[9px] text-[var(--shell-text)] border border-[var(--shell-border)] shrink-0">
            {name.substring(0, 2).toUpperCase()}
          </div>
          <span className="font-bold text-[12px] text-black dark:text-white">{name}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "business_type",
    header: "Industry",
    cell: ({ row }) => (
      <span className="text-[12px] text-[var(--shell-text)]">
        {row.getValue("business_type") || "—"}
      </span>
    ),
  },
  {
    accessorKey: "contact_name",
    header: "Contact",
    cell: ({ row }) => (
      <span className="text-[12px] text-[var(--shell-text)]">
        {row.getValue("contact_name") || "—"}
      </span>
    ),
  },
  {
    id: "country",
    header: "Country",
    cell: ({ row }) => (
      <span className="text-[12px] text-[var(--shell-text)]">
        {(row.original as any).country || "—"}
      </span>
    ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const isActive = row.getValue("is_active") === 1;
      return (
        <span className={`text-[12px] font-semibold ${isActive ? 'text-emerald-500' : 'text-[var(--shell-text-muted)]'}`}>
          {isActive ? 'Active' : 'Inactive'}
        </span>
      );
    },
  },
]
