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
    if (filters.dateFrom) where.changedAt = { ...where.changedAt, gte: new Date(filters.dateFrom) };
    if (filters.dateTo) where.changedAt = { ...where.changedAt, lte: new Date(filters.dateTo) };

    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where, include: { user: true },
        orderBy: { changedAt: 'desc' }, skip, take: limit,
      }),
    ]);

    return {
      rows: logs.map((l) => ({
        id: l.id, table_name: l.tableName, record_id: l.recordId, action: l.action,
        changed_by: l.changedBy, username: l.user?.username, old_values: l.oldValues,
        new_values: l.newValues, changed_at: l.changedAt,
      })),
      total, page, limit,
    };
  }
}
