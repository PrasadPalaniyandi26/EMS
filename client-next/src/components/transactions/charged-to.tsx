'use client';

import { DetailSection, DetailGrid, DetailField } from '@/components/shared/detail/detail-kit';
import { RecordLink } from '@/components/budgets/budget-ui';

// Where a transaction is charged, and the way into that object's budget and costing. Shown in the panel of
// Expense, Income and Transactions, so the link between a record and Budget and Costing is the same everywhere.
export function ChargedToSection({ txn, showClient }: { txn: any; showClient?: boolean }) {
  const kind: 'project' | 'product' | 'overhead' | null =
    txn.context_type === 'overhead' ? 'overhead' : txn.context_type === 'product' ? 'product' : txn.context_type === 'project' ? 'project' : null;
  const objectId: number | null = kind === 'project' ? txn.project_id : kind === 'product' ? txn.product_id : kind === 'overhead' ? txn.department_id : null;
  const objectName: string | null = kind === 'project' ? txn.project_name : kind === 'product' ? txn.product_name : kind === 'overhead' ? txn.department_name : null;
  const isExpense = txn.type === 'expense';
  if (!kind && !txn.client_name) return null;

  const costingHref = kind === 'project' && objectId ? `/business/projects/${objectId}` : kind === 'product' && objectId ? `/business/products/${objectId}` : null;
  const planHref = kind && objectId ? `/budget/planner/${kind}/${objectId}` : null;

  return (
    <DetailSection title={isExpense ? 'Charged to' : 'Received for'}>
      <DetailGrid>
        <DetailField label={kind === 'overhead' ? 'Department' : kind === 'product' ? 'Product' : 'Project'} value={objectName ?? undefined} wide={!txn.build_order_code} />
        {txn.build_order_code && (
          <DetailField label="Order" value={<RecordLink href={`/business/orders/${txn.build_order_id}`}>{txn.build_order_code}</RecordLink>} />
        )}
        {showClient && <DetailField label="Client" value={txn.client_name} wide />}
        {isExpense && txn.over_budget_reason && <DetailField label="Over-budget reason" value={txn.over_budget_reason} tone="warning" wide />}
      </DetailGrid>
      {isExpense && (costingHref || planHref) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {planHref && <RecordLink href={planHref}>Budget</RecordLink>}
          {costingHref && <RecordLink href={costingHref}>Costing</RecordLink>}
        </div>
      )}
    </DetailSection>
  );
}
