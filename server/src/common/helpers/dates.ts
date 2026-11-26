import { BadRequestException } from '@nestjs/common';

// Date and year inputs on report and analytics endpoints: a bad value is a 400 with a message, never a server error.

const DAY = /^\d{4}-\d{2}-\d{2}/;

// Today's calendar date in the business time zone, as UTC midnight: the form DATE columns are read and written in.
export function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function parseDay(value: string | undefined | null, name: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const d = DAY.test(String(value)) ? new Date(String(value)) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${name} is not a valid date. Use the form 2026-04-30.`);
  return d;
}

export function parseRange(from?: string | null, to?: string | null): { from?: Date; to?: Date } {
  const f = parseDay(from, 'The start date');
  const t = parseDay(to, 'The end date');
  if (f && t && f.getTime() > t.getTime()) throw new BadRequestException('The start date is after the end date.');
  return { from: f, to: t };
}

export function parseYear(value?: string | null): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!/^\d{4}$/.test(String(value))) throw new BadRequestException('The financial year must be a four-digit year, for example 2026.');
  return parseInt(String(value), 10);
}
