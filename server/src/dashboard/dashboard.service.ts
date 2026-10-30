import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { COMMITTED_STATUSES, committedStatusSql } from '../common/constants/transaction-status';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService, private budgets: BudgetsService) {}

  async getSummary(userId: number, dateFrom?: string, dateTo?: string) {
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

    return {
      totalIncome, totalExpenses, balance: parseFloat((totalIncome - totalExpenses).toFixed(2)),
      transactionCount,
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id, type: t.type, amount: t.amount, date_recorded: t.dateRecorded,
        category_name: t.category?.name, description: t.description, status: t.status,
      })),
    };
  }

  async getByCategory(userId: number, dateFrom?: string, dateTo?: string) {
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
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 11);
    cutoff.setDate(1);
    cutoff.setHours(0, 0, 0, 0);

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
  async getBudgetUtilization(_userId: number) {
    const lines = await this.budgets.dashboardLines(6);
    return lines.map((l) => ({ category_id: l.id, category_name: l.label, budget: l.budget, spent: l.spent, remaining: l.remaining, pct: l.pct, status: l.status }));
  }

  async getApprovalCounts(userId: number, roleName: string) {
    const isFinance = roleName?.toLowerCase().includes('finance');
    const isManager = roleName?.toLowerCase().includes('manager') || roleName?.toLowerCase().includes('admin');

    const [draft, pendingManager, pendingFinance, approved, rejected] = await Promise.all([
      this.prisma.transaction.count({ where: { userId, status: 'DRAFT', type: 'expense' } }),
      this.prisma.transaction.count({ where: { userId, status: 'PENDING_MANAGER', type: 'expense' } }),
      this.prisma.transaction.count({ where: { userId, status: 'PENDING_FINANCE', type: 'expense' } }),
      this.prisma.transaction.count({ where: { userId, status: 'APPROVED', type: 'expense' } }),
      this.prisma.transaction.count({ where: { userId, status: 'REJECTED', type: 'expense' } }),
    ]);

    let pendingMyAction = 0;
    if (isFinance || isManager) {
      pendingMyAction = await this.prisma.approvalRequest.count({ where: { approverId: userId, status: 'PENDING' } });
    }

    return { draft, pendingManager, pendingFinance, approved, rejected, pendingMyAction };
  }

  async getProjectSpend(userId: number, dateFrom?: string, dateTo?: string) {
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
    const visibleIds = await this.resolveVisibleUserIds(userId, roleName);
    const cutoff = dateFrom ? new Date(dateFrom) : (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 11); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
    })();
    const endDate = dateTo ? new Date(dateTo) : new Date();
    const userClause = visibleIds === null ? Prisma.empty : Prisma.sql`AND t.user_id = ANY(${visibleIds})`;

    const rows = await this.prisma.$queryRaw<{ yr: number; mo: number; cat: string; total: number }[]>`
      SELECT
        EXTRACT(YEAR  FROM t.date_recorded)::int AS yr,
        EXTRACT(MONTH FROM t.date_recorded)::int AS mo,
        COALESCE(c.name, 'Uncategorized')        AS cat,
        SUM(t.amount)::float                     AS total
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'expense'
        AND t.date_recorded >= ${cutoff}
        AND t.date_recorded <= ${endDate}
        AND t.status IN ${Prisma.raw(committedStatusSql)}
        ${userClause}
      GROUP BY yr, mo, cat
      ORDER BY yr, mo, total DESC
    `;

    // Collect top 6 categories by overall total
    const catTotals: Record<string, number> = {};
    for (const r of rows as any[]) {
      catTotals[r.cat] = (catTotals[r.cat] || 0) + r.total;
    }
    const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);

    // Build months axis (12 months back)
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth() + 1}`, label: d.toLocaleString('default', { month: 'short', year: '2-digit' }) };
    });

    // Build heatmap: months × categories
    const dataMap: Record<string, Record<string, number>> = {};
    for (const r of rows as any[]) {
      const key = `${r.yr}-${r.mo}`;
      if (!dataMap[key]) dataMap[key] = {};
      if (topCats.includes(r.cat)) dataMap[key][r.cat] = parseFloat(r.total.toFixed(2));
    }

    return {
      categories: topCats,
      months: months.map((m) => ({
        label: m.label,
        values: Object.fromEntries(topCats.map((c) => [c, dataMap[m.key]?.[c] || 0])),
      })),
    };
  }

  async getProjectBurn(userId: number, roleName: string, dateFrom?: string, dateTo?: string) {
    const visibleIds = await this.resolveVisibleUserIds(userId, roleName);
    const where: any = { type: 'expense', status: { in: COMMITTED_STATUSES }, projectId: { not: null } };
    if (visibleIds !== null) where.userId = { in: visibleIds };
    if (dateFrom || dateTo) {
      where.dateRecorded = {};
      if (dateFrom) where.dateRecorded.gte = new Date(dateFrom);
      if (dateTo)   where.dateRecorded.lte = new Date(dateTo);
    }

    const spent = await this.prisma.transaction.groupBy({
      by: ['projectId'],
      where,
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 8,
    });

    if (!spent.length) return [];

    const projectIds = spent.map((r) => r.projectId).filter(Boolean) as number[];
    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true, budget: true },
    });
    const projMap = Object.fromEntries(projects.map((p) => [p.id, p]));

    return spent.map((r) => {
      const proj = projMap[r.projectId!];
      const spentAmt = parseFloat((Number(r._sum.amount) || 0).toFixed(2));
      const budget   = proj?.budget ? parseFloat(Number(proj.budget).toFixed(2)) : 0;
      return {
        project_id:   r.projectId,
        project_name: proj?.name || 'Unknown',
        spent:        spentAmt,
        budget:       budget,
        pct:          budget > 0 ? parseFloat(((spentAmt / budget) * 100).toFixed(1)) : null,
      };
    });
  }

  async getProductBurn(userId: number, roleName: string, dateFrom?: string, dateTo?: string) {
    const visibleIds = await this.resolveVisibleUserIds(userId, roleName);
    const where: any = { type: 'expense', status: { in: COMMITTED_STATUSES }, productId: { not: null } };
    if (visibleIds !== null) where.userId = { in: visibleIds };
    if (dateFrom || dateTo) {
      where.dateRecorded = {};
      if (dateFrom) where.dateRecorded.gte = new Date(dateFrom);
      if (dateTo)   where.dateRecorded.lte = new Date(dateTo);
    }

    const spent = await this.prisma.transaction.groupBy({
      by: ['productId'],
      where,
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 8,
    });

    if (!spent.length) return [];

    const productIds = spent.map((r) => r.productId).filter(Boolean) as number[];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, budget: true },
    });
    const prodMap = Object.fromEntries(products.map((p) => [p.id, p]));

    return spent.map((r) => {
      const prod = prodMap[r.productId!];
      const spentAmt = parseFloat((Number(r._sum.amount) || 0).toFixed(2));
      const budget   = prod?.budget ? parseFloat(Number(prod.budget).toFixed(2)) : 0;
      return {
        product_id:   r.productId,
        product_name: prod?.name || 'Unknown',
        spent:        spentAmt,
        budget:       budget,
        pct:          budget > 0 ? parseFloat(((spentAmt / budget) * 100).toFixed(1)) : null,
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
