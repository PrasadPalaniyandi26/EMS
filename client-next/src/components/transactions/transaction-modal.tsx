'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useCategories, useClients, useProjects, useProducts, useInvalidate } from '@/hooks/use-queries';
import api, { getAccessToken } from '@/lib/api-client';
import { CURRENCY_SYMBOL } from '@/lib/currency';
import { toast } from 'sonner';
import { Plus, Pencil, Eye, Trash2, UploadCloud, FileText, Loader2, Sparkles } from 'lucide-react';
import type { Transaction } from '@/lib/types';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { CurrencyInput } from '@/components/shared/modal-primitives';
import { computeTotalAmount, restoreEnteredAmount, amountLabel } from '@/lib/gst';

const GST_RATES = ['6%', '9%', '12%', '18%'];

const sanitizeText = (v: unknown): string => {
  if (typeof v !== 'string') return '';
  return v.replace(/<[^>]*>/g, '').trim().slice(0, 500);
};



const LABEL = 'block text-[10px] font-bold modal-label mb-1';
const INPUT =
  'w-full modal-input border border-[var(--shell-border)] rounded-lg h-10 px-3 text-sm text-[var(--shell-text)] placeholder:text-[var(--shell-text-muted)] focus:ring-1 focus:ring-[var(--shell-accent)]/50 focus:border-[var(--shell-accent)]/50 outline-none transition-all';
const SELECT = INPUT + ' appearance-none pr-8 cursor-pointer';

interface TransactionModalProps {
  open: boolean;
  onClose: () => void;
  type: 'expense' | 'income';
  editing?: Transaction | null;
  onSaved?: () => void;
}

