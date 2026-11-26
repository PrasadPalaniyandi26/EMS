import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { COMMITTED_STATUSES, committedStatusSql } from '../common/constants/transaction-status';
import { ApprovalsService } from '../approvals/approvals.service';
import { parseRange, today } from '../common/helpers/dates';
import { previousPeriod } from './previous-period';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService, private budgets: BudgetsService, private approvals: ApprovalsService) {}

  async getSummary(userId: number, dateFrom?: string, dateTo?: string) {
    parseRange(dateFrom, dateTo);
    const where: any = { userId, status: { in: COMMITTED_STATUSES } };
    if (dateFrom || dateTo) {
      where.dateRecorded = {};
      if (dateFrom) where.dateRecorded.gte = new Date(dateFrom);
      if (dateTo) where.dateRecorded.lte = new Date(dateTo);
    }

    const [incomeAgg, expenseAgg, transactionCount, recentTransactions] = await Promise.all([
      this.prisma.transaction.aggregate({ where: { ...where, type: 'income' }, _sum: { amount: true } }),
      this.prisma.transaction.aggregate({ where: { ...where, type: 'expense' }, _sum: { amount: true } }),
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where, include: { category: true },
        orderBy: [{ dateRecorded: 'desc' }, { id: 'desc' }], take: 5,
      }),
    ]);

    const totalIncome = parseFloat((Number(incomeAgg._sum.amount) || 0).toFixed(2));
    const totalExpenses = parseFloat((Number(expenseAgg._sum.amount) || 0).toFixed(2));

    // The period of the same length that ends the day before this one starts, so a figure can say what it compares to
    let previous: { totalIncome: number; totalExpenses: number; balance: number } | null = null;
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
      const prevTo = new Date(from.getTime() - 86400000);
      const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
      const prevWhere = { userId, status: { in: COMMITTED_STATUSES }, dateRecorded: { gte: prevFrom, lte: prevTo } };
      const [pi, pe] = await Promise.all([
        this.prisma.transaction.aggregate({ where: { ...prevWhere, type: 'income' }, _sum: { amount: true } }),
        this.prisma.transaction.aggregate({ where: { ...prevWhere, type: 'expense' }, _sum: { amount: true } }),
      ]);
      const prevIncome = parseFloat((Number(pi._sum.amount) || 0).toFixed(2));
      const prevExpenses = parseFloat((Number(pe._sum.amount) || 0).toFixed(2));
      previous = { totalIncome: prevIncome, totalExpenses: prevExpenses, balance: parseFloat((prevIncome - prevExpenses).toFixed(2)) };
    }

    return {
      totalIncome, totalExpenses, balance: parseFloat((totalIncome - totalExpenses).toFixed(2)),
      previous,
      transactionCount,
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id, type: t.type, amount: t.amount, date_recorded: t.dateRecorded,
        category_name: t.category?.name, description: t.description, status: t.status,
      })),
    };
  }

  async getByCategory(userId: number, dateFrom?: string, dateTo?: string) {
    parseRange(dateFrom, dateTo);
    const where: any = { userId, status: { in: COMMITTED_STATUSES } };
    if (dateFrom || dateTo) {
      where.dateRecorded = {};
      if (dateFrom) where.dateRecorded.gte = new Date(dateFrom);
      if (dateTo) where.dateRecorded.lte = new Date(dateTo);
    }

    const result = await this.prisma.transaction.groupBy({
      by: ['categoryId', 'type'],
      where,
      _sum: { amount: true },
      _count: true,
    });

    // Single batch fetch of all needed categories (was: N+1)
    const categoryIds = [...new Set(result.map((r) => r.categoryId).filter(Boolean))] as number[];
    const categories = categoryIds.length
      ? await this.prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
      : [];
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

    return result.map((r) => ({
      category_id: r.categoryId,
      category_name: catMap[r.categoryId!] || 'Unknown',
      type: r.type,
      total: Number(r._sum.amount) || 0,
      count: r._count,
    }));
  }

  async getMonthlyTrend(userId: number) {
    // Single SQL query replaces the previous 24 individual Prisma calls (12 months × 2 types)
    const t = today();
    const cutoff = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 11, 1));

    const rows = await this.prisma.$queryRaw<
      { yr: number; mo: number; type: string; total: number }[]
    >`
      SELECT
        EXTRACT(YEAR  FROM date_recorded)::int AS yr,
        EXTRACT(MONTH FROM date_recorded)::int AS mo,
        type,
        SUM(amount)::float                     AS total
      FROM transactions
      WHERE user_id = ${userId}
        AND date_recorded >= ${cutoff}
        AND status IN ${Prisma.raw(committedStatusSql)}
      GROUP BY yr, mo, type
      ORDER BY yr, mo
    `;

    // Build lookup map keyed by "YYYY-M"
    const dataMap: Record<string, { income: number; expense: number }> = {};
    for (const r of rows) {
      const key = `${r.yr}-${r.mo}`;
      if (!dataMap[key]) dataMap[key] = { income: 0, expense: 0 };
      if (r.type === 'income') dataMap[key].income = r.total;
      if (r.type === 'expense') dataMap[key].expense = r.total;
    }

    // Produce ordered 12-month array, filling gaps with zeros
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const entry = dataMap[key] || { income: 0, expense: 0 };
      return {
        month: d.toLocaleString('default', { month: 'short' }),
        year: d.getFullYear(),
        income: entry.income,
        expense: entry.expense,
      };
    });
  }

  // Lines closest to or over their budget, from the active plan
  async getBudgetUtilization(userId: number, roleName: string) {
    const role = (roleName || '').toUpperCase();
    // Budget is read by the same roles as the Budget screens, and a Manager sees only the lines they own
    if (!['ADMIN', 'FINANCE', 'MANAGER', 'OPERATIONS', 'CONFIGURATOR'].includes(role)) return [];
    const lines = await this.budgets.dashboardLines(6, role === 'MANAGER' ? { ownerId: userId } : {});
    return lines.map((l) => ({ category_id: l.id, category_name: l.label, budget: l.budget, spent: l.spent, remaining: l.remaining, pct: l.pct, status: l.status }));
  }

  async getApprovalCounts(userId: number, _roleName?: string) {
    const [draft, pendingManager, pendingFinance, approved, rejected] = await Promise.all([
      this.prisma.transaction.count({ where: { userId, status: 'DRAFT', type: 'expense' } }),
      this.prisma.transaction.count({ where: { userId, status: 'PENDING_MANAGER', type: 'expense' } }),
      this.prisma.transaction.count({ where: { userId, status: 'PENDING_FINANCE', type: 'expense' } }),
      this.prisma.transaction.count({ where: { userId, status: 'APPROVED', type: 'expense' } }),
      this.prisma.transaction.count({ where: { userId, status: 'REJECTED', type: 'expense' } }),
    ]);

    // The same list the Approvals page shows, so the two numbers always agree
    const pendingMyAction = (await this.approvals.getPending(userId)).length;

    return { draft, pendingManager, pendingFinance, approved, rejected, pendingMyAction };
  }

  async getProjectSpend(userId: number, dateFrom?: string, dateTo?: string) {
    parseRange(dateFrom, dateTo);
    const where: any = { userId, type: 'expense', status: { in: COMMITTED_STATUSES }, projectId: { not: null } };
    if (dateFrom || dateTo) {
      where.dateRecorded = {};
      if (dateFrom) where.dateRecorded.gte = new Date(dateFrom);
      if (dateTo) where.dateRecorded.lte = new Date(dateTo);
    }

    const rows = await this.prisma.transaction.groupBy({
      by: ['projectId'],
      where,
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 6,
    });

    if (!rows.length) return [];

    const projectIds = rows.map((r) => r.projectId).filter(Boolean) as number[];
    const projects = await this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } });
    const projMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

    return rows.map((r) => ({
      project_id: r.projectId,
      project_name: projMap[r.projectId!] || 'Unknown',
      spent: parseFloat((Number(r._sum.amount) || 0).toFixed(2)),
    }));
  }

  // ── Spend Analytics ────────────────────────────────────────────────────────

  // Resolves which users the caller may see across cross-user analytics.
  // Returns null = all users (no restriction); number[] = restrict to these IDs.
  // data_scope (set per-user by an admin) is authoritative; role is the fallback
  // when no permission row exists: Admin/Finance → All, Manager → Department, else Self.
  visibleUserIds(userId: number, roleName: string) { return this.resolveVisibleUserIds(userId, roleName); }

  private async resolveVisibleUserIds(userId: number, roleName: string): Promise<number[] | null> {
    const perm = await this.prisma.userPermission.findUnique({ where: { userId } });
    const role = (roleName || '').toUpperCase();
    const fallback = role === 'ADMIN' || role === 'FINANCE' ? 'All' : role === 'MANAGER' ? 'Department' : 'Self';
    const scope = perm?.dataScope || fallback;

    if (scope === 'All') return null;
    if (scope === 'Self') return [userId];
    // Department → the user plus everyone in their reporting tree.
    const rows = await this.prisma.$queryRawUnsafe<{ id: number }[]>(
      `WITH RECURSIVE tree AS (
         SELECT id FROM users WHERE id = $1
         UNION ALL
         SELECT u.id FROM users u JOIN tree t ON u.manager_id = t.id
       )
       SELECT id FROM tree`,
      userId,
    );
    return rows.map((r) => r.id);
  }

  async getTopSpenders(userId: number, roleName: string, dateFrom?: string, dateTo?: string) {
    parseRange(dateFrom, dateTo);
    const visibleIds = await this.resolveVisibleUserIds(userId, roleName);
    const where: any = { type: 'expense', status: { in: COMMITTED_STATUSES } };
    if (visibleIds !== null) where.userId = { in: visibleIds };
    if (dateFrom || dateTo) {
      where.dateRecorded = {};
      if (dateFrom) where.dateRecorded.gte = new Date(dateFrom);
      if (dateTo)   where.dateRecorded.lte = new Date(dateTo);
    }

    const rows = await this.prisma.transaction.groupBy({
      by: ['userId'],
      where,
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    });

    if (!rows.length) return [];

    const userIds = rows.map((r) => r.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.username]));

    return rows.map((r) => ({
      user_id:   r.userId,
      username:  userMap[r.userId] || 'Unknown',
      total:     parseFloat((Number(r._sum.amount) || 0).toFixed(2)),
      count:     r._count,
    }));
  }

  async getCategoryHeatmap(userId: number, roleName: string, dateFrom?: string, dateTo?: string) {
    const range = parseRange(dateFrom, dateTo);
    const visibleIds = await this.resolveVisibleUserIds(userId, roleName);
    const end = range.to ?? today();
    const start = range.from ?? (() => { const d = new Date(end); d.setUTCMonth(d.getUTCMonth() - 11); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); return d; })();

    // A split expense counts under each category it was split into, the same way Budget counts it
    const parts = await this.budgets.partsWhere({
      status: { in: COMMITTED_STATUSES },
      dateRecorded: { gte: start, lte: end },
      ...(visibleIds !== null ? { userId: { in: visibleIds } } : {}),
    });
    const names = new Map((await this.prisma.category.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
    const nameOf = (id: number | null) => (id != null ? names.get(id) : undefined) ?? 'Uncategorized';

    const catTotals = new Map<string, number>();
    for (const p of parts) catTotals.set(nameOf(p.categoryId), (catTotals.get(nameOf(p.categoryId)) ?? 0) + p.amount);
    const ranked = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const topCats = ranked.slice(0, 6);
    const hasOther = ranked.length > 6;

    // The months of the period, oldest first, at most the last 24
    // Dates arrive as UTC midnight, so the months are counted in UTC too
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months: { key: string; label: string }[] = [];
    for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); y * 12 + m <= end.getUTCFullYear() * 12 + end.getUTCMonth(); m++) {
      if (m === 12) { m = 0; y++; }
      months.push({ key: `${y}-${m + 1}`, label: `${MON[m]} ${String(y).slice(2)}` });
    }
    const shown = months.slice(-24);

    const dataMap: Record<string, Record<string, number>> = {};
    for (const p of parts) {
      const key = `${p.year}-${p.month}`;
      const cat = topCats.includes(nameOf(p.categoryId)) ? nameOf(p.categoryId) : 'Other';
      (dataMap[key] ??= {})[cat] = (dataMap[key][cat] ?? 0) + p.amount;
    }
    const categories = hasOther ? [...topCats, 'Other'] : topCats;

    return {
      categories,
      months: shown.map((m) => ({
        label: m.label,
        values: Object.fromEntries(categories.map((c) => [c, parseFloat((dataMap[m.key]?.[c] ?? 0).toFixed(2))])),
      })),
    };
  }

  // Where the period's spend went, which categories moved against the period before, and the largest expenses.
  // Counted like the heatmap: approved and waiting expenses, split ones by part. Stock counts once, when it is bought.
  async getSpendBreakdown(userId: number, roleName: string, dateFrom?: string, dateTo?: string) {
    const range = parseRange(dateFrom, dateTo);
    const visibleIds = await this.resolveVisibleUserIds(userId, roleName);
    const who = visibleIds !== null ? { userId: { in: visibleIds } } : {};
    const partsBetween = (gte?: Date, lte?: Date) => this.budgets.partsWhere({
      status: { in: COMMITTED_STATUSES }, ...who,
      ...(gte || lte ? { dateRecorded: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
    });
    const parts = await partsBetween(range.from, range.to);
    const r2 = (v: number) => Math.round(v * 100) / 100;

    const stockIds = new Set((await this.prisma.transaction.findMany({
      where: { id: { in: parts.map((p) => p.txnId) }, contextType: 'stock' }, select: { id: true },
    })).map((t) => t.id));
    const groupOf = (p: (typeof parts)[number]) => {
      if (stockIds.has(p.txnId)) return 'Stock purchases';
      if (p.costObject === 'DEPARTMENT') return 'Departments';
      if (p.costObject === 'PRODUCT') return p.buildOrderId != null ? 'Orders' : p.productId != null ? 'Products' : 'Not assigned';
      return p.projectId != null ? 'Projects' : 'Not assigned';
    };
    const grouped = new Map<string, number>();
    for (const p of parts) grouped.set(groupOf(p), (grouped.get(groupOf(p)) ?? 0) + p.amount);

    const names = new Map((await this.prisma.category.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
    const nameOf = (id: number | null | undefined) => (id != null ? names.get(id) : undefined) ?? 'Uncategorized';

    // A comparison needs a period with both ends
    let comparison: null | { from: string; to: string; previous_from: string; previous_to: string; rows: { category: string; now: number; before: number; change: number }[] } = null;
    if (range.from && range.to) {
      const day = (d: Date) => d.toISOString().slice(0, 10);
      const { until, prevFrom, prevTo } = previousPeriod(new Date(day(range.from)), new Date(day(range.to)), today());
      const totals = new Map<string, { now: number; before: number }>();
      const add = (list: typeof parts, key: 'now' | 'before') => {
        for (const p of list) {
          const row = totals.get(nameOf(p.categoryId)) ?? { now: 0, before: 0 };
          row[key] += p.amount;
          totals.set(nameOf(p.categoryId), row);
        }
      };
      add(await partsBetween(range.from, until), 'now');
      add(await partsBetween(prevFrom, prevTo), 'before');
      comparison = {
        from: day(range.from), to: day(until), previous_from: day(prevFrom), previous_to: day(prevTo),
        rows: [...totals.entries()]
          .map(([category, v]) => ({ category, now: r2(v.now), before: r2(v.before), change: r2(v.now - v.before) }))
          .filter((x) => x.change !== 0)
          .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
          .slice(0, 6),
      };
    }

    const byTxn = new Map<number, number>();
    for (const p of parts) byTxn.set(p.txnId, (byTxn.get(p.txnId) ?? 0) + p.amount);
    const top = [...byTxn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const txns = new Map((await this.prisma.transaction.findMany({
      where: { id: { in: top.map(([id]) => id) } },
      select: { id: true, referenceId: true, description: true, dateRecorded: true, isSplit: true, category: { select: { name: true } } },
    })).map((t) => [t.id, t]));

    return {
      total: r2(parts.reduce((a, p) => a + p.amount, 0)),
      charged_to: [...grouped.entries()].map(([label, amount]) => ({ label, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
      comparison,
      largest: top.map(([id, amount]) => {
        const t = txns.get(id)!;
        return {
          id, reference_id: t.referenceId, description: t.description, date_recorded: t.dateRecorded.toISOString().slice(0, 10),
          category: t.isSplit ? 'Split' : t.category?.name ?? 'Uncategorized', amount: r2(amount),
        };
      }),
    };
  }

  // Expense parts in the period for the people this user may see; the same rows Budget and Costing add up
  private async periodParts(userId: number, roleName: string, dateFrom?: string, dateTo?: string) {
    const range = parseRange(dateFrom, dateTo);
    const visibleIds = await this.resolveVisibleUserIds(userId, roleName);
    return this.budgets.partsWhere({
      status: { in: COMMITTED_STATUSES },
      ...(visibleIds !== null ? { userId: { in: visibleIds } } : {}),
      ...(range.from || range.to ? { dateRecorded: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}),
    });
  }

  async getProjectBurn(userId: number, roleName: string, dateFrom?: string, dateTo?: string) {
    const parts = await this.periodParts(userId, roleName, dateFrom, dateTo);
    // Project cost includes stock used, for people who see everyone's spend
    if ((await this.resolveVisibleUserIds(userId, roleName)) === null) {
      const range = parseRange(dateFrom, dateTo);
      parts.push(...(await this.budgets.stockParts({ kind: 'USED', projectId: { not: null }, ...(range.from || range.to ? { movedOn: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}) })));
    }
    const spentBy = new Map<number, number>();
    for (const p of parts) if (p.costObject === 'PROJECT' && p.projectId != null) spentBy.set(p.projectId, (spentBy.get(p.projectId) ?? 0) + p.amount);
    const spent = [...spentBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!spent.length) return [];

    const projectIds = spent.map(([id]) => id);
    const [projects, baselines] = await Promise.all([
      this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }),
      // The budget is the approved estimate baseline's direct cost; the newest approved one counts
      this.prisma.estimateBaseline.findMany({ where: { projectId: { in: projectIds }, status: 'APPROVED' }, orderBy: { id: 'desc' }, select: { projectId: true, direct: true } }),
    ]);
    const projMap = Object.fromEntries(projects.map((p) => [p.id, p]));
    const baseMap = new Map<number, number>();
    for (const b of baselines) if (!baseMap.has(b.projectId)) baseMap.set(b.projectId, Number(b.direct));

    return spent.map(([id, amount]) => {
      const spentAmt = parseFloat(amount.toFixed(2));
      const budget = parseFloat((baseMap.get(id) ?? 0).toFixed(2));
      return {
        project_id: id,
        project_name: projMap[id]?.name || 'Unknown',
        spent: spentAmt,
        budget,
        pct: budget > 0 ? parseFloat(((spentAmt / budget) * 100).toFixed(1)) : null,
      };
    });
  }

  async getProductBurn(userId: number, roleName: string, dateFrom?: string, dateTo?: string) {
    const parts = await this.periodParts(userId, roleName, dateFrom, dateTo);
    const spentBy = new Map<number, number>();
    for (const p of parts) if (p.costObject === 'PRODUCT' && p.productId != null) spentBy.set(p.productId, (spentBy.get(p.productId) ?? 0) + p.amount);
    const spent = [...spentBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!spent.length) return [];

    const productIds = spent.map(([id]) => id);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
    const prodMap = Object.fromEntries(products.map((p) => [p.id, p]));

    // A product's budget is what the budget plan allows for it, for the months in the chosen range
    const lines = await this.prisma.budgetLine.findMany({
      where: { costObject: 'PRODUCT', productId: { in: productIds }, isActive: true, isContingency: false },
      include: { periods: true },
    });
    const range = parseRange(dateFrom, dateTo);
    const from = range.from ? range.from.getTime() : null;
    const to = range.to ? range.to.getTime() : null;
    const planned = new Map<number, number>();
    for (const l of lines) {
      for (const p of l.periods) {
        const start = Date.UTC(p.year, p.month - 1, 1);
        const end = Date.UTC(p.year, p.month, 0);
        if ((from === null || end >= from) && (to === null || start <= to)) planned.set(l.productId!, (planned.get(l.productId!) ?? 0) + Number(p.amount));
      }
    }

    return spent.map(([id, amount]) => {
      const spentAmt = parseFloat(amount.toFixed(2));
      const budget = parseFloat((planned.get(id) ?? 0).toFixed(2));
      return {
        product_id: id,
        product_name: prodMap[id]?.name || 'Unknown',
        spent: spentAmt,
        budget,
        pct: budget > 0 ? parseFloat(((spentAmt / budget) * 100).toFixed(1)) : null,
      };
    });
  }

  async getRecent(userId: number) {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId, status: { notIn: ['DELETED', 'VOIDED'] } },
      include: { category: true },
      orderBy: [{ dateRecorded: 'desc' }, { id: 'desc' }],
      take: 10,
    });

    return transactions.map((t) => ({
      id: t.id, type: t.type, amount: t.amount, date_recorded: t.dateRecorded,
      category_name: t.category?.name, description: t.description,
      payment_method: t.paymentMethod,
    }));
  }
}
