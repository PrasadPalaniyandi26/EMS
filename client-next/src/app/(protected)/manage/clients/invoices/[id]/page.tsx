'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Mail, Phone, Printer } from 'lucide-react';
import { useHeaderStore } from '@/stores/header-store';
import { useClients } from '@/hooks/use-queries';
import { useCompanyProfile, useInvoice, type Invoice, type InvoiceLine, type Party } from '@/hooks/use-invoicing';
import { rupeesInWords } from '@/lib/amount-words';
import { invoiceTotals, r2, stateCodeOf } from '@/lib/invoice-gst';
import { SHEET_CSS } from '@/lib/invoice-sheet-css';
import { Skeleton } from '@/components/dashboard/dashboard-parts';

const inr = (n: number) => `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const qty = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n);
const dmy = (v?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const DAY = 86400000;
// How long the client has to pay, in calendar days (a money term, not a schedule)
const termsText = (from: string, to: string) => {
  const d = Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY);
  return d > 0 ? `Net ${d} days` : 'Due on receipt';
};
// Rows in the item grid before it stops padding with empty lines, so a short invoice still fills the box
const GRID_ROWS = 10;

// A draft has no snapshot yet, so it is shown with the company details and client as they are now
function partyFromCompany(c?: ReturnType<typeof useCompanyProfile>['data']): Party | null {
  if (!c) return null;
  return {
    legal_name: c.legal_name, gstin: c.gstin, pan: c.pan, address_line: c.address_line, city: c.city, state: c.state, state_code: c.state_code, postal_code: c.postal_code, email: c.email, phone: c.phone,
    bank_name: c.bank_name, bank_account: c.bank_account, bank_ifsc: c.bank_ifsc, bank_branch: c.bank_branch, bank_address: c.bank_address, bank_account_name: c.bank_account_name,
    terms: c.terms, signatory: c.signatory, footer_note: c.footer_note,
  };
}

// The company address as printed: the address lines as typed (a new line stays a new line), with the city, postal code and
// state joined onto the last one, e.g. "Krishnarayapuram Taluk, Karur District, 639102. Tamil Nadu."
function sellerAddressLines(p: Party): string[] {
  const lines = String(p.address_line ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const place = [p.city, p.postal_code].filter(Boolean).join(', ');
  const tail = `${place}${p.state ? `${place ? '. ' : ''}${p.state}.` : ''}`;
  if (!lines.length) return tail ? [tail] : [];
  const last = lines.pop()!;
  lines.push(tail ? `${last}, ${tail}` : last);
  return lines;
}

// Repaints the logo in one colour, keeping its shape: white paper becomes transparent, and each stroke keeps its darkness
function recolorLogo(src: string, [R, G, B]: number[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      if (!g) { reject(new Error('no canvas')); return; }
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const lum = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        const ink = (255 - lum) / 255;
        p[i] = R; p[i + 1] = G; p[i + 2] = B;
        p[i + 3] = Math.round(p[i + 3] * Math.min(1, ink * 1.4));
      }
      g.putImageData(d, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('logo could not be read'));
    img.src = src;
  });
}

function Address({ p }: { p: Party }) {
  const lines = [p.address_line, [p.city, p.postal_code].filter(Boolean).join(' '), p.state].filter(Boolean);
  return <>{lines.map((l, i) => <div key={i}>{l}</div>)}</>;
}

// The tax shown under the grid: one pair of lines (CGST and SGST) or one line (IGST) for each GST rate on the invoice
function taxBlock(inv: Invoice) {
  const inter = inv.supply_type === 'INTER';
  const draft = inv.supply_type == null;
  // A draft is not taxed yet, so it is worked out here the same way it will be when issued
  const calc = invoiceTotals(inv.lines, inter ? 'INTER' : 'INTRA');
  const lines: InvoiceLine[] = inv.lines.map((l, i) => (draft ? { ...l, ...calc.taxed[i] } : l));
  const byRate = new Map<number, { cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    if (!l.gst_rate) continue;
    const g = byRate.get(l.gst_rate) ?? { cgst: 0, sgst: 0, igst: 0 };
    g.cgst += l.cgst ?? 0; g.sgst += l.sgst ?? 0; g.igst += l.igst ?? 0;
    byRate.set(l.gst_rate, g);
  }
  const rows = [...byRate.entries()].sort((a, b) => a[0] - b[0]).flatMap(([rate, g]) => (inter
    ? [{ label: 'IGST', rate: `${rate}%`, value: r2(g.igst) }]
    : [{ label: 'CGST', rate: `${rate / 2}%`, value: r2(g.cgst) }, { label: 'SGST', rate: `${rate / 2}%`, value: r2(g.sgst) }]));
  return { rows, taxable: draft ? calc.taxable : inv.taxable, roundOff: draft ? calc.round_off : inv.round_off, total: draft ? calc.total : inv.total };
}

function InvoiceSheet({ inv, seller, buyer, logo }: { inv: Invoice; seller: Party | null; buyer: Party | null; logo?: string }) {
  const draft = inv.status === 'DRAFT'; const cancelled = inv.status === 'CANCELLED';
  const { rows: taxRows, taxable, roundOff, total } = taxBlock(inv);
  const filler = Math.max(0, GRID_ROWS - inv.lines.length);
  const notes = [...String(seller?.terms ?? '').split('\n'), ...String(inv.notes ?? '').split('\n')].map((s) => s.trim()).filter(Boolean);
  const reference = [inv.project_name, inv.build_order_code && `Order ${inv.build_order_code}`].filter(Boolean).join(' / ');
  const buyerCode = buyer?.state_code ?? stateCodeOf(buyer?.gstin, buyer?.state);
  const received = inv.paid + inv.tds;
  const pay: [string, string | null | undefined][] = [
    ['Bank', seller?.bank_name], ['Account Name', seller?.bank_account_name || seller?.legal_name], ['IFSC Code', seller?.bank_ifsc], ['Account Number', seller?.bank_account],
    ['Branch', seller?.bank_branch], ['Address', seller?.bank_address],
  ];
  return (
    <article className="inv" aria-label={inv.number ? `Tax invoice ${inv.number}` : 'Draft tax invoice'}>
      {(draft || cancelled) && <div className="mark" aria-hidden>{draft ? 'DRAFT' : 'CANCELLED'}</div>}
      <div className="sheet">
        <div className="title">Tax Invoice</div>

        <div className={`head${logo ? '' : ' nologo'}`}>
          {logo && <div className="logo"><img src={logo} alt={seller?.legal_name ? `${seller.legal_name} logo` : 'Company logo'} /></div>}
          <div className="from">
            <div className="co">{seller?.legal_name || 'Your company'}</div>
            {seller && sellerAddressLines(seller).map((l, i) => <div key={i}>{l}</div>)}
            {seller?.gstin && <div>GSTIN/UIN: {seller.gstin}</div>}
            {(seller?.phone || seller?.email) && (
              <div className="contact">
                {seller.phone && <><Phone size={11} strokeWidth={2.5} className="ico" role="img" aria-label="Phone" /> {seller.phone}</>}
                {seller.phone && seller.email && '  '}
                {seller.email && <><Mail size={11} strokeWidth={2.5} className="ico" role="img" aria-label="Email" /> {seller.email}</>}
              </div>
            )}
          </div>
        </div>

        <div className="info">
          <div className="l">
            <div className="c">Invoice No : <b>{inv.number ?? 'Not issued yet'}</b></div>
            <div className="c">Invoice Date : <b>{dmy(inv.invoice_date)}</b></div>
            <div className="buyer">
              <span className="lab">Buyer (Bill to) :</span>
              <b>{buyer?.name ?? inv.client_name}</b>
              {buyer?.address_line && <div>{buyer.address_line}</div>}
              {(buyer?.city || buyer?.postal_code) && <div>{[buyer.city, buyer.postal_code].filter(Boolean).join(', ')}</div>}
              <div>{buyer?.gstin ? <>GSTIN/UIN : <b>{buyer.gstin}</b></> : <span className="muted">GSTIN/UIN : unregistered</span>}</div>
              {buyer?.state && <div>State : {buyer.state}{buyerCode ? `, Code : ${buyerCode}` : ''}</div>}
            </div>
            <div className="consignee">
              <span className="lab">Consignee (Ship to) :</span>
              {inv.consignee
                ? <div style={{ whiteSpace: 'pre-line' }}>{inv.consignee}</div>
                : <div className="muted">Same as buyer</div>}
            </div>
          </div>
          <div className="side">
            <div className="c"><span className="lab">Buyer Order No.</span><span className="val">{inv.po_number ?? ''}</span></div>
            <div className="c"><span className="lab">Buyer Order Date</span><span className="val">{dmy(inv.po_date)}</span></div>
            <div className="c"><span className="lab">Delivery Note</span><span className="val">{inv.delivery_note ?? ''}</span></div>
            <div className="c"><span className="lab">Delivery Date</span><span className="val">{dmy(inv.delivery_note_date)}</span></div>
            <div className="c"><span className="lab">Reference No.</span><span className="val">{inv.reference_no ?? reference}</span></div>
            <div className="c"><span className="lab">Reference Date</span><span className="val">{dmy(inv.reference_date)}</span></div>
            <div className="c"><span className="lab">Despatch Doc No.</span><span className="val">{inv.despatch_doc_no ?? ''}</span></div>
            <div className="c"><span className="lab">Mode / Terms of Payment</span><span className="val">{inv.mode_of_payment || termsText(inv.invoice_date, inv.due_date)}</span></div>
            <div className="c"><span className="lab">Despatch Through</span><span className="val">{inv.despatch_through ?? ''}</span></div>
            <div className="c"><span className="lab">Destination</span><span className="val">{inv.destination ?? ''}</span></div>
            <div className="c wide"><span className="lab">Terms of Delivery</span><span className="val">{inv.terms_of_delivery ?? ''}</span></div>
          </div>
        </div>
        <table>
          <colgroup><col style={{ width: '7%' }} /><col style={{ width: '43%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} /><col style={{ width: '14%' }} /><col style={{ width: '15%' }} /></colgroup>
          <thead>
            <tr><th>Sl. No</th><th>Item/Service Description</th><th>HSN/SAC</th><th>Quantity</th><th>Rate (₹)</th><th>Line Total (₹)</th></tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={l.id ?? i}>
                <td className="c-sl">{i + 1}</td><td>{l.description}</td><td className="c-sl">{l.hsn ?? ''}</td>
                <td className="r">{qty(l.quantity)} {l.unit}</td><td className="r"><b>{inr(l.rate)}</b></td><td className="r"><b>{inr(l.quantity * l.rate)}</b></td>
              </tr>
            ))}
            {Array.from({ length: filler }).map((_, i) => <tr key={`f${i}`} aria-hidden><td /><td /><td /><td /><td /><td /></tr>)}
          </tbody>
          <tbody className="totals">
            <tr><td colSpan={4} className="r">Sub Total</td><td /><td className="r">{inr(taxable)}</td></tr>
            {taxRows.map((t) => <tr key={`${t.label}-${t.rate}`}><td colSpan={4} className="r">{t.label}</td><td className="r">{t.rate}</td><td className="r">{inr(t.value)}</td></tr>)}
            {roundOff !== 0 && <tr><td colSpan={4} className="r">Round off</td><td /><td className="r">{inr(roundOff)}</td></tr>}
            <tr className="sep-above"><td colSpan={4} className="r">Grand Total</td><td /><td className="r">{inr(total)}</td></tr>
            {received > 0 && <tr><td colSpan={4} className="r">Received (including TDS)</td><td /><td className="r">{inr(received)}</td></tr>}
            {received > 0 && <tr><td colSpan={4} className="r">Balance due</td><td /><td className="r">{inr(inv.balance)}</td></tr>}
            <tr className="words-row"><td colSpan={4}>Amount Chargeable (in words)</td><td colSpan={2} className="r">E. &amp; O.E</td></tr>
            <tr className="words-row"><td colSpan={6} className="words-text">{rupeesInWords(total)}</td></tr>
            <tr className="total-row"><td colSpan={4} className="r">TOTAL</td><td /><td className="r">{inr(total)}</td></tr>
          </tbody>
        </table>


        {pay.some(([, v]) => v) && (
          <div className="pay">
            <h2>Payment Instructions</h2>
            <div className="pay-cols">
              <div>{pay.filter(([k, v]) => v && !['Branch', 'Address'].includes(k)).map(([k, v]) => <div key={k}>{k}: <b>{v}</b></div>)}</div>
              <div>{pay.filter(([k, v]) => v && ['Branch', 'Address'].includes(k)).map(([k, v]) => <div key={k}>{k}: <b style={{ whiteSpace: 'pre-line' }}>{v}</b></div>)}</div>
            </div>
          </div>
        )}

        <div className="foot">
          <div className="notes">
            <h2>Notes</h2>
            {notes.map((n, i) => <div key={i}>{n.startsWith('-') ? n : `- ${n}`}</div>)}
            {cancelled && inv.cancel_reason && <div>- Cancelled: {inv.cancel_reason}</div>}
          </div>
          <div className="sign">
            <div>For <b>{seller?.legal_name}</b></div>
            <div className="gap" />
            <div>{seller?.signatory ? `${seller.signatory}, ` : ''}Authorised Signatory</div>
          </div>
        </div>
        {seller?.footer_note && <div className="tag">&ldquo;{seller.footer_note}&rdquo;</div>}
      </div>
    </article>
  );
}

export default function InvoicePage() {
  const id = Number(useParams<{ id: string }>().id);
  const setHeader = useHeaderStore((s) => s.setHeader);
  const { data: inv, isLoading, isError } = useInvoice(id);
  const { data: company } = useCompanyProfile();
  // The logo is shown in deep royal green on the sheet; the stored logo itself is not changed
  const [emeraldLogo, setEmeraldLogo] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    if (!company?.logo) { setEmeraldLogo(undefined); return; }
    recolorLogo(company.logo, [11, 90, 60]).then((u) => { if (live) setEmeraldLogo(u); }).catch(() => { if (live) setEmeraldLogo(company.logo); });
    return () => { live = false; };
  }, [company?.logo]);
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
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${(inv.number ?? 'Draft invoice').replace(/[<>&]/g, '')}</title><style>${SHEET_CSS}html,body{width:210mm;margin:0;padding:0;background:#fff}.inv{margin:0;box-shadow:none}</style></head><body>${el.outerHTML}</body></html>`);
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
            <div ref={sheet} className="mx-auto w-fit shadow-md"><InvoiceSheet inv={inv} seller={seller} buyer={buyer} logo={emeraldLogo} /></div>
          </>
        )}
      </div>
    </div>
  );
}
