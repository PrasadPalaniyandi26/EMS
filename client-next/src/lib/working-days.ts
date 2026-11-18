// Schedules (builds, deliveries, milestones, approval waits) count working days: Monday to Friday.
// Public holidays are not known to the system, so they count as working days.

const DAY = 86400000;
const parse = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const isWorking = (t: number) => { const w = new Date(t).getUTCDay(); return w !== 0 && w !== 6; };

export const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

// Working days after `from` up to and including `to` (YYYY-MM-DD). Negative when `to` is earlier.
export function workingDaysBetween(from: string, to: string): number {
  const a = parse(from); const b = parse(to);
  if (a === b) return 0;
  const sign = b > a ? 1 : -1;
  const lo = Math.min(a, b); const hi = Math.max(a, b);
  const span = Math.round((hi - lo) / DAY);
  let count = Math.floor(span / 7) * 5;
  for (let i = 1, t = lo + Math.floor(span / 7) * 7 * DAY; i <= span % 7; i++) { t += DAY; if (isWorking(t)) count++; }
  return sign * count;
}

// The date `n` working days after `from`, as YYYY-MM-DD. Weekends are skipped.
export function addWorkingDays(from: string, n: number): string {
  let t = parse(from);
  let left = Math.max(0, Math.round(n));
  while (left > 0) { t += DAY; if (isWorking(t)) left--; }
  return new Date(t).toISOString().slice(0, 10);
}
