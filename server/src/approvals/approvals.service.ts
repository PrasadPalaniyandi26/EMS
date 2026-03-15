import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Approval levels:
//   Level 1 = Manager approval  → status PENDING_MANAGER
//   Level 2 = Finance approval  → status PENDING_FINANCE
// After Finance approves → APPROVED
// Reject at any level   → REJECTED
// Send back at any level → DRAFT (employee can re-edit and resubmit)

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService) {}

  // Map a raw ApprovalRequest + transaction to a response shape
  private mapRequest(r: any) {
    return {
      id: r.id,
      transaction_id: r.transactionId,
      approver_id: r.approverId,
      level_num: r.levelNum,
      reference_id: r.transaction?.referenceId,
      code: r.transaction?.referenceId,
      type: r.transaction?.type,
      amount: r.transaction?.amount,
      date_recorded: r.transaction?.dateRecorded,
      category_name: r.transaction?.category?.name,
      description: r.transaction?.description,
      submitted_by: r.transaction?.user?.username,
      submitted_by_name: r.transaction?.user?.username,
      submitted_by_id: r.transaction?.user?.id,
      status: r.status,
      transaction_status: r.transaction?.status,
      is_split: r.transaction?.isSplit ? 1 : 0,
      receipt_path: r.transaction?.receiptPath || null,
      comments: r.comments,
      created_at: r.createdAt,
    };
  }

  // Get approval history based on role:
  //   Employee  → own APPROVED and REJECTED submissions
  //   Finance   → all records; filterable by status (defaults to PENDING_FINANCE)
  //   Manager   → same as getPending (no separate history page for manager)
  async getHistory(userId: number, _jwtRoleName?: string, statusFilter?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roleRelation: true },
    });
    const roleName = (user?.roleRelation?.name || _jwtRoleName || '').toUpperCase();

    if (roleName === 'EMPLOYEE' || roleName === '') {
      // Employee sees their own APPROVED and REJECTED submissions only
      const requests = await this.prisma.approvalRequest.findMany({
        where: {
          transaction: {
            userId,
            status: { in: ['APPROVED', 'REJECTED'] },
          },
        },
        include: {
          transaction: { include: { category: true, user: true } },
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['transactionId'], // one record per transaction
      });
      return requests.map((r) => this.mapRequest(r));
    }

    if (roleName === 'FINANCE') {
      // Finance sees all records; filter by transaction status (defaults to PENDING_FINANCE)
      const allowedStatuses = ['PENDING_FINANCE', 'APPROVED', 'REJECTED'];
      const txStatus = statusFilter && allowedStatuses.includes(statusFilter.toUpperCase())
        ? statusFilter.toUpperCase()
        : 'PENDING_FINANCE';

      // For PENDING_FINANCE: look for approval requests that are still PENDING
      // For APPROVED/REJECTED: look for resolved approval requests (levelNum=2 for Finance level)
      const arStatus = txStatus === 'PENDING_FINANCE' ? 'PENDING' : txStatus;

      const requests = await this.prisma.approvalRequest.findMany({
        where: {
          status: arStatus,
          transaction: {
            status: txStatus,
            userId: { not: userId },
          },
        },
        include: {
          transaction: { include: { category: true, user: true } },
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['transactionId'],
      });

      return requests.map((r) => this.mapRequest(r));
    }

    // Manager — no separate history; return empty
    return [];
  }

  // Get pending approvals for the current user based on their active role
  // approverId = current user's id — fetch their CURRENT active role from DB (not JWT, which may be stale)
  async getPending(approverId: number, _jwtRoleName?: string) {
    // Always get the fresh role from DB to avoid stale JWT issues
    const approver = await this.prisma.user.findUnique({
      where: { id: approverId },
      include: { roleRelation: true },
    });
    const roleName = (approver?.roleRelation?.name || _jwtRoleName || '').toUpperCase();

    if (roleName === 'MANAGER') {
      // Manager sees ALL PENDING_MANAGER transactions except their own submissions
      const requests = await this.prisma.approvalRequest.findMany({
        where: {
          status: 'PENDING',
          transaction: {
            status: 'PENDING_MANAGER',
            userId: { not: approverId }, // exclude own submissions
          },
        },
        include: {
          transaction: { include: { category: true, user: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return requests.map((r) => this.mapRequest(r));
    }

    if (roleName === 'FINANCE') {
      // Finance sees ALL PENDING_FINANCE transactions except their own submissions
      const requests = await this.prisma.approvalRequest.findMany({
        where: {
          status: 'PENDING',
          transaction: {
            status: 'PENDING_FINANCE',
            userId: { not: approverId }, // exclude own submissions
          },
        },
        include: {
          transaction: { include: { category: true, user: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return requests.map((r) => this.mapRequest(r));
    }

    // ADMIN or unknown: show all pending requests assigned to them
    const requests = await this.prisma.approvalRequest.findMany({
      where: { approverId, status: 'PENDING' },
      include: {
        transaction: { include: { category: true, user: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => this.mapRequest(r));
  }

  // Fetch approver details (username + active role name)
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

  async approve(requestId: number, approverId: number, comments?: string) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { transaction: { include: { user: true } } },
    });
    if (!req) throw new HttpException('Approval request not found.', HttpStatus.NOT_FOUND);
    if (req.status !== 'PENDING') return { message: 'Request already processed.' };

    // Verify the acting user has the right role for this approval level
    const actingUser = await this.prisma.user.findUnique({ where: { id: approverId }, include: { roleRelation: true } });
    const actingRole = actingUser?.roleRelation?.name?.toUpperCase();
    const txStatus = req.transaction?.status;
    if (txStatus === 'PENDING_MANAGER' && actingRole !== 'MANAGER') throw new HttpException('Not authorized to approve this request.', HttpStatus.FORBIDDEN);
    if (txStatus === 'PENDING_FINANCE' && actingRole !== 'FINANCE') throw new HttpException('Not authorized to approve this request.', HttpStatus.FORBIDDEN);
    // Prevent approving own submission
    if (req.transaction?.userId === approverId) throw new HttpException('Cannot approve your own submission.', HttpStatus.FORBIDDEN);

    const approverInfo = await this.getApproverInfo(approverId);

    if (txStatus === 'PENDING_MANAGER') {
      // Level 1 approved by Manager — now needs Finance approval
      const financeUsers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          id: { not: req.transaction?.user?.id ?? 0 },
          OR: [
            { roleRelation: { name: 'FINANCE' } },
            { userRoles: { some: { role: { name: 'FINANCE' } } } },
          ],
        },
        take: 1,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.approvalRequest.update({
          where: { id: requestId },
          data: { approverId, status: 'APPROVED', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
        });

        if (financeUsers.length > 0) {
          // Escalate to Finance — don't store final approver yet
          await tx.transaction.updateMany({
            where: { id: req.transactionId },
            data: { status: 'PENDING_FINANCE' },
          });
          await tx.approvalRequest.create({
            data: {
              transactionId: req.transactionId,
              approverId: financeUsers[0].id,
              levelNum: 2,
              status: 'PENDING',
            },
          });
        } else {
          // No Finance — Manager is the final approver
          await tx.$executeRawUnsafe(
            `UPDATE transactions SET status='APPROVED', approved_by_id=$1, approved_by_name=$2, approved_by_role=$3, approved_at=NOW() WHERE id=$4`,
            approverInfo.id, approverInfo.name, approverInfo.role, req.transactionId,
          );
        }
      });

      return { message: financeUsers.length > 0 ? 'Approved. Escalated to Finance for final approval.' : 'Approved.' };
    }

    if (txStatus === 'PENDING_FINANCE') {
      // Level 2 — Finance is the final approver
      await this.prisma.$transaction(async (tx) => {
        await tx.approvalRequest.update({
          where: { id: requestId },
          data: { approverId, status: 'APPROVED', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
        });
        await tx.$executeRawUnsafe(
          `UPDATE transactions SET status='APPROVED', approved_by_id=$1, approved_by_name=$2, approved_by_role=$3, approved_at=NOW() WHERE id=$4`,
          approverInfo.id, approverInfo.name, approverInfo.role, req.transactionId,
        );
      });
      return { message: 'Final approval granted. Expense is now APPROVED.' };
    }

    // Fallback
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
      });
      await tx.$executeRawUnsafe(
        `UPDATE transactions SET status='APPROVED', approved_by_id=$1, approved_by_name=$2, approved_by_role=$3, approved_at=NOW() WHERE id=$4`,
        approverInfo.id, approverInfo.name, approverInfo.role, req.transactionId,
      );
    });
    return { message: 'Request approved.' };
  }

  async reject(requestId: number, approverId: number, comments?: string) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { transaction: true },
    });
    if (!req) throw new HttpException('Approval request not found.', HttpStatus.NOT_FOUND);
    if (req.status !== 'PENDING') return { message: 'Request already processed.' };

    const rejectorInfo = await this.getApproverInfo(approverId);
    const actingRole = rejectorInfo.role.toUpperCase();
    const txStatus = req.transaction?.status;
    if (txStatus === 'PENDING_MANAGER' && actingRole !== 'MANAGER') throw new HttpException('Not authorized to reject this request.', HttpStatus.FORBIDDEN);
    if (txStatus === 'PENDING_FINANCE' && actingRole !== 'FINANCE') throw new HttpException('Not authorized to reject this request.', HttpStatus.FORBIDDEN);
    if (req.transaction?.userId === approverId) throw new HttpException('Cannot reject your own submission.', HttpStatus.FORBIDDEN);

    await this.prisma.$transaction(async (tx) => {
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { approverId, status: 'REJECTED', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
      });
      await tx.$executeRawUnsafe(
        `UPDATE transactions SET status='REJECTED', rejected_by_id=$1, rejected_by_name=$2, rejected_by_role=$3, rejected_at=NOW() WHERE id=$4`,
        rejectorInfo.id, rejectorInfo.name, rejectorInfo.role, req.transactionId,
      );
    });
    return { message: 'Request rejected.' };
  }

  // Send back to employee for editing — clears approval chain, sets status DRAFT
  async sendBack(requestId: number, approverId: number, comments?: string) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { transaction: true },
    });
    if (!req) throw new HttpException('Approval request not found.', HttpStatus.NOT_FOUND);
    if (req.status !== 'PENDING') return { message: 'Request already processed.' };

    const actorInfo = await this.getApproverInfo(approverId);
    const actingRole = actorInfo.role.toUpperCase();
    const txStatus = (req as any).transaction?.status;
    if (txStatus === 'PENDING_MANAGER' && actingRole !== 'MANAGER') throw new HttpException('Not authorized to send back this request.', HttpStatus.FORBIDDEN);
    if (txStatus === 'PENDING_FINANCE' && actingRole !== 'FINANCE') throw new HttpException('Not authorized to send back this request.', HttpStatus.FORBIDDEN);
    if ((req as any).transaction?.userId === approverId) throw new HttpException('Cannot send back your own submission.', HttpStatus.FORBIDDEN);

    await this.prisma.$transaction(async (tx) => {
      // Cancel all pending approvals for this transaction
      await tx.approvalRequest.updateMany({
        where: { transactionId: req.transactionId, status: 'PENDING' },
        data: { status: 'SENT_BACK', comments: comments || null, actionDate: new Date(), resolvedAt: new Date() },
      });
      // Set transaction to SENT_BACK so employee can see it was returned for revision
      await tx.transaction.updateMany({
        where: { id: req.transactionId },
        data: { status: 'SENT_BACK' },
      });
    });
    return { message: 'Expense sent back to employee for revision.' };
  }
}
