"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { Product } from "@/lib/types"

const statusColors: Record<string, string> = {
  'R&D':          'bg-slate-100 text-slate-600 border-slate-200',
  'Prototype':    'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Assembly':     'bg-amber-100 text-amber-700 border-amber-200',
  'Quality':      'bg-blue-100 text-blue-700 border-blue-200',
  'Market Ready': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Active':       'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Inactive':     'bg-slate-100 text-slate-600 border-slate-200',
}

export const columns: ColumnDef<Product>[] = [
  {
    accessorKey: "code",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-juniper font-black">
        {row.getValue("code") || `PRD-${String(row.original.id).padStart(3, '0')}`}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-juniper/20 rounded flex items-center justify-center font-bold text-[9px] text-juniper border border-juniper/20 shrink-0">
          {(row.getValue("name") as string).substring(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-[12px] text-charcoal leading-tight truncate">{row.getValue("name")}</p>
          {(row.original as any).model && (
            <p className="text-[10px] text-casper font-medium">{(row.original as any).model}</p>
          )}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "client_name",
    header: "Client",
    cell: ({ row }) => (
      <span className="text-[12px] text-charcoal">
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
            <div className="w-5 h-5 rounded-full bg-juniper/10 flex items-center justify-center text-[9px] font-bold text-juniper border border-juniper/20 shrink-0">
              {lead[0]?.toUpperCase()}
            </div>
          )}
          <span className="text-[12px] text-charcoal">{lead}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "type_name",
    header: "Type",
    cell: ({ row }) => (
      <div className="flex justify-center">
        {row.getValue("type_name") ? (
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-bold border border-blue-100 uppercase tracking-tighter">
            {row.getValue("type_name")}
          </span>
        ) : (
          <span className="text-casper">—</span>
        )}
      </div>
    ),
    size: 120,
  },
  {
    id: "category",
    accessorFn: (row) => (row as any).category,
    header: "Category",
    cell: ({ row }) => (
      <span className="text-[12px] text-charcoal">
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
        <div className="flex justify-center">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight border ${statusColors[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            {status}
          </span>
        </div>
      );
    },
    size: 110,
  },
]
