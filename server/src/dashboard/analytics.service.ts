import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetPlanningService } from '../budgets/budget-planning.service';
import { BuildOrdersService } from '../budgets/build-orders.service';
import { InvoicingService } from '../invoicing/invoicing.service';
import { DashboardService } from './dashboard.service';
import { COMMITTED_STATUSES } from '../common/constants/transaction-status';
import { parseRange } from '../common/helpers/dates';

const DAY = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const n = (v: unknown) => (v == null ? 0 : Number(v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const todayUtc = () => { const t = new Date(); return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())); };
const dayOf = (d: Date | string) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()); };
const monthKey = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
const monthLabel = (k: number) => `${MON[k % 12]} ${String(Math.floor(k / 12)).slice(2)}`;
const OPEN = ['COMMITTED', 'RELEASED', 'IN_BUILD'];

// Figures for the Analytics tabs that are not about plain spend: project margins, order delivery, people, receivables and part prices.
// Each one is worked out on request from records that already exist; nothing here is stored.
@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private planning: BudgetPlanningService,
    private orders: BuildOrdersService,
    private invoicing: InvoicingService,
    private dashboard: DashboardService,
  ) {}

  // The last twelve month keys up to and including this month, oldest first
  private lastMonths(count = 12) {
    const now = todayUtc(); const end = monthKey(now);
    return Array.from({ length: count }, (_, i) => end - (count - 1 - i));
  }

  // ── Projects: price, estimate and margin ─────────────────────────────────

  async projectProfitability() {
    const list = await this.planning.projects();
    const ids = list.map((p: any) => p.id);
    const invoices = ids.length ? await this.prisma.invoice.findMany({
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, OR: [{ projectId: { in: ids } }, { po: { projectId: { in: ids } } }] },
      select: { projectId: true, taxable: true, paid: true, tds: true, po: { select: { projectId: true } } },
    }) : [];
    const billed = new Map<number, { invoiced: number; received: number }>();
    for (const i of invoices) {
      const pid = i.projectId ?? i.po?.projectId;
      if (pid == null) continue;
      const e = billed.get(pid) ?? { invoiced: 0, received: 0 };
      e.invoiced += n(i.taxable); e.received += n(i.paid) + n(i.tds); billed.set(pid, e);
    }
    const rows = list.map((p: any) => {
      const margin = p.projected_margin_pct as number | null;
      const state = margin == null ? 'No price or estimate'
        : margin < 0 || (p.min_margin_pct != null && margin < p.min_margin_pct) ? 'Below minimum'
        : p.target_margin_pct != null && margin < p.target_margin_pct ? 'Below target' : 'On target';
      const b = billed.get(p.id) ?? { invoiced: 0, received: 0 };
      return {
        id: p.id, code: p.code, name: p.name, client_name: p.client_name, contract_value: p.contract_value, estimate_total: p.estimate_total,
        profit: p.contract_value != null && p.estimate_total != null ? r2(p.contract_value - p.estimate_total) : null,
        margin_pct: margin, target_margin_pct: p.target_margin_pct, min_margin_pct: p.min_margin_pct, state,
        spent: p.actual, spent_pct: p.estimate_total ? r2((p.actual / p.estimate_total) * 100) : null,
        invoiced: r2(b.invoiced), invoiced_pct: p.contract_value ? r2((b.invoiced / p.contract_value) * 100) : null, received: r2(b.received),
      };
    }).sort((a: any, b: any) => (a.margin_pct ?? 1e9) - (b.margin_pct ?? 1e9));
    const priced = rows.filter((r: any) => r.contract_value != null && r.estimate_total != null);
    const contract = priced.reduce((a: number, r: any) => a + r.contract_value, 0);
    const estimate = priced.reduce((a: number, r: any) => a + r.estimate_total, 0);
    return {
      rows,
      totals: {
        projects: rows.length, priced: priced.length, contract_value: r2(contract), estimate_total: r2(estimate), profit: r2(contract - estimate),
        margin_pct: contract > 0 ? r2(((contract - estimate) / contract) * 100) : null,
        below_minimum: rows.filter((r: any) => r.state === 'Below minimum').length, below_target: rows.filter((r: any) => r.state === 'Below target').length,
        spent: r2(rows.reduce((a: number, r: any) => a + r.spent, 0)), invoiced: r2(rows.reduce((a: number, r: any) => a + r.invoiced, 0)),
      },
    };
  }

  // ── Orders: delivered on time, late, or at risk ──────────────────────────

  async orderDelivery() {
    const all = (await this.orders.list()).filter((o: any) => o.status !== 'CANCELLED');
    const today = dayOf(todayUtc());
    const delivered = all.filter((o: any) => o.status === 'DELIVERED' && o.delivered_on);
    const lateBy = (o: any) => Math.round((dayOf(o.delivered_on) - dayOf(o.delivery_date)) / DAY);
    const onTime = delivered.filter((o: any) => lateBy(o) <= 0);
    const lateOnes = delivered.filter((o: any) => lateBy(o) > 0);
    const open = all.filter((o: any) => OPEN.includes(o.status));
    const atRisk = open.map((o: any) => {
      const overdue = dayOf(o.delivery_date) < today;
      const short = o.late && o.earliest_delivery ? Math.round((dayOf(o.earliest_delivery) - dayOf(o.delivery_date)) / DAY) : 0;
      return { o, overdue, short };
    }).filter((x: any) => x.overdue || x.short > 0)
      .map(({ o, overdue, short }: any) => ({
        id: o.id, code: o.code, client_name: o.client_name, product_name: o.product_name, status: o.status, quantity: o.quantity,
        delivery_date: o.delivery_date, earliest_delivery: o.earliest_delivery,
        reason: overdue ? 'Past the promised date' : 'Parts and build cannot make the date',
        days: overdue ? Math.round((today - dayOf(o.delivery_date)) / DAY) : short,
      }))
      .sort((a: any, b: any) => b.days - a.days);

    const months = this.lastMonths(12).map((k) => {
      const inMonth = delivered.filter((o: any) => monthKey(new Date(o.delivered_on)) === k);
      return { label: monthLabel(k), on_time: inMonth.filter((o: any) => lateBy(o) <= 0).length, late: inMonth.filter((o: any) => lateBy(o) > 0).length };
    });
    const byProduct = new Map<string, { product_name: string; delivered: number; late: number; open: number; at_risk: number }>();
    const slot = (name: string) => { const e = byProduct.get(name) ?? { product_name: name, delivered: 0, late: 0, open: 0, at_risk: 0 }; byProduct.set(name, e); return e; };
    for (const o of delivered as any[]) { const e = slot(o.product_name ?? 'Unknown'); e.delivered++; if (lateBy(o) > 0) e.late++; }
    for (const o of open as any[]) slot(o.product_name ?? 'Unknown').open++;
    for (const r of atRisk) slot(all.find((o: any) => o.id === r.id)?.product_name ?? 'Unknown').at_risk++;

    return {
      kpis: {
        delivered: delivered.length, on_time: onTime.length, on_time_pct: delivered.length ? r2((onTime.length / delivered.length) * 100) : null,
        avg_days_late: lateOnes.length ? r2(lateOnes.reduce((a: number, o: any) => a + lateBy(o), 0) / lateOnes.length) : null,
        open: open.length, at_risk: atRisk.length,
      },
      months, products: [...byProduct.values()].sort((a, b) => (b.late + b.at_risk) - (a.late + a.at_risk) || b.delivered - a.delivered).slice(0, 10), at_risk: atRisk,
    };
  }

  // ── People: who spends, and how much is still waiting ────────────────────

  async spendingByPerson(userId: number, roleName: string, dateFrom?: string, dateTo?: string) {
    parseRange(dateFrom, dateTo);
    const visible = await this.dashboard.visibleUserIds(userId, roleName);
    const where: any = { type: 'expense', status: { in: COMMITTED_STATUSES } };
    if (visible !== null) where.userId = { in: visible };
    if (dateFrom || dateTo) where.dateRecorded = { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) };
    const groups = await this.prisma.transaction.groupBy({ by: ['userId', 'status'], where, _sum: { amount: true }, _count: true, _max: { amount: true, dateRecorded: true } });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(groups.map((g) => g.userId))] } }, select: { id: true, username: true, department: true } });
    const info = new Map(users.map((u) => [u.id, u]));
    const by = new Map<number, { approved: number; waiting: number; count: number; largest: number; last: Date | null }>();
    for (const g of groups) {
      const e = by.get(g.userId) ?? { approved: 0, waiting: 0, count: 0, largest: 0, last: null };
      const amt = n(g._sum.amount);
      if (g.status === 'APPROVED') e.approved += amt; else e.waiting += amt;
      e.count += g._count; e.largest = Math.max(e.largest, n(g._max.amount));
      if (g._max.dateRecorded && (!e.last || g._max.dateRecorded > e.last)) e.last = g._max.dateRecorded;
      by.set(g.userId, e);
    }
    const grand = [...by.values()].reduce((a, e) => a + e.approved + e.waiting, 0);
    const people = [...by.entries()].map(([id, e]) => {
      const total = e.approved + e.waiting;
      return {
        user_id: id, username: info.get(id)?.username ?? 'Unknown', department: info.get(id)?.department || 'No department',
        approved: r2(e.approved), waiting: r2(e.waiting), total: r2(total), count: e.count, average: e.count ? r2(total / e.count) : 0,
        largest: r2(e.largest), last_date: e.last, share_pct: grand > 0 ? r2((total / grand) * 100) : 0,
      };
    }).sort((a, b) => b.total - a.total);
    const dep = new Map<string, { department: string; people: number; total: number; waiting: number }>();
    for (const p of people) {
      const e = dep.get(p.department) ?? { department: p.department, people: 0, total: 0, waiting: 0 };
      e.people++; e.total += p.total; e.waiting += p.waiting; dep.set(p.department, e);
    }
    return {
      people: people.slice(0, 50),
      departments: [...dep.values()].map((d) => ({ ...d, total: r2(d.total), waiting: r2(d.waiting) })).sort((a, b) => b.total - a.total),
      totals: { people: people.length, total: r2(grand), waiting: r2(people.reduce((a, p) => a + p.waiting, 0)), count: people.reduce((a, p) => a + p.count, 0) },
    };
  }

  // ── Receivables: what clients owe, how old it is, what came in ───────────

  async receivables() {
    const ageing = await this.invoicing.ageingReport();
    const t: any = ageing.totals;
    const buckets = ['Not Due', '1-30 Days', '31-60 Days', '61-90 Days', 'Over 90 Days'].map((label) => ({ label, amount: n(t[label]) }));
    const months = this.lastMonths(12);
    const from = new Date(Date.UTC(Math.floor(months[0] / 12), months[0] % 12, 1));
    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({ where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, invoiceDate: { gte: from } }, select: { invoiceDate: true, total: true } }),
      this.prisma.invoicePayment.findMany({ where: { paidOn: { gte: from } }, select: { paidOn: true, amount: true } }),
    ]);
    const monthly = months.map((k) => ({
      label: monthLabel(k),
      billed: r2(invoices.filter((i) => monthKey(i.invoiceDate) === k).reduce((a, i) => a + n(i.total), 0)),
      received: r2(payments.filter((p) => monthKey(p.paidOn) === k).reduce((a, p) => a + n(p.amount), 0)),
    }));
    const outstanding = n(t.Outstanding);
    return {
      buckets, outstanding, overdue: r2(outstanding - n(t['Not Due'])), invoices: n(t.Invoices),
      clients: (ageing.rows as any[]).slice(0, 8).map((r) => ({
        client: r.Client, invoices: r.Invoices, outstanding: r.Outstanding, overdue: r2(r.Outstanding - r['Not Due']), oldest_bucket: r['Over 90 Days'] > 0 ? 'Over 90 days' : r['61-90 Days'] > 0 ? '61-90 days' : r['31-60 Days'] > 0 ? '31-60 days' : r['1-30 Days'] > 0 ? '1-30 days' : 'Not due',
      })),
      monthly,
    };
  }

  // ── Part prices: how what we pay has moved ───────────────────────────────

  async partPrices(dateFrom?: string, dateTo?: string) {
    parseRange(dateFrom, dateTo);
    const logs = await this.prisma.itemPriceLog.findMany({
      where: { ...(dateFrom || dateTo ? { paidOn: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } } : {}), item: { isActive: true } },
      orderBy: [{ paidOn: 'asc' }, { id: 'asc' }],
      select: { itemId: true, price: true, paidOn: true, supplier: true, item: { select: { partNo: true, name: true, standardPrice: true, supplier: true } } },
    });
    const by = new Map<number, typeof logs>();
    for (const l of logs) by.set(l.itemId, [...(by.get(l.itemId) ?? []), l]);
    const rows = [...by.values()].map((ls) => {
      const first = n(ls[0].price); const last = ls[ls.length - 1]; const latest = n(last.price); const std = n(last.item.standardPrice);
      return {
        item_id: last.itemId, part_no: last.item.partNo, name: last.item.name, supplier: last.supplier ?? last.item.supplier ?? null,
        purchases: ls.length, first_price: r2(first), latest_price: r2(latest), standard_price: r2(std),
        change_pct: ls.length > 1 && first > 0 ? r2(((latest - first) / first) * 100) : null,
        vs_standard_pct: std > 0 ? r2(((latest - std) / std) * 100) : null,
        latest_date: last.paidOn, series: ls.slice(-12).map((x) => ({ date: x.paidOn, price: n(x.price) })),
      };
    }).sort((a, b) => Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0) || b.purchases - a.purchases);
    const moved = rows.filter((r) => r.change_pct != null);
    const up = moved.filter((r) => (r.change_pct as number) > 0.5); const down = moved.filter((r) => (r.change_pct as number) < -0.5);
    return {
      rows: rows.slice(0, 30),
      totals: {
        parts: rows.length, tracked: moved.length, up: up.length, down: down.length, steady: moved.length - up.length - down.length,
        avg_change_pct: moved.length ? r2(moved.reduce((a, r) => a + (r.change_pct as number), 0) / moved.length) : null,
        above_standard: rows.filter((r) => (r.vs_standard_pct ?? 0) > 0.5).length,
      },
    };
  }
}
