// Segregation-of-duties policy for Finance self-approval.
// Controlled by the FINANCE_SELF_APPROVAL env var:
//   'allow'  (default) — a Finance user may approve their own expense (legacy behavior)
//   'block'            — a Finance user's own expense needs a different Finance approver
// When 'block' is set but no other active Finance user exists, callers fall back to
// allowing self-approval to avoid an unresolvable deadlock (single-Finance teams).
export function financeSelfApprovalAllowed(): boolean {
  return (process.env.FINANCE_SELF_APPROVAL ?? 'allow').toLowerCase() !== 'block';
}
