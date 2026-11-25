import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BudgetsService } from '../budgets/budgets.service';
import { Prisma } from '../generated/prisma/client';
import { WORKSHOP_DEPARTMENT, STORE_DEPARTMENT, departmentNamed } from '../common/helpers/stock-departments';

type Actor = { id: number; username?: string };
type Tx = Prisma.TransactionClient;
type Entry = {
  itemId: number; kind: 'OPENING' | 'IN' | 'USED' | 'ADJUST'; quantity: number; value: number; movedOn: Date;
  transactionId?: number | null; projectId?: number | null; buildOrderId?: number | null; departmentId?: number | null; categoryId?: number | null;
  correctsId?: number | null; countId?: number | null; reason?: string | null; createdById?: number | null; createdByName?: string | null;
};
export type StockLineInput = { itemId: number; quantity: number; amount: number };

const n = (v: any) => (v == null ? 0 : Number(v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const bad = (m: string, s: number = HttpStatus.BAD_REQUEST) => new HttpException(m, s);
const text = (v: any) => String(v ?? '').trim().slice(0, 300) || null;
const day = (d: Date) => d.toISOString().slice(0, 10);

// Bulk stock: one ledger (stock_moves) and a running balance per part, valued at weighted average cost.
// Every change goes through post(), which locks the balance row, so two entries cannot take the same stock.
@Injectable()
export class StockService {
  private readonly logger = new Logger('StockService');

  constructor(private prisma: PrismaService, private audit: AuditService, private budgets: BudgetsService) {}

  private log(table: string, id: number, action: string, userId: number, newValues?: any, oldValues?: any) {
    this.audit.log({ tableName: table, recordId: id, action, changedBy: userId, newValues, oldValues }).catch((e) => this.logger.error('audit failed', e));
  }

  // Dates are calendar days, stored at UTC midnight
  private today() {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  private dateOf(v: any): Date {
    if (v == null || v === '') return this.today();
    const s = String(v).slice(0, 10);
    const d = new Date(`${s}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(d.getTime()) || day(d) !== s) throw bad('Enter a valid date.');
    if (d > this.today()) throw bad('The date cannot be in the future.');
    return d;
  }

  private async isClosed(d: Date, db: Tx | PrismaService = this.prisma) {
    return !!(await db.periodLock.findUnique({ where: { year_month: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 } } }));
  }

  private async assertOpen(d: Date) {
    if (await this.isClosed(d)) throw bad(`${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} is closed. Ask Finance to reopen it, or use a date in an open month.`);
  }

  private positive(v: any, what: string) {
    const q = r3(Number(v));
    if (!(q > 0) || q > 1e9) throw bad(`${what} must be more than zero.`);
    return q;
  }

  // The update takes a row lock that is held until the database transaction ends
  private async lock(tx: Tx, itemId: number) {
    const b = await tx.stockBalance.upsert({ where: { itemId }, create: { itemId }, update: { quantity: { increment: 0 } } });
    return { quantity: n(b.quantity), value: n(b.value), avg: n(b.avgCost) };
  }

  private async store(tx: Tx, itemId: number, quantity: number, value: number, lastAvg: number) {
    // With nothing on hand the last average is kept, so a later count surplus still has a cost
    await tx.stockBalance.update({ where: { itemId }, data: { quantity, value, avgCost: quantity > 0 ? r4(value / quantity) : lastAvg } });
  }

  private async post(tx: Tx, e: Entry, refusal?: string) {
    const b = await this.lock(tx, e.itemId);
    const quantity = r3(b.quantity + e.quantity);
    const value = r2(b.value + e.value);
    if (quantity < 0 || value < -0.005 || (quantity === 0 && Math.abs(value) > 0.005)) {
      const item = await tx.item.findUnique({ where: { id: e.itemId }, select: { partNo: true, uom: true } });
      throw bad(refusal ?? `Only ${b.quantity} ${item?.uom ?? ''} of ${item?.partNo ?? 'this part'} is on hand.`, HttpStatus.CONFLICT);
    }
    await this.store(tx, e.itemId, quantity, value, b.avg);
    const unitCost = e.quantity !== 0 ? r4(Math.abs(e.value / e.quantity)) : b.avg;
    return tx.stockMove.create({ data: { ...e, unitCost } });
  }

  // ── Parts and balances ───────────────────────────────────────────────────

  // The parts an expense can buy into stock; open to every signed-in user, so it carries no money
  async parts() {
    const rows = await this.prisma.item.findMany({ where: { supplyMode: 'STOCK', isActive: true }, include: { stockBalance: true }, orderBy: { partNo: 'asc' } });
    return rows.map((i) => ({
      id: i.id, part_no: i.partNo, name: i.name, uom: i.uom, purchase_uom: i.purchaseUom || i.uom, purchase_factor: i.purchaseFactor == null ? 1 : n(i.purchaseFactor),
      on_hand: n(i.stockBalance?.quantity), category_id: i.stockCategoryId, status: i.status,
    }));
  }

  // What is on hand, now or at the end of a date
  async onHand(asOf?: string) {
    const items = await this.prisma.item.findMany({
      where: { OR: [{ supplyMode: 'STOCK' }, { stockMoves: { some: {} } }] },
      include: { stockBalance: true, stockCategory: { select: { name: true } }, _count: { select: { stockMoves: true } } }, orderBy: { partNo: 'asc' },
    });
    let past: Map<number, { quantity: number; value: number }> | null = null;
    if (asOf) {
      const sums = await this.prisma.stockMove.groupBy({ by: ['itemId'], where: { movedOn: { lte: this.dateOf(asOf) } }, _sum: { quantity: true, value: true } });
      past = new Map(sums.map((x) => [x.itemId, { quantity: r3(n(x._sum.quantity)), value: r2(n(x._sum.value)) }]));
    }
    return items.map((i) => {
      const quantity = past ? past.get(i.id)?.quantity ?? 0 : n(i.stockBalance?.quantity);
      const value = past ? past.get(i.id)?.value ?? 0 : n(i.stockBalance?.value);
      const reorder = i.reorderLevel == null ? null : n(i.reorderLevel);
      return {
        id: i.id, part_no: i.partNo, name: i.name, uom: i.uom, supply_mode: i.supplyMode, purchase_uom: i.purchaseUom, purchase_factor: i.purchaseFactor == null ? null : n(i.purchaseFactor),
        reorder_level: reorder, category_id: i.stockCategoryId, category_name: i.stockCategory?.name ?? null,
        quantity, value, avg_cost: past ? (quantity > 0 ? r4(value / quantity) : 0) : n(i.stockBalance?.avgCost), standard_price: n(i.standardPrice),
        reorder: i.supplyMode === 'STOCK' && reorder != null && quantity <= reorder, entries: i._count.stockMoves,
      };
    });
  }

  async saveSettings(itemId: number, b: any, user: Actor) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, include: { stockBalance: true } });
    if (!item) throw bad('Part not found.', HttpStatus.NOT_FOUND);
    const mode = String(b.supply_mode ?? '').toUpperCase();
    if (!['DIRECT', 'STOCK'].includes(mode)) throw bad('Supply mode must be Direct or Stock.');
    const data: any = { supplyMode: mode, purchaseUom: null, purchaseFactor: null, reorderLevel: null, stockCategoryId: null };
    if (mode === 'STOCK') {
      if (item.projectId != null) throw bad('A part made for one project is bought directly for it, so it cannot be a stock part.');
      if (item.status !== 'ACTIVE' && item.supplyMode !== 'STOCK') throw bad('A replaced or retired part cannot become a stock part.');
      const category = await this.prisma.category.findFirst({ where: { id: Number(b.category_id) || 0, type: 'expense', isActive: true }, select: { id: true } });
      if (!category) throw bad('Choose the expense category stock used is booked under. It finds the job budget line.');
      data.stockCategoryId = category.id;
      data.purchaseUom = String(b.purchase_uom ?? '').trim().slice(0, 12) || null;
      const factor = b.purchase_factor === '' || b.purchase_factor == null ? 1 : Number(b.purchase_factor);
      if (!(factor > 0) || factor > 1e6) throw bad('Units in one purchase unit must be more than zero.');
      data.purchaseFactor = data.purchaseUom ? r4(factor) : null;
      if (!(b.reorder_level === '' || b.reorder_level == null)) {
        const level = Number(b.reorder_level);
        if (!(level >= 0)) throw bad('Reorder level must be zero or more.');
        data.reorderLevel = r3(level);
      }
    } else if (n(item.stockBalance?.quantity) > 0) {
      throw bad(`${n(item.stockBalance?.quantity)} ${item.uom} is still on hand. Use it or count it to zero before making the part Direct.`, HttpStatus.CONFLICT);
    }
    await this.prisma.item.update({ where: { id: itemId }, data });
    this.log('items', itemId, 'UPDATE', user.id, data, { supplyMode: item.supplyMode, stockCategoryId: item.stockCategoryId, reorderLevel: item.reorderLevel });
    return { id: itemId };
  }

  private async stockItem(itemId: any) {
    const item = await this.prisma.item.findUnique({ where: { id: Number(itemId) || 0 } });
    if (!item) throw bad('Choose a part.', HttpStatus.NOT_FOUND);
    if (item.supplyMode !== 'STOCK' || item.stockCategoryId == null) throw bad(`${item.partNo} is not a stock part.`);
    return item;
  }

  async opening(b: any, user: Actor) {
    const item = await this.stockItem(b.item_id);
    const quantity = this.positive(b.quantity, 'Quantity');
    const unitCost = Number(b.unit_cost);
    if (!(unitCost >= 0) || unitCost > 1e9) throw bad('Enter the agreed cost for one unit.');
    const movedOn = this.dateOf(b.date);
    await this.assertOpen(movedOn);
    const move = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, item.id);
      if (await tx.stockMove.count({ where: { itemId: item.id } })) throw bad('Opening stock is entered once, before any other entry for the part. Use a stock count to correct the quantity.', HttpStatus.CONFLICT);
      return this.post(tx, { itemId: item.id, kind: 'OPENING', quantity, value: r2(quantity * unitCost), movedOn, categoryId: item.stockCategoryId, reason: text(b.reason), createdById: user.id, createdByName: user.username ?? null });
    });
    this.log('stock_moves', move.id, 'INSERT', user.id, move);
    return { id: move.id };
  }

  // Adopt the average cost as the part's standard price. Product standard costs still need their own approval.
  async useAverage(itemId: number, user: Actor) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, include: { stockBalance: true } });
    if (!item) throw bad('Part not found.', HttpStatus.NOT_FOUND);
    if (item.sourcing === 'MAKE') throw bad('A made part takes its price from its material and manufacturing costs.');
    const avg = r2(n(item.stockBalance?.avgCost));
    if (!(avg > 0)) throw bad('There is no average cost yet.');
    await this.prisma.item.update({ where: { id: itemId }, data: { standardPrice: avg } });
    this.log('items', itemId, 'UPDATE', user.id, { standard_price: avg, from: 'average stock cost' }, { standard_price: n(item.standardPrice) });
    return { id: itemId, standard_price: avg };
  }

  // ── Ledger ───────────────────────────────────────────────────────────────

  private readonly MOVE_INCLUDE = {
    item: { select: { partNo: true, name: true, uom: true } }, project: { select: { code: true, name: true } }, buildOrder: { select: { code: true } },
    transaction: { select: { referenceId: true } }, category: { select: { name: true } }, count: { select: { year: true, month: true } },
  } as const;

  private mapMove(m: any, locks: Set<string>) {
    const job = m.buildOrder?.code ?? (m.project ? m.project.code || m.project.name : null);
    const quantity = n(m.quantity);
    return {
      id: m.id, item_id: m.itemId, part_no: m.item.partNo, part_name: m.item.name, uom: m.item.uom, kind: m.kind,
      // Used entries read as what was consumed; everything else reads as the change to stock
      quantity: m.kind === 'USED' ? r3(-quantity) : quantity, value: m.kind === 'USED' ? r2(-n(m.value)) : n(m.value), unit_cost: n(m.unitCost),
      moved_on: day(m.movedOn), project_id: m.projectId, build_order_id: m.buildOrderId, job, category_name: m.category?.name ?? null,
      reference: m.transaction?.referenceId ?? (m.count ? `Count ${MON[m.count.month - 1]} ${m.count.year}` : null),
      corrects_id: m.correctsId, reason: m.reason, created_by_name: m.createdByName,
      closed: locks.has(`${m.movedOn.getUTCFullYear()}-${m.movedOn.getUTCMonth() + 1}`),
    };
  }

  private async lockedMonths() {
    return new Set((await this.prisma.periodLock.findMany({ select: { year: true, month: true } })).map((l) => `${l.year}-${l.month}`));
  }

  async moves(q: { itemId?: string; projectId?: string; buildOrderId?: string; kind?: string }) {
    const where: Prisma.StockMoveWhereInput = {};
    if (Number(q.itemId)) where.itemId = Number(q.itemId);
    if (Number(q.projectId)) where.projectId = Number(q.projectId);
    if (Number(q.buildOrderId)) where.buildOrderId = Number(q.buildOrderId);
    if (q.kind) where.kind = String(q.kind).toUpperCase();
    const [rows, locks] = await Promise.all([
      this.prisma.stockMove.findMany({ where, include: this.MOVE_INCLUDE, orderBy: [{ movedOn: 'desc' }, { id: 'desc' }], take: 1000 }),
      this.lockedMonths(),
    ]);
    return rows.map((m) => this.mapMove(m, locks));
  }

  // ── Stock used on a project or an order ──────────────────────────────────

  private async jobOf(b: { projectId?: any; buildOrderId?: any }) {
    const projectId = Number(b.projectId) || null;
    const buildOrderId = Number(b.buildOrderId) || null;
    if (!projectId === !buildOrderId) throw bad('Choose one project or one order.');
    if (buildOrderId) {
      const o = await this.prisma.buildOrder.findUnique({ where: { id: buildOrderId } });
      if (!o) throw bad('Order not found.', HttpStatus.NOT_FOUND);
      return { projectId: null, buildOrderId, productId: o.productId, units: o.quantity, label: o.code, closed: o.status === 'CANCELLED' ? 'That order is cancelled.' : null };
    }
    const p = await this.prisma.project.findUnique({ where: { id: projectId! } });
    if (!p) throw bad('Project not found.', HttpStatus.NOT_FOUND);
    return { projectId, buildOrderId: null, productId: null, units: 1, label: p.code || p.name, closed: p.isActive === false ? 'That project is inactive.' : null };
  }

  // What the job's own BOM asks for, by part: quantity per unit with scrap, times the units
  private async bomNeed(job: { projectId: number | null; buildOrderId: number | null; units: number }) {
    const bom = await this.prisma.bom.findFirst({ where: job.buildOrderId ? { buildOrderId: job.buildOrderId } : { projectId: job.projectId }, orderBy: { version: 'desc' }, include: { lines: true } });
    const need = new Map<number, number>();
    for (const l of bom?.lines ?? []) need.set(l.itemId, r3((need.get(l.itemId) ?? 0) + n(l.quantity) * (1 + n(l.scrapPct) / 100) * job.units));
    return { hasBom: need.size > 0, need };
  }

  // The material view of a job: each stock part used or on its BOM, with the cost against the standard
  async job(q: { projectId?: string; buildOrderId?: string }) {
    const job = await this.jobOf(q);
    const [{ hasBom, need }, entries, parts] = await Promise.all([
      this.bomNeed(job),
      this.moves({ projectId: job.projectId ? String(job.projectId) : undefined, buildOrderId: job.buildOrderId ? String(job.buildOrderId) : undefined, kind: 'USED' }),
      this.prisma.item.findMany({ where: { OR: [{ supplyMode: 'STOCK' }, { stockMoves: { some: {} } }] }, include: { stockBalance: true }, orderBy: { partNo: 'asc' } }),
    ]);
    const rows = parts.map((p) => {
      const mine = entries.filter((e) => e.item_id === p.id);
      const used = r3(mine.reduce((a, e) => a + e.quantity, 0));
      const cost = r2(mine.reduce((a, e) => a + e.value, 0));
      const bomQty = need.get(p.id) ?? null;
      return {
        item_id: p.id, part_no: p.partNo, name: p.name, uom: p.uom, on_bom: bomQty != null, bom_qty: bomQty, used_qty: used, used_value: cost,
        bom_value: bomQty == null ? null : r2(bomQty * n(p.standardPrice)), suggested_qty: bomQty == null ? null : Math.max(0, r3(bomQty - used)),
        on_hand: n(p.stockBalance?.quantity), avg_cost: n(p.stockBalance?.avgCost), category_id: p.stockCategoryId, is_stock: p.supplyMode === 'STOCK', entries: mine.length,
      };
    });
    return {
      label: job.label, has_bom: hasBom, closed: job.closed, project_id: job.projectId, build_order_id: job.buildOrderId, product_id: job.productId,
      lines: rows.filter((r) => r.on_bom || r.entries > 0),
      parts: rows.filter((r) => r.is_stock),
      entries,
      total: r2(entries.reduce((a, e) => a + e.value, 0)),
    };
  }

  // Stock used never blocks: over budget, or with no line, it asks for a reason
  private async budgetNote(job: { projectId: number | null; buildOrderId: number | null; productId: number | null }, categoryId: number | null, amount: number, movedOn: Date) {
    if (amount <= 0 || categoryId == null) return null;
    const h: any = await this.budgets.headroom({
      date: day(movedOn), contextType: job.buildOrderId ? 'product' : 'project', projectId: job.projectId ?? undefined, productId: job.productId ?? undefined,
      buildOrderId: job.buildOrderId ?? undefined, categoryId, amount,
    });
    if (h.state === 'NO_LINE') return 'There is no budget line for this material on the job.';
    if (h.state === 'OVER' || h.state === 'BLOCKED') return `This takes the budget line ₹${Math.round(h.over_by).toLocaleString('en-IN')} over budget.`;
    return null;
  }

  private raiseAlerts() {
    this.budgets.evaluateAlerts(true).catch((e) => this.logger.error('alert evaluation failed', e));
  }

  async addUsed(b: any, user: Actor) {
    const job = await this.jobOf({ projectId: b.project_id, buildOrderId: b.build_order_id });
    if (job.closed) throw bad(job.closed);
    const item = await this.stockItem(b.item_id);
    const quantity = this.positive(b.quantity, 'Quantity used');
    const movedOn = this.dateOf(b.date);
    await this.assertOpen(movedOn);
    const reason = text(b.reason);
    const { hasBom, need } = await this.bomNeed(job);
    if (hasBom && !need.has(item.id) && !reason) throw bad(`${item.partNo} is not on the BOM for ${job.label}. Add a reason.`);
    const avg = n((await this.prisma.stockBalance.findUnique({ where: { itemId: item.id } }))?.avgCost);
    const note = await this.budgetNote(job, item.stockCategoryId, r2(quantity * avg), movedOn);
    if (note && !reason) throw bad(`${note} Add a reason.`);

    const move = await this.prisma.$transaction(async (tx) => {
      const bal = await this.lock(tx, item.id);
      // Taking the last of the stock takes all of its value, so no paise are left behind
      const value = quantity === bal.quantity ? bal.value : bal.quantity > 0 ? r2((quantity * bal.value) / bal.quantity) : 0;
      return this.post(tx, {
        itemId: item.id, kind: 'USED', quantity: -quantity, value: -value, movedOn, projectId: job.projectId, buildOrderId: job.buildOrderId,
        categoryId: item.stockCategoryId, reason, createdById: user.id, createdByName: user.username ?? null,
      });
    });
    this.log('stock_moves', move.id, 'INSERT', user.id, move);
    this.raiseAlerts();
    return { id: move.id, value: -n(move.value) };
  }

  private async usedEntry(id: number) {
    const m = await this.prisma.stockMove.findUnique({ where: { id }, include: { corrections: true } });
    if (!m || m.kind !== 'USED') throw bad('Stock used entry not found.', HttpStatus.NOT_FOUND);
    return m;
  }

  // Change an entry while its month is open. It keeps its unit cost.
  async editUsed(id: number, b: any, user: Actor) {
    const first = await this.usedEntry(id);
    if (first.correctsId != null) throw bad('A correction is not edited. Add another correction to the first entry.');
    await this.assertOpen(first.movedOn);
    const quantity = r3(Number(b.quantity));
    if (!(quantity >= 0) || quantity > 1e9) throw bad('Quantity used must be zero or more.');
    const corrected = r3(first.corrections.reduce((a, c) => a - n(c.quantity), 0));
    if (r3(quantity + corrected) < 0) throw bad(`Corrections already take back ${-corrected}, so the quantity cannot be lower than that.`);
    const reason = text(b.reason) ?? first.reason;
    const extra = r3(quantity + n(first.quantity));
    if (extra > 0) {
      const job = await this.jobOf({ projectId: first.projectId, buildOrderId: first.buildOrderId });
      const note = await this.budgetNote(job, first.categoryId, r2(extra * n(first.unitCost)), first.movedOn);
      if (note && !reason) throw bad(`${note} Add a reason.`);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const bal = await this.lock(tx, first.itemId);
      const cur = await tx.stockMove.findUniqueOrThrow({ where: { id } });
      const oldQty = -n(cur.quantity);
      const nextQty = r3(bal.quantity + oldQty - quantity);
      let used = quantity === oldQty ? -n(cur.value) : r2(quantity * n(cur.unitCost));
      let nextValue = r2(bal.value - n(cur.value) - used);
      if (nextQty === 0) { used = r2(used + nextValue); nextValue = 0; }
      if (nextQty < 0) throw bad(`Only ${r3(bal.quantity + oldQty)} can be used on this entry: that is all there is.`, HttpStatus.CONFLICT);
      if (nextValue < -0.005 || used < -0.005) throw bad('This change would leave the Store with a negative value. Record the difference in the next stock count.', HttpStatus.CONFLICT);
      await this.store(tx, first.itemId, nextQty, nextValue, bal.avg);
      return tx.stockMove.update({ where: { id }, data: { quantity: -quantity, value: -used, reason } });
    });
    this.log('stock_moves', id, 'UPDATE', user.id, updated, first);
    this.raiseAlerts();
    return { id };
  }

  // For an entry in a closed month: a new entry dated in an open month, at the first entry's unit cost.
  // A minus quantity takes usage back from the job; a plus quantity adds to it.
  async correct(id: number, b: any, user: Actor) {
    const first = await this.usedEntry(id);
    if (first.correctsId != null) throw bad('Correct the first entry, not an earlier correction.');
    if (!(await this.isClosed(first.movedOn))) throw bad('The month of this entry is open, so edit the entry itself.');
    const quantity = r3(Number(b.quantity));
    if (!quantity || Math.abs(quantity) > 1e9) throw bad('Enter the quantity to add, or a minus quantity to take back.');
    const reason = text(b.reason);
    if (!reason) throw bad('Say why the entry is being corrected.');
    const movedOn = this.dateOf(b.date);
    await this.assertOpen(movedOn);
    const move = await this.prisma.$transaction(async (tx) => {
      const bal = await this.lock(tx, first.itemId);
      const all = await tx.stockMove.findMany({ where: { OR: [{ id }, { correctsId: id }] } });
      const used = r3(all.reduce((a, m) => a - n(m.quantity), 0));
      const cost = r2(all.reduce((a, m) => a - n(m.value), 0));
      if (r3(used + quantity) < 0) throw bad(`Only ${used} can be taken back from this entry.`);
      // Taking everything back returns exactly what was charged
      let value = r3(used + quantity) === 0 ? -cost : r2(quantity * n(first.unitCost));
      if (r3(bal.quantity - quantity) === 0) value = bal.value;
      return this.post(tx, {
        itemId: first.itemId, kind: 'USED', quantity: -quantity, value: -value, movedOn, projectId: first.projectId, buildOrderId: first.buildOrderId,
        categoryId: first.categoryId, correctsId: id, reason, createdById: user.id, createdByName: user.username ?? null,
      });
    });
    this.log('stock_moves', move.id, 'INSERT', user.id, move);
    this.raiseAlerts();
    return { id: move.id };
  }

  // ── Stock purchases (an expense with context "stock") ────────────────────

  async storeDepartmentId() {
    return departmentNamed(this.prisma, STORE_DEPARTMENT);
  }

  async checkLines(lines: StockLineInput[]) {
    if (!lines.length) return [];
    const ids = [...new Set(lines.map((l) => Number(l.itemId)))];
    const items = await this.prisma.item.findMany({ where: { id: { in: ids }, supplyMode: 'STOCK', isActive: true }, select: { id: true } });
    if (items.length !== ids.length) throw bad('Every line must be an active stock part.');
    return lines.map((l) => {
      const amount = r2(Number(l.amount));
      if (!(amount > 0)) throw bad('Each stock line needs an amount above zero.');
      return { itemId: Number(l.itemId), quantity: this.positive(l.quantity, 'Each stock line quantity'), amount };
    });
  }

  // Run before a stock purchase enters approval
  async assertPurchaseReady(txn: { id: number; type: string | null; contextType: string | null; amount: any; netAmount?: any }) {
    if (txn.contextType !== 'stock') return;
    if (txn.type !== 'expense') throw bad('Only an expense can buy stock.');
    const lines = await this.prisma.stockPurchaseLine.findMany({ where: { transactionId: txn.id }, include: { item: true } });
    if (!lines.length) throw bad('Add the parts bought before submitting a stock purchase.');
    const wrong = lines.find((l) => l.item.supplyMode !== 'STOCK');
    if (wrong) throw bad(`${wrong.item.partNo} is no longer a stock part. Edit the purchase.`);
    const net = r2(n(txn.netAmount ?? txn.amount));
    const sum = r2(lines.reduce((a, l) => a + n(l.amount), 0));
    if (Math.abs(sum - net) > 0.01) throw bad(`The stock lines add up to ₹${sum.toFixed(2)}, but the amount before GST is ₹${net.toFixed(2)}. They must match.`);
  }

  // Put the purchased parts into stock. Valued before GST when the GST is claimed back, otherwise with GST.
  async postPurchase(tx: Tx, transactionId: number, userId: number) {
    const t = await tx.transaction.findUnique({ where: { id: transactionId }, include: { stockLines: { include: { item: true }, orderBy: [{ itemId: 'asc' }, { id: 'asc' }] }, stockMoves: true } });
    if (!t || t.contextType !== 'stock' || !t.stockLines.length) return;
    if (r3(t.stockMoves.reduce((a, m) => a + n(m.quantity), 0)) > 0) return;
    const net = n(t.netAmount ?? t.amount);
    const target = t.isClaimable ? net : n(t.totalAmount ?? t.amount);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { username: true } });
    let left = r2(target);
    for (const [i, l] of t.stockLines.entries()) {
      const value = i === t.stockLines.length - 1 ? left : r2((n(l.amount) * target) / net);
      left = r2(left - value);
      const quantity = r3(n(l.quantity) * (l.item.purchaseFactor == null ? 1 : n(l.item.purchaseFactor)));
      await this.post(tx, {
        itemId: l.itemId, kind: 'IN', quantity, value, movedOn: t.dateRecorded, transactionId, categoryId: l.item.stockCategoryId,
        createdById: userId, createdByName: user?.username ?? null,
      });
      await tx.itemPriceLog.create({ data: { itemId: l.itemId, price: r2(value / quantity), paidOn: t.dateRecorded, note: `Stock purchase ${t.referenceId}`, recordedByName: user?.username ?? null } });
    }
  }

  // Rejected, sent back or voided: take the stock out again. Refused when it has already been used.
  async reversePurchase(tx: Tx, transactionId: number, why: string, userId: number) {
    const moves = await tx.stockMove.findMany({ where: { transactionId, kind: 'IN' } });
    if (!moves.length) return;
    const t = await tx.transaction.findUnique({ where: { id: transactionId }, select: { referenceId: true } });
    const byItem = new Map<number, { quantity: number; value: number; movedOn: Date; categoryId: number | null }>();
    for (const m of moves) {
      const e = byItem.get(m.itemId) ?? { quantity: 0, value: 0, movedOn: m.movedOn, categoryId: m.categoryId };
      e.quantity = r3(e.quantity + n(m.quantity)); e.value = r2(e.value + n(m.value));
      byItem.set(m.itemId, e);
    }
    const user = await tx.user.findUnique({ where: { id: userId }, select: { username: true } });
    for (const [itemId, e] of [...byItem.entries()].sort((a, b) => a[0] - b[0])) {
      if (e.quantity <= 0) continue;
      const item = await tx.item.findUnique({ where: { id: itemId }, select: { partNo: true } });
      await this.post(tx, {
        itemId, kind: 'IN', quantity: -e.quantity, value: -e.value, movedOn: (await this.isClosed(e.movedOn, tx)) ? this.today() : e.movedOn,
        transactionId, categoryId: e.categoryId, reason: why, createdById: userId, createdByName: user?.username ?? null,
      }, `Stock from this purchase has already been used (${item?.partNo}). Correct those stock used entries first, then try again.`);
    }
    await tx.itemPriceLog.deleteMany({ where: { note: `Stock purchase ${t?.referenceId}` } });
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async valueReport(asOf?: Date) {
    const rows = (await this.onHand(asOf ? day(asOf) : undefined)).filter((r) => r.quantity !== 0 || r.value !== 0).map((r) => ({
      Part: r.part_no, Name: r.name, Unit: r.uom, 'On Hand': r.quantity, 'Average Cost': r2(r.avg_cost), Value: r.value,
    }));
    return {
      title: `Stock on Hand and Value ${asOf ? `at ${day(asOf)}` : 'now'}`, columns: ['Part', 'Name', 'Unit', 'On Hand', 'Average Cost', 'Value'], rows,
      totals: { Value: r2(rows.reduce((a, r) => a + r.Value, 0)) },
    };
  }

  private periodWhere(from?: Date, to?: Date): Prisma.StockMoveWhereInput {
    return from || to ? { movedOn: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
  }

  // Quantity and value in, used and adjusted for each part over the period
  async byPartReport(from?: Date, to?: Date) {
    const [moves, items] = await Promise.all([
      this.prisma.stockMove.groupBy({ by: ['itemId', 'kind'], where: this.periodWhere(from, to), _sum: { quantity: true, value: true } }),
      this.prisma.item.findMany({ where: { stockMoves: { some: {} } }, select: { id: true, partNo: true, name: true, uom: true }, orderBy: { partNo: 'asc' } }),
    ]);
    const of = (id: number, kind: string) => moves.find((m) => m.itemId === id && m.kind === kind)?._sum;
    const rows = items.filter((i) => moves.some((m) => m.itemId === i.id)).map((i) => ({
      Part: i.partNo, Name: i.name, Unit: i.uom,
      'Opening Qty': r3(n(of(i.id, 'OPENING')?.quantity)), 'In Qty': r3(n(of(i.id, 'IN')?.quantity)), 'In Value': r2(n(of(i.id, 'IN')?.value)),
      'Used Qty': r3(-n(of(i.id, 'USED')?.quantity)), 'Used Value': r2(-n(of(i.id, 'USED')?.value)),
      'Count Difference Qty': r3(n(of(i.id, 'ADJUST')?.quantity)), 'Count Difference Value': r2(n(of(i.id, 'ADJUST')?.value)),
    }));
    const sum = (k: 'In Value' | 'Used Value' | 'Count Difference Value') => r2(rows.reduce((a, r) => a + r[k], 0));
    return {
      title: 'Stock In and Used by Part', columns: ['Part', 'Name', 'Unit', 'Opening Qty', 'In Qty', 'In Value', 'Used Qty', 'Used Value', 'Count Difference Qty', 'Count Difference Value'], rows,
      totals: { 'In Value': sum('In Value'), 'Used Value': sum('Used Value'), 'Count Difference Value': sum('Count Difference Value') },
    };
  }

  // What each project and order consumed from the Store over the period
  async byJobReport(from?: Date, to?: Date) {
    const moves = await this.prisma.stockMove.findMany({ where: { kind: 'USED', ...this.periodWhere(from, to) }, include: this.MOVE_INCLUDE });
    const grouped = new Map<string, { Job: string; 'Job Type': string; Part: string; Name: string; Unit: string; 'Used Qty': number; 'Used Value': number }>();
    for (const m of moves) {
      const job = m.buildOrder?.code ?? m.project?.code ?? m.project?.name ?? '';
      const key = `${job}|${m.itemId}`;
      const row = grouped.get(key) ?? { Job: job, 'Job Type': m.buildOrderId ? 'Order' : 'Project', Part: m.item.partNo, Name: m.item.name, Unit: m.item.uom, 'Used Qty': 0, 'Used Value': 0 };
      row['Used Qty'] = r3(row['Used Qty'] - n(m.quantity)); row['Used Value'] = r2(row['Used Value'] - n(m.value));
      grouped.set(key, row);
    }
    const rows = [...grouped.values()].sort((a, b) => a.Job.localeCompare(b.Job) || a.Part.localeCompare(b.Part));
    return { title: 'Stock Used by Job', columns: ['Job', 'Job Type', 'Part', 'Name', 'Unit', 'Used Qty', 'Used Value'], rows, totals: { 'Used Value': r2(rows.reduce((a, r) => a + r['Used Value'], 0)) } };
  }

  // ── Monthly stock count ──────────────────────────────────────────────────

  private mapCount(c: any) {
    return {
      id: c.id, year: c.year, month: c.month, label: `${MON[c.month - 1]} ${c.year}`, status: c.status, note: c.note, created_by_name: c.createdByName, created_at: c.createdAt,
      submitted_by_name: c.submittedByName, submitted_at: c.submittedAt, approved_by_name: c.approvedByName, approved_at: c.approvedAt,
    };
  }

  async counts() {
    const rows = await this.prisma.stockCount.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }], include: { lines: true, moves: true } });
    return rows.map((c) => ({ ...this.mapCount(c), parts: c.lines.length, counted: c.lines.filter((l) => l.countedQty != null).length, adjustment_value: r2(c.moves.reduce((a, m) => a + n(m.value), 0)) }));
  }

  private async countOrThrow(id: number) {
    const c = await this.prisma.stockCount.findUnique({ where: { id }, include: { lines: { include: { item: { include: { stockBalance: true } } }, orderBy: { item: { partNo: 'asc' } } }, moves: true } });
    if (!c) throw bad('Stock count not found.', HttpStatus.NOT_FOUND);
    return c;
  }

  async count(id: number) {
    const c = await this.countOrThrow(id);
    return {
      ...this.mapCount(c),
      lines: c.lines.map((l) => {
        // Until approval the expected quantity follows the books, so a missed entry added now is taken into account
        const expected = c.status === 'APPROVED' ? n(l.expectedQty) : n(l.item.stockBalance?.quantity);
        const counted = l.countedQty == null ? null : n(l.countedQty);
        const difference = counted == null ? null : r3(counted - expected);
        const cost = n(l.item.stockBalance?.avgCost) || n(l.item.standardPrice);
        const move = c.moves.find((m) => m.itemId === l.itemId);
        return {
          item_id: l.itemId, part_no: l.item.partNo, name: l.item.name, uom: l.item.uom, expected_qty: expected, counted_qty: counted, difference,
          difference_value: c.status === 'APPROVED' ? n(move?.value) : difference == null ? null : r2(difference * cost),
        };
      }),
    };
  }

  async createCount(b: any, user: Actor) {
    const year = Number(b.year); const month = Number(b.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 2000 || year > 2100) throw bad('Choose the month being counted.');
    const first = new Date(Date.UTC(year, month - 1, 1));
    if (first > this.today()) throw bad('A month that has not started cannot be counted.');
    await this.assertOpen(first);
    if (await this.prisma.stockCount.findUnique({ where: { year_month: { year, month } } })) throw bad(`${MON[month - 1]} ${year} already has a stock count.`, HttpStatus.CONFLICT);
    const items = await this.prisma.item.findMany({ where: { OR: [{ supplyMode: 'STOCK', isActive: true }, { stockBalance: { quantity: { gt: 0 } } }] }, select: { id: true } });
    if (!items.length) throw bad('There are no stock parts to count.');
    const c = await this.prisma.stockCount.create({ data: { year, month, createdByName: user.username ?? null, lines: { create: items.map((i) => ({ itemId: i.id })) } } });
    this.log('stock_counts', c.id, 'INSERT', user.id, c);
    return { id: c.id };
  }

  async saveCount(id: number, b: any, user: Actor) {
    const c = await this.countOrThrow(id);
    if (c.status !== 'DRAFT') throw bad('Only a draft count can be changed.', HttpStatus.CONFLICT);
    if (!Array.isArray(b.lines)) throw bad('Send the counted quantities.');
    const updates = b.lines.map((l: any) => {
      const line = c.lines.find((x) => x.itemId === Number(l.item_id));
      if (!line) throw bad('That part is not on this count.');
      const blank = l.counted_qty === '' || l.counted_qty == null;
      const qty = blank ? null : r3(Number(l.counted_qty));
      if (qty != null && !(qty >= 0 && qty <= 1e9)) throw bad('Counted quantities must be zero or more.');
      return this.prisma.stockCountLine.update({ where: { id: line.id }, data: { countedQty: qty } });
    });
    await this.prisma.$transaction(updates);
    this.log('stock_counts', id, 'UPDATE', user.id, { lines: b.lines });
    return { id };
  }

  async submitCount(id: number, user: Actor) {
    const c = await this.countOrThrow(id);
    if (c.status !== 'DRAFT') throw bad('Only a draft count can be submitted.', HttpStatus.CONFLICT);
    if (c.lines.some((l) => l.countedQty == null)) throw bad('Enter a counted quantity for every part. Enter zero when there is none.');
    await this.prisma.stockCount.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date(), submittedByName: user.username ?? null, note: null } });
    this.log('stock_counts', id, 'SUBMIT', user.id);
    return { id };
  }

  async decideCount(id: number, b: any, user: Actor) {
    const c = await this.countOrThrow(id);
    if (c.status !== 'SUBMITTED') throw bad('Only a submitted count can be approved or sent back.', HttpStatus.CONFLICT);
    const note = text(b.note);
    if (b.decision === 'send_back') {
      if (!note) throw bad('Say what needs to change.');
      await this.prisma.stockCount.update({ where: { id }, data: { status: 'DRAFT', note } });
      this.log('stock_counts', id, 'SEND_BACK', user.id, { note });
      return { id };
    }
    if (b.decision !== 'approve') throw bad('Decision must be approve or send_back.');
    // Dated the last day of the counted month, or today while the month is still running
    const monthEnd = new Date(Date.UTC(c.year, c.month, 0));
    const movedOn = monthEnd < this.today() ? monthEnd : this.today();
    await this.assertOpen(movedOn);
    const workshop = await departmentNamed(this.prisma, WORKSHOP_DEPARTMENT);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockCount.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'APPROVED', approvedAt: new Date(), approvedByName: user.username ?? null, note } });
      if (!claimed.count) throw bad('This count has already been decided.', HttpStatus.CONFLICT);
      for (const l of [...c.lines].sort((a, x) => a.itemId - x.itemId)) {
        const bal = await this.lock(tx, l.itemId);
        const counted = n(l.countedQty);
        await tx.stockCountLine.update({ where: { id: l.id }, data: { expectedQty: bal.quantity } });
        const diff = r3(counted - bal.quantity);
        if (!diff) continue;
        const cost = bal.avg || n(l.item.standardPrice);
        const value = counted === 0 ? -bal.value : diff > 0 ? r2(diff * cost) : r2((diff * bal.value) / bal.quantity);
        await this.post(tx, {
          itemId: l.itemId, kind: 'ADJUST', quantity: diff, value, movedOn, departmentId: workshop, categoryId: l.item.stockCategoryId, countId: id,
          reason: `Stock count ${MON[c.month - 1]} ${c.year}`, createdById: user.id, createdByName: user.username ?? null,
        });
      }
    });
    this.log('stock_counts', id, 'APPROVE', user.id, { note });
    this.raiseAlerts();
    return { id };
  }

  async deleteCount(id: number, user: Actor) {
    const c = await this.countOrThrow(id);
    if (c.status !== 'DRAFT') throw bad('Only a draft count can be deleted.', HttpStatus.CONFLICT);
    await this.prisma.stockCount.delete({ where: { id } });
    this.log('stock_counts', id, 'DELETE', user.id, undefined, this.mapCount(c));
    return { deleted: true };
  }
}
