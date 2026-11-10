'use client';

import { useEffect } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { ObjectChanges } from '@/components/budgets/object-changes';

// Everything waiting for a decision, in one place. New requests are made from the project, order or budget line they are about.
export default function BudgetChangesPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  useEffect(() => { setHeader('Budget changes', 'Requests to move, revise or release budget. Make a new request from the project, order or budget line'); }, [setHeader]);
  return <ObjectChanges />;
}
