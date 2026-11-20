'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Ban, CreditCard, FileText, ImagePlus, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import api from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/currency';
import { money } from '@/lib/money';
import { INVOICE_GST_RATE, invoiceTotals, stateCodeOf, GST_RATES, GST_STATES, halfRate } from '@/lib/invoice-gst';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { CurrencyInput, Field, NativeSelect, inp } from '@/components/shared/modal-primitives';
import { FileDropzone } from '@/components/shared/file-dropzone';
import { useClients, useInvalidate, useProjects } from '@/hooks/use-queries';
import { useBuildOrders } from '@/hooks/use-build-orders';
import { useClientPos, useCompanyProfile, type ClientPo, type CompanyProfile, type Invoice } from '@/hooks/use-invoicing';

const ctl = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-[13px] text-[var(--shell-text)] outline-none focus-visible:border-[var(--shell-accent)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]';
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

interface Base { isOpen: boolean; onClose: () => void }

// Runs a save, says what happened, and refreshes the lists
function useSaver(onClose: () => void) {
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);
  const run = async (job: () => Promise<unknown>, done: string, after?: () => void) => {
    if (saving) return;
    setSaving(true);
    try { await job(); toast.success(done); invalidate('invoicing', 'clients', 'transactions', 'dashboard'); after?.(); onClose(); }
    catch (e: any) { toast.error(e?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };
  return { saving, run };
}

// ── Purchase order ─────────────────────────────────────────────────────────────

export function PoModal({ isOpen, onClose, editing, clientId }: Base & { editing: ClientPo | null; clientId?: number | null }) {
  const { saving, run } = useSaver(onClose);
  const { data: clients } = useClients();
  const { data: projects } = useProjects();
  const { data: orders } = useBuildOrders();
  const blank = { client_id: '', po_number: '', po_date: '', value: '', valid_until: '', project_id: '', build_order_id: '', file_path: '', note: '' };
  const [f, setF] = useState(blank);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setFileName('');
    setF(editing
      ? { client_id: String(editing.client_id), po_number: editing.po_number, po_date: day(editing.po_date), value: String(editing.value), valid_until: day(editing.valid_until), project_id: editing.project_id ? String(editing.project_id) : '', build_order_id: editing.build_order_id ? String(editing.build_order_id) : '', file_path: editing.file_path ?? '', note: editing.note ?? '' }
      : { ...blank, client_id: clientId ? String(clientId) : '', po_date: todayStr() });
  }, [isOpen, editing, clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const cid = Number(f.client_id);
  const clientProjects = (projects ?? []).filter((p: any) => p.client_id === cid);
  const clientOrders = (orders ?? []).filter((o) => o.client_id === cid);
  const value = Number(f.value);
  const dateOk = !f.valid_until || !f.po_date || f.valid_until >= f.po_date;
  const canSave = !saving && !uploading && !!cid && !!f.po_number.trim() && !!f.po_date && value > 0 && dateOk;

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('receipt', file);
      const res = await api.post<{ filename: string }>('/receipts/upload?type=invoice', fd);
      const name = (res as any).data?.filename;
      if (!name) throw new Error('The file could not be uploaded.');
      set('file_path')(name); setFileName(file.name);
    } catch (e: any) { toast.error(e?.message || 'Upload failed'); } finally { setUploading(false); }
  };

  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title={editing ? `Edit PO ${editing.po_number}` : 'Add purchase order'} icon={editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      canSave={canSave} saveLabel={editing ? 'Update PO' : 'Add PO'}
      onSave={() => run(async () => {
        const body = { client_id: cid, po_number: f.po_number, po_date: f.po_date, value, valid_until: f.valid_until || null, project_id: f.project_id ? Number(f.project_id) : null, build_order_id: f.build_order_id ? Number(f.build_order_id) : null, file_path: f.file_path || null, note: f.note || null };
        if (editing) await api.put(`/client-pos/${editing.id}`, body); else await api.post('/client-pos', body);
      }, editing ? 'PO updated.' : 'PO added.')}>
      <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2">
        <Field label="Client" required hint={editing ? 'The client cannot change once the PO exists.' : undefined}>
          <NativeSelect aria-label="Client" value={f.client_id} disabled={!!editing} onChange={(e) => setF((x) => ({ ...x, client_id: e.target.value, project_id: '', build_order_id: '' }))}>
            <option value="">Select client</option>
            {(clients ?? []).filter((c) => !c.is_system).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Client's PO number" required><Input className={inp} maxLength={60} placeholder="As written on the PO" value={f.po_number} onChange={(e) => set('po_number')(e.target.value)} /></Field>
        <Field label="PO date" required><Input type="date" className={inp} value={f.po_date} onChange={(e) => set('po_date')(e.target.value)} /></Field>
        <Field label="Value before tax" required hint="The total of the PO, without GST."><CurrencyInput value={f.value} onChange={set('value')} /></Field>
        <Field label="Valid until" error={!dateOk ? 'Cannot be before the PO date.' : undefined}><Input type="date" className={inp} value={f.valid_until} onChange={(e) => set('valid_until')(e.target.value)} /></Field>
        <div />
        <Field label="Project (optional)" hint="A PO can cover a project, an order, or both.">
          <NativeSelect aria-label="Project" value={f.project_id} disabled={!cid} onChange={(e) => set('project_id')(e.target.value)}>
            <option value="">{cid ? 'None' : 'Select a client first'}</option>
            {clientProjects.map((p: any) => <option key={p.id} value={p.id}>{p.code ? `${p.code} ` : ''}{p.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Order (optional)">
          <NativeSelect aria-label="Order" value={f.build_order_id} disabled={!cid} onChange={(e) => set('build_order_id')(e.target.value)}>
            <option value="">{cid ? 'None' : 'Select a client first'}</option>
            {clientOrders.map((o) => <option key={o.id} value={o.id}>{o.code} {o.product_name}</option>)}
          </NativeSelect>
        </Field>
        <div className="md:col-span-2">
          <FileDropzone label={f.file_path ? `The client's PO: ${fileName || 'attached'}` : "The client's PO (optional)"} onFile={upload} busy={uploading} busyTitle="Uploading" />
        </div>
        <div className="md:col-span-2"><Field label="Note"><Textarea className={cn(ctl, 'h-[64px] resize-none py-2')} rows={2} maxLength={500} value={f.note} onChange={(e) => set('note')(e.target.value)} /></Field></div>
      </div>
    </ModuleModal>
  );
}

// ── Invoice ─────────────────────────────────────────────────────────────────────

type Line = { description: string; hsn: string; quantity: string; unit: string; rate: string; gst_rate: string };
const NEW_LINE: Line = { description: '', hsn: '', quantity: '1', unit: 'nos', rate: '', gst_rate: '18' };

export function InvoiceModal({ isOpen, onClose, editing, clientId, poId }: Base & { editing: Invoice | null; clientId?: number | null; poId?: number | null }) {
  const { saving, run } = useSaver(onClose);
  const { data: clients } = useClients();
  const { data: company } = useCompanyProfile(isOpen);
  const { data: pos } = useClientPos(isOpen);
  const { data: projects } = useProjects();
  const { data: orders } = useBuildOrders();
  const blank = {
    client_id: '', po_id: '', project_id: '', build_order_id: '', invoice_date: '', due_date: '', notes: '',
    consignee: '', delivery_note: '', delivery_note_date: '', reference_no: '', reference_date: '', despatch_doc_no: '', mode_of_payment: '', despatch_through: '', destination: '', terms_of_delivery: '',
  };
  const [f, setF] = useState(blank);
  const [lines, setLines] = useState<Line[]>([{ ...NEW_LINE }]);
  const [dueTouched, setDueTouched] = useState(false);
  // One GST rate for the whole invoice; CGST and SGST are each half of it (9% and 9% at the usual 18%)
  const [gstRate, setGstRate] = useState(INVOICE_GST_RATE);
  useEffect(() => {
    if (!isOpen) return;
    setDueTouched(!!editing);
    setGstRate(editing?.lines[0] && GST_RATES.includes(Number(editing.lines[0].gst_rate)) ? Number(editing.lines[0].gst_rate) : INVOICE_GST_RATE);
    if (editing) {
      setF({ ...blank, client_id: String(editing.client_id), po_id: editing.po_id ? String(editing.po_id) : '', project_id: editing.project_id ? String(editing.project_id) : '', build_order_id: editing.build_order_id ? String(editing.build_order_id) : '', invoice_date: day(editing.invoice_date), due_date: day(editing.due_date), notes: editing.notes ?? '' });
      setLines(editing.lines.map((l) => ({ description: l.description, hsn: l.hsn ?? '', quantity: String(l.quantity), unit: l.unit, rate: String(l.rate), gst_rate: String(l.gst_rate) })));
      setF((x) => ({
        ...x,
        consignee: editing.consignee ?? '', delivery_note: editing.delivery_note ?? '', delivery_note_date: day(editing.delivery_note_date), reference_no: editing.reference_no ?? '',
        reference_date: day(editing.reference_date), despatch_doc_no: editing.despatch_doc_no ?? '', mode_of_payment: editing.mode_of_payment ?? '', despatch_through: editing.despatch_through ?? '',
        destination: editing.destination ?? '', terms_of_delivery: editing.terms_of_delivery ?? '',
      }));
    } else {
      const po = poId ? (pos ?? []).find((p) => p.id === poId) : null;
      setF({ ...blank, client_id: po ? String(po.client_id) : clientId ? String(clientId) : '', po_id: po ? String(po.id) : '', invoice_date: todayStr() });
      setLines([{ ...NEW_LINE }]);
    }
  }, [isOpen, editing, clientId, poId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const cid = Number(f.client_id);
  const client = (clients ?? []).find((c: any) => c.id === cid) as any;
  const terms = client?.payment_terms_days ?? 30;
  // The due date follows the invoice date and the client's terms until it is set by hand
  useEffect(() => { if (isOpen && !dueTouched && f.invoice_date) setF((x) => ({ ...x, due_date: addDays(f.invoice_date, terms) })); }, [isOpen, dueTouched, f.invoice_date, terms]);

  const clientPos = (pos ?? []).filter((p) => p.client_id === cid && (p.status === 'OPEN' || p.id === editing?.po_id));
  const clientProjects = (projects ?? []).filter((p: any) => p.client_id === cid);
  const clientOrders = (orders ?? []).filter((o) => o.client_id === cid);
  const po = clientPos.find((p) => String(p.id) === f.po_id);

  const fromCode = company ? stateCodeOf(company.gstin, company.state) : null;
  const toCode = client ? stateCodeOf(client.gstin, client.state) : null;
  const known = !!fromCode && !!toCode;
  const supply: 'INTRA' | 'INTER' = known && fromCode !== toCode ? 'INTER' : 'INTRA';
  const nums = lines.map((l) => ({ quantity: Number(l.quantity) || 0, rate: Number(l.rate) || 0, gst_rate: gstRate }));
  const t = useMemo(() => invoiceTotals(nums, supply), [lines, supply]); // eslint-disable-line react-hooks/exhaustive-deps
  const over = po ? t.taxable > po.balance + 0.005 + (editing?.po_id === po.id ? editing.taxable : 0) : false;
  const linesOk = lines.length > 0 && lines.every((l) => l.description.trim() && Number(l.quantity) > 0 && Number(l.rate) >= 0 && l.rate !== '' && (!l.hsn || /^\d{4,8}$/.test(l.hsn)));
  const datesOk = !!f.invoice_date && !!f.due_date && f.due_date >= f.invoice_date;
  const canSave = !saving && !!cid && linesOk && datesOk;
  const setLine = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="xl" title={editing ? `Edit draft invoice` : 'New invoice'} icon={editing ? <Pencil className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      canSave={canSave} saveLabel={editing ? 'Save draft' : 'Save as draft'}
      onSave={() => run(async () => {
        const body = {
          client_id: cid, po_id: f.po_id ? Number(f.po_id) : null, project_id: f.project_id ? Number(f.project_id) : null, build_order_id: f.build_order_id ? Number(f.build_order_id) : null,
          invoice_date: f.invoice_date, due_date: f.due_date, notes: f.notes || null,
          consignee: f.consignee.trim() || null, delivery_note: f.delivery_note.trim() || null, delivery_note_date: f.delivery_note_date || null,
          reference_no: f.reference_no.trim() || null, reference_date: f.reference_date || null, despatch_doc_no: f.despatch_doc_no.trim() || null,
          mode_of_payment: f.mode_of_payment.trim() || null, despatch_through: f.despatch_through.trim() || null, destination: f.destination.trim() || null,
          terms_of_delivery: f.terms_of_delivery.trim() || null,
          lines: lines.map((l) => ({ description: l.description, hsn: l.hsn || null, quantity: Number(l.quantity), unit: l.unit || 'nos', rate: Number(l.rate), gst_rate: gstRate })),
        };
        if (editing) await api.put(`/invoices/${editing.id}`, body); else await api.post('/invoices', body);
      }, 'Draft saved. Issue it when it is ready to send; it gets its number then.')}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-4">
          <Field label="Client" required>
            <NativeSelect aria-label="Client" value={f.client_id} disabled={!!editing} onChange={(e) => setF((x) => ({ ...x, client_id: e.target.value, po_id: '', project_id: '', build_order_id: '' }))}>
              <option value="">Select client</option>
              {(clients ?? []).filter((c) => !c.is_system && c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Client's PO">
            <NativeSelect aria-label="Client's PO" value={f.po_id} disabled={!cid} onChange={(e) => set('po_id')(e.target.value)}>
              <option value="">No PO</option>
              {clientPos.map((p) => <option key={p.id} value={p.id}>{p.po_number} · {money(p.balance, 'INR')} left</option>)}
            </NativeSelect>
          </Field>
          <Field label="Invoice date" required><Input type="date" className={inp} value={f.invoice_date} onChange={(e) => set('invoice_date')(e.target.value)} /></Field>
          <Field label="Due date" required hint={`${terms} days from the invoice date`} error={f.due_date && f.due_date < f.invoice_date ? 'Cannot be before the invoice date.' : undefined}>
            <Input type="date" className={inp} value={f.due_date} onChange={(e) => { setDueTouched(true); set('due_date')(e.target.value); }} />
          </Field>
          <Field label="Project (optional)">
            <NativeSelect aria-label="Project" value={f.project_id} disabled={!cid} onChange={(e) => set('project_id')(e.target.value)}>
              <option value="">None</option>
              {clientProjects.map((p: any) => <option key={p.id} value={p.id}>{p.code ? `${p.code} ` : ''}{p.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Order (optional)">
            <NativeSelect aria-label="Order" value={f.build_order_id} disabled={!cid} onChange={(e) => set('build_order_id')(e.target.value)}>
              <option value="">None</option>
              {clientOrders.map((o) => <option key={o.id} value={o.id}>{o.code} {o.product_name}</option>)}
            </NativeSelect>
          </Field>
          <div className="md:col-span-2"><Field label="Notes"><Input className={inp} maxLength={500} placeholder="Shown on the invoice" value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field></div>
        </div>
        <details className="mt-4 rounded-md border border-input p-3">
          <summary className="cursor-pointer text-[13px] font-medium text-[var(--shell-text)]">Delivery and reference details (optional)</summary>
          <p className="mt-1 text-[12px] text-[var(--shell-text-muted)]">Printed in the invoice header only when filled in. Leave the consignee blank to show the buyer&apos;s address.</p>
          <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="Consignee (ship to)"><Textarea className={cn(ctl, 'h-[72px] resize-none py-2')} maxLength={500} rows={3} value={f.consignee} onChange={(e) => set('consignee')(e.target.value)} /></Field></div>
            <Field label="Delivery note"><Input className={inp} maxLength={60} value={f.delivery_note} onChange={(e) => set('delivery_note')(e.target.value)} /></Field>
            <Field label="Delivery note date"><Input className={inp} type="date" value={f.delivery_note_date} onChange={(e) => set('delivery_note_date')(e.target.value)} /></Field>
            <Field label="Reference no."><Input className={inp} maxLength={60} value={f.reference_no} onChange={(e) => set('reference_no')(e.target.value)} /></Field>
            <Field label="Reference date"><Input className={inp} type="date" value={f.reference_date} onChange={(e) => set('reference_date')(e.target.value)} /></Field>
            <Field label="Despatch document no."><Input className={inp} maxLength={60} value={f.despatch_doc_no} onChange={(e) => set('despatch_doc_no')(e.target.value)} /></Field>
            <Field label="Mode / terms of payment" hint="Left blank, it prints the payment days from the due date."><Input className={inp} maxLength={100} value={f.mode_of_payment} onChange={(e) => set('mode_of_payment')(e.target.value)} /></Field>
            <Field label="Despatch through"><Input className={inp} maxLength={100} value={f.despatch_through} onChange={(e) => set('despatch_through')(e.target.value)} /></Field>
            <Field label="Destination"><Input className={inp} maxLength={100} value={f.destination} onChange={(e) => set('destination')(e.target.value)} /></Field>
            <div className="md:col-span-2"><Field label="Terms of delivery"><Input className={inp} maxLength={300} value={f.terms_of_delivery} onChange={(e) => set('terms_of_delivery')(e.target.value)} /></Field></div>
          </div>
        </details>

        {client && !known && <p role="alert" className="text-[13px] text-[var(--warning)]">{!fromCode ? 'The company state is not set yet (Organization, Company), ' : `${client.name} has no state or GSTIN on the Clients page, `}so the tax is shown as CGST and SGST for now. The invoice cannot be issued until it is set.</p>}
        {client && known && <p className="text-[13px] text-[var(--shell-text-muted)]">{supply === 'INTRA' ? `Both are in ${GST_STATES[fromCode!]}, so tax is CGST and SGST.` : `Supply from ${GST_STATES[fromCode!]} to ${GST_STATES[toCode!]}, so tax is IGST.`}{client && !client.gstin ? ' This client has no GSTIN, so it is a consumer (B2C) invoice.' : ''}</p>}
        {over && <p role="alert" className="text-[13px] text-[var(--warning)]">This is more than what is left on PO {po?.po_number}. You can still issue it.</p>}

        <div className="overflow-x-auto rounded-lg border border-[var(--shell-border)]">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--shell-border)] text-left text-[12px] text-[var(--shell-text-muted)]">
                <th className="px-3 py-2 font-medium">Description</th><th className="w-[96px] px-2 py-2 font-medium">HSN or SAC</th><th className="w-[84px] px-2 py-2 text-right font-medium">Qty</th>
                <th className="w-[76px] px-2 py-2 font-medium">Unit</th><th className="w-[120px] px-2 py-2 text-right font-medium">Rate</th>
                <th className="w-[120px] px-3 py-2 text-right font-medium">Amount</th><th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-[var(--shell-border)] last:border-0">
                  <td className="px-3 py-1.5"><Input aria-label={`Line ${i + 1} description`} className={ctl} maxLength={300} value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} /></td>
                  <td className="px-2 py-1.5"><Input aria-label={`Line ${i + 1} HSN or SAC`} className={ctl} inputMode="numeric" maxLength={8} value={l.hsn} onChange={(e) => setLine(i, 'hsn', e.target.value.replace(/\D/g, ''))} /></td>
                  <td className="px-2 py-1.5"><Input aria-label={`Line ${i + 1} quantity`} className={cn(ctl, 'text-right tabular-nums')} type="number" min="0" step="0.001" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} /></td>
                  <td className="px-2 py-1.5"><Input aria-label={`Line ${i + 1} unit`} className={ctl} maxLength={12} value={l.unit} onChange={(e) => setLine(i, 'unit', e.target.value)} /></td>
                  <td className="px-2 py-1.5"><Input aria-label={`Line ${i + 1} rate`} className={cn(ctl, 'text-right tabular-nums')} type="number" min="0" step="0.01" value={l.rate} onChange={(e) => setLine(i, 'rate', e.target.value)} /></td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums text-[var(--shell-text)]">{money(t.taxed[i]?.taxable ?? 0, 'INR')}</td>
                  <td className="px-1 py-1.5">
                    <button type="button" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--shell-text-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--danger)] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"><Trash2 aria-hidden className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-[var(--shell-border)] px-3 py-2">
            <button type="button" onClick={() => setLines((ls) => [...ls, { ...NEW_LINE }])} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-[var(--shell-accent)] hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"><Plus aria-hidden className="h-4 w-4" />Add line</button>
          </div>
        </div>

        <dl className="ml-auto w-full max-w-[380px] space-y-1.5 text-[13px]">
          <div className="flex justify-between"><dt className="text-[var(--shell-text-muted)]">Taxable value</dt><dd className="tabular-nums text-[var(--shell-text)]">{money(t.taxable, 'INR')}</dd></div>
          {supply === 'INTRA' ? (
            <>
              {(['CGST', 'SGST'] as const).map((name) => (
                <div key={name} className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--shell-text-muted)]">{name}</dt>
                  <dd className="flex items-center gap-2 tabular-nums text-[var(--shell-text)]">
                    <NativeSelect aria-label={`${name} %`} className="h-8 w-[84px] text-right" value={String(gstRate)} onChange={(e) => setGstRate(Number(e.target.value))}>
                      {GST_RATES.map((r) => <option key={r} value={r}>{halfRate(r)}%</option>)}
                    </NativeSelect>
                    <span className="w-[110px] text-right">{money(name === 'CGST' ? t.cgst : t.sgst, 'INR')}</span>
                  </dd>
                </div>
              ))}
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--shell-text-muted)]">IGST</dt>
              <dd className="flex items-center gap-2 tabular-nums text-[var(--shell-text)]">
                <NativeSelect aria-label="IGST %" className="h-8 w-[84px] text-right" value={String(gstRate)} onChange={(e) => setGstRate(Number(e.target.value))}>
                  {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                </NativeSelect>
                <span className="w-[110px] text-right">{money(t.igst, 'INR')}</span>
              </dd>
            </div>
          )}
          <div className="flex justify-between"><dt className="text-[var(--shell-text-muted)]">Round-off</dt><dd className="tabular-nums text-[var(--shell-text)]">{t.round_off.toFixed(2)}</dd></div>
          <div className="flex justify-between border-t border-[var(--shell-border)] pt-2 text-[15px] font-semibold"><dt className="text-[var(--shell-text)]">Total</dt><dd className="tabular-nums text-[var(--shell-text)]">{money(t.total, 'INR')}</dd></div>
        </dl>
      </div>
    </ModuleModal>
  );
}

// ── Payment received ────────────────────────────────────────────────────────────

const METHODS = [{ v: 'bank', l: 'Bank transfer' }, { v: 'upi', l: 'UPI' }, { v: 'cheque', l: 'Cheque' }, { v: 'cash', l: 'Cash' }, { v: 'card', l: 'Card' }];

export function PaymentModal({ isOpen, onClose, invoice }: Base & { invoice: Invoice | null }) {
  const { saving, run } = useSaver(onClose);
  const [f, setF] = useState({ paid_on: '', amount: '', tds: '', method: 'bank', reference: '' });
  useEffect(() => { if (isOpen && invoice) setF({ paid_on: todayStr(), amount: String(invoice.balance), tds: '', method: 'bank', reference: '' }); }, [isOpen, invoice]);
  if (!invoice) return null;
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const amount = Number(f.amount) || 0; const tds = Number(f.tds) || 0;
  const left = Math.round((invoice.balance - amount - tds) * 100) / 100;
  const dateOk = !!f.paid_on && f.paid_on >= day(invoice.invoice_date) && f.paid_on <= todayStr();
  const canSave = !saving && dateOk && amount + tds > 0 && left >= 0;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title={`Record payment for ${invoice.number}`} icon={<CreditCard className="h-4 w-4" />} canSave={canSave} saveLabel="Record payment"
      onSave={() => run(() => api.post(`/invoices/${invoice.id}/payments`, { paid_on: f.paid_on, amount, tds, method: f.method, reference: f.reference || null }), amount > 0 ? 'Payment recorded and added to Income.' : 'TDS recorded.')}>
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--shell-text-muted)]">{invoice.client_name} owes {money(invoice.balance, 'INR')} of {money(invoice.total, 'INR')}. The amount received is added to Income; the TDS the client deducted is not income.</p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2">
          <Field label="Date received" required error={f.paid_on && !dateOk ? `Between ${formatDate(invoice.invoice_date)} and today.` : undefined}><Input type="date" className={inp} value={f.paid_on} onChange={(e) => set('paid_on')(e.target.value)} /></Field>
          <Field label="Method"><NativeSelect aria-label="Method" value={f.method} onChange={(e) => set('method')(e.target.value)}>{METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</NativeSelect></Field>
          <Field label="Amount received" required error={left < 0 ? 'More than the balance.' : undefined}><CurrencyInput value={f.amount} onChange={set('amount')} /></Field>
          <Field label="TDS deducted by the client" hint="Counts towards the invoice, not as income."><CurrencyInput value={f.tds} onChange={set('tds')} /></Field>
          <div className="md:col-span-2"><Field label="Reference" hint="Bank reference, UTR or cheque number."><Input className={inp} maxLength={100} value={f.reference} onChange={(e) => set('reference')(e.target.value)} /></Field></div>
        </div>
        <p className="text-[13px] tabular-nums text-[var(--shell-text-muted)]">Balance after this: <span className="font-medium text-[var(--shell-text)]">{money(Math.max(left, 0), 'INR')}</span></p>
      </div>
    </ModuleModal>
  );
}

