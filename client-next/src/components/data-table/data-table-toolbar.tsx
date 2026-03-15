"use client"

import { Table } from "@tanstack/react-table"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { DataTableFacetedFilter } from "./data-table-faceted-filter"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  facetedFilters?: {
    columnId: string
    title: string
    options: {
      label: string
      value: string
      icon?: React.ComponentType<{ className?: string }>
    }[]
  }[]
}

export function DataTableToolbar<TData>({
  table,
  facetedFilters = [],
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0 || !!table.getState().globalFilter

  return (
    <div className="flex items-center justify-end pb-2">
      <div className="flex items-center space-x-2 ml-auto">
        <div className="relative w-[280px]">
          <Input
            placeholder="Intelligent search..."
            value={(table.getState().globalFilter as string) ?? ""}
            onChange={(event) =>
              table.setGlobalFilter(event.target.value)
            }
            className="h-9 w-full bg-white border-casper rounded-lg pl-3 pr-8 text-[12px] placeholder-casper focus-visible:ring-1 focus-visible:ring-juniper focus-visible:border-juniper"
          />
          {((table.getState().globalFilter as string) ?? "") && (
            <button
              onClick={() => table.setGlobalFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-casper hover:text-charcoal rounded-md transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {facetedFilters.map(
            (filter) =>
              table.getColumn(filter.columnId) && (
                <DataTableFacetedFilter
                  key={filter.columnId}
                  column={table.getColumn(filter.columnId)}
                  title={filter.title}
                  options={filter.options}
                />
              )
          )}
        </div>

        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => {
              table.resetColumnFilters()
              table.setGlobalFilter("")
            }}
            className="h-9 px-3 text-[11px] font-bold text-juniper hover:bg-mystic/50"
          >
            Reset
            <X className="ml-2 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
