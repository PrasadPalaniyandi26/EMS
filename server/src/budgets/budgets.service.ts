import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { COMMITTED_STATUSES } from '../common/constants/transaction-status';

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  private mapBudget(b: any, spent = 0) {
    return ({
      id: b.id, code: b.code, user_id: b.userId,
      name: b.name || '', department: b.department || '', owner_id: b.owner_id,
      owner_name: b.users_budgets_owner_idTousers?.username || '', financial_year: b.financial_year,
      details: b.details || '', start_date: b.start_date, end_date: b.end_date,
      strict: b.strict_enforcement ?? true, rollover: b.auto_rollover ?? false,
      category_id: b.categoryId, category_name: b.category?.name, category_icon: b.category?.icon,
      amount: b.amount, allocated: b.amount, spent,
      period_month: b.periodMonth, period_year: b.periodYear,
      is_active: b.isActive ? 1 : 0, created_at: b.createdAt, updated_at: b.updatedAt,
    });
  }

  async findAll(userId: number, filters: any = {}) {
    const rows = await this.prisma.budget.findMany({
      where: {
        userId,
        ...(!filters.includeInactive && { isActive: true }),
        ...(filters.month && { periodMonth: Number(filters.month) }),
        ...(filters.year && { periodYear: Number(filters.year) }),
      },
      include: { category: true, users_budgets_owner_idTousers: true },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { id: 'desc' }],
    });
    if (rows.length === 0) return [];

    // Group budgets by period so spend is computed against the correct month window per row.
    const periods = new Map<string, { month: number; year: number; categoryIds: number[] }>();
    for (const b of rows) {
      if (!b.categoryId) continue;
      const key = `${b.periodYear}-${b.periodMonth}`;
      if (!periods.has(key)) periods.set(key, { month: b.periodMonth, year: b.periodYear, categoryIds: [] });
      periods.get(key)!.categoryIds.push(b.categoryId);
    }

    const spentMap: Record<string, number> = {};
    await Promise.all(Array.from(periods.values()).map(async ({ month, year, categoryIds }) => {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      const agg = await this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { userId, categoryId: { in: categoryIds }, type: 'expense', status: { in: COMMITTED_STATUSES }, dateRecorded: { gte: start, lte: end } },
        _sum: { amount: true },
      });
      for (const a of agg) {
        spentMap[`${year}-${month}-${a.categoryId}`] = parseFloat(Number(a._sum.amount).toFixed(2)) || 0;
      }
    }));

    return rows.map((b) => this.mapBudget(b, b.categoryId ? (spentMap[`${b.periodYear}-${b.periodMonth}-${b.categoryId}`] || 0) : 0));
  }

  async findById(id: number, userId: number) {
    const b = await this.prisma.budget.findFirst({
      where: { id, userId },
      include: { category: true, users_budgets_owner_idTousers: true },
    });
    return b ? this.mapBudget(b) : null;
  }

  async create(userId: number, data: any) {
    const b = await this.prisma.$transaction(async (tx) => {
      const created = await tx.budget.create({
        data: {
          userId,
          categoryId: data.categoryId ? Number(data.categoryId) : null,
          amount: Number(data.allocated || data.amount || 0),
          periodMonth: Number(data.period_month || data.periodMonth || new Date().getMonth() + 1),
          periodYear: Number(data.financial_year || data.period_year || data.periodYear || new Date().getFullYear()),
          name: data.name || null,
          department: data.department || null,
          owner_id: data.owner_id ? Number(data.owner_id) : null,
          financial_year: Number(data.financial_year || new Date().getFullYear()),
          details: data.details || null,
          start_date: data.start_date ? new Date(data.start_date) : null,
          end_date: data.end_date ? new Date(data.end_date) : null,
          strict_enforcement: data.strict !== false,
          auto_rollover: data.rollover === true,
        },
      });
      const code = `BUD-${String(10000 + created.id).padStart(5, '0')}`;
      await tx.budget.update({ where: { id: created.id }, data: { code } });
      return created;
    });
    return this.findById(b.id, userId);
  }

  async update(id: number, userId: number, data: any) {
    await this.prisma.budget.updateMany({
      where: { id, userId },
      data: {
        ...(data.categoryId !== undefined && { categoryId: data.categoryId ? Number(data.categoryId) : null }),
        ...(data.allocated !== undefined ? { amount: Number(data.allocated) } : data.amount !== undefined ? { amount: Number(data.amount) } : {}),
        ...(data.period_month !== undefined || data.periodMonth !== undefined ? { periodMonth: Number(data.period_month || data.periodMonth) } : {}),
        ...(data.isActive !== undefined && { isActive: Boolean(data.isActive) }),
        name: data.name || null,
        department: data.department || null,
        owner_id: data.owner_id ? Number(data.owner_id) : null,
        financial_year: Number(data.financial_year || new Date().getFullYear()),
        periodYear: data.financial_year ? Number(data.financial_year) : (data.periodYear ? Number(data.periodYear) : undefined),
        details: data.details || null,
        start_date: data.start_date ? new Date(data.start_date) : null,
        end_date: data.end_date ? new Date(data.end_date) : null,
        strict_enforcement: data.strict !== false,
        auto_rollover: data.rollover === true,
      },
    });
    return this.findById(id, userId);
  }

  async delete(id: number, userId: number) {
    const result = await this.prisma.budget.updateMany({ where: { id, userId }, data: { isActive: false } });
    return result.count > 0;
  }

  async getStatus(userId: number, month: number, year: number) {
    const budgets = await this.prisma.budget.findMany({
      where: { userId, periodMonth: month, periodYear: year, isActive: true },
      include: { category: true }, orderBy: { category: { name: 'asc' } },
    });
    if (budgets.length === 0) return [];
    const categoryIds = budgets.map((b) => b.categoryId).filter(Boolean) as number[];
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const expensesAgg = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, categoryId: { in: categoryIds }, type: 'expense', status: { in: COMMITTED_STATUSES }, dateRecorded: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { amount: true },
    });
    const expenseMap: Record<number, number> = {};
    expensesAgg.forEach((e) => { expenseMap[e.categoryId!] = parseFloat(Number(e._sum.amount).toFixed(2)) || 0; });
    return budgets.map((b) => {
      const budgetAmount = parseFloat(Number(b.amount).toFixed(2));
      const spent = expenseMap[b.categoryId!] || 0;
      const remaining = parseFloat((budgetAmount - spent).toFixed(2));
      return ({
        id: b.id, category_id: b.categoryId, category_name: b.category?.name, category_icon: b.category?.icon,
        budget_amount: budgetAmount, spent, remaining,
      });
    });
  }

  async getMonthlySettings(userId: number, month: number, year: number) {
    const s = await this.prisma.monthlyBudgetSetting.findFirst({
      where: { userId, periodMonth: month, periodYear: year },
    });
    if (!s) return null;
    return ({
      id: s.id, user_id: s.userId, period_month: s.periodMonth, period_year: s.periodYear,
      additional_expense: s.additionalExpense, last_month_income: s.lastMonthIncome,
      additional_allocation: s.additionalAllocation, rollover_enabled: s.rolloverEnabled ? 1 : 0,
    });
  }

  async saveMonthlySettings(userId: number, data: any) {
    const existing = await this.prisma.monthlyBudgetSetting.findFirst({
      where: { userId, periodMonth: Number(data.periodMonth), periodYear: Number(data.periodYear) },
    });
    const settingData = {
      additionalExpense: data.additionalExpense ? Number(data.additionalExpense) : 0,
      lastMonthIncome: data.lastMonthIncome ? Number(data.lastMonthIncome) : 0,
      additionalAllocation: data.additionalAllocation ? Number(data.additionalAllocation) : 0,
      rolloverEnabled: Boolean(data.rolloverEnabled),
    };
    if (existing) {
      await this.prisma.monthlyBudgetSetting.update({ where: { id: existing.id }, data: settingData });
    } else {
      await this.prisma.monthlyBudgetSetting.create({
        data: { userId, periodMonth: Number(data.periodMonth), periodYear: Number(data.periodYear), ...settingData },
      });
    }
    return this.getMonthlySettings(userId, Number(data.periodMonth), Number(data.periodYear));
  }

  async checkBudget(userId: number, categoryId: number, amount: number, month: number, year: number) {
    const budget = await this.prisma.budget.findFirst({
      where: { userId, categoryId, periodMonth: month, periodYear: year, isActive: true },
    });
    if (!budget) return { has_budget: false };

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const spent = await this.prisma.transaction.aggregate({
      where: {
        userId, categoryId, type: 'expense',
        status: { in: COMMITTED_STATUSES },
        dateRecorded: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amount: true },
    });

    const allocated = parseFloat(Number(budget.amount).toFixed(2));
    const spentAmount = parseFloat(Number(spent._sum.amount || 0).toFixed(2));
    const remaining = parseFloat((allocated - spentAmount).toFixed(2));
    const afterThis = parseFloat((remaining - amount).toFixed(2));

    return {
      has_budget: true,
      allocated,
      spent: spentAmount,
      remaining,
      after_this_expense: afterThis,
      will_exceed: afterThis < 0,
      utilization_pct: allocated > 0 ? parseFloat(((spentAmount / allocated) * 100).toFixed(1)) : 0,
    };
  }

  async getSummary(userId: number, month: number, year: number) {
    const settings = await this.getMonthlySettings(userId, month, year);
    let prevMonth = month - 1; let prevYear = year;
    if (prevMonth === 0) { prevMonth = 12; prevYear = year - 1; }
    const startOfPrevMonth = new Date(prevYear, prevMonth - 1, 1);
    const endOfPrevMonth = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);
    const prevMonthAgg = await this.prisma.transaction.groupBy({
      by: ['type'], where: { userId, status: { in: COMMITTED_STATUSES }, dateRecorded: { gte: startOfPrevMonth, lte: endOfPrevMonth } },
      _sum: { amount: true },
    });
    let prevMonthIncome = 0, prevMonthExpense = 0;
    prevMonthAgg.forEach((r) => {
      if (r.type === 'income') prevMonthIncome = Number(r._sum.amount) || 0;
      if (r.type === 'expense') prevMonthExpense = Number(r._sum.amount) || 0;
    });
    const recurringAgg = await this.prisma.recurringTransaction.aggregate({
      where: { userId, isActive: true, nextRunDate: { gte: new Date(year, month - 1, 1) } }, _sum: { amount: true },
    });
    return { settings, prevMonthIncome, prevMonthExpense, recurringTotal: Number(recurringAgg._sum.amount) || 0 };
  }
}
