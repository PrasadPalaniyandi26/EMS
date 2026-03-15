"use client";

import { ColumnDef } from "@tanstack/react-table";
import { formatCurrency } from "@/lib/currency";

export type OrgBudget = {
  id: number;
  code: string;
  name: string;
  department: string;
  category_name?: string;
  financial_year?: number;
  owner_name?: string;
  amount: number;
  is_active: number;
};

export const columns = (currency: string): ColumnDef<OrgBudget, any>[] => [
  {
    accessorKey: "code",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-juniper font-black">
        {row.getValue("code") || `BUD-${String(row.original.id).padStart(3, '0')}`}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: "name",
    header: "Budget Name",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="font-bold text-[12px] text-charcoal leading-tight truncate max-w-[200px]">
          {row.getValue("name") || '—'}
        </p>
        {(row.original as any).details && (
          <p className="text-[10px] text-casper font-medium truncate max-w-[200px]">{(row.original as any).details}</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "department",
    header: "Department",
    cell: ({ row }) => (
      <span className="px-2 py-0.5 bg-[#F0F4F5] text-[9px] font-bold text-juniper rounded-md uppercase border border-casper/30 tracking-tight">
        {row.getValue("department") || "—"}
      </span>
    ),
  },
  {
    accessorKey: "category_name",
    header: () => <div className="text-center">Category</div>,
    cell: ({ row }) => (
      <div className="flex justify-center">
        <span className="px-2 py-0.5 bg-mystic/50 text-[9px] font-bold text-juniper rounded-md uppercase border border-casper/30 tracking-tight">
          {row.getValue("category_name") || "General"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "financial_year",
    header: () => <div className="text-center">FY</div>,
    cell: ({ row }) => (
      <div className="text-center text-[11px] font-bold text-charcoal">
        {row.getValue("financial_year") || "—"}
      </div>
    ),
    size: 70,
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right">Allocated</div>,
    cell: ({ row }) => (
      <div className="text-[12px] font-bold text-right text-juniper">
        {formatCurrency(Number(row.getValue("amount")), currency, false)}
      </div>
    ),
    size: 130,
  },
  {
    id: "status",
    header: () => <div className="text-center">Status</div>,
    cell: ({ row }) => {
      const active = (row.original as any).is_active;
      return (
        <div className="flex justify-center">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight border ${active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            {active ? 'Active' : 'Inactive'}
          </span>
        </div>
      );
    },
    size: 90,
  },
];
