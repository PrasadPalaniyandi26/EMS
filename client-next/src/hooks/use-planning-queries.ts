import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';

// Project estimates, product costing, items, rates, changes and the monthly close.
// Keys start with 'budgets' so invalidate('budgets') refreshes them with the rest of budget control.
const KEY = 'budgets';
const get = <T,>(url: string) => api.get<T>(url).then((r) => r.data);

export interface RateCard { id: number; role: string; rate_per_hour: number; effective_from: string; next_rate: number | null; next_from: string | null; used_in: number }
export interface RateHistory { card_id: number; rate_per_hour: number; effective_from: string; changed_by_name: string | null }
export interface OverheadRate { id: number; fy: number; name: string; pool_amount: number; rate_per_hour: number }
export interface OverheadBase { fy: number; base_hours: number }
export interface Rates { current_fy: number; cards: RateCard[]; overheads: OverheadRate[]; bases: OverheadBase[]; base_hours: number; base_missing: boolean; combined_overhead_rate: number; pools_missing: boolean; fys: number[]; history: RateHistory[] }

export interface ItemPrice { id: number; price: number; paid_on: string; supplier: string | null; note: string | null; recorded_by_name: string | null }
export interface ImportResult { dry_run: boolean; created: number; updated: number; unchanged?: number; errors: { row: number; message: string }[]; applied: boolean }
export interface Item {
  last_paid_on: string | null; category_name: string | null; id: number; part_no: string; name: string; category_id: number | null; uom: string; standard_price: number; last_price: number | null;
  supplier: string | null; lead_time_days: number | null; sourcing: 'MAKE' | 'BUY'; material_cost: number | null; manufacturing_cost: number | null; used_in: number; price_drift_pct: number;
  oem_part_no: string | null; status: 'ACTIVE' | 'REPLACED' | 'RETIRED'; status_from: string | null; status_reason: string | null; replaced_by_id: number | null; replaced_by_part_no: string | null; replaced_by_name: string | null;
  ever_used: boolean; scheduled: PartScheduled | null; is_default_alternate: boolean; alternates: PartAlternate[];
  project_id: number | null; project_code: string | null;
}
export interface PartScheduled { id: number; effective_from: string; reason: string; successor_id: number | null; successor_part_no: string | null; successor_name: string | null }
export interface PartAlternate { id: number; part_no: string; oem_part_no: string | null; name: string; standard_price: number; last_price: number | null; supplier: string | null; lead_time_days: number | null; is_default: boolean }
export interface PartEvent { at: string; kind: string; text: string; by: string | null }

export interface ProjectRow {
  id: number; code: string | null; name: string; client_name: string | null; contract_value: number | null; target_margin_pct: number | null; min_margin_pct: number | null;
  risk_rating: string | null; estimate_status: string | null; estimate_total: number | null; actual: number; projected_margin_pct: number | null;
  products: { id: number; code: string | null; name: string }[];
}

export interface EstimateLineRow { id: number; phase: string; type_id: number | null; type_label: string; description: string; quantity: number; unit: string; rate: number; amount: number; basis: string | null; managed: boolean }
export interface BaselineRow {
  id: number; status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'; direct: number; contingency: number; warranty: number; total: number; line_count: number;
  proposed_by_name: string | null; created_at: string; approved_by_name: string | null; approved_at: string | null; rejected_by_name: string | null; rejected_at: string | null; reject_reason: string | null;
}
export interface Milestone { id: number; name: string; weight_pct: number; planned_date: string; done_date: string | null }
export interface Evm { bac: number; pv: number; ev: number; ac: number; cpi: number | null; spi: number | null; eac: number; etc: number; vac: number; tcpi: number | null; spend_low: boolean; series: { label: string; pv: number; ev: number | null; ac: number | null }[]; last_spend: string | null; percent_complete: number; percent_planned: number; weight_total: number }

export interface ProjectBudget {
  project: { id: number; code: string | null; name: string; client_name: string | null; contract_value: number | null; target_margin_pct: number | null; min_margin_pct: number | null; risk_rating: string | null; start_date: string | null; end_date: string | null; type_code: string | null; has_job_bom: boolean };
  estimate: { id: number; version: number; contingency_pct: number; warranty_pct: number; note: string | null } | null;
  baselines: BaselineRow[]; baseline: BaselineRow | null; changed_since_baseline: boolean;
  lines: EstimateLineRow[]; phases: { phase: string; amount: number }[];
  totals: { direct: number; contingency: number; warranty: number; total: number };
  margin: { contract_value: number | null; target_pct: number | null; min_pct: number | null; estimate_margin_pct: number | null; projected_margin_pct: number | null };
  evm: Evm; milestones: Milestone[]; rate_cards: RateCard[]; suggested_contingency_pct: number;
}

