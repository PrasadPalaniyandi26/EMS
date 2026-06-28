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
      <span className="font-mono text-[11px] text-blue-400 font-black">
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
        <p className="font-bold text-[12px] text-black dark:text-white leading-tight truncate max-w-[200px]">
          {row.getValue("name") || '—'}
        </p>
        {(row.original as any).details && (
          <p className="text-[10px] text-black/40 dark:text-white/45 font-medium truncate max-w-[200px]">{(row.original as any).details}</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "department",
    header: "Department",
    cell: ({ row }) => (
      <span className="text-[12px] text-black/60 dark:text-white/70 font-medium">
        {row.getValue("department") || "—"}
      </span>
    ),
  },
  {
    accessorKey: "category_name",
    header: "Category",
    cell: ({ row }) => (
      <span className="text-[12px] text-indigo-600 dark:text-indigo-300 font-medium">
        {row.getValue("category_name") || "General"}
      </span>
    ),
  },
  {
    accessorKey: "financial_year",
    header: () => <div className="text-center">FY</div>,
    cell: ({ row }) => (
      <div className="text-center text-[11px] font-bold text-black dark:text-white">
        {row.getValue("financial_year") || "—"}
      </div>
    ),
    size: 70,
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right">Allocated</div>,
    cell: ({ row }) => (
      <div className="text-[12px] font-bold text-right text-[var(--shell-accent)]">
        {formatCurrency(Number(row.getValue("amount")), currency, false)}
      </div>
    ),
    size: 130,
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const active = (row.original as any).is_active;
      return (
        <span className={`text-[12px] font-semibold ${active ? 'text-emerald-500' : 'text-black/30 dark:text-white/40'}`}>
          {active ? 'Active' : 'Inactive'}
        </span>
      );
    },
    size: 90,
  },
];
