import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  private mapTransaction(t: any) {
    return ({
      id: t.id, reference_id: t.referenceId, type: t.type, amount: t.amount, date_recorded: t.dateRecorded,
      category_id: t.categoryId, category_name: t.category?.name, category_icon: t.category?.icon,
      description: t.description, payment_method: t.paymentMethod, receipt_path: t.receiptPath,
      receipt_number: t.receiptNumber, submitted_at: t.submittedAt, currency: t.currency,
      client_id: t.clientId, client_name: t.client?.name, project_id: t.projectId, project_name: t.project?.name,
      context_code: t.project?.code || t.product?.code, product_id: t.productId, product_name: t.product?.name,
      context_type: t.contextType, is_split: t.isSplit ? 1 : 0, created_at: t.createdAt, updated_at: t.updatedAt, status: t.status,
      approved_by_id: t.approvedById, approved_by_name: t.approvedByName,
      approved_by_role: t.approvedByRole, approved_at: t.approvedAt,
      rejected_by_id: t.rejectedById, rejected_by_name: t.rejectedByName,
      rejected_by_role: t.rejectedByRole, rejected_at: t.rejectedAt,
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

    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
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

  private generateReferenceId(type: string, id: number): string {
    const seq = String(10000 + id).padStart(5, '0');
    return type === 'expense' ? `EXP-${seq}` : `INC-${seq}`;
  }

  async create(userId: number, data: any) {
    const t = await this.prisma.transaction.create({
      data: {
        userId, type: data.type, amount: Number(data.amount), dateRecorded: new Date(data.dateRecorded),
        categoryId: data.categoryId ? Number(data.categoryId) : null, description: data.description || null,
        paymentMethod: data.paymentMethod || 'cash', receiptPath: data.receiptPath || null,
        clientId: data.clientId ? Number(data.clientId) : null, projectId: data.projectId ? Number(data.projectId) : null,
        productId: data.productId ? Number(data.productId) : null, contextType: data.contextType || 'project',
        receiptNumber: data.receiptNumber || null, currency: data.currency || 'INR',
        // Expenses always start as DRAFT; income goes straight to APPROVED
        status: data.type === 'expense' ? 'DRAFT' : 'APPROVED',
      },
    });
    // Assign reference ID based on transaction id (EXP-10001, INC-10001, etc.)
    const referenceId = this.generateReferenceId(data.type, t.id);
    await this.prisma.transaction.update({
      where: { id: t.id },
      data: { referenceId },
    });
    return this.findById(t.id, userId);
  }

  // Submit an expense for approval — creates approval requests for the Manager chain
  async submit(transactionId: number, userId: number) {
    const txn = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: { user: true },
    });
    if (!txn) throw new HttpException('Transaction not found.', HttpStatus.NOT_FOUND);
    if (txn.type !== 'expense') throw new HttpException('Only expense transactions can be submitted for approval.', HttpStatus.BAD_REQUEST);
    if (!['DRAFT', 'SENT_BACK'].includes(txn.status || '')) {
      throw new HttpException(`Cannot submit expense with status '${txn.status}'. Only DRAFT or SENT_BACK expenses can be submitted.`, HttpStatus.BAD_REQUEST);
    }

    // Find the submitter's manager for Level 1 approval
    const submitter = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { manager: { include: { roleRelation: true } } },
    });

    // Find any available Manager-role user as approver
    // Priority 1: user's direct manager (if they have MANAGER role active OR assigned)
    // Priority 2: any user with MANAGER role (active or assigned), excluding submitter
    let managerId: number | null = null;
    const directManager = submitter?.manager;
    if (directManager) {
      const dmHasManager = await this.prisma.userRole.findFirst({
        where: { userId: directManager.id, role: { name: 'MANAGER' } },
      });
      if (dmHasManager) managerId = directManager.id;
    }
    if (!managerId) {
      const anyManager = await this.prisma.user.findFirst({
        where: {
          isActive: true,
          id: { not: userId },
          OR: [
            { roleRelation: { name: 'MANAGER' } },
            { userRoles: { some: { role: { name: 'MANAGER' } } } },
          ],
        },
      });
      managerId = anyManager?.id ?? null;
    }

    if (!managerId) throw new HttpException('No manager available to approve this expense.', HttpStatus.BAD_REQUEST);

    await this.prisma.$transaction(async (tx) => {
      // Cancel any old approval requests for this transaction
      await tx.approvalRequest.deleteMany({ where: { transactionId } });

      // Create Level 1 approval request (Manager)
      await tx.approvalRequest.create({
        data: { transactionId, approverId: managerId!, levelNum: 1, status: 'PENDING' },
      });

      // Set transaction status to PENDING_MANAGER
      await tx.transaction.update({
        where: { id: transactionId },
        data: { status: 'PENDING_MANAGER', submittedAt: new Date() },
      });
    });

    return this.findById(transactionId, userId);
  }

  async update(id: number, userId: number, data: any) {
    // Guard: only DRAFT or SENT_BACK expenses can be edited
    const existing = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (existing && existing.type === 'expense' && !['DRAFT', 'SENT_BACK'].includes(existing.status || '')) {
      throw new HttpException(
        `Cannot edit expense with status '${existing.status}'. Only DRAFT or SENT_BACK expenses can be modified.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.transaction.updateMany({
      where: { id, userId },
      data: {
        type: data.type, amount: Number(data.amount), dateRecorded: new Date(data.dateRecorded),
        categoryId: data.categoryId ? Number(data.categoryId) : null, description: data.description || null,
        paymentMethod: data.paymentMethod || 'cash', receiptPath: data.receiptPath || null,
        clientId: data.clientId ? Number(data.clientId) : null, projectId: data.projectId ? Number(data.projectId) : null,
        productId: data.productId ? Number(data.productId) : null, contextType: data.contextType || 'project',
        receiptNumber: data.receiptNumber || null, currency: data.currency || 'INR',
      },
    });
    return this.findById(id, userId);
  }

  async delete(id: number, userId: number) {
    const existing = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (existing && ['APPROVED', 'REJECTED'].includes(existing.status || '')) {
      throw new HttpException(`Cannot delete a transaction with status '${existing.status}'.`, HttpStatus.BAD_REQUEST);
    }
    const result = await this.prisma.transaction.updateMany({ where: { id, userId }, data: { status: 'DELETED' } });
    return result.count > 0;
  }

  async bulkDelete(ids: number[], userId: number) {
    const existing = await this.prisma.transaction.findMany({
      where: { userId, id: { in: ids }, NOT: { status: 'DELETED' } }, select: { id: true, referenceId: true },
    });
    const result = await this.prisma.transaction.updateMany({ where: { userId, id: { in: ids } }, data: { status: 'DELETED' } });
    return { deleted: result.count, records: existing.map((e) => ({ id: e.id, reference_id: e.referenceId })) };
  }

  async getSplits(transactionId: number) {
    const splits = await this.prisma.transactionSplit.findMany({
      where: { transactionId },
      include: { category: true },
      orderBy: { id: 'asc' },
    });
    return splits.map((s) => ({
      id: s.id,
      category_id: s.categoryId,
      category_name: s.category?.name ?? null,
      amount: Number(s.amount),
      description: s.description,
    }));
  }

  async split(transactionId: number, splits: any[]) {
    if (!splits || splits.length < 2) {
      throw new HttpException('At least 2 splits are required.', HttpStatus.BAD_REQUEST);
    }

    const original = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
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
          transactionId, categoryId: Number(s.categoryId), amount: Number(s.amount), description: s.description || null,
        })),
      });
      await tx.transaction.update({ where: { id: transactionId }, data: { isSplit: true } });
    });
    return true;
  }
}