// ── Issue a draft ───────────────────────────────────────────────────────────────

export function IssueInvoiceModal({ isOpen, onClose, invoice }: Base & { invoice: Invoice | null }) {
  const { saving, run } = useSaver(onClose);
  const [no, setNo] = useState('');
  useEffect(() => { if (isOpen) setNo(''); }, [isOpen]);
  if (!invoice) return null;
  const rate = Number(invoice.lines[0]?.gst_rate ?? INVOICE_GST_RATE);
  const gst = invoice.supply_type === 'INTER' ? `IGST ${rate}%` : `CGST ${halfRate(rate)}% and SGST ${halfRate(rate)}%`;
  const typed = no.trim();
  const bad = typed !== '' && !/^[A-Za-z0-9][A-Za-z0-9\-/]{0,15}$/.test(typed);
  const row = (k: string, v: string, strong = false) => <div className="flex justify-between gap-4"><dt className="text-[var(--shell-text-muted)]">{k}</dt><dd className={cn('text-right tabular-nums text-[var(--shell-text)]', strong && 'font-semibold')}>{v}</dd></div>;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title="Issue invoice" icon={<Send className="h-4 w-4" />} canSave={!saving && !bad} saveLabel="Issue"
      onSave={() => run(() => api.post(`/invoices/${invoice.id}/issue`, { number: typed || undefined }), 'Invoice issued.')}>
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--shell-text-muted)]">Check these before issuing. Once issued the invoice cannot be edited, only cancelled.</p>
        <dl className="space-y-1.5 rounded-md border border-[var(--shell-border)] p-3 text-[13px]">
          {row('Client', invoice.client_name ?? '')}
          {row('Invoice date', formatDate(invoice.invoice_date))}
          {row('GST', gst)}
          {row('Total amount', money(invoice.total, 'INR'), true)}
        </dl>
        <Field label="Invoice number (optional)" hint="Leave blank to use the next automatic number." error={bad ? 'Up to 16 characters: letters, digits, dash or slash.' : undefined}>
          <Input className={inp} maxLength={16} placeholder="Automatic" value={no} onChange={(e) => setNo(e.target.value)} />
        </Field>
      </div>
    </ModuleModal>
  );
}

