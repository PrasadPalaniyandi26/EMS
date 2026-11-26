import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { BudgetPlanningService } from '../budgets/budget-planning.service';
import { BuildOrdersService } from '../budgets/build-orders.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { InvoicingService } from '../invoicing/invoicing.service';
import { DashboardService } from './dashboard.service';
import { COMMITTED_STATUSES, committedStatusSql } from '../common/constants/transaction-status';
import { parseRange, today } from '../common/helpers/dates';
import { workingDaysBetween } from '../common/helpers/working-days';

const DAY = 86400000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => Number(v) || 0;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BUDGET_ROLES = ['ADMIN', 'FINANCE', 'MANAGER', 'OPERATIONS', 'CONFIGURATOR'];
const INVOICE_ROLES = ['ADMIN', 'FINANCE', 'MANAGER', 'OPERATIONS'];
const OPEN_ORDER = ['COMMITTED', 'RELEASED', 'IN_BUILD'];
const TONE_RANK = { danger: 0, warning: 1, info: 2 } as const;

type Attention = { key: string; tone: 'danger' | 'warning' | 'info'; label: string; detail: string; count: number; href: string };

// One call for the Home page: what the business has earned and spent, where it stands against plan, what is waiting, and what needs a look.
// The people it covers follow the same data scope as the analytics pages (Admin and Finance everyone, a Manager their team, others themselves).
@Injectable()
export class DashboardOverviewService {
  constructor(
    private prisma: PrismaService,
    private dash: DashboardService,
    private budgets: BudgetsService,
    private planning: BudgetPlanningService,
    private orders: BuildOrdersService,
    private approvals: ApprovalsService,
    private invoicing: InvoicingService,
  ) {}

