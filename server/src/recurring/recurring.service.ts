import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ROLES } from '../common/constants/roles';
import { buildGstFields } from '../common/utils/gst';

@Injectable()
export class RecurringService {
  private readonly logger = new Logger('RecurringService');
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private mapRecurring(r: any) {
    return ({
      id: r.id, code: r.code, user_id: r.userId,
      amount: r.totalAmount != null ? Number(r.totalAmount) : Number(r.amount),
      net_amount: r.netAmount != null ? Number(r.netAmount) : Number(r.amount),
      total_amount: r.totalAmount != null ? Number(r.totalAmount) : Number(r.amount),
      gst_rate: r.gstRate != null ? Number(r.gstRate) : null,
      gst_included: r.gstIncluded ?? false,
      category_id: r.categoryId,
      category_name: r.category?.name, description: r.description, payment_method: r.paymentMethod,
      frequency: r.frequency, next_run_date: r.nextRunDate,
      start_date: r.startDate ?? null, end_date: r.endDate ?? null,
      client_id: r.clientId, client_name: r.client?.name ?? null,
      project_id: r.projectId, project_name: r.project?.name ?? null,
      product_id: r.productId, product_name: r.product?.name ?? null,
      context_type: r.contextType,
      currency: r.currency, is_active: r.isActive ? 1 : 0, type: r.type ?? 'expense',
      status: r.status ?? 'DRAFT', last_run_date: r.lastRunDate ?? null,
      submitted_by_name: r.submittedByName ?? null,
      approved_by_name: r.approvedByName ?? null,
      rejected_by_name: r.rejectedByName ?? null,
      sent_back_by_name: r.sentBackByName ?? null,
      created_at: r.createdAt, updated_at: r.updatedAt,
    });
  }

