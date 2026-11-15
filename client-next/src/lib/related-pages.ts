// Shortcut links to the pages that belong with the one you are on. They appear in the top bar on every page that has an entry here.
// One list, so the links stay consistent: a page is added here, never wired up inside the page itself.
// A link to a page the role cannot open is left out (see route-access.ts).

import { canAccessRoute } from '@/lib/route-access';

export type RelatedLink = { label: string; href: string };

type Rule = { match: RegExp; links: (m: RegExpMatchArray) => RelatedLink[] };

const BUSINESS = { orders: 'orders', projects: 'projects', products: 'products' } as const;
const PLAN_KINDS = { project: 'projects', product: 'products', order: 'orders' } as const;

const PLAN = (tab: string): RelatedLink => ({ label: 'Budget plan', href: `/budget/planner?tab=${tab}` });
const L = {
  approvals: { label: 'Approvals', href: '/approvals' },
  expense: { label: 'Expense', href: '/expense' },
  income: { label: 'Income', href: '/income' },
  recurring: { label: 'Recurring', href: '/manage/recurring' },
  reports: { label: 'Reports', href: '/reporting' },
  analytics: { label: 'Analytics', href: '/analytics/resource-utilization' },
  planner: { label: 'Planner', href: '/budget/planner' },
  monitor: { label: 'Monitor', href: '/budget/monitor' },
  parts: { label: 'Part master', href: '/budget/parts' },
  rates: { label: 'Cost rates', href: '/budget/rates' },
  projects: { label: 'Projects', href: '/business/projects' },
  products: { label: 'Products', href: '/business/products' },
  orders: { label: 'Orders', href: '/business/orders' },
} satisfies Record<string, RelatedLink>;

// Specific pages first: the first rule that matches wins
const RULES: Rule[] = [
  // One project, product or order: its budget plan, and back to the list with it selected
  { match: /^\/business\/(orders|projects|products)\/(\d+)$/, links: (m) => {
    const kind = m[1] as keyof typeof BUSINESS; const id = m[2];
    const single = kind === 'orders' ? 'order' : kind === 'projects' ? 'project' : 'product';
    return [{ label: 'Budget plan', href: `/budget/planner/${single}/${id}` }, { label: `All ${kind}`, href: `/business/${kind}?id=${id}` }];
  } },
  // One budget plan: the record itself, and back to the list
  { match: /^\/budget\/planner\/(project|product|order)\/(\d+)$/, links: (m) => {
    const kind = m[1] as keyof typeof PLAN_KINDS; const id = m[2];
    return [{ label: `Open ${kind}`, href: `/business/${PLAN_KINDS[kind]}/${id}` }, { label: `All ${PLAN_KINDS[kind]}`, href: `/business/${PLAN_KINDS[kind]}?id=${id}` }];
  } },
  { match: /^\/budget\/planner\/overhead\/.+$/, links: () => [{ label: 'All overheads', href: '/budget/planner?tab=overheads' }, L.monitor] },
  { match: /^\/business\/projects$/, links: () => [PLAN('projects'), L.analytics, L.reports] },
  { match: /^\/business\/products$/, links: () => [PLAN('products'), L.parts, L.rates] },
  { match: /^\/business\/orders$/, links: () => [PLAN('orders'), L.products] },
  { match: /^\/manage\/clients$/, links: () => [L.projects, L.products, L.orders] },
  { match: /^\/budget\/parts$/, links: () => [L.products, L.rates] },
  { match: /^\/budget\/rates$/, links: () => [L.parts, L.products] },
  { match: /^\/budget\/planner$/, links: () => [L.monitor, L.analytics] },
  { match: /^\/budget\/monitor$/, links: () => [L.planner, L.analytics] },
  { match: /^\/budget\/settings$/, links: () => [L.planner, L.monitor] },
  { match: /^\/analytics\/resource-utilization$/, links: () => [L.reports, L.monitor, L.planner] },
  { match: /^\/reporting$/, links: () => [L.analytics, L.monitor] },
  { match: /^\/expense$/, links: () => [L.approvals, L.recurring, L.reports] },
  { match: /^\/income$/, links: () => [L.recurring, L.reports] },
  { match: /^\/approvals$/, links: () => [L.expense, L.income] },
  { match: /^\/manage\/recurring$/, links: () => [L.expense, L.income] },
  { match: /^\/transactions$/, links: () => [L.expense, L.income, L.reports] },
];

export function relatedLinks(pathname: string, roleName?: string | null): RelatedLink[] {
  const path = pathname.replace(/\/+$/, '') || '/';
  const rule = RULES.find((r) => r.match.test(path));
  if (!rule) return [];
  const m = path.match(rule.match)!;
  return rule.links(m).filter((l) => {
    const target = l.href.split('?')[0];
    return target !== path && canAccessRoute(target, roleName);
  });
}
