import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';

// Client purchase orders and invoices. Every key starts with 'invoicing', so invalidate('invoicing') refreshes them all.
const KEY = 'invoicing';
const get = <T,>(url: string) => api.get<T>(url).then((r) => r.data);

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PART_PAID' | 'PAID' | 'CANCELLED';
export type PoStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

export interface ClientPo {
  id: number; client_id: number; client_name: string | null; po_number: string; po_date: string; value: number; valid_until: string | null;
  project_id: number | null; project_name: string | null; build_order_id: number | null; build_order_code: string | null;
  status: PoStatus; auto_closed: boolean; file_path: string | null; note: string | null; created_by_name: string | null; created_at: string;
  invoiced: number; balance: number; draft_count: number; invoice_count: number; expired: boolean;
  invoices?: { id: number; number: string | null; invoice_date: string; total: number; taxable: number; status: InvoiceStatus }[];
}

export interface InvoiceLine { id?: number; sequence?: number; description: string; hsn: string | null; quantity: number; unit: string; rate: number; gst_rate: number; taxable?: number; cgst?: number; sgst?: number; igst?: number }
export interface InvoicePayment { id: number; paid_on: string; amount: number; tds: number; method: string | null; reference: string | null; transaction_id: number | null; created_by_name: string | null }
export interface Party {
  legal_name?: string; name?: string; code?: string | null; gstin: string | null; pan?: string | null; address_line: string | null; city: string | null; state: string | null; state_code: string | null; postal_code: string | null;
  email?: string | null; phone?: string | null; bank_name?: string | null; bank_account?: string | null; bank_ifsc?: string | null; terms?: string | null; signatory?: string | null;
  bank_branch?: string | null; bank_address?: string | null; bank_account_name?: string | null; footer_note?: string | null;
}
export interface Invoice {
  id: number; number: string | null; client_id: number; client_name: string | null; po_id: number | null; po_number: string | null; po_date: string | null;
  project_id: number | null; project_name: string | null; build_order_id: number | null; build_order_code: string | null;
  invoice_date: string; due_date: string; supply_type: 'INTRA' | 'INTER' | null; place_of_supply: string | null;
  taxable: number; cgst: number; sgst: number; igst: number; round_off: number; total: number; paid: number; tds: number; balance: number;
  status: InvoiceStatus; overdue: boolean; days_overdue: number; notes: string | null; seller: Party | null; buyer: Party | null;
  consignee: string | null; delivery_note: string | null; delivery_note_date: string | null; reference_no: string | null; reference_date: string | null;
  despatch_doc_no: string | null; mode_of_payment: string | null; despatch_through: string | null; destination: string | null; terms_of_delivery: string | null;
  issued_at: string | null; issued_by_name: string | null; cancel_reason: string | null; cancelled_at: string | null; cancelled_by_name: string | null; created_by_name: string | null; created_at: string;
  lines: InvoiceLine[]; payments: InvoicePayment[];
}
export interface ClientOwing { client_id: number; billed: number; received: number; outstanding: number; overdue: number; overdue_count: number; open_pos: number }
export interface InvoiceSummary { rows: ClientOwing[]; totals: { billed: number; received: number; outstanding: number; overdue: number; overdue_count: number } }
export interface CompanyProfile {
  legal_name: string; gstin: string; pan: string; address_line: string; city: string; state: string; postal_code: string; email: string; phone: string;
  bank_name: string; bank_account: string; bank_ifsc: string; bank_branch: string; bank_address: string; bank_account_name: string; terms: string; signatory: string;
  footer_note: string; logo: string; configured: boolean; state_code: string | null;
}

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  DRAFT: { label: 'Draft', tone: 'muted' }, ISSUED: { label: 'Issued', tone: 'info' }, PART_PAID: { label: 'Part paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' }, CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
export const PO_STATUS: Record<PoStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  OPEN: { label: 'Open', tone: 'success' }, CLOSED: { label: 'Closed', tone: 'muted' }, CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export function useClientPos(enabled = true) {
  return useQuery({ queryKey: [KEY, 'pos'], queryFn: () => get<ClientPo[]>('/client-pos'), enabled, staleTime: 0 });
}
export function useClientPo(id: number | null) {
  return useQuery({ queryKey: [KEY, 'po', id], queryFn: () => get<ClientPo>(`/client-pos/${id}`), enabled: id != null, staleTime: 0 });
}
export function useInvoices(enabled = true) {
  return useQuery({ queryKey: [KEY, 'list'], queryFn: () => get<Invoice[]>('/invoices'), enabled, staleTime: 0 });
}
export function useInvoice(id: number | null) {
  return useQuery({ queryKey: [KEY, 'one', id], queryFn: () => get<Invoice>(`/invoices/${id}`), enabled: id != null, staleTime: 0 });
}
export function useInvoiceSummary(enabled = true) {
  return useQuery({ queryKey: [KEY, 'summary'], queryFn: () => get<InvoiceSummary>('/invoices/summary'), enabled, staleTime: 0 });
}
export interface Billing {
  contract_value: number | null; po_value: number; invoiced: number; to_invoice: number | null; invoiced_pct: number | null;
  received: number; outstanding: number; overdue: number; drafts: number;
  pos: { id: number; po_number: string; value: number; invoiced: number; status: PoStatus }[];
  invoices: { id: number; number: string | null; status: InvoiceStatus; invoice_date: string; taxable: number; total: number; balance: number; overdue: boolean }[];
}
// What one project or one order has been ordered, invoiced and paid
export function useBilling(kind: 'project' | 'order', id: number | null, enabled = true) {
  const q = kind === 'project' ? `projectId=${id}` : `buildOrderId=${id}`;
  return useQuery({ queryKey: [KEY, 'billing', kind, id], queryFn: () => get<Billing>(`/invoices/billing?${q}`), enabled: enabled && id != null, staleTime: 0 });
}
export function useCompanyProfile(enabled = true) {
  return useQuery({ queryKey: [KEY, 'company'], queryFn: () => get<CompanyProfile>('/company-profile'), enabled, staleTime: 60_000 });
}
