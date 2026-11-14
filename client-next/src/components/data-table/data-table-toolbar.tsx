"use client"

import { Table } from "@tanstack/react-table"
import { Download, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Filters, type FilterDef } from "@/components/data-table/filters"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  actions?: React.ReactNode
  // Filters, shown on the right just before Search. Up to two sit in the row as dropdowns; more go into one "Filters…" dialog
  filterDefs?: FilterDef[]
  // Import and Export sit on the right with the filters and Search, in the order Import, Export, Filters, Search
  onImport?: () => void
  onExport?: () => void
  exporting?: boolean
  extra?: React.ReactNode
  // Search done by the server: the page owns the text, instead of the table filtering the rows it holds
  searchValue?: string
  onSearchChange?: (value: string) => void
}

export function DataTableToolbar<TData>({
  table,
  actions,
  filterDefs,
  onImport,
  onExport,
  exporting,
  extra,
  searchValue,
  onSearchChange,
}: DataTableToolbarProps<TData>) {
  if (!table) return null;
  const searchText = onSearchChange ? (searchValue ?? "") : ((table.getState().globalFilter as string) ?? "")
  const setSearchText = (v: string) => (onSearchChange ? onSearchChange(v) : table.setGlobalFilter(v))
  const isFiltered = table.getState().columnFilters.length > 0 || !!searchText

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
        {onImport && (
          <button type="button" className="btn-action" onClick={onImport}>
            <Upload aria-hidden className="h-4 w-4 text-[var(--warning)]" />
            Import
          </button>
        )}
        {onExport && (
          <button type="button" className="btn-action" onClick={onExport} disabled={exporting}>
            <Download aria-hidden className="h-4 w-4 text-[var(--shell-text-muted)]" />
            {exporting ? "Exporting…" : "Export"}
          </button>
        )}
        {filterDefs && <Filters defs={filterDefs} />}
        <div className="relative w-full sm:w-[220px] min-w-[140px]">
          <Input
            aria-label="Search"
            placeholder="Search..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="h-8 w-full rounded-md pl-3 pr-7 text-[13px] focus-visible:ring-1"
            style={{ background: 'transparent', border: '1px solid var(--input)', color: 'var(--shell-text)' }}
          />
          {searchText && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchText("")}
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
              setSearchText("");
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