export function TransactionModal({ open, onClose, type, editing, onSaved }: TransactionModalProps) {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const currencySymbol = CURRENCY_SYMBOL[currency] || '₹';
  const { data: allCategories } = useCategories();
  const { data: clients } = useClients();
  const invalidate = useInvalidate();

  const [clientId, setClientId] = useState('');
  const [contextType, setContextType] = useState('project');
  const [codeId, setCodeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [dateRecorded, setDateRecorded] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState('');
  const [gstAdded, setGstAdded] = useState(false);
  const [needsReimbursement, setNeedsReimbursement] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileRemoved, setFileRemoved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [budgetWarning, setBudgetWarning] = useState<{ remaining: number; after_this_expense: number; allocated: number; will_exceed: boolean } | null>(null);
  const [dupWarning, setDupWarning] = useState<{ hardBlock: boolean; softWarn: boolean; matches: any[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Budget warning: check remaining budget when expense amount + category + date are filled
  useEffect(() => {
    setBudgetWarning(null);
    if (type !== 'expense' || !categoryId || !amount || isNaN(Number(amount)) || Number(amount) <= 0 || !dateRecorded) return;
    const d = new Date(dateRecorded);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const qs = new URLSearchParams({ categoryId, amount, month: String(month), year: String(year) }).toString();
    const timer = setTimeout(() => {
      api.get(`/budgets/check?${qs}`).then((r: any) => {
        const data = r.data ?? r;
        if (data?.has_budget) setBudgetWarning(data);
        else setBudgetWarning(null);
      }).catch(() => setBudgetWarning(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [type, categoryId, amount, dateRecorded]); // eslint-disable-line react-hooks/exhaustive-deps

  const clientIdNum = clientId ? Number(clientId) : undefined;
  const { data: projects } = useProjects(clientIdNum);
  const { data: products } = useProducts(clientIdNum);

  const filteredCategories = (allCategories || []).filter((c) => c.type === type);

  const codeOptions =
    contextType === 'project'
      ? (projects || []).map((p) => ({ id: String(p.id), label: p.code || p.name }))
      : contextType === 'product'
        ? (products || []).map((p) => ({ id: String(p.id), label: p.code || p.name }))
        : [];

  useEffect(() => {
    if (!open) {
      // Reset transient state when modal closes so stale data never shows on reopen
      setOcrLoading(false);
      setSaving(false);
      setDupWarning(null);
      return;
    }
    if (editing) {
      setClientId(editing.client_id ? String(editing.client_id) : '');
      setContextType(editing.context_type || '');
      setCodeId(
        editing.context_type === 'project'
          ? editing.project_id ? String(editing.project_id) : ''
          : editing.context_type === 'product'
            ? editing.product_id ? String(editing.product_id) : ''
            : '',
      );
      setCategoryId(editing.category_id ? String(editing.category_id) : '');
      setDescription(editing.description || '');
      setDateRecorded(editing.date_recorded?.split('T')[0] || new Date().toISOString().split('T')[0]);
      setPaymentMethod(editing.payment_method || 'cash');
      setReceiptNumber(editing.receipt_number || '');
      const editGstIncluded = editing.gst_included ?? false;
      setGstRate(editing.gst_rate ? `${editing.gst_rate}%` : '');
      setGstAdded(editGstIncluded);
      setAmount(String(restoreEnteredAmount(editing.net_amount, editing.total_amount, editGstIncluded, editing.amount ?? 0)));
      setNeedsReimbursement(editing.needs_reimbursement ?? false);
      setFile(null);
      setFileRemoved(false);
    } else {
      setClientId('');
      setContextType('project');
      setCodeId('');
      setCategoryId('');
      setDescription('');
      setDateRecorded(new Date().toISOString().split('T')[0]);
      setPaymentMethod('cash');
      setReceiptNumber('');
      setAmount('');
      setGstRate('18%');
      setGstAdded(true);
      setNeedsReimbursement(false);
      setFile(null);
      setFileRemoved(false);
    }
  }, [open, editing]);

  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const MAX_SIZE_MB = 10;

  const validateFile = (f: File): boolean => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast.error('Invalid file type. Only PDF, JPG, PNG, and WEBP are allowed.');
      return false;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`);
      return false;
    }
    return true;
  };

  const runOcr = useCallback(async (f: File) => {
    setOcrLoading(true);
    try {
      const fd = new FormData();
      fd.append('receipt', f);
      const res = await api.post<any>('/receipts/ocr', fd);
      const ocr = (res as any).data ?? res;

      if (ocr.amount) setAmount(String(Number(ocr.amount) || ''));
      if (ocr.date) {
        // Parse OCR date (may be DD/MM/YYYY, MM-DD-YYYY, or free-form) into YYYY-MM-DD
        const parsed = new Date(sanitizeText(ocr.date));
        const iso = !isNaN(parsed.getTime())
          ? parsed.toISOString().split('T')[0]
          : '';
        if (iso) setDateRecorded(iso);
      }
      if (ocr.paymentMethod) setPaymentMethod(sanitizeText(ocr.paymentMethod));
      if (ocr.referenceNo) setReceiptNumber(sanitizeText(ocr.referenceNo));
      if (ocr.description) setDescription(sanitizeText(ocr.description));

      // Match OCR category keyword against loaded categories list
      if (ocr.category && filteredCategories.length > 0) {
        const match = filteredCategories.find(c =>
          c.name.toLowerCase().includes(ocr.category.toLowerCase()) ||
          ocr.category.toLowerCase().includes(c.name.toLowerCase())
        );
        if (match) setCategoryId(String(match.id));
      }

      const filled = [ocr.amount, ocr.date, ocr.paymentMethod, ocr.referenceNo, ocr.description, ocr.category].filter(Boolean).length;
      if (filled > 0) toast.success(`OCR: ${filled} field${filled > 1 ? 's' : ''} auto-filled`);
      else toast.info('OCR complete — no fields detected');
    } catch {
      toast.error('OCR extraction failed');
    } finally {
      setOcrLoading(false);
    }
  }, [filteredCategories]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && validateFile(dropped)) { setFile(dropped); setFileRemoved(false); runOcr(dropped); }
  }, [runOcr]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && validateFile(selected)) { setFile(selected); setFileRemoved(false); runOcr(selected); }
    e.target.value = '';
  };

  const handleViewFile = async () => {
    if (file) {
      window.open(URL.createObjectURL(file), '_blank');
    } else if (editing?.receipt_path) {
      try {
        const token = getAccessToken();
        const res = await fetch(`/api/v1/receipts/${editing.receipt_path}`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), '_blank');
      } catch {
        toast.error('Failed to open receipt');
      }
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFileRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (bypass = false) => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!dateRecorded) {
      toast.error('Select a date');
      return;
    }

    // Duplicate check — runs for both new and edit, skipped when bypassed
    if (!bypass) {
      try {
        const dupRes = await api.post<any>('/transactions/check-duplicates', {
          totalAmount: computeTotalAmount(Number(amount), gstRate, gstAdded),
          receiptNumber: receiptNumber?.trim() || undefined,
          projectId: contextType === 'project' && codeId ? Number(codeId) : undefined,
          dateRecorded,
          type,
          excludeId: editing ? editing.id : undefined,
        });
        const dup = (dupRes as any).data ?? dupRes;
        if (dup.hardBlock) {
          setDupWarning(dup);
          return;
        }
        if (dup.softWarn) {
          setDupWarning(dup);
          return;
        }
      } catch (e) {
        console.error('Duplicate check failed:', e);
      }
    }

    setSaving(true);
    try {
      let receiptPath: string | null = (fileRemoved || !editing) ? null : (editing?.receipt_path || null);

      if (file) {
        const fd = new FormData();
        fd.append('receipt', file);
        const uploadRes = await api.post<{ filename: string }>(`/receipts/upload${type === 'income' ? '?type=invoice' : ''}`, fd);
        receiptPath = (uploadRes as any).data?.filename || null;
      }

      const body = {
        type,
        amount: Number(amount),
        gstRate: gstRate ? Number(gstRate.replace('%', '')) : null,
        gstIncluded: gstAdded,
        dateRecorded,
        categoryId: categoryId ? Number(categoryId) : null,
        description,
        paymentMethod,
        receiptNumber: receiptNumber || null,
        clientId: clientId ? Number(clientId) : null,
        projectId: contextType === 'project' && codeId ? Number(codeId) : null,
        productId: contextType === 'product' && codeId ? Number(codeId) : null,
        contextType: contextType || 'project',
        receiptPath,
        needsReimbursement: isExpense ? needsReimbursement : false,
      };
      if (editing) {
        await api.put(`/transactions/${editing.id}`, body);
        toast.success('Transaction updated');
      } else {
        await api.post('/transactions', body);
        toast.success('Transaction created');
      }
      invalidate('transactions', 'dashboard');
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  const hasFile = file || (!fileRemoved && editing?.receipt_path);
  const fileName = file?.name || (editing?.receipt_path ? editing.receipt_path.split('/').pop() : '');
  const fileSize = file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '';
  const isExpense = type === 'expense';
  const isAdd = !editing;

  return (
    <ModuleModal
      isOpen={open}
      onClose={onClose}
      title={isAdd ? `Add New ${isExpense ? 'Expense' : 'Income'}` : `Edit ${isExpense ? 'Expense' : 'Income'}`}
      icon={editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={() => handleSave()}
      saveLabel={editing ? `Update ${isExpense ? 'Expense' : 'Income'}` : `Add ${isExpense ? 'Expense' : 'Income'}`}
      maxWidth="sm:max-w-[860px]"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">

        {/* Client */}
        <div>
          <label className={LABEL}>Client</label>
          <div className="relative">
            <select
              className={SELECT}
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setCodeId(''); }}
            >
              <option value="">Select client...</option>
              {(clients || []).map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>

        {/* Category (Project / Product) */}
        <div>
          <label className={LABEL}>Category</label>
          <div className="relative">
            <select
              className={SELECT}
              value={contextType}
              onChange={(e) => { setContextType(e.target.value); setCodeId(''); }}
            >
              <option value="">Select Category</option>
              <option value="project">Project</option>
              <option value="product">Product</option>
            </select>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>

        {/* Code */}
        <div>
          <label className={LABEL}>Code</label>
          <div className="relative">
            <select
              className={SELECT + (!contextType ? ' opacity-50 cursor-not-allowed' : '')}
              value={codeId}
              onChange={(e) => setCodeId(e.target.value)}
              disabled={!contextType}
            >
              <option value="">Select code...</option>
              {codeOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>

        {/* Expense / Income Category */}
        <div>
          <label className={LABEL}>{isExpense ? 'Expense Category' : 'Income Category'}</label>
          <div className="relative">
            <select
              className={SELECT}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Select category...</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>

        {/* Detail (single col) | Payment Method (second col) */}
        <div>
          <label className={LABEL}>Detail</label>
          <input
            className={INPUT}
            type="text"
            placeholder="Enter full description and justification..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Payment Method */}
        <div>
          <label className={LABEL}>Payment Method</label>
          <div className="relative">
            <select
              className={SELECT}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
            </select>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>

        {/* Reference No (narrowed) + Reimburse toggle (expense only) | Date */}
        <div>
          <label className={LABEL}>Reference No{isExpense ? ' & Reimburse' : ''}</label>
          <div className="flex items-center gap-2">
            <input
              className={`${INPUT} flex-1 min-w-0`}
              type="text"
              placeholder="INV-0000 / REC-0000"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
            />
            {isExpense && (
              <div className="flex items-center gap-1.5 h-10 shrink-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={needsReimbursement}
                  onClick={() => setNeedsReimbursement((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${needsReimbursement ? 'bg-[var(--shell-accent)]' : 'bg-[var(--shell-border)]'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform ${needsReimbursement ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase tracking-wide whitespace-nowrap">
                  {needsReimbursement ? 'Reimburse' : 'No Reimburse'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className={LABEL}>Date of {isExpense ? 'Expense' : 'Income'}</label>
          <input
            className={INPUT}
            type="date"
            value={dateRecorded}
            onChange={(e) => setDateRecorded(e.target.value)}
          />
        </div>

        {/* GST + Is GST Included (left col) | Amount (right col) — final row */}
        <div className="col-span-2 grid grid-cols-2 gap-x-4 items-end">
          {/* Left col: GST dropdown + toggle inline */}
          <div>
            <label className={LABEL}>GST &amp; Inclusion</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <select
                  className={SELECT}
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                >
                  <option value="">Select GST...</option>
                  {GST_RATES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
              </div>
              <div className="flex items-center gap-1.5 h-10 shrink-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={gstAdded}
                  onClick={() => setGstAdded((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${gstAdded ? 'bg-[var(--shell-accent)]' : 'bg-[var(--shell-border)]'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform ${gstAdded ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </button>
                <span className="text-[10px] font-bold text-[var(--shell-text-muted)] uppercase tracking-wide whitespace-nowrap">
                  {gstAdded ? 'Included' : 'Not Included'}
                </span>
              </div>
            </div>
          </div>

          {/* Right col: Amount */}
          <div>
            <label className={LABEL}>Amount {amountLabel(gstRate, gstAdded)}</label>
            <CurrencyInput
              value={amount}
              onChange={setAmount}
              symbol={currencySymbol}
            />
          </div>
        </div>

        {/* Budget Warning — full width, expense only */}
        {isExpense && budgetWarning && (
          <div className={`col-span-2 px-3 py-2.5 rounded-lg border text-[11px] font-medium flex items-start gap-2 ${budgetWarning.will_exceed ? 'bg-red-500/10 border-red-400/30 text-red-600 dark:text-red-300' : 'bg-amber-500/10 border-amber-400/30 text-amber-700 dark:text-amber-300'}`}>
            <span className="shrink-0 mt-0.5">{budgetWarning.will_exceed ? '⚠️' : '💡'}</span>
            <span>
              {budgetWarning.will_exceed
                ? <>This expense <strong>exceeds</strong> the budget by <strong>{Math.abs(budgetWarning.after_this_expense).toLocaleString()}</strong>. Budget allocated: {budgetWarning.allocated.toLocaleString()} · Remaining: {budgetWarning.remaining.toLocaleString()}.</>
                : <>Budget remaining after this expense: <strong>{budgetWarning.after_this_expense.toLocaleString()}</strong> (of {budgetWarning.allocated.toLocaleString()} allocated).</>
              }
            </span>
          </div>
        )}

        {/* Duplicate Warning — full width */}
        {dupWarning && (
          <div className={`col-span-2 rounded-lg border text-[11px] ${dupWarning.hardBlock ? 'bg-red-500/10 border-red-400/30' : 'bg-amber-500/10 border-amber-400/30'}`}>
            <div className={`flex items-center gap-2 px-3 py-2 font-bold ${dupWarning.hardBlock ? 'text-red-600 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
              <span>{dupWarning.hardBlock ? '🚫' : '⚠️'}</span>
              <span>{dupWarning.hardBlock ? 'Exact duplicate detected — change amount, category, or date to proceed.' : 'Similar transaction found nearby — please review before saving.'}</span>
            </div>
            <div className="px-3 pb-2 space-y-1">
              {dupWarning.matches.slice(0, 3).map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 text-[10.5px] text-[var(--shell-text-muted)]">
                  <span className="font-mono font-bold text-blue-400">{m.reference_id || `#${m.id}`}</span>
                  <span>{m.category_name || '—'}</span>
                  <span className="font-semibold">{Number(m.net_amount ?? m.amount).toLocaleString()}</span>
                  <span>{m.date_recorded?.slice(0, 10)}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                    style={{ background: 'var(--shell-hover)' }}>{m.status}</span>
                </div>
              ))}
            </div>
            {!dupWarning.hardBlock && (
              <div className="px-3 pb-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-60"
                >
                  Save Anyway
                </button>
                <button
                  type="button"
                  onClick={() => setDupWarning(null)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold hover:bg-[var(--shell-hover)] transition-colors text-[var(--shell-text-muted)]"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Receipt Upload — full width */}
        <div className="col-span-2">
          <label className={LABEL}>Receipt Upload</label>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
          />
          {/* Drop zone — always visible */}
          <div
            className={`border-2 border-dashed rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer transition-all group ${dragging ? 'border-[var(--shell-accent)]/50 modal-section' : 'border-[var(--shell-border)] modal-section hover:border-[var(--shell-accent)]/50'}`}
            onClick={() => !ocrLoading && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
          >
            {ocrLoading
              ? <Loader2 className="w-7 h-7 shrink-0 text-[var(--shell-accent)] animate-spin" />
              : <UploadCloud className={`w-7 h-7 shrink-0 transition-colors ${dragging ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-muted)] group-hover:text-[var(--shell-accent)]'}`} />
            }
            <div>
              {ocrLoading
                ? <>
                    <p className="text-[12px] text-[var(--shell-accent)] font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" /> Extracting data from receipt...
                    </p>
                    <p className="text-[10px] text-[var(--shell-text-muted)]">Fields will be auto-filled shortly</p>
                  </>
                : <>
                    <p className="text-[12px] text-[var(--shell-text-muted)] font-medium">
                      Drag & drop or{' '}
                      <span className="text-[var(--shell-accent)] font-bold">browse files</span>
                    </p>
                    <p className="text-[10px] text-[var(--shell-text-muted)] uppercase tracking-tight">PDF, JPG, PNG · max 10 MB</p>
                  </>
              }
            </div>
          </div>
          {/* File card — visible when file exists */}
          {hasFile && (
            <div className="mt-2 modal-section border border-[var(--shell-border)] rounded-lg px-3 py-2 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="modal-divider p-1.5 rounded border border-[var(--shell-border)]">
                  <FileText className="text-[var(--shell-accent)] w-5 h-5" />
                </div>
                <div className="leading-tight">
                  <p className="text-[12px] font-bold text-[var(--shell-text)] truncate max-w-[280px]">{fileName}</p>
                  {fileSize && <p className="text-[10px] text-[var(--shell-text-muted)] uppercase tracking-tighter">{fileSize}</p>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleViewFile}
                  className="h-8 px-3 modal-section border border-[var(--shell-border)] rounded flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
                >
                  <Eye className="w-3.5 h-3.5 text-green-600" /> View
                </button>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="h-8 px-3 modal-section border border-[var(--shell-border)] rounded flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" /> Remove
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModuleModal>
  );
}
