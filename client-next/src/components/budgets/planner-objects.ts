import type { BudgetChangeRow } from '@/hooks/use-planning-queries';
import type { BudgetLine, CostObject, MonitorLine } from '@/hooks/use-budget-queries';

// What a budget is planned for. The planner lists these, and each one opens to its own budget lines.
export type PlannerKind = 'project' | 'product' | 'order' | 'overhead' | 'reserve';

export const KIND_COST_OBJECT: Record<PlannerKind, CostObject> = { project: 'PROJECT', product: 'PRODUCT', order: 'ORDER', overhead: 'DEPARTMENT', reserve: 'RESERVE' };
export const KIND_LABEL: Record<PlannerKind, string> = { project: 'Project', product: 'Product', order: 'Order', overhead: 'Overhead', reserve: 'Company reserve' };
export const isKind = (k: string): k is PlannerKind => k in KIND_COST_OBJECT;

export const objectIdOf = (l: Pick<BudgetLine, 'cost_object' | 'project_id' | 'product_id' | 'build_order_id' | 'department_id'>): number | null => {
  switch (l.cost_object) {
    case 'PROJECT': return l.project_id;
    case 'PRODUCT': return l.product_id;
    case 'ORDER': return l.build_order_id;
    case 'DEPARTMENT': return l.department_id;
    default: return 0;
  }
};

export const linesOf = (lines: MonitorLine[], kind: PlannerKind, id: number) => lines.filter((l) => l.cost_object === KIND_COST_OBJECT[kind] && objectIdOf(l) === id);

export type ObjectStatus = 'No budget' | 'On track' | 'Caution' | 'Warning' | 'Critical' | 'Held';
const RANK: Record<ObjectStatus, number> = { Critical: 5, Warning: 4, Caution: 3, 'On track': 2, Held: 1, 'No budget': 0 };
export const STATUS_TONE: Record<ObjectStatus, 'success' | 'warning' | 'danger' | 'muted'> = { Critical: 'danger', Warning: 'warning', Caution: 'warning', 'On track': 'success', Held: 'muted', 'No budget': 'muted' };
// The sort order for lists: the ones that need a look come first, then the healthy ones, and those with no budget yet last
export const statusSort = (s: ObjectStatus) => (s === 'No budget' ? 20 : 10 - RANK[s]);

// One figure per object from its lines: the status is the worst line's
export function rollUp(lines: MonitorLine[]) {
  const planned = lines.reduce((a, l) => a + l.total, 0);
  const used = lines.reduce((a, l) => a + l.used, 0);
  const forecast = lines.reduce((a, l) => a + (l.forecast ?? 0), 0);
  const status = lines.reduce<ObjectStatus>((worst, l) => (RANK[l.status as ObjectStatus] > RANK[worst] ? (l.status as ObjectStatus) : worst), 'No budget');
  const alerts = lines.reduce((a, l) => a + l.open_alerts, 0);
  return { planned, used, left: planned - used, pct: planned > 0 ? (used / planned) * 100 : used > 0 ? 999 : 0, forecast, status, alerts, count: lines.length };
}

// Changes that move money into or out of any of these lines
export const changesFor = (changes: BudgetChangeRow[], lineIds: number[]) => {
  const ids = new Set(lineIds);
  return changes.filter((c) => (c.from_line_id != null && ids.has(c.from_line_id)) || (c.to_line_id != null && ids.has(c.to_line_id)));
};

export const detailHref = (kind: PlannerKind, id: number, fy: number | null) => `/budget/planner/${kind}/${id}${fy != null ? `?fy=${fy}` : ''}`;

export const kindOfLine = (l: Pick<BudgetLine, 'cost_object'>): PlannerKind => (Object.keys(KIND_COST_OBJECT) as PlannerKind[]).find((k) => KIND_COST_OBJECT[k] === l.cost_object) ?? 'reserve';
