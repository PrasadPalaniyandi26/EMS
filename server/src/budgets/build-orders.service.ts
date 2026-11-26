import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BudgetsService } from './budgets.service';
import { BudgetPlanningService } from './budget-planning.service';
import { addWorkingDays, workingDaysBetween } from '../common/helpers/working-days';

const n = (v: any) => (v == null ? 0 : Number(v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const bad = (msg: string, code = HttpStatus.BAD_REQUEST) => new HttpException(msg, code);
type Actor = { id: number; username?: string; role_name?: string };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Build hours are spread over working days of this length. Every day count here (lead times, build, the window to delivery) is working days, Monday to Friday
const HOURS_PER_DAY = 8;
const DAY = 86400000;
// Orders in these states can still change their dates, quantity and parts
const OPEN = ['COMMITTED', 'RELEASED'];
// Orders whose money is still to be spent or received
const LIVE = ['COMMITTED', 'RELEASED', 'IN_BUILD'];
const PENDING = ['PENDING_MANAGER', 'PENDING_FINANCE'];

type LeadModel = { per: Map<number, { lead: number | null; sequence: number }>; steps: { sequence: number; lead: number; hours: number }[]; hours: number; missing: number; longest: number };

// A customer's commitment to have units of a standard product built and delivered:
// an imported, locked copy of the product BOM, a swap to an alternate as the only change, a check that the parts can arrive in time,
// when the money is spent and received, and what the order really cost.
@Injectable()
export class BuildOrdersService {
  constructor(private prisma: PrismaService, private budgets: BudgetsService, private planning: BudgetPlanningService, private audit: AuditService) {}

  private log(id: number, action: string, user: number | undefined, data: any, old?: any) {
    if (user == null) return;
    this.audit.log({ tableName: 'build_orders', recordId: id, action, changedBy: user, newValues: data, ...(old !== undefined ? { oldValues: old } : {}) }).catch(() => undefined);
  }

  private today() { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }

  private asDate(v: any, label: string) {
    const d = new Date(String(v).slice(0, 10));
    if (!v || isNaN(d.getTime())) throw bad(`Enter a valid date for ${label}.`);
    return d;
  }

  private days(from: Date, to: Date) { return workingDaysBetween(from, to); }
  private buildDays(hours: number) { return Math.ceil(hours / HOURS_PER_DAY); }

  // How long each part takes to arrive, step by step. A step is a sequence number: its parts are bought from the start of the order, and its work begins
  // once the previous step is built and its own parts have arrived.
  private async leadModel(bomId: number | null): Promise<LeadModel> {
    const per = new Map<number, { lead: number | null; sequence: number }>();
    if (!bomId) return { per, steps: [], hours: 0, missing: 0, longest: 0 };
    const [lines, ops] = await Promise.all([
      this.prisma.bomLine.findMany({ where: { bomId }, select: { id: true, itemId: true, sequence: true } }),
      this.prisma.bomOperation.findMany({ where: { bomId }, select: { hours: true, sequence: true } }),
    ]);
    const items = await this.prisma.item.findMany({ where: { id: { in: lines.map((l) => l.itemId).filter((x): x is number => x != null) } }, select: { id: true, leadTimeDays: true } });
    const leadOf = new Map(items.map((i) => [i.id, i.leadTimeDays]));
    const steps = new Map<number, { sequence: number; lead: number; hours: number }>();
    const step = (sequence: number) => { const s = steps.get(sequence) ?? { sequence, lead: 0, hours: 0 }; steps.set(sequence, s); return s; };
    let missing = 0;
    for (const l of lines) {
      const lt = l.itemId != null ? leadOf.get(l.itemId) ?? null : 0;
      per.set(l.id, { lead: lt, sequence: l.sequence });
      if (lt == null) missing++;
      const s = step(l.sequence); s.lead = Math.max(s.lead, lt ?? 0);
    }
    for (const o of ops) step(o.sequence).hours += n(o.hours);
    const ordered = [...steps.values()].sort((a, b) => a.sequence - b.sequence);
    return { per, steps: ordered, hours: ops.reduce((a, o) => a + n(o.hours), 0), missing, longest: ordered.reduce((m, s) => Math.max(m, s.lead), 0) };
  }

  // Can the parts arrive and the unit be built between the start and the promised delivery?
  // Each step starts when its parts have arrived and the step before it is built, so the earliest delivery is when the last step is built.
  private leadCheck(model: LeadModel, qty: number, start: Date, delivery: Date) {
    const window = this.days(start, delivery);
    let finish = 0; let build = 0;
    const stages = model.steps.map((s) => {
      const days = this.buildDays(s.hours * qty);
      const begins = Math.max(finish, s.lead);
      finish = begins + days; build += days;
      return { sequence: s.sequence, lead_days: s.lead, begins_day: begins, build_days: days, finish_day: finish };
    });
    return { window_days: window, longest_lead_days: model.longest, assembly_days: build, needed_days: finish, late: finish > window, earliest_delivery: addWorkingDays(start, finish), missing_lead_time: model.missing, stages };
  }

  // The build plan for the month the order starts in: what was planned, what orders have taken and what is left
  private async planCheck(productId: number, start: Date) {
    const year = start.getUTCFullYear(); const month = start.getUTCMonth() + 1;
    const [plan, orders] = await Promise.all([
      this.prisma.productionPlan.findUnique({ where: { productId_year_month: { productId, year, month } } }),
      this.prisma.buildOrder.findMany({ where: { productId, status: { not: 'CANCELLED' }, startDate: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } }, select: { quantity: true } }),
    ]);
    const planned = plan?.plannedUnits ?? 0;
    const taken = orders.reduce((a, o) => a + o.quantity, 0);
    return { year, month, planned, taken, open: planned - taken, over: taken > planned };
  }

  private async currentFyPrice(productId: number, on: Date) {
    const s = await this.budgets.getSettings();
    const row = await this.prisma.productPrice.findUnique({ where: { productId_fy: { productId, fy: this.budgets.fyOf(on, s.fyStartMonth) } } });
    return row?.price == null ? null : n(row.price);
  }

  async options() {
    const [products, clients] = await Promise.all([
      this.prisma.product.findMany({ where: { isActive: true, isSystem: false }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, standardCost: true } }),
      this.prisma.client.findMany({ where: { isActive: true, isSystem: false }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    const boms = await this.prisma.bom.findMany({ where: { productId: { not: null } }, orderBy: { version: 'desc' }, select: { productId: true, version: true, _count: { select: { lines: true } } } });
    const withBom = new Set(boms.filter((b) => b._count.lines > 0).map((b) => b.productId));
    return {
      products: products.map((p) => ({ id: p.id, code: p.code, name: p.name, standard_cost: p.standardCost == null ? null : n(p.standardCost), has_bom: withBom.has(p.id), bom_version: boms.find((b) => b.productId === p.id)?.version ?? null })),
      clients,
    };
  }

  // What the product already says about a new order for it: price and margin goals for the year the order starts in, cost, the customer it belongs to,
  // and when it could be delivered given how long its parts take. The Add order dialog starts from these and the user changes what they like.
  async defaults(productId: number, quantity: number, startDate?: string) {
    const product = Number.isInteger(productId) ? await this.prisma.product.findFirst({ where: { id: productId, isActive: true, isSystem: false }, include: { client: { select: { id: true, name: true, isSystem: true, isActive: true } } } }) : null;
    if (!product) throw bad('Choose the product.');
    const start = startDate ? this.asDate(startDate, 'the start') : this.today();
    const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
    const s = await this.budgets.getSettings();
    const fy = this.budgets.fyOf(start, s.fyStartMonth);
    await this.planning.applyDueReplacements();
    const [priceRow, std, bom] = await Promise.all([
      this.prisma.productPrice.findUnique({ where: { productId_fy: { productId, fy } } }),
      this.prisma.standardCost.findFirst({ where: { productId, status: 'APPROVED' }, orderBy: { id: 'desc' } }),
      this.prisma.bom.findFirst({ where: { productId }, orderBy: { version: 'desc' }, include: { _count: { select: { lines: true } } } }),
    ]);
    const hasBom = !!bom && bom._count.lines > 0;
    const roll = hasBom ? await this.planning.rollup(bom!.id) : null;
    const model = hasBom ? await this.leadModel(bom!.id) : null;
    const lead = model ? this.leadCheck(model, qty, start, new Date(start.getTime() + DAY)) : null;
    const customer = product.client && product.client.isActive && !product.client.isSystem ? product.client : null;
    return {
      product_id: product.id, client_id: customer?.id ?? null, client_name: customer?.name ?? null,
      fy, unit_price: priceRow?.price == null ? null : n(priceRow.price),
      target_margin_pct: priceRow?.targetMarginPct == null ? null : n(priceRow.targetMarginPct), min_margin_pct: priceRow?.minMarginPct == null ? null : n(priceRow.minMarginPct),
      standard_cost: std ? n(std.total) : null, unit_cost: roll ? roll.cost.total : null,
      has_bom: hasBom, bom_version: bom?.version ?? null, bom_lines: bom?._count.lines ?? 0,
      longest_lead_days: lead?.longest_lead_days ?? null, assembly_days: lead?.assembly_days ?? null, missing_lead_time: lead?.missing_lead_time ?? 0,
      suggested_delivery: lead ? addWorkingDays(start, lead.needed_days).toISOString().slice(0, 10) : null,
    };
  }

  // The orders an expense for this product can be charged to: every order that is not cancelled, delivered ones included for late invoices
  async forExpense(productId: number) {
    if (!Number.isInteger(productId)) return [];
    const rows = await this.prisma.buildOrder.findMany({ where: { productId, status: { not: 'CANCELLED' } }, orderBy: [{ startDate: 'desc' }, { id: 'desc' }], include: { client: { select: { name: true } } } });
    return rows.map((o) => ({ id: o.id, code: o.code, client_name: o.client?.name ?? null, quantity: o.quantity, status: o.status, customer_po: o.customerPo }));
  }

  private async orderBom(orderId: number) {
    return this.prisma.bom.findFirst({ where: { buildOrderId: orderId }, orderBy: { version: 'desc' } });
  }

  private shape(o: any, extra: any = {}) {
    const unitCost = o.unitCost == null ? null : n(o.unitCost);
    const price = o.unitPrice == null ? null : n(o.unitPrice);
    const std = o.sourceStandardCost == null ? null : n(o.sourceStandardCost);
    return {
      id: o.id, code: o.code, product_id: o.productId, product_code: o.product?.code ?? null, product_name: o.product?.name ?? null,
      client_id: o.clientId, client_name: o.client?.name ?? null, quantity: o.quantity, customer_po: o.customerPo, status: o.status,
      start_date: o.startDate, delivery_date: o.deliveryDate, delivered_on: o.deliveredOn, unit_price: price, notes: o.notes,
      source_bom_version: o.sourceBomVersion, source_standard_cost: std, imported_at: o.importedAt, unit_cost: unitCost, costed_at: o.costedAt, cancel_reason: o.cancelReason,
      total_cost: unitCost == null ? null : r2(unitCost * o.quantity), total_value: price == null ? null : r2(price * o.quantity),
      margin_pct: price != null && unitCost != null && price > 0 ? r2(((price - unitCost) / price) * 100) : null,
      vs_standard: unitCost != null && std != null ? r2(unitCost - std) : null,
      created_by_name: o.createdByName, created_at: o.createdAt,
      ...extra,
    };
  }

  async list() {
    const rows = await this.prisma.buildOrder.findMany({ orderBy: [{ startDate: 'desc' }, { id: 'desc' }], include: { product: { select: { code: true, name: true } }, client: { select: { name: true } } } });
    const boms = await this.prisma.bom.findMany({ where: { buildOrderId: { in: rows.map((r) => r.id) } }, select: { id: true, buildOrderId: true } });
    const out: any[] = [];
    for (const o of rows) {
      const bom = boms.find((b) => b.buildOrderId === o.id);
      let lead: any = null;
      if (bom && OPEN.includes(o.status)) lead = this.leadCheck(await this.leadModel(bom.id), o.quantity, o.startDate, o.deliveryDate);
      out.push(this.shape(o, { has_bom: !!bom, late: !!lead?.late, earliest_delivery: lead?.earliest_delivery ?? null }));
    }
    return out;
  }

  // When the order's money moves: each part when it arrives (start plus its lead time), the build itself while it is being assembled, and the sale at delivery.
  // Warranty is a provision, not cash, so it is left out.
  private schedule(o: any, roll: any, model: LeadModel, lead: ReturnType<BuildOrdersService['leadCheck']>) {
    const buckets = new Map<string, { year: number; month: number; materials: number; assembly: number; revenue: number }>();
    const put = (d: Date, k: 'materials' | 'assembly' | 'revenue', v: number) => {
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
      const b = buckets.get(key) ?? { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, materials: 0, assembly: 0, revenue: 0 };
      b[k] += v; buckets.set(key, b);
    };
    if (roll) {
      const freightPct = n(roll.bom.freight_pct) / 100;
      let scheduled = 0;
      for (const l of roll.lines) {
        const m = model.per.get(l.id);
        const perUnit = l.item_id != null ? l.amount * (1 + freightPct) : l.amount;
        scheduled += perUnit;
        put(addWorkingDays(o.startDate, m?.lead ?? 0), 'materials', perUnit * o.quantity);
      }
      // What is left of the unit cost is the order's own build: labour, overhead, fixed and outsourced work
      const rest = Math.max(0, roll.cost.total - roll.cost.warranty - scheduled) * o.quantity;
      // The build is spread over the days each step is being assembled; with no build days it falls on the day the last part arrives

      if (lead.assembly_days > 0) {
        for (const st of lead.stages) for (let i = 0; i < st.build_days; i++) put(addWorkingDays(o.startDate, st.begins_day + i), 'assembly', rest / lead.assembly_days);
      } else put(addWorkingDays(o.startDate, lead.needed_days), 'assembly', rest);
    }
    if (o.unitPrice != null) put(o.deliveredOn ?? o.deliveryDate, 'revenue', n(o.unitPrice) * o.quantity);
    return [...buckets.values()].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)).map((b) => ({
      year: b.year, month: b.month, label: `${MON[b.month - 1]} ${b.year}`, materials: r2(b.materials), assembly: r2(b.assembly), spend: r2(b.materials + b.assembly), revenue: r2(b.revenue),
    }));
  }

  // What was actually charged to the order, against what its BOM says it should cost
  private async actuals(o: any, roll: any) {
    const e200 = await this.prisma.categoryType.findFirst({ where: { code: 'E200' } });
    const [txns, bought, fromStock] = await Promise.all([
      this.prisma.transaction.findMany({ where: { buildOrderId: o.id, type: 'expense', NOT: { status: 'DELETED' } }, include: { category: { select: { name: true, typeId: true } } }, orderBy: [{ dateRecorded: 'desc' }, { id: 'desc' }] }),
      this.budgets.partsWhere({ status: 'APPROVED', buildOrderId: o.id }),
      this.budgets.stockParts({ kind: 'USED', buildOrderId: o.id }),
    ]);
    const parts = [...bought, ...fromStock];
    const approved = parts.reduce((a, p) => a + p.amount, 0);
    const approvedE200 = parts.filter((p) => e200 && p.typeId === e200.id).reduce((a, p) => a + p.amount, 0);
    const amountOf = (t: any) => n(t.totalAmount ?? t.amount);
    const waiting = txns.filter((t) => PENDING.includes(t.status ?? '')).reduce((a, t) => a + amountOf(t), 0);
    const c = roll?.cost;
    const expectedBought = c ? (c.material + c.scrap + c.freight + c.outsourced) * o.quantity : null;
    const labourStd = c ? (c.conversion - c.outsourced + c.overhead + c.fixed) * o.quantity : null;
    const priceEffect = roll ? roll.lines.reduce((a: number, l: any) => a + l.item_drift, 0) * o.quantity : 0;
    const spendVariance = expectedBought == null ? null : approvedE200 - expectedBought;
    const value = o.unitPrice == null ? null : n(o.unitPrice) * o.quantity;
    // The real margin only makes sense once everything has been spent, so it is shown for delivered orders
    const delivered = o.status === 'DELIVERED';
    const cost = approved + (labourStd ?? 0);
    return {
      stock_used: r2(fromStock.reduce((a, p) => a + p.amount, 0)),
      approved: r2(approved), approved_e200: r2(approvedE200), approved_other: r2(approved - approvedE200), waiting: r2(waiting), drafts: txns.filter((t) => ['DRAFT', 'SENT_BACK'].includes(t.status ?? '')).length,
      expected_bought: expectedBought == null ? null : r2(expectedBought), labour_at_standard: labourStd == null ? null : r2(labourStd),
      remaining: expectedBought == null ? null : r2(expectedBought - approvedE200),
      spend_variance: spendVariance == null ? null : r2(spendVariance), price_variance: r2(priceEffect), usage_variance: spendVariance == null ? null : r2(spendVariance - priceEffect),
      spent_pct: expectedBought && expectedBought > 0 ? r2((approvedE200 / expectedBought) * 100) : null,
      actual_cost: delivered && labourStd != null ? r2(cost) : null,
      actual_profit: delivered && value != null && labourStd != null ? r2(value - cost) : null,
      actual_margin_pct: delivered && value != null && value > 0 && labourStd != null ? r2(((value - cost) / value) * 100) : null,
      expenses: txns.map((t) => ({ id: t.id, reference_id: t.referenceId, date_recorded: t.dateRecorded, description: t.description, category_name: t.category?.name ?? null, is_e200: !!(e200 && t.category?.typeId === e200.id), amount: r2(amountOf(t)), status: t.status, submitted_by_name: t.submittedByName })),
    };
  }

  async get(id: number) {
    const o = await this.prisma.buildOrder.findUnique({ where: { id }, include: { product: { select: { code: true, name: true } }, client: { select: { name: true } } } });
    if (!o) throw bad('Order not found.', HttpStatus.NOT_FOUND);
    const bom = await this.orderBom(id);
    const roll = bom ? await this.planning.rollup(bom.id) : null;
    const rawLines = bom ? await this.prisma.bomLine.findMany({ where: { bomId: bom.id } }) : [];
    const itemIds = [...new Set(rawLines.flatMap((l) => [l.itemId, l.sourceItemId]).filter((x): x is number => x != null))];
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    const groups = [...new Set(items.map((i) => i.alternateGroupId).filter((x): x is number => x != null))];
    const members = groups.length ? await this.prisma.item.findMany({ where: { alternateGroupId: { in: groups }, isActive: true, status: 'ACTIVE', projectId: null }, orderBy: { partNo: 'asc' } }) : [];
    const itemOf = (x: number | null) => items.find((i) => i.id === x);
    const model = await this.leadModel(bom?.id ?? null);
    const lines = (roll?.lines ?? []).map((l: any) => {
      const raw = rawLines.find((x) => x.id === l.id);
      const cur = itemOf(raw?.itemId ?? null);
      const src = itemOf(raw?.sourceItemId ?? null);
      const per = n(raw?.quantity) * (1 + n(raw?.scrapPct) / 100);
      const alts = cur?.alternateGroupId == null ? [] : members.filter((m) => m.alternateGroupId === cur.alternateGroupId && m.id !== cur.id && m.uom === cur.uom).map((m) => ({
        id: m.id, part_no: m.partNo, name: m.name, supplier: m.supplier, standard_price: n(m.standardPrice), lead_time_days: m.leadTimeDays, is_default: m.isDefaultAlternate,
        cost_change: r2((n(m.standardPrice) - n(cur.standardPrice)) * per),
      }));
      return {
        ...l, lead_time_days: model.per.get(l.id)?.lead ?? null, supplier: cur?.supplier ?? null, part_status: cur?.status ?? null, swapped: !!(src && cur && src.id !== cur.id),
        source_item_id: src?.id ?? null, source_part_no: src?.partNo ?? null, source_name: src?.name ?? null, alternates: alts,
      };
    });
    const lead = this.leadCheck(model, o.quantity, o.startDate, o.deliveryDate);
    // A part must arrive early enough for its own step and every step after it to be built before the promised date
    const tailOf = (sequence: number) => lead.stages.filter((s) => s.sequence >= sequence).reduce((a, s) => a + s.build_days, 0);
    for (const l of lines) l.tail_days = tailOf(l.sequence);
    const lateLines = lines.filter((l: any) => l.item_id != null && (l.lead_time_days ?? 0) + l.tail_days > lead.window_days).map((l: any) => l.id);
    const live = roll ? roll.cost.total : null;
    // The product's price and margin goals for the year the order starts in, and the standard cost approved now, to compare the order with
    const s = await this.budgets.getSettings();
    const fy = this.budgets.fyOf(o.startDate, s.fyStartMonth);
    const [priceRow, std, latestBom] = await Promise.all([
      this.prisma.productPrice.findUnique({ where: { productId_fy: { productId: o.productId, fy } } }),
      this.prisma.standardCost.findFirst({ where: { productId: o.productId, status: 'APPROVED' }, orderBy: { id: 'desc' } }),
      this.prisma.bom.findFirst({ where: { productId: o.productId }, orderBy: { version: 'desc' }, select: { version: true } }),
    ]);
    // Things that moved on the product or the Part master since the BOM was copied, so the order can be brought up to date before it is released
    const stale = {
      bom_newer: latestBom && o.sourceBomVersion != null && latestBom.version > o.sourceBomVersion ? latestBom.version : null,
      standard_changed: !!(std && o.sourceBomVersion != null && (o.sourceStandardCost == null || Math.abs(n(std.total) - n(o.sourceStandardCost)) > 0.5)),
      ended_parts: lines.filter((l: any) => l.part_status && l.part_status !== 'ACTIVE').length,
    };
    return {
      ...this.shape(o, { has_bom: !!bom, bom_id: bom?.id ?? null }),
      editable: OPEN.includes(o.status),
      lines, operations: roll?.operations ?? [], cost: roll?.cost ?? null, bom_settings: roll?.bom ?? null, ...(await this.planning.operationChoices()),
      live_unit_cost: live, cost_drift: live != null && o.unitCost != null ? r2(live - n(o.unitCost)) : null,
      lead: { ...lead, late_lines: lateLines },
      plan: await this.planCheck(o.productId, o.startDate),
      stale,
      schedule: this.schedule(o, roll, model, lead),
      actuals: await this.actuals(o, roll),
      targets: { fy, list_price: priceRow?.price == null ? null : n(priceRow.price), target_margin_pct: priceRow?.targetMarginPct == null ? null : n(priceRow.targetMarginPct), min_margin_pct: priceRow?.minMarginPct == null ? null : n(priceRow.minMarginPct) },
      standard_now: std ? { fy: std.fy, total: n(std.total), material: n(std.material), scrap: n(std.scrap), freight: n(std.freight), conversion: n(std.conversion), outsourced: n(std.outsourced), fixed: n(std.fixed), overhead: n(std.overhead), warranty: n(std.warranty) } : null,
    };
  }

  // The money going out and coming in month by month for every live order, and how the material spend sits against the E200 budget of the products involved
  async cash() {
    const orders = await this.prisma.buildOrder.findMany({ where: { status: { in: LIVE } }, orderBy: { startDate: 'asc' }, include: { product: { select: { code: true, name: true } }, client: { select: { name: true } } } });
    const totals = new Map<string, { year: number; month: number; materials: number; assembly: number; revenue: number }>();
    let counted = 0; let late = 0;
    for (const o of orders) {
      const bom = await this.orderBom(o.id);
      if (!bom) continue;
      counted++;
      const roll = await this.planning.rollup(bom.id);
      const model = await this.leadModel(bom.id);
      const lead = this.leadCheck(model, o.quantity, o.startDate, o.deliveryDate);
      if (lead.late) late++;
      for (const m of this.schedule(o, roll, model, lead)) {
        const key = `${m.year}-${m.month}`;
        const t = totals.get(key) ?? { year: m.year, month: m.month, materials: 0, assembly: 0, revenue: 0 };
        t.materials += m.materials; t.assembly += m.assembly; t.revenue += m.revenue; totals.set(key, t);
      }
    }
    // A continuous run of months, so a quiet month still shows
    const keys = [...totals.values()].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
    const months: { year: number; month: number }[] = [];
    if (keys.length) {
      let ym = keys[0].year * 12 + keys[0].month - 1; const end = keys[keys.length - 1].year * 12 + keys[keys.length - 1].month - 1;
      while (ym <= end && months.length < 36) { months.push({ year: Math.floor(ym / 12), month: (ym % 12) + 1 }); ym++; }
    }
    const budget = await this.e200Budget([...new Set(orders.map((o) => o.productId))], months);
    let running = 0;
    return {
      orders: counted, late_orders: late,
      months: months.map((m) => {
        const t = totals.get(`${m.year}-${m.month}`) ?? { materials: 0, assembly: 0, revenue: 0 };
        const spend = t.materials + t.assembly; const net = t.revenue - spend; running += net;
        const b = budget.get(`${m.year}-${m.month}`) ?? null;
        return { year: m.year, month: m.month, label: `${MON[m.month - 1]} ${m.year}`, materials: r2(t.materials), assembly: r2(t.assembly), spend: r2(spend), revenue: r2(t.revenue), net: r2(net), cumulative: r2(running), budget_e200: b == null ? null : r2(b) };
      }),
    };
  }

  // The E200 (materials and production) budget set for these products in each month, from the budget plan of the year that month falls in
  private async e200Budget(productIds: number[], months: { year: number; month: number }[]) {
    const out = new Map<string, number>();
    const e200 = await this.prisma.categoryType.findFirst({ where: { code: 'E200' } });
    if (!e200 || !productIds.length || !months.length) return out;
    const s = await this.budgets.getSettings();
    const fys = [...new Set(months.map((m) => this.budgets.fyOf(new Date(m.year, m.month - 1, 1), s.fyStartMonth)))];
    for (const fy of fys) {
      const plan = await this.prisma.budgetPlan.findUnique({ where: { fy } });
      if (!plan) continue;
      const lines = await this.prisma.budgetLine.findMany({ where: { planId: plan.id, costObject: 'PRODUCT', productId: { in: productIds }, typeId: e200.id, isActive: true }, include: { periods: true } });
      for (const l of lines) for (const p of l.periods) { const k = `${p.year}-${p.month}`; out.set(k, (out.get(k) ?? 0) + n(p.amount)); }
    }
    return out;
  }

  private async validate(b: any, cur?: any) {
    const quantity = b.quantity === undefined ? cur.quantity : Number(b.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw bad('Enter a whole number of units, one or more.');
    const start = b.start_date === undefined ? cur.startDate : this.asDate(b.start_date, 'the start');
    const delivery = b.delivery_date === undefined ? cur.deliveryDate : this.asDate(b.delivery_date, 'the promised delivery');
    if (delivery.getTime() <= start.getTime()) throw bad('The promised delivery must be after the start.');
    let unitPrice: number | null = cur?.unitPrice == null ? null : n(cur.unitPrice);
    if (b.unit_price !== undefined) {
      if (b.unit_price === '' || b.unit_price === null) unitPrice = null;
      else { unitPrice = Number(b.unit_price); if (!(unitPrice > 0) || unitPrice > 99999999999) throw bad('Enter a selling price above zero.'); }
    }
    const clientId = b.client_id === undefined ? cur.clientId : Number(b.client_id);
    if (!Number.isInteger(clientId)) throw bad('Choose the customer.');
    if (!(await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) throw bad('Choose the customer.');
    const customerPo = b.customer_po === undefined ? cur?.customerPo ?? null : String(b.customer_po ?? '').trim().slice(0, 60) || null;
    const notes = b.notes === undefined ? cur?.notes ?? null : String(b.notes ?? '').trim().slice(0, 500) || null;
    return { quantity, startDate: start, deliveryDate: delivery, unitPrice, clientId, customerPo, notes };
  }

  async create(b: any, user: Actor) {
    const productId = Number(b.product_id);
    const product = Number.isInteger(productId) ? await this.prisma.product.findFirst({ where: { id: productId, isActive: true, isSystem: false }, select: { id: true } }) : null;
    if (!product) throw bad('Choose the product.');
    if (!b.client_id) throw bad('Choose the customer.');
    if (!b.start_date) throw bad('Enter the start date.');
    if (!b.delivery_date) throw bad('Enter the promised delivery date.');
    if (b.quantity === undefined || b.quantity === '') throw bad('Enter the number of units.');
    const v = await this.validate(b, { quantity: 1, clientId: Number(b.client_id) });
    if (b.unit_price === undefined || b.unit_price === '' || b.unit_price === null) v.unitPrice = await this.currentFyPrice(productId, v.startDate);
    const row = await this.prisma.$transaction(async (tx) => {
      const made = await tx.buildOrder.create({ data: { code: `T${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`, productId, ...v, createdBy: user.id, createdByName: user.username ?? null } });
      return tx.buildOrder.update({ where: { id: made.id }, data: { code: `BO-${String(made.id).padStart(4, '0')}` } });
    });
    this.log(row.id, 'INSERT', user.id, { code: row.code, product_id: productId, quantity: v.quantity });
    return { id: row.id, code: row.code };
  }

  // Edits and status moves take turns, so an edit that passed its "still open" check cannot land after the order moved on.
  // shortcut: one queue in one process; with more than one API instance, claim the order's status in each write instead
  private queue: Promise<unknown> = Promise.resolve();
  private inTurn<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  update(id: number, b: any, user: Actor) { return this.inTurn(() => this.updateNow(id, b, user)); }
  importBom(id: number, b: any, user: Actor) { return this.inTurn(() => this.importBomNow(id, b, user)); }
  swap(id: number, lineId: number, b: any, user: Actor) { return this.inTurn(() => this.swapNow(id, lineId, b, user)); }
  saveCostSettings(id: number, b: any, user: Actor) { return this.inTurn(() => this.saveCostSettingsNow(id, b, user)); }
  saveOperation(id: number, opId: number | null, b: any, user: Actor) { return this.inTurn(() => this.saveOperationNow(id, opId, b, user)); }
  removeOperation(id: number, opId: number, user: Actor) { return this.inTurn(() => this.removeOperationNow(id, opId, user)); }
  refreshCost(id: number, user: Actor) { return this.inTurn(() => this.refreshCostNow(id, user)); }
  move(id: number, action: string, b: any, user: Actor) { return this.inTurn(() => this.moveNow(id, action, b, user)); }
  remove(id: number, user: Actor) { return this.inTurn(() => this.removeNow(id, user)); }

  private async openOrder(id: number) {
    const o = await this.prisma.buildOrder.findUnique({ where: { id } });
    if (!o) throw bad('Order not found.', HttpStatus.NOT_FOUND);
    if (!OPEN.includes(o.status)) throw bad('This order is already in build, delivered or cancelled, so it can no longer change.', HttpStatus.CONFLICT);
    return o;
  }

  private async updateNow(id: number, b: any, user: Actor) {
    const o = await this.openOrder(id);
    const v = await this.validate(b, o);
    await this.prisma.buildOrder.update({ where: { id }, data: v });
    this.log(id, 'UPDATE', user.id, { quantity: v.quantity, start: v.startDate, delivery: v.deliveryDate, unit_price: v.unitPrice }, { quantity: o.quantity, start: o.startDate, delivery: o.deliveryDate, unit_price: o.unitPrice == null ? null : n(o.unitPrice) });
    return { id };
  }

  private async removeNow(id: number, user: Actor) {
    const o = await this.prisma.buildOrder.findUnique({ where: { id } });
    if (!o) return { deleted: true };
    if (o.status !== 'COMMITTED') throw bad('Only an order that has not been released can be deleted. Cancel it instead.', HttpStatus.CONFLICT);
    if ((await this.prisma.transaction.count({ where: { buildOrderId: id, NOT: { status: 'DELETED' } } })) > 0) throw bad('Expenses have been charged to this order, so it cannot be deleted. Cancel it instead.', HttpStatus.CONFLICT);
    await this.prisma.buildOrder.delete({ where: { id } });
    this.log(id, 'DELETE', user.id, {}, { code: o.code });
    return { deleted: true };
  }

  private async refresh(orderId: number) {
    const bom = await this.orderBom(orderId);
    if (!bom) return null;
    const cost = (await this.planning.rollup(bom.id)).cost.total;
    await this.prisma.buildOrder.update({ where: { id: orderId }, data: { unitCost: cost, costedAt: new Date() } });
    return cost;
  }

  // Copy the product's BOM in force today and its operations into the order.
  // Always replaces the whole copy, from the same product again or from a different one. A different product makes this an order for that product.
  private async importBomNow(id: number, b: any, user: Actor) {
    const o = await this.prisma.buildOrder.findUnique({ where: { id } });
    if (!o) throw bad('Order not found.', HttpStatus.NOT_FOUND);
    if (o.status !== 'COMMITTED') throw bad('The standard BOM can only be imported before the order is released.', HttpStatus.CONFLICT);
    const wanted = b?.product_id === undefined || b?.product_id === null || b?.product_id === '' ? o.productId : Number(b.product_id);
    if (!Number.isInteger(wanted) || !(await this.prisma.product.findFirst({ where: { id: wanted, isActive: true, isSystem: false }, select: { id: true } }))) throw bad('Choose the product to import from.');
    await this.planning.applyDueReplacements();
    const src = await this.prisma.bom.findFirst({ where: { productId: wanted }, orderBy: { version: 'desc' }, include: { lines: true, operations: true } });
    if (!src || src.lines.length === 0) throw bad('That product has no BOM yet. Build its BOM on the product first.', HttpStatus.CONFLICT);
    const std = await this.prisma.standardCost.findFirst({ where: { productId: wanted, status: 'APPROVED' }, orderBy: { id: 'desc' } });
    await this.prisma.$transaction(async (tx) => {
      await tx.bom.deleteMany({ where: { buildOrderId: id } });
      const bom = await tx.bom.create({ data: {
        buildOrderId: id, version: 1, status: 'LOCKED', freightPct: src.freightPct, warrantyPct: src.warrantyPct,
        overheadRateOverride: src.overheadRateOverride, adjustReason: src.adjustReason, changeNote: `Copied from BOM version ${src.version}`,
      } });
      await tx.bomLine.createMany({ data: src.lines.map((l) => ({
        bomId: bom.id, itemId: l.itemId, sourceItemId: l.itemId, groupName: l.groupName, sequence: l.sequence, quantity: l.quantity, scrapPct: l.scrapPct,
      })) });
      if (src.operations.length) await tx.bomOperation.createMany({ data: src.operations.map((op) => ({
        bomId: bom.id, name: op.name, hours: op.hours, rateCardId: op.rateCardId, outsourcedCost: op.outsourcedCost, fixedCost: op.fixedCost, operationTypeId: op.operationTypeId, sequence: op.sequence,
      })) });
      await tx.buildOrder.update({ where: { id }, data: { productId: wanted, sourceBomId: src.id, sourceBomVersion: src.version, sourceStandardCost: std ? n(std.total) : null, importedAt: new Date() } });
    });
    const cost = await this.refresh(id);
    this.log(id, 'IMPORT_BOM', user.id, { product_id: wanted, source_bom_version: src.version, unit_cost: cost }, wanted !== o.productId ? { product_id: o.productId } : undefined);
    return { id, unit_cost: cost, product_changed: wanted !== o.productId };
  }

  // The one change a copied BOM allows: use another part of the same alternate group, then cost the order again
  private async swapNow(id: number, lineId: number, b: any, user: Actor) {
    await this.openOrder(id);
    const bom = await this.orderBom(id);
    const line = bom ? await this.prisma.bomLine.findFirst({ where: { id: lineId, bomId: bom.id } }) : null;
    if (!line) throw bad('That line is not on this order.', HttpStatus.NOT_FOUND);
    if (line.itemId == null) throw bad('Only a part can be swapped for an alternate.');
    const toId = Number(b.item_id);
    const [cur, next] = await Promise.all([this.prisma.item.findUnique({ where: { id: line.itemId } }), this.prisma.item.findUnique({ where: { id: toId } })]);
    if (!cur || !next) throw bad('Part not found.', HttpStatus.NOT_FOUND);
    if (cur.alternateGroupId == null) throw bad('This part has no alternates.', HttpStatus.CONFLICT);
    if (next.id === cur.id) throw bad('That part is already on the line.');
    if (next.alternateGroupId !== cur.alternateGroupId) throw bad('Only an alternate of this part can replace it.', HttpStatus.CONFLICT);
    if (next.status !== 'ACTIVE' || !next.isActive || next.projectId != null) throw bad('Choose an active alternate.', HttpStatus.CONFLICT);
    if (next.uom !== cur.uom) throw bad('The alternate must use the same unit.', HttpStatus.CONFLICT);
    await this.prisma.bomLine.update({ where: { id: line.id }, data: { itemId: next.id } });
    const cost = await this.refresh(id);
    this.log(id, 'SWAP', user.id, { line_id: line.id, from: cur.partNo, to: next.partNo, unit_cost: cost }, { part: cur.partNo });
    return { id, unit_cost: cost };
  }

  // Freight and handling %, warranty % and an overhead rate per hour for this order only. They live on the order's own BOM copy,
  // so the product and its approved standard cost are not touched. An overhead rate equal to the company rate clears the override.
  private async saveCostSettingsNow(id: number, b: any, user: Actor) {
    await this.openOrder(id);
    const bom = await this.orderBom(id);
    if (!bom) throw bad('Import the standard BOM first.', HttpStatus.CONFLICT);
    const roll = await this.planning.rollup(bom.id);
    const { default_freight_pct: defFreight, default_warranty_pct: defWarranty, default_overhead_rate: defRate } = roll.cost;
    const pct = (v: any, label: string) => { const x = Number(v); if (v === '' || v === null || v === undefined || !(x >= 0 && x <= 100)) throw bad(`${label} must be between 0 and 100.`); return x; };
    const freight = b.freight_pct !== undefined ? pct(b.freight_pct, 'Freight and handling %') : n(bom.freightPct);
    const warranty = b.warranty_pct !== undefined ? pct(b.warranty_pct, 'Warranty %') : n(bom.warrantyPct);
    let override: number | null = bom.overheadRateOverride == null ? null : n(bom.overheadRateOverride);
    if (b.overhead_rate !== undefined) {
      if (b.overhead_rate === null || b.overhead_rate === '') override = null;
      else {
        override = Number(b.overhead_rate);
        if (!(override >= 0)) throw bad('Overhead rate must be zero or more.');
        if (Math.abs(override - defRate) <= 0.005) override = null;
      }
    }
    const reason = String(b.reason ?? '').trim();
    const adjusted = override != null || freight !== defFreight || warranty !== defWarranty;
    if (adjusted && !reason) throw bad('Give a reason for the change.');
    await this.prisma.bom.update({ where: { id: bom.id }, data: { freightPct: freight, warrantyPct: warranty, overheadRateOverride: override, adjustReason: adjusted ? reason.slice(0, 300) : null } });
    const cost = await this.refresh(id);
    this.log(id, 'COST_SETTINGS', user.id, { overhead_rate: override, freight_pct: freight, warranty_pct: warranty, reason: adjusted ? reason : null, unit_cost: cost },
      { overhead_rate: bom.overheadRateOverride == null ? null : n(bom.overheadRateOverride), freight_pct: n(bom.freightPct), warranty_pct: n(bom.warrantyPct) });
    return { id, unit_cost: cost };
  }

  // Build operations of this order's own BOM. They start as the product's and each order can change them; the order is costed again after every change.
  private async saveOperationNow(id: number, opId: number | null, b: any, user: Actor) {
    await this.openOrder(id);
    const bom = await this.orderBom(id);
    if (!bom) throw bad('Import the standard BOM first.', HttpStatus.CONFLICT);
    const before = opId ? await this.prisma.bomOperation.findFirst({ where: { id: opId, bomId: bom.id } }) : null;
    if (opId && !before) throw bad('That operation is not on this order.', HttpStatus.NOT_FOUND);
    const { data } = await this.planning.operationFields(b, before?.sequence ?? 1);
    const row = opId ? await this.prisma.bomOperation.update({ where: { id: opId }, data }) : await this.prisma.bomOperation.create({ data: { ...data, bomId: bom.id } });
    const cost = await this.refresh(id);
    this.log(id, opId ? 'OPERATION_UPDATE' : 'OPERATION_ADD', user.id,
      { operation: data.name, hours: data.hours, outsourced_cost: data.outsourcedCost, fixed_cost: data.fixedCost, sequence: data.sequence, unit_cost: cost },
      before ? { operation: before.name, hours: n(before.hours), sequence: before.sequence } : undefined);
    return { id: row.id, unit_cost: cost };
  }

  private async removeOperationNow(id: number, opId: number, user: Actor) {
    await this.openOrder(id);
    const bom = await this.orderBom(id);
    const op = bom ? await this.prisma.bomOperation.findFirst({ where: { id: opId, bomId: bom.id } }) : null;
    if (!op) throw bad('That operation is not on this order.', HttpStatus.NOT_FOUND);
    await this.prisma.bomOperation.delete({ where: { id: opId } });
    const cost = await this.refresh(id);
    this.log(id, 'OPERATION_DELETE', user.id, { unit_cost: cost }, { operation: op.name, hours: n(op.hours) });
    return { deleted: true, unit_cost: cost };
  }

  private async refreshCostNow(id: number, user: Actor) {
    await this.openOrder(id);
    if (!(await this.orderBom(id))) throw bad('Import the standard BOM first.', HttpStatus.CONFLICT);
    const cost = await this.refresh(id);
    this.log(id, 'RECOST', user.id, { unit_cost: cost });
    return { id, unit_cost: cost };
  }

  // Writes the new status only if the order is still in the status the checks above saw, so two requests at once cannot both win
  private async setStatus(db: Pick<PrismaService, 'buildOrder'>, id: number, from: string, data: any) {
    const { count } = await db.buildOrder.updateMany({ where: { id, status: from as any }, data });
    if (count === 0) throw bad('This order has just changed. Reload it and try again.', HttpStatus.CONFLICT);
  }

  // Release, start the build, deliver or cancel
  private async moveNow(id: number, action: string, b: any, user: Actor) {
    const o = await this.prisma.buildOrder.findUnique({ where: { id } });
    if (!o) throw bad('Order not found.', HttpStatus.NOT_FOUND);
    const data: any = {};
    if (action === 'release') {
      if (o.status !== 'COMMITTED') throw bad('Only a committed order can be released.', HttpStatus.CONFLICT);
      if (!(await this.orderBom(id))) throw bad('Import the standard BOM before releasing the order.', HttpStatus.CONFLICT);
      data.status = 'RELEASED';
    } else if (action === 'reopen') {
      if (o.status !== 'RELEASED') throw bad('Only a released order can be reopened. Once the build has started it can only be delivered or cancelled.', HttpStatus.CONFLICT);
      data.status = 'COMMITTED';
    } else if (action === 'start') {
      if (o.status !== 'RELEASED') throw bad('Only a released order can start its build.', HttpStatus.CONFLICT);
      data.status = 'IN_BUILD';
    } else if (action === 'deliver') {
      if (o.status !== 'IN_BUILD') throw bad('Only an order in build can be delivered.', HttpStatus.CONFLICT);
      const on = b.delivered_on ? this.asDate(b.delivered_on, 'the delivery') : this.today();
      if (on.getTime() > this.today().getTime()) throw bad('The delivery date cannot be in the future.');
      data.status = 'DELIVERED'; data.deliveredOn = on;
      // The units count as built in the plan month the order took them from
      const year = o.startDate.getUTCFullYear(); const month = o.startDate.getUTCMonth() + 1;
      await this.prisma.$transaction(async (tx) => {
        await this.setStatus(tx, id, o.status, data);
        await tx.productionPlan.upsert({ where: { productId_year_month: { productId: o.productId, year, month } }, update: { actualUnits: { increment: o.quantity } }, create: { productId: o.productId, year, month, actualUnits: o.quantity } });
      });
      this.log(id, action.toUpperCase(), user.id, { status: data.status, built_units_added: o.quantity }, { status: o.status });
      return { id, status: data.status };
    } else if (action === 'cancel') {
      if (!LIVE.includes(o.status)) throw bad('This order cannot be cancelled.', HttpStatus.CONFLICT);
      const reason = String(b.reason ?? '').trim();
      if (!reason) throw bad('Give a reason.');
      data.status = 'CANCELLED'; data.cancelReason = reason.slice(0, 300);
    } else throw bad('Unknown action.');
    await this.setStatus(this.prisma, id, o.status, data);
    this.log(id, action.toUpperCase(), user.id, { status: data.status }, { status: o.status });
    return { id, status: data.status };
  }
}
