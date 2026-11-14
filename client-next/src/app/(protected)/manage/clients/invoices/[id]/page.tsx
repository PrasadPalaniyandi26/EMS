'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { useHeaderStore } from '@/stores/header-store';
import { useClients } from '@/hooks/use-queries';
import { useCompanyProfile, useInvoice, type Invoice, type Party } from '@/hooks/use-invoicing';
import { rupeesInWords } from '@/lib/amount-words';
import { stateCodeOf } from '@/lib/invoice-gst';
import { formatDate } from '@/lib/currency';
import { SHEET_CSS } from '@/lib/invoice-sheet-css';
import { Skeleton } from '@/components/dashboard/dashboard-parts';

const inr = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const qty = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n);


// A draft has no snapshot yet, so it is shown with the company details and client as they are now
function partyFromCompany(c?: ReturnType<typeof useCompanyProfile>['data']): Party | null {
  if (!c) return null;
  return { legal_name: c.legal_name, gstin: c.gstin, pan: c.pan, address_line: c.address_line, city: c.city, state: c.state, state_code: c.state_code, postal_code: c.postal_code, email: c.email, phone: c.phone, bank_name: c.bank_name, bank_account: c.bank_account, bank_ifsc: c.bank_ifsc, terms: c.terms, signatory: c.signatory };
}

function Address({ p }: { p: Party }) {
  const lines = [p.address_line, [p.city, p.postal_code].filter(Boolean).join(' '), p.state].filter(Boolean);
  return <>{lines.map((l, i) => <div key={i}>{l}</div>)}</>;
}

function InvoiceSheet({ inv, seller, buyer }: { inv: Invoice; seller: Party | null; buyer: Party | null }) {
  const inter = inv.supply_type === 'INTER';
  const draft = inv.status === 'DRAFT'; const cancelled = inv.status === 'CANCELLED';
  return (
    <article className="inv" aria-label={inv.number ? `Tax invoice ${inv.number}` : 'Draft tax invoice'}>
      {(draft || cancelled) && <div className="mark" aria-hidden>{draft ? 'DRAFT' : 'CANCELLED'}</div>}
      <div className="top">
        <div className="seller">
          <h1>TAX INVOICE</h1>
          <div className="name">{seller?.legal_name || 'Your company'}</div>
          {seller && <Address p={seller} />}
          {seller?.gstin && <div>GSTIN: <b>{seller.gstin}</b>{seller.pan ? <> · PAN: {seller.pan}</> : null}</div>}
          {(seller?.email || seller?.phone) && <div className="muted">{[seller.email, seller.phone].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="meta">
          <div><span>Invoice no.</span><b>{inv.number ?? 'Not issued yet'}</b></div>
          <div><span>Invoice date</span><b>{formatDate(inv.invoice_date)}</b></div>
          <div><span>Due date</span><b>{formatDate(inv.due_date)}</b></div>
          {inv.po_number && <div><span>Client&apos;s PO</span><b>{inv.po_number}</b></div>}
          {inv.place_of_supply && <div><span>Place of supply</span><b>{inv.place_of_supply}{inv.supply_type ? ` (${stateCodeOf(buyer?.gstin, buyer?.state) ?? ''})` : ''}</b></div>}
        </div>
      </div>

      <div className="parties">
        <div className="box">
          <h2>Bill to</h2>
          <div><b>{buyer?.name ?? inv.client_name}</b></div>
          {buyer && <Address p={buyer} />}
          <div>{buyer?.gstin ? <>GSTIN: <b>{buyer.gstin}</b></> : <span className="muted">GSTIN: unregistered</span>}</div>
        </div>
        <div className="box">
          <h2>Supply</h2>
          <div>{inv.supply_type == null ? <span className="muted">The tax is worked out when the invoice is issued.</span> : inter ? 'Interstate supply: IGST' : 'Within the state: CGST and SGST'}</div>
          {inv.project_name && <div>Project: {inv.project_name}</div>}
          {inv.build_order_code && <div>Order: {inv.build_order_code}</div>}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: '4%' }}>#</th><th>Description</th><th style={{ width: '10%' }}>HSN/SAC</th><th className="r" style={{ width: '9%' }}>Qty</th>
            <th className="r" style={{ width: '11%' }}>Rate</th><th className="r" style={{ width: '12%' }}>Taxable</th><th className="r" style={{ width: '6%' }}>GST %</th>
            {inter ? <th className="r" style={{ width: '11%' }}>IGST</th> : <><th className="r" style={{ width: '9%' }}>CGST</th><th className="r" style={{ width: '9%' }}>SGST</th></>}
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={l.id ?? i}>
              <td>{i + 1}</td><td>{l.description}</td><td>{l.hsn ?? ''}</td><td className="r">{qty(l.quantity)} {l.unit}</td><td className="r">{inr(l.rate)}</td><td className="r">{inr(l.taxable ?? 0)}</td><td className="r">{l.gst_rate}</td>
              {inter ? <td className="r">{inr(l.igst ?? 0)}</td> : <><td className="r">{inr(l.cgst ?? 0)}</td><td className="r">{inr(l.sgst ?? 0)}</td></>}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals">
        <div className="words"><div className="muted small">Amount in words</div><b>{rupeesInWords(inv.total)}</b></div>
        <div className="sum">
          <div><span>Taxable value</span><span className="r">{inr(inv.taxable)}</span></div>
          {inter ? <div><span>IGST</span><span className="r">{inr(inv.igst)}</span></div> : <><div><span>CGST</span><span className="r">{inr(inv.cgst)}</span></div><div><span>SGST</span><span className="r">{inr(inv.sgst)}</span></div></>}
          <div><span>Round-off</span><span className="r">{inv.round_off.toFixed(2)}</span></div>
          <div className="grand"><span>Total</span><span className="r">₹ {inr(inv.total)}</span></div>
          {inv.paid > 0 || inv.tds > 0 ? <div><span>Received</span><span className="r">{inr(inv.paid + inv.tds)}</span></div> : null}
          {inv.paid > 0 || inv.tds > 0 ? <div><span>Balance due</span><span className="r">{inr(inv.balance)}</span></div> : null}
        </div>
      </div>

      <div className="foot small">
        <div>
          {(seller?.bank_name || seller?.bank_account) && (
            <>
              <b>Bank details</b>
              <div>{seller?.bank_name}</div>
              <div>A/c no. {seller?.bank_account}</div>
              <div>IFSC {seller?.bank_ifsc}</div>
            </>
          )}
          {inv.notes && <div style={{ marginTop: 8 }}><b>Notes</b><div>{inv.notes}</div></div>}
        </div>
        <div>
          {seller?.terms && <><b>Terms</b><div style={{ whiteSpace: 'pre-line' }}>{seller.terms}</div></>}
          {cancelled && inv.cancel_reason && <div style={{ marginTop: 8 }}><b>Cancelled</b><div>{inv.cancel_reason}</div></div>}
        </div>
      </div>

      <div className="sign small">
        <div>For <b>{seller?.legal_name}</b></div>
        <div style={{ height: 44 }} />
        <div className="line">{seller?.signatory ? `${seller.signatory}, ` : ''}Authorised signatory</div>
      </div>
    </article>
  );
}

