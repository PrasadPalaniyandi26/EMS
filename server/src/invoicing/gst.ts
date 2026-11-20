// GST rules for client invoices: states, GSTIN checks, the tax on each line, and the invoice number.

export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const BY_NAME = new Map(Object.entries(GST_STATES).map(([code, name]) => [norm(name), code]));
// Names people write for the same state
BY_NAME.set('pondicherry', '34'); BY_NAME.set('orissa', '21'); BY_NAME.set('delhi ncr', '07'); BY_NAME.set('new delhi', '07');
BY_NAME.set('jammu kashmir', '01'); BY_NAME.set('dadra and nagar haveli', '26'); BY_NAME.set('daman and diu', '26');

export const GSTIN_RE = /^(0[1-9]|[1-2]\d|3[0-8]|9[79])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// The state code of a party: the first two digits of its GSTIN, or the code of the state it names
export function stateCodeOf(gstin?: string | null, state?: string | null): string | null {
  if (gstin && GSTIN_RE.test(gstin)) return gstin.slice(0, 2);
  if (state) { const c = BY_NAME.get(norm(state)); if (c) return c; }
  return null;
}

export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

// The usual rate on an invoice line: CGST and SGST are half of it (9% each) inside the state
export const INVOICE_GST_RATE = 18;
// The GST slabs a line may use; CGST and SGST are always equal halves of one (0, 2.5, 6, 9 or 14% each)
export const GST_SLABS = [0, 5, 12, 18, 28];

export type LineIn = { quantity: number; rate: number; gstRate: number };
export type LineOut = { taxable: number; cgst: number; sgst: number; igst: number };

// Tax on one line: CGST and SGST (half each) inside the state, IGST across states
export function taxOf(line: LineIn, supply: 'INTRA' | 'INTER'): LineOut {
  const taxable = r2(line.quantity * line.rate);
  if (supply === 'INTER') return { taxable, cgst: 0, sgst: 0, igst: r2((taxable * line.gstRate) / 100) };
  const half = r2((taxable * line.gstRate) / 200);
  return { taxable, cgst: half, sgst: half, igst: 0 };
}

// Invoice totals from its lines; the grand total is rounded to the rupee and the difference is shown as round-off
export function totalsOf(lines: LineOut[]) {
  const sum = (k: keyof LineOut) => r2(lines.reduce((a, l) => a + l[k], 0));
  const taxable = sum('taxable'); const cgst = sum('cgst'); const sgst = sum('sgst'); const igst = sum('igst');
  const exact = r2(taxable + cgst + sgst + igst);
  const total = Math.round(exact);
  return { taxable, cgst, sgst, igst, round_off: r2(total - exact), total };
}

// NTIN-YYMM-NNNNN: the year and month of the invoice date, then the running number (it starts at 10001 and never resets)
export function invoiceNumber(invoiceDate: Date, seq: number): string {
  const yy = String(invoiceDate.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(invoiceDate.getUTCMonth() + 1).padStart(2, '0');
  return `NTIN-${yy}${mm}-${seq}`;
}
