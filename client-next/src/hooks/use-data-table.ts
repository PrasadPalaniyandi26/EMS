'use client';

import { useEffect, useRef } from 'react';
import { useReactTable, type RowData, type TableOptions } from '@tanstack/react-table';

// Drop-in replacement for useReactTable used by every list page.
//
// TanStack's built-in "reset to the first page when data changes" fires a state update during the
// table's first render, which React reports as "Can't perform a React state update on a component that
// hasn't mounted yet" (the dev-only red "1 Issue" badge) and which also reset the page on every
// background refetch. This turns it off and resets the page only when the user changes sorting, filters
// or search, and clamps it if the page no longer exists (e.g. after deleting the last row on a page).
export function useDataTable<TData extends RowData>(options: TableOptions<TData>) {
  const table = useReactTable<TData>({ ...options, autoResetPageIndex: false });

  const { sorting, columnFilters, globalFilter, pagination } = table.getState();

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    table.setPageIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting, columnFilters, globalFilter]);

  const pageCount = table.getPageCount();
  useEffect(() => {
    if (pageCount > 0 && pagination.pageIndex >= pageCount) table.setPageIndex(pageCount - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount, pagination.pageIndex]);

  return table;
}
