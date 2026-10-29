'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useCategories, useClients, useProjects, useProducts, useInvalidate } from '@/hooks/use-queries';
import api, { getAccessToken, API_BASE } from '@/lib/api-client';
import { CURRENCY_SYMBOL, toLocalYMD, parseApiDate, parseOcrDate } from '@/lib/currency';
import { toast } from 'sonner';
import { Plus, Pencil, Eye, Trash2, UploadCloud, FileText, Loader2, Sparkles } from 'lucide-react';
import type { Transaction } from '@/lib/types';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect, CurrencyInput, inp } from '@/components/shared/modal-primitives';
import { FormGrid } from '@/components/shared/form-grid';
import { InlineAlert } from '@/components/shared/inline-alert';
import { StatusBadge } from '@/components/shared/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { computeTotalAmount, restoreEnteredAmount, amountLabel, GST_RATES } from '@/lib/gst';

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
  const { data: clients } = useClients();
  const invalidate = useInvalidate();
  const isExpense = type === 'expense';

  const [clientId, setClientId] = useState('');
  const [contextType, setContextType] = useState('project');
  const [codeId, setCodeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
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
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [budgetWarning, setBudgetWarning] = useState<{ remaining: number; after_this_expense: number; allocated: number; will_exceed: boolean } | null>(null);
  const [dupCheckFailed, setDupCheckFailed] = useState(false);
  const [dupWarning, setDupWarning] = useState<{ hardBlock: boolean; softWarn: boolean; matches: any[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const clientIdNum = clientId ? Number(clientId) : undefined;
  const { data: projects } = useProjects(clientIdNum);
  const { data: products } = useProducts(clientIdNum);

  const filteredCategories = (allCategories || []).filter((c) => c.type === type);

  // Codes belong to a client, so offer none until a client is chosen
  const codeOptions = !clientId ? [] :
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
      setDescription(editing.description || '');
      setDateRecorded(editing.date_recorded?.split('T')[0] || toLocalYMD());
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
        clientId: clientId ? Number(clientId) : null,
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
      saveLabel={editing ? `Update ${isExpense ? 'Expense' : 'Income'}` : `Add ${isExpense ? 'Expense' : 'Income'}`}
      size="lg"
    >
      <FormGrid className="gap-x-4 gap-y-3">
        <Field label="Client">
          <NativeSelect
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setCodeId(''); }}
          >
            <option value="">Select client...</option>
            {(clients || [])
              .filter((c) => c.is_active || String(c.id) === clientId) // keep an inactive client that an existing entry already uses
              .map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
          </NativeSelect>
        </Field>

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

        <Field label="Code" hint={!clientId ? 'Choose a client first' : undefined}>
          <NativeSelect
            value={codeId}
            onChange={(e) => setCodeId(e.target.value)}
            disabled={!contextType || !clientId}
          >
            <option value="">Select code...</option>
            {codeOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </NativeSelect>
        </Field>

        <Field label={isExpense ? 'Expense Category' : 'Income Category'}>
          <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select category...</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Detail">
          <Input
            className={`${inp} border-input bg-transparent text-[var(--shell-text)]`}
            type="text"
            placeholder="Enter full description and justification..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field label="Payment Method">
          <NativeSelect value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
          </NativeSelect>
        </Field>

        <Field label={`Reference No${isExpense ? ' & Reimburse' : ''}`}>
          <div className="flex items-center gap-2">
            <Input
              className={`${inp} border-input bg-transparent text-[var(--shell-text)] min-w-0 flex-1`}
              type="text"
              placeholder="INV-0000 / REC-0000"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
            />
            {isExpense && (
              <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 text-[11px] font-semibold text-[var(--shell-text-muted)]">
                <Switch checked={needsReimbursement} onCheckedChange={setNeedsReimbursement} aria-label="Needs reimbursement" />
                <span className="whitespace-nowrap">{needsReimbursement ? 'Reimburse' : 'No reimburse'}</span>
              </label>
            )}
          </div>
        </Field>

        <Field label={`Date of ${isExpense ? 'Expense' : 'Income'}`}>
          <Input
            className={`${inp} border-input bg-transparent text-[var(--shell-text)]`}
            type="date"
            value={dateRecorded}
            onChange={(e) => setDateRecorded(e.target.value)}
          />
        </Field>

        {/* GST rate + inclusion switch | Amount: final row */}
        <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:col-span-2 sm:grid-cols-2">
          <Field label="GST & Inclusion">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <NativeSelect value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
                  <option value="">Select GST...</option>
                  {GST_RATES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </NativeSelect>
              </div>
              <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 text-[11px] font-semibold text-[var(--shell-text-muted)]">
                <Switch checked={gstAdded} onCheckedChange={setGstAdded} aria-label="GST included in amount" />
                <span className="whitespace-nowrap">{gstAdded ? 'Included' : 'Not included'}</span>
              </label>
            </div>
          </Field>

          <Field label={`Amount ${amountLabel(gstRate, gstAdded)}`}>
            <CurrencyInput value={amount} onChange={setAmount} symbol={currencySymbol} />
          </Field>
        </div>

        {/* Budget warning: expense only */}
        {isExpense && budgetWarning && (
          <InlineAlert className="sm:col-span-2" tone={budgetWarning.will_exceed ? 'danger' : 'tip'}>
            {budgetWarning.will_exceed
              ? <>This expense <strong>exceeds</strong> the budget by <strong>{Math.abs(budgetWarning.after_this_expense).toLocaleString()}</strong>. Budget allocated: {budgetWarning.allocated.toLocaleString()} · Remaining: {budgetWarning.remaining.toLocaleString()}.</>
              : <>Budget remaining after this expense: <strong>{budgetWarning.after_this_expense.toLocaleString()}</strong> (of {budgetWarning.allocated.toLocaleString()} allocated).</>
            }
          </InlineAlert>
        )}

        {/* Duplicate warning */}
        {dupWarning && (
          <InlineAlert
            className="sm:col-span-2"
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
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--shell-text-muted)]">
                  <span className="font-bold text-[var(--info)]">{m.reference_id || `#${m.id}`}</span>
                  <span>{m.category_name || '—'}</span>
                  <span className="font-semibold">{Number(m.net_amount ?? m.amount).toLocaleString()}</span>
                  <span>{m.date_recorded?.slice(0, 10)}</span>
                  <StatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          </InlineAlert>
        )}

        {/* Receipt upload */}
        <div className="space-y-1.5 sm:col-span-2">
          <p id="receipt-upload-label" className="text-[13px] font-medium" style={{ color: "var(--shell-text)" }}>Receipt Upload</p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            tabIndex={-1}
            aria-hidden
            onChange={handleFileChange}
          />
          {/* A real button, so the drop zone is reachable by keyboard (Enter / Space opens the file picker) */}
          <button
            type="button"
            aria-labelledby="receipt-upload-label"
            aria-busy={ocrLoading}
            className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-left transition-colors rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-accent)] ${dragging ? 'border-[var(--shell-accent)]' : 'border-[var(--shell-border)] hover:border-[var(--shell-accent)]'}`}
            onClick={() => !ocrLoading && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
          >
            {ocrLoading
              ? <Loader2 aria-hidden className="h-7 w-7 shrink-0 animate-spin text-[var(--shell-accent)]" />
              : <UploadCloud aria-hidden className={`h-7 w-7 shrink-0 transition-colors ${dragging ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-muted)] group-hover:text-[var(--shell-accent)]'}`} />
            }
            <span>
              {ocrLoading
                ? <>
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--shell-accent)]">
                      <Sparkles aria-hidden className="h-3 w-3" /> Extracting data from receipt...
                    </span>
                    <span className="block text-[11px] text-[var(--shell-text-muted)]">Fields will be auto-filled shortly</span>
                  </>
                : <>
                    <span className="block text-[12px] font-medium text-[var(--shell-text-muted)]">
                      Drag &amp; drop or <span className="font-bold text-[var(--shell-accent)]">browse files</span>
                    </span>
                    <span className="block text-[11px] text-[var(--shell-text-muted)]">PDF, JPG, PNG, WebP · max 10 MB</span>
                  </>
              }
            </span>
          </button>

          {/* File card: visible when a file exists */}
          {hasFile && (
            <div className="rounded-lg border mt-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--shell-border)] px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="bg-[var(--shell-border)] rounded border border-[var(--shell-border)] p-1.5">
                  <FileText aria-hidden className="h-5 w-5 text-[var(--shell-accent)]" />
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="max-w-[280px] truncate text-[12px] font-bold text-[var(--shell-text)]">{fileName}</p>
                  {fileSize && <p className="text-[11px] text-[var(--shell-text-muted)]">{fileSize}</p>}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={handleViewFile}
                  className="rounded-lg border flex h-10 items-center gap-1.5 rounded border border-[var(--shell-border)] px-3 text-[11px] font-bold transition-colors hover:border-[var(--shell-accent)] sm:h-8"
                >
                  <Eye aria-hidden className="h-3.5 w-3.5 text-[var(--success)]" /> View
                </button>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="rounded-lg border flex h-10 items-center gap-1.5 rounded border border-[var(--shell-border)] px-3 text-[11px] font-bold transition-colors hover:border-[var(--danger)] sm:h-8"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5 text-[var(--danger)]" /> Remove
                </button>
              </div>
            </div>
          )}
        </div>
      </FormGrid>
    </ModuleModal>
  );
}
