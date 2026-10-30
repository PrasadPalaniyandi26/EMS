import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';

// Budget control: plans per financial year, their lines, live usage, alerts and settings.
// Every key starts with 'budgets' so invalidate('budgets') refreshes all of them.
const KEY = 'budgets';
const LIVE = 0;

export type CostObject = 'PROJECT' | 'PRODUCT' | 'DEPARTMENT' | 'RESERVE';
export type PlanStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'ACTIVE' | 'CLOSED';
export type AlertLevel = 'INFO' | 'CAUTION' | 'WARNING' | 'CRITICAL';
export type LineStatus = 'On track' | 'Caution' | 'Warning' | 'Critical' | 'Held';

export interface BudgetPlanInfo {
  id: number; fy: number; label: string; name: string; status: PlanStatus; envelope: number | null; version: number;
  submitted_at: string | null; submitted_by_name: string | null; approved_at: string | null; approved_by_name: string | null; decision_note: string | null;
  line_count?: number;
}

export interface BudgetLine {
  id: number; plan_id: number; cost_object: CostObject; project_id: number | null; product_id: number | null; department_id: number | null;
  type_id: number | null; category_id: number | null; control_level: 'TYPE' | 'CATEGORY'; strict: boolean; is_contingency: boolean;
  owner_id: number | null; owner_name: string | null; note: string | null;
  object_name: string; object_code: string; type_label: string; category_label: string | null; label: string;
  periods: number[]; total: number; actual: number; committed: number;
}

export interface PlanView {
  plan: BudgetPlanInfo;
  months: { year: number; month: number; label: string }[];
  lines: BudgetLine[];
  totals: { planned: number; reserve: number; envelope: number | null; unallocated: number | null };
}

export interface MonitorLine extends BudgetLine {
  used: number; available: number; pct: number; forecast: number | null; runs_out: string | null;
  status: LineStatus; forecast_over: boolean; open_alerts: number;
}

export interface MonitorView {
  fy: number; label: string; plan: BudgetPlanInfo | null; as_of?: string;
  kpis: { approved: number; actual: number; committed: number; forecast: number; open_alerts: number; unbudgeted: number; unbudgeted_count: number } | null;
  lines: MonitorLine[];
}

export interface LineDetail {
  line: BudgetLine;
  months: { year: number; month: number; label: string; budget: number; actual: number; committed: number }[];
  alerts: { id: number; level: AlertLevel; message: string; opened_at: string }[];
  expenses: { id: number; reference_id: string; description: string | null; date_recorded: string; status: string; amount: number }[];
}

export interface BudgetAlert {
  id: number; rule_code: string; rule_name: string; level: AlertLevel; message: string; action: string | null;
  line_id: number | null; line_label: string | null; strict: boolean; owner_id: number | null;
  status: 'OPEN' | 'RESOLVED'; opened_at: string; resolved_at: string | null;
}

export interface BudgetSettings {
  fy_start_month: number; over_budget_mode: 'WARN' | 'BLOCK'; control_level: 'TYPE' | 'CATEGORY'; net_of_claimable_gst: boolean;
  approval_threshold: number; contingency_pct: number; has_plans: boolean;
  rules: { code: string; name: string; detail: string | null; enabled: boolean; threshold: number | null }[];
}

export interface Headroom {
  state: 'NONE' | 'NO_PLAN' | 'NO_LINE' | 'NOT_ALLOWED' | 'OK' | 'OVER' | 'BLOCKED';
  message: string | null;
  line_id?: number; line_label?: string; strict?: boolean; budget?: number; used?: number; left?: number; over_by?: number;
  to_month?: string; needs_reason?: boolean;
}

export interface ExpenseImpact {
  state: 'NO_PLAN' | 'NO_LINE' | 'WITHIN' | 'OVER';
  line_label?: string; budget?: number; before?: number; after?: number; before_pct?: number; after_pct?: number;
  over_by?: number; reason?: string | null; to_month?: string;
}

export function useBudgetPlans(enabled = true) {
  return useQuery({
    queryKey: [KEY, 'plans'],
    queryFn: () => api.get<{ current_fy: number; plans: BudgetPlanInfo[] }>('/budgets/plans').then((r) => r.data),
    enabled, staleTime: LIVE,
  });
}

export function useBudgetPlan(fy: number | null) {
  return useQuery({
    queryKey: [KEY, 'plan', fy],
    queryFn: () => api.get<PlanView>(`/budgets/plans/${fy}`).then((r) => r.data),
    enabled: fy != null, staleTime: LIVE,
  });
}

export function useBudgetMonitor(fy: number | null) {
  return useQuery({
    queryKey: [KEY, 'monitor', fy],
    queryFn: () => api.get<MonitorView>(`/budgets/monitor${fy != null ? `?fy=${fy}` : ''}`).then((r) => r.data),
    staleTime: LIVE,
  });
}

export function useBudgetLine(id: number | null) {
  return useQuery({
    queryKey: [KEY, 'line', id],
    queryFn: () => api.get<LineDetail>(`/budgets/lines/${id}`).then((r) => r.data),
    enabled: id != null, staleTime: LIVE,
  });
}

export function useBudgetAlerts(status: 'OPEN' | 'RESOLVED' | 'ALL') {
  return useQuery({
    queryKey: [KEY, 'alerts', status],
    queryFn: () => api.get<BudgetAlert[]>(`/budgets/alerts?status=${status}`).then((r) => r.data),
    staleTime: LIVE,
  });
}

export function useBudgetAlertCount(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'alert-count'],
    queryFn: () => api.get<{ open: number; critical: number }>('/budgets/alerts/count').then((r) => r.data),
    enabled, staleTime: 60_000, refetchInterval: 5 * 60_000,
  });
}

export function useBudgetSettings(enabled = true) {
  return useQuery({
    queryKey: [KEY, 'settings'],
    queryFn: () => api.get<BudgetSettings>('/budgets/settings').then((r) => r.data),
    enabled, staleTime: 60_000,
  });
}

export interface HeadroomParams {
  date?: string; contextType?: string; projectId?: string | number; productId?: string | number; departmentId?: string | number;
  categoryId?: string | number; amount?: string | number; excludeId?: number; gstClaimable?: boolean; netAmount?: number;
}

// Headroom for the expense being entered; empty until a cost object and category are chosen
export function useHeadroom(p: HeadroomParams, enabled: boolean) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  return useQuery({
    queryKey: [KEY, 'headroom', qs.toString()],
    queryFn: () => api.get<Headroom>(`/budgets/headroom?${qs.toString()}`).then((r) => r.data),
    enabled, staleTime: 15_000, placeholderData: (prev) => prev,
  });
}

export function useExpenseImpact(ids: number[]) {
  const key = ids.join(',');
  return useQuery({
    queryKey: [KEY, 'impact', key],
    queryFn: () => api.get<Record<number, ExpenseImpact>>(`/budgets/impact?ids=${key}`).then((r) => r.data),
    enabled: ids.length > 0, staleTime: 15_000,
  });
}

export const fyLabel = (fy: number, startMonth = 4) => (startMonth === 1 ? `FY ${fy}` : `FY ${fy}-${String(fy + 1).slice(2)}`);

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