export interface ItemUse { kind: 'PRODUCT' | 'JOB'; id: number; code: string | null; name: string; client_name: string | null; quantity: number; scrap_pct: number; line_cost: number }
export interface ProductPricing {
  fy: number; price: number | null; updated_by_name: string | null; updated_at: string | null; unit_cost: number; basis: 'STANDARD' | 'ROLLED';
  target_margin_pct: number | null; min_margin_pct: number | null; price_for_target: number | null; price_for_min: number | null; rolled_cost: number | null; margin_at_rolled_pct: number | null;
  profit_unit: number | null; margin_pct: number | null; planned_revenue: number | null; planned_profit: number | null; built_revenue: number | null; built_profit: number | null;
}
export interface ProductRow { selling_price: number | null; target_margin_pct: number | null; min_margin_pct: number | null; margin_pct: number | null; standard_fy: number | null; fy: number; id: number; code: string | null; name: string; client_name: string | null; bom_status: string | null; bom_lines: number; rolled_cost: number | null; standard_cost: number | null; standard_approved_at: string | null; plan_status: string | null; budget_line: boolean }
export interface BomLineRow { id: number; sourcing: 'MAKE' | 'BUY'; item_id: number | null; sub_bom_id: number | null; sub_product_id: number | null; sub_standard_id: number | null; sub_drift: number; part_no: string; name: string; quantity: number; scrap_pct: number; unit_cost: number; amount: number; item_drift: number }
export interface OperationType { id: number; name: string; is_outsourced: boolean; is_fixed: boolean; is_active: boolean; used_in: number }
export interface OperationRow { id: number; name: string; type_id: number | null; type_name: string; is_outsourced: boolean; is_fixed: boolean; fixed_cost: number | null; role: string | null; hours: number; rate_card_id: number | null; rate: number; outsourced_cost: number | null; amount: number }
export interface CostBreakdown { material: number; scrap: number; freight: number; conversion: number; outsourced: number; fixed: number; overhead: number; warranty: number; total: number; overhead_rate: number; default_overhead_rate: number; default_freight_pct: number; default_warranty_pct: number; hours: number; freight_base: number; base_cost: number; pool_missing: boolean; fy: number }

export interface ProductCosting {
  product: { id: number; code: string | null; name: string; client_name: string | null; standard_cost: number | null };
  fy: number; plan_status: string | null; budget_line: boolean; pricing: ProductPricing; approved: { id: number; fy: number; fixed: number; total: number; material: number; scrap: number; freight: number; conversion: number; outsourced: number; overhead: number; warranty: number } | null; bom: { id: number; version: number; status: string; freight_pct: number; warranty_pct: number; overhead_rate_override: number | null; adjust_reason: string | null } | null;
  lines: BomLineRow[]; operations: OperationRow[]; cost: CostBreakdown | null;
  build_plan: { year: number; month: number; label: string; planned: number; actual: number; spend: number }[];
  annual: { planned_units: number; actual_units: number; budget: number; actual_standard: number; unit_cost: number; basis: 'STANDARD' | 'ROLLED'; plan_unit_cost: number; plan_budget: number };
  standards: { id: number; fy: number; total: number; material: number; scrap: number; freight: number; conversion: number; overhead: number; warranty: number; outsourced: number; fixed: number; status: string; approved_by_name: string | null; approved_at: string | null; created_at: string;
    overhead_rate: number | null; freight_pct: number | null; warranty_pct: number | null; adjust_reason: string | null; proposed_by_id: number | null; proposed_by_name: string | null; rejected_by_name: string | null; rejected_at: string | null; reject_reason: string | null }[];
  variances: { actual_spend: number; standard_material_for_units: number; spend_variance: number; price_variance: number; units_built: number; basis: 'STANDARD' | 'ROLLED'; bom_changed: boolean };
  operation_types: OperationType[];
  items: Item[]; rate_cards: { id: number; role: string; rate_per_hour: number }[]; sub_boms: { id: number; productId: number; version: number }[];
}

// The build behind a bespoke (J100) project: parts and build operations priced like a product, with no standard cost of its own
export interface JobBom {
  project: { id: number; code: string | null; name: string; client_name: string | null; type_code: string | null; type_name: string | null };
  bom: { id: number; project_id: number | null; version: number; status: string; freight_pct: number; warranty_pct: number } | null;
  lines: BomLineRow[]; operations: OperationRow[]; cost: CostBreakdown | null;
  operation_types: OperationType[]; items: Item[]; rate_cards: { id: number; role: string; rate_per_hour: number }[];
  sub_products: { id: number; code: string | null; name: string; standard_id: number; standard_cost: number; approved_at: string | null }[];
}

