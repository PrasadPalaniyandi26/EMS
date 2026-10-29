import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import type {
  Category, Client, Project, Product, ProjectType, ProductType,
  Transaction, Budget, RecurringTransaction, ApprovalRequest, AuditLog,
  Notification, Role, DashboardSummary, CategoryBreakdown, MonthlyTrend,
  PaginatedResponse,
} from '@/lib/types';

// Reference data — almost never changes, cache for 60 minutes
const REF_STALE = 60 * 60 * 1000;
// Financial / user data — fetch fresh each time the query mounts
const LIVE_STALE = 0;

export const QUERY_KEYS = {
  CATEGORIES: 'categories',
  CLIENTS: 'clients',
  PROJECTS: 'projects',
  PROJECT_TYPES: 'projectTypes',
  PRODUCTS: 'products',
  PRODUCT_TYPES: 'productTypes',
  TRANSACTIONS: 'transactions',
  BUDGETS: 'budgets',
  RECURRING: 'recurring',
  APPROVALS: 'approvals',
  APPROVALS_HISTORY: 'approvals-history',
  AUDIT: 'audit',
  NOTIFICATIONS: 'notifications',
  ROLES: 'roles',
  USERS: 'users',
  DASHBOARD: 'dashboard',
  ANALYTICS: 'analytics',
  REPORT: 'report',
  REIMBURSEMENTS: 'reimbursements',
} as const;

// ─── Categories ──────────────────────────────────
export function useCategories() {
  return useQuery({
    queryKey: [QUERY_KEYS.CATEGORIES],
    queryFn: () => api.get<Category[]>('/categories').then((r) => r.data),
    staleTime: REF_STALE,
  });
}

// ─── Clients ─────────────────────────────────────
export function useClients() {
  return useQuery({
    queryKey: [QUERY_KEYS.CLIENTS],
    queryFn: () => api.get<Client[]>('/clients').then((r) => r.data),
    staleTime: REF_STALE,
  });
}

// ─── Projects ────────────────────────────────────
export function useProjects(clientId?: number) {
  const qs = clientId ? `?clientId=${clientId}` : '';
  return useQuery({
    queryKey: [QUERY_KEYS.PROJECTS, clientId],
    queryFn: () => api.get<Project[]>(`/projects${qs}`).then((r) => r.data),
    staleTime: REF_STALE,
  });
}

export function useProjectTypes(clientId?: number) {
  const qs = clientId ? `?clientId=${clientId}` : '';
  return useQuery({
    queryKey: [QUERY_KEYS.PROJECT_TYPES, clientId],
    queryFn: () => api.get<ProjectType[]>(`/project-types${qs}`).then((r) => r.data),
    staleTime: REF_STALE,
  });
}

// ─── Products ────────────────────────────────────
export function useProducts(clientId?: number) {
  const qs = clientId ? `?clientId=${clientId}` : '';
  return useQuery({
    queryKey: [QUERY_KEYS.PRODUCTS, clientId],
    queryFn: () => api.get<Product[]>(`/products${qs}`).then((r) => r.data),
    staleTime: REF_STALE,
  });
}

export function useProductTypes(clientId?: number) {
  const qs = clientId ? `?clientId=${clientId}` : '';
  return useQuery({
    queryKey: [QUERY_KEYS.PRODUCT_TYPES, clientId],
    queryFn: () => api.get<ProductType[]>(`/product-types${qs}`).then((r) => r.data),
    staleTime: REF_STALE,
  });
}

// ─── Transactions ────────────────────────────────
export function useTransactions(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS, params],
    // The API returns the rows as `data` and the pagination totals in `meta`
    queryFn: () => api.get<Transaction[]>(`/transactions${qs}`).then((r): PaginatedResponse<Transaction> => ({
      rows: r.data,
      total: r.meta.total ?? r.data.length,
      page: r.meta.page ?? 1,
      limit: r.meta.limit ?? r.data.length,
    })),
    staleTime: LIVE_STALE,
  });
}

