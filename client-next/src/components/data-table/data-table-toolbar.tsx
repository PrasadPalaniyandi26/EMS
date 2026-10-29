"use client"

import { Table } from "@tanstack/react-table"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  actions?: React.ReactNode
  extra?: React.ReactNode
}

export function DataTableToolbar<TData>({
  table,
  actions,
  extra,
}: DataTableToolbarProps<TData>) {
  if (!table) return null;
  const isFiltered = table.getState().columnFilters.length > 0 || !!table.getState().globalFilter

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 w-full">
      {/* Left: action buttons */}
      {actions && (
        <div className="toolbar-actions flex items-center gap-2 shrink-0 self-center flex-wrap">
          {actions}
        </div>
      )}

      {/* Right: search + reset */}
      <div className="flex items-center gap-2 ml-auto self-center">
        <div className="relative w-full sm:w-[220px] min-w-[140px]">
          <Input
            placeholder="Search..."
            value={(table.getState().globalFilter as string) ?? ""}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            className="h-8 w-full rounded-md pl-3 pr-7 text-[13px] focus-visible:ring-1"
            style={{ background: 'transparent', border: '1px solid var(--input)', color: 'var(--shell-text)' }}
          />
          {((table.getState().globalFilter as string) ?? "") && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => table.setGlobalFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 transition-colors"
              style={{ color: 'var(--shell-text-muted)' }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => {
              table.resetColumnFilters();
              table.setGlobalFilter("");
            }}
            className="h-8 px-3 text-[13px] font-medium rounded-md"
            style={{ color: 'var(--shell-text-muted)' }}
          >
            Reset
            <X className="ml-1.5 h-3 w-3" />
          </Button>
        )}

        {extra}
      </div>
    </div>
  )
}
