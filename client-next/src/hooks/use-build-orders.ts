import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import type { OperationRow, OperationType } from '@/hooks/use-planning-queries';

// Build orders: a customer's commitment to have units of a standard product built and delivered.
// Keys start with 'budgets' so invalidate('budgets') refreshes them with the rest of budget control.
const KEY = 'budgets';
const get = <T,>(url: string) => api.get<T>(url).then((r) => r.data);

export type BuildOrderStatus = 'COMMITTED' | 'RELEASED' | 'IN_BUILD' | 'DELIVERED' | 'CANCELLED';

export interface BuildOrderRow {
  id: number; code: string; product_id: number; product_code: string | null; product_name: string | null; client_id: number; client_name: string | null;
  quantity: number; customer_po: string | null; status: BuildOrderStatus; start_date: string; delivery_date: string; delivered_on: string | null;
  unit_price: number | null; notes: string | null; source_bom_version: number | null; source_standard_cost: number | null; imported_at: string | null;
  unit_cost: number | null; costed_at: string | null; cancel_reason: string | null; total_cost: number | null; total_value: number | null;
  margin_pct: number | null; vs_standard: number | null; created_by_name: string | null; created_at: string;
  has_bom: boolean; late?: boolean; earliest_delivery?: string | null;
}

export interface OrderAlternate { id: number; part_no: string; name: string; supplier: string | null; standard_price: number; lead_time_days: number | null; is_default: boolean; cost_change: number }
// The order's own copy of a build operation: the same shape as the product's, so the same dialog edits it
export type OrderOperation = OperationRow;
export interface OrderStandard { fy: number; total: number; material: number; scrap: number; freight: number; conversion: number; outsourced: number; fixed: number; overhead: number; warranty: number }
export interface OrderLine {
  id: number; item_id: number | null; group_name: string | null; sequence: number; tail_days: number; part_status: 'ACTIVE' | 'REPLACED' | 'RETIRED' | null; sourcing: 'MAKE' | 'BUY'; item_drift: number; part_no: string; name: string; quantity: number; scrap_pct: number; unit_cost: number; amount: number;
  lead_time_days: number | null; supplier: string | null; swapped: boolean; source_item_id: number | null; source_part_no: string | null; source_name: string | null; alternates: OrderAlternate[];
}
export interface OrderLead {
  window_days: number; longest_lead_days: number; assembly_days: number; needed_days: number; late: boolean; earliest_delivery: string; missing_lead_time: number; late_lines: number[]; stages: { sequence: number; lead_days: number; begins_day: number; build_days: number; finish_day: number }[];
}
export interface OrderPlan { year: number; month: number; planned: number; taken: number; open: number; over: boolean }
export interface BuildOrder extends BuildOrderRow {
  bom_id: number | null; editable: boolean; lines: OrderLine[];
  operations: OrderOperation[];
  cost: { material: number; scrap: number; freight: number; conversion: number; outsourced: number; fixed: number; overhead: number; warranty: number; total: number; hours: number; overhead_rate: number; freight_pct?: number;
    default_overhead_rate: number; default_freight_pct: number; default_warranty_pct: number; base_cost: number; freight_base: number } | null;
  // The order's own copy of the cost settings; Price and costing changes them for this order only
  bom_settings: { freight_pct: number; warranty_pct: number; overhead_rate_override: number | null; adjust_reason: string | null } | null;
  // What the Build operation dialog picks from
  operation_types: OperationType[]; rate_cards: { id: number; role: string; rate_per_hour: number }[];
  live_unit_cost: number | null; cost_drift: number | null; lead: OrderLead; plan: OrderPlan;
  stale: { bom_newer: number | null; standard_changed: boolean; ended_parts: number };
  schedule: OrderScheduleMonth[]; actuals: OrderActuals;
  targets: { fy: number; list_price: number | null; target_margin_pct: number | null; min_margin_pct: number | null };
  standard_now: OrderStandard | null;
}
export interface OrderScheduleMonth { year: number; month: number; label: string; materials: number; assembly: number; spend: number; revenue: number }
export interface OrderExpense { id: number; reference_id: string | null; date_recorded: string; description: string | null; category_name: string | null; is_e200: boolean; amount: number; status: string | null; submitted_by_name: string | null }
export interface OrderActuals {
  approved: number; approved_e200: number; approved_other: number; waiting: number; drafts: number;
  expected_bought: number | null; labour_at_standard: number | null; remaining: number | null;
  spend_variance: number | null; price_variance: number; usage_variance: number | null; spent_pct: number | null;
  actual_cost: number | null; actual_profit: number | null; actual_margin_pct: number | null;
  expenses: OrderExpense[];
}
export interface CashMonth { year: number; month: number; label: string; materials: number; assembly: number; spend: number; revenue: number; net: number; cumulative: number; budget_e200: number | null }
export interface CashView { orders: number; late_orders: number; months: CashMonth[] }
export interface ExpenseOrder { id: number; code: string; client_name: string | null; quantity: number; status: BuildOrderStatus; customer_po: string | null }
// What a product says about a new order for it: the starting point for the Add order dialog
export interface BuildOrderDefaults {
  product_id: number; client_id: number | null; client_name: string | null; fy: number; unit_price: number | null; target_margin_pct: number | null; min_margin_pct: number | null;
  standard_cost: number | null; unit_cost: number | null; has_bom: boolean; bom_version: number | null; bom_lines: number;
  longest_lead_days: number | null; assembly_days: number | null; missing_lead_time: number; suggested_delivery: string | null;
}
export interface BuildOrderOptions {
  products: { id: number; code: string | null; name: string; standard_cost: number | null; has_bom: boolean; bom_version: number | null }[];
  clients: { id: number; name: string }[];
}

export const useBuildOrders = () => useQuery({ queryKey: [KEY, 'build-orders'], queryFn: () => get<BuildOrderRow[]>('/build-orders'), staleTime: 0 });
export const useBuildOrder = (id: number | null) => useQuery({ queryKey: [KEY, 'build-order', id], queryFn: () => get<BuildOrder>(`/build-orders/${id}`), enabled: id != null, staleTime: 0 });
export const useBuildOrderDefaults = (productId: string, quantity: number, startDate: string, enabled = true) => useQuery({
  queryKey: [KEY, 'build-order-defaults', productId, quantity, startDate],
  queryFn: () => get<BuildOrderDefaults>(`/build-orders/product-defaults?product_id=${productId}&quantity=${quantity}${startDate ? `&start_date=${startDate}` : ''}`),
  enabled: enabled && !!productId, staleTime: 0,
});
export const useBuildCash =(enabled = true) => useQuery({ queryKey: [KEY, 'build-cash'], queryFn: () => get<CashView>('/build-orders/cash'), enabled, staleTime: 0 });
export const useOrdersForExpense = (productId: string, enabled = true) => useQuery({ queryKey: [KEY, 'orders-for-expense', productId], queryFn: () => get<ExpenseOrder[]>(`/build-orders/for-expense?product_id=${productId}`), enabled: enabled && !!productId, staleTime: 0 });
export const useBuildOrderOptions =(enabled = true) => useQuery({ queryKey: [KEY, 'build-order-options'], queryFn: () => get<BuildOrderOptions>('/build-orders/options'), enabled, staleTime: 0 });

export const ORDER_STATUS: Record<BuildOrderStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  COMMITTED: { label: 'Committed', tone: 'muted' },
  RELEASED: { label: 'Released', tone: 'info' },
  IN_BUILD: { label: 'In build', tone: 'warning' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
