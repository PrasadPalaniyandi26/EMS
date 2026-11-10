import { redirect } from 'next/navigation';

// Month close now sits on the Monitor page, as a tab
export default function MonthlyClosePage() {
  redirect('/budget/monitor?tab=close');
}
