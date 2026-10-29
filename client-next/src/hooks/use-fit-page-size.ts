'use client';

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

interface FitOptions {
  /** Selector (inside the container) of a rendered data row, used to measure the real row height */
  rowSelector?: string;
  /** Selector of the header that stays visible above the rows */
  headerSelector?: string;
  /** Row height to assume until a data row has been measured */
  fallbackRowHeight?: number;
  min?: number;
  max?: number;
  /** Changes when the rendered rows change (data loaded, page changed), so the height is measured again */
  remeasureKey?: unknown;
}

// How many rows fit in a scrolling table area, so a page fills the screen instead of leaving blank space
// (or hiding rows behind a scrollbar). Re-measures when the window or the layout resizes. Returns null while
// the container is hidden or not measured yet, so callers can fall back to their default page size.
export function useFitPageSize(
  ref: RefObject<HTMLElement | null>,
  { rowSelector = 'tbody tr', headerSelector = 'thead', fallbackRowHeight = 41, min = 5, max = 100, remeasureKey }: FitOptions = {},
): number | null {
  const [size, setSize] = useState<number | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el || el.clientHeight === 0) { setSize(null); return; }
    const header = el.querySelector<HTMLElement>(headerSelector)?.offsetHeight ?? 0;
    // Skip placeholder rows (empty-state / skeleton rows span all columns or are marked busy)
    const rowEl = [...el.querySelectorAll<HTMLElement>(rowSelector)].find((r) => r.offsetHeight > 0 && !r.querySelector('td[colspan]') && !r.querySelector('[class*="animate-pulse"]'));
    const row = rowEl?.offsetHeight || fallbackRowHeight;
    const fit = Math.floor((el.clientHeight - header) / row);
    const next = Math.max(min, Math.min(max, fit));
    setSize((prev) => (prev === next ? prev : next));
  }, [ref, rowSelector, headerSelector, fallbackRowHeight, min, max]);

  useLayoutEffect(() => { measure(); }, [measure, remeasureKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, measure]);

  return size;
}
