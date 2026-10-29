'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useCategories, useCategoryTypes, useProjects, useProducts, useInvalidate } from '@/hooks/use-queries';
import api, { getAccessToken, API_BASE } from '@/lib/api-client';
import { CURRENCY_SYMBOL, toLocalYMD, parseApiDate, parseOcrDate } from '@/lib/currency';
import { toast } from 'sonner';
import { Plus, Pencil, Eye, Trash2, FileText, Sparkles } from 'lucide-react';
import type { Transaction } from '@/lib/types';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect, CurrencyInput, inp } from '@/components/shared/modal-primitives';
import { TypeCategoryFields } from '@/components/shared/type-category-fields';
import { InlineAlert } from '@/components/shared/inline-alert';
import { StatusBadge } from '@/components/shared/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FileDropzone } from '@/components/shared/file-dropzone';
import { GstRateSelect, GstIncludedSwitch } from '@/components/shared/gst-fields';
import { computeTotalAmount, restoreEnteredAmount, amountLabel } from '@/lib/gst';

const sanitizeText = (v: unknown): string => {
  if (typeof v !== 'string') return '';
  return v.replace(/<[^>]*>/g, '').trim().slice(0, 500);
};



interface TransactionModalProps {
  open: boolean;
  onClose: () => void;
  type: 'expense' | 'income';
  editing?: Transaction | null;
  onSaved?: () => void;
}

// New entries start with the GST rate the user last saved (0% the first time), instead of a fixed rate
const LAST_GST_KEY = 'ems-last-gst-rate';
function lastGstRate() {
  try { return localStorage.getItem(LAST_GST_KEY) || '0%'; } catch { return '0%'; }
}
function rememberGstRate(rate: string) {
  try { localStorage.setItem(LAST_GST_KEY, rate); } catch { /* storage unavailable */ }
}

