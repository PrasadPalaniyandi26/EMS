// ─── Entity Types ────────────────────────────────
export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  role_name?: string;
  role_id?: number;
  currency: string;
  is_active?: number;
  manager_id?: number | null;
  manager_name?: string;
  reporting_manager_id?: number | null;
  department?: string;
  clearance_level?: string;
  joining_date?: string;
  created_at?: string;
  roles?: Array<{ role_id: number; role_name: string; is_default: boolean }>;
  contact_no?: string | null;
  house_apt?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  postal_code?: string | null;
  user_status?: string;
  user_status_label?: string;
}

export interface Role {
  id: number;
  name: string;
  role_name?: string;
  description: string;
}

export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  icon: string;
  is_custom: number;
  created_by: number | null;
  is_active: number;
}

export interface Client {
  id: number;
  name: string;
  description: string;
  country?: string;
  address?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  business_type?: string;
  is_system: number;
  is_active: number;
}

export interface Project {
  id: number;
  name: string;
  code?: string;
  description?: string;
  client_id: number;
  type_id: number;
  client_name?: string;
  type_name?: string;
  is_system: number;
  is_active: number;
}

export interface Product {
  id: number;
  name: string;
  code?: string;
  description?: string;
  client_id: number;
  type_id: number;
  client_name?: string;
  type_name?: string;
  is_system: number;
  is_active: number;
}

export interface ProjectType {
  id: number;
  name: string;
  code?: string;
  description?: string;
  client_id: number;
  is_system?: number;
}

export interface ProductType {
  id: number;
  name: string;
  code?: string;
  description?: string;
  client_id: number;
  is_system?: number;
}

export interface Transaction {
  id: number;
  user_id: number;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  date_recorded: string;
  category_id: number;
  category_name?: string;
  client_id?: number;
  client_name?: string;
  project_id?: number;
  project_name?: string;
  product_id?: number;
  product_name?: string;
  payment_method?: string;
  reference_id?: string;
  receipt_number?: string;
  receipt_path?: string;
  context_type?: string;
  status?: string;
  notes?: string;
}

export interface Budget {
  id: number;
  user_id: number;
  category_id: number;
  category_name?: string;
  amount: number;
  period_month: number;
  period_year: number;
  is_active: number;
}

export interface RecurringTransaction {
  id: number;
  user_id: number;
  amount: number;
  description: string;
  category_id: number;
  category_name?: string;
  type: 'income' | 'expense';
  frequency: string;
  next_run_date: string;
  next_run?: string;
  is_active: number;
}

export interface ApprovalRequest {
  id: number;
  transaction_id: number;
  approver_id: number;
  status: string;
  comments?: string;
  created_at: string;
  transaction?: Transaction;
}

export interface AuditLog {
  id: number;
  table_name: string;
  record_id: number;
  action: string;
  changed_by: number;
  username?: string;
  old_values?: string;
  new_values?: string;
  created_at: string;
}

// ─── Dashboard Types ────────────────────────────
export interface DashboardSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  transactionCount: number;
  recentTransactions: Transaction[];
}

export interface CategoryBreakdown {
  category_id: number;
  category_name: string;
  type: string;
  total: number;
  count: number;
}

export interface MonthlyTrend {
  month: string;
  year: number;
  income: number;
  expense: number;
}

// ─── API Response Types ──────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error: ApiError | null;
  meta: { timestamp: string };
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Auth Types ──────────────────────────────────
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}
