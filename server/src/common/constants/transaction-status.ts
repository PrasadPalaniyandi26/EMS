// Canonical transaction-status sets used by every aggregation surface.
// Single source of truth so reports, dashboard, and budgets agree on what
// "counts" toward financial totals.

export const TXN_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_MANAGER: 'PENDING_MANAGER',
  PENDING_FINANCE: 'PENDING_FINANCE',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SENT_BACK: 'SENT_BACK',
  VOIDED: 'VOIDED',
  DELETED: 'DELETED',
} as const;

export type TxnStatus = typeof TXN_STATUS[keyof typeof TXN_STATUS];

// Official actuals — what landed as real, fully-approved money.
// Used by reporting (P&L, GST, client/expense/income summaries, ledger).
export const COUNTABLE_STATUSES: TxnStatus[] = [TXN_STATUS.APPROVED];

// Approved + in-flight (still moving through the approval chain).
// Used by personal dashboard KPIs and forward-looking budget views so a
// user sees money they have submitted and expect to be reimbursed.
export const COMMITTED_STATUSES: TxnStatus[] = [
  TXN_STATUS.APPROVED,
  TXN_STATUS.PENDING_MANAGER,
  TXN_STATUS.PENDING_FINANCE,
];

// Statuses that must never count toward any financial total.
export const EXCLUDED_STATUSES: TxnStatus[] = [
  TXN_STATUS.DRAFT,
  TXN_STATUS.REJECTED,
  TXN_STATUS.SENT_BACK,
  TXN_STATUS.VOIDED,
  TXN_STATUS.DELETED,
];

// Prisma `where` fragment for the committed set (dashboard / budgets).
export const committedStatusWhere = { status: { in: COMMITTED_STATUSES } };

// Prisma `where` fragment for actuals only (official reports).
export const countableStatusWhere = { status: { in: COUNTABLE_STATUSES } };

// SQL `IN (...)` list for raw queries, e.g. `status IN ${committedStatusSql}`.
const quote = (arr: TxnStatus[]) => `(${arr.map((s) => `'${s}'`).join(', ')})`;
export const committedStatusSql = quote(COMMITTED_STATUSES);
export const countableStatusSql = quote(COUNTABLE_STATUSES);