export interface BudgetChangeRow {
  id: number; kind: 'TRANSFER' | 'REVISION' | 'DRAWDOWN' | 'RELEASE'; amount: number; reason: string; status: 'PENDING' | 'APPROVED' | 'REJECTED';
  from_line_id: number | null; to_line_id: number | null; from_label: string | null; to_label: string | null;
  requested_by_name: string | null; decided_by_name: string | null; decided_at: string | null; decision_note: string | null; created_at: string; needs_admin: boolean;
}

export interface CloseLine { line_id: number; label: string; owner_name: string | null; budget: number; actual: number; variance: number; variance_pct: number; needs_note: boolean; note: { reason_code: string; comment: string | null; author_name: string | null } | null }
export interface CloseView {
  year: number; month: number; fy: number; plan: { label: string; status: string } | null; locked: boolean;
  lock: { locked_by_name: string | null; locked_at: string } | null; locks: { year: number; month: number; locked_by_name: string | null; locked_at: string }[];
  lines: CloseLine[]; totals?: { budget: number; actual: number };
}

export const useRates = () => useQuery({ queryKey: [KEY, 'rates'], queryFn: () => get<Rates>('/budgets/rates'), staleTime: 0 });
export const useItemUsage = (id: number | null) => useQuery({ queryKey: [KEY, 'item-usage', id], queryFn: () => get<ItemUse[]>(`/budgets/items/${id}/usage`), enabled: id != null, staleTime: 0 });
export const useItemPrices = (id: number | null) => useQuery({ queryKey: [KEY, 'item-prices', id], queryFn: () => get<ItemPrice[]>(`/budgets/items/${id}/prices`), enabled: id != null, staleTime: 0 });
export interface ItemCategory { id: number; name: string; used_in: number }
export const useItemCategories = () => useQuery({ queryKey: [KEY, 'item-categories'], queryFn: () => get<ItemCategory[]>('/budgets/item-categories'), staleTime: 0 });
export interface EstimatePhase { id: number; name: string; used_in: number }
export const useEstimatePhases = () => useQuery({ queryKey: [KEY, 'estimate-phases'], queryFn: () => get<EstimatePhase[]>('/budgets/estimate-phases'), staleTime: 0 });
// Active parts for the pickers; the Part master asks for every part, replaced and retired included
export const useItems = (all = false) => useQuery({ queryKey: [KEY, 'items', all], queryFn: () => get<Item[]>(`/budgets/items${all ? '?all=1' : ''}`), staleTime: 0 });
export const usePartHistory = (id: number | null) => useQuery({ queryKey: [KEY, 'part-history', id], queryFn: () => get<PartEvent[]>(`/budgets/items/${id}/history`), enabled: id != null, staleTime: 0 });
export const useBudgetProjects = () => useQuery({ queryKey: [KEY, 'projects'], queryFn: () => get<ProjectRow[]>('/budgets/projects'), staleTime: 0 });
export const useProjectBudget = (id: number | null) => useQuery({ queryKey: [KEY, 'project', id], queryFn: () => get<ProjectBudget>(`/budgets/projects/${id}`), enabled: id != null, staleTime: 0 });
export const useBudgetProducts = () => useQuery({ queryKey: [KEY, 'products'], queryFn: () => get<ProductRow[]>('/budgets/products'), staleTime: 0 });
export const useProductCosting = (id: number | null) => useQuery({ queryKey: [KEY, 'product', id], queryFn: () => get<ProductCosting>(`/budgets/products/${id}`), enabled: id != null, staleTime: 0 });
export const useJobBom = (id: number | null, enabled = true) => useQuery({ queryKey: [KEY, 'job-bom', id], queryFn: () => get<JobBom>(`/budgets/projects/${id}/job-bom`), enabled: id != null && enabled, staleTime: 0 });
export const useBudgetChanges = (status: string) => useQuery({ queryKey: [KEY, 'changes', status], queryFn: () => get<{ approval_threshold: number; rows: BudgetChangeRow[] }>(`/budgets/changes?status=${status}`), staleTime: 0 });
export const useMonthClose = (year: number, month: number) => useQuery({ queryKey: [KEY, 'close', year, month], queryFn: () => get<CloseView>(`/budgets/close?year=${year}&month=${month}`), staleTime: 0 });
