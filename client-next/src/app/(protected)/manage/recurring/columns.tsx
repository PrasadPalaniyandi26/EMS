"use client";

import { ColumnDef } from "@tanstack/react-table";
import type { RecurringTransaction } from "@/lib/types";
import { IdCell, TextCell, DateCell, MoneyCell, StatusText, ToneText, headerRight } from "@/components/data-table/cells";

const FREQUENCY_LABEL = (f?: string) => (f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : '');

export const columns = (currency: string): ColumnDef<RecurringTransaction>[] => [
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => <IdCell value={row.getValue("code")} />,
    size: 100,
  },
  {
    accessorKey: "description",
    header: "Vendor",
    cell: ({ row }) => <TextCell value={row.getValue("description") || "Unknown"} strong className="block max-w-[240px] truncate" />,
    size: 200,
  },
  {
    accessorKey: "category_name",
    header: "Description",
    cell: ({ row }) => <TextCell value={row.getValue("category_name") || "Operating Expenses"} />,
  },
  {
    accessorKey: "frequency",
    header: "Frequency",
    cell: ({ row }) => <TextCell value={FREQUENCY_LABEL(row.getValue("frequency") as string)} />,
    size: 120,
  },
  {
    accessorKey: "next_run_date",
    header: "Next run",
    cell: ({ row }) => <DateCell value={row.getValue("next_run_date") as string} />,
    size: 130,
  },
  {
    accessorKey: "last_run_date",
    header: "Last run",
    cell: ({ row }) => <DateCell value={row.getValue("last_run_date") as string} />,
    size: 130,
  },
  {
    id: "status",
    accessorFn: (row) => (row as any).status ?? 'DRAFT',
    header: "Status",
    cell: ({ row }) => <StatusText status={row.getValue("status") as string} />,
    size: 130,
  },
  {
    id: "state",
    accessorFn: (row) => (row as any).status === 'APPROVED' ? (row.is_active ? 'Active' : 'Inactive') : null,
    header: "State",
    cell: ({ row }) => {
      const state = row.getValue("state") as string | null;
      return state ? <ToneText label={state} tone={state === 'Active' ? 'success' : 'warning'} /> : <TextCell value="" />;
    },
    size: 90,
  },
  {
    accessorKey: "total_amount",
    header: headerRight("Total amount"),
    cell: ({ row }) => {
      const val = row.getValue("total_amount");
      const amount = val != null ? parseFloat(String(val)) : parseFloat(String((row.original as any).amount ?? 0));
      return <MoneyCell value={amount} currency={currency || 'INR'} />;
    },
    size: 140,
  },
];
