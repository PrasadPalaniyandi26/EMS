import { HttpException, HttpStatus } from '@nestjs/common';

// Checks shared by the Manage records (clients, projects, products), so each says the same thing when a value is wrong.
const bad = (message: string, status = HttpStatus.BAD_REQUEST) => new HttpException(message, status);

// Trimmed text. Blank becomes null unless required.
export function cleanText(value: any, label: string, max: number, required = false): string | null {
  const s = String(value ?? '').trim();
  if (!s) {
    if (required) throw bad(`${label} is required.`);
    return null;
  }
  if (s.length > max) throw bad(`${label} can be at most ${max} characters.`);
  return s;
}

// A date the caller typed: blank is no date, anything else must be a real date.
export function cleanDate(value: any, label: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw bad(`Enter the ${label} as a real date.`);
  return d;
}

export function assertDateRange(start: Date | null, end: Date | null) {
  if (start && end && end.getTime() < start.getTime()) throw bad('The end date cannot be before the start date.');
}

export function cleanId(value: any, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw bad(`Choose the ${label}.`);
  return n;
}

export const PROJECT_STATUSES = ['Active', 'Proposed', 'On-Hold', 'Completed', 'Canceled'];
export const PRODUCT_STATUSES = ['R&D', 'Prototype', 'Pilot', 'Assembly', 'Quality', 'Production', 'Market Ready'];

// A status from the list, or the one the record already has (older data may use another word and must stay editable)
export function cleanStatus(value: any, allowed: string[], current?: string | null): string {
  const s = String(value ?? '').trim();
  if (allowed.includes(s) || (current != null && s === current)) return s;
  throw bad(`Status must be one of: ${allowed.join(', ')}.`);
}
