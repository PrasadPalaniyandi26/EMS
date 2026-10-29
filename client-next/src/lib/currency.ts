const CURRENCY_MAP: Record<string, { locale: string; currency: string; symbol: string }> = {
  USD: { locale: 'en-US', currency: 'USD', symbol: '$' },
  GBP: { locale: 'en-GB', currency: 'GBP', symbol: '£' },
  EUR: { locale: 'de-DE', currency: 'EUR', symbol: '€' },
  INR: { locale: 'en-IN', currency: 'INR', symbol: '₹' },
};

export const CURRENCY_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(CURRENCY_MAP).map(([k, v]) => [k, v.symbol])
);

export function formatCurrency(amount: number, currencyCode = 'INR', showSymbol = true) {
  const config = CURRENCY_MAP[currencyCode] || CURRENCY_MAP.INR;
  return new Intl.NumberFormat(config.locale, {
    style: showSymbol ? 'currency' : 'decimal',
    currency: config.currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

// Postgres DATE columns reach the client as "2026-09-23T00:00:00.000Z" (or "2026-09-23"). That is a calendar
// day, not an instant: parsing it with new Date() and reading it in local time shows the previous day in
// any timezone behind UTC (the Americas). Treat it as the same calendar day at local midnight instead.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.0+)?Z)?$/;

export function parseApiDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(dateStr: string | Date | null) {
  const d = parseApiDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type DatePreset = 'today' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'calYear' | 'finYear';

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Today's (or the given instant's) calendar date in the user's own timezone, as yyyy-MM-dd.
// new Date().toISOString().split('T')[0] gives the UTC date instead, which is wrong for part of every day.
export function toLocalYMD(d: Date = new Date()) {
  return fmt(d);
}

function validYMD(y: number, m: number, d: number) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? fmt(dt) : '';
}

// Receipt OCR text → yyyy-MM-dd ('' if unreadable). Numeric dates are day-first (en-GB / India);
// a value like 03/25/2026 is read month-first because 25 cannot be a month.
export function parseOcrDate(raw: string) {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return validYMD(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return b > 12 && a <= 12 ? validYMD(y, a, b) : validYMD(y, b, a);
  }
  const free = new Date(s); // e.g. "5 Mar 2026"
  return isNaN(free.getTime()) ? '' : fmt(free);
}

export function getDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { from: fmt(today), to: fmt(today) };
    case 'thisWeek': {
      const d = today.getDay();
      const s = new Date(today); s.setDate(today.getDate() - d);
      const e = new Date(today); e.setDate(today.getDate() + (6 - d));
      return { from: fmt(s), to: fmt(e) };
    }
    case 'lastWeek': {
      const d = today.getDay();
      const s = new Date(today); s.setDate(today.getDate() - d - 7);
      const e = new Date(today); e.setDate(today.getDate() - d - 1);
      return { from: fmt(s), to: fmt(e) };
    }
    case 'thisMonth': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: fmt(s), to: fmt(e) };
    }
    case 'lastMonth': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(s), to: fmt(e) };
    }
    case 'thisQuarter': {
      const q = Math.floor(today.getMonth() / 3);
      return { from: fmt(new Date(today.getFullYear(), q * 3, 1)), to: fmt(new Date(today.getFullYear(), q * 3 + 3, 0)) };
    }
    case 'calYear': {
      return { from: fmt(new Date(today.getFullYear(), 0, 1)), to: fmt(new Date(today.getFullYear(), 11, 31)) };
    }
    case 'finYear': {
      const m = today.getMonth();
      const sy = m < 3 ? today.getFullYear() - 1 : today.getFullYear();
      return { from: fmt(new Date(sy, 3, 1)), to: fmt(new Date(sy + 1, 2, 31)) };
    }
    default:
      return { from: '', to: '' };
  }
}
