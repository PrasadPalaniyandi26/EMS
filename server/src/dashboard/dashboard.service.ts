import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(userId: number, dateFrom?: string, dateTo?: string) {
    const where: any = { userId };
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
        category_name: t.category?.name, description: t.description,
      })),
    };
  }

  async getByCategory(userId: number, dateFrom?: string, dateTo?: string) {
    const where: any = { userId };
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

  async getRecent(userId: number) {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
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
