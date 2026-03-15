"use client"

import { ColumnDef } from "@tanstack/react-table"
import { formatCurrency, formatDate } from "@/lib/currency"

export const columns = (currency: string): ColumnDef<any>[] => [
  {
    accessorKey: "reference_id",
    header: "ID",
    cell: ({ row }) => (
      <span className="text-[12px] font-bold font-mono text-juniper">
        {row.getValue("reference_id") || `#${row.original.id}`}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: "receipt_number",
    header: "Invoice",
    cell: ({ row }) => (
      <span className="text-[12px] font-medium text-charcoal/70">
        {row.getValue("receipt_number") || "—"}
      </span>
    ),
  },
  {
    id: "code",
    header: "Code",
    cell: ({ row }) => (
      <span className="text-[12px] font-bold text-charcoal/70 font-mono">
        {row.original.project_name
          ? (row.original.context_code || row.original.project_name)
          : row.original.product_name
          ? (row.original.context_code || row.original.product_name)
          : "—"}
      </span>
    ),
  },
  {
    accessorKey: "category_name",
    header: () => <div className="text-center">Category</div>,
    cell: ({ row }) => (
      <div className="flex justify-center">
        <span className="px-2 py-0.5 bg-[#F0F4F5] text-[9px] font-bold text-juniper rounded-md uppercase border border-casper/30">
          {row.getValue("category_name") || "—"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "date_recorded",
    header: () => <div className="text-center">Date</div>,
    cell: ({ row }) => (
      <div className="text-[12px] text-charcoal/60 text-center">
        {formatDate(row.getValue("date_recorded"))}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: () => <div className="text-center">Status</div>,
    cell: ({ row }) => {
      const raw = (row.getValue("status") as string) || '';
      const status = raw.toUpperCase();
      const cfg: Record<string, { cls: string; label: string }> = {
        DRAFT:           { cls: 'text-slate-600 bg-slate-100 border-slate-200', label: 'Draft' },
        PENDING_MANAGER: { cls: 'text-amber-700 bg-amber-100 border-amber-200', label: 'Pending Manager' },
        PENDING_FINANCE: { cls: 'text-orange-700 bg-orange-100 border-orange-200', label: 'Pending Finance' },
        APPROVED:        { cls: 'text-emerald-700 bg-emerald-100 border-emerald-200', label: 'Approved' },
        REJECTED:        { cls: 'text-red-700 bg-red-100 border-red-200', label: 'Rejected' },
        SENT_BACK:       { cls: 'text-blue-700 bg-blue-100 border-blue-200', label: 'Sent Back' },
      };
      const c = cfg[status] || { cls: 'text-slate-600 bg-slate-100 border-slate-200', label: status || '—' };
      return (
        <div className="flex items-center justify-center">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${c.cls}`}>{c.label}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => (
      <div className="text-[12px] font-bold text-right text-charcoal">
        {formatCurrency(row.getValue("amount"), currency)}
      </div>
    ),
  },
]
