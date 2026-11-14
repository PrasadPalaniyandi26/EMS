import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { InvoicingService } from '../invoicing/invoicing.service';
import { COUNTABLE_STATUSES, COMMITTED_STATUSES, countableStatusSql } from '../common/constants/transaction-status';
import { parseRange, parseYear } from '../common/helpers/dates';

// Costing figures (margins, estimates, unbudgeted spend) are for Finance and Admin only
const FINANCE_ROLES = ['ADMIN', 'FINANCE'];

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService, private budgets: BudgetsService, private invoicing: InvoicingService) {}

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
    const { from: dateFrom, to: dateTo } = parseRange(params.dateFrom, params.dateTo);
    const year = parseYear(params.year);
    const userIds = await this.resolveUserIds(userId, roleName);

    switch (type) {
      case 'expense-summary':    return this.expenseSummary(userIds, dateFrom, dateTo);
      case 'income-summary':     return this.incomeSummary(userIds, dateFrom, dateTo);
      case 'pl-statement':       return this.plStatement(userIds, dateFrom, dateTo);
      case 'budget-vs-actual':   return this.budgetVsActual(userId, roleName, year);
      case 'budget-by-month':    return this.budgetByMonth(userId, roleName, year);
      case 'unbudgeted-spend':   this.requireRoles(roleName, FINANCE_ROLES); return this.budgets.unbudgetedSpend(year);
      case 'order-costing':      this.requireRoles(roleName, FINANCE_ROLES); return this.orderCosting(dateFrom, dateTo);
      case 'product-margin':     this.requireRoles(roleName, FINANCE_ROLES); return this.productMargin(year);
      case 'project-estimate':   this.requireRoles(roleName, FINANCE_ROLES); return this.projectEstimate();
      case 'receivables-ageing': this.requireRoles(roleName, FINANCE_ROLES); return this.invoicing.ageingReport();
      case 'gst-sales-register': this.requireRoles(roleName, FINANCE_ROLES); return this.invoicing.salesRegister(dateFrom, dateTo);
      case 'transaction-ledger': return this.transactionLedger(userId, userIds, dateFrom, dateTo, params.txnType as any);
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

  // The money lines of a transaction: the transaction itself, or each part of it when it was split. Reports add these up,
  // so a split expense is reported under the categories it was split into, the way Budget counts it.
  private readonly PARTS = `(
    SELECT t.id AS txn_id, t.user_id, t.type, t.date_recorded, t.status, t.is_claimable, t.gst_rate, t.client_id, t.project_id, t.product_id, t.category_id,
           COALESCE(t.net_amount, t.amount) AS net, COALESCE(t.total_amount, t.amount) AS total
    FROM transactions t WHERE NOT t.is_split
    UNION ALL
    SELECT t.id, t.user_id, t.type, t.date_recorded, t.status, t.is_claimable, t.gst_rate,
           COALESCE(s.client_id, t.client_id), COALESCE(s.project_id, t.project_id), COALESCE(s.product_id, t.product_id), s.category_id,
           s.amount * COALESCE(t.net_amount, t.amount) / NULLIF(COALESCE(t.total_amount, t.amount), 0), s.amount
    FROM transactions t JOIN transaction_splits s ON s.transaction_id = t.id WHERE t.is_split
  ) p`;

  private whereParts(userIds: number[] | null, dateFrom?: Date, dateTo?: Date, params: any[] = []) {
    let clause = '';
    if (userIds !== null) { params.push(userIds); clause += ` AND p.user_id = ANY($${params.length}::int[])`; }
    if (dateFrom) { params.push(dateFrom); clause += ` AND p.date_recorded >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   clause += ` AND p.date_recorded <= $${params.length}`; }
    return { clause, params };
  }

  private async categorySummary(type: 'expense' | 'income', title: string, userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    const { clause, params } = this.whereParts(userIds, dateFrom, dateTo);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        c.name AS category,
        COUNT(DISTINCT p.txn_id)::int AS transactions,
        ROUND(SUM(p.net)::numeric, 2)::float AS net_amount,
        MAX(p.gst_rate)::float AS gst_rate,
        COUNT(DISTINCT p.txn_id) FILTER (WHERE p.is_claimable = true)::int AS claimable_count,
        ROUND(SUM(p.total)::numeric, 2)::float AS total_amount
      FROM ${this.PARTS}
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.type = '${type}' AND p.status IN ${countableStatusSql}${clause}
      GROUP BY c.name
      ORDER BY total_amount DESC
    `, ...params);

    const mapped = rows.map((r) => ({
      Category: r.category || 'Unknown',
      Transactions: r.transactions,
      'Net Amount': parseFloat(Number(r.net_amount).toFixed(2)),
      'GST %': r.gst_rate != null ? parseFloat(Number(r.gst_rate).toFixed(2)) : null,
      Claimable: r.claimable_count > 0 ? 'Yes' : 'No',
      'Total Amount': parseFloat(Number(r.total_amount).toFixed(2)),
    }));

    return {
      title,
      columns: ['Category', 'Transactions', 'Net Amount', 'GST %', 'Claimable', 'Total Amount'],
      rows: mapped,
      totals: {
        'Net Amount': parseFloat(mapped.reduce((a, r) => a + r['Net Amount'], 0).toFixed(2)),
        'Total Amount': parseFloat(mapped.reduce((a, r) => a + r['Total Amount'], 0).toFixed(2)),
      },
    };
  }

  private expenseSummary(userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    return this.categorySummary('expense', 'Expense Summary by Category', userIds, dateFrom, dateTo);
  }

  private incomeSummary(userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    return this.categorySummary('income', 'Income Summary by Category', userIds, dateFrom, dateTo);
  }


  private async plStatement(userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    // The rows and the totals cover the same period (no start or end date means no limit), so the rows always add up to the totals
    const params: any[] = [];
    let where = '';
    if (dateFrom) { params.push(dateFrom); where += ` AND date_recorded >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   where += ` AND date_recorded <= $${params.length}`; }
    if (userIds !== null) { params.push(userIds); where += ` AND user_id = ANY($${params.length}::int[])`; }
    const monthRows = await this.prisma.$queryRawUnsafe<{ yr: number; mo: number; type: string; total: number }[]>(`
      SELECT
        EXTRACT(YEAR FROM date_recorded)::int AS yr,
        EXTRACT(MONTH FROM date_recorded)::int AS mo,
        type,
        SUM(amount)::float AS total
      FROM transactions
      WHERE status IN ${countableStatusSql}${where}
      GROUP BY yr, mo, type
      ORDER BY yr, mo
    `, ...params);

    const map: Record<string, { income: number; expense: number }> = {};
    for (const r of monthRows) {
      const key = `${r.yr}-${String(r.mo).padStart(2, '0')}`;
      if (!map[key]) map[key] = { income: 0, expense: 0 };
      if (r.type === 'income') map[key].income += Number(r.total);
      if (r.type === 'expense') map[key].expense += Number(r.total);
    }
    const rows = Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => ({
      Month: key,
      Income: parseFloat(val.income.toFixed(2)),
      Expenses: parseFloat(val.expense.toFixed(2)),
      Net: parseFloat((val.income - val.expense).toFixed(2)),
    }));
    const totalIncome = parseFloat(rows.reduce((a, r) => a + r.Income, 0).toFixed(2));
    const totalExpense = parseFloat(rows.reduce((a, r) => a + r.Expenses, 0).toFixed(2));

    return {
      title: 'Profit & Loss Statement',
      columns: ['Month', 'Income', 'Expenses', 'Net'],
      rows,
      totals: { Income: totalIncome, Expenses: totalExpense, Net: parseFloat((totalIncome - totalExpense).toFixed(2)) },
    };
  }

  private requireRoles(roleName: string, allowed: string[]) {
    if (!allowed.includes((roleName || '').toUpperCase())) throw new ForbiddenException('Your role cannot open this report.');
  }

  // A manager sees only the budget lines they own; Finance and Admin see every line
  private budgetScope(userId: number, roleName: string) {
    const r = (roleName || '').toUpperCase();
    if (!['ADMIN', 'FINANCE', 'MANAGER'].includes(r)) throw new ForbiddenException('Your role cannot open this report.');
    return r === 'MANAGER' ? { ownerId: userId } : {};
  }

  private async budgetVsActual(userId: number, roleName: string, year?: number) {
    return this.budgets.budgetVsActual(year, this.budgetScope(userId, roleName));
  }

  private async budgetByMonth(userId: number, roleName: string, year?: number) {
    return this.budgets.budgetByMonth(year, this.budgetScope(userId, roleName));
  }

  // Each build order: what its BOM says it costs, what it is sold for, the budget set for it and what has been spent
  private async orderCosting(dateFrom?: Date, dateTo?: Date) {
    const startDate: any = {};
    if (dateFrom) startDate.gte = dateFrom;
    if (dateTo) startDate.lte = dateTo;
    const orders = await this.prisma.buildOrder.findMany({
      where: { status: { not: 'CANCELLED' }, ...(dateFrom || dateTo ? { startDate } : {}) },
      include: { product: { select: { name: true } }, client: { select: { name: true } }, budgetLines: { where: { isActive: true }, include: { periods: true } } },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    });
    const ids = orders.map((o) => o.id);
    const parts = ids.length ? await this.budgets.partsWhere({ status: 'APPROVED', buildOrderId: { in: ids } }) : [];
    const spentBy = new Map<number, number>();
    for (const p of parts) if (p.buildOrderId != null) spentBy.set(p.buildOrderId, (spentBy.get(p.buildOrderId) ?? 0) + p.amount);
    const r2 = (v: number) => parseFloat(v.toFixed(2));
    const rows = orders.map((o) => {
      const qty = o.quantity;
      const unitCost = o.unitCost == null ? null : Number(o.unitCost);
      const planned = unitCost == null ? null : r2(unitCost * qty);
      const value = o.unitPrice == null ? null : r2(Number(o.unitPrice) * qty);
      const budget = r2(o.budgetLines.reduce((a, l) => a + l.periods.reduce((b, p) => b + Number(p.amount), 0), 0));
      const spent = r2(spentBy.get(o.id) ?? 0);
      return {
        Order: o.code, Product: o.product?.name ?? '', Client: o.client?.name ?? '', Status: o.status.charAt(0) + o.status.slice(1).toLowerCase().replace('_', ' '), Quantity: qty,
        'Unit Cost': unitCost, 'Planned Cost': planned, 'Order Value': value,
        'Planned Margin %': value && value > 0 && planned != null ? r2(((value - planned) / value) * 100) : null,
        Budget: budget, Spent: spent, '% Used': budget > 0 ? r2((spent / budget) * 100) : null,
      };
    });
    const sum = (k: 'Planned Cost' | 'Order Value' | 'Budget' | 'Spent') => r2(rows.reduce((a, r) => a + (r[k] ?? 0), 0));
    return {
      title: 'Order Costing',
      columns: ['Order', 'Product', 'Client', 'Status', 'Quantity', 'Unit Cost', 'Planned Cost', 'Order Value', 'Planned Margin %', 'Budget', 'Spent', '% Used'],
      rows, totals: { 'Planned Cost': sum('Planned Cost'), 'Order Value': sum('Order Value'), Budget: sum('Budget'), Spent: sum('Spent') },
    };
  }

  // Selling price against the approved standard cost for the year, and where that margin sits against the goals
  private async productMargin(year?: number) {
    const s = await this.budgets.getSettings();
    const fy = year ?? this.budgets.fyOf(new Date(), s.fyStartMonth);
    const prices = await this.prisma.productPrice.findMany({ where: { fy, price: { not: null } }, include: { product: { select: { name: true, code: true } } } });
    const costs = prices.length
      ? await this.prisma.standardCost.findMany({ where: { status: 'APPROVED', productId: { in: prices.map((p) => p.productId) } }, orderBy: { id: 'desc' } })
      : [];
    const costOf = (productId: number) => {
      const mine = costs.filter((c) => c.productId === productId);
      return mine.find((c) => c.fy === fy) ?? mine[0] ?? null;
    };
    const r2 = (v: number) => parseFloat(v.toFixed(2));
    const rows = prices.map((p) => {
      const price = Number(p.price);
      const std = costOf(p.productId);
      const cost = std ? Number(std.total) : null;
      const margin = cost == null ? null : r2(price - cost);
      const pct = cost == null || price <= 0 ? null : r2(((price - cost) / price) * 100);
      const target = p.targetMarginPct == null ? null : Number(p.targetMarginPct);
      const min = p.minMarginPct == null ? null : Number(p.minMarginPct);
      const position = pct == null ? 'No standard cost' : min != null && pct < min ? 'Below minimum' : target != null && pct < target ? 'Below target' : 'On target';
      return { Product: p.product?.name ?? '', Code: p.product?.code ?? '', Price: r2(price), 'Standard Cost': cost == null ? null : r2(cost), Margin: margin, 'Margin %': pct, 'Target %': target, 'Min %': min, Position: position };
    }).sort((a, b) => (a['Margin %'] ?? -999) - (b['Margin %'] ?? -999));
    return {
      title: `Product Margin ${this.budgets.fyLabel(fy, s.fyStartMonth)}`,
      columns: ['Product', 'Code', 'Price', 'Standard Cost', 'Margin', 'Margin %', 'Target %', 'Min %', 'Position'],
      rows, totals: {},
    };
  }

  // Each project's approved estimate against what has been spent on it so far
  private async projectEstimate() {
    const [projects, baselines, parts] = await Promise.all([
      this.prisma.project.findMany({ select: { id: true, name: true, status: true, contractValue: true, targetMarginPct: true, client: { select: { name: true } } } }),
      this.prisma.estimateBaseline.findMany({ where: { status: 'APPROVED' }, orderBy: { id: 'desc' } }),
      this.budgets.partsWhere({ status: 'APPROVED', OR: [{ projectId: { not: null } }, { splits: { some: { projectId: { not: null } } } }] }),
    ]);
    const base = new Map<number, { direct: number; total: number }>();
    for (const b of baselines) if (!base.has(b.projectId)) base.set(b.projectId, { direct: Number(b.direct), total: Number(b.total) });
    const spentBy = new Map<number, number>();
    for (const p of parts) if (p.costObject === 'PROJECT' && p.projectId != null) spentBy.set(p.projectId, (spentBy.get(p.projectId) ?? 0) + p.amount);
    const r2 = (v: number) => parseFloat(v.toFixed(2));
    const rows = projects.filter((p) => base.has(p.id) || spentBy.has(p.id)).map((p) => {
      const est = base.get(p.id);
      const spent = r2(spentBy.get(p.id) ?? 0);
      const contract = p.contractValue == null ? null : Number(p.contractValue);
      return {
        Project: p.name, Client: p.client?.name ?? '', Status: p.status ?? '', 'Contract Value': contract,
        Estimate: est ? r2(est.direct) : null, Spent: spent, Remaining: est ? r2(est.direct - spent) : null,
        '% Used': est && est.direct > 0 ? r2((spent / est.direct) * 100) : null,
        'Planned Margin %': est && contract && contract > 0 ? r2(((contract - est.total) / contract) * 100) : null,
        'Target %': p.targetMarginPct == null ? null : Number(p.targetMarginPct),
      };
    }).sort((a, b) => (b['% Used'] ?? -1) - (a['% Used'] ?? -1));
    const sum = (k: 'Contract Value' | 'Estimate' | 'Spent' | 'Remaining') => r2(rows.reduce((a, r) => a + (r[k] ?? 0), 0));
    return {
      title: 'Project Estimate vs Actual',
      columns: ['Project', 'Client', 'Status', 'Contract Value', 'Estimate', 'Spent', 'Remaining', '% Used', 'Planned Margin %', 'Target %'],
      rows, totals: { 'Contract Value': sum('Contract Value'), Estimate: sum('Estimate'), Spent: sum('Spent'), Remaining: sum('Remaining') },
    };
  }

  private async transactionLedger(requesterId: number, userId: number[] | null, dateFrom?: Date, dateTo?: Date, type?: 'income' | 'expense') {
    // Ledger is a line-item listing (no totals), so it shows every real transaction
    // with its Status, excluding only soft-deleted/voided rows. Recurring schedules
    // are omitted here — the cron already materializes them into real transactions.
    const LEDGER_CAP = 2000;
    const where = this.buildWhere(userId, type, dateFrom, dateTo);
    where.status = { notIn: ['DELETED', 'VOIDED'] };
    // A draft or sent-back record is private to its owner until it is submitted
    where.AND = [{ OR: [{ userId: requesterId }, { status: { notIn: ['DRAFT', 'SENT_BACK'] } }] }];
    // Fetch one extra row to detect whether the result set was truncated by the cap.
    const txns = await this.prisma.transaction.findMany({
      where,
      include: { category: true, client: true, project: true, product: true, department: true, buildOrder: { select: { code: true } } },
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
      Product: t.product?.name || '',
      Department: t.department?.name || '',
      Order: t.buildOrder?.code || '',
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
      columns: ['Date', 'Type', 'Source', 'Description', 'Category', 'Client', 'Project', 'Product', 'Department', 'Order', 'Payment Method', 'Reference', 'Status', 'Net Amount', 'GST %', 'Claimable', 'Total Amount'],
      rows: allRows,
      totals: {},
      truncated,
      ...(truncated ? { note: `Showing the most recent ${LEDGER_CAP} entries. Narrow the date range to see older records.` } : {}),
    };
  }

  private async claimableGst(userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    const { clause, params } = this.whereParts(userIds, dateFrom, dateTo);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        c.name AS category,
        COUNT(DISTINCT p.txn_id)::int AS transactions,
        ROUND(SUM(p.net)::numeric, 2)::float AS net_amount,
        ROUND(SUM(p.total - p.net)::numeric, 2)::float AS gst_amount,
        ROUND(SUM(p.total)::numeric, 2)::float AS total_amount,
        ROUND(AVG(p.gst_rate)::numeric, 2)::float AS avg_gst_rate
      FROM ${this.PARTS}
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_claimable = true
        AND p.type = 'expense'
        AND p.status IN ${countableStatusSql}${clause}
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
        'Net Amount': parseFloat(mapped.reduce((a, r) => a + r['Net Amount'], 0).toFixed(2)),
        'GST Amount': parseFloat(mapped.reduce((a, r) => a + r['GST Amount'], 0).toFixed(2)),
        'Total Amount': parseFloat(mapped.reduce((a, r) => a + r['Total Amount'], 0).toFixed(2)),
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
      note: 'The total counts paid claims only. Claims on hold are listed but not added.',
    };
  }

  private async clientSummary(
    userId: number[] | null,
    dateFrom?: Date,
    dateTo?: Date,
    categoryType?: string,
    txnType?: 'income' | 'expense',
  ) {
    const { clause, params } = this.whereParts(userId, dateFrom, dateTo);
    let extra = '';
    if (txnType === 'income' || txnType === 'expense') { params.push(txnType); extra += ` AND p.type = $${params.length}`; }
    if (categoryType === 'project') extra += ' AND p.project_id IS NOT NULL';
    else if (categoryType === 'product') extra += ' AND p.product_id IS NOT NULL';

    // Actuals only. A split transaction counts under each part's client and category.
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT cl.name AS client, c.name AS category,
             COUNT(DISTINCT p.txn_id)::int AS transactions, ROUND(SUM(p.total)::numeric, 2)::float AS amount
      FROM ${this.PARTS}
      JOIN clients cl ON cl.id = p.client_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status IN ${countableStatusSql}${clause}${extra}
      GROUP BY cl.name, c.name
      ORDER BY amount DESC
    `, ...params);

    const total = rows.reduce((a, r) => a + Number(r.amount), 0);
    const typeLabel = txnType ? ` (${txnType})` : '';
    const catLabel = categoryType && categoryType !== 'all' ? ` · ${categoryType}s` : '';

    return {
      title: `Client Summary${typeLabel}${catLabel}`,
      columns: ['Client', 'Category', 'Transactions', 'Amount'],
      rows: rows.map((r) => ({
        Client: r.client || 'Unknown',
        Category: r.category || 'Uncategorized',
        Transactions: r.transactions,
        Amount: parseFloat(Number(r.amount).toFixed(2)),
      })),
      totals: { Amount: parseFloat(total.toFixed(2)) },
    };
  }
}
