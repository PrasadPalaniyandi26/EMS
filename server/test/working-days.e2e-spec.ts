import { addWorkingDays, workingDaysBetween } from './../src/common/helpers/working-days';

// Schedule day counts are working days, Monday to Friday. 2026-11-09 is a Monday.
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe('Working days', () => {
  it('counts a full week as five days and skips the weekend', () => {
    expect(workingDaysBetween(d('2026-11-09'), d('2026-11-16'))).toBe(5);
    expect(workingDaysBetween(d('2026-11-13'), d('2026-11-16'))).toBe(1); // Friday to Monday
    expect(workingDaysBetween(d('2026-11-14'), d('2026-11-16'))).toBe(1); // Saturday to Monday
    expect(workingDaysBetween(d('2026-11-14'), d('2026-11-15'))).toBe(0); // Saturday to Sunday
    expect(workingDaysBetween(d('2026-10-12'), d('2026-11-09'))).toBe(20); // four weeks
  });

  it('is negative when the second date is earlier, and the same size either way', () => {
    expect(workingDaysBetween(d('2026-11-16'), d('2026-11-09'))).toBe(-5);
    expect(workingDaysBetween(d('2026-07-15'), d('2026-07-12'))).toBe(-3); // a Wednesday milestone done the Sunday before
    expect(workingDaysBetween(d('2026-09-10'), d('2026-09-20'))).toBe(6); // done late: Thursday to the next Sunday week
  });

  it('adds and subtracts working days over weekends', () => {
    expect(iso(addWorkingDays(d('2026-11-13'), 1))).toBe('2026-11-16');
    expect(iso(addWorkingDays(d('2026-11-09'), 5))).toBe('2026-11-16');
    expect(iso(addWorkingDays(d('2026-11-09'), 0))).toBe('2026-11-09');
    expect(iso(addWorkingDays(d('2026-11-16'), -1))).toBe('2026-11-13');
    expect(iso(addWorkingDays(d('2026-11-14'), 1))).toBe('2026-11-16');
  });

  it('adding then counting returns the same number', () => {
    for (const start of ['2026-11-09', '2026-11-12', '2026-11-14', '2026-11-15']) {
      for (const n of [0, 1, 4, 5, 6, 13, 28]) expect(workingDaysBetween(d(start), addWorkingDays(d(start), n))).toBe(n);
    }
  });
});
