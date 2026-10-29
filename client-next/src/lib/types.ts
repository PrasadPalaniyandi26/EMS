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
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  user_status?: string;
  user_status_label?: string;
  date_of_birth?: string | null;
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
  type_id?: number | null;
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
  is_system?: number;
}

export interface ProductType {
  id: number;
  name: string;
  code?: string;
  description?: string;
  is_system?: number;
}

export interface Transaction {
  id: number;
  user_id: number;
  type: 'income' | 'expense';
  amount: number;
  net_amount?: number;
  total_amount?: number;
  gst_rate?: number | null;
  gst_included?: boolean;
  is_claimable?: boolean;
  needs_reimbursement?: boolean;
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
  currency?: string;
  created_at?: string;
  updated_at?: string;
  submitted_at?: string;
  submitted_by_id?: number;
  submitted_by_name?: string;
  approved_by_id?: number;
  approved_by_name?: string;
  approved_by_role?: string;
  approved_at?: string;
  rejected_by_id?: number;
  rejected_by_name?: string;
  rejected_by_role?: string;
  rejected_at?: string;
  sent_back_by_id?: number;
  sent_back_by_name?: string;
  sent_back_by_role?: string;
  sent_back_at?: string;
  is_split?: number;
  context_code?: string;
  reimbursement_status?: string | null;
  reimbursed_at?: string | null;
  reimbursed_by_name?: string | null;
  reimbursement_reference?: string | null;
  reimbursement_note?: string | null;
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
  code?: string;
  user_id: number;
  amount: number;
  net_amount?: number;
  total_amount?: number;
  gst_rate?: number | null;
  gst_included?: boolean;
  description: string;
  category_id: number;
  category_name?: string;
  type: 'income' | 'expense';
  frequency: string;
  next_run_date: string;
  next_run?: string;
  start_date?: string | null;
  end_date?: string | null;
  last_run_date?: string | null;
  is_active: number;
  status?: string;
  payment_method?: string;
  project_id?: number | null;
  project_name?: string | null;
  client_id?: number | null;
  client_name?: string | null;
  product_id?: number | null;
  product_name?: string | null;
  receipt_path?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ApprovalRequest {
  id: number;
  record_type?: 'transaction' | 'recurring';
  transaction_id: number;
  recurring_id?: number;
  approver_id: number;
  level_num?: number;
  status: string;
  transaction_status?: string;
  comments?: string;
  created_at: string;
  reference_id?: string;
  type?: string;
  amount?: number;
  net_amount?: number;
  total_amount?: number;
  gst_rate?: number | null;
  is_claimable?: boolean;
  needs_reimbursement?: boolean;
  is_split?: number;
  date_recorded?: string;
  category_name?: string;
  description?: string;
  receipt_path?: string;
  submitted_by?: string;
  submitted_by_name?: string;
  submitted_by_id?: number;
  submitted_at?: string;
  approved_by_name?: string;
  approved_by_role?: string;
  approved_at?: string;
  rejected_by_name?: string;
  rejected_by_role?: string;
  rejected_at?: string;
  sent_back_by_name?: string;
  sent_back_by_role?: string;
  sent_back_at?: string;
  reimbursement_status?: string | null;
  reimbursed_at?: string | null;
  reimbursed_by_name?: string | null;
  reimbursement_reference?: string | null;
  reimbursement_note?: string | null;
  transaction?: Transaction;
}

export interface AuditLog {
  id: number;
  table_name: string;
  record_id: number;
  reference_id?: string;
  action: string;
  changed_by: number;
  username?: string;
  old_values?: string;
  new_values?: string;
  changed_at: string;
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  message?: string;
  entity_type?: string;
  entity_id?: number;
  reference_id?: string;
  is_read: boolean;
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
  // total/page/limit are present on paginated list endpoints
  meta: { timestamp: string; total?: number; page?: number; limit?: number };
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
  limit: number;
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
