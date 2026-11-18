// Schedules (builds, deliveries, milestones, approval waits) count working days: Monday to Friday.
// Public holidays are not known to the system, so they count as working days.

const DAY = 86400000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const isWorking = (t: number) => { const w = new Date(t).getUTCDay(); return w !== 0 && w !== 6; };

// Working days after `from` up to and including `to`. Negative when `to` is earlier.
export function workingDaysBetween(from: Date, to: Date): number {
  const a = utcDay(from); const b = utcDay(to);
  if (a === b) return 0;
  const sign = b > a ? 1 : -1;
  const lo = Math.min(a, b); const hi = Math.max(a, b);
  const span = Math.round((hi - lo) / DAY);
  let count = Math.floor(span / 7) * 5;
  for (let i = 1, t = lo + Math.floor(span / 7) * 7 * DAY; i <= span % 7; i++) { t += DAY; if (isWorking(t)) count++; }
  return sign * count;
}

// The date `n` working days after `from` (before it when n is negative). Weekends are skipped.
export function addWorkingDays(from: Date, n: number): Date {
  let t = utcDay(from);
  let left = Math.abs(Math.round(n));
  const step = n < 0 ? -DAY : DAY;
  while (left > 0) { t += step; if (isWorking(t)) left--; }
  return new Date(t);
}
