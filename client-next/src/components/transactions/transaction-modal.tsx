'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/auth-store';
import { useCategories, useClients, useProjects, useProducts, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { X, Eye, Trash2, UploadCloud, FileText, CheckCircle } from 'lucide-react';
import type { Transaction } from '@/lib/types';

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', GBP: '£', EUR: '€', INR: '₹' };

const LABEL = 'block text-[9px] font-bold text-juniper uppercase tracking-[0.1em] mb-1';
const INPUT =
  'w-full bg-white border border-casper/50 rounded-lg h-8 px-3 text-[12px] text-charcoal placeholder-charcoal/30 focus:ring-1 focus:ring-juniper focus:border-juniper outline-none transition-all';
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
  const [file, setFile] = useState<File | null>(null);
  const [fileRemoved, setFileRemoved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!open) return;
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
      setAmount(String(editing.amount || ''));
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
      setFile(null);
      setFileRemoved(false);
    }
  }, [open, editing]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); setFileRemoved(false); }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) { setFile(selected); setFileRemoved(false); }
  };

  const handleViewFile = () => {
    if (file) {
      window.open(URL.createObjectURL(file), '_blank');
    } else if (editing?.receipt_path) {
      window.open(editing.receipt_path, '_blank');
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFileRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!dateRecorded) {
      toast.error('Select a date');
      return;
    }
    setSaving(true);
    try {
      let receiptPath: string | null = (fileRemoved || !editing) ? null : (editing?.receipt_path || null);

      if (file) {
        const fd = new FormData();
        fd.append('receipt', file);
        const uploadRes = await api.post<{ filename: string }>('/receipts/upload', fd);
        receiptPath = (uploadRes as any).data?.filename || null;
      }

      const body = {
        type,
        amount: Number(amount),
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
    } catch {
      toast.error('Failed to save transaction');
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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[860px] w-[95vw] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="h-[52px] px-5 bg-juniper flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
              {isAdd ? (
                <><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></>
              ) : (
                <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
              )}
            </svg>
            <h2 className="text-white font-bold text-[12px] tracking-[0.2em] uppercase">
              {isAdd ? `Add New ${isExpense ? 'Expense' : 'Income'}` : `Edit ${isExpense ? 'Expense' : 'Income'}`}
            </h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors rounded p-1 hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="pt-3 px-6 pb-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">

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
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/30 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/30 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/30 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/30 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>

            {/* Detail — full width */}
            <div className="col-span-2">
              <label className={LABEL}>Detail</label>
              <input
                className={INPUT}
                type="text"
                placeholder="Enter full description and justification..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Date */}
            <div>
              <label className={LABEL}>Date of {isExpense ? 'Expense' : 'Income'}</label>
              <input
                className={INPUT}
                type="date"
                value={dateRecorded}
                onChange={(e) => setDateRecorded(e.target.value)}
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
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/30 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>

            {/* Reference No */}
            <div>
              <label className={LABEL}>Reference No</label>
              <input
                className={INPUT}
                type="text"
                placeholder="INV-0000 / REC-0000"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
              />
            </div>

            {/* Amount */}
            <div>
              <label className={LABEL}>Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/50 font-bold text-sm select-none">
                  {currencySymbol}
                </span>
                <input
                  className={INPUT + ' pl-7 font-bold'}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

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
                className={`border-2 border-dashed rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer transition-all group ${dragging ? 'border-juniper bg-white' : 'border-casper/50 bg-white hover:border-juniper'}`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
              >
                <UploadCloud className={`w-7 h-7 shrink-0 transition-colors ${dragging ? 'text-juniper' : 'text-casper group-hover:text-juniper'}`} />
                <div>
                  <p className="text-[12px] text-charcoal/50 font-medium">
                    Drag & drop or{' '}
                    <span className="text-juniper font-bold">browse files</span>
                  </p>
                  <p className="text-[10px] text-charcoal/30 uppercase tracking-tight">PDF, JPG, PNG · max 10 MB</p>
                </div>
              </div>
              {/* File card — visible when file exists */}
              {hasFile && (
                <div className="mt-2 bg-white border border-casper/40 rounded-lg px-3 py-2 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#F0F4F5] p-1.5 rounded border border-casper/30">
                      <FileText className="text-juniper w-5 h-5" />
                    </div>
                    <div className="leading-tight">
                      <p className="text-[12px] font-bold text-charcoal truncate max-w-[280px]">{fileName}</p>
                      {fileSize && <p className="text-[10px] text-charcoal/40 uppercase tracking-tighter">{fileSize}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleViewFile}
                      className="h-8 px-3 bg-white hover:bg-green-50 border border-casper rounded flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
                    >
                      <Eye className="w-3.5 h-3.5 text-green-600" /> View
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="h-8 px-3 bg-white hover:bg-red-50 border border-casper rounded flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" /> Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-casper/20 flex items-center justify-end gap-6">
            <button
              type="button"
              onClick={onClose}
              className="text-[12px] font-bold text-charcoal/40 hover:text-charcoal transition-colors tracking-wide uppercase"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-juniper hover:brightness-110 disabled:opacity-60 text-white px-8 h-10 rounded-lg flex items-center gap-2 text-[12px] font-bold shadow-lg shadow-juniper/20 transition-all uppercase tracking-widest"
            >
              {editing ? `Update ${isExpense ? 'Expense' : 'Income'}` : `Submit ${isExpense ? 'Expense' : 'Income'}`}
              <CheckCircle className="w-4 h-4 text-white/80" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
