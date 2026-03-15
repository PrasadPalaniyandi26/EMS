"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Project } from "@/lib/types"

export const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "code",
    header: "Project ID",
    cell: ({ row }) => (
      <span className="font-mono text-[12px] text-juniper font-bold">
        {row.getValue("code") || `PRJ-${String(row.original.id).padStart(3, '0')}`}
      </span>
    ),
  },
  {
    accessorKey: "name",
    header: "Project Name",
    cell: ({ row }) => (
      <div className="max-w-[240px]">
        <p className="font-bold text-[13px] text-charcoal leading-tight">{row.getValue("name")}</p>
        <p className="text-[10px] text-casper font-medium truncate">
          {(row.original as any).description || "No scope defined"}
        </p>
      </div>
    ),
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
  },
  {
    accessorKey: "lead",
    header: "Lead",
    cell: ({ row }) => {
      const lead = (row.original as any).lead || "Sarah Jenkins";
      return (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#F0F4F5] flex items-center justify-center text-[10px] font-black text-juniper uppercase border border-casper/30">
            {lead[0]}
          </div>
          <span className="text-[12px] font-semibold text-charcoal">{lead}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = (row.original as any).status || "Active";
      const statusCls: Record<string, string> = {
        'Active':    'bg-emerald-100 text-emerald-700 border-emerald-200',
        'Proposed':  'bg-slate-100 text-slate-600 border-slate-200',
        'On-Hold':   'bg-amber-100 text-amber-700 border-amber-200',
        'Completed': 'bg-blue-100 text-blue-700 border-blue-200',
        'Canceled':  'bg-rose-100 text-rose-700 border-rose-200',
      };
      return (
        <div className="flex justify-center">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight border ${statusCls[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            {status}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "budget",
    header: () => <div className="text-right">Est. Budget</div>,
    cell: ({ row }) => (
      <div className="text-[12px] font-bold text-right text-juniper">
        ${(row.original as any).budget || "0.00"}
      </div>
    ),
  },
]
