import { todayIso, workingDaysBetween } from '@/lib/working-days';

// Where a project milestone stands. Done on or before the planned date is green, done after it is red,
// and still open past its date is orange. Days are working days, Monday to Friday.
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export type MilestoneTone = 'success' | 'warning' | 'danger' | 'muted';

export function milestoneState(m: { planned_date: string; done_date: string | null }): { status: string; tone: MilestoneTone; days: string | null; diff: number | null } {
  if (m.done_date) {
    const diff = workingDaysBetween(m.planned_date, m.done_date);
    return diff > 0 ? { status: 'Done late', tone: 'danger', days: `${days(diff)} late`, diff } : { status: 'Done', tone: 'success', days: diff === 0 ? 'On time' : `${days(-diff)} early`, diff };
  }
  const over = workingDaysBetween(m.planned_date, todayIso());
  return over > 0 ? { status: 'Overdue', tone: 'warning', days: `${days(over)} overdue`, diff: over } : { status: 'Open', tone: 'muted', days: null, diff: null };
}
