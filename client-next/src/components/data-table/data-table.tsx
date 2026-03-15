"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  selectedRowId?: string | number;
  tableInstance?: any; // Allow passing an external table instance
  fullHeight?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  selectedRowId,
  tableInstance,
  fullHeight = false,
}: DataTableProps<TData, TValue>) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [localSelectedId, setLocalSelectedId] = React.useState<string | number | undefined>(undefined);

  const internalTable = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const table = tableInstance || internalTable;
  const effectiveSelectedId = selectedRowId !== undefined ? selectedRowId : localSelectedId;

  const handleRowClick = (rowData: TData, rowObj: any) => {
    if (tableInstance) {
      // External table: toggle single row selection
      const isAlreadySelected = rowObj.getIsSelected();
      tableInstance.toggleAllRowsSelected(false);
      if (!isAlreadySelected) rowObj.toggleSelected(true);
    } else {
      const id = (rowData as any).id;
      setLocalSelectedId(effectiveSelectedId === id ? undefined : id);
    }
    onRowClick?.(rowData);
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 w-full ${fullHeight ? 'h-full' : ''}`}>
      <div className="flex-1 rounded border border-casper overflow-hidden relative flex flex-col bg-white">
        <div className="overflow-y-auto hide-scrollbar flex-1 relative">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup: any) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent border-b-0">
                  {headerGroup.headers.map((header: any) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className="divide-y divide-casper/20">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row: any) => {
                  const isSelected = tableInstance
                    ? row.getIsSelected()
                    : effectiveSelectedId !== undefined && (row.original as any).id === effectiveSelectedId;
                  return (
                    <TableRow
                      key={row.id}
                      onClick={() => handleRowClick(row.original, row)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? "bg-slate-100 border-l-2 border-juniper" : "hover:bg-slate-50"
                      }`}
                    >
                      {row.getVisibleCells().map((cell: any) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-theme-sidebar/50">
                    No results found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="p-3 border-t border-casper/20 flex items-center justify-between bg-white shrink-0">
          <div className="flex-1 text-[11px] text-charcoal/50 font-bold">
            {table.getFilteredRowModel().rows.length} row(s)
          </div>
          <div className="flex items-center space-x-2">
            <button
              className="px-3 py-1 bg-white border border-casper rounded text-[11px] font-bold text-charcoal disabled:opacity-30"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </button>
            <button
              className="px-3 py-1 bg-white border border-casper rounded text-[11px] font-bold text-charcoal disabled:opacity-30"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