// ── Cancel an issued invoice ────────────────────────────────────────────────────

export function CancelInvoiceModal({ isOpen, onClose, invoice }: Base & { invoice: Invoice | null }) {
  const { saving, run } = useSaver(onClose);
  const [why, setWhy] = useState('');
  useEffect(() => { if (isOpen) setWhy(''); }, [isOpen]);
  if (!invoice) return null;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title={`Cancel ${invoice.number}`} icon={<Ban className="h-4 w-4" />} isDestructive canSave={!saving && why.trim().length >= 3} saveLabel="Cancel this invoice"
      onSave={() => run(() => api.post(`/invoices/${invoice.id}/cancel`, { reason: why }), 'Invoice cancelled.')}>
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--shell-text)]">The invoice stays in the list with its number, marked Cancelled. Its number is not used again. Raise a new invoice if the client should still be billed.</p>
        <Field label="Reason" required><Textarea className={cn(ctl, 'h-20 resize-none py-2')} rows={3} maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
      </div>
    </ModuleModal>
  );
}

// ── Company details (on the Organization page) ──────────────────────────────────

// Shrinks a picked image to at most 600 x 200 px and returns it as a PNG data URL, so a large logo never reaches the server
function shrinkLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { reject(new Error('Choose a PNG, JPEG or WebP image.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 600 / img.width, 200 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const out = c.toDataURL('image/png');
      if (out.length > 280_000) reject(new Error('The logo is too detailed to store. Use a simpler image or a smaller one.')); else resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
    img.src = url;
  });
}

