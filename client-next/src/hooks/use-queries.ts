import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import type {
  Category, Client, Project, Product, ProjectType, ProductType,
  Transaction, Budget, RecurringTransaction, ApprovalRequest, AuditLog,
  Role, DashboardSummary, CategoryBreakdown, MonthlyTrend,
  PaginatedResponse,
} from '@/lib/types';

// Reference data — almost never changes, cache for 60 minutes
const REF_STALE = 60 * 60 * 1000;
// Financial / user data — fetch fresh each time the query mounts
const LIVE_STALE = 0;

// ─── Categories ──────────────────────────────────
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories').then((r) => r.data),
    staleTime: REF_STALE,
  });
}

// ─── Clients ─────────────────────────────────────
export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<Client[]>('/clients').then((r) => r.data),
    staleTime: REF_STALE,
  });
}

// ─── Projects ────────────────────────────────────
export function useProjects(clientId?: number) {
  const qs = clientId ? `?clientId=${clientId}` : '';
  return useQuery({
    queryKey: ['projects', clientId],
    queryFn: () => api.get<Project[]>(`/projects${qs}`).then((r) => r.data),
    staleTime: REF_STALE,
  });
}

export function useProjectTypes(clientId?: number) {
  const qs = clientId ? `?clientId=${clientId}` : '';
  return useQuery({
    queryKey: ['projectTypes', clientId],
    queryFn: () => api.get<ProjectType[]>(`/project-types${qs}`).then((r) => r.data),
    staleTime: REF_STALE,
  });
}

// ─── Products ────────────────────────────────────
export function useProducts(clientId?: number) {
  const qs = clientId ? `?clientId=${clientId}` : '';
  return useQuery({
    queryKey: ['products', clientId],
    queryFn: () => api.get<Product[]>(`/products${qs}`).then((r) => r.data),
    staleTime: REF_STALE,
  });
}

export function useProductTypes(clientId?: number) {
  const qs = clientId ? `?clientId=${clientId}` : '';
  return useQuery({
    queryKey: ['productTypes', clientId],
    queryFn: () => api.get<ProductType[]>(`/product-types${qs}`).then((r) => r.data),
    staleTime: REF_STALE,
  });
}

// ─── Transactions ────────────────────────────────
export function useTransactions(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: () => api.get<PaginatedResponse<Transaction>>(`/transactions${qs}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

// ─── Budgets ─────────────────────────────────────
export function useBudgets() {
  return useQuery({
    queryKey: ['budgets'],
    queryFn: () => api.get<Budget[]>('/budgets').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useBudgetSummary(month?: number, year?: number) {
  const qs = new URLSearchParams();
  if (month) qs.set('month', String(month));
  if (year) qs.set('year', String(year));
  const q = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery({
    queryKey: ['budgets', 'summary', month, year],
    queryFn: () => api.get<unknown>(`/budgets/summary${q}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

// ─── Recurring ───────────────────────────────────
export function useRecurring() {
  return useQuery({
    queryKey: ['recurring'],
    queryFn: () => api.get<RecurringTransaction[]>('/recurring').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

// ─── Approvals ───────────────────────────────────
export function useApprovals() {
  return useQuery({
    queryKey: ['approvals'],
    queryFn: () => api.get<ApprovalRequest[]>('/approvals/pending').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useApprovalsHistory(status?: string) {
  return useQuery({
    queryKey: ['approvals-history', status],
    queryFn: () => {
      const qs = status ? `?status=${status}` : '';
      return api.get<ApprovalRequest[]>(`/approvals/history${qs}`).then((r) => r.data);
    },
    staleTime: LIVE_STALE,
  });
}

// ─── Audit ───────────────────────────────────────
export function useAuditLogs(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () => api.get<AuditLog[]>(`/audit${qs}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

// ─── Roles ───────────────────────────────────────
export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Role[]>('/roles').then((r) => r.data),
    staleTime: REF_STALE,
  });
}

// ─── Users ───────────────────────────────────────
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<import('@/lib/types').User[]>('/users').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

// ─── Dashboard ───────────────────────────────────
export function useDashboardSummary(dateFrom?: string, dateTo?: string) {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('dateFrom', dateFrom);
  if (dateTo) qs.set('dateTo', dateTo);
  const q = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery({
    queryKey: ['dashboard', 'summary', dateFrom, dateTo],
    queryFn: () => api.get<DashboardSummary>(`/dashboard/summary${q}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useDashboardByCategory(dateFrom?: string, dateTo?: string) {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('dateFrom', dateFrom);
  if (dateTo) qs.set('dateTo', dateTo);
  const q = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery({
    queryKey: ['dashboard', 'by-category', dateFrom, dateTo],
    queryFn: () => api.get<CategoryBreakdown[]>(`/dashboard/by-category${q}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useMonthlyTrend() {
  return useQuery({
    queryKey: ['dashboard', 'monthly-trend'],
    queryFn: () => api.get<MonthlyTrend[]>('/dashboard/monthly-trend').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useRecentTransactions() {
  return useQuery({
    queryKey: ['dashboard', 'recent'],
    queryFn: () => api.get<Transaction[]>('/dashboard/recent').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

// ─── Generic Mutation Hook ───────────────────────
export function useInvalidate() {
  const queryClient = useQueryClient();
  return (...keys: string[]) => {
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };
}
