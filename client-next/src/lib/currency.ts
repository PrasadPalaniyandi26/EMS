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

export function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type DatePreset = 'today' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'calYear' | 'finYear';

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
