/**
 * Shared GST calculation utilities for the frontend.
 * Used by transaction-modal, recurring page, and any future form that handles GST.
 */

/**
 * Parses a GST rate string (e.g. "18%" → 18, "" → null).
 */
export function parseGstRate(rateStr: string): number | null {
  if (!rateStr) return null;
  const n = Number(rateStr.replace('%', ''));
  return isNaN(n) || n === 0 ? null : n;
}

/**
 * Resolves net and total amounts from an entered amount and GST settings.
 *
 * @param enteredAmount - The amount the user typed into the form
 * @param gstRate       - GST rate as a number (e.g. 18), or null for no GST
 * @param gstIncluded   - true  → user entered the TOTAL (GST already inside); net is back-calculated
 *                        false → user entered the NET; total is computed by adding GST on top
 */
export function resolveGstAmounts(
  enteredAmount: number,
  gstRate: number | null,
  gstIncluded: boolean,
): { netAmount: number; totalAmount: number } {
  if (!gstRate) return { netAmount: enteredAmount, totalAmount: enteredAmount };
  if (gstIncluded) {
    const net = parseFloat((enteredAmount / (1 + gstRate / 100)).toFixed(2));
    return { netAmount: net, totalAmount: enteredAmount };
  }
  const total = parseFloat((enteredAmount * (1 + gstRate / 100)).toFixed(2));
  return { netAmount: enteredAmount, totalAmount: total };
}

/**
 * Returns the total amount for duplicate-check and display purposes.
 * Convenience wrapper over resolveGstAmounts when you only need totalAmount.
 */
export function computeTotalAmount(enteredAmount: number, gstRateStr: string, gstIncluded: boolean): number {
  return resolveGstAmounts(enteredAmount, parseGstRate(gstRateStr), gstIncluded).totalAmount;
}

/**
 * Returns the label hint for the Amount field based on current GST state.
 * e.g. "(Net, excl. GST)" / "(Total incl. GST)" / ""
 */
export function amountLabel(gstRateStr: string, gstIncluded: boolean): string {
  if (!gstRateStr) return '';
  return gstIncluded ? '(Total incl. GST)' : '(Net, excl. GST)';
}

/**
 * Given a saved transaction's fields, returns the amount the user originally entered
 * so edit forms can pre-fill correctly.
 *
 * @param netAmount   - stored net_amount
 * @param totalAmount - stored total_amount
 * @param gstIncluded - stored gst_included flag
 * @param fallback    - fallback amount field
 */
export function restoreEnteredAmount(
  netAmount: number | null | undefined,
  totalAmount: number | null | undefined,
  gstIncluded: boolean,
  fallback: number,
): number {
  if (gstIncluded) return totalAmount ?? fallback;
  return netAmount ?? fallback;
}