export function TransactionModal({ open, onClose, type, editing, onSaved }: TransactionModalProps) {
  const currency = useAuthStore((s) => s.user?.currency || 'INR');
  const currencySymbol = CURRENCY_SYMBOL[currency] || '₹';
  const { data: allCategories } = useCategories();
  const invalidate = useInvalidate();
  const isExpense = type === 'expense';

  const [clientId, setClientId] = useState('');
  const [contextType, setContextType] = useState('project');
  const [codeId, setCodeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [dateRecorded, setDateRecorded] = useState(toLocalYMD());
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState('0%');
  const [gstAdded, setGstAdded] = useState(true);
  const [needsReimbursement, setNeedsReimbursement] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileRemoved, setFileRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [budgetWarning, setBudgetWarning] = useState<{ remaining: number; after_this_expense: number; allocated: number; will_exceed: boolean } | null>(null);
  const [dupCheckFailed, setDupCheckFailed] = useState(false);
  const [dupWarning, setDupWarning] = useState<{ hardBlock: boolean; softWarn: boolean; matches: any[] } | null>(null);

  // Budget warning: check remaining budget when expense amount + category + date are filled
  useEffect(() => {
    setBudgetWarning(null);
    if (type !== 'expense' || !categoryId || !amount || isNaN(Number(amount)) || Number(amount) <= 0 || !dateRecorded) return;
    const d = parseApiDate(dateRecorded);
    if (!d) return;
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

  const { data: projects } = useProjects();
  const { data: products } = useProducts();
  const { data: categoryTypes } = useCategoryTypes(type);

  const filteredCategories = (allCategories || []).filter((c) => c.type === type);

  // The entry is charged to a project or product by name; the client is whichever client that belongs to
  const named = contextType === 'project' ? (projects || []) : contextType === 'product' ? (products || []) : [];
  const nameCount = new Map<string, number>();
  for (const p of named) nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1);
  const codeOptions = named.map((p) => ({
    id: String(p.id),
    // Names are unique per client, so add the client only where two share a name
    label: (nameCount.get(p.name) ?? 0) > 1 && p.client_name ? `${p.name} (${p.client_name})` : p.name,
  }));
  const chosen = named.find((p) => String(p.id) === codeId);
  const effectiveClientId = chosen?.client_id ?? (clientId ? Number(clientId) : null);


  useEffect(() => {
    if (!open) {
      // Reset transient state when modal closes so stale data never shows on reopen
      setOcrLoading(false);
      setSaving(false);
      setDupWarning(null);
      setDupCheckFailed(false);
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
      setTypeId(String((allCategories || []).find((c) => c.id === editing.category_id)?.type_id ?? ''));
      setDescription(editing.description || '');
      setDateRecorded(editing.date_recorded?.split('T')[0] || toLocalYMD());
      setPaymentMethod(editing.payment_method || 'cash');
      setReceiptNumber(editing.receipt_number || '');
      const editGstIncluded = editing.gst_included ?? false;
      setGstRate(editing.gst_rate != null ? `${Number(editing.gst_rate)}%` : '');
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
      setTypeId('');
      setDescription('');
      setDateRecorded(toLocalYMD());
      setPaymentMethod('cash');
      setReceiptNumber('');
      setAmount('');
      setGstRate(lastGstRate());
      setGstAdded(true);
      setNeedsReimbursement(false);
      setFile(null);
      setFileRemoved(false);
    }
  }, [open, editing]);

  const runOcr = useCallback(async (f: File) => {
    setOcrLoading(true);
    try {
      const fd = new FormData();
      fd.append('receipt', f);
      const res = await api.post<any>('/receipts/ocr', fd);
      const ocr = (res as any).data ?? res;

      if (ocr.amount) setAmount(String(Number(ocr.amount) || ''));
      if (ocr.date) {
        // Parse OCR date (DD/MM/YYYY, YYYY-MM-DD, or free-form) into YYYY-MM-DD
        const iso = parseOcrDate(sanitizeText(ocr.date));
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
        if (match) { setCategoryId(String(match.id)); setTypeId(String(match.type_id ?? '')); }
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

  const handleFile = (f: File) => { setFile(f); setFileRemoved(false); runOcr(f); };

  const handleViewFile = async () => {
    if (file) {
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else if (editing?.receipt_path) {
      try {
        const token = getAccessToken();
        const res = await fetch(`${API_BASE}/receipts/${editing.receipt_path}`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) { toast.error('Failed to open receipt'); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch {
        toast.error('Failed to open receipt');
      }
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFileRemoved(true);
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
        // Do not silently skip the check: warn once, and let a second Save go through
        if (!dupCheckFailed) {
          setDupCheckFailed(true);
          toast.warning("Couldn't check for duplicates. Click Save again to save anyway.");
          return;
        }
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
        clientId: effectiveClientId,
        projectId: contextType === 'project' && codeId ? Number(codeId) : null,
        productId: contextType === 'product' && codeId ? Number(codeId) : null,
        contextType: contextType || null,
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
      if (gstRate) rememberGstRate(gstRate);
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
  const isAdd = !editing;

  return (
    <ModuleModal
      isOpen={open}
      onClose={onClose}
      title={isAdd ? `Add New ${isExpense ? 'Expense' : 'Income'}` : `Edit ${isExpense ? 'Expense' : 'Income'}`}
      icon={editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={() => handleSave()}
      canSave={!!amount && !isNaN(Number(amount)) && Number(amount) > 0 && !!dateRecorded}
      saveLabel={editing ? `Update ${isExpense ? 'Expense' : 'Income'}` : `Add ${isExpense ? 'Expense' : 'Income'}`}
      size="xl"
    >
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 md:grid-cols-3">

        {/* Column 1: what it is charged to, and how it is classified */}
        <div className="space-y-3">
          <Field label="Charge To">
            <NativeSelect
              value={contextType}
              onChange={(e) => { setContextType(e.target.value); setCodeId(''); }}
            >
              <option value="">Select...</option>
              <option value="project">Project</option>
              <option value="product">Product</option>
            </NativeSelect>
          </Field>

          <Field label={contextType === 'product' ? 'Product' : contextType === 'project' ? 'Project' : 'Project / Product'} hint={chosen?.client_name ? `Client: ${chosen.client_name}` : undefined}>
            <NativeSelect
              value={codeId}
              onChange={(e) => setCodeId(e.target.value)}
              disabled={!contextType}
            >
              <option value="">{contextType === 'product' ? 'Select product...' : contextType === 'project' ? 'Select project...' : 'Select...'}</option>
              {codeOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </NativeSelect>
          </Field>

          <TypeCategoryFields
            typeLabel={isExpense ? 'Expense Type' : 'Income Type'}
            categoryLabel={isExpense ? 'Expense Category' : 'Income Category'}
            types={categoryTypes || []}
            categories={filteredCategories}
            typeId={typeId}
            category={categoryId}
            categoryBy="id"
            onChange={(v) => { setTypeId(v.typeId); setCategoryId(v.category); }}
            typeEmptyHint="No types yet. An admin can add them with Category."
            categoryEmptyHint="No categories for this type yet. An admin can add them with Category."
          />
        </div>

        {/* Column 2: the entry, and the proof */}
        <div className="space-y-3">
          <Field label="Detail">
            <Input
              className={`${inp} border-input bg-transparent text-[var(--shell-text)]`}
              type="text"
              placeholder="Enter full description and justification..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <Field label={`Date of ${isExpense ? 'Expense' : 'Income'}`} required>
            <Input
              className={`${inp} border-input bg-transparent text-[var(--shell-text)]`}
              type="date"
              value={dateRecorded}
              onChange={(e) => setDateRecorded(e.target.value)}
            />
          </Field>

        {/* Receipt upload */}
        <div className="space-y-1.5">
          <FileDropzone
            label="Receipt upload"
            onFile={handleFile}
            busy={ocrLoading}
            busyTitle={<><Sparkles aria-hidden className="h-3 w-3" /> Extracting data from receipt...</>}
            busyHint="Fields will be auto-filled shortly"
          />

          {/* File card: visible when a file exists */}
          {hasFile && (
            <div className="rounded-lg border mt-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--shell-border)] px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="bg-[var(--shell-border)] rounded-md border border-[var(--shell-border)] p-1.5">
                  <FileText aria-hidden className="h-5 w-5 text-[var(--shell-accent)]" />
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="max-w-[280px] truncate text-[12px] font-semibold text-[var(--shell-text)]">{fileName}</p>
                  {fileSize && <p className="text-[12px] text-[var(--shell-text-muted)]">{fileSize}</p>}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={handleViewFile}
                  className="rounded-lg border flex h-10 items-center gap-1.5 rounded-md border border-[var(--shell-border)] px-3 text-[12px] font-semibold transition-colors hover:border-[var(--shell-accent)] sm:h-8"
                >
                  <Eye aria-hidden className="h-3.5 w-3.5 text-[var(--success)]" /> View
                </button>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="rounded-lg border flex h-10 items-center gap-1.5 rounded-md border border-[var(--shell-border)] px-3 text-[12px] font-semibold transition-colors hover:border-[var(--danger)] sm:h-8"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5 text-[var(--danger)]" /> Remove
                </button>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Column 3: payment and money */}
        <div className="space-y-3">
          <Field label="Payment Method">
            <NativeSelect value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
            </NativeSelect>
          </Field>

          <Field label="Reference No">
            <Input
              className={`${inp} border-input bg-transparent text-[var(--shell-text)]`}
              type="text"
              placeholder="INV-0000 / REC-0000"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
            />
          </Field>

          <Field label="GST & Inclusion">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <GstRateSelect value={gstRate} onChange={setGstRate} emptyLabel="Select GST..." />
              </div>
              <GstIncludedSwitch checked={gstAdded} onChange={setGstAdded} />
            </div>
          </Field>

          <Field label={`Amount ${amountLabel(gstRate, gstAdded)}`} required>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <CurrencyInput value={amount} onChange={setAmount} symbol={currencySymbol} />
              </div>
              {isExpense && (
                <label className="flex h-10 w-[124px] shrink-0 cursor-pointer items-center gap-2.5 text-[12px] font-semibold text-[var(--shell-text-muted)]">
                  <Switch checked={needsReimbursement} onCheckedChange={setNeedsReimbursement} aria-label="Needs reimbursement" />
                  <span className="whitespace-nowrap">{needsReimbursement ? 'Reimburse' : 'No reimburse'}</span>
                </label>
              )}
            </div>
          </Field>
        </div>

        {/* Budget warning: expense only */}
        {isExpense && budgetWarning && (
          <InlineAlert className="md:col-span-3" tone={budgetWarning.will_exceed ? 'danger' : 'tip'}>
            {budgetWarning.will_exceed
              ? <>This expense <strong>exceeds</strong> the budget by <strong>{Math.abs(budgetWarning.after_this_expense).toLocaleString()}</strong>. Budget allocated: {budgetWarning.allocated.toLocaleString()} · Remaining: {budgetWarning.remaining.toLocaleString()}.</>
              : <>Budget remaining after this expense: <strong>{budgetWarning.after_this_expense.toLocaleString()}</strong> (of {budgetWarning.allocated.toLocaleString()} allocated).</>
            }
          </InlineAlert>
        )}

        {/* Duplicate warning */}
        {dupWarning && (
          <InlineAlert
            className="md:col-span-3"
            tone={dupWarning.hardBlock ? 'danger' : 'warning'}
            title={dupWarning.hardBlock
              ? 'Exact duplicate detected — change amount, category, or date to proceed.'
              : 'Similar transaction found nearby — please review before saving.'}
            actions={!dupWarning.hardBlock && (
              <>
                <Button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="h-9 px-3 text-[12px] font-semibold"
                  style={{ background: 'var(--warning)', color: 'var(--warning-foreground)' }}
                >
                  Save anyway
                </Button>
                <Button type="button" variant="ghost" onClick={() => setDupWarning(null)} className="h-9 px-3 text-[12px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>
                  Cancel
                </Button>
              </>
            )}
          >
            <ul className="space-y-1.5">
              {dupWarning.matches.slice(0, 3).map((m: any) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--shell-text-muted)]">
                  <span className="font-semibold text-[var(--info)]">{m.reference_id || `#${m.id}`}</span>
                  <span>{m.category_name || '—'}</span>
                  <span className="font-semibold">{Number(m.net_amount ?? m.amount).toLocaleString()}</span>
                  <span>{m.date_recorded?.slice(0, 10)}</span>
                  <StatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          </InlineAlert>
        )}

      </div>
    </ModuleModal>
  );
}
