/**
 * Shared GST calculation utilities.
 * Used by TransactionsService, RecurringService, and any future module that handles GST.
 */

export interface GstResult {
  netAmount: number;
  totalAmount: number;
}

/**
 * Resolves net and total amounts from an entered amount and GST settings.
 *
 * @param amount    - The amount the user entered
 * @param gstRate   - GST rate as a percentage (e.g. 18), or null/0 for no GST
 * @param gstIncluded - true  → user entered the TOTAL (GST already inside); net is back-calculated
 *                     false → user entered the NET; total is computed by adding GST on top
 */
export function calcGst(amount: number, gstRate: number | null, gstIncluded: boolean): GstResult {
  if (!gstRate) return { netAmount: amount, totalAmount: amount };
  if (gstIncluded) {
    const net = parseFloat((amount / (1 + gstRate / 100)).toFixed(2));
    return { netAmount: net, totalAmount: amount };
  }
  const total = parseFloat((amount * (1 + gstRate / 100)).toFixed(2));
  return { netAmount: amount, totalAmount: total };
}

/**
 * Convenience builder: takes raw user input and returns Prisma-ready GST fields.
 * Spread directly into a Prisma create/update data object.
 *
 * Usage:
 *   const gstFields = buildGstFields(Number(data.amount), rawGstRate, !!data.gstIncluded);
 *   await prisma.transaction.create({ data: { ...gstFields, ...otherFields } });
 */
export function buildGstFields(
  enteredAmount: number,
  gstRate: number | null,
  gstIncluded: boolean,
): { amount: number; netAmount: number; totalAmount: number; gstRate: number | null; gstIncluded: boolean } {
  const { netAmount, totalAmount } = calcGst(enteredAmount, gstRate, gstIncluded);
  return { amount: totalAmount, netAmount, totalAmount, gstRate: gstRate ?? null, gstIncluded };
}

/**
 * Parses a GST rate string from the frontend (e.g. "18%" → 18, "" → null).
 */
export function parseGstRate(rateStr: string | null | undefined): number | null {
  if (!rateStr) return null;
  const n = Number(rateStr.replace('%', ''));
  return isNaN(n) || n === 0 ? null : n;
}