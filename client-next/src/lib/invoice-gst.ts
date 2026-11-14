// GST for the invoice dialog: the same rules as the server (server/src/invoicing/gst.ts), so the totals shown while typing are the ones that get saved.
// The expense form's own GST helpers are in gst.ts.
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
BY_NAME.set('pondicherry', '34'); BY_NAME.set('orissa', '21'); BY_NAME.set('delhi ncr', '07'); BY_NAME.set('new delhi', '07');

export const GSTIN_RE = /^(0[1-9]|[1-2]\d|3[0-8]|9[79])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isValidGstin = (v: string) => !v || GSTIN_RE.test(v.trim().toUpperCase());

export function stateCodeOf(gstin?: string | null, state?: string | null): string | null {
  if (gstin && GSTIN_RE.test(gstin.trim().toUpperCase())) return gstin.trim().slice(0, 2);
  if (state) return BY_NAME.get(norm(state)) ?? null;
  return null;
}

export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function lineTax(quantity: number, rate: number, gstRate: number, supply: 'INTRA' | 'INTER') {
  const taxable = r2(quantity * rate);
  if (supply === 'INTER') return { taxable, cgst: 0, sgst: 0, igst: r2((taxable * gstRate) / 100) };
  const half = r2((taxable * gstRate) / 200);
  return { taxable, cgst: half, sgst: half, igst: 0 };
}

export function invoiceTotals(lines: { quantity: number; rate: number; gst_rate: number }[], supply: 'INTRA' | 'INTER') {
  const taxed = lines.map((l) => lineTax(l.quantity || 0, l.rate || 0, l.gst_rate || 0, supply));
  const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst') => r2(taxed.reduce((a, l) => a + l[k], 0));
  const taxable = sum('taxable'); const cgst = sum('cgst'); const sgst = sum('sgst'); const igst = sum('igst');
  const exact = r2(taxable + cgst + sgst + igst);
  const total = Math.round(exact);
  return { taxed, taxable, cgst, sgst, igst, round_off: r2(total - exact), total };
}

export const GST_RATES = [0, 5, 12, 18, 28];
