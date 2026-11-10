import { redirect } from 'next/navigation';

// Alerts now sit beside the lines they are about, on the Monitor page
export default function BudgetAlertsPage() {
  redirect('/budget/monitor?tab=alerts');
}