  private async userHasRole(userId: number, roleName: string): Promise<boolean> {
    const found = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: roleName } },
    });
    return !!found;
  }

  async findAll(userId: number, filters: any = {}) {
    const where: any = { userId };
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.frequency) where.frequency = filters.frequency;

    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 50;
    const skip = (page - 1) * limit;

    const [total, records] = await Promise.all([
      this.prisma.recurringTransaction.count({ where }),
      this.prisma.recurringTransaction.findMany({
        where,
        include: { category: true, client: true, project: true, product: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return { rows: records.map((r) => this.mapRecurring(r)), total, page, limit };
  }

  async findById(userId: number, id: number) {
    const r = await this.prisma.recurringTransaction.findFirst({
      where: { id, userId },
      include: { category: true, client: true, project: true, product: true },
    });
    if (!r) return null;
    return this.mapRecurring(r);
  }

  async create(userId: number, data: any) {
    const gstFields = buildGstFields(Number(data.amount), data.gst_rate ?? null, !!data.gst_included);
    const r = await this.prisma.recurringTransaction.create({
      data: {
        userId,
        ...gstFields,
        categoryId: (data.category_id || data.categoryId) ? Number(data.category_id || data.categoryId) : undefined as any,
        description: data.description || null,
        paymentMethod: data.payment_method || data.paymentMethod || 'cash',
        frequency: data.frequency || 'monthly',
        nextRunDate: new Date(data.next_run || data.nextRunDate),
        startDate: new Date(data.next_run || data.nextRunDate),
        endDate: data.end_date ? new Date(data.end_date) : null,
        clientId: (data.client_id || data.clientId) ? Number(data.client_id || data.clientId) : null,
        projectId: (data.project_id || data.projectId) ? Number(data.project_id || data.projectId) : null,
        productId: (data.product_id || data.productId) ? Number(data.product_id || data.productId) : null,
        contextType: data.context_type || data.contextType || 'project',
        currency: data.currency || 'INR',
        type: ['expense', 'income'].includes(data.type) ? data.type : 'expense',
      },
    });
    const code = `REC-${String(10000 + r.id).padStart(5, '0')}`;
    await this.prisma.recurringTransaction.update({ where: { id: r.id }, data: { code } });
    return this.findById(userId, r.id);
  }

  async update(userId: number, id: number, data: any) {
    const existing = await this.prisma.recurringTransaction.findFirst({ where: { id, userId } });
    if (existing && !['DRAFT', 'SENT_BACK'].includes((existing as any).status || 'DRAFT')) {
      throw new HttpException(
        `Cannot edit a recurring schedule with status '${(existing as any).status}'. Only DRAFT or SENT_BACK schedules can be modified.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const gstFieldsUpd = buildGstFields(Number(data.amount), data.gst_rate ?? null, !!data.gst_included);
    await this.prisma.recurringTransaction.updateMany({
      where: { id, userId },
      data: {
        ...gstFieldsUpd,
        categoryId: (data.category_id || data.categoryId) ? Number(data.category_id || data.categoryId) : undefined,
        description: data.description || null,
        paymentMethod: data.payment_method || data.paymentMethod || 'cash',
        frequency: data.frequency || 'monthly',
        nextRunDate: new Date(data.next_run || data.nextRunDate),
        endDate: data.end_date !== undefined ? (data.end_date ? new Date(data.end_date) : null) : undefined,
        clientId: (data.client_id || data.clientId) ? Number(data.client_id || data.clientId) : null,
        projectId: (data.project_id || data.projectId) ? Number(data.project_id || data.projectId) : null,
        productId: (data.product_id || data.productId) ? Number(data.product_id || data.productId) : null,
        contextType: data.context_type || data.contextType || 'project',
        currency: data.currency || 'INR',
        ...(data.type && ['expense', 'income'].includes(data.type) ? { type: data.type } : {}),
        isActive: data.is_active !== undefined ? Boolean(data.is_active) : (data.isActive !== undefined ? Boolean(data.isActive) : undefined),
      },
    });
    return this.findById(userId, id);
  }

  async pause(userId: number, id: number) {
    const rec = await this.prisma.recurringTransaction.findFirst({ where: { id, userId } });
    if (!rec) throw new HttpException('Recurring schedule not found', HttpStatus.NOT_FOUND);
    if (rec.status !== 'APPROVED') throw new HttpException('Only APPROVED schedules can be paused.', HttpStatus.BAD_REQUEST);
    if (!rec.isActive) throw new HttpException('Schedule is already paused.', HttpStatus.BAD_REQUEST);
    await this.prisma.recurringTransaction.update({ where: { id }, data: { isActive: false } });
    return this.findById(userId, id);
  }

  async resume(userId: number, id: number, data: any) {
    const rec = await this.prisma.recurringTransaction.findFirst({ where: { id, userId } });
    if (!rec) throw new HttpException('Recurring schedule not found', HttpStatus.NOT_FOUND);
    if (rec.status !== 'APPROVED') throw new HttpException('Only APPROVED schedules can be resumed.', HttpStatus.BAD_REQUEST);
    if (rec.isActive) throw new HttpException('Schedule is already active.', HttpStatus.BAD_REQUEST);
    await this.prisma.recurringTransaction.update({
      where: { id },
      data: {
        isActive: true,
        nextRunDate: data.next_run ? new Date(data.next_run) : rec.nextRunDate,
        ...(data.frequency ? { frequency: data.frequency } : {}),
        ...(data.amount ? { amount: Number(data.amount) } : {}),
      },
    });
    return this.findById(userId, id);
  }

  async delete(userId: number, id: number) {
    const result = await this.prisma.recurringTransaction.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  // ─── Submit ────────────────────────────────────────────────────────────────
  // Same role rules as expense:
  //   Finance   → PENDING_FINANCE (self-assigned ApprovalRequest, can self-approve)
  //   Manager/Admin → PENDING_FINANCE (Finance ApprovalRequest)
  //   Employee  → PENDING_MANAGER (Manager ApprovalRequest)
  async submit(userId: number, id: number) {
    const rec = await this.prisma.recurringTransaction.findFirst({ where: { id, userId } });
    if (!rec) throw new HttpException('Recurring schedule not found', HttpStatus.NOT_FOUND);

    const currentStatus = (rec as any).status ?? 'DRAFT';
    if (!['DRAFT', 'SENT_BACK'].includes(currentStatus)) {
      throw new HttpException(`Cannot submit schedule with status '${currentStatus}'.`, HttpStatus.BAD_REQUEST);
    }

    const submitter = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { manager: true },
    });

    const [isFinance, isManager, isAdmin] = await Promise.all([
      this.userHasRole(userId, ROLES.FINANCE),
      this.userHasRole(userId, ROLES.MANAGER),
      this.userHasRole(userId, ROLES.ADMIN),
    ]);

    const submitterName = submitter?.username || 'Unknown';
    const code = (rec as any).code || `#${id}`;

    // ── Finance → PENDING_FINANCE (self-assigned) ──
    if (isFinance) {
      await this.prisma.$transaction(async (tx) => {
        await tx.approvalRequest.deleteMany({ where: { recurringTransactionId: id } });
        await tx.approvalRequest.create({
          data: { recurringTransactionId: id, approverId: userId, levelNum: 1, status: 'PENDING' },
        });
        await tx.recurringTransaction.update({
          where: { id },
          data: { status: 'PENDING_FINANCE', submittedByName: submitterName },
        });
      });
      this.audit.log({ tableName: 'recurring_transactions', recordId: id, action: 'UPDATE', changedBy: userId, oldValues: { status: currentStatus }, newValues: { status: 'PENDING_FINANCE' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      return this.findById(userId, id);
    }

    // ── Manager/Admin → PENDING_FINANCE (assign to a Finance user) ──
    if (isManager || isAdmin) {
      const financeUser = await this.prisma.user.findFirst({
        where: { isActive: true, id: { not: userId }, userRoles: { some: { role: { name: ROLES.FINANCE } } } },
      });
      if (!financeUser) throw new HttpException('No Finance user available to review this schedule.', HttpStatus.BAD_REQUEST);

      await this.prisma.$transaction(async (tx) => {
        await tx.approvalRequest.deleteMany({ where: { recurringTransactionId: id } });
        await tx.approvalRequest.create({
          data: { recurringTransactionId: id, approverId: financeUser.id, levelNum: 1, status: 'PENDING' },
        });
        await tx.recurringTransaction.update({
          where: { id },
          data: { status: 'PENDING_FINANCE', submittedByName: submitterName },
        });
      });
      this.audit.log({ tableName: 'recurring_transactions', recordId: id, action: 'UPDATE', changedBy: userId, oldValues: { status: currentStatus }, newValues: { status: 'PENDING_FINANCE' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      this.notifications.create(financeUser.id, { type: 'approval', title: 'Recurring Schedule Pending Finance Review', message: `${submitterName} submitted recurring schedule ${code} for Finance review.`, entityType: 'recurring', entityId: id }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      return this.findById(userId, id);
    }

    // ── Employee → PENDING_MANAGER ──
    let managerId: number | null = null;
    if (submitter?.manager && submitter.manager.id !== userId) {
      const dmHasManagerRole = await this.prisma.userRole.findFirst({
        where: { userId: submitter.manager.id, role: { name: ROLES.MANAGER } },
      });
      if (dmHasManagerRole) managerId = submitter.manager.id;
    }
    if (!managerId) {
      const anyManager = await this.prisma.user.findFirst({
        where: { isActive: true, id: { not: userId }, userRoles: { some: { role: { name: ROLES.MANAGER } } } },
      });
      managerId = anyManager?.id ?? null;
    }
    if (!managerId) throw new HttpException('No manager available to approve this schedule.', HttpStatus.BAD_REQUEST);

    await this.prisma.$transaction(async (tx) => {
      await tx.approvalRequest.deleteMany({ where: { recurringTransactionId: id } });
      await tx.approvalRequest.create({
        data: { recurringTransactionId: id, approverId: managerId!, levelNum: 1, status: 'PENDING' },
      });
      await tx.recurringTransaction.update({
        where: { id },
        data: { status: 'PENDING_MANAGER', submittedByName: submitterName },
      });
    });
    this.audit.log({ tableName: 'recurring_transactions', recordId: id, action: 'UPDATE', changedBy: userId, oldValues: { status: currentStatus }, newValues: { status: 'PENDING_MANAGER' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    this.notifications.create(managerId, { type: 'approval', title: 'Recurring Schedule Pending Approval', message: `${submitterName} submitted recurring schedule ${code} for your approval.`, entityType: 'recurring', entityId: id }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    return this.findById(userId, id);
  }

  // ─── Approve ───────────────────────────────────────────────────────────────
  // Manager approves PENDING_MANAGER → escalates to PENDING_FINANCE
  // Finance approves PENDING_FINANCE → APPROVED + is_active=true
  async approve(approverId: number, id: number) {
    const rec = await this.prisma.recurringTransaction.findFirst({ where: { id } });
    if (!rec) throw new HttpException('Recurring schedule not found', HttpStatus.NOT_FOUND);

    const recStatus = (rec as any).status;
    const [approverIsManager, approverIsFinance] = await Promise.all([
      this.userHasRole(approverId, ROLES.MANAGER),
      this.userHasRole(approverId, ROLES.FINANCE),
    ]);

    const approver = await this.prisma.user.findUnique({ where: { id: approverId } });
    const approverName = approver?.username || 'Unknown';
    const approverRole = approver?.roleId
      ? ((await this.prisma.role.findUnique({ where: { id: approver.roleId } }))?.name || null)
      : null;
    const code = (rec as any).code || `#${id}`;

    if (recStatus === 'PENDING_MANAGER') {
      if (!approverIsManager) throw new HttpException('Only Managers can approve at this stage.', HttpStatus.FORBIDDEN);

      const financeUser = await this.prisma.user.findFirst({
        where: {
          isActive: true,
          id: { not: (rec as any).userId },
          userRoles: { some: { role: { name: ROLES.FINANCE } } },
        },
      });

      const req = await this.prisma.approvalRequest.findFirst({
        where: { recurringTransactionId: id, status: 'PENDING' },
      });

      await this.prisma.$transaction(async (tx) => {
        if (req) {
          await tx.approvalRequest.update({
            where: { id: req.id },
            data: { approverId, status: 'APPROVED', actionDate: new Date(), resolvedAt: new Date() },
          });
        }
        if (financeUser) {
          await tx.approvalRequest.create({
            data: { recurringTransactionId: id, approverId: financeUser.id, levelNum: 2, status: 'PENDING' },
          });
          await tx.recurringTransaction.update({
            where: { id },
            data: { status: 'PENDING_FINANCE', approvedById: approverId, approvedByName: approverName, approvedByRole: approverRole },
          });
        } else {
          // No Finance user — Manager is final approver
          await tx.recurringTransaction.update({
            where: { id },
            data: { status: 'APPROVED', isActive: true, approvedById: approverId, approvedByName: approverName, approvedByRole: approverRole },
          });
        }
      });

      this.audit.log({ tableName: 'recurring_transactions', recordId: id, action: 'UPDATE', changedBy: approverId, oldValues: { status: 'PENDING_MANAGER' }, newValues: { status: financeUser ? 'PENDING_FINANCE' : 'APPROVED' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      if (financeUser) {
        this.notifications.create(financeUser.id, { type: 'approval', title: 'Recurring Schedule Pending Finance Review', message: `${code} approved by Manager, awaiting your final approval.`, entityType: 'recurring', entityId: id }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      } else {
        this.notifications.create((rec as any).userId, { type: 'approval', title: 'Recurring Schedule Approved', message: `Your recurring schedule ${code} has been approved.`, entityType: 'recurring', entityId: id }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      }
      return this.findById((rec as any).userId, id);
    }

    if (recStatus === 'PENDING_FINANCE') {
      if (!approverIsFinance) throw new HttpException('Only Finance can approve at this stage.', HttpStatus.FORBIDDEN);

      const req = await this.prisma.approvalRequest.findFirst({
        where: { recurringTransactionId: id, status: 'PENDING' },
      });

      await this.prisma.$transaction(async (tx) => {
        if (req) {
          await tx.approvalRequest.update({
            where: { id: req.id },
            data: { approverId, status: 'APPROVED', actionDate: new Date(), resolvedAt: new Date() },
          });
        }
        await tx.recurringTransaction.update({
          where: { id },
          data: { status: 'APPROVED', isActive: true, approvedById: approverId, approvedByName: approverName, approvedByRole: approverRole },
        });
      });

      this.audit.log({ tableName: 'recurring_transactions', recordId: id, action: 'UPDATE', changedBy: approverId, oldValues: { status: 'PENDING_FINANCE' }, newValues: { status: 'APPROVED' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      this.notifications.create((rec as any).userId, { type: 'approval', title: 'Recurring Schedule Approved', message: `Your recurring schedule ${code} has been fully approved by Finance.`, entityType: 'recurring', entityId: id }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      return this.findById((rec as any).userId, id);
    }

    throw new HttpException(`Cannot approve a schedule with status '${recStatus}'.`, HttpStatus.BAD_REQUEST);
  }

  // ─── Reject ────────────────────────────────────────────────────────────────
  async reject(approverId: number, id: number, comments?: string) {
    const rec = await this.prisma.recurringTransaction.findFirst({ where: { id } });
    if (!rec) throw new HttpException('Recurring schedule not found', HttpStatus.NOT_FOUND);

    const recStatus = (rec as any).status;
    if (!['PENDING_MANAGER', 'PENDING_FINANCE'].includes(recStatus)) {
      throw new HttpException(`Cannot reject a schedule with status '${recStatus}'.`, HttpStatus.BAD_REQUEST);
    }

    const [rejIsManager, rejIsFinance] = await Promise.all([
      this.userHasRole(approverId, ROLES.MANAGER),
      this.userHasRole(approverId, ROLES.FINANCE),
    ]);
    if (recStatus === 'PENDING_MANAGER' && !rejIsManager) throw new HttpException('Only Managers can reject at this stage.', HttpStatus.FORBIDDEN);
    if (recStatus === 'PENDING_FINANCE' && !rejIsFinance) throw new HttpException('Only Finance can reject at this stage.', HttpStatus.FORBIDDEN);

    const approver = await this.prisma.user.findUnique({ where: { id: approverId } });
    const approverName = approver?.username || 'Unknown';
    const approverRole = approver?.roleId
      ? ((await this.prisma.role.findUnique({ where: { id: approver.roleId } }))?.name || null)
      : null;
    const code = (rec as any).code || `#${id}`;

    const req = await this.prisma.approvalRequest.findFirst({
      where: { recurringTransactionId: id, status: 'PENDING' },
    });

    await this.prisma.$transaction(async (tx) => {
      if (req) {
        await tx.approvalRequest.update({
          where: { id: req.id },
          data: { approverId, status: 'REJECTED', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
        });
      }
      await tx.recurringTransaction.update({
        where: { id },
        data: { status: 'REJECTED', isActive: false, rejectedById: approverId, rejectedByName: approverName, rejectedByRole: approverRole },
      });
    });

    this.audit.log({ tableName: 'recurring_transactions', recordId: id, action: 'UPDATE', changedBy: approverId, oldValues: { status: recStatus }, newValues: { status: 'REJECTED' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    this.notifications.create((rec as any).userId, { type: 'warning', title: 'Recurring Schedule Rejected', message: `Your recurring schedule ${code} was rejected by ${approverName}${comments ? `: ${comments}` : '.'}`, entityType: 'recurring', entityId: id }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    return this.findById((rec as any).userId, id);
  }

  // ─── Send Back ─────────────────────────────────────────────────────────────
  async sendBack(approverId: number, id: number, comments?: string) {
    const rec = await this.prisma.recurringTransaction.findFirst({ where: { id } });
    if (!rec) throw new HttpException('Recurring schedule not found', HttpStatus.NOT_FOUND);

    const recStatus = (rec as any).status;
    if (!['PENDING_MANAGER', 'PENDING_FINANCE'].includes(recStatus)) {
      throw new HttpException(`Cannot send back a schedule with status '${recStatus}'.`, HttpStatus.BAD_REQUEST);
    }

    const [sbIsManager, sbIsFinance] = await Promise.all([
      this.userHasRole(approverId, ROLES.MANAGER),
      this.userHasRole(approverId, ROLES.FINANCE),
    ]);
    if (recStatus === 'PENDING_MANAGER' && !sbIsManager) throw new HttpException('Only Managers can send back at this stage.', HttpStatus.FORBIDDEN);
    if (recStatus === 'PENDING_FINANCE' && !sbIsFinance) throw new HttpException('Only Finance can send back at this stage.', HttpStatus.FORBIDDEN);

    const approver = await this.prisma.user.findUnique({ where: { id: approverId } });
    const approverName = approver?.username || 'Unknown';
    const approverRole = approver?.roleId
      ? ((await this.prisma.role.findUnique({ where: { id: approver.roleId } }))?.name || null)
      : null;
    const code = (rec as any).code || `#${id}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.approvalRequest.updateMany({
        where: { recurringTransactionId: id, status: 'PENDING' },
        data: { status: 'SENT_BACK', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
      });
      await tx.recurringTransaction.update({
        where: { id },
        data: { status: 'SENT_BACK', sentBackById: approverId, sentBackByName: approverName, sentBackByRole: approverRole },
      });
    });

    this.audit.log({ tableName: 'recurring_transactions', recordId: id, action: 'UPDATE', changedBy: approverId, oldValues: { status: recStatus }, newValues: { status: 'SENT_BACK' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    this.notifications.create((rec as any).userId, { type: 'warning', title: 'Recurring Schedule Sent Back', message: `Your recurring schedule ${code} was sent back for revision by ${approverName}${comments ? `: ${comments}` : '.'}`, entityType: 'recurring', entityId: id }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    return this.findById((rec as any).userId, id);
  }

  async getRunHistory(userId: number, recurringId: number) {
    const rec = await this.prisma.recurringTransaction.findFirst({ where: { id: recurringId } });
    if (!rec) throw new HttpException('Recurring schedule not found.', HttpStatus.NOT_FOUND);

    const hasAccess = rec.userId === userId || await this.prisma.userRole.findFirst({
      where: { userId, role: { name: { in: [ROLES.ADMIN, ROLES.FINANCE, ROLES.MANAGER] } } },
    });
    if (!hasAccess) throw new HttpException('Not found.', HttpStatus.NOT_FOUND);

    const runs = await this.prisma.transaction.findMany({
      where: { recurringTransactionId: recurringId, NOT: { status: 'DELETED' } },
      orderBy: [{ dateRecorded: 'desc' }],
      take: 20,
    });
    return runs.map((r) => ({
      id: r.id,
      reference_id: r.referenceId,
      date_recorded: r.dateRecorded,
      amount: Number((r as any).totalAmount ?? r.amount),
      status: r.status,
    }));
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processDue() {
    const now = new Date();
    const due = await this.prisma.recurringTransaction.findMany({
      where: { isActive: true, nextRunDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gte: now } }] },
    });
    let processed = 0;
    for (const r of due) {
      const nextDate = this.calculateNext(r.nextRunDate, r.frequency || 'monthly');
      let lastErr: any;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.prisma.$transaction([
            this.prisma.transaction.create({
              data: {
                userId: r.userId, type: (r as any).type || 'expense',
                amount: (r as any).totalAmount ?? r.amount,
                netAmount: (r as any).netAmount ?? r.amount,
                totalAmount: (r as any).totalAmount ?? r.amount,
                gstRate: (r as any).gstRate ?? null,
                gstIncluded: (r as any).gstIncluded ?? false,
                dateRecorded: now,
                categoryId: r.categoryId, description: `[AUTO] ${r.description || ''}`,
                paymentMethod: r.paymentMethod || 'cash', clientId: r.clientId,
                projectId: r.projectId, productId: r.productId, contextType: r.contextType || 'project',
                currency: r.currency || 'INR', status: 'APPROVED',
                recurringTransactionId: r.id,
              },
            }),
            this.prisma.recurringTransaction.update({
              where: { id: r.id }, data: { nextRunDate: nextDate, lastRunDate: now },
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
      case 'daily': d.setDate(d.getDate() + 1); break;
      case 'weekly': d.setDate(d.getDate() + 7); break;
      case 'biweekly': d.setDate(d.getDate() + 14); break;
      case 'monthly': this.addMonthsSafe(d, 1); break;
      case 'quarterly': this.addMonthsSafe(d, 3); break;
      case 'yearly': this.addMonthsSafe(d, 12); break;
      default: this.addMonthsSafe(d, 1);
    }
    return d;
  }

  private addMonthsSafe(d: Date, months: number): void {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
}