// Every page of a filtered list, for workspaces that filter, sort and search client-side. The API caps a page at
// 500 rows, so this keeps requesting pages until `total` is reached (up to MAX_PAGES) instead of silently
// stopping at the first 500. `truncated` is true only if the safety cap was hit.
const ALL_PAGE_SIZE = 500;
const ALL_MAX_PAGES = 20;
export function useAllTransactions(params: Record<string, string>) {
  return useQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS, 'all', params],
    queryFn: async (): Promise<PaginatedResponse<Transaction> & { truncated: boolean }> => {
      const rows: Transaction[] = [];
      let total = 0;
      for (let page = 1; page <= ALL_MAX_PAGES; page++) {
        const qs = new URLSearchParams({ ...params, page: String(page), limit: String(ALL_PAGE_SIZE) }).toString();
        const r = await api.get<Transaction[]>(`/transactions?${qs}`);
        total = r.meta.total ?? r.data.length;
        rows.push(...r.data);
        if (rows.length >= total || r.data.length === 0) break;
      }
      return { rows, total, page: 1, limit: rows.length, truncated: rows.length < total };
    },
    staleTime: LIVE_STALE,
  });
}

// ─── Budgets ─────────────────────────────────────
export function useBudgets() {
  return useQuery({
    queryKey: [QUERY_KEYS.BUDGETS],
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
    queryKey: [QUERY_KEYS.BUDGETS, 'summary', month, year],
    queryFn: () => api.get<unknown>(`/budgets/summary${q}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

// ─── Recurring ───────────────────────────────────
export function useRecurring(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useQuery({
    queryKey: [QUERY_KEYS.RECURRING, params],
    queryFn: () => api.get<RecurringTransaction[]>(`/recurring${qs}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useRecurringRuns(recurringId?: number) {
  return useQuery({
    queryKey: [QUERY_KEYS.RECURRING, 'runs', recurringId],
    queryFn: () => api.get<any[]>(`/recurring/${recurringId}/runs`).then((r) => r.data),
    enabled: !!recurringId,
    staleTime: LIVE_STALE,
  });
}

export function useApprovalTrail(transactionId?: number) {
  return useQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS, 'approval-trail', transactionId],
    queryFn: () => api.get<any[]>(`/transactions/${transactionId}/approval-trail`).then((r) => r.data),
    enabled: !!transactionId,
    staleTime: LIVE_STALE,
  });
}

// ─── Approvals ───────────────────────────────────
export function useApprovals() {
  return useQuery({
    queryKey: [QUERY_KEYS.APPROVALS],
    queryFn: () => api.get<ApprovalRequest[]>('/approvals/pending').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useApprovalsHistory(status?: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.APPROVALS_HISTORY, status],
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
    queryKey: [QUERY_KEYS.AUDIT, params],
    queryFn: async () => {
      const r = await api.get<AuditLog[]>(`/audit${qs}`);
      return { rows: (r.data as any) ?? [], total: (r as any).meta?.total ?? 0, limit: (r as any).meta?.limit ?? 50 };
    },
    staleTime: LIVE_STALE,
  });
}

export function useAuditStats() {
  return useQuery({
    queryKey: [QUERY_KEYS.AUDIT, 'stats'],
    queryFn: () => api.get<{ total: number; by_action: any[]; by_table: any[] }>('/audit/stats').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Notifications ────────────────────────────────
export function useNotifications(params?: Record<string, string>) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useQuery({
    queryKey: [QUERY_KEYS.NOTIFICATIONS, params],
    queryFn: async () => {
      const r = await api.get<Notification[]>(`/notifications${qs}`);
      // ResponseInterceptor puts rows into data and total/unread_count into meta
      return { rows: (r.data as any) ?? [], total: (r as any).meta?.total ?? 0, unread_count: (r as any).meta?.unread_count ?? 0 };
    },
    enabled: isAuthenticated,
    staleTime: LIVE_STALE,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadCount() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: [QUERY_KEYS.NOTIFICATIONS, 'unread-count'],
    queryFn: () => api.get<{ unread_count: number }>('/notifications/unread-count').then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

// ─── Roles ───────────────────────────────────────
export function useRoles() {
  return useQuery({
    queryKey: [QUERY_KEYS.ROLES],
    queryFn: () => api.get<Role[]>('/roles').then((r) => r.data),
    staleTime: REF_STALE,
  });
}

// ─── Users ───────────────────────────────────────
const USER_STALE = 2 * 60 * 1000; // 2 minutes — users change infrequently

export function useUsers() {
  return useQuery({
    queryKey: [QUERY_KEYS.USERS],
    queryFn: () => api.get<import('@/lib/types').User[]>('/users').then((r) => r.data),
    staleTime: USER_STALE,
  });
}

// ─── Dashboard ───────────────────────────────────
export function useDashboardSummary(dateFrom?: string, dateTo?: string) {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('dateFrom', dateFrom);
  if (dateTo) qs.set('dateTo', dateTo);
  const q = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery({
    queryKey: [QUERY_KEYS.DASHBOARD, 'summary', dateFrom, dateTo],
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
    queryKey: [QUERY_KEYS.DASHBOARD, 'by-category', dateFrom, dateTo],
    queryFn: () => api.get<CategoryBreakdown[]>(`/dashboard/by-category${q}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useMonthlyTrend() {
  return useQuery({
    queryKey: [QUERY_KEYS.DASHBOARD, 'monthly-trend'],
    queryFn: () => api.get<MonthlyTrend[]>('/dashboard/monthly-trend').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useRecentTransactions() {
  return useQuery({
    queryKey: [QUERY_KEYS.DASHBOARD, 'recent'],
    queryFn: () => api.get<Transaction[]>('/dashboard/recent').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useBudgetUtilization() {
  return useQuery({
    queryKey: [QUERY_KEYS.DASHBOARD, 'budget-utilization'],
    queryFn: () => api.get<any[]>('/dashboard/budget-utilization').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useApprovalCounts() {
  return useQuery({
    queryKey: [QUERY_KEYS.DASHBOARD, 'approval-counts'],
    queryFn: () => api.get<any>('/dashboard/approval-counts').then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useProjectSpend(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.DASHBOARD, 'project-spend', dateFrom, dateTo],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      const q = qs.toString();
      return api.get<any[]>(`/dashboard/project-spend${q ? `?${q}` : ''}`).then((r) => r.data);
    },
    staleTime: LIVE_STALE,
  });
}

export function useTopSpenders(dateFrom?: string, dateTo?: string) {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('dateFrom', dateFrom);
  if (dateTo)   qs.set('dateTo',   dateTo);
  const q = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery({
    queryKey: [QUERY_KEYS.ANALYTICS, 'top-spenders', dateFrom, dateTo],
    queryFn: () => api.get<any[]>(`/dashboard/analytics/top-spenders${q}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useCategoryHeatmap(dateFrom?: string, dateTo?: string) {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('dateFrom', dateFrom);
  if (dateTo)   qs.set('dateTo',   dateTo);
  const q = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery({
    queryKey: [QUERY_KEYS.ANALYTICS, 'category-heatmap', dateFrom, dateTo],
    queryFn: () => api.get<any>(`/dashboard/analytics/category-heatmap${q}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useProjectBurn(dateFrom?: string, dateTo?: string) {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('dateFrom', dateFrom);
  if (dateTo)   qs.set('dateTo',   dateTo);
  const q = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery({
    queryKey: [QUERY_KEYS.ANALYTICS, 'project-burn', dateFrom, dateTo],
    queryFn: () => api.get<any[]>(`/dashboard/analytics/project-burn${q}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useProductBurn(dateFrom?: string, dateTo?: string) {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('dateFrom', dateFrom);
  if (dateTo)   qs.set('dateTo',   dateTo);
  const q = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery({
    queryKey: [QUERY_KEYS.ANALYTICS, 'product-burn', dateFrom, dateTo],
    queryFn: () => api.get<any[]>(`/dashboard/analytics/product-burn${q}`).then((r) => r.data),
    staleTime: LIVE_STALE,
  });
}

export function useReportData(type: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ type, ...params }).toString();
  return useQuery({
    queryKey: [QUERY_KEYS.REPORT, type, params],
    queryFn: () => api.get<any>(`/reporting/generate?${qs}`).then((r) => r.data),
    enabled: false,
    staleTime: 0,
  });
}

// ─── Transaction Notes ───────────────────────────
export function useTransactionNotes(transactionId?: number) {
  return useQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS, 'notes', transactionId],
    queryFn: () => api.get<any[]>(`/transactions/${transactionId}/notes`).then((r) => r.data),
    enabled: !!transactionId,
    staleTime: LIVE_STALE,
  });
}

// ─── Reimbursements ──────────────────────────────
export function useReimbursementQueue(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useQuery({
    queryKey: [QUERY_KEYS.REIMBURSEMENTS, params],
    queryFn: () => api.get<any[]>(`/transactions/reimbursements${qs}`).then((r) => r.data),
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