export default function InvoicePage() {
  const id = Number(useParams<{ id: string }>().id);
  const setHeader = useHeaderStore((s) => s.setHeader);
  const { data: inv, isLoading, isError } = useInvoice(id);
  const { data: company } = useCompanyProfile();
  const { data: clients } = useClients(true);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => { setHeader(inv?.number ?? 'Draft invoice', inv ? `${inv.client_name ?? ''}` : 'Tax invoice'); }, [setHeader, inv]);

  // An issued invoice is shown from the copy kept when it was issued; a draft from the details as they are now
  const seller = inv ? (inv.seller ?? partyFromCompany(company)) : null;
  const client = inv ? (clients ?? []).find((c: any) => c.id === inv.client_id) as any : null;
  const buyer: Party | null = inv ? (inv.buyer ?? (client ? { name: client.name, gstin: client.gstin ?? null, address_line: [client.street, client.address_line2].filter(Boolean).join(', ') || client.address || null, city: client.city ?? null, state: client.state ?? null, state_code: null, postal_code: client.postal_code ?? null } : null)) : null;

  const print = () => {
    const el = sheet.current?.querySelector('.inv');
    if (!el || !inv) return;
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${(inv.number ?? 'Draft invoice').replace(/[<>&]/g, '')}</title><style>${SHEET_CSS}body{margin:0}</style></head><body>${el.outerHTML}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--shell-border)] px-6">
        <Link href="/manage/clients?tab=invoices" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"><ArrowLeft aria-hidden className="h-4 w-4" />All invoices</Link>
        <button type="button" onClick={print} disabled={!inv} className="btn-action btn-action-primary"><Printer className="h-4 w-4" />Print or save as PDF</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--shell-bg)] p-6">
        {isLoading ? <Skeleton h="400px" /> : isError || !inv ? <p className="text-center text-[13px] text-[var(--shell-text-muted)]">This invoice could not be found.</p> : (
          <>
            <style>{SHEET_CSS}</style>
            <div ref={sheet} className="mx-auto w-fit shadow-md"><InvoiceSheet inv={inv} seller={seller} buyer={buyer} /></div>
          </>
        )}
      </div>
    </div>
  );
}
