import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { InvoicingService } from '../invoicing/invoicing.service';
import { COUNTABLE_STATUSES, COMMITTED_STATUSES, countableStatusSql } from '../common/constants/transaction-status';
import { parseDay, parseRange, parseYear } from '../common/helpers/dates';
import { workingDaysBetween } from '../common/helpers/working-days';
import { DashboardService } from '../dashboard/dashboard.service';

// What a report can be narrowed to, on top of the period. Each is optional and they combine.
export interface ReportFilters { clientId?: number; projectId?: number; productId?: number; categoryId?: number; departmentId?: number; personId?: number }

// Costing figures (margins, estimates, unbudgeted spend) are for Finance and Admin only
const FINANCE_ROLES = ['ADMIN', 'FINANCE'];

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService, private budgets: BudgetsService, private invoicing: InvoicingService, private dashboard: DashboardService) {}

  // null = no filter (all users); number[] = restrict to these user IDs.
  // Admin and Finance report on everyone. Everyone else follows their data scope, the same rule as Analytics and Home:
  // their own records, and their team's when they manage one.
  private async resolveUserIds(userId: number, roleName: string): Promise<number[] | null> {
    const r = (roleName || '').toUpperCase();
    if (r === 'FINANCE' || r === 'ADMIN') return null;
    return this.dashboard.visibleUserIds(userId, roleName);
  }

  private static readonly r2 = (v: number) => parseFloat(v.toFixed(2));
  private static readonly money = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async generate(userId: number, roleName: string, type: string, params: Record<string, string>) {
    const { from: dateFrom, to: dateTo } = parseRange(params.dateFrom, params.dateTo);
    const year = parseYear(params.year);
    const userIds = await this.resolveUserIds(userId, roleName);
    const whole = (v?: string) => { const n = Number(v); return v && Number.isInteger(n) && n > 0 ? n : undefined; };
    const filters: ReportFilters = {
      clientId: whole(params.clientId), projectId: whole(params.projectId), productId: whole(params.productId),
      categoryId: whole(params.categoryId), departmentId: whole(params.departmentId), personId: whole(params.personId),
    };
    const compare = params.compare === '1' || params.compare === 'true';

    switch (type) {
      case 'expense-summary':    return this.categorySummary('expense', 'Expense Summary by Category', userIds, dateFrom, dateTo, filters, compare);
      case 'income-summary':     return this.categorySummary('income', 'Income Summary by Category', userIds, dateFrom, dateTo, filters, compare);
      case 'pl-statement':       return this.plStatement(userIds, dateFrom, dateTo, filters, compare);
      case 'budget-vs-actual':   return this.budgetVsActual(userId, roleName, year);
      case 'budget-by-month':    return this.budgetByMonth(userId, roleName, year);
      case 'unbudgeted-spend':   this.requireRoles(roleName, FINANCE_ROLES); return this.budgets.unbudgetedSpend(year);
      case 'order-costing':      this.requireRoles(roleName, FINANCE_ROLES); return this.orderCosting(dateFrom, dateTo);
      case 'product-margin':     this.requireRoles(roleName, FINANCE_ROLES); return this.productMargin(year);
      case 'project-estimate':   this.requireRoles(roleName, FINANCE_ROLES); return this.projectEstimate();
      case 'receivables-ageing': this.requireRoles(roleName, FINANCE_ROLES); return this.invoicing.ageingReport(parseDay(params.asOf, 'The as-of date'));
      case 'gst-sales-register': this.requireRoles(roleName, FINANCE_ROLES); return this.invoicing.salesRegister(dateFrom, dateTo);
      case 'transaction-ledger': return this.transactionLedger(userId, userIds, dateFrom, dateTo, params.txnType as any, params.status, filters);
      case 'client-summary':     return this.clientSummary(userIds, dateFrom, dateTo, params.categoryType, params.txnType as any, filters, compare);
      case 'claimable-gst':            return this.claimableGst(userIds, dateFrom, dateTo, filters);
      case 'reimbursement-register':   return this.reimbursementRegister(userIds, dateFrom, dateTo);
      case 'outstanding-reimbursements': return this.outstandingReimbursements(userIds);
      case 'invoice-register':   this.requireRoles(roleName, FINANCE_ROLES); return this.invoicing.invoiceRegister(dateFrom, dateTo, filters.clientId);
      case 'client-statement':   this.requireRoles(roleName, FINANCE_ROLES); return this.invoicing.clientStatement(filters.clientId, dateFrom, dateTo);
      case 'collections':        this.requireRoles(roleName, FINANCE_ROLES); return this.invoicing.collections(dateFrom, dateTo, filters.clientId);
      case 'tds-register':       this.requireRoles(roleName, FINANCE_ROLES); return this.invoicing.tdsRegister(dateFrom, dateTo, filters.clientId);
      case 'gst-position':       this.requireRoles(roleName, FINANCE_ROLES); return this.gstPosition(dateFrom, dateTo);
      case 'client-po-status':   this.requireRoles(roleName, FINANCE_ROLES); return this.invoicing.clientPoStatus(filters.clientId);
      case 'project-billing':    this.requireRoles(roleName, FINANCE_ROLES); return this.projectBilling();
      default: throw new BadRequestException(`Unknown report type: ${type}`);
    }
  }

  async people(userId: number, roleName: string) {
    const ids = await this.resolveUserIds(userId, roleName);
    const users = await this.prisma.user.findMany({ where: ids === null ? {} : { id: { in: ids } }, select: { id: true, username: true }, orderBy: { username: 'asc' } });
    return users.length > 1 ? users : [];
  }

  // The period of the same length that ends the day before this one starts; null when the period is open
  private previousRange(from?: Date, to?: Date) {
    if (!from || !to) return null;
    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    const pTo = new Date(from.getTime() - 86400000);
    const pFrom = new Date(pTo.getTime() - (days - 1) * 86400000);
    return { from: pFrom, to: pTo };
  }
  private static readonly change = (cur: number, prev: number) => (prev > 0 ? parseFloat((((cur - prev) / prev) * 100).toFixed(2)) : null);
  private static readonly iso = (d: Date) => d.toISOString().slice(0, 10);

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
    SELECT t.id AS txn_id, t.user_id, t.type, t.date_recorded, t.status, t.is_claimable, t.gst_rate, t.client_id, t.project_id, t.product_id, t.category_id, t.department_id,
           COALESCE(t.net_amount, t.amount) AS net, COALESCE(t.total_amount, t.amount) AS total
    FROM transactions t WHERE NOT t.is_split
    UNION ALL
    SELECT t.id, t.user_id, t.type, t.date_recorded, t.status, t.is_claimable, t.gst_rate,
           COALESCE(s.client_id, t.client_id), COALESCE(s.project_id, t.project_id), COALESCE(s.product_id, t.product_id), s.category_id, t.department_id,
           s.amount * COALESCE(t.net_amount, t.amount) / NULLIF(COALESCE(t.total_amount, t.amount), 0), s.amount
    FROM transactions t JOIN transaction_splits s ON s.transaction_id = t.id WHERE t.is_split
  ) p`;

  private whereParts(userIds: number[] | null, dateFrom?: Date, dateTo?: Date, filters: ReportFilters = {}, params: any[] = []) {
    let clause = '';
    if (userIds !== null) { params.push(userIds); clause += ` AND p.user_id = ANY($${params.length}::int[])`; }
    if (dateFrom) { params.push(dateFrom); clause += ` AND p.date_recorded >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   clause += ` AND p.date_recorded <= $${params.length}`; }
    // The filters narrow what the scope already allows, so a person outside it gives no rows rather than more
    const narrow: [number | undefined, string][] = [[filters.clientId, 'client_id'], [filters.projectId, 'project_id'], [filters.productId, 'product_id'], [filters.categoryId, 'category_id'], [filters.departmentId, 'department_id'], [filters.personId, 'user_id']];
    for (const [v, col] of narrow) if (v != null) { params.push(v); clause += ` AND p.${col} = $${params.length}`; }
    return { clause, params };
  }

  private async categoryRows(type: 'expense' | 'income', userIds: number[] | null, dateFrom?: Date, dateTo?: Date, filters: ReportFilters = {}) {
    const { clause, params } = this.whereParts(userIds, dateFrom, dateTo, filters);
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        c.id AS category_id,
        c.name AS category,
        COUNT(DISTINCT p.txn_id)::int AS transactions,
        ROUND(SUM(p.net)::numeric, 2)::float AS net_amount,
        ROUND(SUM(p.total - p.net)::numeric, 2)::float AS gst_amount,
        ROUND(SUM(p.total)::numeric, 2)::float AS total_amount,
        ROUND(COALESCE(SUM(p.total - p.net) FILTER (WHERE p.is_claimable = true), 0)::numeric, 2)::float AS claimable_gst
      FROM ${this.PARTS}
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.type = '${type}' AND p.status IN ${countableStatusSql}${clause}
      GROUP BY c.id, c.name
      ORDER BY total_amount DESC
    `, ...params);
  }

  // Spend or income for each category: what was paid net of GST, the GST, the total, and the category's share of the whole.
  // Categories are told apart by id, so two categories with the same name are never merged. With compare on, the period before is shown beside it.
  private async categorySummary(type: 'expense' | 'income', title: string, userIds: number[] | null, dateFrom?: Date, dateTo?: Date, filters: ReportFilters = {}, compare = false) {
    const r2 = ReportingService.r2;
    const rows = await this.categoryRows(type, userIds, dateFrom, dateTo, filters);
    const prevRange = compare ? this.previousRange(dateFrom, dateTo) : null;
    const prevRows = prevRange ? await this.categoryRows(type, userIds, prevRange.from, prevRange.to, filters) : [];
    const prevBy = new Map(prevRows.map((r) => [r.category_id ?? 'none', r]));
    // A category with spend only in the earlier period is listed too, so nothing that dropped to zero goes missing
    const merged = [...rows, ...prevRows.filter((r) => !rows.some((c) => (c.category_id ?? 'none') === (r.category_id ?? 'none'))).map((r) => ({ ...r, transactions: 0, net_amount: 0, gst_amount: 0, total_amount: 0, claimable_gst: 0 }))];
    const grand = rows.reduce((a, r) => a + Number(r.total_amount), 0);
    const mapped = merged.map((r) => {
      const prev = Number(prevBy.get(r.category_id ?? 'none')?.total_amount ?? 0);
      return {
        Category: r.category || 'Uncategorized',
        Transactions: r.transactions,
        'Net Amount': r2(Number(r.net_amount)),
        'GST Amount': r2(Number(r.gst_amount)),
        'Total Amount': r2(Number(r.total_amount)),
        ...(prevRange ? { Previous: r2(prev), 'Change %': ReportingService.change(Number(r.total_amount), prev) } : {}),
        Average: r.transactions ? r2(Number(r.total_amount) / r.transactions) : 0,
        'Share %': grand > 0 ? r2((Number(r.total_amount) / grand) * 100) : 0,
        ...(type === 'expense' ? { 'Claimable GST': r2(Number(r.claimable_gst)) } : {}),
        _categoryId: r.category_id ?? null,
      };
    });
    const sum = (k: string) => r2(mapped.reduce((a, r: any) => a + (Number(r[k]) || 0), 0));
    const prevTotal = prevRange ? sum('Previous') : 0;
    const label = (d: Date) => ReportingService.iso(d);

    return {
      title,
      columns: ['Category', 'Transactions', 'Net Amount', 'GST Amount', 'Total Amount', ...(prevRange ? ['Previous', 'Change %'] : []), 'Average', 'Share %', ...(type === 'expense' ? ['Claimable GST'] : [])],
      rows: mapped,
      totals: {
        'Net Amount': sum('Net Amount'), 'GST Amount': sum('GST Amount'), 'Total Amount': sum('Total Amount'),
        ...(prevRange ? { Previous: prevTotal, 'Change %': ReportingService.change(sum('Total Amount'), prevTotal) } : {}),
        'Share %': grand > 0 ? 100 : 0, ...(type === 'expense' ? { 'Claimable GST': sum('Claimable GST') } : {}),
      },
      note: (type === 'expense'
        ? 'Approved records only. Total Amount is what was paid including GST. Claimable GST is the GST on expenses marked claimable. A split expense is counted under each category it was split into.'
        : 'Approved records only. Total Amount is what was received including GST. A split record is counted under each category it was split into.')
        + (prevRange ? ` Previous is the same total for ${label(prevRange.from)} to ${label(prevRange.to)}.` : compare ? ' Choose a start and end date to compare with the period before.' : ''),
    };
  }

  private async plMonths(userIds: number[] | null, dateFrom?: Date, dateTo?: Date, filters: ReportFilters = {}) {
    const { clause, params } = this.whereParts(userIds, dateFrom, dateTo, filters);
    return this.prisma.$queryRawUnsafe<{ yr: number; mo: number; type: string; total: number }[]>(`
      SELECT
        EXTRACT(YEAR FROM p.date_recorded)::int AS yr,
        EXTRACT(MONTH FROM p.date_recorded)::int AS mo,
        p.type AS type,
        SUM(p.total)::float AS total
      FROM ${this.PARTS}
      WHERE p.status IN ${countableStatusSql}${clause}
      GROUP BY yr, mo, p.type
      ORDER BY yr, mo
    `, ...params);
  }

  // Income and spend by month, on the total including GST (what was received and paid), so it agrees with the summaries. Months with nothing are shown too.
  private async plStatement(userIds: number[] | null, dateFrom?: Date, dateTo?: Date, filters: ReportFilters = {}, compare = false) {
    const monthRows = await this.plMonths(userIds, dateFrom, dateTo, filters);
    const r2 = ReportingService.r2;
    const map: Record<string, { income: number; expense: number }> = {};
    const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
    for (const r of monthRows) {
      const k = key(r.yr, r.mo);
      if (!map[k]) map[k] = { income: 0, expense: 0 };
      if (r.type === 'income') map[k].income += Number(r.total);
      if (r.type === 'expense') map[k].expense += Number(r.total);
    }
    // Every month from the start of the period to its end, or from the first to the last month with records when the period is open
    const keys = Object.keys(map).sort();
    const first = dateFrom ?? (keys.length ? new Date(`${keys[0]}-01T00:00:00Z`) : null);
    const last = dateTo ?? (keys.length ? new Date(`${keys[keys.length - 1]}-01T00:00:00Z`) : null);
    if (first && last) {
      let y = first.getUTCFullYear(); let m = first.getUTCMonth() + 1;
      const endKey = last.getUTCFullYear() * 12 + last.getUTCMonth();
      for (let guard = 0; y * 12 + (m - 1) <= endKey && guard < 600; guard++) {
        const k = key(y, m);
        if (!map[k]) map[k] = { income: 0, expense: 0 };
        m++; if (m > 12) { m = 1; y++; }
      }
    }
    const rows = Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => ({
      Month: k, Income: r2(val.income), Expenses: r2(val.expense), Net: r2(val.income - val.expense),
    }));
    const totalIncome = r2(rows.reduce((a, r) => a + r.Income, 0));
    const totalExpense = r2(rows.reduce((a, r) => a + r.Expenses, 0));

    let compareNote = '';
    const prevRange = compare ? this.previousRange(dateFrom, dateTo) : null;
    if (prevRange) {
      const prev = await this.plMonths(userIds, prevRange.from, prevRange.to, filters);
      const pi = r2(prev.filter((r) => r.type === 'income').reduce((a, r) => a + Number(r.total), 0));
      const pe = r2(prev.filter((r) => r.type === 'expense').reduce((a, r) => a + Number(r.total), 0));
      const money = ReportingService.money; const ch = (c: number, p: number) => { const v = ReportingService.change(c, p); return v == null ? 'no change figure' : `${v > 0 ? '+' : ''}${v}%`; };
      compareNote = ` Before this (${ReportingService.iso(prevRange.from)} to ${ReportingService.iso(prevRange.to)}): income ${money(pi)} (${ch(totalIncome, pi)}), expenses ${money(pe)} (${ch(totalExpense, pe)}).`;
    } else if (compare) compareNote = ' Choose a start and end date to compare with the period before.';

    return {
      title: 'Profit & Loss Statement',
      columns: ['Month', 'Income', 'Expenses', 'Net'],
      rows,
      totals: { Income: totalIncome, Expenses: totalExpense, Net: r2(totalIncome - totalExpense) },
      note: 'Approved records only, on the total including GST: what was received and what was paid. It agrees with the Income and Expense Summaries.' + compareNote,
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

  // Each build order: its dates, what its BOM says it costs, what it is sold for, the budget set for it, what has been spent, and what has been billed and received
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
    const [parts, invoices] = await Promise.all([
      ids.length ? this.budgets.partsWhere({ status: 'APPROVED', buildOrderId: { in: ids } }) : Promise.resolve([] as any[]),
      // An invoice counts for an order when it names the order, or sits on a PO that does
      ids.length ? this.prisma.invoice.findMany({
        where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, OR: [{ buildOrderId: { in: ids } }, { po: { buildOrderId: { in: ids } } }] },
        select: { buildOrderId: true, taxable: true, paid: true, tds: true, po: { select: { buildOrderId: true } } },
      }) : Promise.resolve([] as any[]),
    ]);
    const spentBy = new Map<number, number>();
    for (const p of parts) if (p.buildOrderId != null) spentBy.set(p.buildOrderId, (spentBy.get(p.buildOrderId) ?? 0) + p.amount);
    const billed = new Map<number, { invoiced: number; received: number }>();
    for (const i of invoices) {
      const oid = i.buildOrderId ?? i.po?.buildOrderId;
      if (oid == null) continue;
      const e = billed.get(oid) ?? { invoiced: 0, received: 0 };
      e.invoiced += Number(i.taxable); e.received += Number(i.paid) + Number(i.tds); billed.set(oid, e);
    }
    const r2 = ReportingService.r2;
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
    const today = new Date(); const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const rows = orders.map((o) => {
      const qty = o.quantity;
      const unitCost = o.unitCost == null ? null : Number(o.unitCost);
      const planned = unitCost == null ? null : r2(unitCost * qty);
      const value = o.unitPrice == null ? null : r2(Number(o.unitPrice) * qty);
      const budget = r2(o.budgetLines.reduce((a, l) => a + l.periods.reduce((b, p) => b + Number(p.amount), 0), 0));
      const spent = r2(spentBy.get(o.id) ?? 0);
      // Days past the promised date: when it was delivered late, or still open and already past it
      const promised = Date.UTC(o.deliveryDate.getUTCFullYear(), o.deliveryDate.getUTCMonth(), o.deliveryDate.getUTCDate());
      const lateBy = o.deliveredOn
        ? workingDaysBetween(new Date(promised), o.deliveredOn)
        : ['COMMITTED', 'RELEASED', 'IN_BUILD'].includes(o.status) ? workingDaysBetween(new Date(promised), new Date(todayUtc)) : 0;
      const b = billed.get(o.id);
      return {
        Order: o.code, Product: o.product?.name ?? '', Client: o.client?.name ?? '', Status: o.status.charAt(0) + o.status.slice(1).toLowerCase().replace('_', ' '), Quantity: qty,
        Start: day(o.startDate), Promised: day(o.deliveryDate), Delivered: day(o.deliveredOn), 'Days Late': lateBy > 0 ? lateBy : null,
        'Unit Cost': unitCost, 'Planned Cost': planned, 'Order Value': value,
        'Planned Margin %': value && value > 0 && planned != null ? r2(((value - planned) / value) * 100) : null,
        Budget: budget, Spent: spent, '% Used': budget > 0 ? r2((spent / budget) * 100) : null,
        Invoiced: r2(b?.invoiced ?? 0), Received: r2(b?.received ?? 0), _orderId: o.id,
      };
    });
    const sum = (k: 'Planned Cost' | 'Order Value' | 'Budget' | 'Spent' | 'Invoiced' | 'Received') => r2(rows.reduce((a, r) => a + (r[k] ?? 0), 0));
    // The overall margin is taken over the orders that have both a cost and a price
    const priced = rows.filter((r) => r['Order Value'] != null && r['Planned Cost'] != null && r['Order Value'] > 0);
    const pv = priced.reduce((a, r) => a + (r['Order Value'] as number), 0); const pc = priced.reduce((a, r) => a + (r['Planned Cost'] as number), 0);
    return {
      title: 'Order Costing',
      columns: ['Order', 'Product', 'Client', 'Status', 'Quantity', 'Start', 'Promised', 'Delivered', 'Days Late', 'Unit Cost', 'Planned Cost', 'Order Value', 'Planned Margin %', 'Budget', 'Spent', '% Used', 'Invoiced', 'Received'],
      rows,
      totals: { 'Planned Cost': sum('Planned Cost'), 'Order Value': sum('Order Value'), 'Planned Margin %': pv > 0 ? r2(((pv - pc) / pv) * 100) : null, Budget: sum('Budget'), Spent: sum('Spent'), Invoiced: sum('Invoiced'), Received: sum('Received') },
      note: 'Unit Cost is the cost when the order was last costed. Days Late counts days past the promised date, for a late delivery or an open order already past it. Spent is approved expenses charged to the order. Invoiced is the taxable value of issued invoices; Received includes tax deducted at source.',
    };
  }

  // Selling price against the approved standard cost for the year, and where that margin sits against the goals.
  // Every active product is listed, so one with no price or no cost shows up as something to fix instead of being left out.
  private async productMargin(year?: number) {
    const s = await this.budgets.getSettings();
    const fy = year ?? this.budgets.fyOf(new Date(), s.fyStartMonth);
    const products = await this.prisma.product.findMany({ where: { isActive: true, isSystem: false }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } });
    const ids = products.map((p) => p.id);
    const months = this.budgets.fyMonths(fy, s.fyStartMonth);
    const [prices, costs, plan] = ids.length ? await Promise.all([
      this.prisma.productPrice.findMany({ where: { fy, productId: { in: ids } } }),
      this.prisma.standardCost.findMany({ where: { status: 'APPROVED', productId: { in: ids } }, orderBy: { id: 'desc' } }),
      this.prisma.productionPlan.findMany({ where: { productId: { in: ids }, OR: months.map((m) => ({ year: m.year, month: m.month })) } }),
    ]) : [[], [], []] as any[];
    const costOf = (productId: number) => {
      const mine = (costs as any[]).filter((c) => c.productId === productId);
      return mine.find((c) => c.fy === fy) ?? mine[0] ?? null;
    };
    const r2 = ReportingService.r2;
    const rank: Record<string, number> = { 'Below minimum': 0, 'Below target': 1, 'No price set': 2, 'No standard cost': 3, 'No goals set': 4, 'On target': 5 };
    const rows = products.map((p) => {
      const pr = (prices as any[]).find((x) => x.productId === p.id);
      const price = pr?.price == null ? null : Number(pr.price);
      const std = costOf(p.id);
      const cost = std ? Number(std.total) : null;
      const margin = price == null || cost == null ? null : r2(price - cost);
      const pct = price == null || cost == null || price <= 0 ? null : r2(((price - cost) / price) * 100);
      const target = pr?.targetMarginPct == null ? null : Number(pr.targetMarginPct);
      const min = pr?.minMarginPct == null ? null : Number(pr.minMarginPct);
      const position = price == null ? 'No price set' : cost == null ? 'No standard cost'
        : pct != null && min != null && pct < min ? 'Below minimum' : pct != null && target != null && pct < target ? 'Below target'
        : target == null && min == null ? 'No goals set' : 'On target';
      const units = (plan as any[]).filter((x) => x.productId === p.id).reduce((a, x) => a + Number(x.plannedUnits), 0);
      return {
        Product: p.name, Code: p.code ?? '', Price: price == null ? null : r2(price), 'Standard Cost': cost == null ? null : r2(cost),
        'Cost Year': std ? this.budgets.fyLabel(std.fy, s.fyStartMonth) : '', Margin: margin, 'Margin %': pct, 'Target %': target, 'Min %': min,
        'Planned Units': units, 'Extended Margin': margin == null ? null : r2(margin * units), Position: position, _productId: p.id,
      };
    }).sort((a, b) => (rank[a.Position] - rank[b.Position]) || ((a['Margin %'] ?? 0) - (b['Margin %'] ?? 0)));
    return {
      title: `Product Margin ${this.budgets.fyLabel(fy, s.fyStartMonth)}`,
      columns: ['Product', 'Code', 'Price', 'Standard Cost', 'Cost Year', 'Margin', 'Margin %', 'Target %', 'Min %', 'Planned Units', 'Extended Margin', 'Position'],
      rows,
      totals: { 'Planned Units': rows.reduce((a, r) => a + r['Planned Units'], 0), 'Extended Margin': r2(rows.reduce((a, r) => a + (r['Extended Margin'] ?? 0), 0)) },
      note: 'Products that need attention come first. Cost Year is the year of the standard cost used, which is an earlier year when none is approved for this one. Extended Margin is the margin for each unit times the units in the build plan.',
    };
  }

  // Each project's approved estimate against what has been spent on it so far, and what has been billed and received
  private async projectEstimate() {
    const [projects, baselines, parts, invoices] = await Promise.all([
      this.prisma.project.findMany({ select: { id: true, name: true, status: true, contractValue: true, targetMarginPct: true, client: { select: { name: true } } } }),
      this.prisma.estimateBaseline.findMany({ where: { status: 'APPROVED' }, orderBy: { id: 'desc' } }),
      this.budgets.partsWhere({ status: 'APPROVED', OR: [{ projectId: { not: null } }, { splits: { some: { projectId: { not: null } } } }] }),
      this.prisma.invoice.findMany({
        where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, OR: [{ projectId: { not: null } }, { po: { projectId: { not: null } } }] },
        select: { projectId: true, taxable: true, paid: true, tds: true, po: { select: { projectId: true } } },
      }),
    ]);
    const base = new Map<number, { direct: number; total: number }>();
    for (const b of baselines) if (!base.has(b.projectId)) base.set(b.projectId, { direct: Number(b.direct), total: Number(b.total) });
    const spentBy = new Map<number, number>();
    for (const p of parts) if (p.costObject === 'PROJECT' && p.projectId != null) spentBy.set(p.projectId, (spentBy.get(p.projectId) ?? 0) + p.amount);
    const billed = new Map<number, { invoiced: number; received: number }>();
    for (const i of invoices) {
      const pid = i.projectId ?? i.po?.projectId;
      if (pid == null) continue;
      const e = billed.get(pid) ?? { invoiced: 0, received: 0 };
      e.invoiced += Number(i.taxable); e.received += Number(i.paid) + Number(i.tds); billed.set(pid, e);
    }
    const r2 = ReportingService.r2;
    const rows = projects.filter((p) => base.has(p.id) || spentBy.has(p.id) || billed.has(p.id)).map((p) => {
      const est = base.get(p.id);
      const spent = r2(spentBy.get(p.id) ?? 0);
      const contract = p.contractValue == null ? null : Number(p.contractValue);
      const b = billed.get(p.id);
      return {
        Project: p.name, Client: p.client?.name ?? '', Status: p.status ?? '', 'Contract Value': contract,
        Estimate: est ? r2(est.direct) : null, 'Estimate Total': est ? r2(est.total) : null, Spent: spent, Remaining: est ? r2(est.direct - spent) : null,
        '% Used': est && est.direct > 0 ? r2((spent / est.direct) * 100) : null,
        Invoiced: r2(b?.invoiced ?? 0), Received: r2(b?.received ?? 0),
        'Planned Margin %': est && contract && contract > 0 ? r2(((contract - est.total) / contract) * 100) : null,
        'Target %': p.targetMarginPct == null ? null : Number(p.targetMarginPct), _projectId: p.id,
      };
    }).sort((a, b) => (b['% Used'] ?? -1) - (a['% Used'] ?? -1));
    const sum = (k: 'Contract Value' | 'Estimate' | 'Estimate Total' | 'Spent' | 'Remaining' | 'Invoiced' | 'Received') => r2(rows.reduce((a, r) => a + (r[k] ?? 0), 0));
    return {
      title: 'Project Estimate vs Actual',
      columns: ['Project', 'Client', 'Status', 'Contract Value', 'Estimate', 'Estimate Total', 'Spent', 'Remaining', '% Used', 'Invoiced', 'Received', 'Planned Margin %', 'Target %'],
      rows,
      totals: { 'Contract Value': sum('Contract Value'), Estimate: sum('Estimate'), 'Estimate Total': sum('Estimate Total'), Spent: sum('Spent'), Remaining: sum('Remaining'), Invoiced: sum('Invoiced'), Received: sum('Received') },
      note: "Estimate is the approved baseline's direct cost, and Remaining and % Used are measured against it. Estimate Total adds contingency and warranty, and Planned Margin % is the contract value less that total. Spent is approved expenses. Invoiced is the taxable value of issued invoices; Received includes tax deducted at source.",
    };
  }

  // Status groups the ledger can be narrowed to
  private static readonly LEDGER_STATUS: Record<string, { label: string; statuses: string[] }> = {
    approved: { label: 'Approved', statuses: ['APPROVED'] },
    waiting: { label: 'Waiting for approval', statuses: ['PENDING_MANAGER', 'PENDING_FINANCE'] },
    draft: { label: 'Draft', statuses: ['DRAFT', 'SENT_BACK'] },
    rejected: { label: 'Rejected', statuses: ['REJECTED'] },
  };

  private async transactionLedger(requesterId: number, userId: number[] | null, dateFrom?: Date, dateTo?: Date, type?: 'income' | 'expense', status?: string, filters: ReportFilters = {}) {
    // The ledger lists records one by one, whatever their status, apart from deleted and voided ones.
    // A split record is listed as one row for each part, the way the summaries count it. Recurring schedules are left out: the cron turns them into real records.
    const LEDGER_CAP = 2000;
    const group = status ? ReportingService.LEDGER_STATUS[status] : undefined;
    const where = this.buildWhere(userId, type, dateFrom, dateTo);
    where.status = group ? { in: group.statuses } : { notIn: ['DELETED', 'VOIDED'] };
    // A draft or sent-back record is private to its owner until it is submitted
    where.AND = [{ OR: [{ userId: requesterId }, { status: { notIn: ['DRAFT', 'SENT_BACK'] } }] }];
    // Narrowing by client, project, product or category also matches a split record that has a part for it
    const part = (field: 'clientId' | 'projectId' | 'productId' | 'categoryId', v?: number) => { if (v != null) where.AND.push({ OR: [{ [field]: v }, { splits: { some: { [field]: v } } }] }); };
    part('clientId', filters.clientId); part('projectId', filters.projectId); part('productId', filters.productId); part('categoryId', filters.categoryId);
    if (filters.departmentId != null) where.departmentId = filters.departmentId;
    if (filters.personId != null) where.userId = userId === null || userId.includes(filters.personId) ? filters.personId : -1;
    // Fetch one extra record to detect whether the result was cut short by the cap
    const txns = await this.prisma.transaction.findMany({
      where,
      include: {
        category: true, client: true, project: true, product: true, department: true, buildOrder: { select: { code: true } }, user: { select: { username: true } },
        splits: { include: { category: true, client: true, project: true, product: true }, orderBy: { id: 'asc' } },
      },
      orderBy: [{ dateRecorded: 'desc' }, { id: 'desc' }],
      take: LEDGER_CAP + 1,
    });
    const truncated = txns.length > LEDGER_CAP;
    if (truncated) txns.length = LEDGER_CAP;

    const r2 = ReportingService.r2;
    const rows: Record<string, any>[] = [];
    for (const t of txns) {
      const total = Number(t.totalAmount ?? t.amount);
      const net = Number(t.netAmount ?? t.amount);
      const common = {
        Date: t.dateRecorded.toISOString().slice(0, 10),
        Reference: t.referenceId || `#${t.id}`,
        Type: t.type,
        Employee: t.user?.username || '',
        Department: t.department?.name || '',
        Order: t.buildOrder?.code || '',
        'Payment Method': t.paymentMethod || '',
        'Receipt No': t.receiptNumber || '',
        Status: t.status || '',
        'Approved By': (t as any).approvedByName || '',
        'Approved On': (t as any).approvedAt ? new Date((t as any).approvedAt).toISOString().slice(0, 10) : '',
        'GST %': t.gstRate != null ? r2(Number(t.gstRate)) : null,
        Claimable: (t as any).isClaimable ? 'Yes' : 'No',
      };
      if (t.isSplit && t.splits.length) {
        t.splits.forEach((sp, i) => {
          // With a filter on, only the parts that match it are listed, so the rows add up to the summaries for the same filter
          if (filters.categoryId != null && sp.categoryId !== filters.categoryId) return;
          if (filters.clientId != null && (sp.clientId ?? t.clientId) !== filters.clientId) return;
          if (filters.projectId != null && (sp.projectId ?? t.projectId) !== filters.projectId) return;
          if (filters.productId != null && (sp.productId ?? t.productId) !== filters.productId) return;
          const part = Number(sp.amount);
          rows.push({
            ...common, Description: sp.description || t.description || '', Category: sp.category?.name || '', Client: sp.client?.name || t.client?.name || '',
            Project: sp.project?.name || t.project?.name || '', Product: sp.product?.name || t.product?.name || '',
            Split: `${i + 1} of ${t.splits.length}`, 'Net Amount': total > 0 ? r2((part * net) / total) : r2(part), 'Total Amount': r2(part),
          });
        });
      } else {
        rows.push({
          ...common, Description: t.description || '', Category: t.category?.name || '', Client: t.client?.name || '',
          Project: t.project?.name || '', Product: t.product?.name || '', Split: '', 'Net Amount': r2(net), 'Total Amount': r2(total),
        });
      }
    }

    // What the listed rows come to for each status and type, so the ledger can be tied to the summaries (which count approved records only)
    const label = (st: string) => (st === 'APPROVED' ? 'Approved' : ['PENDING_MANAGER', 'PENDING_FINANCE'].includes(st) ? 'Waiting for approval' : ['DRAFT', 'SENT_BACK'].includes(st) ? 'Draft' : st === 'REJECTED' ? 'Rejected' : st);
    const by = new Map<string, { income: number; expense: number }>();
    for (const r of rows) { const g = label(r.Status); const e = by.get(g) ?? { income: 0, expense: 0 }; e[r.Type as 'income' | 'expense'] += r['Total Amount']; by.set(g, e); }
    const money = ReportingService.money;
    const parts = ['Approved', 'Waiting for approval', 'Draft', 'Rejected'].filter((g) => by.has(g)).map((g) => {
      const e = by.get(g)!;
      return `${g}: ${[e.income ? `income ${money(e.income)}` : '', e.expense ? `expense ${money(e.expense)}` : ''].filter(Boolean).join(', ')}`;
    });
    const noteParts = [parts.length ? `${parts.join('. ')}.` : '', truncated ? `Showing the most recent ${LEDGER_CAP} records. Narrow the date range to see older ones.` : ''].filter(Boolean);

    return {
      title: `Transaction Ledger${type ? ` (${type})` : ''}${group ? ` · ${group.label.toLowerCase()}` : ''}`,
      columns: ['Date', 'Reference', ...(type ? [] : ['Type']), 'Employee', 'Description', 'Category', 'Client', 'Project', 'Product', 'Department', 'Order', 'Payment Method', 'Receipt No', 'Status', 'Approved By', 'Approved On', 'Split', 'Net Amount', 'GST %', 'Claimable', 'Total Amount'],
      rows,
      totals: {},
      truncated,
      ...(noteParts.length ? { note: noteParts.join(' ') } : {}),
    };
  }

  private async claimableGst(userIds: number[] | null, dateFrom?: Date, dateTo?: Date, filters: ReportFilters = {}) {
    const { clause, params } = this.whereParts(userIds, dateFrom, dateTo, filters);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        c.name AS category,
        COUNT(DISTINCT p.txn_id)::int AS transactions,
        ROUND(SUM(p.net)::numeric, 2)::float AS net_amount,
        ROUND(SUM(p.total - p.net)::numeric, 2)::float AS gst_amount,
        ROUND(SUM(p.total)::numeric, 2)::float AS total_amount,
        ROUND((CASE WHEN SUM(p.net) > 0 THEN SUM(p.total - p.net) / SUM(p.net) * 100 END)::numeric, 2)::float AS effective_rate
      FROM ${this.PARTS}
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_claimable = true
        AND p.type = 'expense'
        AND p.status IN ${countableStatusSql}${clause}
      GROUP BY c.id, c.name
      ORDER BY gst_amount DESC
    `, ...params);

    const r2 = ReportingService.r2;
    const mapped = rows.map((r) => ({
      Category: r.category || 'Uncategorized',
      Transactions: r.transactions,
      'Net Amount': r2(Number(r.net_amount)),
      'GST Amount': r2(Number(r.gst_amount)),
      'Total Amount': r2(Number(r.total_amount)),
      'Effective GST %': r.effective_rate != null ? r2(Number(r.effective_rate)) : null,
    }));
    const sum = (k: 'Net Amount' | 'GST Amount' | 'Total Amount') => r2(mapped.reduce((a, r) => a + r[k], 0));
    const net = sum('Net Amount');

    return {
      title: 'Claimable GST Summary',
      columns: ['Category', 'Transactions', 'Net Amount', 'GST Amount', 'Total Amount', 'Effective GST %'],
      rows: mapped,
      totals: { 'Net Amount': net, 'GST Amount': sum('GST Amount'), 'Total Amount': sum('Total Amount'), 'Effective GST %': net > 0 ? r2((sum('GST Amount') / net) * 100) : null },
      note: 'Approved expenses marked claimable. Effective GST % is the GST amount as a share of the net amount, so categories with mixed rates are weighted by value.',
    };
  }

  // Every approved expense that is to be paid back to the employee: not yet processed (Pending), On Hold, or Paid.
  // The period is the date the claim was settled, or the expense date while it is still open, so open claims never drop out of a period.
  private async reimbursementRegister(userIds: number[] | null, dateFrom?: Date, dateTo?: Date) {
    const params: any[] = [];
    let userClause = '';
    if (userIds !== null) { params.push(userIds); userClause = ` AND t.user_id = ANY($${params.length}::int[])`; }
    let dateClause = '';
    if (dateFrom) { params.push(dateFrom); dateClause += ` AND COALESCE(t.reimbursed_at::date, t.date_recorded) >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   dateClause += ` AND COALESCE(t.reimbursed_at::date, t.date_recorded) <= $${params.length}`; }

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
        AND t.status = 'APPROVED'${userClause}${dateClause}
      ORDER BY CASE WHEN t.reimbursement_status IS NULL THEN 0 WHEN t.reimbursement_status = 'ON_HOLD' THEN 1 ELSE 2 END,
               COALESCE(t.reimbursed_at::date, t.date_recorded) DESC, t.id DESC
    `, ...params);

    const statusOf = (s: string | null) => (s === 'PAID' ? 'Paid' : s === 'ON_HOLD' ? 'On Hold' : 'Pending');
    const mapped = rows.map((r) => ({
      'Employee':       r.employee_name || 'Unknown',
      'Employee ID':    `NT${r.employee_num}`,
      'Reference':      r.reference_id || `#${r.id}`,
      'Category':       r.category || 'Uncategorized',
      'Description':    r.description || '',
      'Expense Date':   r.date_recorded ? new Date(r.date_recorded).toISOString().slice(0, 10) : '',
      'Amount':         parseFloat(Number(r.amount).toFixed(2)),
      'Status':         statusOf(r.reimbursement_status),
      'Reimbursed On':  r.reimbursed_at ? new Date(r.reimbursed_at).toISOString().slice(0, 10) : '',
      'Processed By':   r.reimbursed_by_name || '',
      'Payment Ref':    r.reimbursement_reference || '',
      'Note':           r.reimbursement_note || '',
    }));
    const by = (st: string) => parseFloat(mapped.filter((r) => r.Status === st).reduce((s, r) => s + r.Amount, 0).toFixed(2));
    const money = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return {
      title: 'Reimbursement Register',
      columns: ['Employee', 'Employee ID', 'Reference', 'Category', 'Description', 'Expense Date', 'Amount', 'Status', 'Reimbursed On', 'Processed By', 'Payment Ref', 'Note'],
      rows: mapped,
      totals: { Amount: parseFloat((by('Paid') + by('On Hold') + by('Pending')).toFixed(2)) },
      note: `Paid ${money(by('Paid'))}, still to pay ${money(by('Pending') + by('On Hold'))} (pending ${money(by('Pending'))}, on hold ${money(by('On Hold'))}). The period is the date the claim was paid, or the expense date while it is still open.`,
    };
  }

  // GST we charged clients (from issued invoices) against GST we can claim back on approved expenses, month by month
  private async gstPosition(dateFrom?: Date, dateTo?: Date) {
    const r2 = ReportingService.r2;
    const invoices = await this.prisma.invoice.findMany({
      where: { status: { in: ['ISSUED', 'PART_PAID', 'PAID'] }, ...(dateFrom || dateTo ? { invoiceDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}) },
      select: { invoiceDate: true, cgst: true, sgst: true, igst: true },
    });
    const { clause, params } = this.whereParts(null, dateFrom, dateTo);
    const input = await this.prisma.$queryRawUnsafe<{ yr: number; mo: number; gst: number }[]>(`
      SELECT EXTRACT(YEAR FROM p.date_recorded)::int AS yr, EXTRACT(MONTH FROM p.date_recorded)::int AS mo, SUM(p.total - p.net)::float AS gst
      FROM ${this.PARTS}
      WHERE p.is_claimable = true AND p.type = 'expense' AND p.status IN ${countableStatusSql}${clause}
      GROUP BY yr, mo
    `, ...params);
    const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
    const map: Record<string, { out: number; inn: number }> = {};
    const slot = (k: string) => (map[k] ??= { out: 0, inn: 0 });
    for (const i of invoices) slot(key(i.invoiceDate.getUTCFullYear(), i.invoiceDate.getUTCMonth() + 1)).out += Number(i.cgst) + Number(i.sgst) + Number(i.igst);
    for (const r of input) slot(key(r.yr, r.mo)).inn += Number(r.gst);
    const keys = Object.keys(map).sort();
    const first = dateFrom ?? (keys.length ? new Date(`${keys[0]}-01T00:00:00Z`) : null);
    const last = dateTo ?? (keys.length ? new Date(`${keys[keys.length - 1]}-01T00:00:00Z`) : null);
    if (first && last) {
      let y = first.getUTCFullYear(); let m = first.getUTCMonth() + 1;
      const endKey = last.getUTCFullYear() * 12 + last.getUTCMonth();
      for (let guard = 0; y * 12 + (m - 1) <= endKey && guard < 600; guard++) { slot(key(y, m)); m++; if (m > 12) { m = 1; y++; } }
    }
    const rows = Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
      Month: k, 'Output GST': r2(v.out), 'Input GST': r2(v.inn), 'Net Payable': r2(v.out - v.inn),
    }));
    const sum = (k: 'Output GST' | 'Input GST') => r2(rows.reduce((a, r) => a + r[k], 0));
    return {
      title: 'GST Position',
      columns: ['Month', 'Output GST', 'Input GST', 'Net Payable'],
      rows,
      totals: { 'Output GST': sum('Output GST'), 'Input GST': sum('Input GST'), 'Net Payable': r2(sum('Output GST') - sum('Input GST')) },
      note: 'Output GST is the CGST, SGST and IGST on invoices issued in the month. Input GST is the GST on approved expenses marked claimable, so it is an estimate: suppliers are not recorded, so it is not matched to their returns. A negative Net Payable is a credit.',
    };
  }

  // What each project has been billed, against its contract and its client POs
  private async projectBilling() {
    const r2 = ReportingService.r2;
    const [projects, invoices, pos] = await Promise.all([
      this.prisma.project.findMany({ select: { id: true, name: true, status: true, contractValue: true, client: { select: { name: true } } } }),
      this.prisma.invoice.findMany({
        where: { status: { in: ['ISSUED', 'PART_PAID', 'PAID'] }, OR: [{ projectId: { not: null } }, { po: { projectId: { not: null } } }] },
        select: { projectId: true, taxable: true, total: true, paid: true, tds: true, po: { select: { projectId: true } } },
      }),
      this.prisma.clientPo.findMany({ where: { status: { not: 'CANCELLED' }, projectId: { not: null } }, select: { projectId: true, value: true } }),
    ]);
    const billed = new Map<number, { taxable: number; received: number; due: number }>();
    for (const i of invoices) {
      const pid = i.projectId ?? i.po?.projectId;
      if (pid == null) continue;
      const e = billed.get(pid) ?? { taxable: 0, received: 0, due: 0 };
      e.taxable += Number(i.taxable); e.received += Number(i.paid) + Number(i.tds); e.due += Number(i.total) - Number(i.paid) - Number(i.tds);
      billed.set(pid, e);
    }
    const poValue = new Map<number, number>();
    for (const p of pos) poValue.set(p.projectId!, (poValue.get(p.projectId!) ?? 0) + Number(p.value));
    const rows = projects.filter((p) => p.contractValue != null || billed.has(p.id) || poValue.has(p.id)).map((p) => {
      const contract = p.contractValue == null ? null : Number(p.contractValue);
      const b = billed.get(p.id);
      const taxable = r2(b?.taxable ?? 0);
      return {
        Project: p.name, Client: p.client?.name ?? '', Status: p.status ?? '', 'Contract Value': contract, 'Client PO Value': poValue.has(p.id) ? r2(poValue.get(p.id)!) : null,
        Invoiced: taxable, '% Billed': contract && contract > 0 ? r2((taxable / contract) * 100) : null, Unbilled: contract != null ? r2(contract - taxable) : null,
        Received: r2(b?.received ?? 0), Outstanding: r2(b?.due ?? 0), _projectId: p.id,
      };
    }).sort((a, b) => b.Outstanding - a.Outstanding || a.Project.localeCompare(b.Project));
    const sum = (k: 'Contract Value' | 'Client PO Value' | 'Invoiced' | 'Unbilled' | 'Received' | 'Outstanding') => r2(rows.reduce((a, r) => a + (r[k] ?? 0), 0));
    return {
      title: 'Project Billing',
      columns: ['Project', 'Client', 'Status', 'Contract Value', 'Client PO Value', 'Invoiced', '% Billed', 'Unbilled', 'Received', 'Outstanding'],
      rows,
      totals: { 'Contract Value': sum('Contract Value'), 'Client PO Value': sum('Client PO Value'), Invoiced: sum('Invoiced'), Unbilled: sum('Unbilled'), Received: sum('Received'), Outstanding: sum('Outstanding') },
      note: 'Invoiced is the taxable value of issued invoices, so % Billed and Unbilled compare it with the contract value before GST. Received includes tax deducted at source. Outstanding is what clients still owe on those invoices, GST included.',
    };
  }

  // Claims still to pay, one line per employee, oldest first
  private async outstandingReimbursements(userIds: number[] | null) {
    const params: any[] = [];
    let userClause = '';
    if (userIds !== null) { params.push(userIds); userClause = ` AND t.user_id = ANY($${params.length}::int[])`; }
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT u.username AS employee, (10000 + t.user_id) AS employee_num,
        COUNT(*)::int AS claims,
        ROUND(SUM(CASE WHEN t.reimbursement_status IS DISTINCT FROM 'ON_HOLD' THEN COALESCE(t.total_amount, t.amount) ELSE 0 END)::numeric, 2)::float AS pending,
        ROUND(SUM(CASE WHEN t.reimbursement_status = 'ON_HOLD' THEN COALESCE(t.total_amount, t.amount) ELSE 0 END)::numeric, 2)::float AS on_hold,
        ROUND(SUM(COALESCE(t.total_amount, t.amount))::numeric, 2)::float AS outstanding,
        MIN(t.date_recorded) AS oldest
      FROM transactions t LEFT JOIN users u ON u.id = t.user_id
      WHERE t.type = 'expense' AND t.needs_reimbursement = true AND t.status = 'APPROVED' AND t.reimbursement_status IS DISTINCT FROM 'PAID'${userClause}
      GROUP BY t.user_id, u.username
      ORDER BY MIN(t.date_recorded) ASC
    `, ...params);
    const r2 = ReportingService.r2;
    const today = Date.now();
    const mapped = rows.map((r) => ({
      Employee: r.employee || 'Unknown', 'Employee ID': `NT${r.employee_num}`, Claims: r.claims, Pending: r2(Number(r.pending)), 'On Hold': r2(Number(r.on_hold)), Outstanding: r2(Number(r.outstanding)),
      'Oldest Claim': ReportingService.iso(new Date(r.oldest)), 'Days Waiting': Math.max(0, workingDaysBetween(new Date(r.oldest), new Date(today))),
    }));
    const sum = (k: 'Claims' | 'Pending' | 'On Hold' | 'Outstanding') => r2(mapped.reduce((a, r) => a + r[k], 0));
    return {
      title: 'Outstanding Reimbursements',
      columns: ['Employee', 'Employee ID', 'Claims', 'Pending', 'On Hold', 'Outstanding', 'Oldest Claim', 'Days Waiting'],
      rows: mapped,
      totals: { Claims: sum('Claims'), Pending: sum('Pending'), 'On Hold': sum('On Hold'), Outstanding: sum('Outstanding') },
      note: 'Approved claims not yet paid, as of today, so it takes no period. Days Waiting counts from the oldest expense date. The people with the longest wait are listed first.',
    };
  }

  private async clientRows(userId: number[] | null, dateFrom: Date | undefined, dateTo: Date | undefined, categoryType: string | undefined, txnType: 'income' | 'expense' | undefined, filters: ReportFilters) {
    const { clause, params } = this.whereParts(userId, dateFrom, dateTo, filters);
    let extra = '';
    if (txnType === 'income' || txnType === 'expense') { params.push(txnType); extra += ` AND p.type = $${params.length}`; }
    if (categoryType === 'project') extra += ' AND p.project_id IS NOT NULL';
    else if (categoryType === 'product') extra += ' AND p.product_id IS NOT NULL';
    // Money with no client (overhead) is listed under "No client", not dropped
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT cl.id AS client_id, c.id AS category_id, COALESCE(cl.name, 'No client') AS client, c.name AS category, p.type AS type,
             COUNT(DISTINCT p.txn_id)::int AS transactions, ROUND(SUM(p.total)::numeric, 2)::float AS amount
      FROM ${this.PARTS}
      LEFT JOIN clients cl ON cl.id = p.client_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status IN ${countableStatusSql}${clause}${extra}
      GROUP BY cl.id, cl.name, c.id, c.name, p.type
      ORDER BY amount DESC
    `, ...params);
  }

  private async clientSummary(
    userId: number[] | null,
    dateFrom?: Date,
    dateTo?: Date,
    categoryType?: string,
    txnType?: 'income' | 'expense',
    filters: ReportFilters = {},
    compare = false,
  ) {
    // Actuals only. A split transaction counts under each part's client and category.
    // With no type chosen, income and expense are listed apart, because adding them together means nothing.
    const oneType = txnType === 'income' || txnType === 'expense';
    const rows = await this.clientRows(userId, dateFrom, dateTo, categoryType, txnType, filters);
    const prevRange = compare ? this.previousRange(dateFrom, dateTo) : null;
    const prevRows = prevRange ? await this.clientRows(userId, prevRange.from, prevRange.to, categoryType, txnType, filters) : [];
    const k = (r: any) => `${r.client_id ?? 'none'}|${r.category_id ?? 'none'}|${r.type}`;
    const prevBy = new Map(prevRows.map((r) => [k(r), Number(r.amount)]));
    const merged = [...rows, ...prevRows.filter((r) => !rows.some((c) => k(c) === k(r))).map((r) => ({ ...r, transactions: 0, amount: 0 }))];

    const r2 = ReportingService.r2;
    const sumOf = (t?: string) => r2(rows.filter((r) => !t || r.type === t).reduce((a, r) => a + Number(r.amount), 0));
    const typeLabel = txnType ? ` (${txnType})` : '';
    const catLabel = categoryType && categoryType !== 'all' ? ` · ${categoryType}s` : '';
    const money = ReportingService.money;
    const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
    const prevTotal = r2(merged.reduce((a, r) => a + (prevBy.get(k(r)) ?? 0), 0));

    return {
      title: `Client Summary${typeLabel}${catLabel}`,
      columns: ['Client', 'Category', ...(oneType ? [] : ['Type']), 'Transactions', 'Amount', ...(prevRange ? ['Previous', 'Change %'] : [])],
      rows: merged.map((r) => {
        const prev = prevBy.get(k(r)) ?? 0;
        return {
          Client: r.client,
          Category: r.category || 'Uncategorized',
          ...(oneType ? {} : { Type: cap(r.type) }),
          Transactions: r.transactions,
          Amount: r2(Number(r.amount)),
          ...(prevRange ? { Previous: r2(prev), 'Change %': ReportingService.change(Number(r.amount), prev) } : {}),
          _clientId: r.client_id ?? null, _categoryId: r.category_id ?? null, _type: r.type,
        };
      }),
      totals: oneType ? { Amount: sumOf(), ...(prevRange ? { Previous: prevTotal, 'Change %': ReportingService.change(sumOf(), prevTotal) } : {}) } : {},
      note: (oneType ? '' : `Income ${money(sumOf('income'))} and expense ${money(sumOf('expense'))} are listed apart. Choose a transaction type to get a single total.`)
        + (prevRange ? `${oneType ? '' : ' '}Previous is the same amount for ${ReportingService.iso(prevRange.from)} to ${ReportingService.iso(prevRange.to)}.` : compare ? `${oneType ? '' : ' '}Choose a start and end date to compare with the period before.` : '') || undefined,
    };
  }
}
