import { redirect } from 'next/navigation';

// The old per-user budget page was replaced by the budget planner
export default function BudgetsRedirect() {
  redirect('/budget/planner');
}
