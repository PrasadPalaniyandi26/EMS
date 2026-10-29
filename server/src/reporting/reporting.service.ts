import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTABLE_STATUSES, COMMITTED_STATUSES, countableStatusSql } from '../common/constants/transaction-status';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

  // null = no filter (all users); number[] = restrict to these user IDs
  private async resolveUserIds(userId: number, roleName: string): Promise<number[] | null> {
    const r = (roleName || '').toUpperCase();
    if (r === 'FINANCE' || r === 'ADMIN') return null;
    if (r === 'MANAGER') {
      const approvedUsers = await this.prisma.$queryRawUnsafe<{ user_id: number }[]>(
        `SELECT DISTINCT t.user_id
         FROM approval_requests ar
         JOIN transactions t ON t.id = ar.transaction_id
         WHERE ar.approver_id = $1 AND ar.transaction_id IS NOT NULL`,
        userId,
      );
      const ids = [userId, ...approvedUsers.map((row) => row.user_id)];
      return [...new Set(ids)];
    }
    return [userId];
  }

  async generate(userId: number, roleName: string, type: string, params: Record<string, string>) {
    const dateFrom = params.dateFrom ? new Date(params.dateFrom) : undefined;
    const dateTo = params.dateTo ? new Date(params.dateTo) : undefined;
    const userIds = await this.resolveUserIds(userId, roleName);

    switch (type) {
      case 'expense-summary':    return this.expenseSummary(userIds, dateFrom, dateTo);
      case 'income-summary':     return this.incomeSummary(userIds, dateFrom, dateTo);
      case 'pl-statement':       return this.plStatement(userIds, dateFrom, dateTo);
      case 'budget-vs-actual':   return this.budgetVsActual(userId, params.month, params.year);
      case 'transaction-ledger': return this.transactionLedger(userIds, dateFrom, dateTo, params.txnType as any);
      case 'client-summary':     return this.clientSummary(userIds, dateFrom, dateTo, params.categoryType, params.txnType as any);
      case 'claimable-gst':            return this.claimableGst(userIds, dateFrom, dateTo);
      case 'reimbursement-register':   return this.reimbursementRegister(userIds, dateFrom, dateTo);
      default: throw new BadRequestException(`Unknown report type: ${type}`);
    }
  }

  // null = all users; number[] = restrict to these IDs
  private buildWhere(userIds: number[] | null, type?: string, dateFrom?: Date, dateTo?: Date) {
    const where: any = { status: { in: COUNTABLE_STATUSES } };
    if (userIds !== null) where.userId = { in: userIds };
    if (type) where.type = type;
    if (dateFrom || dateTo) {
      where.dateRecorded = {};
      if (dateFrom) where.dateRecorded.gte = dateFrom;
      if (dateTo) where.dateRecorded.lte = dateTo;
    }
    return where;
  }

  private async expenseSummary(userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    const params: any[] = [];
    let userClause = '';
    if (userIds !== null) { params.push(userIds); userClause = ` AND t.user_id = ANY($${params.length}::int[])`; }
    let dateClause = '';
    if (dateFrom) { params.push(dateFrom); dateClause += ` AND t.date_recorded >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   dateClause += ` AND t.date_recorded <= $${params.length}`; }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        c.name AS category,
        COUNT(*)::int AS transactions,
        ROUND(SUM(COALESCE(t.net_amount, t.amount))::numeric, 2)::float AS net_amount,
        MAX(t.gst_rate)::float AS gst_rate,
        COUNT(*) FILTER (WHERE t.is_claimable = true)::int AS claimable_count,
        ROUND(SUM(COALESCE(t.total_amount, t.amount))::numeric, 2)::float AS total_amount
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.type = 'expense' AND t.status IN ${countableStatusSql}${userClause}${dateClause}
      GROUP BY c.name
    `, ...params);

    const merged: Record<string, any> = {};
    for (const r of rows) {
      const key = r.category || 'Unknown';
      if (!merged[key]) merged[key] = { category: key, transactions: 0, net_amount: 0, gst_rate: r.gst_rate, claimable_count: 0, total_amount: 0 };
      merged[key].transactions  += r.transactions;
      merged[key].net_amount    += Number(r.net_amount);
      merged[key].total_amount  += Number(r.total_amount);
      merged[key].claimable_count += r.claimable_count;
      if (r.gst_rate != null) merged[key].gst_rate = r.gst_rate;
    }
    const rows2 = Object.values(merged).sort((a, b) => b.total_amount - a.total_amount);

    const mapped = rows2.map((r) => ({
      Category: r.category || 'Unknown',
      Transactions: r.transactions,
      'Net Amount': parseFloat(Number(r.net_amount).toFixed(2)),
      'GST %': r.gst_rate != null ? parseFloat(Number(r.gst_rate).toFixed(2)) : null,
      Claimable: r.claimable_count > 0 ? 'Yes' : 'No',
      'Total Amount': parseFloat(Number(r.total_amount).toFixed(2)),
    }));

    return {
      title: 'Expense Summary by Category',
      columns: ['Category', 'Transactions', 'Net Amount', 'GST %', 'Claimable', 'Total Amount'],
      rows: mapped,
      totals: {
        'Net Amount': parseFloat(mapped.reduce((s, r) => s + r['Net Amount'], 0).toFixed(2)),
        'Total Amount': parseFloat(mapped.reduce((s, r) => s + r['Total Amount'], 0).toFixed(2)),
      },
    };
  }

  private async incomeSummary(userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    const params: any[] = [];
    let userClause = '';
    if (userIds !== null) { params.push(userIds); userClause = ` AND t.user_id = ANY($${params.length}::int[])`; }
    let dateClause = '';
    if (dateFrom) { params.push(dateFrom); dateClause += ` AND t.date_recorded >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   dateClause += ` AND t.date_recorded <= $${params.length}`; }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        c.name AS category,
        COUNT(*)::int AS transactions,
        ROUND(SUM(COALESCE(t.net_amount, t.amount))::numeric, 2)::float AS net_amount,
        MAX(t.gst_rate)::float AS gst_rate,
        COUNT(*) FILTER (WHERE t.is_claimable = true)::int AS claimable_count,
        ROUND(SUM(COALESCE(t.total_amount, t.amount))::numeric, 2)::float AS total_amount
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.type = 'income' AND t.status IN ${countableStatusSql}${userClause}${dateClause}
      GROUP BY c.name
    `, ...params);

    const mergedI: Record<string, any> = {};
    for (const r of rows) {
      const key = r.category || 'Unknown';
      if (!mergedI[key]) mergedI[key] = { category: key, transactions: 0, net_amount: 0, gst_rate: r.gst_rate, claimable_count: 0, total_amount: 0 };
      mergedI[key].transactions  += r.transactions;
      mergedI[key].net_amount    += Number(r.net_amount);
      mergedI[key].total_amount  += Number(r.total_amount);
      mergedI[key].claimable_count += r.claimable_count;
      if (r.gst_rate != null) mergedI[key].gst_rate = r.gst_rate;
    }
    const rows2 = Object.values(mergedI).sort((a, b) => b.total_amount - a.total_amount);

    const mapped = rows2.map((r) => ({
      Category: r.category || 'Unknown',
      Transactions: r.transactions,
      'Net Amount': parseFloat(Number(r.net_amount).toFixed(2)),
      'GST %': r.gst_rate != null ? parseFloat(Number(r.gst_rate).toFixed(2)) : null,
      Claimable: r.claimable_count > 0 ? 'Yes' : 'No',
      'Total Amount': parseFloat(Number(r.total_amount).toFixed(2)),
    }));

    return {
      title: 'Income Summary by Category',
      columns: ['Category', 'Transactions', 'Net Amount', 'GST %', 'Claimable', 'Total Amount'],
      rows: mapped,
      totals: {
        'Net Amount': parseFloat(mapped.reduce((s, r) => s + r['Net Amount'], 0).toFixed(2)),
        'Total Amount': parseFloat(mapped.reduce((s, r) => s + r['Total Amount'], 0).toFixed(2)),
      },
    };
  }

  private async plStatement(userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    const [incomeAgg, expenseAgg] = await Promise.all([
      this.prisma.transaction.aggregate({ where: this.buildWhere(userIds, 'income', dateFrom, dateTo), _sum: { amount: true } }),
      this.prisma.transaction.aggregate({ where: this.buildWhere(userIds, 'expense', dateFrom, dateTo), _sum: { amount: true } }),
    ]);

    // Monthly breakdown — actuals only (recurring schedules are already materialized
    // into real transactions by the cron, so counting them again would double-count).
    const cutoff = dateFrom || (() => { const d = new Date(); d.setMonth(d.getMonth() - 11); d.setDate(1); return d; })();
    const endDate = dateTo || new Date();
    const params: any[] = [cutoff, endDate];
    let userFilter = '';
    if (userIds !== null) {
      params.push(userIds);
      userFilter = ` AND user_id = ANY($${params.length}::int[])`;
    }
    const monthRows = await this.prisma.$queryRawUnsafe<{ yr: number; mo: number; type: string; total: number }[]>(`
      SELECT
        EXTRACT(YEAR FROM date_recorded)::int AS yr,
        EXTRACT(MONTH FROM date_recorded)::int AS mo,
        type,
        SUM(amount)::float AS total
      FROM transactions
      WHERE date_recorded >= $1
        AND date_recorded <= $2
        AND status IN ${countableStatusSql}${userFilter}
      GROUP BY yr, mo, type
      ORDER BY yr, mo
    `, ...params);

    const map: Record<string, { income: number; expense: number }> = {};
    for (const r of monthRows as any[]) {
      const key = `${r.yr}-${String(r.mo).padStart(2, '0')}`;
      if (!map[key]) map[key] = { income: 0, expense: 0 };
      if (r.type === 'income') map[key].income += Number(r.total);
      if (r.type === 'expense') map[key].expense += Number(r.total);
    }

    const totalIncome  = parseFloat((Number(incomeAgg._sum.amount) || 0).toFixed(2));
    const totalExpense = parseFloat((Number(expenseAgg._sum.amount) || 0).toFixed(2));

    return {
      title: 'Profit & Loss Statement',
      columns: ['Month', 'Income', 'Expenses', 'Net'],
      rows: Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => ({
        Month: key,
        Income: parseFloat(val.income.toFixed(2)),
        Expenses: parseFloat(val.expense.toFixed(2)),
        Net: parseFloat((val.income - val.expense).toFixed(2)),
      })),
      totals: { Income: totalIncome, Expenses: totalExpense, Net: parseFloat((totalIncome - totalExpense).toFixed(2)) },
    };
  }

  private async budgetVsActual(userId: number, monthStr?: string, yearStr?: string) {
    const now = new Date();
    const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1;
    const year = yearStr ? parseInt(yearStr) : now.getFullYear();

    const budgets = await this.prisma.budget.findMany({
      where: { userId, periodMonth: month, periodYear: year, isActive: true },
      include: { category: true },
    });

    if (!budgets.length) return { title: 'Budget vs Actual', columns: ['Category', 'Budget', 'Spent', 'Remaining', '% Used'], rows: [], totals: {} };

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    const catIds = budgets.map((b) => b.categoryId).filter((id): id is number => id !== null);

    // Committed spend (approved + in-flight) to match budget enforcement and the
    // dashboard budget card. Recurring schedules are already materialized into real
    // transactions by the cron, so they are captured by the groupBy below.
    const spent = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: 'expense', status: { in: COMMITTED_STATUSES }, categoryId: { in: catIds }, dateRecorded: { gte: start, lte: end } },
      _sum: { amount: true },
    });
    const spentMap: Record<number, number> = Object.fromEntries(spent.map((s) => [s.categoryId, Number(s._sum?.amount) || 0]));

    const rows = budgets.map((b) => {
      const budget = parseFloat(Number(b.amount).toFixed(2));
      const spentAmt = parseFloat(((b.categoryId !== null ? spentMap[b.categoryId] : 0) || 0).toFixed(2));
      return {
        Category: b.category?.name || 'Unknown',
        Budget: budget,
        Spent: spentAmt,
        Remaining: parseFloat((budget - spentAmt).toFixed(2)),
        '% Used': budget > 0 ? parseFloat(((spentAmt / budget) * 100).toFixed(1)) : 0,
      };
    }).sort((a, b) => b['% Used'] - a['% Used']);

    return {
      title: `Budget vs Actual — ${month}/${year}`,
      columns: ['Category', 'Budget', 'Spent', 'Remaining', '% Used'],
      rows,
      totals: {
        Budget: parseFloat(rows.reduce((s, r) => s + r.Budget, 0).toFixed(2)),
        Spent: parseFloat(rows.reduce((s, r) => s + r.Spent, 0).toFixed(2)),
        Remaining: parseFloat(rows.reduce((s, r) => s + r.Remaining, 0).toFixed(2)),
      },
    };
  }

  private async transactionLedger(userId: number[] | null, dateFrom?: Date, dateTo?: Date, type?: 'income' | 'expense') {
    // Ledger is a line-item listing (no totals), so it shows every real transaction
    // with its Status, excluding only soft-deleted/voided rows. Recurring schedules
    // are omitted here — the cron already materializes them into real transactions.
    const LEDGER_CAP = 2000;
    const where = this.buildWhere(userId, type, dateFrom, dateTo);
    where.status = { notIn: ['DELETED', 'VOIDED'] };
    // Fetch one extra row to detect whether the result set was truncated by the cap.
    const txns = await this.prisma.transaction.findMany({
      where,
      include: { category: true, client: true, project: true },
      orderBy: [{ dateRecorded: 'desc' }, { id: 'desc' }],
      take: LEDGER_CAP + 1,
    });
    const truncated = txns.length > LEDGER_CAP;
    if (truncated) txns.length = LEDGER_CAP;

    const txnRows = txns.map((t) => ({
      Date: t.dateRecorded.toISOString().slice(0, 10),
      Type: t.type,
      Source: 'Transaction',
      Description: t.description || '',
      Category: t.category?.name || '',
      Client: t.client?.name || '',
      Project: t.project?.name || '',
      'Payment Method': t.paymentMethod || '',
      Reference: t.receiptNumber || '',
      Status: t.status || '',
      'Net Amount': parseFloat(Number(t.netAmount ?? t.amount).toFixed(2)),
      'GST %': t.gstRate != null ? parseFloat(Number(t.gstRate).toFixed(2)) : null,
      Claimable: (t as any).isClaimable ? 'Yes' : 'No',
      'Total Amount': parseFloat(Number(t.totalAmount ?? t.amount).toFixed(2)),
    }));

    const allRows = txnRows.sort((a, b) => b.Date.localeCompare(a.Date));

    return {
      title: `Transaction Ledger${type ? ` (${type})` : ''}`,
      columns: ['Date', 'Type', 'Source', 'Description', 'Category', 'Client', 'Project', 'Payment Method', 'Reference', 'Status', 'Net Amount', 'GST %', 'Claimable', 'Total Amount'],
      rows: allRows,
      totals: {},
      truncated,
      ...(truncated ? { note: `Showing the most recent ${LEDGER_CAP} entries. Narrow the date range to see older records.` } : {}),
    };
  }

  private async claimableGst(userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    const params: any[] = [];
    let userClause = '';
    if (userIds !== null) { params.push(userIds); userClause = ` AND t.user_id = ANY($${params.length}::int[])`; }
    let dateClause = '';
    if (dateFrom) { params.push(dateFrom); dateClause += ` AND t.date_recorded >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   dateClause += ` AND t.date_recorded <= $${params.length}`; }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        c.name AS category,
        COUNT(*)::int AS transactions,
        ROUND(SUM(COALESCE(t.net_amount, t.amount))::numeric, 2)::float AS net_amount,
        ROUND(SUM(COALESCE(t.total_amount, t.amount) - COALESCE(t.net_amount, t.amount))::numeric, 2)::float AS gst_amount,
        ROUND(SUM(COALESCE(t.total_amount, t.amount))::numeric, 2)::float AS total_amount,
        ROUND(AVG(t.gst_rate)::numeric, 2)::float AS avg_gst_rate
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.is_claimable = true
        AND t.type = 'expense'
        AND t.status IN ${countableStatusSql}${userClause}${dateClause}
      GROUP BY c.name
      ORDER BY gst_amount DESC
    `, ...params);

    const mapped = rows.map((r) => ({
      Category: r.category || 'Unknown',
      Transactions: r.transactions,
      'Net Amount': parseFloat(Number(r.net_amount).toFixed(2)),
      'GST Amount': parseFloat(Number(r.gst_amount).toFixed(2)),
      'Total Amount': parseFloat(Number(r.total_amount).toFixed(2)),
      'Avg GST %': r.avg_gst_rate != null ? parseFloat(Number(r.avg_gst_rate).toFixed(2)) : null,
    }));

    return {
      title: 'Claimable GST Summary',
      columns: ['Category', 'Transactions', 'Net Amount', 'GST Amount', 'Total Amount', 'Avg GST %'],
      rows: mapped,
      totals: {
        'Net Amount': parseFloat(mapped.reduce((s, r) => s + r['Net Amount'], 0).toFixed(2)),
        'GST Amount': parseFloat(mapped.reduce((s, r) => s + r['GST Amount'], 0).toFixed(2)),
        'Total Amount': parseFloat(mapped.reduce((s, r) => s + r['Total Amount'], 0).toFixed(2)),
      },
    };
  }

  private async reimbursementRegister(userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    const params: any[] = [];
    let userClause = '';
    if (userIds !== null) { params.push(userIds); userClause = ` AND t.user_id = ANY($${params.length}::int[])`; }
    let dateClause = '';
    if (dateFrom) { params.push(dateFrom); dateClause += ` AND t.reimbursed_at >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   dateClause += ` AND t.reimbursed_at <= $${params.length}`; }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        t.id,
        t.reference_id,
        u.username           AS employee_name,
        (10000 + t.user_id)  AS employee_num,
        c.name               AS category,
        t.description,
        t.date_recorded,
        ROUND(COALESCE(t.total_amount, t.amount)::numeric, 2)::float AS amount,
        t.reimbursement_status,
        t.reimbursed_at,
        t.reimbursed_by_name,
        t.reimbursement_reference,
        t.reimbursement_note
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'expense'
        AND t.needs_reimbursement = true
        AND t.reimbursement_status IS NOT NULL${userClause}${dateClause}
      ORDER BY t.reimbursed_at DESC NULLS LAST, t.id DESC
    `, ...params);

    const mapped = rows.map((r) => ({
      'Employee':       r.employee_name || 'Unknown',
      'Employee ID':    `NT${r.employee_num}`,
      'Reference':      r.reference_id || `#${r.id}`,
      'Category':       r.category || 'Uncategorized',
      'Description':    r.description || '',
      'Expense Date':   r.date_recorded ? new Date(r.date_recorded).toISOString().slice(0, 10) : '',
      'Amount':         parseFloat(Number(r.amount).toFixed(2)),
      'Status':         r.reimbursement_status === 'PAID' ? 'Paid' : 'On Hold',
      'Reimbursed On':  r.reimbursed_at ? new Date(r.reimbursed_at).toISOString().slice(0, 10) : '',
      'Processed By':   r.reimbursed_by_name || '',
      'Payment Ref':    r.reimbursement_reference || '',
      'Note':           r.reimbursement_note || '',
    }));

    return {
      title: 'Reimbursement Register',
      columns: ['Employee', 'Employee ID', 'Reference', 'Category', 'Description', 'Expense Date', 'Amount', 'Status', 'Reimbursed On', 'Processed By', 'Payment Ref', 'Note'],
      rows: mapped,
      totals: {
        Amount: parseFloat(mapped.filter((r) => r.Status === 'Paid').reduce((s, r) => s + r.Amount, 0).toFixed(2)),
      },
    };
  }

  private async clientSummary(
    userId: number[] | null,
    dateFrom?: Date,
    dateTo?: Date,
    categoryType?: string,
    txnType?: 'income' | 'expense',
  ) {
    const where = this.buildWhere(userId, txnType, dateFrom, dateTo);
    where.clientId = { not: null };

    if (categoryType === 'project') where.projectId = { not: null };
    else if (categoryType === 'product') where.productId = { not: null };

    // Actuals only — recurring schedules are already materialized into real
    // transactions by the cron, so they are captured by the groupBy below.
    const rows = await this.prisma.transaction.groupBy({
      by: ['clientId', 'categoryId'],
      where,
      _sum: { amount: true },
      _count: true,
    });

    const mergedCS: Record<string, { clientId: number | null; categoryId: number | null; count: number; amount: number }> = {};
    for (const r of rows) {
      const k = `${r.clientId}-${r.categoryId}`;
      mergedCS[k] = { clientId: r.clientId, categoryId: r.categoryId, count: r._count, amount: Number(r._sum.amount) || 0 };
    }

    const allRows = Object.values(mergedCS);
    const clientIds = [...new Set(allRows.map((r) => r.clientId).filter(Boolean))] as number[];
    const catIds    = [...new Set(allRows.map((r) => r.categoryId).filter(Boolean))] as number[];

    const [clients, cats] = await Promise.all([
      clientIds.length ? this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [],
      catIds.length    ? this.prisma.category.findMany({ where: { id: { in: catIds } },   select: { id: true, name: true } }) : [],
    ]);

    const clientMap = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    const catMap    = Object.fromEntries(cats.map((c) => [c.id, c.name]));
    const total     = allRows.reduce((s, r) => s + r.amount, 0);

    const typeLabel = txnType ? ` (${txnType})` : '';
    const catLabel  = categoryType && categoryType !== 'all' ? ` · ${categoryType}s` : '';

    return {
      title: `Client Summary${typeLabel}${catLabel}`,
      columns: ['Client', 'Category', 'Transactions', 'Amount'],
      rows: allRows.map((r) => ({
        Client:       clientMap[r.clientId!] || 'Unknown',
        Category:     catMap[r.categoryId!]  || 'Uncategorized',
        Transactions: r.count,
        Amount:       parseFloat(r.amount.toFixed(2)),
      })).sort((a, b) => b.Amount - a.Amount),
      totals: { Amount: parseFloat(total.toFixed(2)) },
    };
  }
}
