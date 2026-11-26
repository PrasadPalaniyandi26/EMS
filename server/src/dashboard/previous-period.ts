// The stretch of time a period is compared with. A period of whole months is compared with the months just before it;
// any other period with the same number of days just before it. A period that has not finished is compared only as far
// as today, so eight months of this year are not set against twelve of last year. Dates are UTC midnight.
export function previousPeriod(from: Date, to: Date, today: Date) {
  const DAY = 86400000;
  const until = new Date(Math.max(from.getTime(), Math.min(to.getTime(), today.getTime())));
  const isMonthEnd = (d: Date) => new Date(d.getTime() + DAY).getUTCDate() === 1;
  if (from.getUTCDate() === 1 && isMonthEnd(to)) {
    const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;
    const back = (d: Date) => {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() - months;
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return new Date(Date.UTC(y, m, isMonthEnd(d) ? last : Math.min(d.getUTCDate(), last)));
    };
    return { until, prevFrom: back(from), prevTo: back(until) };
  }
  const length = to.getTime() - from.getTime() + DAY;
  return { until, prevFrom: new Date(from.getTime() - length), prevTo: new Date(until.getTime() - length) };
}
