"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Client } from "@/lib/types"

export const columns: ColumnDef<Client>[] = [
  {
    accessorKey: "code",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-[12px] text-juniper font-bold">
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
          <div className="w-6 h-6 bg-juniper/20 rounded flex items-center justify-center font-bold text-[9px] text-juniper border border-juniper/20">
            {name.substring(0, 2).toUpperCase()}
          </div>
          <span className="font-bold text-[12px] text-charcoal">{name}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "business_type",
    header: "Industry",
    cell: ({ row }) => (
      <span className="text-[12px] text-charcoal">
        {row.getValue("business_type") || "—"}
      </span>
    ),
  },
  {
    accessorKey: "contact_name",
    header: "Contact",
    cell: ({ row }) => (
      <span className="text-[12px] text-charcoal">
        {row.getValue("contact_name") || "—"}
      </span>
    ),
  },
  {
    id: "country",
    header: "Country",
    cell: ({ row }) => (
      <span className="text-[12px] text-charcoal">
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
        <div className="flex justify-center">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      );
    },
  },
]