  async overview(user: { id: number; role_name?: string }, dateFrom?: string, dateTo?: string) {
    const range = parseRange(dateFrom, dateTo);
    const role = (user.role_name || '').toUpperCase();
    const ids = await this.dash.visibleUserIds(user.id, role);
    const userWhere = ids === null ? {} : { userId: { in: ids } };
    const budgetRole = BUDGET_ROLES.includes(role);

    const dateWhere = (from?: Date, to?: Date) => (from || to ? { dateRecorded: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {});
    const totalsFor = async (from?: Date, to?: Date) => {
      const where = { ...userWhere, status: { in: COMMITTED_STATUSES }, ...dateWhere(from, to) };
      const [inc, exp, approved, count] = await Promise.all([
        this.prisma.transaction.aggregate({ where: { ...where, type: 'income' }, _sum: { amount: true } }),
        this.prisma.transaction.aggregate({ where: { ...where, type: 'expense' }, _sum: { amount: true } }),
        this.prisma.transaction.aggregate({ where: { ...where, type: 'expense', status: 'APPROVED' }, _sum: { amount: true } }),
        this.prisma.transaction.count({ where }),
      ]);
      const income = r2(num(inc._sum.amount)); const expenses = r2(num(exp._sum.amount));
      return { income, expenses, net: r2(income - expenses), margin_pct: income > 0 ? r2(((income - expenses) / income) * 100) : null, expenses_approved: r2(num(approved._sum.amount)), expenses_pending: r2(expenses - num(approved._sum.amount)), count };
    };

    // The period just before the chosen one, of the same length, so every figure can say what it compares to
    let prevRange: { from: Date; to: Date } | null = null;
    if (range.from && range.to) {
      const days = Math.round((range.to.getTime() - range.from.getTime()) / DAY) + 1;
      const to = new Date(range.from.getTime() - DAY);
      prevRange = { from: new Date(to.getTime() - (days - 1) * DAY), to };
    }

    const [totals, previous, series, partsNow, partsPrev, pendingAgg, oldestPending, reimb, drafts, mine, recent] = await Promise.all([
      totalsFor(range.from, range.to),
      prevRange ? totalsFor(prevRange.from, prevRange.to) : Promise.resolve(null),
      this.series(ids),
      this.expenseParts(userWhere, range.from, range.to),
      prevRange ? this.expenseParts(userWhere, prevRange.from, prevRange.to) : Promise.resolve([]),
      this.prisma.transaction.aggregate({ where: { ...userWhere, type: 'expense', status: { in: ['PENDING_MANAGER', 'PENDING_FINANCE'] } }, _sum: { amount: true }, _count: true }),
      this.prisma.transaction.findFirst({ where: { ...userWhere, type: 'expense', status: { in: ['PENDING_MANAGER', 'PENDING_FINANCE'] }, submittedAt: { not: null } }, orderBy: { submittedAt: 'asc' }, select: { submittedAt: true } }),
      this.prisma.transaction.aggregate({
        where: { ...userWhere, type: 'expense', status: 'APPROVED', needsReimbursement: true, OR: [{ reimbursementStatus: null }, { reimbursementStatus: { notIn: ['PAID', 'ON_HOLD'] } }] },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.transaction.count({ where: { userId: user.id, status: { in: ['DRAFT', 'SENT_BACK'] } } }),
      this.approvals.getPending(user.id).then((r) => r.length),
      this.prisma.transaction.findMany({
        where: { ...userWhere, status: { notIn: ['DELETED', 'VOIDED'] } },
        include: { category: { select: { name: true } }, user: { select: { username: true } } },
        orderBy: [{ dateRecorded: 'desc' }, { id: 'desc' }], take: 8,
      }),
    ]);

    // Spending by category, with the same category in the period before
    const names = new Map((await this.prisma.category.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
    const sumBy = (parts: { categoryId: number | null; amount: number }[]) => { const m = new Map<number | null, number>(); for (const p of parts) m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + p.amount); return m; };
    const nowBy = sumBy(partsNow); const prevBy = sumBy(partsPrev);
    const catTotal = [...nowBy.values()].reduce((a, b) => a + b, 0);
    const ranked = [...nowBy.entries()].sort((a, b) => b[1] - a[1]);
    const catRows = ranked.slice(0, 6).map(([id, amount]) => ({ id, name: (id != null ? names.get(id) : null) ?? 'Uncategorized', amount: r2(amount), previous: prevRange ? r2(prevBy.get(id) ?? 0) : null, share: catTotal > 0 ? r2((amount / catTotal) * 100) : 0 }));
    const rest = ranked.slice(6);
    if (rest.length) {
      const amount = rest.reduce((a, [, v]) => a + v, 0);
      catRows.push({ id: null, name: `${rest.length} other categories`, amount: r2(amount), previous: prevRange ? r2(rest.reduce((a, [id]) => a + (prevBy.get(id) ?? 0), 0)) : null, share: catTotal > 0 ? r2((amount / catTotal) * 100) : 0 });
    }

    const approvalsBlock = {
      mine, drafts,
      pending_count: pendingAgg._count, pending_amount: r2(num(pendingAgg._sum.amount)),
      oldest_days: oldestPending?.submittedAt ? Math.max(0, workingDaysBetween(oldestPending.submittedAt, new Date())) : null,
    };
    const reimbursements = { due_count: reimb._count, due_amount: r2(num(reimb._sum.amount)) };

    // Budget and the portfolio are for the roles that can open those pages
    let budget: any = null; let portfolio: any = null;
    if (budgetRole) {
      const scope = role === 'MANAGER' ? { ownerId: user.id } : {};
      const [m, projects, projectMeta, orders] = await Promise.all([
        this.budgets.monitor(undefined, scope),
        this.planning.projects(),
        this.prisma.project.findMany({ where: { isActive: true, isSystem: false }, select: { id: true, status: true, end_date: true } }),
        this.orders.list(),
      ]);
      if (m.plan && m.kpis) {
        const lines = (m.lines as any[]).filter((l) => !l.is_contingency && l.cost_object !== 'RESERVE' && l.total > 0);
        const used = r2(m.kpis.actual + m.kpis.committed);
        budget = {
          fy: m.fy, label: m.label, plan_status: m.plan.status,
          approved: m.kpis.approved, actual: m.kpis.actual, committed: m.kpis.committed, used, forecast: m.kpis.forecast,
          pct: m.kpis.approved > 0 ? r2((used / m.kpis.approved) * 100) : null,
          open_alerts: m.kpis.open_alerts, unbudgeted: m.kpis.unbudgeted, unbudgeted_count: m.kpis.unbudgeted_count,
          over_lines: lines.filter((l) => l.pct >= 100).length, caution_lines: lines.filter((l) => l.pct >= 80 && l.pct < 100).length, line_count: lines.length,
          lines: lines.sort((a, b) => b.pct - a.pct).slice(0, 5).map((l) => ({ id: l.id, label: l.label, budget: l.total, used: l.used, pct: l.pct, status: l.status })),
          elapsed_pct: await this.elapsedPct(m.fy),
        };
      }
      portfolio = this.portfolio(projects, projectMeta as any[], orders);
    }

    // What clients owe is for the roles that can open Clients and its invoices
    const receivables = INVOICE_ROLES.includes(role) ? await this.invoicing.homeBlock() : null;

    const attention = this.attention({ approvalsBlock, reimbursements, budget, portfolio, receivables });

    return {
      as_of: new Date().toISOString(),
      scope: ids === null ? 'everyone' : ids.length > 1 ? 'team' : 'self',
      period: { from: range.from ?? null, to: range.to ?? null },
      totals, previous, series,
      categories: { rows: catRows, total: r2(catTotal) },
      approvals: approvalsBlock, reimbursements, budget, portfolio, receivables, attention,
      recent: recent.map((t) => ({
        id: t.id, reference: t.referenceId, type: t.type, amount: num(t.amount), status: t.status, date: t.dateRecorded,
        description: t.description, category: t.category?.name ?? null, who: t.user?.username ?? null,
      })),
    };
  }

  // The last twelve months: income, expenses, net and the running net
  private async series(ids: number[] | null) {
    const cutoff = today();
    cutoff.setUTCDate(1); cutoff.setUTCMonth(cutoff.getUTCMonth() - 11);
    const who = ids === null ? Prisma.empty : Prisma.sql`AND user_id = ANY(${ids}::int[])`;
    const rows = await this.prisma.$queryRaw<{ yr: number; mo: number; type: string; total: number }[]>`
      SELECT EXTRACT(YEAR FROM date_recorded)::int AS yr, EXTRACT(MONTH FROM date_recorded)::int AS mo, type, SUM(amount)::float AS total
      FROM transactions
      WHERE date_recorded >= ${cutoff} AND status IN ${Prisma.raw(committedStatusSql)} ${who}
      GROUP BY yr, mo, type`;
    const map = new Map<string, { income: number; expense: number }>();
    for (const r of rows) { const k = `${r.yr}-${r.mo}`; const e = map.get(k) ?? { income: 0, expense: 0 }; if (r.type === 'income') e.income = r.total; if (r.type === 'expense') e.expense = r.total; map.set(k, e); }
    const now = today();
    let running = 0;
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1));
      const e = map.get(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`) ?? { income: 0, expense: 0 };
      const net = r2(e.income - e.expense); running = r2(running + net);
      return { label: MON[d.getUTCMonth()], year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, income: r2(e.income), expense: r2(e.expense), net, cumulative: running };
    });
  }

  // Expense amounts by category; a split expense counts under each category it was split into
  private async expenseParts(userWhere: object, from?: Date, to?: Date) {
    const txns = await this.prisma.transaction.findMany({
      where: { ...userWhere, type: 'expense', status: { in: COMMITTED_STATUSES }, ...(from || to ? { dateRecorded: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      select: { amount: true, categoryId: true, isSplit: true, splits: { select: { amount: true, categoryId: true } } },
    });
    const out: { categoryId: number | null; amount: number }[] = [];
    for (const t of txns) {
      if (t.isSplit && t.splits.length) for (const s of t.splits) out.push({ categoryId: s.categoryId, amount: num(s.amount) });
      else out.push({ categoryId: t.categoryId, amount: num(t.amount) });
    }
    return out;
  }

  // Share of the financial year that has passed, counted from its own first month
  private async elapsedPct(fy: number) {
    const start = (await this.budgets.getSettings()).fyStartMonth;
    const now = today();
    const months = this.budgets.fyMonths(fy, start);
    const at = months.findIndex((m) => m.year === now.getUTCFullYear() && m.month === now.getUTCMonth() + 1);
    if (at < 0) return now.getTime() < Date.UTC(months[0].year, months[0].month - 1, 1) ? 0 : 100;
    const dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    return r2(((at + now.getUTCDate() / dim) / 12) * 100);
  }

  private portfolio(projects: any[], meta: { id: number; status: string | null; end_date: Date | null }[], orders: any[]) {
    const day = today();
    const metaOf = new Map(meta.map((m) => [m.id, m]));
    const rows = projects.map((p) => {
      const m = metaOf.get(p.id);
      const status = m?.status || 'Active';
      const overdue = status === 'Active' && !!m?.end_date && m.end_date.getTime() < day.getTime();
      const est = p.estimate_total as number | null;
      const overSpent = est != null && est > 0 && p.actual > est;
      const lowMargin = p.projected_margin_pct != null && (p.projected_margin_pct < 0 || (p.min_margin_pct != null && p.projected_margin_pct < p.min_margin_pct));
      return {
        id: p.id, code: p.code, name: p.name, client: p.client_name, status, overdue, at_risk: overSpent || lowMargin,
        contract_value: p.contract_value, estimate: est, spent: p.actual, pct: est ? r2((p.actual / est) * 100) : null, margin_pct: p.projected_margin_pct,
      };
    });
    const active = rows.filter((r) => r.status === 'Active' || r.status === 'On-Hold');
    const open = orders.filter((o) => OPEN_ORDER.includes(o.status));
    const costed = open.filter((o) => o.total_value != null && o.total_cost != null && o.total_value > 0);
    const value = costed.reduce((a, o) => a + o.total_value, 0);
    const cost = costed.reduce((a, o) => a + o.total_cost, 0);
    const next = [...open].sort((a, b) => String(a.delivery_date).localeCompare(String(b.delivery_date))).slice(0, 4).map((o) => ({
      id: o.id, code: o.code, product: o.product_name, customer: o.client_name, delivery_date: o.delivery_date, status: o.status, value: o.total_value,
      days: workingDaysBetween(day, new Date(o.delivery_date)), late: !!o.late,
    }));
    return {
      projects: {
        active: active.length, at_risk: rows.filter((r) => r.at_risk && r.status === 'Active').length, overdue: rows.filter((r) => r.overdue).length,
        contract_value: r2(active.reduce((a, r) => a + (r.contract_value ?? 0), 0)),
        estimate: r2(active.reduce((a, r) => a + (r.estimate ?? 0), 0)), spent: r2(active.reduce((a, r) => a + r.spent, 0)),
        top: [...active].sort((a, b) => Number(b.at_risk) - Number(a.at_risk) || b.spent - a.spent).slice(0, 5),
      },
      orders: {
        open: open.length, value: r2(open.reduce((a, o) => a + (o.total_value ?? 0), 0)), margin_pct: value > 0 ? r2(((value - cost) / value) * 100) : null,
        late: open.filter((o) => o.late).length, no_bom: open.filter((o) => !o.has_bom && o.status === 'COMMITTED').length, next,
      },
    };
  }

  // What needs a look, worst first, each with the page that deals with it
  private attention(x: { approvalsBlock: any; reimbursements: any; budget: any; portfolio: any; receivables: any }): Attention[] {
    const out: Attention[] = [];
    const add = (key: string, tone: Attention['tone'], count: number, label: string, detail: string, href: string) => { if (count > 0) out.push({ key, tone, label, detail, count, href }); };
    const a = x.approvalsBlock;
    add('mine', a.oldest_days != null && a.oldest_days > 3 ? 'danger' : 'warning', a.mine, `${a.mine} ${a.mine === 1 ? 'approval' : 'approvals'} waiting for you`, a.oldest_days != null ? `Oldest request is ${a.oldest_days} ${a.oldest_days === 1 ? 'day' : 'days'} old` : 'Open Approvals to decide them', '/approvals');
    if (x.budget) {
      add('over', 'danger', x.budget.over_lines, `${x.budget.over_lines} budget ${x.budget.over_lines === 1 ? 'line is' : 'lines are'} over the limit`, `${x.budget.label} plan`, '/budget/monitor');
      add('caution', 'warning', x.budget.caution_lines, `${x.budget.caution_lines} budget ${x.budget.caution_lines === 1 ? 'line is' : 'lines are'} near the limit`, 'Above 80% used', '/budget/monitor');
      add('unbudgeted', 'warning', x.budget.unbudgeted_count, `${x.budget.unbudgeted_count} ${x.budget.unbudgeted_count === 1 ? 'expense' : 'expenses'} outside the plan`, 'Spend with no budget line', '/budget/monitor');
    }
    if (x.portfolio) {
      const p = x.portfolio.projects; const o = x.portfolio.orders;
      add('late', 'danger', o.late, `${o.late} ${o.late === 1 ? 'order' : 'orders'} cannot meet the promised date`, 'Parts arrive after delivery', '/business/orders');
      add('risk', 'danger', p.at_risk, `${p.at_risk} ${p.at_risk === 1 ? 'project is' : 'projects are'} at risk`, 'Margin below minimum or over the estimate', '/business/projects');
      add('overdue', 'warning', p.overdue, `${p.overdue} ${p.overdue === 1 ? 'project is' : 'projects are'} past the end date`, 'Still marked Active', '/business/projects');
      add('nobom', 'info', o.no_bom, `${o.no_bom} ${o.no_bom === 1 ? 'order has' : 'orders have'} no BOM yet`, 'Import it to cost the order', '/business/orders');
    }
    if (x.receivables) {
      const r = x.receivables;
      add('inv-overdue', r.oldest_overdue_days > 30 ? 'danger' : 'warning', r.overdue_count, `${r.overdue_count} client ${r.overdue_count === 1 ? 'invoice is' : 'invoices are'} overdue`, `Oldest is ${r.oldest_overdue_days} ${r.oldest_overdue_days === 1 ? 'day' : 'days'} late`, '/manage/clients?tab=invoices');
      add('inv-draft', 'info', r.drafts, `${r.drafts} ${r.drafts === 1 ? 'invoice is a draft' : 'invoices are drafts'}`, 'Issue them to bill the client', '/manage/clients?tab=invoices');
      add('po-expiring', 'info', r.expiring_pos, `${r.expiring_pos} client ${r.expiring_pos === 1 ? 'PO ends' : 'POs end'} within 14 days`, 'Invoice before it lapses', '/manage/clients?tab=pos');
    }
    add('reimb', 'info', x.reimbursements.due_count, `${x.reimbursements.due_count} ${x.reimbursements.due_count === 1 ? 'claim' : 'claims'} to reimburse`, 'Approved and not yet paid', '/reimbursements');
    add('drafts', 'info', a.drafts, `${a.drafts} ${a.drafts === 1 ? 'draft' : 'drafts'} of yours to finish`, 'Draft or sent back', '/expense');
    return out.sort((p, q) => TONE_RANK[p.tone] - TONE_RANK[q.tone]).slice(0, 7);
  }
}
