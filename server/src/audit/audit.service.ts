import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: any = {}) {
    const where: any = {};
    if (filters.tableName) where.tableName = filters.tableName;
    if (filters.userId) where.changedBy = Number(filters.userId);
    if (filters.action) where.action = filters.action;
    if (filters.search) {
      where.OR = [
        { tableName: { contains: filters.search, mode: 'insensitive' } },
        { referenceId: { contains: filters.search, mode: 'insensitive' } },
        { user: { username: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    if (filters.dateFrom) where.changedAt = { ...where.changedAt, gte: new Date(filters.dateFrom) };
    if (filters.dateTo) where.changedAt = { ...where.changedAt, lte: new Date(filters.dateTo) };

    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 50;
    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where, include: { user: { select: { id: true, username: true } } },
        orderBy: { changedAt: 'desc' }, skip, take: limit,
      }),
    ]);

    return {
      rows: logs.map((l) => ({
        id: l.id,
        table_name: l.tableName,
        record_id: l.recordId,
        reference_id: l.referenceId,
        action: l.action,
        changed_by: l.changedBy,
        username: l.user?.username,
        old_values: l.oldValues,
        new_values: l.newValues,
        changed_at: l.changedAt,
      })),
      total, page, limit,
    };
  }

  async log(data: {
    tableName: string; recordId: number; referenceId?: string | null;
    action: string; changedBy: number; oldValues?: any; newValues?: any;
  }) {
    await this.prisma.auditLog.create({
      data: {
        tableName: data.tableName,
        recordId: data.recordId,
        referenceId: data.referenceId ?? null,
        action: data.action,
        changedBy: data.changedBy,
        oldValues: data.oldValues ? JSON.stringify(data.oldValues) : null,
        newValues: data.newValues ? JSON.stringify(data.newValues) : null,
      },
    });
  }

  async getStats() {
    const [total, byAction, byTable] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.groupBy({ by: ['action'], _count: { id: true } }),
      this.prisma.auditLog.groupBy({ by: ['tableName'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 5 }),
    ]);
    return {
      total,
      by_action: byAction.map((a) => ({ action: a.action, count: a._count.id })),
      by_table: byTable.map((t) => ({ table: t.tableName, count: t._count.id })),
    };
  }
}
