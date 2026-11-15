'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';

// The Analytics tabs other than Spend. Each is worked out by the server when asked; nothing is stored.
const KEY = 'analytics';

const range = (from?: string, to?: string) => {
  const qs = new URLSearchParams();
  if (from) qs.set('dateFrom', from);
  if (to) qs.set('dateTo', to);
  return qs.toString() ? `?${qs.toString()}` : '';
};

export interface ProjectMarginRow {
  id: number; code: string | null; name: string; client_name: string | null; contract_value: number | null; estimate_total: number | null; profit: number | null;
  margin_pct: number | null; target_margin_pct: number | null; min_margin_pct: number | null; state: 'Below minimum' | 'Below target' | 'On target' | 'No price or estimate';
  spent: number; spent_pct: number | null; invoiced: number; invoiced_pct: number | null; received: number;
}
export interface ProjectProfitability {
  rows: ProjectMarginRow[];
  totals: { projects: number; priced: number; contract_value: number; estimate_total: number; profit: number; margin_pct: number | null; below_minimum: number; below_target: number; spent: number; invoiced: number };
}

export interface OrderRisk { id: number; code: string; client_name: string | null; product_name: string | null; status: string; quantity: number; delivery_date: string; earliest_delivery: string | null; reason: string; days: number }
export interface OrderDelivery {
  kpis: { delivered: number; on_time: number; on_time_pct: number | null; avg_days_late: number | null; open: number; at_risk: number };
  months: { label: string; on_time: number; late: number }[];
  products: { product_name: string; delivered: number; late: number; open: number; at_risk: number }[];
  at_risk: OrderRisk[];
}

export interface PersonSpend { user_id: number; username: string; department: string; approved: number; waiting: number; total: number; count: number; average: number; largest: number; last_date: string | null; share_pct: number }
export interface SpendingByPerson {
  people: PersonSpend[]; departments: { department: string; people: number; total: number; waiting: number }[];
  totals: { people: number; total: number; waiting: number; count: number };
}

export interface Receivables {
  buckets: { label: string; amount: number }[]; outstanding: number; overdue: number; invoices: number;
  clients: { client: string; invoices: number; outstanding: number; overdue: number; oldest_bucket: string }[];
  monthly: { label: string; billed: number; received: number }[];
}

export interface PartPriceRow {
  item_id: number; part_no: string; name: string; supplier: string | null; purchases: number; first_price: number; latest_price: number; standard_price: number;
  change_pct: number | null; vs_standard_pct: number | null; latest_date: string; series: { date: string; price: number }[];
}
export interface PartPrices { rows: PartPriceRow[]; totals: { parts: number; tracked: number; up: number; down: number; steady: number; avg_change_pct: number | null; above_standard: number } }

const useAnalytics = <T,>(name: string, path: string, enabled: boolean) =>
  useQuery({ queryKey: [KEY, name, path], queryFn: () => api.get<T>(`/dashboard/analytics/${path}`).then((r) => r.data), enabled, staleTime: 0 });

export const useProjectProfitability = (enabled = true) => useAnalytics<ProjectProfitability>('projects', 'project-profitability', enabled);
export const useOrderDelivery = (enabled = true) => useAnalytics<OrderDelivery>('orders', 'order-delivery', enabled);
export const useSpendingByPerson = (from: string, to: string, enabled = true) => useAnalytics<SpendingByPerson>('people', `spending-by-person${range(from, to)}`, enabled && !!from && !!to);
export const useReceivables = (enabled = true) => useAnalytics<Receivables>('receivables', 'receivables', enabled);
export const usePartPrices = (from: string, to: string, enabled = true) => useAnalytics<PartPrices>('prices', `part-prices${range(from, to)}`, enabled && !!from && !!to);
