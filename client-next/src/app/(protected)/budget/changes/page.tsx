import { redirect } from 'next/navigation';

// Changes now sit beside the lines they move money between, on the Monitor page
export default function BudgetChangesPage() {
  redirect('/budget/monitor?tab=changes');
}
