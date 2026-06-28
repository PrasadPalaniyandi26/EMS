import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  private map(n: any) {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      entity_type: n.entityType,
      entity_id: n.entityId,
      reference_id: n.referenceId,
      is_read: n.isRead,
      created_at: n.createdAt,
    };
  }

  async findAll(userId: number, filters: any = {}) {
    const where: any = { userId };
    if (filters.type) where.type = filters.type;
    if (filters.unread === 'true') where.isRead = false;

    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 30;
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: limit,
      }),
    ]);
    const unreadCount = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { rows: rows.map(this.map), total, page, limit, unread_count: unreadCount };
  }

  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { unread_count: count };
  }

  async markRead(userId: number, ids: number[]) {
    await this.prisma.notification.updateMany({
      where: { userId, id: { in: ids } },
      data: { isRead: true },
    });
    return { updated: ids.length };
  }

  async markAllRead(userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }

  async deleteNotification(userId: number, id: number) {
    await this.prisma.notification.deleteMany({ where: { userId, id } });
    return { deleted: 1 };
  }

  async clearAll(userId: number) {
    const result = await this.prisma.notification.deleteMany({ where: { userId } });
    return { deleted: result.count };
  }

  // Internal: create a notification for a user (called by other services)
  async create(userId: number, data: {
    type: string; title: string; message?: string;
    entityType?: string; entityId?: number; referenceId?: string;
  }) {
    return this.prisma.notification.create({
      data: {
        userId,
        type: data.type,
        title: data.title,
        message: data.message ?? null,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        referenceId: data.referenceId ?? null,
      },
    });
  }
}