export function CompanyForm({ company, canEdit }: { company: CompanyProfile; canEdit: boolean }) {
  const invalidate = useInvalidate();
  const [f, setF] = useState<CompanyProfile>(company);
  const [saving, setSaving] = useState(false);
  useEffect(() => setF(company), [company]);
  const set = (k: keyof CompanyProfile) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const gstin = f.gstin.trim().toUpperCase();
  const gstinOk = !gstin || /^(0[1-9]|[1-2]\d|3[0-8]|9[79])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin);
  const stateMismatch = !!gstin && gstinOk && !!f.state && stateCodeOf(gstin, null) !== stateCodeOf(null, f.state);
  const canSave = canEdit && !saving && !!f.legal_name.trim() && gstinOk && !stateMismatch;
  const dirty = JSON.stringify(f) !== JSON.stringify(company);
  const save = async () => {
    setSaving(true);
    try { await api.put('/company-profile', { ...f, gstin }); toast.success('Company details saved.'); invalidate('invoicing'); }
    catch (e: any) { toast.error(e?.message || 'Could not save.'); } finally { setSaving(false); }
  };
  const ro = !canEdit;
  // A plain function, not a component: a component created inside render remounts its input on every keystroke.
  const row = ({ label, k, hint, ...rest }: { label: string; k: keyof CompanyProfile; hint?: string } & React.ComponentProps<'input'>) => (
    <Field key={k} label={label} hint={hint}><Input className={inp} disabled={ro} value={(f[k] as string) ?? ''} onChange={(e) => set(k)(e.target.value)} {...rest} /></Field>
  );
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--shell-border)] px-6">
        <p className="text-[13px] text-[var(--shell-text-muted)]">{canEdit ? (dirty ? 'You have unsaved changes.' : company.configured ? 'Shown on every tax invoice.' : 'Fill these in before issuing the first invoice.') : 'Only Admin and Finance can change the company details.'}</p>
        {canEdit && <button type="button" onClick={save} disabled={!canSave || !dirty} className="btn-action btn-action-primary">Save details</button>}
      </div>
      <div className="grid max-w-[920px] grid-cols-1 gap-x-6 gap-y-4 px-6 py-6 md:grid-cols-2">
        {row({ label: "Legal name", k: "legal_name", maxLength: 150, required: true })}
        <Field label="GSTIN" error={!gstinOk ? 'A GSTIN has 15 characters, for example 33ABCDE1234F1Z5.' : undefined}><Input className={inp} disabled={ro} maxLength={15} value={f.gstin} onChange={(e) => set('gstin')(e.target.value.toUpperCase())} /></Field>
        {row({ label: "PAN", k: "pan", maxLength: 10 })}
        <Field label="State" error={stateMismatch ? 'Does not match the first two digits of the GSTIN.' : undefined}>
          <NativeSelect aria-label="State" disabled={ro} value={f.state} onChange={(e) => set('state')(e.target.value)}>
            <option value="">Select state</option>
            {Object.values(GST_STATES).map((s) => <option key={s} value={s}>{s}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Address" hint="Press Enter to start a new line. City, postal code and state follow the last line on the invoice."><Textarea className={cn(ctl, 'h-[64px] resize-none py-2')} disabled={ro} rows={2} maxLength={300} value={f.address_line} onChange={(e) => set('address_line')(e.target.value)} /></Field>
        {row({ label: "City", k: "city", maxLength: 100 })}
        {row({ label: "Postal code", k: "postal_code", maxLength: 20 })}
        {row({ label: "Email", k: "email", type: "email", maxLength: 200 })}
        {row({ label: "Phone", k: "phone", type: "tel", maxLength: 30, placeholder: "+91 98765 43210" })}
        {row({ label: "Authorised signatory", k: "signatory", maxLength: 100, hint: "Printed under the signature line." })}
        {row({ label: "Bank name", k: "bank_name", maxLength: 100 })}
        {row({ label: "Bank branch", k: "bank_branch", maxLength: 100 })}
        <div className="md:col-span-2">{row({ label: "Bank address", k: "bank_address", maxLength: 300 })}</div>
        {row({ label: "Account name", k: "bank_account_name", maxLength: 150, hint: "As the bank holds it. Printed under Payment Instructions." })}
        {row({ label: "Account number", k: "bank_account", maxLength: 30 })}
        {row({ label: "IFSC", k: "bank_ifsc", maxLength: 15 })}
        <div className="md:col-span-2"><Field label="Notes printed on the invoice" hint="One note per line, for example payment terms."><Textarea className={cn(ctl, 'h-[84px] resize-none py-2')} disabled={ro} rows={3} maxLength={1000} value={f.terms} onChange={(e) => set('terms')(e.target.value)} /></Field></div>
        <div className="md:col-span-2">{row({ label: "Closing line", k: "footer_note", maxLength: 300, hint: "Printed in italics at the foot of every invoice." })}</div>
        <div className="md:col-span-2">
          <Field label="Logo" hint="PNG, JPEG or WebP. Shown at the top left of every invoice and shrunk to fit.">
            <div className="flex items-center gap-4">
              <div className="flex h-[72px] w-[216px] items-center justify-center rounded-md border border-input bg-white p-2">
                {f.logo ? <img src={f.logo} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <span className="text-[12px] text-black/60">No logo yet</span>}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <label className="btn-action cursor-pointer focus-within:outline-2 focus-within:outline-[var(--shell-accent)]">
                    <ImagePlus aria-hidden className="h-4 w-4" />{f.logo ? 'Change logo' : 'Choose logo'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (e) => {
                      const file = e.target.files?.[0]; e.target.value = '';
                      if (!file) return;
                      try { setF((x) => ({ ...x, logo: '' })); const logo = await shrinkLogo(file); setF((x) => ({ ...x, logo })); }
                      catch (err: any) { setF((x) => ({ ...x, logo: company.logo })); toast.error(err?.message || 'Could not use that image.'); }
                    }} />
                  </label>
                  {f.logo && <button type="button" className="btn-action" onClick={() => setF((x) => ({ ...x, logo: '' }))}><Trash2 aria-hidden className="h-4 w-4" />Remove</button>}
                </div>
              )}
            </div>
          </Field>
        </div>
      </div>
    </div>
  );
}
