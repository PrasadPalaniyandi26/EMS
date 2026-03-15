import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  private async fetchBudgets(extraWhere = '', params: any[] = []) {
    const sql = `
      SELECT b.*, b.name, b.department, b.owner_id, b.financial_year, b.details,
             b.start_date, b.end_date, b.strict_enforcement, b.auto_rollover,
             c.name AS category_name, c.icon AS category_icon,
             u.username AS owner_name
      FROM budgets b
      LEFT JOIN categories c ON c.id = b.category_id
      LEFT JOIN users u ON u.id = b.owner_id
      ${extraWhere}
      ORDER BY b.period_year DESC, b.period_month DESC, b.id DESC
    `;
    const rows = await (params.length > 0
      ? this.prisma.$queryRawUnsafe(sql, ...params)
      : this.prisma.$queryRawUnsafe(sql)) as any[];
    return rows.map((b: any) => ({
      id: b.id, code: b.code, user_id: b.user_id,
      name: b.name || '', department: b.department || '', owner_id: b.owner_id,
      owner_name: b.owner_name || '', financial_year: b.financial_year,
      details: b.details || '', start_date: b.start_date, end_date: b.end_date,
      strict: b.strict_enforcement ?? true, rollover: b.auto_rollover ?? false,
      category_id: b.category_id, category_name: b.category_name, category_icon: b.category_icon,
      amount: b.amount, allocated: b.amount,
      period_month: b.period_month, period_year: b.period_year,
      is_active: b.is_active ? 1 : 0, created_at: b.created_at, updated_at: b.updated_at,
    }));
  }

  async findAll(userId: number, filters: any = {}) {
    const conditions = [`b.user_id = $1`];
    const params: any[] = [userId];
    if (!filters.includeInactive) conditions.push(`b.is_active = true`);
    if (filters.month) { params.push(Number(filters.month)); conditions.push(`b.period_month = $${params.length}`); }
    if (filters.year) { params.push(Number(filters.year)); conditions.push(`b.period_year = $${params.length}`); }
    return this.fetchBudgets(`WHERE ${conditions.join(' AND ')}`, params);
  }

  async findById(id: number, userId: number) {
    const rows = await this.fetchBudgets(`WHERE b.id = $1 AND b.user_id = $2`, [id, userId]);
    return rows[0] || null;
  }

  async create(userId: number, data: any) {
    const b = await this.prisma.budget.create({
      data: {
        userId,
        categoryId: data.categoryId ? Number(data.categoryId) : null,
        amount: Number(data.allocated || data.amount || 0),
        periodMonth: Number(data.period_month || data.periodMonth || new Date().getMonth() + 1),
        periodYear: Number(data.financial_year || data.period_year || data.periodYear || new Date().getFullYear()),
      },
    });
    const code = `BUD-${String(10000 + b.id).padStart(5, '0')}`;
    await this.prisma.$executeRawUnsafe(
      `UPDATE budgets SET code=$1, name=$2, department=$3, owner_id=$4, financial_year=$5,
       details=$6, start_date=$7::date, end_date=$8::date, strict_enforcement=$9, auto_rollover=$10 WHERE id=$11`,
      code,
      data.name || null,
      data.department || null,
      data.owner_id ? Number(data.owner_id) : null,
      Number(data.financial_year || new Date().getFullYear()),
      data.details || null,
      data.start_date || null,
      data.end_date || null,
      data.strict !== false,
      data.rollover === true,
      b.id,
    );
    return this.findById(b.id, userId);
  }

  async update(id: number, userId: number, data: any) {
    await this.prisma.budget.updateMany({
      where: { id, userId },
      data: {
        categoryId: data.categoryId ? Number(data.categoryId) : undefined,
        amount: data.allocated !== undefined ? Number(data.allocated) : (data.amount !== undefined ? Number(data.amount) : undefined),
        periodMonth: data.period_month ? Number(data.period_month) : (data.periodMonth ? Number(data.periodMonth) : undefined),
        periodYear: data.financial_year ? Number(data.financial_year) : (data.periodYear ? Number(data.periodYear) : undefined),
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : undefined,
      },
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE budgets SET name=$1, department=$2, owner_id=$3, financial_year=$4,
       details=$5, start_date=$6::date, end_date=$7::date, strict_enforcement=$8, auto_rollover=$9
       WHERE id=$10 AND user_id=$11`,
      data.name || null,
      data.department || null,
      data.owner_id ? Number(data.owner_id) : null,
      Number(data.financial_year || new Date().getFullYear()),
      data.details || null,
      data.start_date || null,
      data.end_date || null,
      data.strict !== false,
      data.rollover === true,
      id,
      userId,
    );
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
      where: { userId, categoryId: { in: categoryIds }, type: 'expense', dateRecorded: { gte: startOfMonth, lte: endOfMonth } },
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

  async getSummary(userId: number, month: number, year: number) {
    const settings = await this.getMonthlySettings(userId, month, year);
    let prevMonth = month - 1; let prevYear = year;
    if (prevMonth === 0) { prevMonth = 12; prevYear = year - 1; }
    const startOfPrevMonth = new Date(prevYear, prevMonth - 1, 1);
    const endOfPrevMonth = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);
    const prevMonthAgg = await this.prisma.transaction.groupBy({
      by: ['type'], where: { userId, dateRecorded: { gte: startOfPrevMonth, lte: endOfPrevMonth } },
      _sum: { amount: true },
    });
    let prevMonthIncome = 0, prevMonthExpense = 0;
    prevMonthAgg.forEach((r) => {
      if (r.type === 'income') prevMonthIncome = Number(r._sum.amount) || 0;
      if (r.type === 'expense') prevMonthExpense = Number(r._sum.amount) || 0;
    });
    const recurringAgg = await this.prisma.recurringTransaction.aggregate({
      where: { userId, isActive: true }, _sum: { amount: true },
    });
    return { settings, prevMonthIncome, prevMonthExpense, recurringTotal: Number(recurringAgg._sum.amount) || 0 };
  }
}
