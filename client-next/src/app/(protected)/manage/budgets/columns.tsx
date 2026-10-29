"use client";

import { ColumnDef } from "@tanstack/react-table";
import { IdCell, TextCell, MoneyCell, ToneText, headerRight } from "@/components/data-table/cells";

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
    cell: ({ row }) => <IdCell value={row.getValue("code") || `BUD-${String(row.original.id).padStart(3, '0')}`} />,
    size: 110,
  },
  {
    accessorKey: "name",
    header: "Budget name",
    cell: ({ row }) => <TextCell value={row.getValue("name")} strong className="block max-w-[240px] truncate" />,
  },
  {
    accessorKey: "department",
    header: "Department",
    cell: ({ row }) => <TextCell value={row.getValue("department")} />,
  },
  {
    accessorKey: "category_name",
    header: "Category",
    cell: ({ row }) => <TextCell value={row.getValue("category_name") || "General"} />,
  },
  {
    accessorKey: "financial_year",
    header: "FY",
    cell: ({ row }) => <TextCell value={row.getValue("financial_year")} />,
    size: 70,
  },
  {
    accessorKey: "amount",
    header: headerRight("Allocated"),
    cell: ({ row }) => <MoneyCell value={row.getValue("amount")} currency={currency} symbol={false} />,
    size: 130,
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const active = (row.original as any).is_active;
      return <ToneText label={active ? "Active" : "Inactive"} tone={active ? "success" : "muted"} />;
    },
    size: 90,
  },
];
