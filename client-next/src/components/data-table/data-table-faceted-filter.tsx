"use client"

import * as React from "react"
import { Column } from "@tanstack/react-table"
import { Check, PlusCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title?: string
  options: {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
  }[]
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const selectedValues = new Set(column?.getFilterValue() as string[])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 border-casper border-dashed bg-white hover:bg-mystic/30">
          <PlusCircle className="mr-2 h-4 w-4 text-juniper" />
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4 bg-casper/30" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValues.size}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal bg-juniper/10 text-juniper text-[10px]"
                  >
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedValues.has(option.value))
                    .map((option) => (
                      <Badge
                        variant="secondary"
                        key={option.value}
                        className="rounded-sm px-1 font-normal bg-juniper/10 text-juniper text-[10px]"
                      >
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px] bg-white border-casper shadow-xl">
        <DropdownMenuLabel className="text-[10px] uppercase font-bold text-casper">{title}</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-casper/20" />
        {options.map((option) => {
          const isSelected = selectedValues.has(option.value)
          return (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={isSelected}
              onCheckedChange={(checked) => {
                if (checked) {
                  selectedValues.add(option.value)
                } else {
                  selectedValues.delete(option.value)
                }
                const filterValues = Array.from(selectedValues)
                column?.setFilterValue(
                  filterValues.length ? filterValues : undefined
                )
              }}
              className="text-[12px] font-medium text-charcoal focus:bg-mystic/50"
            >
              <div className="flex items-center">
                {option.icon && (
                  <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                )}
                <span>{option.label}</span>
              </div>
            </DropdownMenuCheckboxItem>
          )
        })}
        {selectedValues.size > 0 && (
          <>
            <DropdownMenuSeparator className="bg-casper/20" />
            <Button
              variant="ghost"
              className="w-full justify-center text-[11px] font-bold text-juniper hover:bg-mystic/50 h-8"
              onClick={() => column?.setFilterValue(undefined)}
            >
              Clear filters
            </Button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
