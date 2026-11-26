import { today } from './dates';

describe('today', () => {
  afterEach(() => jest.useRealTimers());

  it('is already the next day in India while UTC is still on the day before', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-25T20:00:00Z'));
    expect(today().toISOString()).toBe('2026-11-26T00:00:00.000Z');
  });
});
