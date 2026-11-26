import { previousPeriod } from './previous-period';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const run = (from: string, to: string, today: string) => {
  const r = previousPeriod(d(from), d(to), d(today));
  return [r.until, r.prevFrom, r.prevTo].map((x) => x.toISOString().slice(0, 10));
};

describe('previousPeriod', () => {
  it('compares a finished month with the whole month before, whatever their lengths', () => {
    expect(run('2026-02-01', '2026-02-28', '2026-06-01')).toEqual(['2026-02-28', '2026-01-01', '2026-01-31']);
    expect(run('2026-03-01', '2026-03-31', '2026-06-01')).toEqual(['2026-03-31', '2026-02-01', '2026-02-28']);
  });

  it('compares an unfinished period only as far as today', () => {
    expect(run('2026-11-01', '2026-11-30', '2026-11-25')).toEqual(['2026-11-25', '2026-10-01', '2026-10-25']);
    expect(run('2026-04-01', '2027-03-31', '2026-11-25')).toEqual(['2026-11-25', '2025-04-01', '2025-11-25']);
  });

  it('compares other periods with the same number of days just before', () => {
    expect(run('2026-05-10', '2026-05-19', '2026-06-01')).toEqual(['2026-05-19', '2026-04-30', '2026-05-09']);
  });
});
