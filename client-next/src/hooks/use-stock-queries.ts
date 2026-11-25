import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';

// Bulk stock: parts, balances, the ledger, stock used on a job and the monthly count.
// Every key starts with 'stock' so invalidate('stock') refreshes all of them.
const KEY = 'stock';
const get = <T,>(url: string) => api.get<T>(url).then((r) => r.data as T);

export interface StockPart {
  id: number; part_no: string; name: string; uom: string; purchase_uom: string; purchase_factor: number; on_hand: number; category_id: number | null; status: string;
}
export interface StockBalanceRow {
  id: number; part_no: string; name: string; uom: string; supply_mode: 'DIRECT' | 'STOCK'; purchase_uom: string | null; purchase_factor: number | null;
  reorder_level: number | null; category_id: number | null; category_name: string | null; quantity: number; value: number; avg_cost: number; standard_price: number; reorder: boolean; entries: number;
}
export type StockKind = 'OPENING' | 'IN' | 'USED' | 'ADJUST';
export interface StockMoveRow {
  id: number; item_id: number; part_no: string; part_name: string; uom: string; kind: StockKind; quantity: number; value: number; unit_cost: number; moved_on: string;
  project_id: number | null; build_order_id: number | null; job: string | null; category_name: string | null; reference: string | null;
  corrects_id: number | null; reason: string | null; created_by_name: string | null; closed: boolean;
}
export interface JobStockLine {
  item_id: number; part_no: string; name: string; uom: string; on_bom: boolean; bom_qty: number | null; used_qty: number; used_value: number; bom_value: number | null;
  suggested_qty: number | null; on_hand: number; avg_cost: number; category_id: number | null; is_stock: boolean; entries: number;
}
export interface JobStock {
  label: string; has_bom: boolean; closed: string | null; project_id: number | null; build_order_id: number | null; product_id: number | null;
  lines: JobStockLine[]; parts: JobStockLine[]; entries: StockMoveRow[]; total: number;
}
export interface StockCountRow {
  id: number; year: number; month: number; label: string; status: 'DRAFT' | 'SUBMITTED' | 'APPROVED'; note: string | null; created_by_name: string | null; created_at: string;
  submitted_by_name: string | null; submitted_at: string | null; approved_by_name: string | null; approved_at: string | null; parts: number; counted: number; adjustment_value: number;
}
export interface StockCountLine { item_id: number; part_no: string; name: string; uom: string; expected_qty: number; counted_qty: number | null; difference: number | null; difference_value: number | null }
export type StockCountDetail = Omit<StockCountRow, 'parts' | 'counted' | 'adjustment_value'> & { lines: StockCountLine[] };

export const KIND_LABEL: Record<StockKind, string> = { OPENING: 'Opening stock', IN: 'Stock in', USED: 'Stock used', ADJUST: 'Count difference' };
export const qty = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 3 });

export const useStockParts = (enabled = true) => useQuery({ queryKey: [KEY, 'parts'], queryFn: () => get<StockPart[]>('/stock/parts'), enabled, staleTime: 0 });
export const useStockOnHand = (asOf = '', enabled = true) => useQuery({ queryKey: [KEY, 'on-hand', asOf], queryFn: () => get<StockBalanceRow[]>(`/stock/on-hand${asOf ? `?asOf=${asOf}` : ''}`), enabled, staleTime: 0 });
export const useStockMoves = (enabled = true) => useQuery({ queryKey: [KEY, 'moves'], queryFn: () => get<StockMoveRow[]>('/stock/moves'), enabled, staleTime: 0 });
export const useJobStock = (job: { projectId?: number; buildOrderId?: number }, enabled = true) => useQuery({
  queryKey: [KEY, 'job', job.projectId ?? 0, job.buildOrderId ?? 0],
  queryFn: () => get<JobStock>(`/stock/job?${job.buildOrderId ? `buildOrderId=${job.buildOrderId}` : `projectId=${job.projectId}`}`),
  enabled, staleTime: 0,
});
export const useStockCounts = (enabled = true) => useQuery({ queryKey: [KEY, 'counts'], queryFn: () => get<StockCountRow[]>('/stock/counts'), enabled, staleTime: 0 });
export const useStockCount = (id: number | null) => useQuery({ queryKey: [KEY, 'count', id], queryFn: () => get<StockCountDetail>(`/stock/counts/${id}`), enabled: id != null, staleTime: 0 });
