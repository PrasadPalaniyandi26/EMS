// Segregation-of-duties policy for Finance self-approval.
// Controlled by the FINANCE_SELF_APPROVAL env var:
//   'block'  (default) — a Finance user's own expense needs a different Finance approver
//   'allow'            — a Finance user may approve their own expense (legacy behavior)
// When blocked but no other active Finance user exists, callers fall back to
// allowing self-approval to avoid an unresolvable deadlock (single-Finance teams).
export function financeSelfApprovalAllowed(): boolean {
  return (process.env.FINANCE_SELF_APPROVAL ?? 'block').toLowerCase() === 'allow';
}
