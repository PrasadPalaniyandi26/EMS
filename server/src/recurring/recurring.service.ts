import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RecurringService {
  private readonly logger = new Logger('RecurringService');
  constructor(private prisma: PrismaService) {}

  private mapRecurring(r: any) {
    return ({
      id: r.id, code: r.code, user_id: r.userId, amount: r.amount, category_id: r.categoryId,
      category_name: r.category?.name, description: r.description, payment_method: r.paymentMethod,
      frequency: r.frequency, next_run_date: r.nextRunDate, client_id: r.clientId,
      project_id: r.projectId, product_id: r.productId, context_type: r.contextType,
      currency: r.currency, is_active: r.isActive ? 1 : 0, created_at: r.createdAt, updated_at: r.updatedAt,
    });
  }

  async findAll(userId: number) {
    const records = await this.prisma.recurringTransaction.findMany({
      where: { userId }, include: { category: true }, orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapRecurring(r));
  }

  async findById(userId: number, id: number) {
    const r = await this.prisma.recurringTransaction.findFirst({
      where: { id, userId }, include: { category: true },
    });
    if (!r) return null;
    return this.mapRecurring(r);
  }

  async create(userId: number, data: any) {
    const r = await this.prisma.recurringTransaction.create({
      data: {
        userId,
        amount: Number(data.amount),
        categoryId: (data.category_id || data.categoryId) ? Number(data.category_id || data.categoryId) : undefined as any,
        description: data.description || null,
        paymentMethod: data.payment_method || data.paymentMethod || 'cash',
        frequency: data.frequency || 'monthly',
        nextRunDate: new Date(data.next_run || data.nextRunDate),
        clientId: (data.client_id || data.clientId) ? Number(data.client_id || data.clientId) : null,
        projectId: (data.project_id || data.projectId) ? Number(data.project_id || data.projectId) : null,
        productId: (data.product_id || data.productId) ? Number(data.product_id || data.productId) : null,
        contextType: data.context_type || data.contextType || 'project',
        currency: data.currency || 'INR',
      },
    });
    const code = `REC-${String(10000 + r.id).padStart(5, '0')}`;
    await this.prisma.$executeRawUnsafe(`UPDATE recurring_transactions SET code=$1 WHERE id=$2`, code, r.id);
    return this.findById(userId, r.id);
  }

  async update(userId: number, id: number, data: any) {
    await this.prisma.recurringTransaction.updateMany({
      where: { id, userId },
      data: {
        amount: Number(data.amount),
        categoryId: (data.category_id || data.categoryId) ? Number(data.category_id || data.categoryId) : undefined,
        description: data.description || null,
        paymentMethod: data.payment_method || data.paymentMethod || 'cash',
        frequency: data.frequency || 'monthly',
        nextRunDate: new Date(data.next_run || data.nextRunDate),
        clientId: (data.client_id || data.clientId) ? Number(data.client_id || data.clientId) : null,
        projectId: (data.project_id || data.projectId) ? Number(data.project_id || data.projectId) : null,
        productId: (data.product_id || data.productId) ? Number(data.product_id || data.productId) : null,
        contextType: data.context_type || data.contextType || 'project',
        currency: data.currency || 'INR',
        isActive: data.is_active !== undefined ? Boolean(data.is_active) : (data.isActive !== undefined ? Boolean(data.isActive) : undefined),
      },
    });
    return this.findById(userId, id);
  }

  async delete(userId: number, id: number) {
    const result = await this.prisma.recurringTransaction.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processDue() {
    const now = new Date();
    const due = await this.prisma.recurringTransaction.findMany({
      where: { isActive: true, nextRunDate: { lte: now } },
    });
    let processed = 0;
    for (const r of due) {
      const nextDate = this.calculateNext(r.nextRunDate, r.frequency || 'monthly');
      let lastErr: any;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // Atomic: create transaction + advance nextRunDate together
          await this.prisma.$transaction([
            this.prisma.transaction.create({
              data: {
                userId: r.userId, type: 'expense', amount: r.amount, dateRecorded: now,
                categoryId: r.categoryId, description: `[AUTO] ${r.description || ''}`,
                paymentMethod: r.paymentMethod || 'cash', clientId: r.clientId,
                projectId: r.projectId, productId: r.productId, contextType: r.contextType || 'project',
                currency: r.currency || 'INR', status: 'APPROVED',
              },
            }),
            this.prisma.recurringTransaction.update({
              where: { id: r.id }, data: { nextRunDate: nextDate },
            }),
          ]);
          processed++;
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < 3) this.logger.warn(`Retry ${attempt}/3 for recurring ${r.id}: ${err.message}`);
        }
      }

      if (lastErr) {
        this.logger.error(`Failed to process recurring ${r.id} after 3 attempts: ${lastErr.message}`, lastErr.stack);
      }
    }
    return { processed, total: due.length };
  }

  private calculateNext(from: Date, frequency: string): Date {
    const d = new Date(from);
    switch (frequency) {
      case 'daily':
        d.setDate(d.getDate() + 1);
        break;
      case 'weekly':
        d.setDate(d.getDate() + 7);
        break;
      case 'biweekly':
        d.setDate(d.getDate() + 14);
        break;
      case 'monthly':
        this.addMonthsSafe(d, 1);
        break;
      case 'quarterly':
        this.addMonthsSafe(d, 3);
        break;
      case 'yearly':
        this.addMonthsSafe(d, 12);
        break;
      default:
        this.addMonthsSafe(d, 1);
    }
    return d;
  }

  /** Add months without overflowing into the next month (e.g. Jan 31 + 1 month = Feb 28). */
  private addMonthsSafe(d: Date, months: number): void {
    const day = d.getDate();
    d.setDate(1); // temporarily set to 1st to avoid overflow during month change
    d.setMonth(d.getMonth() + months);
    // Clamp to last day of target month
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
}
