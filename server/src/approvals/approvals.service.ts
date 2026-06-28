import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ROLES } from '../common/constants/roles';

// Approval levels:
//   Level 1 = Manager approval  → status PENDING_MANAGER
//   Level 2 = Finance approval  → status PENDING_FINANCE
// After Finance approves → APPROVED
// Reject at any level   → REJECTED
// Send back at any level → SENT_BACK (submitter can re-edit and resubmit)

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  // Map a raw ApprovalRequest for a regular transaction
  private mapRequest(r: any) {
    const tx = r.transaction;
    return {
      id: r.id,
      record_type: 'transaction',
      transaction_id: r.transactionId,
      approver_id: r.approverId,
      level_num: r.levelNum,
      reference_id: tx?.referenceId,
      code: tx?.referenceId,
      type: tx?.type,
      amount: tx?.totalAmount ?? tx?.amount,
      net_amount: tx?.netAmount ?? tx?.amount,
      total_amount: tx?.totalAmount ?? tx?.amount,
      gst_rate: tx?.gstRate != null ? Number(tx.gstRate) : null,
      is_claimable: tx?.isClaimable ?? false,
      needs_reimbursement: tx?.needsReimbursement ?? false,
      date_recorded: tx?.dateRecorded,
      category_name: tx?.category?.name,
      description: tx?.description,
      submitted_by: tx?.submittedByName ?? tx?.user?.username,
      submitted_by_name: tx?.submittedByName ?? tx?.user?.username,
      submitted_by_id: tx?.submittedById ?? tx?.user?.id,
      status: r.status,
      transaction_status: tx?.status,
      is_split: tx?.isSplit ? 1 : 0,
      receipt_path: tx?.receiptPath || null,
      comments: r.comments,
      created_at: r.createdAt,
      submitted_at: tx?.submittedAt,
      approved_by_name: tx?.approvedByName ?? null,
      approved_by_role: tx?.approvedByRole ?? null,
      approved_at: tx?.approvedAt ?? null,
      rejected_by_name: tx?.rejectedByName ?? null,
      rejected_by_role: tx?.rejectedByRole ?? null,
      rejected_at: tx?.rejectedAt ?? null,
      sent_back_by_name: tx?.sentBackByName ?? null,
      sent_back_by_role: tx?.sentBackByRole ?? null,
      sent_back_at: tx?.sentBackAt ?? null,
      reimbursement_status: tx?.reimbursementStatus ?? null,
      reimbursed_at: tx?.reimbursedAt ?? null,
      reimbursed_by_name: tx?.reimbursedByName ?? null,
      reimbursement_reference: tx?.reimbursementReference ?? null,
      reimbursement_note: tx?.reimbursementNote ?? null,
    };
  }

  // Map a raw ApprovalRequest for a recurring transaction
  private mapRecurringRequest(r: any) {
    const rec = r.recurringTransaction;
    return {
      id: r.id,
      record_type: 'recurring',
      recurring_id: rec?.id,
      approver_id: r.approverId,
      level_num: r.levelNum,
      reference_id: rec?.code,
      code: rec?.code,
      type: rec?.type ?? 'expense',
      amount: rec?.amount != null ? Number(rec.amount) : null,
      net_amount: rec?.amount != null ? Number(rec.amount) : null,
      total_amount: rec?.amount != null ? Number(rec.amount) : null,
      gst_rate: null,
      is_claimable: false,
      needs_reimbursement: false,
      date_recorded: rec?.createdAt,
      category_name: rec?.category?.name ?? null,
      description: rec?.description ?? null,
      submitted_by: (rec as any)?.submittedByName ?? rec?.user?.username,
      submitted_by_name: (rec as any)?.submittedByName ?? rec?.user?.username,
      submitted_by_id: rec?.userId,
      status: r.status,
      transaction_status: (rec as any)?.status,
      is_split: 0,
      receipt_path: null,
      comments: r.comments,
      created_at: r.createdAt,
      submitted_at: rec?.updatedAt,
      approved_by_name: (rec as any)?.approvedByName ?? null,
      approved_by_role: null,
      approved_at: null,
      rejected_by_name: (rec as any)?.rejectedByName ?? null,
      rejected_by_role: null,
      rejected_at: null,
      sent_back_by_name: (rec as any)?.sentBackByName ?? null,
      sent_back_by_role: null,
      sent_back_at: null,
    };
  }

  private async userHasRole(userId: number, roleName: string): Promise<boolean> {
    const found = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: roleName } },
    });
    return !!found;
  }

  private async getApproverInfo(approverId: number) {
    const approver = await this.prisma.user.findUnique({
      where: { id: approverId },
      include: { roleRelation: true },
    });
    return {
      id: approverId,
      name: approver?.username || 'Unknown',
      role: approver?.roleRelation?.name || 'Unknown',
    };
  }

  // Shared include clause for recurring approval requests
  private get recurringInclude() {
    return {
      recurringTransaction: {
        include: { category: true, user: true },
      },
    };
  }

  async getPending(approverId: number, _jwtRoleName?: string) {
    const [isManager, isFinance] = await Promise.all([
      this.userHasRole(approverId, ROLES.MANAGER),
      this.userHasRole(approverId, ROLES.FINANCE),
    ]);

    const results: any[] = [];

    if (isManager) {
      // Manager sees PENDING_MANAGER transactions (not their own) and recurring
      const [txRequests, recRequests] = await Promise.all([
        this.prisma.approvalRequest.findMany({
          where: {
            status: 'PENDING',
            transactionId: { not: null },
            transaction: { status: 'PENDING_MANAGER', userId: { not: approverId } },
          },
          include: { transaction: { include: { category: true, user: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.approvalRequest.findMany({
          where: {
            status: 'PENDING',
            recurringTransactionId: { not: null },
            recurringTransaction: { status: 'PENDING_MANAGER', userId: { not: approverId } },
          },
          include: this.recurringInclude,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      results.push(...txRequests.map((r) => this.mapRequest(r)));
      results.push(...recRequests.map((r) => this.mapRecurringRequest(r)));
    }

    if (isFinance) {
      // Finance sees PENDING_FINANCE transactions and recurring
      const [txRequests, recRequests] = await Promise.all([
        this.prisma.approvalRequest.findMany({
          where: {
            status: 'PENDING',
            transactionId: { not: null },
            transaction: { status: 'PENDING_FINANCE' },
          },
          include: { transaction: { include: { category: true, user: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.approvalRequest.findMany({
          where: {
            status: 'PENDING',
            recurringTransactionId: { not: null },
            recurringTransaction: { status: 'PENDING_FINANCE' },
          },
          include: this.recurringInclude,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      const existingIds = new Set(results.map((r) => r.id));
      results.push(...txRequests.filter((r) => !existingIds.has(r.id)).map((r) => this.mapRequest(r)));
      results.push(...recRequests.map((r) => this.mapRecurringRequest(r)));
    }

    if (!isManager && !isFinance) {
      // Employee/Admin: show requests directly assigned to them
      const requests = await this.prisma.approvalRequest.findMany({
        where: { approverId, status: 'PENDING' },
        include: { transaction: { include: { category: true, user: true } } },
        orderBy: { createdAt: 'desc' },
      });
      results.push(...requests.map((r) => this.mapRequest(r)));
    }

    return results;
  }

  async getHistory(userId: number, _jwtRoleName?: string, statusFilter?: string) {
    const [isFinance, isManager] = await Promise.all([
      this.userHasRole(userId, ROLES.FINANCE),
      this.userHasRole(userId, ROLES.MANAGER),
    ]);

    if (!isFinance && !isManager) {
      // Employee: own APPROVED and REJECTED submissions
      const [txRequests, recRequests] = await Promise.all([
        this.prisma.approvalRequest.findMany({
          where: { transactionId: { not: null }, transaction: { userId, status: { in: ['APPROVED', 'REJECTED'] } } },
          include: { transaction: { include: { category: true, user: true } } },
          orderBy: { createdAt: 'desc' },
          distinct: ['transactionId'],
        }),
        this.prisma.approvalRequest.findMany({
          where: { recurringTransactionId: { not: null }, recurringTransaction: { userId, status: { in: ['APPROVED', 'REJECTED'] } } },
          include: this.recurringInclude,
          orderBy: { createdAt: 'desc' },
          distinct: ['recurringTransactionId'],
        }),
      ]);
      return [...txRequests.map((r) => this.mapRequest(r)), ...recRequests.map((r) => this.mapRecurringRequest(r))];
    }

    // Finance or Manager: show requests this user has already acted on
    const [txRequests, recRequests] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where: {
          approverId: userId,
          status: { in: ['APPROVED', 'REJECTED', 'SENT_BACK'] },
          transactionId: { not: null },
        },
        include: { transaction: { include: { category: true, user: true } } },
        orderBy: { createdAt: 'desc' },
        distinct: ['transactionId'],
      }),
      this.prisma.approvalRequest.findMany({
        where: {
          approverId: userId,
          status: { in: ['APPROVED', 'REJECTED', 'SENT_BACK'] },
          recurringTransactionId: { not: null },
        },
        include: this.recurringInclude,
        orderBy: { createdAt: 'desc' },
        distinct: ['recurringTransactionId'],
      }),
    ]);
    return [...txRequests.map((r) => this.mapRequest(r)), ...recRequests.map((r) => this.mapRecurringRequest(r))];
  }

  async approve(requestId: number, approverId: number, comments?: string, isClaimable?: boolean) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: {
        transaction: { include: { user: true } },
        recurringTransaction: { include: { user: true } },
      },
    });
    if (!req) throw new HttpException('Approval request not found.', HttpStatus.NOT_FOUND);
    if (req.status !== 'PENDING') return { message: 'Request already processed.' };

    // Delegate recurring approval to recurring service logic inline
    if (req.recurringTransactionId) {
      const rec = req.recurringTransaction as any;
      const recStatus = rec?.status;
      const [approverIsManager, approverIsFinance] = await Promise.all([
        this.userHasRole(approverId, ROLES.MANAGER),
        this.userHasRole(approverId, ROLES.FINANCE),
      ]);
      if (recStatus === 'PENDING_MANAGER' && !approverIsManager) throw new HttpException('Only Managers can approve at this stage.', HttpStatus.FORBIDDEN);
      if (recStatus === 'PENDING_FINANCE' && !approverIsFinance) throw new HttpException('Only Finance can approve at this stage.', HttpStatus.FORBIDDEN);

      const approver = await this.prisma.user.findUnique({ where: { id: approverId } });
      const approverName = approver?.username || 'Unknown';
      const code = rec?.code || `#${req.recurringTransactionId}`;

      if (recStatus === 'PENDING_MANAGER') {
        const financeUser = await this.prisma.user.findFirst({
          where: { isActive: true, id: { not: rec.userId }, userRoles: { some: { role: { name: ROLES.FINANCE } } } },
        });
        await this.prisma.$transaction(async (tx) => {
          await tx.approvalRequest.update({
            where: { id: requestId },
            data: { approverId, status: 'APPROVED', actionDate: new Date(), resolvedAt: new Date() },
          });
          if (financeUser) {
            await tx.approvalRequest.create({
              data: { recurringTransactionId: req.recurringTransactionId!, approverId: financeUser.id, levelNum: 2, status: 'PENDING' },
            });
            await tx.recurringTransaction.update({
              where: { id: req.recurringTransactionId! },
              data: { status: 'PENDING_FINANCE', approvedByName: approverName },
            });
          } else {
            await tx.recurringTransaction.update({
              where: { id: req.recurringTransactionId! },
              data: { status: 'APPROVED', isActive: true, approvedByName: approverName },
            });
          }
        });
        this.audit.log({ tableName: 'recurring_transactions', recordId: req.recurringTransactionId, action: 'UPDATE', changedBy: approverId, oldValues: { status: 'PENDING_MANAGER' }, newValues: { status: financeUser ? 'PENDING_FINANCE' : 'APPROVED' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
        if (financeUser) {
          this.notifications.create(financeUser.id, { type: 'approval', title: 'Recurring Schedule Pending Finance Review', message: `${code} approved by Manager, awaiting your final approval.`, entityType: 'recurring', entityId: req.recurringTransactionId! }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
        } else {
          this.notifications.create(rec.userId, { type: 'approval', title: 'Recurring Schedule Approved', message: `Your recurring schedule ${code} has been approved.`, entityType: 'recurring', entityId: req.recurringTransactionId! }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
        }
        return { message: financeUser ? 'Approved. Escalated to Finance for final approval.' : 'Approved.' };
      }

      if (recStatus === 'PENDING_FINANCE') {
        await this.prisma.$transaction(async (tx) => {
          await tx.approvalRequest.update({
            where: { id: requestId },
            data: { approverId, status: 'APPROVED', actionDate: new Date(), resolvedAt: new Date() },
          });
          await tx.recurringTransaction.update({
            where: { id: req.recurringTransactionId! },
            data: { status: 'APPROVED', isActive: true, approvedByName: approverName },
          });
        });
        this.audit.log({ tableName: 'recurring_transactions', recordId: req.recurringTransactionId, action: 'UPDATE', changedBy: approverId, oldValues: { status: 'PENDING_FINANCE' }, newValues: { status: 'APPROVED' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
        this.notifications.create(rec.userId, { type: 'approval', title: 'Recurring Schedule Approved', message: `Your recurring schedule ${code} has been fully approved by Finance.`, entityType: 'recurring', entityId: req.recurringTransactionId! }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
        return { message: 'Final approval granted. Recurring schedule is now APPROVED.' };
      }

      throw new HttpException(`Cannot approve a schedule with status '${recStatus}'.`, HttpStatus.BAD_REQUEST);
    }

    // ── Regular transaction approval (unchanged) ──
    const isSelfFinanceApproval =
      req.transaction?.userId === approverId &&
      req.transaction?.status === 'PENDING_FINANCE';
    if (req.transaction?.userId === approverId && !isSelfFinanceApproval) {
      throw new HttpException('Cannot approve your own submission.', HttpStatus.FORBIDDEN);
    }

    const txStatus = req.transaction?.status;
    const [approverIsManager, approverIsFinance] = await Promise.all([
      this.userHasRole(approverId, ROLES.MANAGER),
      this.userHasRole(approverId, ROLES.FINANCE),
    ]);
    if (txStatus === 'PENDING_MANAGER' && !approverIsManager) throw new HttpException('Not authorized to approve this request.', HttpStatus.FORBIDDEN);
    if (txStatus === 'PENDING_FINANCE' && !approverIsFinance) throw new HttpException('Not authorized to approve this request.', HttpStatus.FORBIDDEN);

    const approverInfo = await this.getApproverInfo(approverId);

    if (txStatus === 'PENDING_MANAGER') {
      const financeUsers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          id: { not: req.transaction?.user?.id ?? 0 },
          OR: [
            { roleRelation: { name: ROLES.FINANCE } },
            { userRoles: { some: { role: { name: ROLES.FINANCE } } } },
          ],
        },
        take: 1,
      });

      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.approvalRequest.updateMany({
          where: { id: requestId, status: 'PENDING' },
          data: { approverId, status: 'APPROVED', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
        });
        if (claimed.count === 0) throw new HttpException('Request already processed.', HttpStatus.CONFLICT);

        const approvedAt = new Date();
        if (financeUsers.length > 0) {
          await tx.transaction.updateMany({
            where: { id: req.transactionId! },
            data: { status: 'PENDING_FINANCE', approvedById: approverInfo.id, approvedByName: approverInfo.name, approvedByRole: approverInfo.role, approvedAt, ...(isClaimable !== undefined ? { isClaimable } : {}) },
          });
          await tx.approvalRequest.create({
            data: { transactionId: req.transactionId!, approverId: financeUsers[0].id, levelNum: 2, status: 'PENDING' },
          });
        } else {
          await tx.transaction.update({
            where: { id: req.transactionId! },
            data: { status: 'APPROVED', approvedById: approverInfo.id, approvedByName: approverInfo.name, approvedByRole: approverInfo.role, approvedAt, ...(isClaimable !== undefined ? { isClaimable } : {}) },
          });
        }
      });
      const refId1 = req.transaction?.referenceId;
      const submitterId1 = req.transaction?.userId;
      this.audit.log({
        tableName: 'transactions', recordId: req.transactionId!, referenceId: refId1 ?? undefined,
        action: 'UPDATE', changedBy: approverId,
        oldValues: { status: 'PENDING_MANAGER' },
        newValues: { status: financeUsers.length > 0 ? 'PENDING_FINANCE' : 'APPROVED' },
      }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      if (financeUsers.length > 0) {
        this.notifications.create(financeUsers[0].id, {
          type: 'approval', title: 'Expense Pending Finance Approval',
          message: `${refId1 || `#${req.transactionId}`} approved by Manager, awaiting your final approval.`,
          entityType: 'transaction', entityId: req.transactionId!, referenceId: refId1 ?? undefined,
        }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      } else if (submitterId1) {
        this.notifications.create(submitterId1, {
          type: 'approval', title: 'Expense Approved',
          message: `Your expense ${refId1 || `#${req.transactionId}`} has been approved.`,
          entityType: 'transaction', entityId: req.transactionId!, referenceId: refId1 ?? undefined,
        }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      }
      return { message: financeUsers.length > 0 ? 'Approved. Escalated to Finance for final approval.' : 'Approved.' };
    }

    if (txStatus === 'PENDING_FINANCE') {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.approvalRequest.updateMany({
          where: { id: requestId, status: 'PENDING' },
          data: { approverId, status: 'APPROVED', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
        });
        if (claimed.count === 0) throw new HttpException('Request already processed.', HttpStatus.CONFLICT);
        await tx.transaction.update({
          where: { id: req.transactionId! },
          data: { status: 'APPROVED', approvedById: approverInfo.id, approvedByName: approverInfo.name, approvedByRole: approverInfo.role, approvedAt: new Date(), ...(isClaimable !== undefined ? { isClaimable } : {}) },
        });
      });
      const refId2 = req.transaction?.referenceId;
      const submitterId2 = req.transaction?.userId;
      this.audit.log({
        tableName: 'transactions', recordId: req.transactionId!, referenceId: refId2 ?? undefined,
        action: 'UPDATE', changedBy: approverId,
        oldValues: { status: 'PENDING_FINANCE' }, newValues: { status: 'APPROVED' },
      }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      if (submitterId2) {
        this.notifications.create(submitterId2, {
          type: 'approval', title: 'Expense Approved',
          message: `Your expense ${refId2 || `#${req.transactionId}`} has been fully approved by Finance.`,
          entityType: 'transaction', entityId: req.transactionId!, referenceId: refId2 ?? undefined,
        }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      }
      return { message: 'Final approval granted. Expense is now APPROVED.' };
    }

    // Fallback
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
      });
      await tx.transaction.update({ where: { id: req.transactionId! }, data: { status: 'APPROVED' } });
    });
    await this.prisma.transaction.update({
      where: { id: req.transactionId! },
      data: { approvedById: approverInfo.id, approvedByName: approverInfo.name, approvedByRole: approverInfo.role, approvedAt: new Date() },
    }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    return { message: 'Request approved.' };
  }

  async reject(requestId: number, approverId: number, comments?: string) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { transaction: true, recurringTransaction: true },
    });
    if (!req) throw new HttpException('Approval request not found.', HttpStatus.NOT_FOUND);
    if (req.status !== 'PENDING') return { message: 'Request already processed.' };

    if (req.recurringTransactionId) {
      const rec = req.recurringTransaction as any;
      const recStatus = rec?.status;
      const [rejIsManager, rejIsFinance] = await Promise.all([
        this.userHasRole(approverId, ROLES.MANAGER),
        this.userHasRole(approverId, ROLES.FINANCE),
      ]);
      if (recStatus === 'PENDING_MANAGER' && !rejIsManager) throw new HttpException('Only Managers can reject at this stage.', HttpStatus.FORBIDDEN);
      if (recStatus === 'PENDING_FINANCE' && !rejIsFinance) throw new HttpException('Only Finance can reject at this stage.', HttpStatus.FORBIDDEN);

      const approver = await this.prisma.user.findUnique({ where: { id: approverId } });
      const approverName = approver?.username || 'Unknown';
      const code = rec?.code || `#${req.recurringTransactionId}`;

      await this.prisma.$transaction(async (tx) => {
        await tx.approvalRequest.updateMany({
          where: { recurringTransactionId: req.recurringTransactionId!, status: 'PENDING' },
          data: { approverId, status: 'REJECTED', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
        });
        await tx.recurringTransaction.update({
          where: { id: req.recurringTransactionId! },
          data: { status: 'REJECTED', isActive: false, rejectedByName: approverName },
        });
      });
      this.audit.log({ tableName: 'recurring_transactions', recordId: req.recurringTransactionId!, action: 'UPDATE', changedBy: approverId, oldValues: { status: recStatus }, newValues: { status: 'REJECTED' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      this.notifications.create(rec.userId, { type: 'warning', title: 'Recurring Schedule Rejected', message: `Your recurring schedule ${code} was rejected by ${approverName}${comments ? `: ${comments}` : '.'}`, entityType: 'recurring', entityId: req.recurringTransactionId! }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      return { message: 'Recurring schedule rejected.' };
    }

    // Regular transaction
    if (req.transaction?.userId === approverId) throw new HttpException('Cannot reject your own submission.', HttpStatus.FORBIDDEN);
    const rejectorInfo = await this.getApproverInfo(approverId);
    const txStatus = req.transaction?.status;
    const [rejIsManager, rejIsFinance] = await Promise.all([
      this.userHasRole(approverId, ROLES.MANAGER),
      this.userHasRole(approverId, ROLES.FINANCE),
    ]);
    if (txStatus === 'PENDING_MANAGER' && !rejIsManager) throw new HttpException('Not authorized to reject this request.', HttpStatus.FORBIDDEN);
    if (txStatus === 'PENDING_FINANCE' && !rejIsFinance) throw new HttpException('Not authorized to reject this request.', HttpStatus.FORBIDDEN);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.approvalRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { approverId, status: 'REJECTED', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
      });
      if (claimed.count === 0) throw new HttpException('Request already processed.', HttpStatus.CONFLICT);
      await tx.transaction.update({ where: { id: req.transactionId! }, data: { status: 'REJECTED' } });
    });
    await this.prisma.transaction.update({
      where: { id: req.transactionId! },
      data: { rejectedById: rejectorInfo.id, rejectedByName: rejectorInfo.name, rejectedByRole: rejectorInfo.role, rejectedAt: new Date() },
    }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    const refIdR = req.transaction?.referenceId;
    const submitterIdR = req.transaction?.userId;
    this.audit.log({
      tableName: 'transactions', recordId: req.transactionId!, referenceId: refIdR ?? undefined,
      action: 'UPDATE', changedBy: approverId,
      oldValues: { status: req.transaction?.status }, newValues: { status: 'REJECTED' },
    }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    if (submitterIdR) {
      this.notifications.create(submitterIdR, {
        type: 'warning', title: 'Expense Rejected',
        message: `Your expense ${refIdR || `#${req.transactionId}`} was rejected${comments ? `: ${comments}` : '.'}`,
        entityType: 'transaction', entityId: req.transactionId!, referenceId: refIdR ?? undefined,
      }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    }
    return { message: 'Request rejected.' };
  }

  async sendBack(requestId: number, approverId: number, comments?: string) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { transaction: true, recurringTransaction: true },
    });
    if (!req) throw new HttpException('Approval request not found.', HttpStatus.NOT_FOUND);
    if (req.status !== 'PENDING') return { message: 'Request already processed.' };

    if (req.recurringTransactionId) {
      const rec = req.recurringTransaction as any;
      const recStatus = rec?.status;
      const [sbIsManager, sbIsFinance] = await Promise.all([
        this.userHasRole(approverId, ROLES.MANAGER),
        this.userHasRole(approverId, ROLES.FINANCE),
      ]);
      if (recStatus === 'PENDING_MANAGER' && !sbIsManager) throw new HttpException('Only Managers can send back at this stage.', HttpStatus.FORBIDDEN);
      if (recStatus === 'PENDING_FINANCE' && !sbIsFinance) throw new HttpException('Only Finance can send back at this stage.', HttpStatus.FORBIDDEN);

      const approver = await this.prisma.user.findUnique({ where: { id: approverId } });
      const approverName = approver?.username || 'Unknown';
      const code = rec?.code || `#${req.recurringTransactionId}`;

      await this.prisma.$transaction(async (tx) => {
        await tx.approvalRequest.updateMany({
          where: { recurringTransactionId: req.recurringTransactionId!, status: 'PENDING' },
          data: { status: 'SENT_BACK', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
        });
        await tx.recurringTransaction.update({
          where: { id: req.recurringTransactionId! },
          data: { status: 'SENT_BACK', sentBackByName: approverName },
        });
      });
      this.audit.log({ tableName: 'recurring_transactions', recordId: req.recurringTransactionId!, action: 'UPDATE', changedBy: approverId, oldValues: { status: recStatus }, newValues: { status: 'SENT_BACK' } }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      this.notifications.create(rec.userId, { type: 'warning', title: 'Recurring Schedule Sent Back', message: `Your recurring schedule ${code} was sent back for revision by ${approverName}${comments ? `: ${comments}` : '.'}`, entityType: 'recurring', entityId: req.recurringTransactionId! }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
      return { message: 'Recurring schedule sent back for revision.' };
    }

    // Regular transaction
    if ((req as any).transaction?.userId === approverId) throw new HttpException('Cannot send back your own submission.', HttpStatus.FORBIDDEN);
    const actorInfo = await this.getApproverInfo(approverId);
    const txStatus = (req as any).transaction?.status;
    const txType = (req as any).transaction?.type;
    const [sbIsManager, sbIsFinance] = await Promise.all([
      this.userHasRole(approverId, ROLES.MANAGER),
      this.userHasRole(approverId, ROLES.FINANCE),
    ]);
    if (txStatus === 'PENDING_MANAGER' && !sbIsManager) throw new HttpException('Not authorized to send back this request.', HttpStatus.FORBIDDEN);
    if (txStatus === 'PENDING_FINANCE' && !sbIsFinance) throw new HttpException('Not authorized to send back this request.', HttpStatus.FORBIDDEN);

    await this.prisma.$transaction(async (tx) => {
      await tx.approvalRequest.updateMany({
        where: { transactionId: req.transactionId!, status: 'PENDING' },
        data: { status: 'SENT_BACK', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
      });
      await tx.transaction.update({ where: { id: req.transactionId! }, data: { status: 'SENT_BACK' } });
    });
    await this.prisma.transaction.update({
      where: { id: req.transactionId! },
      data: { sentBackById: actorInfo.id, sentBackByName: actorInfo.name, sentBackByRole: actorInfo.role, sentBackAt: new Date() },
    }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    const refIdSB = (req as any).transaction?.referenceId;
    const notifyUserId: number | null = (req as any).transaction?.userId ?? null;
    this.audit.log({
      tableName: 'transactions', recordId: req.transactionId!, referenceId: refIdSB ?? undefined,
      action: 'UPDATE', changedBy: approverId,
      oldValues: { status: txStatus }, newValues: { status: 'SENT_BACK' },
    }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    if (notifyUserId) {
      const label = txType === 'income' ? 'Income' : 'Expense';
      this.notifications.create(notifyUserId, {
        type: 'warning', title: `${label} Sent Back`,
        message: `${label} ${refIdSB || `#${req.transactionId}`} was sent back for revision${comments ? `: ${comments}` : '.'}`,
        entityType: 'transaction', entityId: req.transactionId!, referenceId: refIdSB ?? undefined,
      }).catch((e: any) => this.logger.warn('Background task failed', e?.message));
    }
    return { message: 'Transaction sent back for revision.' };
  }
}
