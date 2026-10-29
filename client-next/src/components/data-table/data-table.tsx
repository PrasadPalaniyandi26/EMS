"use client";

import * as React from "react";
import { SearchX } from "lucide-react";
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
} from "@tanstack/react-table";
import { useDataTable } from '@/hooks/use-data-table';

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
  mobileHiddenColumns?: string[]; // Column IDs to hide below the sm breakpoint (640px)
  emptyMessage?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  selectedRowId,
  tableInstance,
  fullHeight = false,
  mobileHiddenColumns,
  emptyMessage = "No results found.",
}: DataTableProps<TData, TValue>) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [localSelectedId, setLocalSelectedId] = React.useState<string | number | undefined>(undefined);

  const internalTable = useDataTable({
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

  // Responsive column visibility: hide mobileHiddenColumns below the sm breakpoint (640px)
  // Only apply when using the internal table — external tableInstance manages its own visibility
  React.useEffect(() => {
    if (!mobileHiddenColumns?.length || tableInstance) return;
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = (isMobile: boolean) => {
      const vis: VisibilityState = {};
      mobileHiddenColumns.forEach((col) => { vis[col] = !isMobile; });
      internalTable.setColumnVisibility((prev: VisibilityState) => ({ ...prev, ...vis }));
    };
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mobileHiddenColumns, tableInstance]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRowClick = (rowData: TData, rowObj: any) => {
    if (tableInstance) {
      // External table: toggle this row's selection (preserves multi-select)
      rowObj.toggleSelected(!rowObj.getIsSelected());
    } else {
      const id = (rowData as any).id;
      setLocalSelectedId(effectiveSelectedId === id ? undefined : id);
    }
    onRowClick?.(rowData);
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 w-full ${fullHeight ? 'h-full' : ''}`}>
      <div className="flex-1 overflow-hidden relative flex flex-col" style={{ background: 'var(--shell-surface)' }}>
        {/* Phones: one card per row (label above value) so nothing scrolls sideways */}
        <div className="md:hidden flex-1 overflow-y-auto">
          {table.getRowModel().rows?.length ? table.getRowModel().rows.map((row: any) => {
            const isSelected = tableInstance
              ? row.getIsSelected()
              : effectiveSelectedId !== undefined && (row.original as any).id === effectiveSelectedId;
            const headers = table.getHeaderGroups()[0]?.headers ?? [];
            return (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => handleRowClick(row.original, row)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowClick(row.original, row); } }}
                className={`grid grid-cols-2 gap-x-4 gap-y-2.5 border-b border-[var(--shell-border)] px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-accent)] ${isSelected ? 'bg-[var(--shell-accent)]/8 shadow-[inset_2px_0_0_var(--shell-accent)]' : 'active:bg-[var(--shell-hover)]'}`}
              >
                {row.getVisibleCells().map((cell: any) => {
                  const header = headers.find((h: any) => h.column.id === cell.column.id);
                  const label = header && !header.isPlaceholder && cell.column.columnDef.header
                    ? flexRender(cell.column.columnDef.header, header.getContext())
                    : null;
                  if (!label) return null;
                  return (
                    <div key={cell.id} className="min-w-0">
                      <div className="mb-0.5 text-[12px] text-[var(--shell-text-muted)] [&_*]:!text-left">{label}</div>
                      <div className="truncate [&_.text-right]:!text-left">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
                    </div>
                  );
                })}
              </div>
            );
          }) : (
            <div className="flex flex-col items-center justify-center gap-2 py-12" style={{ color: 'var(--shell-text-muted)' }}>
              <SearchX className="w-6 h-6 opacity-40" />
              <span className="text-[13px]">{emptyMessage}</span>
            </div>
          )}
        </div>
        <div className="hidden md:block overflow-y-auto overflow-x-auto hide-scrollbar flex-1 relative">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup: any) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header: any) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row: any) => {
                  const isSelected = tableInstance
                    ? row.getIsSelected()
                    : effectiveSelectedId !== undefined && (row.original as any).id === effectiveSelectedId;
                  return (
                    <TableRow
                      key={row.id}
                      onClick={() => handleRowClick(row.original, row)}
                      data-selected={isSelected ? 'true' : undefined}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? ''
                          : 'hover:bg-[var(--shell-hover)]'
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
                  <TableCell colSpan={columns.length} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 py-4" style={{ color: 'var(--shell-text-muted)' }}>
                      <SearchX className="w-6 h-6 opacity-40" />
                      <span className="text-[12px] font-medium opacity-60">{emptyMessage}</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="px-4 py-2 flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--shell-border)', background: 'var(--shell-surface)' }}>
          <div className="flex-1 text-[11.5px]" style={{ color: 'var(--shell-text-muted)' }}>
            {table.getFilteredRowModel().rows.length} results
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="px-3 py-1 text-[12px] font-medium rounded-lg transition-colors disabled:opacity-30"
              style={{ background: 'var(--shell-bg)', border: '1px solid var(--shell-border)', color: 'var(--shell-text)' }}
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </button>
            <button
              className="px-3 py-1 text-[12px] font-medium rounded-lg transition-colors disabled:opacity-30"
              style={{ background: 'var(--shell-bg)', border: '1px solid var(--shell-border)', color: 'var(--shell-text)' }}
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
