import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseRange } from '../common/helpers/dates';

// A user record's contact and personal details; only an Admin reads them in the log
const PERSONAL = ['email', 'login_name', 'contact_no', 'house_apt', 'address', 'city', 'state', 'country', 'postal_code', 'date_of_birth'];

function withoutPersonal(json: string | null) {
  if (!json) return json;
  try {
    const value = JSON.parse(json);
    for (const key of PERSONAL) if (key in value) value[key] = '(hidden)';
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: any = {}, viewerRole?: string) {
    const where: any = {};
    const range = parseRange(filters.dateFrom, filters.dateTo);
    if (filters.tableName) where.tableName = String(filters.tableName);
    if (filters.userId) {
      const uid = Number(filters.userId);
      if (!Number.isInteger(uid)) throw new BadRequestException('The user filter must be a user number.');
      where.changedBy = uid;
    }
    // Older user records were logged as CREATE; they count as INSERT
    if (filters.action) where.action = String(filters.action) === 'INSERT' ? { in: ['INSERT', 'CREATE'] } : String(filters.action);
    if (filters.search) {
      where.OR = [
        { tableName: { contains: filters.search, mode: 'insensitive' } },
        { referenceId: { contains: filters.search, mode: 'insensitive' } },
        { user: { username: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    if (range.from) where.changedAt = { ...where.changedAt, gte: range.from };
    // The end date is a whole day: include everything logged on it
    if (range.to) {
      const t = range.to;
      where.changedAt = { ...where.changedAt, lt: new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1)) };
    }

    const page = Math.max(1, Math.floor(Number(filters.page)) || 1);
    const limit = Math.min(200, Math.max(1, Math.floor(Number(filters.limit)) || 50));
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
        old_values: viewerRole !== 'ADMIN' && l.tableName === 'users' ? withoutPersonal(l.oldValues) : l.oldValues,
        new_values: viewerRole !== 'ADMIN' && l.tableName === 'users' ? withoutPersonal(l.newValues) : l.newValues,
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
