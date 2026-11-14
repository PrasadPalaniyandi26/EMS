// Money for planning and costing screens.
// Totals are whole rupees (paise never matter at planning level); unit prices keep their paise (0.35 stays 0.35).
const whole = (currency: string, symbol: boolean) => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: symbol ? 'currency' : 'decimal', currency, maximumFractionDigits: 0, minimumFractionDigits: 0 });
export const money = (v: number | null | undefined, currency = 'INR') => whole(currency, true).format(Math.round(Number(v || 0)));
export const plain = (v: number | null | undefined, currency = 'INR') => whole(currency, false).format(Math.round(Number(v || 0)));

const unitFmt = (currency: string, symbol: boolean) => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: symbol ? 'currency' : 'decimal', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const unitPrice = (v: number | null | undefined, currency = 'INR') => unitFmt(currency, true).format(Number(v || 0));
export const unitPlain = (v: number | null | undefined, currency = 'INR') => unitFmt(currency, false).format(Number(v || 0));
