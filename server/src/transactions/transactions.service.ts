import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ROLES } from '../common/constants/roles';
import { COMMITTED_STATUSES } from '../common/constants/transaction-status';
import { buildGstFields } from '../common/utils/gst';

// Upper bound for ?limit= on list endpoints; the client's largest request is 500.
const MAX_PAGE_SIZE = 500;

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger('TransactionsService');

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private mapTransaction(t: any) {
    return ({
      id: t.id, reference_id: t.referenceId, type: t.type,
      amount: t.totalAmount ?? t.amount,
      net_amount: t.netAmount ?? t.amount,
      total_amount: t.totalAmount ?? t.amount,
      gst_rate: t.gstRate != null ? Number(t.gstRate) : null,
      gst_included: t.gstIncluded ?? false,
      is_claimable: t.isClaimable ?? false,
      needs_reimbursement: t.needsReimbursement ?? false,
      date_recorded: t.dateRecorded,
      category_id: t.categoryId, category_name: t.category?.name, category_icon: t.category?.icon,
      description: t.description, payment_method: t.paymentMethod, receipt_path: t.receiptPath,
      receipt_number: t.receiptNumber, submitted_at: t.submittedAt, currency: t.currency,
      client_id: t.clientId, client_name: t.client?.name, project_id: t.projectId, project_name: t.project?.name,
      context_code: t.project?.code || t.product?.code, product_id: t.productId, product_name: t.product?.name,
      context_type: t.contextType, is_split: t.isSplit ? 1 : 0, created_at: t.createdAt, updated_at: t.updatedAt, status: t.status,
      approved_by_id: t.approvedById ?? null,
      approved_by_name: t.approvedByName ?? null,
      approved_by_role: t.approvedByRole ?? null,
      approved_at: t.approvedAt ?? null,
      rejected_by_id: t.rejectedById ?? null,
      rejected_by_name: t.rejectedByName ?? null,
      rejected_by_role: t.rejectedByRole ?? null,
      rejected_at: t.rejectedAt ?? null,
      submitted_by_id: t.submittedById ?? null,
      submitted_by_name: t.submittedByName ?? null,
      sent_back_by_id: t.sentBackById ?? null,
      sent_back_by_name: t.sentBackByName ?? null,
      sent_back_by_role: t.sentBackByRole ?? null,
      sent_back_at: t.sentBackAt ?? null,
      voided_by_id: t.voidedById ?? null,
      voided_by_name: t.voidedByName ?? null,
      voided_at: t.voidedAt ?? null,
      void_reason: t.voidReason ?? null,
      reimbursement_status: t.reimbursementStatus ?? null,
      reimbursed_at: t.reimbursedAt ?? null,
      reimbursed_by_name: t.reimbursedByName ?? null,
      reimbursement_reference: t.reimbursementReference ?? null,
      reimbursement_note: t.reimbursementNote ?? null,
    });
  }

  async findAll(userId: number, filters: any) {
    const where: any = { userId, NOT: { status: 'DELETED' } };
    if (filters.dateFrom) where.dateRecorded = { ...where.dateRecorded, gte: new Date(filters.dateFrom) };
    if (filters.dateTo) where.dateRecorded = { ...where.dateRecorded, lte: new Date(filters.dateTo) };
    if (filters.category) where.categoryId = Number(filters.category);
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
    if (filters.clientId) where.clientId = Number(filters.clientId);
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.contextType) where.contextType = filters.contextType;
    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search, mode: 'insensitive' } },
        { referenceId: { contains: filters.search, mode: 'insensitive' } },
        { receiptNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, Math.floor(Number(filters.page)) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(filters.limit)) || 20));
    const skip = (page - 1) * limit;

    const [total, transactions] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where, include: { category: true, client: true, project: true, product: true },
        orderBy: [{ dateRecorded: 'desc' }, { id: 'desc' }], skip, take: limit,
      }),
    ]);

    return { rows: transactions.map((t) => this.mapTransaction(t)), total, page, limit };
  }

  async findById(id: number, userId: number) {
    const t = await this.prisma.transaction.findFirst({
      where: { id, userId, NOT: { status: 'DELETED' } }, include: { category: true, client: true, project: true, product: true },
    });
    if (!t) return null;
    return this.mapTransaction(t);
  }

  private async findByIdAny(id: number) {
    const t = await this.prisma.transaction.findFirst({
      where: { id, NOT: { status: 'DELETED' } }, include: { category: true, client: true, project: true, product: true },
    });
    if (!t) return null;
    return this.mapTransaction(t);
  }

  private generateReferenceId(type: string, id: number): string {
    const seq = String(10000 + id).padStart(5, '0');
    return type === 'expense' ? `EXP-${seq}` : `INC-${seq}`;
  }

  async create(userId: number, data: any) {
    // All users create transactions as DRAFT; Finance submits the same way as others
    const gstFields = buildGstFields(Number(data.amount), data.gstRate ?? null, !!data.gstIncluded);

    const t = await this.prisma.transaction.create({
      data: {
        userId, type: data.type,
        ...gstFields,
        dateRecorded: new Date(data.dateRecorded),
        categoryId: data.categoryId ? Number(data.categoryId) : null, description: data.description || null,
        paymentMethod: data.paymentMethod || 'cash', receiptPath: data.receiptPath || null,
        clientId: data.clientId ? Number(data.clientId) : null, projectId: data.projectId ? Number(data.projectId) : null,
        productId: data.productId ? Number(data.productId) : null, contextType: data.contextType || 'project',
        receiptNumber: data.receiptNumber || null, currency: data.currency || 'INR',
        isClaimable: data.isClaimable !== undefined ? !!data.isClaimable : false,
        needsReimbursement: data.needsReimbursement !== undefined ? !!data.needsReimbursement : false,
        status: 'DRAFT',
        submittedAt: null,
      },
    });

    // Assign reference ID based on transaction id (EXP-10001, INC-10001, etc.)
    const referenceId = this.generateReferenceId(data.type, t.id);
    await this.prisma.transaction.update({ where: { id: t.id }, data: { referenceId } });

    const created = await this.findById(t.id, userId);
    this.audit.log({
      tableName: 'transactions', recordId: t.id, referenceId: referenceId,
      action: 'INSERT', changedBy: userId, newValues: created,
    }).catch((e) => this.logger.error('audit failed', e));
    return created;
  }

  private async userHasRole(userId: number, roleName: string): Promise<boolean> {
    const found = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: roleName } },
    });
    return !!found;
  }

  // Enforce per-user spend limits (single + monthly) and strict category budgets.
  // Runs at submit time for expenses only — the moment the spend is committed into
  // the approval pipeline. Limits/budgets are computed against COMMITTED_STATUSES
  // (approved + in-flight), matching how "spent" is shown on the dashboard/budgets.
  private async enforceSpendPolicy(txn: { id: number; type: string | null; amount: any; totalAmount?: any; categoryId: number | null; dateRecorded: Date }, userId: number) {
    if (txn.type !== 'expense') return;
    const amount = Number(txn.totalAmount ?? txn.amount) || 0;
    const d = txn.dateRecorded;
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    // ── Per-user spend limits ──
    const perm = await this.prisma.userPermission.findUnique({ where: { userId } });
    if (perm) {
      const singleLimit = perm.singleLimit != null ? Number(perm.singleLimit) : null;
      if (singleLimit != null && singleLimit > 0 && amount > singleLimit) {
        throw new HttpException(
          `This expense (₹${amount.toFixed(2)}) exceeds your single-transaction limit of ₹${singleLimit.toFixed(2)}.`,
          HttpStatus.BAD_REQUEST,
        );
      }
      const monthlyLimit = perm.monthlyLimit != null ? Number(perm.monthlyLimit) : null;
      if (monthlyLimit != null && monthlyLimit > 0) {
        const agg = await this.prisma.transaction.aggregate({
          where: {
            userId, type: 'expense', status: { in: COMMITTED_STATUSES },
            dateRecorded: { gte: start, lte: end }, NOT: { id: txn.id },
          },
          _sum: { amount: true },
        });
        const committed = Number(agg._sum.amount) || 0;
        if (committed + amount > monthlyLimit) {
          throw new HttpException(
            `This expense would bring your committed spend this month to ₹${(committed + amount).toFixed(2)}, exceeding your monthly limit of ₹${monthlyLimit.toFixed(2)}.`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }

    // ── Strict category budget ──
    if (txn.categoryId != null) {
      const budget = await this.prisma.budget.findFirst({
        where: { userId, categoryId: txn.categoryId, periodMonth: month, periodYear: year, isActive: true },
      });
      if (budget && budget.strict_enforcement) {
        const spentAgg = await this.prisma.transaction.aggregate({
          where: {
            userId, type: 'expense', categoryId: txn.categoryId, status: { in: COMMITTED_STATUSES },
            dateRecorded: { gte: start, lte: end }, NOT: { id: txn.id },
          },
          _sum: { amount: true },
        });
        const spent = Number(spentAgg._sum.amount) || 0;
        const allocated = Number(budget.amount) || 0;
        if (spent + amount > allocated) {
          throw new HttpException(
            `This expense would exceed the strict budget for this category (allocated ₹${allocated.toFixed(2)}, already committed ₹${spent.toFixed(2)}).`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
  }

  // Submit a transaction for approval
  // Finance submitting expense or income → PENDING_FINANCE (self-assigned, can self-approve)
  // Manager/Admin submitting expense or income → PENDING_FINANCE (skips manager level)
  // Employee submitting expense → PENDING_MANAGER
  // Employee cannot submit income
  async submit(transactionId: number, userId: number) {
    const txn = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: { user: true },
    });
    if (!txn) throw new HttpException('Transaction not found.', HttpStatus.NOT_FOUND);
    if (!['DRAFT', 'SENT_BACK'].includes(txn.status || '')) {
      throw new HttpException(`Cannot submit transaction with status '${txn.status}'.`, HttpStatus.BAD_REQUEST);
    }

    await this.enforceSpendPolicy(txn, userId);

    const submitter = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { manager: { include: { roleRelation: true } } },
    });

    const [submitterIsManager, submitterIsAdmin, submitterIsFinance] = await Promise.all([
      this.userHasRole(userId, ROLES.MANAGER),
      this.userHasRole(userId, ROLES.ADMIN),
      this.userHasRole(userId, ROLES.FINANCE),
    ]);

    // ── Finance submits → PENDING_FINANCE (self-assigned, Finance can approve their own) ──
    if (submitterIsFinance) {
      await this.prisma.$transaction(async (tx) => {
        await tx.approvalRequest.deleteMany({ where: { transactionId } });
        await tx.approvalRequest.create({
          data: { transactionId, approverId: userId, levelNum: 1, status: 'PENDING' },
        });
        await tx.transaction.update({
          where: { id: transactionId },
          data: { status: 'PENDING_FINANCE', submittedAt: new Date() },
        });
      });
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { submittedById: userId, submittedByName: submitter?.username || 'Unknown' },
      }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      const submitted = await this.findById(transactionId, userId);
      const refId = submitted?.reference_id as string | undefined;
      this.audit.log({
        tableName: 'transactions', recordId: transactionId, referenceId: refId,
        action: 'UPDATE', changedBy: userId,
        oldValues: { status: txn.status }, newValues: { status: 'PENDING_FINANCE' },
      }).catch((e) => this.logger.error('audit failed', e));
      return submitted;
    }

    // ── Income: only Manager/Admin can submit (not Employee) ──
    if (txn.type === 'income') {
      if (!submitterIsManager && !submitterIsAdmin) {
        throw new HttpException('Only Managers, Admins, or Finance can submit income records.', HttpStatus.FORBIDDEN);
      }
      const financeUser = await this.prisma.user.findFirst({
        where: {
          isActive: true,
          userRoles: { some: { role: { name: ROLES.FINANCE } } },
        },
      });
      if (!financeUser) throw new HttpException('No Finance user available to review this income.', HttpStatus.BAD_REQUEST);

      await this.prisma.$transaction(async (tx) => {
        await tx.approvalRequest.deleteMany({ where: { transactionId } });
        await tx.approvalRequest.create({
          data: { transactionId, approverId: financeUser.id, levelNum: 1, status: 'PENDING' },
        });
        await tx.transaction.update({
          where: { id: transactionId },
          data: { status: 'PENDING_FINANCE', submittedAt: new Date() },
        });
      });
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { submittedById: userId, submittedByName: submitter?.username || 'Unknown' },
      }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      const submitted = await this.findById(transactionId, userId);
      const refId = submitted?.reference_id as string | undefined;
      this.audit.log({
        tableName: 'transactions', recordId: transactionId, referenceId: refId,
        action: 'UPDATE', changedBy: userId,
        oldValues: { status: txn.status }, newValues: { status: 'PENDING_FINANCE' },
      }).catch((e) => this.logger.error('audit failed', e));
      this.notifications.create(financeUser.id, {
        type: 'approval', title: 'New Income Pending Finance Review',
        message: `${submitter?.username} submitted ${refId || `income #${transactionId}`} for Finance review.`,
        entityType: 'transaction', entityId: transactionId, referenceId: refId,
      }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      return submitted;
    }

    // ── Expense: Manager/Admin → skip manager level, go directly to PENDING_FINANCE ──
    if (submitterIsManager || submitterIsAdmin) {
      const financeUser = await this.prisma.user.findFirst({
        where: {
          isActive: true,
          id: { not: userId },
          userRoles: { some: { role: { name: ROLES.FINANCE } } },
        },
      });
      if (!financeUser) throw new HttpException('No Finance user available to review this expense.', HttpStatus.BAD_REQUEST);

      await this.prisma.$transaction(async (tx) => {
        await tx.approvalRequest.deleteMany({ where: { transactionId } });
        await tx.approvalRequest.create({
          data: { transactionId, approverId: financeUser.id, levelNum: 1, status: 'PENDING' },
        });
        await tx.transaction.update({
          where: { id: transactionId },
          data: { status: 'PENDING_FINANCE', submittedAt: new Date() },
        });
      });
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { submittedById: userId, submittedByName: submitter?.username || 'Unknown' },
      }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      const submittedMgr = await this.findById(transactionId, userId);
      const refIdMgr = submittedMgr?.reference_id as string | undefined;
      this.audit.log({
        tableName: 'transactions', recordId: transactionId, referenceId: refIdMgr,
        action: 'UPDATE', changedBy: userId,
        oldValues: { status: txn.status }, newValues: { status: 'PENDING_FINANCE' },
      }).catch((e) => this.logger.error('audit failed', e));
      this.notifications.create(financeUser.id, {
        type: 'approval', title: 'New Expense Pending Finance Review',
        message: `${submitter?.username} submitted ${refIdMgr || `expense #${transactionId}`} for Finance review.`,
        entityType: 'transaction', entityId: transactionId, referenceId: refIdMgr,
      }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      return submittedMgr;
    }

    // ── Expense: Employee → PENDING_MANAGER ──
    let managerId: number | null = null;
    const directManager = submitter?.manager;
    if (directManager && directManager.id !== userId) {
      const dmHasManagerRole = await this.prisma.userRole.findFirst({
        where: { userId: directManager.id, role: { name: ROLES.MANAGER } },
      });
      if (dmHasManagerRole) managerId = directManager.id;
    }
    if (!managerId) {
      const anyManager = await this.prisma.user.findFirst({
        where: {
          isActive: true,
          id: { not: userId },
          userRoles: { some: { role: { name: ROLES.MANAGER } } },
        },
      });
      managerId = anyManager?.id ?? null;
    }

    if (!managerId) throw new HttpException('No manager available to approve this expense.', HttpStatus.BAD_REQUEST);

    await this.prisma.$transaction(async (tx) => {
      await tx.approvalRequest.deleteMany({ where: { transactionId } });
      await tx.approvalRequest.create({
        data: { transactionId, approverId: managerId!, levelNum: 1, status: 'PENDING' },
      });
      await tx.transaction.update({
        where: { id: transactionId },
        data: { status: 'PENDING_MANAGER', submittedAt: new Date() },
      });
    });
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { submittedById: userId, submittedByName: submitter?.username || 'Unknown' },
    }).catch((e: any) => this.logger.warn('Background task failed', e?.message));

    const submitted = await this.findById(transactionId, userId);
    const refId = submitted?.reference_id as string | undefined;
    this.audit.log({
      tableName: 'transactions', recordId: transactionId, referenceId: refId,
      action: 'UPDATE', changedBy: userId,
      oldValues: { status: txn.status }, newValues: { status: 'PENDING_MANAGER' },
    }).catch((e) => this.logger.error('audit failed', e));
    this.notifications.create(managerId, {
      type: 'approval', title: 'New Expense Pending Approval',
      message: `${submitter?.username} submitted ${refId || `expense #${transactionId}`} for your approval.`,
      entityType: 'transaction', entityId: transactionId, referenceId: refId,
    }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    return submitted;
  }

  async update(id: number, userId: number, data: any) {
    // Guard: only DRAFT or SENT_BACK transactions can be edited
    const existing = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (existing && !['DRAFT', 'SENT_BACK'].includes(existing.status || '')) {
      throw new HttpException(
        `Cannot edit transaction with status '${existing.status}'. Only DRAFT or SENT_BACK records can be modified.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const oldSnapshot = existing ? this.mapTransaction(existing) : null;
    const gstFieldsUpd = buildGstFields(Number(data.amount), data.gstRate ?? null, !!data.gstIncluded);

    await this.prisma.transaction.updateMany({
      where: { id, userId },
      data: {
        type: data.type,
        ...gstFieldsUpd,
        dateRecorded: new Date(data.dateRecorded),
        categoryId: data.categoryId ? Number(data.categoryId) : null, description: data.description || null,
        paymentMethod: data.paymentMethod || 'cash', receiptPath: data.receiptPath || null,
        clientId: data.clientId ? Number(data.clientId) : null, projectId: data.projectId ? Number(data.projectId) : null,
        productId: data.productId ? Number(data.productId) : null, contextType: data.contextType || 'project',
        receiptNumber: data.receiptNumber || null, currency: data.currency || 'INR',
        ...(data.isClaimable !== undefined ? { isClaimable: !!data.isClaimable } : {}),
        ...(data.needsReimbursement !== undefined ? { needsReimbursement: !!data.needsReimbursement } : {}),
      },
    });
    const updated = await this.findById(id, userId);
    this.audit.log({
      tableName: 'transactions', recordId: id, referenceId: updated?.reference_id as string | undefined,
      action: 'UPDATE', changedBy: userId,
      oldValues: oldSnapshot, newValues: updated,
    }).catch((e) => this.logger.error('audit failed', e));
    return updated;
  }

  async delete(id: number, userId: number) {
    const existing = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (existing && ['APPROVED', 'REJECTED', 'PENDING_MANAGER', 'PENDING_FINANCE'].includes(existing.status || '')) {
      throw new HttpException(`Cannot delete a transaction with status '${existing.status}'.`, HttpStatus.BAD_REQUEST);
    }
    const result = await this.prisma.transaction.updateMany({ where: { id, userId }, data: { status: 'DELETED' } });
    if (result.count > 0) {
      this.audit.log({
        tableName: 'transactions', recordId: id, referenceId: existing?.referenceId ?? undefined,
        action: 'DELETE', changedBy: userId,
        oldValues: { id, status: existing?.status }, newValues: { status: 'DELETED' },
      }).catch((e) => this.logger.error('audit failed', e));
    }
    return result.count > 0;
  }

  async bulkDelete(ids: number[], userId: number) {
    const existing = await this.prisma.transaction.findMany({
      where: { userId, id: { in: ids }, NOT: { status: 'DELETED' } }, select: { id: true, referenceId: true, status: true },
    });
    const locked = existing.filter((e) => ['APPROVED', 'REJECTED'].includes(e.status || ''));
    if (locked.length > 0) {
      throw new HttpException(
        `Cannot delete ${locked.length} transaction(s) with status APPROVED or REJECTED.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.prisma.transaction.updateMany({ where: { userId, id: { in: ids } }, data: { status: 'DELETED' } });
    if (result.count > 0) {
      for (const e of existing) {
        this.audit.log({
          tableName: 'transactions', recordId: e.id, referenceId: e.referenceId ?? undefined,
          action: 'DELETE', changedBy: userId,
          oldValues: { id: e.id, status: e.status }, newValues: { status: 'DELETED' },
        }).catch((e) => this.logger.error('audit failed', e));
      }
    }
    return { deleted: result.count, records: existing.map((e) => ({ id: e.id, reference_id: e.referenceId })) };
  }

  async getApprovalTrail(transactionId: number, userId?: number) {
    if (userId) {
      const isOwner = await this.prisma.transaction.findFirst({ where: { id: transactionId, userId }, select: { id: true } });
      if (!isOwner) {
        const hasRole = await this.prisma.userRole.findFirst({ where: { userId, role: { name: { in: [ROLES.FINANCE, ROLES.MANAGER, ROLES.ADMIN] } } } });
        if (!hasRole) throw new HttpException('Access denied.', HttpStatus.FORBIDDEN);
      }
    }
    const requests = await this.prisma.approvalRequest.findMany({
      where: { transactionId },
      include: { approver: true },
      orderBy: { createdAt: 'asc' },
    });
    return requests.map((r) => ({
      id: r.id,
      level: r.levelNum,
      status: r.status,
      approver_name: r.approver?.username || null,
      comments: r.comments || null,
      action_date: r.actionDate || r.resolvedAt || null,
      created_at: r.createdAt,
    }));
  }

  async getSplits(transactionId: number, userId?: number) {
    if (userId) {
      const isOwner = await this.prisma.transaction.findFirst({ where: { id: transactionId, userId }, select: { id: true } });
      if (!isOwner) {
        const hasRole = await this.prisma.userRole.findFirst({ where: { userId, role: { name: { in: [ROLES.FINANCE, ROLES.MANAGER, ROLES.ADMIN] } } } });
        if (!hasRole) throw new HttpException('Access denied.', HttpStatus.FORBIDDEN);
      }
    }
    const splits = await this.prisma.transactionSplit.findMany({
      where: { transactionId },
      include: { category: true, client: true, project: true, product: true },
      orderBy: { id: 'asc' },
    });
    return splits.map((s) => ({
      id: s.id,
      category_id: s.categoryId,
      category_name: s.category?.name ?? null,
      amount: Number(s.amount),
      description: s.description,
      client_id: s.clientId ?? null,
      client_name: (s as any).client?.name ?? null,
      project_id: s.projectId ?? null,
      project_name: (s as any).project?.name ?? null,
      product_id: s.productId ?? null,
      product_name: (s as any).product?.name ?? null,
    }));
  }

  async split(transactionId: number, splits: any[], userId: number) {
    if (!splits || splits.length < 2) {
      throw new HttpException('At least 2 splits are required.', HttpStatus.BAD_REQUEST);
    }

    const original = await this.prisma.transaction.findFirst({ where: { id: transactionId, userId } });
    if (!original) throw new HttpException('Transaction not found.', HttpStatus.NOT_FOUND);
    if (['APPROVED', 'REJECTED'].includes(original.status || '')) {
      throw new HttpException(`Cannot split a transaction with status '${original.status}'.`, HttpStatus.BAD_REQUEST);
    }

    const splitTotal = parseFloat(splits.reduce((sum, s) => sum + Number(s.amount), 0).toFixed(2));
    const originalAmount = parseFloat(Number(original.amount).toFixed(2));

    if (Math.abs(splitTotal - originalAmount) > 0.01) {
      throw new HttpException(
        `Split amounts (${splitTotal}) must sum to the original transaction amount (${originalAmount}).`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Clear any existing splits (supports re-splitting)
      await tx.transactionSplit.deleteMany({ where: { transactionId } });
      await tx.transactionSplit.createMany({
        data: splits.map((s) => ({
          transactionId,
          categoryId: Number(s.categoryId),
          amount: Number(s.amount),
          description: s.description || null,
          clientId: s.clientId ? Number(s.clientId) : (s.client_id ? Number(s.client_id) : null),
          projectId: s.projectId ? Number(s.projectId) : (s.project_id ? Number(s.project_id) : null),
          productId: s.productId ? Number(s.productId) : (s.product_id ? Number(s.product_id) : null),
        })),
      });
      await tx.transaction.update({ where: { id: transactionId }, data: { isSplit: true } });
    });
    this.audit.log({
      tableName: 'transactions', recordId: transactionId, referenceId: original.referenceId ?? undefined,
      action: 'UPDATE', changedBy: userId,
      oldValues: { isSplit: original.isSplit }, newValues: { isSplit: true, splits },
    }).catch((e) => this.logger.error('audit failed', e));
    return true;
  }

  async getNotes(transactionId: number) {
    const notes = await this.prisma.transactionNote.findMany({
      where: { transactionId },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return notes.map((n) => ({
      id: n.id, note: n.note, created_at: n.createdAt,
      user_id: n.userId, username: n.user?.username || 'Unknown',
    }));
  }

  async addNote(transactionId: number, userId: number, note: string) {
    if (!note?.trim()) throw new HttpException('Note cannot be empty.', HttpStatus.BAD_REQUEST);
    const n = await this.prisma.transactionNote.create({
      data: { transactionId, userId, note: note.trim().slice(0, 1000) },
      include: { user: { select: { id: true, username: true } } },
    });
    return { id: n.id, note: n.note, created_at: n.createdAt, user_id: n.userId, username: n.user?.username || 'Unknown' };
  }

  async deleteNote(noteId: number, userId: number) {
    const n = await this.prisma.transactionNote.findUnique({ where: { id: noteId } });
    if (!n) throw new HttpException('Note not found.', HttpStatus.NOT_FOUND);
    if (n.userId !== userId) throw new HttpException('You can only delete your own notes.', HttpStatus.FORBIDDEN);
    await this.prisma.transactionNote.delete({ where: { id: noteId } });
    return { deleted: true };
  }

  async markReimbursed(transactionId: number, userId: number, dto: { status: string; reference?: string; note?: string }) {
    const txn = await this.prisma.transaction.findFirst({ where: { id: transactionId } });
    if (!txn) throw new HttpException('Transaction not found.', HttpStatus.NOT_FOUND);
    if (!txn.needsReimbursement) throw new HttpException('Transaction does not require reimbursement.', HttpStatus.BAD_REQUEST);
    if (txn.reimbursementStatus === 'PAID') throw new HttpException('Transaction already reimbursed.', HttpStatus.BAD_REQUEST);

    const actingUser = await this.prisma.user.findUnique({ where: { id: userId } });
    const hasRole = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: { in: [ROLES.FINANCE, ROLES.ADMIN] } } },
    });
    if (!hasRole) throw new HttpException('Only Finance or Admin can process reimbursements.', HttpStatus.FORBIDDEN);

    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        reimbursementStatus: dto.status,
        reimbursedAt: new Date(),
        reimbursedById: userId,
        reimbursedByName: actingUser?.username || 'Unknown',
        reimbursementReference: dto.reference ?? null,
        reimbursementNote: dto.note ?? null,
      },
    });
    this.audit.log({
      tableName: 'transactions', recordId: transactionId,
      referenceId: txn.referenceId ?? undefined,
      action: 'UPDATE', changedBy: userId,
      oldValues: { reimbursement_status: txn.reimbursementStatus },
      newValues: { reimbursement_status: dto.status, reimbursed_by: actingUser?.username, reference: dto.reference },
    }).catch((e) => this.logger.error('audit failed', e));

    const refId = txn.referenceId ?? `#${transactionId}`;
    const statusLabel = dto.status === 'PAID' ? 'Reimbursed' : 'On Hold';
    this.notifications.create(txn.userId, {
      type: 'approval',
      title: `Expense ${statusLabel}`,
      message: dto.status === 'PAID'
        ? `Your expense ${refId} has been reimbursed${dto.reference ? ` (Ref: ${dto.reference})` : ''}.`
        : `Your reimbursement for ${refId} has been placed on hold${dto.note ? `: ${dto.note}` : '.'}`,
      entityType: 'transaction', entityId: transactionId, referenceId: String(txn.referenceId ?? ''),
    }).catch((e: any) => this.logger.warn('Background task failed', e?.message));

    return { reimbursed: true };
  }

  async getReimbursementQueue(filters: any) {
    const where: any = {
      needsReimbursement: true,
      status: 'APPROVED',
      type: 'expense',
    };
    if (filters.status === 'PAID') where.reimbursementStatus = 'PAID';
    else if (filters.status === 'ON_HOLD') where.reimbursementStatus = 'ON_HOLD';
    else if (!filters.status || filters.status === 'PENDING') where.reimbursementStatus = null;
    // status === 'ALL' → no reimbursementStatus filter

    if (filters.userId) where.userId = Number(filters.userId);
    if (filters.categoryId) where.categoryId = Number(filters.categoryId);
    if (filters.dateFrom) where.dateRecorded = { ...where.dateRecorded, gte: new Date(filters.dateFrom) };
    if (filters.dateTo) where.dateRecorded = { ...where.dateRecorded, lte: new Date(filters.dateTo) };

    const rows = await this.prisma.transaction.findMany({
      where,
      include: { category: true, client: true, project: true, product: true, user: true },
      orderBy: [{ dateRecorded: 'desc' }, { id: 'desc' }],
    });

    return rows.map((t) => ({
      ...this.mapTransaction(t),
      employee_name: (t.user as any)?.username || `User ${t.userId}`,
      employee_id: `NT${10000 + t.userId}`,
    }));
  }

  async bulkMarkReimbursed(ids: number[], userId: number, dto: { status: string; reference?: string; note?: string }) {
    if (!ids?.length) throw new HttpException('No transaction IDs provided.', HttpStatus.BAD_REQUEST);

    const hasRole = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: { in: [ROLES.FINANCE, ROLES.ADMIN] } } },
    });
    if (!hasRole) throw new HttpException('Only Finance or Admin can process reimbursements.', HttpStatus.FORBIDDEN);

    const actingUser = await this.prisma.user.findUnique({ where: { id: userId } });
    const username = actingUser?.username || 'Unknown';

    // Allow PENDING (null) and ON_HOLD → new status; block re-processing already PAID
    // Note: { not: 'PAID' } in Prisma excludes NULL rows in SQL — must use OR explicitly
    const eligible = await this.prisma.transaction.findMany({
      where: {
        id: { in: ids },
        needsReimbursement: true,
        status: 'APPROVED',
        OR: [
          { reimbursementStatus: null },
          { reimbursementStatus: 'ON_HOLD' },
        ],
      },
      select: { id: true, referenceId: true },
    });
    if (!eligible.length) throw new HttpException('No eligible transactions found.', HttpStatus.BAD_REQUEST);

    const eligibleIds = eligible.map((t) => t.id);
    await this.prisma.transaction.updateMany({
      where: { id: { in: eligibleIds } },
      data: {
        reimbursementStatus: dto.status,
        reimbursedAt: new Date(),
        reimbursedById: userId,
        reimbursedByName: username,
        reimbursementReference: dto.reference ?? null,
        reimbursementNote: dto.note ?? null,
      },
    });
    for (const t of eligible) {
      this.audit.log({
        tableName: 'transactions', recordId: t.id, referenceId: t.referenceId ?? undefined,
        action: 'UPDATE', changedBy: userId,
        oldValues: { reimbursement_status: null },
        newValues: { reimbursement_status: dto.status, reimbursed_by: username, reference: dto.reference, bulk: true },
      }).catch((e) => this.logger.error('audit failed', e));
    }

    // Notify each unique owner about their reimbursed transactions
    const owners = await this.prisma.transaction.findMany({
      where: { id: { in: eligibleIds } },
      select: { id: true, userId: true, referenceId: true },
    });
    const byOwner: Record<number, string[]> = {};
    for (const t of owners) {
      if (!byOwner[t.userId]) byOwner[t.userId] = [];
      byOwner[t.userId].push(t.referenceId ?? `#${t.id}`);
    }
    const statusLabel = dto.status === 'PAID' ? 'Reimbursed' : 'On Hold';
    for (const [ownerId, refs] of Object.entries(byOwner)) {
      this.notifications.create(Number(ownerId), {
        type: 'approval',
        title: `Expense${refs.length > 1 ? 's' : ''} ${statusLabel}`,
        message: dto.status === 'PAID'
          ? `${refs.length} expense${refs.length > 1 ? 's' : ''} reimbursed${dto.reference ? ` (Ref: ${dto.reference})` : ''}: ${refs.join(', ')}`
          : `${refs.length} reimbursement${refs.length > 1 ? 's' : ''} placed on hold: ${refs.join(', ')}`,
        entityType: 'transaction', entityId: Number(ownerId), referenceId: refs[0],
      }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    }

    return { reimbursed: eligibleIds.length, ids: eligibleIds };
  }

  async exportCsv(userId: number, filters: any): Promise<string> {
    const where: any = { userId, NOT: { status: 'DELETED' } };
    if (filters.dateFrom) where.dateRecorded = { ...where.dateRecorded, gte: new Date(filters.dateFrom) };
    if (filters.dateTo) where.dateRecorded = { ...where.dateRecorded, lte: new Date(filters.dateTo) };
    if (filters.category) where.categoryId = Number(filters.category);
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
    if (filters.clientId) where.clientId = Number(filters.clientId);
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;

    const transactions = await this.prisma.transaction.findMany({
      where, include: { category: true, client: true, project: true, product: true },
      orderBy: [{ dateRecorded: 'desc' }, { id: 'desc' }],
      take: 10000,
    });

    const esc = (v: any) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
    const headers = ['Reference', 'Date', 'Type', 'Description', 'Category', 'Client', 'Project', 'Payment Method', 'Status', 'Net Amount', 'GST Rate', 'Total Amount', 'Is Claimable'];
    const rows = transactions.map((t) => {
      const m = this.mapTransaction(t);
      return [
        m.reference_id, m.date_recorded, m.type, m.description, m.category_name,
        m.client_name, m.project_name, m.payment_method, m.status,
        m.net_amount, m.gst_rate != null ? `${m.gst_rate}%` : '', m.total_amount,
        m.is_claimable ? 'Yes' : 'No',
      ].map(esc).join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }

  async duplicate(id: number, userId: number) {
    const original = await this.prisma.transaction.findFirst({
      where: { id, userId, NOT: { status: 'DELETED' } },
    });
    if (!original) throw new HttpException('Transaction not found.', HttpStatus.NOT_FOUND);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const t = await this.prisma.transaction.create({
      data: {
        userId, type: original.type,
        amount: original.amount,
        netAmount: original.netAmount, totalAmount: original.totalAmount,
        gstRate: original.gstRate, gstIncluded: original.gstIncluded ?? false,
        isClaimable: original.isClaimable,
        needsReimbursement: original.needsReimbursement ?? false,
        receiptNumber: original.receiptNumber ?? null,
        dateRecorded: today,
        categoryId: original.categoryId,
        description: original.description,
        paymentMethod: original.paymentMethod,
        clientId: original.clientId, projectId: original.projectId,
        productId: original.productId, contextType: original.contextType,
        currency: original.currency, status: 'DRAFT',
      },
    });
    const referenceId = this.generateReferenceId(original.type, t.id);
    await this.prisma.transaction.update({ where: { id: t.id }, data: { referenceId } });
    const created = await this.findById(t.id, userId);
    this.audit.log({
      tableName: 'transactions', recordId: t.id, referenceId,
      action: 'INSERT', changedBy: userId,
      newValues: { ...created, duplicatedFrom: id },
    }).catch((e) => this.logger.error('audit failed', e));
    return created;
  }

  async checkDuplicates(userId: number, data: { totalAmount: number; receiptNumber?: string; projectId?: number; dateRecorded: string; type: string; excludeId?: number }) {
    const { totalAmount, receiptNumber, projectId, dateRecorded, type, excludeId } = data;
    const date = new Date(dateRecorded);
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
    const base: any = {
      userId,
      type,
      status: { notIn: ['DELETED', 'VOIDED'] },
    };
    if (excludeId) base.id = { not: Number(excludeId) };

    // Hard block: same receipt number (regardless of date or category)
    if (receiptNumber && receiptNumber.trim()) {
      const receiptMatches = await this.prisma.transaction.findMany({
        where: { ...base, receiptNumber: receiptNumber.trim() },
        include: { category: true, client: true, project: true, product: true },
        take: 5,
      });
      if (receiptMatches.length > 0) {
        return { hardBlock: true, softWarn: false, matches: receiptMatches.map(this.mapTransaction.bind(this)) };
      }
    }

    // Soft warn: same totalAmount + same date
    const exactMatches = await this.prisma.transaction.findMany({
      where: { ...base, totalAmount: Number(totalAmount), dateRecorded: { gte: dayStart, lte: dayEnd } },
      include: { category: true, client: true, project: true, product: true },
      take: 5,
    });
    if (exactMatches.length > 0) {
      return { hardBlock: false, softWarn: true, matches: exactMatches.map(this.mapTransaction.bind(this)) };
    }

    // Soft warn: similar totalAmount (±10%) within ±7 days, optionally same project
    const weekAgo = new Date(date); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekLater = new Date(date); weekLater.setDate(weekLater.getDate() + 7);
    const nearMatches = await this.prisma.transaction.findMany({
      where: {
        ...base,
        ...(projectId ? { projectId: Number(projectId) } : {}),
        dateRecorded: { gte: weekAgo, lte: weekLater },
        totalAmount: { gte: Number(totalAmount) * 0.9, lte: Number(totalAmount) * 1.1 },
      },
      include: { category: true, client: true, project: true, product: true },
      take: 5,
    });

    return { hardBlock: false, softWarn: nearMatches.length > 0, matches: nearMatches.map(this.mapTransaction.bind(this)) };
  }

  async void(id: number, userId: number, reason: string) {
    const txn = await this.prisma.transaction.findFirst({
      where: { id, NOT: { status: 'DELETED' } },
    });
    if (!txn) throw new HttpException('Transaction not found.', HttpStatus.NOT_FOUND);
    if (txn.status !== 'APPROVED') {
      throw new HttpException('Only APPROVED transactions can be voided.', HttpStatus.BAD_REQUEST);
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const voidedByName = user?.username || 'Unknown';

    await this.prisma.transaction.update({
      where: { id },
      data: {
        status: 'VOIDED',
        voidedById: userId,
        voidedByName: voidedByName,
        voidedAt: new Date(),
        voidReason: reason || null,
      },
    });

    this.audit.log({
      tableName: 'transactions', recordId: id,
      referenceId: txn.referenceId ?? undefined,
      action: 'UPDATE', changedBy: userId,
      oldValues: { status: 'APPROVED' }, newValues: { status: 'VOIDED', void_reason: reason, voided_by: voidedByName },
    }).catch((e) => this.logger.error('audit failed', e));
    return { voided: true };
  }
}
