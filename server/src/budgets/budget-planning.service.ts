import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BudgetsService } from './budgets.service';
import { ROLES } from '../common/constants/roles';
import { financeSelfApprovalAllowed } from '../common/config/approval-policy';

const n = (v: any) => (v == null ? 0 : Number(v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const bad = (msg: string, code = HttpStatus.BAD_REQUEST) => new HttpException(msg, code);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Estimate lines written by the job BOM; the basis marks them as managed
const DEFAULT_FREIGHT_PCT = 2;
const DEFAULT_WARRANTY_PCT = 1.5;
const JOB_BASIS = 'JOB_BOM';
const JOB_BOUGHT = 'Parts, freight and outsourced work (job BOM)';
const JOB_LABOUR = 'Build labour and overhead (job BOM)';
type Owner = number | { projectId: number };
type Actor = { id: number; username?: string; role_name?: string };

// Projects (estimate, milestones, earned value), products (BOM, standard cost, build plan),
// rates and items, budget changes and the monthly close.
@Injectable()
export class BudgetPlanningService {
  constructor(private prisma: PrismaService, private budgets: BudgetsService, private audit: AuditService) {}

  private log(table: string, id: number, action: string, user: number | undefined, data: any, old?: any) {
    if (user == null) return;
    this.audit.log({ tableName: table, recordId: id, action, changedBy: user, newValues: data, ...(old !== undefined ? { oldValues: old } : {}) }).catch(() => undefined);
  }

  // ── Rate cards and overhead rates ────────────────────────────────────────

  private today() { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }

  private asDate(v: any, label: string) {
    const d = new Date(String(v).slice(0, 10));
    if (isNaN(d.getTime())) throw bad(`Enter a valid date for ${label}.`);
    return d;
  }

  // The rate in force today for each role: the latest dated rate on or before today, and the next change if one is scheduled
  private currentRates(cards: { id: number; ratePerHour: any; effectiveFrom: Date }[], history: { rateCardId: number; ratePerHour: any; effectiveFrom: Date }[]) {
    const t = this.today().getTime();
    const out = new Map<number, { rate: number; from: Date; next: { rate: number; from: Date } | null }>();
    for (const c of cards) {
      const rows = history.filter((h) => h.rateCardId === c.id).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
      const cur = rows.find((h) => h.effectiveFrom.getTime() <= t);
      const future = rows.filter((h) => h.effectiveFrom.getTime() > t).pop();
      out.set(c.id, { rate: cur ? n(cur.ratePerHour) : n(c.ratePerHour), from: cur ? cur.effectiveFrom : c.effectiveFrom, next: future ? { rate: n(future.ratePerHour), from: future.effectiveFrom } : null });
    }
    return out;
  }

  private async rateNow(cards: { id: number; ratePerHour: any; effectiveFrom: Date }[]) {
    return this.currentRates(cards, await this.prisma.rateCardHistory.findMany());
  }

  async rates() {
    const [cards, overheads, s, usage] = await Promise.all([
      this.prisma.rateCard.findMany({ where: { isActive: true }, orderBy: { role: 'asc' } }),
      this.prisma.overheadRate.findMany({ where: { isActive: true }, orderBy: [{ fy: 'desc' }, { name: 'asc' }] }),
      this.budgets.getSettings(),
      this.prisma.bomOperation.groupBy({ by: ['rateCardId'], where: { rateCardId: { not: null } }, _count: { _all: true } }),
    ]);
    const fy = this.budgets.fyOf(new Date(), s.fyStartMonth);
    const cur = overheads.filter((o) => o.fy === fy);
    const poolTotal = cur.reduce((a, o) => a + n(o.poolAmount), 0);
    const bases = await this.prisma.overheadBase.findMany({ orderBy: { fy: 'desc' } });
    const baseOf = (y: number) => n(bases.find((b) => b.fy === y)?.baseHours);
    const hours = baseOf(fy);
    const used = new Map(usage.map((u) => [u.rateCardId, u._count._all]));
    const history = await this.prisma.rateCardHistory.findMany({ where: { rateCardId: { in: cards.map((c) => c.id) } }, orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }] });
    const now = this.currentRates(cards, history);
    return {
      current_fy: fy,
      cards: cards.map((c) => { const r = now.get(c.id)!; return { id: c.id, role: c.role, rate_per_hour: r.rate, effective_from: r.from, next_rate: r.next?.rate ?? null, next_from: r.next?.from ?? null, used_in: used.get(c.id) ?? 0 }; }),
      history: history.map((h) => ({ card_id: h.rateCardId, rate_per_hour: n(h.ratePerHour), effective_from: h.effectiveFrom, changed_by_name: h.changedByName })),
      base_hours: hours,
      bases: bases.map((b) => ({ fy: b.fy, base_hours: n(b.baseHours) })),
      overheads: overheads.map((o) => { const base = baseOf(o.fy); return { id: o.id, fy: o.fy, name: o.name, pool_amount: n(o.poolAmount), rate_per_hour: base > 0 ? r2(n(o.poolAmount) / base) : 0 }; }),
      combined_overhead_rate: hours > 0 ? r2(poolTotal / hours) : 0,
      pools_missing: cur.length === 0,
      base_missing: hours <= 0,
      fys: [...new Set([fy, fy + 1, ...overheads.map((o) => o.fy), ...bases.map((b) => b.fy)])].sort((a, b) => b - a),
    };
  }

  async saveRateCard(id: number | null, b: any, user?: Actor, dry = false) {
    const role = String(b.role ?? '').trim();
    const rate = Number(b.rate_per_hour);
    if (!role) throw bad('Role is required.');
    if (!(rate > 0)) throw bad('Enter an hourly rate above zero.');
    const same = await this.prisma.rateCard.findFirst({ where: { isActive: true, role: { equals: role, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) } });
    if (same) throw bad('There is already a rate for that role. Edit it instead.', HttpStatus.CONFLICT);
    const when = b.effective_from ? this.asDate(b.effective_from, 'the rate') : this.today();
    if (dry) return { id: id ?? 0 };
    const before = id ? await this.prisma.rateCard.findUnique({ where: { id } }) : null;
    let row;
    if (!before) {
      row = await this.prisma.rateCard.create({ data: { role, ratePerHour: rate, effectiveFrom: when } });
      await this.prisma.rateCardHistory.create({ data: { rateCardId: row.id, ratePerHour: rate, effectiveFrom: when, changedByName: user?.username ?? null } });
    } else {
      row = await this.prisma.rateCard.update({ where: { id: before.id }, data: { role } });
      // A new dated rate is added only when it differs from the rate that applies on that date
      const hist = await this.prisma.rateCardHistory.findMany({ where: { rateCardId: before.id } });
      const onDate = hist.filter((h) => h.effectiveFrom.getTime() <= when.getTime()).sort((a, c) => c.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
      if (!onDate || n(onDate.ratePerHour) !== rate) {
        await this.prisma.rateCardHistory.upsert({
          where: { rateCardId_effectiveFrom: { rateCardId: before.id, effectiveFrom: when } },
          update: { ratePerHour: rate, changedByName: user?.username ?? null },
          create: { rateCardId: before.id, ratePerHour: rate, effectiveFrom: when, changedByName: user?.username ?? null },
        });
      }
      // The role keeps the rate in force today on its own row, for anything that reads it directly
      const now = (await this.rateNow([row])).get(row.id)!;
      row = await this.prisma.rateCard.update({ where: { id: row.id }, data: { ratePerHour: now.rate, effectiveFrom: now.from } });
    }
    this.log('rate_cards', row.id, id ? 'UPDATE' : 'INSERT', user?.id, { role, rate_per_hour: rate, effective_from: when.toISOString().slice(0, 10) }, before ? { role: before.role, rate_per_hour: n(before.ratePerHour) } : undefined);
    return { id: row.id };
  }

  async removeRateCard(id: number, user?: Actor) {
    const used = await this.prisma.bomOperation.count({ where: { rateCardId: id } });
    const before = await this.prisma.rateCard.findUnique({ where: { id } });
    const old = before ? { role: before.role, rate_per_hour: n(before.ratePerHour) } : undefined;
    if (used) { await this.prisma.rateCard.update({ where: { id }, data: { isActive: false } }); this.log('rate_cards', id, 'ARCHIVE', user?.id, {}, old); return { archived: true }; }
    await this.prisma.rateCard.delete({ where: { id } });
    this.log('rate_cards', id, 'DELETE', user?.id, {}, old);
    return { archived: false };
  }

  async saveOverhead(id: number | null, b: any, user?: Actor) {
    const name = String(b.name ?? '').trim();
    if (!name) throw bad('Name is required.');
    if (!(Number(b.pool_amount) >= 0)) throw bad('Enter the cost of the pool for the year.');
    if (!Number.isInteger(Number(b.fy)) || Number(b.fy) < 2000 || Number(b.fy) > 2100) throw bad('Enter the financial year as a four-digit year.');
    const data = { fy: Number(b.fy), name, poolAmount: Number(b.pool_amount) };
    const same = await this.prisma.overheadRate.findFirst({ where: { fy: data.fy, isActive: true, name: { equals: name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) } });
    if (same) throw bad('There is already a pool with that name for the year. Edit it instead.', HttpStatus.CONFLICT);
    const before = id ? await this.prisma.overheadRate.findUnique({ where: { id } }) : null;
    const row = id ? await this.prisma.overheadRate.update({ where: { id }, data }) : await this.prisma.overheadRate.create({ data });
    this.log('overhead_rates', row.id, id ? 'UPDATE' : 'INSERT', user?.id, { fy: data.fy, name, pool_amount: data.poolAmount }, before ? { fy: before.fy, name: before.name, pool_amount: n(before.poolAmount) } : undefined);
    return { id: row.id };
  }

  // The base hours for a financial year, which every pool is recovered over
  async saveOverheadBase(fy: number, b: any, user?: Actor) {
    if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) throw bad('Enter the financial year as a four-digit year.');
    const hours = Number(b.base_hours);
    if (!(hours > 0)) throw bad('Enter the base hours for the year, above zero.');
    const before = await this.prisma.overheadBase.findUnique({ where: { fy } });
    await this.prisma.overheadBase.upsert({ where: { fy }, update: { baseHours: hours }, create: { fy, baseHours: hours } });
    this.log('overhead_bases', fy, before ? 'UPDATE' : 'INSERT', user?.id, { fy, base_hours: hours }, before ? { base_hours: n(before.baseHours) } : undefined);
    return { fy };
  }

  async removeOverhead(id: number, user?: Actor) {
    const before = await this.prisma.overheadRate.findUnique({ where: { id } });
    await this.prisma.overheadRate.delete({ where: { id } });
    this.log('overhead_rates', id, 'DELETE', user?.id, {}, before ? { fy: before.fy, name: before.name, pool_amount: n(before.poolAmount) } : undefined);
    return { deleted: true };
  }

  // ── Items ────────────────────────────────────────────────────────────────

  // Parts with their life (active, replaced or retired), alternates and any scheduled replacement. Pickers use the active ones; the Part master asks for all.
  // A project-only part is offered on that project's job BOM (projectId) and in the Part master (all), nowhere else
  async items(all = false, projectId?: number) {
    await this.applyDueReplacements();
    const rows = await this.prisma.item.findMany({ where: all ? {} : { isActive: true, OR: [{ projectId: null }, ...(projectId != null ? [{ projectId }] : [])] }, orderBy: { partNo: 'asc' } });
    const owners = new Map((await this.prisma.project.findMany({ where: { id: { in: rows.map((r) => r.projectId).filter((x): x is number => x != null) } }, select: { id: true, code: true } })).map((x) => [x.id, x.code]));
    const current = (await this.currentBoms()).map((b) => b.id);
    const usage = await this.prisma.bomLine.groupBy({ by: ['itemId'], where: { bomId: { in: current } }, _count: { _all: true } });
    const used = new Map(usage.map((u) => [u.itemId, u._count._all]));
    const ever = new Set((await this.prisma.bomLine.groupBy({ by: ['itemId'], _count: { _all: true } })).map((u) => u.itemId));
    const cats = new Map((await this.prisma.itemCategory.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
    const paid = new Map((await this.prisma.itemPriceLog.groupBy({ by: ['itemId'], _max: { paidOn: true } })).map((x) => [x.itemId, x._max.paidOn]));
    const pending = new Map((await this.prisma.partReplacement.findMany({ where: { status: 'SCHEDULED' }, include: { successor: { select: { id: true, partNo: true, name: true } } } })).map((r) => [r.itemId, r]));
    const successors = new Map((await this.prisma.item.findMany({ where: { id: { in: rows.map((r) => r.replacedById).filter((x): x is number => x != null) } }, select: { id: true, partNo: true, name: true } })).map((x) => [x.id, x]));
    const members = await this.prisma.item.findMany({ where: { alternateGroupId: { not: null }, isActive: true } });
    return rows.map((i) => {
      const next = pending.get(i.id); const by = i.replacedById != null ? successors.get(i.replacedById) : null;
      return {
        last_paid_on: paid.get(i.id) ?? null,
        id: i.id, part_no: i.partNo, name: i.name, category_id: i.categoryId, category_name: cats.get(i.categoryId ?? -1) ?? null, uom: i.uom, standard_price: n(i.standardPrice),
        last_price: i.lastPrice == null ? null : n(i.lastPrice), supplier: i.supplier, lead_time_days: i.leadTimeDays, sourcing: i.sourcing,
        material_cost: i.materialCost == null ? null : n(i.materialCost), manufacturing_cost: i.manufacturingCost == null ? null : n(i.manufacturingCost), used_in: used.get(i.id) ?? 0,
        price_drift_pct: i.lastPrice != null && n(i.standardPrice) > 0 ? r2(((n(i.lastPrice) - n(i.standardPrice)) / n(i.standardPrice)) * 100) : 0,
        oem_part_no: i.oemPartNo, status: i.status, status_from: i.statusFrom, status_reason: i.statusReason, replaced_by_id: i.replacedById, replaced_by_part_no: by?.partNo ?? null, replaced_by_name: by?.name ?? null,
        ever_used: ever.has(i.id),
        scheduled: next ? { id: next.id, effective_from: next.effectiveFrom, reason: next.reason, successor_id: next.successorId, successor_part_no: next.successor?.partNo ?? null, successor_name: next.successor?.name ?? null } : null,
        is_default_alternate: i.isDefaultAlternate,
        project_id: i.projectId, project_code: i.projectId != null ? owners.get(i.projectId) ?? null : null,
        alternates: i.alternateGroupId == null ? [] : members.filter((m) => m.alternateGroupId === i.alternateGroupId && m.id !== i.id).map((m) => ({
          id: m.id, part_no: m.partNo, oem_part_no: m.oemPartNo, name: m.name, standard_price: n(m.standardPrice), last_price: m.lastPrice == null ? null : n(m.lastPrice), supplier: m.supplier, lead_time_days: m.leadTimeDays, is_default: m.isDefaultAlternate,
        })).sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.part_no.localeCompare(b.part_no)),
      };
    });
  }

  async saveItem(id: number | null, b: any, user?: Actor, dry = false) {
    const partNo = String(b.part_no ?? '').trim().toUpperCase();
    const name = String(b.name ?? '').trim();
    if (!partNo || !name) throw bad('Part number and name are required.');
    const make = String(b.sourcing).toUpperCase() === 'MAKE';
    const material = Number(b.material_cost) || 0;
    const manufacturing = Number(b.manufacturing_cost) || 0;
    const oem = String(b.oem_part_no ?? '').trim();
    if (!make && !oem) throw bad('Enter the OEM part number: the number the manufacturer uses for the part.');
    if (oem.length > 60) throw bad('The OEM part number can be up to 60 characters.');
    const standard = make ? material + manufacturing : Number(b.standard_price);
    if (!(standard >= 0)) throw bad('Enter the standard price.');
    const hasLast = !(b.last_price === '' || b.last_price == null);
    if (hasLast && !(Number(b.last_price) >= 0)) throw bad('Last paid price must be a number, zero or more.');
    // Every part carries the days it takes to arrive (or to make), so a build order can be checked against its dates
    if (b.lead_time_days === '' || b.lead_time_days == null) throw bad('Enter the lead time in days. Zero means it is on hand.');
    if (!(Number.isInteger(Number(b.lead_time_days)) && Number(b.lead_time_days) >= 0 && Number(b.lead_time_days) <= 3650)) throw bad('Lead time must be a whole number of days, zero or more.');
    if (make && (!(material >= 0) || !(manufacturing >= 0))) throw bad('Material and manufacturing costs must be zero or more.');
    const clash = await this.prisma.item.findFirst({ where: { partNo, ...(id ? { NOT: { id } } : {}) } });
    if (clash) throw bad(clash.status === 'ACTIVE' ? 'Another item already has that part number.' : 'That part number belongs to a replaced or retired part. Part numbers are not reused, so use a new one.', HttpStatus.CONFLICT);
    const current = id ? await this.prisma.item.findUnique({ where: { id } }) : null;
    if (current && current.status !== 'ACTIVE') throw bad('A replaced or retired part cannot be edited.', HttpStatus.CONFLICT);
    const unit = String(b.uom || 'nos').slice(0, 12);
    if (current?.alternateGroupId != null && current.uom !== unit && (await this.prisma.item.count({ where: { alternateGroupId: current.alternateGroupId, isActive: true } })) > 1) throw bad('Alternates share a unit of measure. Remove this part from its alternates before changing the unit.', HttpStatus.CONFLICT);
    // Only a new part can be made project-only; an existing part keeps the scope it was created with
    const ownerId = current ? current.projectId : b.project_id === '' || b.project_id == null ? null : Number(b.project_id);
    if (!current && ownerId != null && !(await this.prisma.project.findUnique({ where: { id: ownerId }, select: { id: true } }))) throw bad('Project not found.', HttpStatus.NOT_FOUND);
    const data = {
      partNo, name, categoryId: await this.checkCategory(b.category_id), uom: String(b.uom || 'nos').slice(0, 12),
      ...(current ? {} : { projectId: ownerId }),
      standardPrice: standard, materialCost: make ? material : null, manufacturingCost: make ? manufacturing : null, lastPrice: b.last_price === '' || b.last_price == null ? null : Number(b.last_price),
      supplier: b.supplier?.trim() || null, leadTimeDays: Number(b.lead_time_days),
      sourcing: make ? 'MAKE' : 'BUY', oemPartNo: make ? null : oem,
    };
    const target = id;
    if (dry) return { id: target ?? 0 };
    const before = target ? await this.prisma.item.findUnique({ where: { id: target } }) : null;
    const row = target ? await this.prisma.item.update({ where: { id: target }, data }) : await this.prisma.item.create({ data });
    // Alternates are bought parts: a part that becomes made leaves its alternates
    if (row.sourcing === 'MAKE' && row.alternateGroupId != null) await this.leaveAlternates(this.prisma, row.id);
    if (data.lastPrice != null && (before?.lastPrice == null || n(before.lastPrice) !== data.lastPrice)) {
      await this.prisma.itemPriceLog.create({ data: { itemId: row.id, price: data.lastPrice, paidOn: this.today(), supplier: data.supplier, note: 'Entered on the part', recordedByName: user?.username ?? null } });
    }
    this.log('items', row.id, id ? 'UPDATE' : 'INSERT', user?.id, { part_no: partNo, name, sourcing: data.sourcing, standard_price: standard, last_price: data.lastPrice, oem_part_no: data.oemPartNo }, before ? { part_no: before.partNo, name: before.name, sourcing: before.sourcing, standard_price: n(before.standardPrice), last_price: before.lastPrice == null ? null : n(before.lastPrice), oem_part_no: before.oemPartNo } : undefined);
    return { id: row.id };
  }

  private async checkCategory(v: any): Promise<number | null> {
    if (v === '' || v == null) return null;
    const c = await this.prisma.itemCategory.findFirst({ where: { id: Number(v), isActive: true } });
    if (!c) throw bad('That part category does not exist. Pick one from the list.');
    return c.id;
  }

  // A part that has been on a BOM, or has a replacement history, is replaced or retired instead, so its history stays
  async removeItem(id: number, user?: Actor) {
    const onBoms = await this.prisma.bomLine.count({ where: { itemId: id } });
    const history = await this.prisma.partReplacement.count({ where: { OR: [{ itemId: id }, { successorId: id }] } });
    if (onBoms || history) throw bad('This part has been on a BOM or has a replacement history, so it cannot be deleted. Replace or retire it instead.', HttpStatus.CONFLICT);
    const before = await this.prisma.item.findUnique({ where: { id } });
    if (!before) throw bad('Part not found.', HttpStatus.NOT_FOUND);
    await this.leaveAlternates(this.prisma, id);
    await this.prisma.item.delete({ where: { id } });
    this.log('items', id, 'DELETE', user?.id, {}, { part_no: before.partNo, name: before.name });
    return { deleted: true };
  }


  // ── Part life: replace or retire on a date, alternates and history ───────

  // The BOM version in force for each product and each job: the latest one (a new version only exists once it is due)
  private async currentBoms() {
    const all = await this.prisma.bom.findMany({ where: { buildOrderId: null }, select: { id: true, productId: true, projectId: true, version: true } });
    const best = new Map<string, (typeof all)[number]>();
    for (const b of all) {
      const key = b.productId != null ? `P${b.productId}` : `J${b.projectId}`;
      const cur = best.get(key);
      if (!cur || b.version > cur.version) best.set(key, b);
    }
    return [...best.values()];
  }

  // A part leaves its alternates. The default passes to another member; a group left with one part is dissolved.
  // The successor of a replaced part takes its place in the group when it is not in one already.
  private async leaveAlternates(db: any, itemId: number, successorId?: number | null) {
    const it = await db.item.findUnique({ where: { id: itemId } });
    if (!it || it.alternateGroupId == null) return;
    const group = it.alternateGroupId;
    const rest = await db.item.findMany({ where: { alternateGroupId: group, id: { not: itemId }, isActive: true }, orderBy: { partNo: 'asc' } });
    const ids = rest.map((r: any) => r.id);
    await db.item.update({ where: { id: itemId }, data: { alternateGroupId: null, isDefaultAlternate: false } });
    if (successorId != null) {
      const succ = await db.item.findUnique({ where: { id: successorId } });
      if (succ && succ.alternateGroupId == null && succ.sourcing === 'BUY') {
        await db.item.update({ where: { id: successorId }, data: { alternateGroupId: group, isDefaultAlternate: it.isDefaultAlternate } });
        ids.push(successorId);
        return;
      }
    }
    if (ids.length <= 1) { await db.item.updateMany({ where: { id: { in: ids } }, data: { alternateGroupId: null, isDefaultAlternate: false } }); return; }
    if (it.isDefaultAlternate && !rest.some((r: any) => r.isDefaultAlternate)) await db.item.update({ where: { id: rest[0].id }, data: { isDefaultAlternate: true } });
  }

  // Replace a part with another on a date, or retire it when there is no replacement. A date that has come is applied at once; a later one waits.
  async replacePart(id: number, b: any, user: Actor) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw bad('Part not found.', HttpStatus.NOT_FOUND);
    if (item.status !== 'ACTIVE') throw bad('That part has already been replaced or retired.', HttpStatus.CONFLICT);
    if (await this.prisma.partReplacement.findFirst({ where: { itemId: id, status: 'SCHEDULED' } })) throw bad('A replacement is already scheduled for this part. Cancel it first.', HttpStatus.CONFLICT);
    if (await this.prisma.partReplacement.findFirst({ where: { successorId: id, status: 'SCHEDULED' } })) throw bad('This part is due to take over from another part. Cancel that replacement first.', HttpStatus.CONFLICT);
    const successorId = b.successor_id === '' || b.successor_id == null ? null : Number(b.successor_id);
    let succ: any = null;
    if (successorId != null) {
      if (successorId === id) throw bad('A part cannot replace itself.');
      succ = await this.prisma.item.findUnique({ where: { id: successorId } });
      if (!succ || succ.status !== 'ACTIVE') throw bad('Choose an active part as the replacement.');
      if (succ.projectId != null && succ.projectId !== item.projectId) throw bad('That part is for one project only, so it cannot replace this one.');
      if (succ.uom !== item.uom) throw bad(`The replacement is measured in ${succ.uom} and this part in ${item.uom}. Make the units match first.`);
      if (await this.prisma.partReplacement.findFirst({ where: { itemId: successorId, status: 'SCHEDULED' } })) throw bad('The replacement part is itself due to be replaced. Choose another part.', HttpStatus.CONFLICT);
    }
    const when = this.asDate(b.effective_from, 'the effective date');
    if (when.getTime() < this.today().getTime()) throw bad('The effective date cannot be in the past.');
    const reason = String(b.reason ?? '').trim();
    if (!reason) throw bad('Give a reason.');
    const row = await this.prisma.partReplacement.create({ data: { itemId: id, successorId, effectiveFrom: when, reason: reason.slice(0, 300), createdById: user.id, createdByName: user.username ?? null } });
    let applied: number | null = null;
    if (when.getTime() <= this.today().getTime()) applied = await this.applyReplacement(row.id, user.id);
    return { id: row.id, applied: applied != null, boms_changed: applied ?? 0 };
  }

  async cancelReplacement(id: number, user: Actor) {
    const r = await this.prisma.partReplacement.findUnique({ where: { id } });
    if (!r) throw bad('Replacement not found.', HttpStatus.NOT_FOUND);
    if (r.status !== 'SCHEDULED') throw bad('Only a scheduled replacement can be cancelled.', HttpStatus.CONFLICT);
    await this.prisma.partReplacement.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    return { id };
  }

  // Replacements that have come due are applied when parts or products are read, and every hour
  async applyDueReplacements() {
    const due = await this.prisma.partReplacement.findMany({ where: { status: 'SCHEDULED', effectiveFrom: { lte: this.today() } }, orderBy: { effectiveFrom: 'asc' }, select: { id: true } });
    for (const d of due) await this.applyReplacement(d.id);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async applyDueReplacementsJob() { await this.applyDueReplacements().catch(() => undefined); }

  // Every BOM now in force that uses the part gets a new version from the date: the successor in place of the part, or without it when retired.
  // The old version is kept, so what a product was made of is never lost. Approved standard costs are snapshots and do not change.
  private async applyReplacement(repId: number, userId?: number): Promise<number | null> {
    const rep = await this.prisma.partReplacement.findUnique({ where: { id: repId }, include: { item: true, successor: true } });
    if (!rep || rep.status !== 'SCHEDULED') return null;
    const current = await this.currentBoms();
    const lines = await this.prisma.bomLine.findMany({ where: { itemId: rep.itemId, bomId: { in: current.map((b) => b.id) } }, select: { bomId: true } });
    const bomIds = [...new Set(lines.map((l) => l.bomId))];
    const jobs: number[] = [];
    const note = rep.successor ? `${rep.item.partNo} replaced by ${rep.successor.partNo}` : `${rep.item.partNo} retired`;
    let changed = 0;
    const claimed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.partReplacement.updateMany({ where: { id: repId, status: 'SCHEDULED' }, data: { status: 'APPLIED', appliedAt: new Date() } });
      if (claim.count === 0) return false;
      for (const bomId of bomIds) {
        const old = await tx.bom.findUnique({ where: { id: bomId }, include: { lines: true, operations: true } });
        if (!old) continue;
        const next = await tx.bom.create({ data: {
          productId: old.productId, projectId: old.projectId, version: old.version + 1, status: 'DRAFT', freightPct: old.freightPct, warrantyPct: old.warrantyPct,
          overheadRateOverride: old.overheadRateOverride, adjustReason: old.adjustReason, effectiveFrom: rep.effectiveFrom, changeNote: note,
        } });
        const keep = old.lines.filter((l) => l.itemId !== rep.itemId || rep.successorId != null);
        if (keep.length) await tx.bomLine.createMany({ data: keep.map((l) => ({
          bomId: next.id, itemId: l.itemId === rep.itemId ? (rep.successorId as number) : l.itemId, groupName: l.groupName, sequence: l.sequence, quantity: l.quantity, scrapPct: l.scrapPct,
        })) });
        if (old.operations.length) await tx.bomOperation.createMany({ data: old.operations.map((o) => ({
          bomId: next.id, name: o.name, hours: o.hours, rateCardId: o.rateCardId, outsourcedCost: o.outsourcedCost, fixedCost: o.fixedCost, operationTypeId: o.operationTypeId, sequence: o.sequence,
        })) });
        if (old.projectId != null) jobs.push(old.projectId);
        changed++;
      }
      await this.leaveAlternates(tx, rep.itemId, rep.successorId);
      await tx.item.update({ where: { id: rep.itemId }, data: { status: rep.successorId != null ? 'REPLACED' : 'RETIRED', statusFrom: rep.effectiveFrom, statusReason: rep.reason, replacedById: rep.successorId, isActive: false } });
      await tx.partReplacement.update({ where: { id: repId }, data: { bomsChanged: changed } });
      return true;
    });
    if (!claimed) return null;
    for (const j of jobs) await this.syncJobEstimate(j);
    return changed;
  }

  // Parts that meet the same spec: bought parts with the same unit. The first part added becomes the default.
  async addAlternate(id: number, b: any, user: Actor) {
    const altId = Number(b.alternate_id);
    if (!Number.isInteger(altId) || altId === id) throw bad('Choose another part.');
    const [a, c] = await Promise.all([this.prisma.item.findUnique({ where: { id } }), this.prisma.item.findUnique({ where: { id: altId } })]);
    if (!a || !c) throw bad('Part not found.', HttpStatus.NOT_FOUND);
    if (a.status !== 'ACTIVE' || c.status !== 'ACTIVE') throw bad('Alternates must be active parts.');
    if (a.sourcing !== 'BUY' || c.sourcing !== 'BUY') throw bad('Only bought parts have alternates.');
    if (a.projectId != null || c.projectId != null) throw bad('A part for one project only cannot be an alternate.');
    if (a.uom !== c.uom) throw bad(`The alternate is measured in ${c.uom} and this part in ${a.uom}. Alternates must share a unit.`);
    if (c.alternateGroupId != null) throw bad(c.alternateGroupId === a.alternateGroupId ? 'That part is already an alternate.' : 'That part is already an alternate of another part. Remove it from there first.', HttpStatus.CONFLICT);
    const group = a.alternateGroupId ?? a.id;
    await this.prisma.$transaction([
      ...(a.alternateGroupId == null ? [this.prisma.item.update({ where: { id: a.id }, data: { alternateGroupId: group, isDefaultAlternate: true } })] : []),
      this.prisma.item.update({ where: { id: c.id }, data: { alternateGroupId: group, isDefaultAlternate: false } }),
    ]);
    this.log('items', a.id, 'ALT_ADD', user.id, { alternate: c.partNo });
    this.log('items', c.id, 'ALT_ADD', user.id, { alternate: a.partNo });
    return { group };
  }

  async setDefaultAlternate(id: number, user: Actor) {
    const it = await this.prisma.item.findUnique({ where: { id } });
    if (!it || it.alternateGroupId == null) throw bad('This part has no alternates.', HttpStatus.CONFLICT);
    await this.prisma.$transaction([
      this.prisma.item.updateMany({ where: { alternateGroupId: it.alternateGroupId }, data: { isDefaultAlternate: false } }),
      this.prisma.item.update({ where: { id }, data: { isDefaultAlternate: true } }),
    ]);
    this.log('items', id, 'ALT_DEFAULT', user.id, { part_no: it.partNo });
    return { id };
  }

  async removeAlternate(id: number, user: Actor) {
    const it = await this.prisma.item.findUnique({ where: { id } });
    if (!it || it.alternateGroupId == null) throw bad('This part has no alternates.', HttpStatus.CONFLICT);
    await this.prisma.$transaction(async (tx) => { await this.leaveAlternates(tx, id); });
    this.log('items', id, 'ALT_REMOVE', user.id, { part_no: it.partNo });
    return { id };
  }

  // What happened to a part, newest first: edits, purchases, replacements and alternates
  async partHistory(id: number) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw bad('Part not found.', HttpStatus.NOT_FOUND);
    const [logs, prices, reps] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { tableName: 'items', recordId: id }, orderBy: { changedAt: 'desc' }, take: 200, include: { user: { select: { username: true } } } }),
      this.prisma.itemPriceLog.findMany({ where: { itemId: id }, orderBy: [{ paidOn: 'desc' }, { id: 'desc' }], take: 100 }),
      this.prisma.partReplacement.findMany({ where: { OR: [{ itemId: id }, { successorId: id }] }, include: { item: { select: { partNo: true } }, successor: { select: { partNo: true } } }, orderBy: { id: 'desc' } }),
    ]);
    const ev: { at: Date; kind: string; text: string; by: string | null }[] = [];
    const parse = (v: string | null) => { try { return v ? JSON.parse(v) : {}; } catch { return {}; } };
    const LABEL: Record<string, string> = { part_no: 'Part number', oem_part_no: 'OEM part number', name: 'Name', sourcing: 'Make or buy', standard_price: 'Standard price', last_price: 'Last paid price' };
    const day = (d: Date) => d.toISOString().slice(0, 10);
    for (const l of logs) {
      const now = parse(l.newValues); const was = parse(l.oldValues);
      if (l.action === 'INSERT') ev.push({ at: l.changedAt, kind: 'ADDED', text: 'Part added', by: l.user?.username ?? null });
      else if (l.action === 'UPDATE') {
        const diffs = Object.keys(LABEL).filter((k) => was[k] !== undefined && now[k] !== undefined && String(was[k]) !== String(now[k])).map((k) => `${LABEL[k]} ${was[k] ?? 'blank'} to ${now[k] ?? 'blank'}`);
        ev.push({ at: l.changedAt, kind: 'EDITED', text: diffs.length ? diffs.join('. ') : 'Details edited', by: l.user?.username ?? null });
      } else if (l.action === 'ALT_ADD') ev.push({ at: l.changedAt, kind: 'ALTERNATE', text: `Alternate added: ${now.alternate}`, by: l.user?.username ?? null });
      else if (l.action === 'ALT_DEFAULT') ev.push({ at: l.changedAt, kind: 'ALTERNATE', text: 'Made the default alternate', by: l.user?.username ?? null });
      else if (l.action === 'ALT_REMOVE') ev.push({ at: l.changedAt, kind: 'ALTERNATE', text: 'Removed from its alternates', by: l.user?.username ?? null });
      else if (l.action === 'ARCHIVE') ev.push({ at: l.changedAt, kind: 'RETIRED', text: 'Archived', by: l.user?.username ?? null });
      else if (l.action === 'RESTORE') ev.push({ at: l.changedAt, kind: 'ADDED', text: 'Brought back', by: l.user?.username ?? null });
    }
    for (const p of prices) {
      if (p.note === 'Entered on the part') continue;
      ev.push({ at: p.paidOn, kind: 'PURCHASE', text: `Bought at ${n(p.price)}${p.supplier ? ` from ${p.supplier}` : ''}${p.note ? `. ${p.note}` : ''}`, by: p.recordedByName });
    }
    for (const r of reps) {
      const mine = r.itemId === id;
      const other = mine ? r.successor?.partNo : r.item.partNo;
      if (mine) ev.push({ at: r.createdAt, kind: 'REPLACEMENT', text: `${r.successorId ? `Replacement by ${other}` : 'Retirement'} scheduled from ${day(r.effectiveFrom)}. Reason: ${r.reason}`, by: r.createdByName });
      else ev.push({ at: r.createdAt, kind: 'REPLACEMENT', text: `Set to take over from ${other} from ${day(r.effectiveFrom)}`, by: r.createdByName });
      if (r.appliedAt) ev.push({ at: r.appliedAt, kind: 'REPLACEMENT', text: mine ? `${r.successorId ? `Replaced by ${other}` : 'Retired'}. ${r.bomsChanged} BOM${r.bomsChanged === 1 ? '' : 's'} got a new version` : `Took over from ${other}`, by: null });
      if (r.cancelledAt) ev.push({ at: r.cancelledAt, kind: 'REPLACEMENT', text: 'Scheduled replacement cancelled', by: null });
    }
    return ev.sort((a, b) => b.at.getTime() - a.at.getTime()).map((e) => ({ at: e.at, kind: e.kind, text: e.text, by: e.by }));
  }

  // Record what was paid for a part; the newest entry becomes its last paid price
  async recordPurchase(id: number, b: any, user?: Actor) {
    const it = await this.prisma.item.findUnique({ where: { id } });
    if (!it) throw bad('Part not found.', HttpStatus.NOT_FOUND);
    if (b.price === '' || b.price == null || !(Number(b.price) >= 0)) throw bad('Enter the price paid, zero or more.');
    const price = Number(b.price);
    const paidOn = b.paid_on ? this.asDate(b.paid_on, 'the purchase') : this.today();
    if (paidOn.getTime() > this.today().getTime()) throw bad('The purchase date cannot be in the future.');
    const supplier = String(b.supplier ?? '').trim().slice(0, 150) || null;
    const entry = await this.prisma.itemPriceLog.create({ data: { itemId: id, price, paidOn, supplier, note: String(b.note ?? '').trim().slice(0, 200) || null, recordedByName: user?.username ?? null } });
    const latest = await this.prisma.itemPriceLog.findFirst({ where: { itemId: id }, orderBy: [{ paidOn: 'desc' }, { id: 'desc' }] });
    const isLatest = latest?.id === entry.id;
    const makeStandard = !!b.make_standard && isLatest && it.sourcing === 'BUY';
    await this.prisma.item.update({ where: { id }, data: { lastPrice: latest!.price, ...(isLatest && supplier ? { supplier } : {}), ...(makeStandard ? { standardPrice: price } : {}) } });
    this.log('items', id, 'PURCHASE', user?.id, { price, paid_on: paidOn.toISOString().slice(0, 10), supplier, standard_price: makeStandard ? price : undefined }, { last_price: it.lastPrice == null ? null : n(it.lastPrice), standard_price: n(it.standardPrice) });
    return { id: entry.id, standard_changed: makeStandard };
  }

  async itemPrices(id: number) {
    const rows = await this.prisma.itemPriceLog.findMany({ where: { itemId: id }, orderBy: [{ paidOn: 'desc' }, { id: 'desc' }], take: 10 });
    return rows.map((r) => ({ id: r.id, price: n(r.price), paid_on: r.paidOn, supplier: r.supplier, note: r.note, recorded_by_name: r.recordedByName }));
  }

  private importRows(b: any) {
    const rows = Array.isArray(b?.rows) ? b.rows : [];
    if (!rows.length) throw bad('The file has no rows.');
    if (rows.length > 2000) throw bad('Import up to 2,000 rows at a time.');
    return rows as Record<string, any>[];
  }

  // Parts from a CSV: rows are checked first and nothing is saved unless every row passes
  async importItems(b: any, user: Actor) {
    const rows = this.importRows(b);
    const dry = b.dry_run !== false;
    const byNo = new Map((await this.prisma.item.findMany()).map((i) => [i.partNo, i]));
    const catByName = new Map((await this.prisma.itemCategory.findMany({ where: { isActive: true } })).map((c) => [c.name.toLowerCase(), c.id]));
    const seen = new Set<string>();
    const errors: { row: number; message: string }[] = [];
    const plan: { id: number | null; body: any }[] = [];
    let created = 0; let updated = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; const row = i + 2;
      if (r.sourcing === undefined && r.make_or_buy !== undefined) r.sourcing = r.make_or_buy;
      // A category is named in the file and matched to the list; blank keeps the current one
      const catName = String(r.category ?? '').trim();
      const catId = catName ? catByName.get(catName.toLowerCase()) : undefined;
      if (catName && catId === undefined) { errors.push({ row: i + 2, message: `"${catName}" is not a category. Add it under Part categories first.` }); continue; }
      const blank = (k: string) => r[k] === undefined || r[k] === null || String(r[k]).trim() === '';
      const partNo = String(r.part_no ?? '').trim().toUpperCase();
      if (!partNo) { errors.push({ row, message: 'Part number is missing.' }); continue; }
      if (seen.has(partNo)) { errors.push({ row, message: `${partNo} appears more than once in the file.` }); continue; }
      seen.add(partNo);
      const ex = byNo.get(partNo);
      const pick = (k: string, cur: any) => (blank(k) ? cur : r[k]);
      const sourcing = String(pick('sourcing', ex?.sourcing ?? 'BUY')).trim().toUpperCase();
      if (sourcing !== 'BUY' && sourcing !== 'MAKE') { errors.push({ row, message: 'Make or buy must be Buy or Make.' }); continue; }
      if (!ex && sourcing === 'BUY' && blank('standard_price')) { errors.push({ row, message: 'Standard price is missing for a new bought part.' }); continue; }
      if (!ex && sourcing === 'MAKE' && blank('material_cost') && blank('manufacturing_cost')) { errors.push({ row, message: 'A new made part needs a material or manufacturing cost.' }); continue; }
      const body = {
        part_no: partNo, name: pick('name', ex?.name ?? ''), sourcing, uom: pick('uom', ex?.uom ?? 'nos'),
        standard_price: pick('standard_price', ex ? n(ex.standardPrice) : ''),
        material_cost: pick('material_cost', ex?.materialCost == null ? '' : n(ex.materialCost)), manufacturing_cost: pick('manufacturing_cost', ex?.manufacturingCost == null ? '' : n(ex.manufacturingCost)),
        oem_part_no: pick('oem_part_no', ex?.oemPartNo ?? ''), last_price: pick('last_price', ex?.lastPrice == null ? '' : n(ex.lastPrice)), supplier: pick('supplier', ex?.supplier ?? ''), lead_time_days: pick('lead_time_days', ex?.leadTimeDays ?? ''),
        category_id: catId ?? ex?.categoryId ?? null,
      };
      const id = ex?.status === 'ACTIVE' ? ex.id : null;
      try { await this.saveItem(id, body, user, true); } catch (e: any) { errors.push({ row, message: e?.message ?? 'Row is not valid.' }); continue; }
      plan.push({ id, body });
      if (ex?.status === 'ACTIVE') updated++; else created++;
    }
    if (errors.length || dry) return { dry_run: true, created, updated, errors, applied: false };
    for (const x of plan) await this.saveItem(x.id, x.body, user);
    return { dry_run: false, created, updated, errors: [], applied: true };
  }

  // Labour rates from a CSV, by role; a new rate for an existing role is dated by effective_from (today if blank)
  async importRates(b: any, user: Actor) {
    const rows = this.importRows(b);
    const dry = b.dry_run !== false;
    const cards = await this.prisma.rateCard.findMany({ where: { isActive: true } });
    const now = await this.rateNow(cards);
    const byRole = new Map(cards.map((c) => [c.role.toLowerCase(), c]));
    const seen = new Set<string>();
    const errors: { row: number; message: string }[] = [];
    const plan: { id: number | null; body: any }[] = [];
    let created = 0; let updated = 0; let unchanged = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; const row = i + 2;
      const role = String(r.role ?? '').trim();
      if (!role) { errors.push({ row, message: 'Role is missing.' }); continue; }
      if (seen.has(role.toLowerCase())) { errors.push({ row, message: `${role} appears more than once in the file.` }); continue; }
      seen.add(role.toLowerCase());
      const ex = byRole.get(role.toLowerCase());
      const body = { role, rate_per_hour: r.rate_per_hour, effective_from: r.effective_from === undefined || String(r.effective_from).trim() === '' ? undefined : r.effective_from };
      try { await this.saveRateCard(ex?.id ?? null, body, user, true); } catch (e: any) { errors.push({ row, message: e?.message ?? 'Row is not valid.' }); continue; }
      if (ex && !body.effective_from && now.get(ex.id)?.rate === Number(r.rate_per_hour)) { unchanged++; continue; }
      plan.push({ id: ex?.id ?? null, body });
      if (ex) updated++; else created++;
    }
    if (errors.length || dry) return { dry_run: true, created, updated, unchanged, errors, applied: false };
    for (const x of plan) await this.saveRateCard(x.id, x.body, user);
    return { dry_run: false, created, updated, unchanged, errors: [], applied: true };
  }

  async itemCategories() {
    const rows = await this.prisma.itemCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const used = await this.prisma.item.groupBy({ by: ['categoryId'], where: { categoryId: { not: null } }, _count: { _all: true } });
    const counts = new Map(used.map((u) => [u.categoryId, u._count._all]));
    return rows.map((c) => ({ id: c.id, name: c.name, used_in: counts.get(c.id) ?? 0 }));
  }

  async saveItemCategory(id: number | null, b: any, user?: Actor) {
    const name = String(b.name ?? '').trim();
    if (!name) throw bad('Enter the name of the category.');
    if (name.length > 60) throw bad('Keep the category name to 60 characters or fewer.');
    const clash = await this.prisma.itemCategory.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) } });
    if (clash?.isActive) throw bad('There is already a category with that name.', HttpStatus.CONFLICT);
    if (clash && !id) {
      await this.prisma.itemCategory.update({ where: { id: clash.id }, data: { isActive: true, name } });
      this.log('item_categories', clash.id, 'RESTORE', user?.id, { name });
      return { id: clash.id };
    }
    const row = id ? await this.prisma.itemCategory.update({ where: { id }, data: { name } }) : await this.prisma.itemCategory.create({ data: { name } });
    this.log('item_categories', row.id, id ? 'UPDATE' : 'INSERT', user?.id, { name });
    return { id: row.id };
  }

  async removeItemCategory(id: number, user?: Actor) {
    const used = await this.prisma.item.count({ where: { categoryId: id } });
    const before = await this.prisma.itemCategory.findUnique({ where: { id } });
    // A category in use is archived; its parts keep it and it leaves the pickers
    if (used) { await this.prisma.itemCategory.update({ where: { id }, data: { isActive: false } }); this.log('item_categories', id, 'ARCHIVE', user?.id, {}, { name: before?.name }); return { archived: true }; }
    await this.prisma.itemCategory.delete({ where: { id } });
    this.log('item_categories', id, 'DELETE', user?.id, {}, { name: before?.name });
    return { archived: false };
  }

  // Where a part is used: the products and job BOMs that have a line for it
  async itemUsage(id: number) {
    await this.applyDueReplacements();
    const current = (await this.currentBoms()).map((b) => b.id);
    const item = await this.prisma.item.findUnique({ where: { id }, select: { standardPrice: true } });
    const price = item ? n(item.standardPrice) : 0;
    const lines = await this.prisma.bomLine.findMany({ where: { itemId: id, bomId: { in: current } }, include: { bom: true }, orderBy: { id: 'asc' } });
    const productIds = lines.map((l) => l.bom.productId).filter((x): x is number => x != null);
    const projectIds = lines.map((l) => l.bom.projectId).filter((x): x is number => x != null);
    const [products, projects] = await Promise.all<{ id: number; code: string | null; name: string; client: { name: string } | null }[]>([
      productIds.length ? this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, code: true, name: true, client: { select: { name: true } } } }) : [],
      projectIds.length ? this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true, name: true, client: { select: { name: true } } } }) : [],
    ]);
    const used = lines.map((l) => {
      const prod = l.bom.productId != null ? products.find((x) => x.id === l.bom.productId) : null;
      const proj = l.bom.projectId != null ? projects.find((x) => x.id === l.bom.projectId) : null;
      const o = prod ?? proj;
      const quantity = n(l.quantity); const scrap = n(l.scrapPct);
      // What the line adds to one unit of the product (or one job), at the part's standard price and with scrap
      return { kind: prod ? 'PRODUCT' : 'JOB', id: o?.id ?? 0, code: o?.code ?? null, name: o?.name ?? 'Unknown', client_name: o?.client?.name ?? null, quantity, scrap_pct: scrap, line_cost: r2(quantity * (1 + scrap / 100) * price) };
    });
    // Open build orders hold their own copy of the part; they are listed so nobody is surprised that a replacement does not reach them
    const orderLines = await this.prisma.bomLine.findMany({ where: { itemId: id, bom: { buildOrder: { status: { in: ['COMMITTED', 'RELEASED', 'IN_BUILD'] } } } }, include: { bom: { include: { buildOrder: { include: { client: { select: { name: true } } } } } } }, orderBy: { id: 'asc' } });
    const onOrders = orderLines.map((l) => {
      const o = l.bom.buildOrder!;
      const quantity = n(l.quantity); const scrap = n(l.scrapPct);
      return { kind: 'ORDER', id: o.id, code: o.code, name: `${o.quantity} unit${o.quantity === 1 ? '' : 's'}`, client_name: o.client?.name ?? null, quantity, scrap_pct: scrap, line_cost: r2(quantity * (1 + scrap / 100) * price) };
    });
    return [...used, ...onOrders];
  }

  // ── Projects: estimate, milestones, earned value ─────────────────────────

  private estimateTotals(est: any, lines: any[]) {
    const direct = lines.reduce((a, l) => a + n(l.quantity) * n(l.rate), 0);
    const contingency = direct * (n(est?.contingencyPct) / 100);
    const warranty = (direct + contingency) * (n(est?.warrantyPct) / 100);
    return { direct: r2(direct), contingency: r2(contingency), warranty: r2(warranty), total: r2(direct + contingency + warranty) };
  }

  async projects() {
    const [projects, ests, spend, bases] = await Promise.all([
      this.prisma.project.findMany({ where: { isActive: true, isSystem: false }, orderBy: { name: 'asc' }, include: { client: { select: { name: true } } } }),
      this.prisma.costEstimate.findMany({ include: { lines: true }, orderBy: { version: 'desc' } }),
      this.budgets.partsWhere({ status: 'APPROVED', projectId: { not: null } }),
      this.prisma.estimateBaseline.findMany({ where: { status: { in: ['PROPOSED', 'APPROVED'] } }, select: { projectId: true, status: true } }),
    ]);
    const ac = new Map<number, number>();
    for (const p of spend) if (p.projectId) ac.set(p.projectId, (ac.get(p.projectId) ?? 0) + p.amount);
    // The standard product a project's current job BOM was started from, if it has one
    const jobBoms = await this.prisma.bom.findMany({ where: { projectId: { not: null } }, orderBy: { version: 'desc' }, select: { projectId: true, sourceProductId: true } });
    const productsOf = new Map<number, number[]>();
    for (const b of jobBoms) if (b.projectId != null && !productsOf.has(b.projectId)) productsOf.set(b.projectId, b.sourceProductId != null ? [b.sourceProductId] : []);
    const named = new Map((await this.prisma.product.findMany({ where: { id: { in: [...productsOf.values()].flat() } }, select: { id: true, code: true, name: true } })).map((x) => [x.id, x]));
    return projects.map((p) => {
      const est = ests.find((e) => e.projectId === p.id);
      const t = est ? this.estimateTotals(est, est.lines) : null;
      const cv = p.contractValue == null ? null : n(p.contractValue);
      const mine = bases.filter((b) => b.projectId === p.id);
      const state = mine.some((b) => b.status === 'APPROVED') ? 'BASELINE' : mine.some((b) => b.status === 'PROPOSED') ? 'PROPOSED' : est ? 'DRAFT' : null;
      return {
        id: p.id, code: p.code, name: p.name, client_name: p.client?.name ?? null, contract_value: cv, target_margin_pct: p.targetMarginPct == null ? null : n(p.targetMarginPct), min_margin_pct: p.minMarginPct == null ? null : n(p.minMarginPct),
        products: (productsOf.get(p.id) ?? []).flatMap((id) => { const x = named.get(id); return x ? [{ id: x.id, code: x.code, name: x.name }] : []; }),
        risk_rating: p.riskRating, estimate_status: state, estimate_total: t?.total ?? null, actual: r2(ac.get(p.id) ?? 0),
        projected_margin_pct: cv && t ? r2(((cv - t.total) / cv) * 100) : null,
      };
    });
  }

  private async projectOrThrow(id: number) {
    const p = await this.prisma.project.findUnique({ where: { id }, include: { client: { select: { name: true } }, type: { select: { code: true, name: true, hasJobBom: true } } } });
    if (!p) throw bad('Project not found.', HttpStatus.NOT_FOUND);
    return p;
  }

  async project(id: number) {
    const p = await this.projectOrThrow(id);
    const [est, milestones, spend, lk, rates, baseRows] = await Promise.all([
      this.prisma.costEstimate.findFirst({ where: { projectId: id }, orderBy: { version: 'desc' }, include: { lines: { orderBy: { id: 'asc' } } } }),
      this.prisma.projectMilestone.findMany({ where: { projectId: id }, orderBy: { plannedDate: 'asc' } }),
      this.budgets.partsWhere({ status: 'APPROVED', projectId: id }),
      this.prisma.categoryType.findMany({ select: { id: true, name: true, code: true } }),
      this.rates(),
      this.prisma.estimateBaseline.findMany({ where: { projectId: id }, orderBy: { id: 'desc' } }),
    ]);
    const types = new Map(lk.map((t) => [t.id, t]));
    const lines = (est?.lines ?? []).map((l) => ({
      id: l.id, phase: l.phase, type_id: l.typeId, type_label: l.typeId ? [types.get(l.typeId)?.code, types.get(l.typeId)?.name].filter(Boolean).join(' ') : '',
      description: l.description, quantity: n(l.quantity), unit: l.unit, rate: n(l.rate), amount: r2(n(l.quantity) * n(l.rate)), basis: l.basis, managed: l.basis === JOB_BASIS,
    }));
    const t = est ? this.estimateTotals(est, est.lines) : { direct: 0, contingency: 0, warranty: 0, total: 0 };
    const cv = p.contractValue == null ? null : n(p.contractValue);
    const phases = [...new Set(lines.map((l) => l.phase))].map((ph) => ({ phase: ph, amount: r2(lines.filter((l) => l.phase === ph).reduce((a, l) => a + l.amount, 0)) }));

    // Earned value is measured on the approved baseline's direct cost, or on the live estimate until one is approved
    const baselines = baseRows.map((b) => ({
      id: b.id, status: b.status, direct: n(b.direct), contingency: n(b.contingency), warranty: n(b.warranty), total: n(b.total), line_count: Array.isArray(b.lines) ? b.lines.length : 0,
      proposed_by_name: b.proposedByName, created_at: b.createdAt, approved_by_name: b.approvedByName, approved_at: b.approvedAt,
      rejected_by_name: b.rejectedByName, rejected_at: b.rejectedAt, reject_reason: b.rejectReason,
    }));
    const approved = baselines.find((b) => b.status === 'APPROVED') ?? null;
    const today = new Date();
    const bac = approved ? approved.direct : t.direct;
    const plannedW = milestones.filter((m) => new Date(m.plannedDate) <= today).reduce((a, m) => a + n(m.weightPct), 0);
    const doneW = milestones.filter((m) => m.doneDate).reduce((a, m) => a + n(m.weightPct), 0);
    const ac = r2(spend.reduce((a, x) => a + x.amount, 0));
    const pv = r2(bac * Math.min(100, plannedW) / 100);
    const ev = r2(bac * Math.min(100, doneW) / 100);
    const cpi = ac > 0 ? r2(ev / ac) : null;
    const spi = pv > 0 ? r2(ev / pv) : null;
    // Earned value far above what is recorded as spent usually means spend is not booked yet, not that the work is that cheap.
    // Past a cost index of 4 the forecast (budget ÷ index) is not trusted, so the forecast stays at the budget and no projected margin is shown.
    // Month-end running totals for the chart: planned from the milestone dates, earned from the done dates, actual from booked spend.
    // Earned and actual stop at the current month; planned runs on to the last milestone.
    const mKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
    const todayKey = mKey(today);
    const keys = [...milestones.map((m) => mKey(new Date(m.plannedDate))), ...milestones.filter((m) => m.doneDate).map((m) => mKey(new Date(m.doneDate as Date))), ...spend.map((x) => x.year * 12 + x.month - 1), todayKey];
    const lastSpendKey = spend.length ? Math.max(...spend.map((x) => x.year * 12 + x.month - 1)) : null;
    const from = Math.min(...keys); const to = Math.min(Math.max(...keys), from + 47);
    const series = milestones.length || spend.length ? Array.from({ length: to - from + 1 }, (_, i) => {
      const k = from + i;
      const planned = milestones.filter((m) => mKey(new Date(m.plannedDate)) <= k).reduce((a, m) => a + n(m.weightPct), 0);
      const done = milestones.filter((m) => m.doneDate && mKey(new Date(m.doneDate)) <= k).reduce((a, m) => a + n(m.weightPct), 0);
      const past = k <= todayKey;
      return {
        label: `${MON[k % 12]} ${String(Math.floor(k / 12)).slice(2)}`,
        pv: r2(bac * Math.min(100, planned) / 100),
        ev: past ? r2(bac * Math.min(100, done) / 100) : null,
        ac: past ? r2(spend.filter((x) => x.year * 12 + x.month - 1 <= k).reduce((a, x) => a + x.amount, 0)) : null,
      };
    }) : [];
    const spendLow = cpi != null && cpi > 4;
    const eac = cpi && cpi > 0 && !spendLow ? r2(bac / cpi) : bac;
    const evm = {
      bac, pv, ev, ac, cpi, spi, eac, etc: r2(Math.max(0, eac - ac)), vac: r2(bac - eac), spend_low: spendLow, series, last_spend: lastSpendKey == null ? null : `${MON[lastSpendKey % 12]} ${Math.floor(lastSpendKey / 12)}`,
      tcpi: bac - ac > 0 ? r2((bac - ev) / (bac - ac)) : null, percent_complete: r2(doneW), percent_planned: r2(plannedW),
      weight_total: r2(milestones.reduce((a, m) => a + n(m.weightPct), 0)),
    };
    const projectedCost = r2(eac * (1 + n(est?.warrantyPct) / 100));
    const margin = {
      contract_value: cv, target_pct: p.targetMarginPct == null ? null : n(p.targetMarginPct), min_pct: p.minMarginPct == null ? null : n(p.minMarginPct),
      estimate_margin_pct: cv ? r2(((cv - t.total) / cv) * 100) : null,
      projected_margin_pct: cv && !spendLow ? r2(((cv - projectedCost) / cv) * 100) : null,
    };
    return {
      project: { id: p.id, code: p.code, name: p.name, client_name: p.client?.name ?? null, contract_value: cv, target_margin_pct: margin.target_pct, min_margin_pct: margin.min_pct, risk_rating: p.riskRating, start_date: p.start_date, end_date: p.end_date, type_code: p.type?.code ?? null, has_job_bom: !!p.type?.hasJobBom },
      estimate: est ? { id: est.id, version: est.version, contingency_pct: n(est.contingencyPct), warranty_pct: n(est.warrantyPct), note: est.note } : null,
      baselines, baseline: approved, changed_since_baseline: approved ? approved.total !== t.total : false,
      lines, phases, totals: t, margin, evm,
      milestones: milestones.map((m) => ({ id: m.id, name: m.name, weight_pct: n(m.weightPct), planned_date: m.plannedDate, done_date: m.doneDate })),
      rate_cards: rates.cards,
      suggested_contingency_pct: p.riskRating === 'HIGH' ? 20 : p.riskRating === 'LOW' ? 5 : 10,
    };
  }

  async saveProjectSettings(id: number, b: any, user: Actor) {
    await this.projectOrThrow(id);
    const data: any = {};
    if (b.contract_value !== undefined) data.contractValue = b.contract_value === '' || b.contract_value === null ? null : Number(b.contract_value);
    if (b.target_margin_pct !== undefined) data.targetMarginPct = b.target_margin_pct === '' || b.target_margin_pct === null ? null : Number(b.target_margin_pct);
    if (b.min_margin_pct !== undefined) {
      data.minMarginPct = b.min_margin_pct === '' || b.min_margin_pct === null ? null : Number(b.min_margin_pct);
      if (data.minMarginPct != null && (!Number.isFinite(data.minMarginPct) || data.minMarginPct < 0 || data.minMarginPct >= 100)) throw bad('Minimum margin must be from 0 up to, but not including, 100.');
    }
    if (data.targetMarginPct !== undefined || data.minMarginPct !== undefined) {
      const stored = await this.prisma.project.findUnique({ where: { id }, select: { targetMarginPct: true, minMarginPct: true } });
      const target = data.targetMarginPct !== undefined ? data.targetMarginPct : stored?.targetMarginPct == null ? null : n(stored.targetMarginPct);
      const floor = data.minMarginPct !== undefined ? data.minMarginPct : stored?.minMarginPct == null ? null : n(stored.minMarginPct);
      if (target != null && floor != null && floor > target) throw bad('The minimum margin cannot be above the target margin.');
    }
    if (b.risk_rating !== undefined) {
      if (b.risk_rating && !['LOW', 'MEDIUM', 'HIGH'].includes(b.risk_rating)) throw bad('Risk must be low, medium or high.');
      data.riskRating = b.risk_rating || null;
    }
    await this.prisma.project.update({ where: { id }, data });
    const est = await this.currentEstimate(id, false);
    if (est && (b.contingency_pct !== undefined || b.warranty_pct !== undefined)) {
      await this.prisma.costEstimate.update({ where: { id: est.id }, data: {
        ...(b.contingency_pct !== undefined ? { contingencyPct: Number(b.contingency_pct) } : {}),
        ...(b.warranty_pct !== undefined ? { warrantyPct: Number(b.warranty_pct) } : {}),
      } });
    }
    this.log('projects', id, 'UPDATE', user.id, b);
    return { id };
  }

  private async currentEstimate(projectId: number, create: boolean) {
    let est = await this.prisma.costEstimate.findFirst({ where: { projectId }, orderBy: { version: 'desc' } });
    if (!est && create) est = await this.prisma.costEstimate.create({ data: { projectId } });
    return est;
  }

  async saveEstimateLine(projectId: number, lineId: number | null, b: any) {
    await this.projectOrThrow(projectId);
    const est = await this.currentEstimate(projectId, true);
    if (String(b.basis ?? '').trim() === JOB_BASIS) throw bad('That basis is reserved for the job BOM.');
    if (lineId) {
      const cur = await this.prisma.estimateLine.findUnique({ where: { id: lineId } });
      if (cur?.basis === JOB_BASIS) throw bad('This line comes from the job BOM. Change the job BOM instead.', HttpStatus.CONFLICT);
    }
    const phase = String(b.phase ?? '').trim();
    const description = String(b.description ?? '').trim();
    if (!phase || !description) throw bad('Phase and description are required.');
    if (!(Number(b.quantity) > 0) || !(Number(b.rate) >= 0)) throw bad('Enter a quantity above zero and a rate.');
    const data = { phase, typeId: b.type_id ? Number(b.type_id) : null, description, quantity: Number(b.quantity), unit: String(b.unit || 'nos').slice(0, 20), rate: Number(b.rate), basis: b.basis?.trim() || null };
    const row = lineId
      ? await this.prisma.estimateLine.update({ where: { id: lineId }, data })
      : await this.prisma.estimateLine.create({ data: { ...data, estimateId: est!.id } });
    return { id: row.id };
  }

  async removeEstimateLine(lineId: number) {
    const line = await this.prisma.estimateLine.findUnique({ where: { id: lineId } });
    if (!line) return { deleted: false };
    if (line.basis === JOB_BASIS) throw bad('This line comes from the job BOM. Change the job BOM instead.', HttpStatus.CONFLICT);
    await this.prisma.estimateLine.delete({ where: { id: lineId } });
    return { deleted: true };
  }

  // The estimate is sent for approval as a copy. Approving the copy makes it the baseline; the estimate itself stays open to edit.
  async proposeBaseline(projectId: number, user: Actor) {
    await this.projectOrThrow(projectId);
    const est = await this.currentEstimate(projectId, false);
    const full = est ? await this.prisma.costEstimate.findUnique({ where: { id: est.id }, include: { lines: { orderBy: { id: 'asc' } } } }) : null;
    if (!full || !full.lines.length) throw bad('Add at least one estimate line before proposing a baseline.');
    const t = this.estimateTotals(full, full.lines);
    const latest = await this.prisma.estimateBaseline.findFirst({ where: { projectId, status: { in: ['PROPOSED', 'APPROVED'] } }, orderBy: { id: 'desc' } });
    if (latest && n(latest.total) === t.total) {
      throw bad(`The estimate is unchanged since ${latest.status === 'APPROVED' ? 'the approved baseline' : 'the latest proposal'}. Change a line first.`, HttpStatus.CONFLICT);
    }
    const row = await this.prisma.estimateBaseline.create({
      data: {
        projectId, direct: t.direct, contingency: t.contingency, warranty: t.warranty, total: t.total,
        contingencyPct: full.contingencyPct, warrantyPct: full.warrantyPct,
        lines: full.lines.map((l) => ({ phase: l.phase, type_id: l.typeId, description: l.description, quantity: n(l.quantity), unit: l.unit, rate: n(l.rate), basis: l.basis })),
        proposedById: user.id, proposedByName: user.username ?? null,
      },
    });
    this.log('estimate_baselines', row.id, 'INSERT', user.id, t);
    return { id: row.id };
  }

  async approveBaseline(id: number, user: Actor) {
    const b = await this.prisma.estimateBaseline.findUnique({ where: { id } });
    if (!b) throw bad('Baseline not found.', HttpStatus.NOT_FOUND);
    if (b.status === 'APPROVED') throw bad('Already approved.', HttpStatus.CONFLICT);
    if (b.status !== 'PROPOSED') throw bad('Only a proposed baseline can be approved.', HttpStatus.CONFLICT);
    if (b.proposedById != null && b.proposedById === user.id && !financeSelfApprovalAllowed()) {
      const other = await this.prisma.user.findFirst({ where: { isActive: true, id: { not: user.id }, userRoles: { some: { role: { name: { in: [ROLES.FINANCE, ROLES.ADMIN] } } } } } });
      if (other) throw bad('You proposed this baseline. Another Finance or Admin user needs to approve it.', HttpStatus.FORBIDDEN);
    }
    const newer = await this.prisma.estimateBaseline.findFirst({ where: { projectId: b.projectId, id: { gt: id }, status: { in: ['PROPOSED', 'APPROVED'] } } });
    if (newer) throw bad('A newer baseline exists for this project. Approve that one, or propose again.', HttpStatus.CONFLICT);
    await this.prisma.$transaction([
      this.prisma.estimateBaseline.updateMany({ where: { projectId: b.projectId, status: 'APPROVED' }, data: { status: 'SUPERSEDED' } }),
      this.prisma.estimateBaseline.updateMany({ where: { projectId: b.projectId, status: 'PROPOSED', id: { lt: id } }, data: { status: 'SUPERSEDED' } }),
      this.prisma.estimateBaseline.update({ where: { id }, data: { status: 'APPROVED', approvedByName: user.username ?? null, approvedAt: new Date() } }),
    ]);
    const plan = await this.addBaselineToPlan(b);
    this.log('estimate_baselines', id, 'APPROVE', user.id, plan);
    return { id, lines_added: plan.added, lines_updated: plan.updated, lines_removed: plan.removed };
  }

  async rejectBaseline(id: number, body: any, user: Actor) {
    const b = await this.prisma.estimateBaseline.findUnique({ where: { id } });
    if (!b) throw bad('Baseline not found.', HttpStatus.NOT_FOUND);
    if (b.status !== 'PROPOSED') throw bad('Only a proposed baseline can be rejected.', HttpStatus.CONFLICT);
    const reason = String(body?.reason ?? '').trim();
    if (!reason) throw bad('Give a reason for rejecting it.');
    await this.prisma.estimateBaseline.update({ where: { id }, data: { status: 'REJECTED', rejectedByName: user.username ?? null, rejectedAt: new Date(), rejectReason: reason.slice(0, 300) } });
    this.log('estimate_baselines', id, 'REJECT', user.id, { reason });
    return { id };
  }

  // When the current year's plan is still a draft, an approved baseline adds its budget lines: one per expense type, plus contingency
  private async addBaselineToPlan(b: { id: number; projectId: number; contingency: any; lines: any }) {
    const p = await this.projectOrThrow(b.projectId);
    const s = await this.budgets.getSettings();
    const fy = this.budgets.fyOf(new Date(), s.fyStartMonth);
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy } });
    if (!plan || plan.status !== 'DRAFT') return { added: 0, updated: 0, removed: 0 };
    const projectId = b.projectId;
    const months = this.budgets.fyMonths(fy, s.fyStartMonth);
    const start = p.start_date ? new Date(p.start_date) : new Date();
    const end = p.end_date ? new Date(p.end_date) : new Date(start.getFullYear(), start.getMonth() + 5, 28);
    const idx = months.map((m, i) => ({ m, i })).filter(({ m }) => new Date(m.year, m.month - 1, 28) >= start && new Date(m.year, m.month - 1, 1) <= end).map(({ i }) => i);
    const use = idx.length ? idx : [0];
    const byType = new Map<number | null, number>();
    for (const l of (b.lines as any[])) byType.set(l.type_id ?? null, (byType.get(l.type_id ?? null) ?? 0) + n(l.quantity) * n(l.rate));
    const spread = (total: number) => months.map((m, i) => ({ year: m.year, month: m.month, amount: use.includes(i) ? r2(total / use.length) : 0 }));
    let added = 0; let updated = 0; let removed = 0;
    // Lines made from a baseline are kept in step with it; a line someone added by hand is left alone
    const auto = (note: string | null) => !!note && /^From (baseline|estimate)/.test(note);
    const kept = new Set<number>();
    const mk = async (typeId: number | null, total: number, contingency: boolean) => {
      if (total <= 0) return;
      const exists = await this.prisma.budgetLine.findFirst({ where: { planId: plan.id, projectId, typeId, isContingency: contingency, isActive: true } });
      if (exists) {
        kept.add(exists.id);
        if (!auto(exists.note)) return;
        await this.prisma.budgetLine.update({ where: { id: exists.id }, data: { note: `From baseline #${b.id}`, periods: { deleteMany: {}, create: spread(total) } } });
        updated++;
        return;
      }
      const row = await this.prisma.budgetLine.create({ data: { planId: plan.id, costObject: 'PROJECT', projectId, typeId: contingency ? null : typeId, isContingency: contingency, ownerId: p.lead_id ?? null, note: `From baseline #${b.id}`, periods: { create: spread(total) } } });
      kept.add(row.id);
      added++;
    };
    for (const [typeId, total] of byType) if (typeId) await mk(typeId, total, false);
    await mk(null, n(b.contingency), true);
    // An expense type that is no longer in the estimate loses its line, unless the line was made by hand
    const stale = await this.prisma.budgetLine.findMany({ where: { planId: plan.id, projectId, isActive: true, id: { notIn: [...kept] } } });
    for (const l of stale) {
      if (!auto(l.note)) continue;
      await this.prisma.budgetLine.update({ where: { id: l.id }, data: { isActive: false } });
      removed++;
    }
    return { added, updated, removed };
  }

  async saveMilestone(projectId: number, id: number | null, b: any) {
    await this.projectOrThrow(projectId);
    const name = String(b.name ?? '').trim();
    if (!name) throw bad('Name is required.');
    const w = Number(b.weight_pct);
    if (!(w > 0 && w <= 100)) throw bad('Weight is a percentage between 0 and 100.');
    if (!b.planned_date) throw bad('Planned date is required.');
    const data = { name, weightPct: w, plannedDate: new Date(b.planned_date), doneDate: b.done_date ? new Date(b.done_date) : null };
    const row = id ? await this.prisma.projectMilestone.update({ where: { id }, data }) : await this.prisma.projectMilestone.create({ data: { ...data, projectId } });
    return { id: row.id };
  }

  async removeMilestone(id: number) { await this.prisma.projectMilestone.delete({ where: { id } }); return { deleted: true }; }

  // ── Products: BOM, standard cost, build plan ─────────────────────────────

  async rollup(bomId: number): Promise<any> {
    const bom = await this.prisma.bom.findUnique({ where: { id: bomId }, include: { lines: true, operations: { include: { operationType: true } } } });
    if (!bom) throw bad('BOM not found.', HttpStatus.NOT_FOUND);
    const s = await this.budgets.getSettings();
    const fy = this.budgets.fyOf(new Date(), s.fyStartMonth);
    const [items, cards, overheads, rateHistory] = await Promise.all([
      this.prisma.item.findMany({ where: { id: { in: bom.lines.map((l) => l.itemId).filter((x): x is number => x != null) } } }),
      this.prisma.rateCard.findMany(),
      this.prisma.overheadRate.findMany({ where: { fy, isActive: true } }),
      this.prisma.rateCardHistory.findMany(),
    ]);
    const rateOf = this.currentRates(cards, rateHistory);
    const pool = overheads.reduce((a, o) => a + n(o.poolAmount), 0);
    const hrs = n((await this.prisma.overheadBase.findUnique({ where: { fy } }))?.baseHours);
    const ohRate = hrs > 0 ? pool / hrs : 0;
    let material = 0; let scrap = 0;
    let freightBase = 0;
    const lines: any[] = [];
    // Every line is a part from the Part master, bought or made; the group and sequence only organise the list
    for (const l of [...bom.lines].sort((a, b) => a.sequence - b.sequence || (a.groupName ?? '').localeCompare(b.groupName ?? '') || a.id - b.id)) {
      const it = items.find((i) => i.id === l.itemId);
      const unit = n(it?.standardPrice);
      const base = n(l.quantity) * unit; const sc = base * (n(l.scrapPct) / 100);
      material += base; scrap += sc;
      freightBase += base + sc;
      lines.push({ id: l.id, sourcing: it?.sourcing ?? 'BUY', item_id: l.itemId, group_name: l.groupName, sequence: l.sequence, part_no: it?.partNo ?? '', name: it?.name ?? 'Part', quantity: n(l.quantity), scrap_pct: n(l.scrapPct), unit_cost: r2(unit), amount: r2(base + sc), item_drift: r2(n(l.quantity) * (n(it?.lastPrice ?? it?.standardPrice) - unit)) });
    }
    let conversion = 0; let hours = 0; let outsourced = 0; let fixed = 0;
    const ops = bom.operations.map((o) => {
      const rate = o.rateCardId != null ? rateOf.get(o.rateCardId)?.rate ?? 0 : 0;
      const labour = n(o.hours) * rate + n(o.outsourcedCost);
      conversion += labour; hours += n(o.hours); outsourced += n(o.outsourcedCost); fixed += n(o.fixedCost);
      return { id: o.id, name: o.name, type_id: o.operationTypeId, type_name: o.operationType?.name ?? o.name, is_outsourced: o.operationType?.isOutsourced ?? false, is_fixed: o.operationType?.isFixed ?? false, fixed_cost: o.fixedCost == null ? null : n(o.fixedCost), role: cards.find((c) => c.id === o.rateCardId)?.role ?? null, hours: n(o.hours), rate_card_id: o.rateCardId, rate: rate, outsourced_cost: o.outsourcedCost == null ? null : n(o.outsourcedCost), amount: r2(labour + n(o.fixedCost)), sequence: o.sequence };
    }).sort((a, b) => a.sequence - b.sequence || a.id - b.id);
    const freight = freightBase * (n(bom.freightPct) / 100);
    const override = bom.overheadRateOverride == null ? null : n(bom.overheadRateOverride);
    const appliedRate = override ?? ohRate;
    const overhead = hours * appliedRate;
    const subtotal = material + scrap + freight + conversion + overhead + fixed;
    // A job's warranty comes from its project estimate, so the job BOM adds none
    const warranty = bom.projectId != null ? 0 : subtotal * (n(bom.warrantyPct) / 100);
    return {
      bom: { id: bom.id, product_id: bom.productId, project_id: bom.projectId, version: bom.version, status: bom.status, freight_pct: n(bom.freightPct), warranty_pct: n(bom.warrantyPct), overhead_rate_override: override, adjust_reason: bom.adjustReason ?? null },
      lines, operations: ops,
      cost: { material: r2(material), scrap: r2(scrap), freight: r2(freight), conversion: r2(conversion), outsourced: r2(outsourced), fixed: r2(fixed), overhead: r2(overhead), warranty: r2(warranty), total: r2(subtotal + warranty), overhead_rate: r2(appliedRate), default_overhead_rate: r2(ohRate), default_freight_pct: DEFAULT_FREIGHT_PCT, default_warranty_pct: DEFAULT_WARRANTY_PCT, hours: r2(hours), pool_missing: hrs <= 0, fy, freight_base: r2(freightBase), base_cost: r2(material + scrap + conversion + fixed) },
    };
  }

  async products() {
    await this.applyDueReplacements();
    const [products, boms, std] = await Promise.all([
      this.prisma.product.findMany({ where: { isActive: true, isSystem: false }, orderBy: { name: 'asc' }, include: { client: { select: { name: true } } } }),
      this.prisma.bom.findMany({ orderBy: { version: 'desc' }, include: { _count: { select: { lines: true } } } }),
      this.prisma.standardCost.findMany({ orderBy: { id: 'desc' } }),
    ]);
    const sNow = await this.budgets.getSettings();
    const fyNow = this.budgets.fyOf(new Date(), sNow.fyStartMonth);
    const planNow = await this.prisma.budgetPlan.findUnique({ where: { fy: fyNow } });
    const e200Now = await this.prisma.categoryType.findFirst({ where: { code: 'E200' } });
    const lineProducts = new Set<number>(planNow && e200Now ? (await this.prisma.budgetLine.findMany({ where: { planId: planNow.id, typeId: e200Now.id, isActive: true, productId: { not: null } }, select: { productId: true } })).map((x) => x.productId as number) : []);
    const priceRows = new Map((await this.prisma.productPrice.findMany({ where: { fy: fyNow } })).map((x) => [x.productId, x]));
    const out: any[] = [];
    for (const p of products) {
      const bom = boms.find((b) => b.productId === p.id);
      const cost = bom && bom._count.lines ? await this.rollup(bom.id).then((r) => r.cost.total, () => null) : null;
      const sc = std.find((x) => x.productId === p.id && x.status === 'APPROVED');
      const standard = p.standardCost == null ? null : n(p.standardCost);
      // Margin is measured on the standard cost once one is approved, otherwise on the rolled-up cost
      const unit = standard ?? cost;
      const pr = priceRows.get(p.id);
      const price = pr?.price == null ? null : n(pr.price);
      out.push({ id: p.id, code: p.code, name: p.name, client_name: p.client?.name ?? null, bom_status: bom?.status ?? null, bom_lines: bom?._count.lines ?? 0, rolled_cost: cost, standard_cost: standard, standard_approved_at: sc?.approvedAt ?? null, standard_fy: sc?.fy ?? null, fy: fyNow, plan_status: planNow?.status ?? null, budget_line: lineProducts.has(p.id),
        selling_price: price, target_margin_pct: pr?.targetMarginPct == null ? null : n(pr.targetMarginPct), min_margin_pct: pr?.minMarginPct == null ? null : n(pr.minMarginPct), margin_pct: price != null && unit != null && unit > 0 ? r2(((price - unit) / price) * 100) : null });
    }
    return out;
  }

  async product(id: number) {
    await this.applyDueReplacements();
    const p = await this.prisma.product.findUnique({ where: { id }, include: { client: { select: { name: true } } } });
    if (!p) throw bad('Product not found.', HttpStatus.NOT_FOUND);
    const s = await this.budgets.getSettings();
    const fy = this.budgets.fyOf(new Date(), s.fyStartMonth);
    const months = this.budgets.fyMonths(fy, s.fyStartMonth);
    const bom = await this.prisma.bom.findFirst({ where: { productId: id }, orderBy: { version: 'desc' } });
    const [roll, plans, stds, items, cards] = await Promise.all([
      bom ? this.rollup(bom.id) : Promise.resolve(null),
      this.prisma.productionPlan.findMany({ where: { productId: id } }),
      this.prisma.standardCost.findMany({ where: { productId: id }, orderBy: { id: 'desc' }, take: 30 }),
      this.items(),
      this.prisma.rateCard.findMany({ where: { isActive: true }, orderBy: { role: 'asc' } }),
    ]);
    const approved = await this.prisma.standardCost.findFirst({ where: { productId: id, status: 'APPROVED' }, orderBy: { id: 'desc' } });
    const fyPlan = await this.prisma.budgetPlan.findUnique({ where: { fy } });
    const e200 = await this.prisma.categoryType.findFirst({ where: { code: 'E200' } });
    const budgetLine = fyPlan && e200 ? await this.prisma.budgetLine.findFirst({ where: { planId: fyPlan.id, productId: id, typeId: e200.id, isActive: true } }) : null;
    // Build orders count against the plan of the month they start in. Taken is every order not cancelled; delivered is the part of it that has been handed over.
    const orders = await this.prisma.buildOrder.findMany({ where: { productId: id, status: { not: 'CANCELLED' } }, orderBy: [{ startDate: 'asc' }, { id: 'asc' }], include: { client: { select: { name: true } } } });
    const build = months.map((m) => {
      const pl = plans.find((x) => x.year === m.year && x.month === m.month);
      const inMonth = orders.filter((o) => o.startDate.getUTCFullYear() === m.year && o.startDate.getUTCMonth() + 1 === m.month);
      const taken = inMonth.reduce((a, o) => a + o.quantity, 0);
      return {
        year: m.year, month: m.month, label: MON[m.month - 1], planned: pl?.plannedUnits ?? 0, actual: pl?.actualUnits ?? 0,
        taken, delivered: inMonth.filter((o) => o.status === 'DELIVERED').reduce((a, o) => a + o.quantity, 0), open: (pl?.plannedUnits ?? 0) - taken,
        orders: inMonth.map((o) => ({ id: o.id, code: o.code, client_name: o.client?.name ?? null, quantity: o.quantity, status: o.status, delivery_date: o.deliveryDate })),
      };
    });
    // Budget and variances are measured on the approved standard; the live roll-up is only a fallback until one is approved
    const standardUnit = approved ? n(approved.total) : null;
    const unit = standardUnit ?? roll?.cost.total ?? 0;
    // The part of the standard that is bought: material, scrap, freight and outsourced work (labour and overhead are not product expenses)
    const purchasedUnit = approved ? n(approved.material) + n(approved.scrap) + n(approved.freight) + n(approved.outsourced) : 0;
    const plannedUnits = build.reduce((a, b) => a + b.planned, 0);
    const actualUnits = build.reduce((a, b) => a + b.actual, 0);
    // Materials actually bought for this product this year, against what the standard allows for the units built
    const parts = await this.budgets.partsWhere({ status: 'APPROVED', productId: id });
    const fyKeys = new Set(months.map((m) => `${m.year}-${m.month}`));
    const matSpend = r2(parts.filter((x) => x.costObject === 'PRODUCT' && (!e200 || x.typeId === e200.id) && fyKeys.has(`${x.year}-${x.month}`)).reduce((a, x) => a + x.amount, 0));
    const liveBought = roll ? roll.cost.material + roll.cost.scrap + roll.cost.freight + roll.cost.outsourced : 0;
    const stdMaterial = (approved ? purchasedUnit : liveBought) * actualUnits;
    const bomChanged = !!(approved && roll && Math.abs(liveBought - purchasedUnit) > 0.005);
    const spendByMonth = new Map<string, number>();
    for (const x of parts) if (x.costObject === 'PRODUCT' && (!e200 || x.typeId === e200.id)) spendByMonth.set(`${x.year}-${x.month}`, (spendByMonth.get(`${x.year}-${x.month}`) ?? 0) + x.amount);
    const priceVariance = roll ? r2(roll.lines.reduce((a: number, l: any) => a + l.item_drift, 0) * actualUnits) : 0;
    // Selling price for the year against the cost per unit (the approved standard cost, else the rolled-up cost)
    const priceRow = await this.prisma.productPrice.findUnique({ where: { productId_fy: { productId: id, fy } } });
    const sell = priceRow?.price == null ? null : n(priceRow.price);
    const costed = sell != null && unit > 0;
    const target = priceRow?.targetMarginPct == null ? null : n(priceRow.targetMarginPct);
    const floor = priceRow?.minMarginPct == null ? null : n(priceRow.minMarginPct);
    // The live roll-up shows where margin is heading when parts or rates have moved since the standard cost was approved
    const live = roll && roll.cost.total > 0 ? roll.cost.total : null;
    const pricing = {
      fy, price: sell, updated_by_name: priceRow?.updatedByName ?? null, updated_at: priceRow?.updatedAt ?? null, unit_cost: r2(unit), basis: standardUnit != null ? 'STANDARD' : 'ROLLED',
      target_margin_pct: target, min_margin_pct: floor,
      price_for_target: target != null && unit > 0 ? r2(unit / (1 - target / 100)) : null,
      price_for_min: floor != null && unit > 0 ? r2(unit / (1 - floor / 100)) : null,
      rolled_cost: live == null ? null : r2(live), margin_at_rolled_pct: sell != null && live != null ? r2(((sell - live) / sell) * 100) : null,
      profit_unit: costed ? r2(sell! - unit) : null, margin_pct: costed ? r2(((sell! - unit) / sell!) * 100) : null,
      planned_revenue: sell != null ? r2(sell * plannedUnits) : null, planned_profit: costed ? r2((sell! - unit) * plannedUnits) : null,
      built_revenue: sell != null ? r2(sell * actualUnits) : null, built_profit: costed ? r2((sell! - unit) * actualUnits) : null,
    };
    return {
      product: { id: p.id, code: p.code, name: p.name, client_name: p.client?.name ?? null, standard_cost: p.standardCost == null ? null : n(p.standardCost) },
      fy, plan_status: fyPlan?.status ?? null, budget_line: !!budgetLine, pricing,
      approved: approved ? { id: approved.id, fy: approved.fy, fixed: n(approved.fixed), total: n(approved.total), material: n(approved.material), scrap: n(approved.scrap), freight: n(approved.freight), conversion: n(approved.conversion), outsourced: n(approved.outsourced), overhead: n(approved.overhead), warranty: n(approved.warranty) } : null,
      bom: roll?.bom ?? null, lines: roll?.lines ?? [], operations: roll?.operations ?? [], cost: roll?.cost ?? null,
      build_plan: build.map((b) => ({ ...b, spend: r2(spendByMonth.get(`${b.year}-${b.month}`) ?? 0) })), annual: { planned_units: plannedUnits, actual_units: actualUnits, taken_units: build.reduce((a, b) => a + b.taken, 0), delivered_units: build.reduce((a, b) => a + b.delivered, 0), open_units: build.reduce((a, b) => a + b.open, 0), budget: r2(unit * plannedUnits), actual_standard: r2(unit * actualUnits), unit_cost: unit, basis: standardUnit != null ? 'STANDARD' : 'ROLLED', plan_unit_cost: purchasedUnit, plan_budget: r2(purchasedUnit * plannedUnits) },
      standards: stds.map((x) => ({ id: x.id, fy: x.fy, total: n(x.total), material: n(x.material), scrap: n(x.scrap), freight: n(x.freight), conversion: n(x.conversion), overhead: n(x.overhead), warranty: n(x.warranty), outsourced: n(x.outsourced), fixed: n(x.fixed), status: x.status, approved_by_name: x.approvedByName, approved_at: x.approvedAt, created_at: x.createdAt,
        overhead_rate: x.overheadRate == null ? null : n(x.overheadRate), freight_pct: x.freightPct == null ? null : n(x.freightPct), warranty_pct: x.warrantyPct == null ? null : n(x.warrantyPct), adjust_reason: x.adjustReason,
        proposed_by_id: x.proposedById, proposed_by_name: x.proposedByName, rejected_by_name: x.rejectedByName, rejected_at: x.rejectedAt, reject_reason: x.rejectReason })),
      variances: { actual_spend: matSpend, standard_material_for_units: r2(stdMaterial), spend_variance: r2(matSpend - stdMaterial), price_variance: priceVariance, units_built: actualUnits, basis: approved ? 'STANDARD' : 'ROLLED', bom_changed: bomChanged },
      operation_types: (await this.operationTypes()).filter((t) => t.is_active),
      items, rate_cards: await this.rateNow(cards).then((rm) => cards.map((c) => ({ id: c.id, role: c.role, rate_per_hour: rm.get(c.id)?.rate ?? n(c.ratePerHour) }))),
    };
  }

  private async bomFor(owner: Owner) {
    const where = typeof owner === 'number' ? { productId: owner } : { projectId: owner.projectId };
    let bom = await this.prisma.bom.findFirst({ where, orderBy: { version: 'desc' } });
    if (!bom) bom = await this.prisma.bom.create({ data: where });
    return bom;
  }

  async saveBomSettings(productId: number, b: any, user?: Actor) {
    const bom = await this.bomFor(productId);
    const pct = (v: any, label: string) => { const x = Number(v); if (!(x >= 0 && x <= 100)) throw bad(`${label} must be between 0 and 100.`); return x; };
    const freight = b.freight_pct !== undefined ? pct(b.freight_pct, 'Freight and handling %') : n(bom.freightPct);
    const warranty = b.warranty_pct !== undefined ? pct(b.warranty_pct, 'Warranty %') : n(bom.warrantyPct);
    let override: number | null = bom.overheadRateOverride == null ? null : n(bom.overheadRateOverride);
    if (b.overhead_rate !== undefined) {
      if (b.overhead_rate === null || b.overhead_rate === '') override = null;
      else { override = Number(b.overhead_rate); if (!(override >= 0)) throw bad('Overhead rate must be zero or more.'); }
    }
    const reason = String(b.reason ?? '').trim();
    const adjusted = override != null || freight !== DEFAULT_FREIGHT_PCT || warranty !== DEFAULT_WARRANTY_PCT;
    if (adjusted && !reason) throw bad('Give a reason for the adjustment.');
    await this.prisma.bom.update({ where: { id: bom.id }, data: {
      freightPct: freight, warrantyPct: warranty, overheadRateOverride: override,
      adjustReason: adjusted ? reason.slice(0, 300) : null,
    } });
    this.log('boms', bom.id, 'ADJUST', user?.id, { overhead_rate: override, freight_pct: freight, warranty_pct: warranty, reason: adjusted ? reason : null },
      { overhead_rate: bom.overheadRateOverride == null ? null : n(bom.overheadRateOverride), freight_pct: n(bom.freightPct), warranty_pct: n(bom.warrantyPct), reason: bom.adjustReason ?? null });
    return { id: bom.id };
  }

  // A sequence is a whole number from 1: step 2 starts when step 1 is built
  private sequenceOf(v: any, fallback: number) {
    if (v === undefined || v === null || v === '') return fallback;
    const x = Number(v);
    if (!(Number.isInteger(x) && x >= 1 && x <= 99)) throw bad('Sequence is a whole number from 1 to 99.');
    return x;
  }

  async saveBomLine(owner: Owner, lineId: number | null, b: any, user?: Actor) {
    const jobId = typeof owner === 'number' ? null : owner.projectId;
    if (jobId != null) await this.assertJobEditable(jobId);
    if (lineId) await this.assertOwnsRow(await this.prisma.bomLine.findUnique({ where: { id: lineId }, select: { bom: { select: { id: true, productId: true, projectId: true, buildOrderId: true } } } }), owner, 'line');
    const bom = await this.bomFor(owner);
    if (!(Number(b.quantity) > 0)) throw bad('Enter a quantity above zero.');
    if (!b.item_id) throw bad('Choose the part.');
    if (b.scrap_pct !== undefined && b.scrap_pct !== '' && b.scrap_pct !== null && !(Number(b.scrap_pct) >= 0 && Number(b.scrap_pct) <= 100)) throw bad('Scrap % must be between 0 and 100.');
    const part = await this.prisma.item.findUnique({ where: { id: Number(b.item_id) }, select: { projectId: true } });
    if (!part) throw bad('Part not found.', HttpStatus.NOT_FOUND);
    if (part.projectId != null && part.projectId !== jobId) throw bad('That part is for one project only. It can go on that project\'s job BOM and nowhere else.', HttpStatus.CONFLICT);
    const before = lineId ? await this.prisma.bomLine.findUnique({ where: { id: lineId } }) : null;
    const group = b.group_name === undefined ? (before?.groupName ?? null) : String(b.group_name ?? '').trim() || null;
    if (group && group.length > 60) throw bad('Keep the group to 60 characters or fewer.');
    const data = { itemId: Number(b.item_id), groupName: group, sequence: this.sequenceOf(b.sequence, before?.sequence ?? 1), quantity: Number(b.quantity), scrapPct: Number(b.scrap_pct) || 0 };
    const row = lineId ? await this.prisma.bomLine.update({ where: { id: lineId }, data }) : await this.prisma.bomLine.create({ data: { ...data, bomId: bom.id } });
    if (jobId != null) await this.syncJobEstimate(jobId);
    this.log('bom_lines', row.id, lineId ? 'UPDATE' : 'INSERT', user?.id, { bom_id: bom.id, item_id: data.itemId, group_name: data.groupName, sequence: data.sequence, quantity: data.quantity, scrap_pct: data.scrapPct }, before ? { item_id: before.itemId, group_name: before.groupName, sequence: before.sequence, quantity: n(before.quantity), scrap_pct: n(before.scrapPct) } : undefined);
    return { id: row.id };
  }

  // A line or operation is changed through the product or project that owns it, never through another one, and never on a build order's locked copy
  private async assertOwnsRow(row: { bom: { id: number; productId: number | null; projectId: number | null; buildOrderId: number | null } } | null, owner: Owner, what: string) {
    if (!row) throw bad(`That ${what} was not found.`, HttpStatus.NOT_FOUND);
    await this.assertNotOrderBom(row.bom.id);
    const mine = typeof owner === 'number' ? row.bom.productId === owner : row.bom.projectId === owner.projectId;
    if (!mine) throw bad(`That ${what} belongs to a different ${typeof owner === 'number' ? 'product' : 'project'}.`, HttpStatus.NOT_FOUND);
  }

  // A build order's BOM is a locked copy; its only change is swapping a part for an alternate, done on the build order
  private async assertNotOrderBom(bomId?: number | null) {
    if (bomId == null) return;
    const b = await this.prisma.bom.findUnique({ where: { id: bomId }, select: { buildOrderId: true } });
    if (b?.buildOrderId != null) throw bad('A build order\'s BOM is locked. The only change allowed is swapping a part for one of its alternates.', HttpStatus.CONFLICT);
  }

  // A product's costing data is changed by Finance and Admin only; job BOMs follow the project
  private assertCostingRole(productId: number | null, user?: Actor) {
    if (productId != null && user && !['ADMIN', 'FINANCE'].includes((user.role_name ?? '').toUpperCase())) throw bad('Only Finance and Admin can change the costing of a product.', HttpStatus.FORBIDDEN);
  }

  async removeBomLine(id: number, user?: Actor) {
    const line = await this.prisma.bomLine.findUnique({ where: { id }, include: { bom: true } });
    if (!line) return { deleted: true };
    await this.assertNotOrderBom(line.bomId);
    this.assertCostingRole(line.bom.productId, user);
    const jobId = line.bom.projectId;
    if (jobId != null) await this.assertJobEditable(jobId);
    await this.prisma.bomLine.delete({ where: { id } });
    this.log('bom_lines', id, 'DELETE', user?.id, {}, { bom_id: line.bomId, item_id: line.itemId, quantity: n(line.quantity) });
    if (jobId != null) await this.syncJobEstimate(jobId);
    return { deleted: true };
  }

  async saveOperation(owner: Owner, id: number | null, b: any, user?: Actor) {
    const jobId = typeof owner === 'number' ? null : owner.projectId;
    if (jobId != null) await this.assertJobEditable(jobId);
    if (id) await this.assertOwnsRow(await this.prisma.bomOperation.findUnique({ where: { id }, select: { bom: { select: { id: true, productId: true, projectId: true, buildOrderId: true } } } }), owner, 'operation');
    const bom = await this.bomFor(owner);
    const type = b.operation_type_id ? await this.prisma.operationType.findUnique({ where: { id: Number(b.operation_type_id) } }) : null;
    if (!type) throw bad('Choose the operation type.');
    let hours = 0; let rateCardId: number | null = null; let outsourcedCost: number | null = null; let fixedCost: number | null = null;
    if (type.isFixed) {
      if (!(Number(b.fixed_cost) > 0)) throw bad('Enter the fixed cost per unit.');
      fixedCost = Number(b.fixed_cost);
    } else if (type.isOutsourced) {
      if (!(Number(b.outsourced_cost) > 0)) throw bad('Enter the outsourced cost.');
      outsourcedCost = Number(b.outsourced_cost);
    } else {
      if (!b.rate_card_id) throw bad('Choose the role that does the work.');
      if (!(Number(b.hours) >= 0)) throw bad('Enter the hours.');
      hours = Number(b.hours) || 0; rateCardId = Number(b.rate_card_id);
    }
    const before = id ? await this.prisma.bomOperation.findUnique({ where: { id } }) : null;
    const data = { name: type.name, operationTypeId: type.id, hours, rateCardId, outsourcedCost, fixedCost, sequence: this.sequenceOf(b.sequence, before?.sequence ?? 1) };
    const row = id ? await this.prisma.bomOperation.update({ where: { id }, data }) : await this.prisma.bomOperation.create({ data: { ...data, bomId: bom.id } });
    if (jobId != null) await this.syncJobEstimate(jobId);
    this.log('bom_operations', row.id, id ? 'UPDATE' : 'INSERT', user?.id, { bom_id: bom.id, name: data.name, hours, rate_card_id: rateCardId, outsourced_cost: outsourcedCost, fixed_cost: fixedCost }, before ? { name: before.name, hours: n(before.hours), rate_card_id: before.rateCardId, outsourced_cost: before.outsourcedCost == null ? null : n(before.outsourcedCost) } : undefined);
    return { id: row.id };
  }

  // Operation types: the managed list the Operation dialog picks from
  async operationTypes() {
    const rows = await this.prisma.operationType.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    const usage = await this.prisma.bomOperation.groupBy({ by: ['operationTypeId'], _count: { _all: true } });
    const used = new Map(usage.map((u) => [u.operationTypeId, u._count._all]));
    return rows.map((t) => ({ id: t.id, name: t.name, is_outsourced: t.isOutsourced, is_fixed: t.isFixed, is_active: t.isActive, used_in: used.get(t.id) ?? 0 }));
  }

  async saveOperationType(id: number | null, b: any, user?: Actor) {
    const name = String(b.name ?? '').trim();
    if (!name) throw bad('Enter the name of the operation type.');
    const all = await this.prisma.operationType.findMany();
    if (all.some((t) => t.id !== id && t.isActive && t.name.toLowerCase() === name.toLowerCase())) throw bad('There is already an operation type with that name.', HttpStatus.CONFLICT);
    // cost_kind is LABOUR, OUTSOURCED or FIXED; older callers send is_outsourced
    const kind = String(b.cost_kind ?? (b.is_outsourced ? 'OUTSOURCED' : 'LABOUR')).toUpperCase();
    if (!['LABOUR', 'OUTSOURCED', 'FIXED'].includes(kind)) throw bad('Choose how the operation is costed.');
    const outsourced = kind === 'OUTSOURCED'; const isFixed = kind === 'FIXED';
    if (id) {
      const cur = all.find((t) => t.id === id);
      if (!cur) throw bad('Operation type not found.', HttpStatus.NOT_FOUND);
      if ((cur.isOutsourced !== outsourced || cur.isFixed !== isFixed) && (await this.prisma.bomOperation.count({ where: { operationTypeId: id } })) > 0) throw bad('This type is already used by build operations, so how it is costed cannot change.', HttpStatus.CONFLICT);
      await this.prisma.operationType.update({ where: { id }, data: { name, isOutsourced: outsourced, isFixed } });
      this.log('operation_types', id, 'UPDATE', user?.id, { name, cost_kind: kind }, { name: cur.name, cost_kind: cur.isFixed ? 'FIXED' : cur.isOutsourced ? 'OUTSOURCED' : 'LABOUR' });
      return { id };
    }
    const row = await this.prisma.operationType.create({ data: { name, isOutsourced: outsourced, isFixed, sortOrder: all.reduce((m, t) => Math.max(m, t.sortOrder), 0) + 1 } });
    this.log('operation_types', row.id, 'INSERT', user?.id, { name, cost_kind: kind });
    return { id: row.id };
  }

  async removeOperationType(id: number, user?: Actor) {
    const used = await this.prisma.bomOperation.count({ where: { operationTypeId: id } });
    if (used > 0) { await this.prisma.operationType.update({ where: { id }, data: { isActive: false } }); this.log('operation_types', id, 'ARCHIVE', user?.id, {}); return { archived: true }; }
    await this.prisma.operationType.delete({ where: { id } }).catch(() => undefined);
    this.log('operation_types', id, 'DELETE', user?.id, {});
    return { deleted: true };
  }

  // Estimate phases: the managed list the estimate line dialog picks from. A line stores the phase name, so a rename carries to its lines.
  async estimatePhases() {
    const rows = await this.prisma.estimatePhase.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    const usage = await this.prisma.estimateLine.groupBy({ by: ['phase'], _count: { _all: true } });
    const used = new Map(usage.map((u) => [u.phase, u._count._all]));
    return rows.map((p) => ({ id: p.id, name: p.name, used_in: used.get(p.name) ?? 0 }));
  }

  async saveEstimatePhase(id: number | null, b: any, user?: Actor) {
    const name = String(b.name ?? '').trim();
    if (!name) throw bad('Enter the name of the phase.');
    if (name.length > 60) throw bad('Keep the phase name to 60 characters or fewer.');
    const clash = await this.prisma.estimatePhase.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) } });
    if (clash?.isActive) throw bad('There is already a phase with that name.', HttpStatus.CONFLICT);
    if (clash && !id) {
      await this.prisma.estimatePhase.update({ where: { id: clash.id }, data: { isActive: true, name } });
      this.log('estimate_phases', clash.id, 'RESTORE', user?.id, { name });
      return { id: clash.id };
    }
    if (id) {
      const cur = await this.prisma.estimatePhase.findUnique({ where: { id } });
      if (!cur) throw bad('Phase not found.', HttpStatus.NOT_FOUND);
      await this.prisma.$transaction([
        this.prisma.estimatePhase.update({ where: { id }, data: { name } }),
        this.prisma.estimateLine.updateMany({ where: { phase: cur.name }, data: { phase: name } }),
      ]);
      this.log('estimate_phases', id, 'UPDATE', user?.id, { name }, { name: cur.name });
      return { id };
    }
    const top = await this.prisma.estimatePhase.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.estimatePhase.create({ data: { name, sortOrder: (top._max.sortOrder ?? 0) + 1 } });
    this.log('estimate_phases', row.id, 'INSERT', user?.id, { name });
    return { id: row.id };
  }

  async removeEstimatePhase(id: number, user?: Actor) {
    const cur = await this.prisma.estimatePhase.findUnique({ where: { id } });
    if (!cur) return { deleted: true };
    // A phase in use is archived; its lines keep it and it leaves the picker
    if (await this.prisma.estimateLine.count({ where: { phase: cur.name } })) {
      await this.prisma.estimatePhase.update({ where: { id }, data: { isActive: false } });
      this.log('estimate_phases', id, 'ARCHIVE', user?.id, {}, { name: cur.name });
      return { archived: true };
    }
    await this.prisma.estimatePhase.delete({ where: { id } });
    this.log('estimate_phases', id, 'DELETE', user?.id, {}, { name: cur.name });
    return { archived: false };
  }

  async removeOperation(id: number, user?: Actor) {
    const op = await this.prisma.bomOperation.findUnique({ where: { id }, include: { bom: true } });
    if (!op) return { deleted: true };
    await this.assertNotOrderBom(op.bomId);
    this.assertCostingRole(op.bom.productId, user);
    const jobId = op.bom.projectId;
    if (jobId != null) await this.assertJobEditable(jobId);
    await this.prisma.bomOperation.delete({ where: { id } });
    this.log('bom_operations', id, 'DELETE', user?.id, {}, { bom_id: op.bomId, name: op.name, hours: n(op.hours) });
    if (jobId != null) await this.syncJobEstimate(jobId);
    return { deleted: true };
  }

  // ── Job BOM: the build behind a bespoke (J100) project ───────────────────

  private async jobProject(projectId: number) {
    const p = await this.projectOrThrow(projectId);
    if (!p.type?.hasJobBom) throw bad('This project type does not use a job BOM.');
    return p;
  }

  // The job BOM stays open to change: the approved baseline is a copy, so edits only show as a difference from it
  private async assertJobEditable(projectId: number) {
    await this.jobProject(projectId);
  }

  async jobBom(projectId: number) {
    const p = await this.jobProject(projectId);
    const bom = await this.prisma.bom.findFirst({ where: { projectId }, orderBy: { version: 'desc' } });
    const [roll, items, cards, products, types] = await Promise.all([
      bom ? this.rollup(bom.id) : Promise.resolve(null),
      this.items(false, projectId),
      this.prisma.rateCard.findMany({ where: { isActive: true }, orderBy: { role: 'asc' } }),
      this.prisma.product.findMany({ where: { isActive: true, isSystem: false }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } }),
      this.operationTypes(),
    ]);
    // Products whose BOM in force can start this job BOM
    const productBoms = await this.prisma.bom.findMany({ where: { productId: { not: null } }, orderBy: { version: 'desc' }, include: { _count: { select: { lines: true, operations: true } } } });
    const importSources = products.flatMap((pr) => {
      const b = productBoms.find((x) => x.productId === pr.id);
      return b && b._count.lines > 0 ? [{ id: pr.id, code: pr.code, name: pr.name, version: b.version, lines: b._count.lines, operations: b._count.operations }] : [];
    });
    const source = bom?.sourceProductId != null ? products.find((pr) => pr.id === bom.sourceProductId) : null;
    return {
      project: { id: p.id, code: p.code, name: p.name, client_name: p.client?.name ?? null, type_code: p.type?.code ?? null, type_name: p.type?.name ?? null },
      bom: roll?.bom ?? null, lines: roll?.lines ?? [], operations: roll?.operations ?? [], cost: roll?.cost ?? null,
      import_sources: importSources, source: source ? { product_id: source.id, code: source.code, name: source.name, version: bom?.sourceVersion ?? null } : null,
      operation_types: types.filter((t) => t.is_active), items,
      rate_cards: await this.rateNow(cards).then((rm) => cards.map((c) => ({ id: c.id, role: c.role, rate_per_hour: rm.get(c.id)?.rate ?? n(c.ratePerHour) }))),
    };
  }

  // Start a job BOM from a standard product: its parts and build operations are copied and stay editable, unlike a build order's locked copy.
  // Replace swaps everything now on the job BOM; add puts the product's parts and operations after what is there.
  async importJobBom(projectId: number, b: any, user?: Actor) {
    await this.assertJobEditable(projectId);
    const productId = Number(b.product_id);
    const mode = String(b.mode ?? 'replace').toLowerCase();
    if (mode !== 'replace' && mode !== 'add') throw bad('Choose whether to replace the current BOM or add to it.');
    const product = Number.isInteger(productId) ? await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, code: true, name: true } }) : null;
    if (!product) throw bad('Choose the product to start from.');
    await this.applyDueReplacements();
    const src = await this.prisma.bom.findFirst({ where: { productId }, orderBy: { version: 'desc' }, include: { lines: true, operations: true } });
    if (!src || src.lines.length === 0) throw bad('That product has no BOM to import yet.', HttpStatus.CONFLICT);
    const bom = await this.bomFor({ projectId });
    const had = { parts: await this.prisma.bomLine.count({ where: { bomId: bom.id } }), operations: await this.prisma.bomOperation.count({ where: { bomId: bom.id } }) };
    await this.prisma.$transaction(async (tx) => {
      if (mode === 'replace') { await tx.bomLine.deleteMany({ where: { bomId: bom.id } }); await tx.bomOperation.deleteMany({ where: { bomId: bom.id } }); }
      await tx.bomLine.createMany({ data: src.lines.map((l) => ({ bomId: bom.id, itemId: l.itemId, groupName: l.groupName, sequence: l.sequence, quantity: l.quantity, scrapPct: l.scrapPct })) });
      if (src.operations.length) await tx.bomOperation.createMany({ data: src.operations.map((o) => ({ bomId: bom.id, name: o.name, hours: o.hours, rateCardId: o.rateCardId, outsourcedCost: o.outsourcedCost, fixedCost: o.fixedCost, operationTypeId: o.operationTypeId, sequence: o.sequence })) });
      await tx.bom.update({ where: { id: bom.id }, data: { sourceProductId: productId, sourceVersion: src.version } });
    });
    await this.syncJobEstimate(projectId);
    this.log('boms', bom.id, mode === 'replace' ? 'IMPORT_REPLACE' : 'IMPORT_ADD', user?.id, { product: product.code ?? product.name, source_version: src.version, parts: src.lines.length, operations: src.operations.length }, { parts: had.parts, operations: had.operations });
    return { id: bom.id, parts: src.lines.length, operations: src.operations.length, replaced: mode === 'replace' ? had : null };
  }

  // A one-off part for this project's job BOM, added by whoever can edit the job BOM
  async addProjectPart(projectId: number, b: any, user?: Actor) {
    await this.assertJobEditable(projectId);
    return this.saveItem(null, { ...b, project_id: projectId }, user);
  }

  async saveJobBomSettings(projectId: number, b: any, user?: Actor) {
    await this.assertJobEditable(projectId);
    const bom = await this.bomFor({ projectId });
    if (b.freight_pct !== undefined) {
      const f = Number(b.freight_pct);
      if (!(f >= 0 && f <= 100)) throw bad('Freight is a percentage between 0 and 100.');
      await this.prisma.bom.update({ where: { id: bom.id }, data: { freightPct: f } });
      this.log('boms', bom.id, 'ADJUST', user?.id, { freight_pct: f }, { freight_pct: n(bom.freightPct) });
    }
    await this.syncJobEstimate(projectId);
    return { id: bom.id };
  }

  // what is bought (parts, freight, outsourced work, booked to E200) and the in-house labour and overhead
  private async syncJobEstimate(projectId: number) {
    const bom = await this.prisma.bom.findFirst({ where: { projectId }, orderBy: { version: 'desc' } });
    const c = bom ? (await this.rollup(bom.id)).cost : null;
    const bought = c ? r2(c.material + c.scrap + c.freight + c.outsourced) : 0;
    const labour = c ? r2(c.conversion - c.outsourced + c.overhead + c.fixed) : 0;
    const e200 = await this.prisma.categoryType.findFirst({ where: { code: 'E200' } });
    const est = await this.currentEstimate(projectId, true);
    const existing = await this.prisma.estimateLine.findMany({ where: { estimateId: est!.id, basis: JOB_BASIS } });
    for (const part of [{ description: JOB_BOUGHT, typeId: e200?.id ?? null, rate: bought }, { description: JOB_LABOUR, typeId: null, rate: labour }]) {
      const line = existing.find((l) => l.description === part.description);
      if (part.rate > 0) {
        const data = { phase: 'Job build', typeId: part.typeId, description: part.description, quantity: 1, unit: 'job', rate: part.rate, basis: JOB_BASIS };
        if (line) await this.prisma.estimateLine.update({ where: { id: line.id }, data });
        else await this.prisma.estimateLine.create({ data: { ...data, estimateId: est!.id } });
      } else if (line) {
        await this.prisma.estimateLine.delete({ where: { id: line.id } });
      }
    }
  }

  async saveBuildPlan(productId: number, b: { year: number; month: number; planned_units?: number; actual_units?: number }, user?: Actor) {
    const year = Number(b.year); const month = Number(b.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw bad('Choose a valid month.');
    if (!(await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))) throw bad('Product not found.', HttpStatus.NOT_FOUND);
    const data: any = {};
    if (b.planned_units !== undefined) data.plannedUnits = Math.max(0, Math.round(Number(b.planned_units) || 0));
    if (b.actual_units !== undefined) data.actualUnits = Math.max(0, Math.round(Number(b.actual_units) || 0));
    await this.prisma.productionPlan.upsert({ where: { productId_year_month: { productId, year, month } }, update: data, create: { productId, year, month, ...data } });
    this.log('production_plans', productId, 'UPDATE', user?.id, { year, month, ...data });
    return { ok: true };
  }

  // The selling price planned for this product in the current financial year; blank removes it
  // The price and margin goals for this product in the current financial year; a blank value clears it, and the row goes once all three are blank.
  // The price is what is quoted, so it stays as entered when the cost moves; the margins are goals to track against.
  async saveProductPrice(productId: number, b: { price?: any; target_margin_pct?: any; min_margin_pct?: any }, user?: Actor) {
    if (!(await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))) throw bad('Product not found.', HttpStatus.NOT_FOUND);
    const s = await this.budgets.getSettings();
    const fy = this.budgets.fyOf(new Date(), s.fyStartMonth);
    const where = { productId_fy: { productId, fy } };
    const before = await this.prisma.productPrice.findUnique({ where });
    const blank = (v: any) => v === '' || v == null;
    const margin = (v: any, label: string) => {
      if (blank(v)) return null;
      const x = Number(v);
      if (!Number.isFinite(x) || x < 0 || x >= 100) throw bad(`${label} must be from 0 up to, but not including, 100.`);
      return x;
    };
    // A field left out of the request keeps what is stored; one sent blank is cleared
    const price = b.price === undefined ? (before?.price == null ? null : n(before.price)) : blank(b.price) ? null : Number(b.price);
    if (price != null && (!Number.isFinite(price) || price <= 0)) throw bad('Enter a selling price above zero.');
    if (price != null && price > 99999999999) throw bad('That selling price is too large.');
    const target = b.target_margin_pct === undefined ? (before?.targetMarginPct == null ? null : n(before.targetMarginPct)) : margin(b.target_margin_pct, 'Target margin');
    const min = b.min_margin_pct === undefined ? (before?.minMarginPct == null ? null : n(before.minMarginPct)) : margin(b.min_margin_pct, 'Minimum margin');
    if (target != null && min != null && min > target) throw bad('The minimum margin cannot be above the target margin.');
    const was = before ? { fy, price: before.price == null ? null : n(before.price), target_margin_pct: before.targetMarginPct == null ? null : n(before.targetMarginPct), min_margin_pct: before.minMarginPct == null ? null : n(before.minMarginPct) } : undefined;
    if (price == null && target == null && min == null) {
      if (before) {
        await this.prisma.productPrice.delete({ where });
        this.log('product_prices', productId, 'DELETE', user?.id, {}, was);
      }
      return { ok: true };
    }
    const data = { price, targetMarginPct: target, minMarginPct: min, updatedById: user?.id ?? null, updatedByName: user?.username ?? null };
    await this.prisma.productPrice.upsert({ where, update: data, create: { productId, fy, ...data } });
    this.log('product_prices', productId, before ? 'UPDATE' : 'INSERT', user?.id, { fy, price, target_margin_pct: target, min_margin_pct: min }, was);
    return { ok: true };
  }

  async proposeStandard(productId: number, user: Actor) {
    const bom = await this.bomFor(productId);
    const r = await this.rollup(bom.id);
    if (!r.lines.length) throw bad('Add BOM lines before costing the product.');
    const s = await this.budgets.getSettings();
    const fy = this.budgets.fyOf(new Date(), s.fyStartMonth);
    const latest = await this.prisma.standardCost.findFirst({ where: { productId }, orderBy: { id: 'desc' } });
    // The same figure is only a duplicate within a year; a new financial year needs its own standard cost even when nothing changed
    if (latest && latest.fy === fy && (latest.status === 'PROPOSED' || latest.status === 'APPROVED') && n(latest.total) === r.cost.total) {
      throw bad(`The cost is unchanged since ${latest.status === 'APPROVED' ? 'the approved standard cost' : 'the latest proposal'}. Change the BOM or prices first.`, HttpStatus.CONFLICT);
    }
    const row = await this.prisma.standardCost.create({
      data: {
        productId, bomId: bom.id, fy,
        material: r.cost.material, scrap: r.cost.scrap, freight: r.cost.freight, conversion: r.cost.conversion, outsourced: r.cost.outsourced, fixed: r.cost.fixed, overhead: r.cost.overhead, warranty: r.cost.warranty, total: r.cost.total,
        overheadRate: r.cost.overhead_rate, freightPct: r.bom.freight_pct, warrantyPct: r.bom.warranty_pct, adjustReason: r.bom.adjust_reason,
        proposedById: user.id, proposedByName: user.username ?? null,
      },
    });
    this.log('standard_costs', row.id, 'INSERT', user.id, r.cost);
    return { id: row.id };
  }

  async approveStandard(id: number, user: Actor) {
    const sc = await this.prisma.standardCost.findUnique({ where: { id } });
    if (!sc) throw bad('Standard cost not found.', HttpStatus.NOT_FOUND);
    if (sc.status === 'APPROVED') throw bad('Already approved.', HttpStatus.CONFLICT);
    if (sc.status !== 'PROPOSED') throw bad('Only a proposed standard cost can be approved.', HttpStatus.CONFLICT);
    if (sc.proposedById != null && sc.proposedById === user.id && !financeSelfApprovalAllowed()) {
      const other = await this.prisma.user.findFirst({ where: { isActive: true, id: { not: user.id }, userRoles: { some: { role: { name: { in: [ROLES.FINANCE, ROLES.ADMIN] } } } } } });
      if (other) throw bad('You proposed this standard cost. Another Finance or Admin user needs to approve it.', HttpStatus.FORBIDDEN);
    }
    const newer = await this.prisma.standardCost.findFirst({ where: { productId: sc.productId, id: { gt: id }, status: { in: ['PROPOSED', 'APPROVED'] } } });
    if (newer) throw bad('A newer standard cost exists for this product. Approve that one, or propose again.', HttpStatus.CONFLICT);
    await this.prisma.$transaction([
      this.prisma.standardCost.updateMany({ where: { productId: sc.productId, status: 'APPROVED' }, data: { status: 'SUPERSEDED' } }),
      this.prisma.standardCost.updateMany({ where: { productId: sc.productId, status: 'PROPOSED', id: { lt: id } }, data: { status: 'SUPERSEDED' } }),
      this.prisma.standardCost.update({ where: { id }, data: { status: 'APPROVED', approvedByName: user.username ?? null, approvedAt: new Date() } }),
      this.prisma.product.update({ where: { id: sc.productId }, data: { standardCost: sc.total } }),
      this.prisma.bom.update({ where: { id: sc.bomId }, data: { status: 'APPROVED' } }),
    ]);
    this.log('standard_costs', id, 'APPROVE', user.id, {});
    return { id };
  }

  async rejectStandard(id: number, b: any, user: Actor) {
    const sc = await this.prisma.standardCost.findUnique({ where: { id } });
    if (!sc) throw bad('Standard cost not found.', HttpStatus.NOT_FOUND);
    if (sc.status !== 'PROPOSED') throw bad('Only a proposed standard cost can be rejected.', HttpStatus.CONFLICT);
    const reason = String(b?.reason ?? '').trim();
    if (!reason) throw bad('Give a reason for rejecting it.');
    await this.prisma.standardCost.update({ where: { id }, data: { status: 'REJECTED', rejectedByName: user.username ?? null, rejectedAt: new Date(), rejectReason: reason.slice(0, 300) } });
    this.log('standard_costs', id, 'REJECT', user.id, { reason });
    return { id };
  }

  // Product line in the current plan: planned units each month times the standard cost
  async buildToPlan(productId: number, user: Actor) {
    const s = await this.budgets.getSettings();
    const fy = this.budgets.fyOf(new Date(), s.fyStartMonth);
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy } });
    if (!plan) throw bad('There is no budget plan for the current year yet.', HttpStatus.CONFLICT);
    if (plan.status !== 'DRAFT') throw bad(`The current plan is ${plan.status.toLowerCase()}, so its lines are locked. Ask Finance to raise a budget change for this product's line.`, HttpStatus.CONFLICT);
    const p = await this.prisma.product.findUnique({ where: { id: productId } });
    const approved = await this.prisma.standardCost.findFirst({ where: { productId, status: 'APPROVED' }, orderBy: { id: 'desc' } });
    if (!approved) throw bad('Approve a standard cost first.');
    // Only the bought part is budgeted here: material, scrap, freight and outsourced work. Labour and overhead are not product expenses.
    const unit = n(approved.material) + n(approved.scrap) + n(approved.freight) + n(approved.outsourced);
    if (!(unit > 0)) throw bad('The approved standard has no bought cost to budget.');
    const type = await this.prisma.categoryType.findFirst({ where: { code: 'E200' } });
    if (!type) throw bad('The E200 expense type is missing.');
    const plans = await this.prisma.productionPlan.findMany({ where: { productId } });
    const months = this.budgets.fyMonths(fy, s.fyStartMonth);
    const periods = months.map((m) => ({ year: m.year, month: m.month, amount: r2((plans.find((x) => x.year === m.year && x.month === m.month)?.plannedUnits ?? 0) * unit) }));
    if (!periods.some((x) => x.amount > 0)) throw bad('Enter planned units in the build plan first.');
    const existing = await this.prisma.budgetLine.findFirst({ where: { planId: plan.id, productId, typeId: type.id, isActive: true } });
    if (existing) {
      await this.prisma.budgetLinePeriod.deleteMany({ where: { lineId: existing.id } });
      await this.prisma.budgetLinePeriod.createMany({ data: periods.map((x) => ({ ...x, lineId: existing.id })) });
    } else {
      await this.prisma.budgetLine.create({ data: { planId: plan.id, costObject: 'PRODUCT', productId, typeId: type.id, ownerId: p?.lead_id ?? null, note: 'From build plan × standard cost', periods: { create: periods } } });
    }
    this.log('budget_lines', productId, 'BUILD_TO_PLAN', user.id, {});
    return { updated: !!existing, total: r2(periods.reduce((a, x) => a + x.amount, 0)) };
  }

  // ── Budget changes ───────────────────────────────────────────────────────

  private async lineLabel(ids: number[]) {
    const lines = await this.prisma.budgetLine.findMany({ where: { id: { in: ids } } });
    const out = new Map<number, string>();
    if (!lines.length) return out;
    const [projects, products, depts, types] = await Promise.all([
      this.prisma.project.findMany({ select: { id: true, code: true, name: true } }), this.prisma.product.findMany({ select: { id: true, code: true, name: true } }),
      this.prisma.department.findMany({ select: { id: true, name: true } }), this.prisma.categoryType.findMany({ select: { id: true, code: true, name: true } }),
    ]);
    for (const l of lines) {
      const obj = l.costObject === 'PROJECT' ? projects.find((x) => x.id === l.projectId) : l.costObject === 'PRODUCT' ? products.find((x) => x.id === l.productId) : l.costObject === 'DEPARTMENT' ? depts.find((x) => x.id === l.departmentId) : null;
      const code = (obj as any)?.code || (obj as any)?.name || 'Reserve';
      const t = types.find((x) => x.id === l.typeId);
      out.set(l.id, `${code} · ${l.isContingency ? 'Contingency (held)' : t ? [t.code, t.name].filter(Boolean).join(' ') : 'Reserve'}`);
    }
    return out;
  }

  async changes(status?: string) {
    const rows = await this.prisma.budgetChange.findMany({ where: status && status !== 'ALL' ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
    const names = await this.lineLabel([...new Set(rows.flatMap((r) => [r.fromLineId, r.toLineId]).filter((x): x is number => x != null))]);
    const s = await this.budgets.getSettings();
    return {
      approval_threshold: s.approvalThreshold,
      rows: rows.map((r) => ({
        id: r.id, kind: r.kind, amount: n(r.amount), reason: r.reason, status: r.status, from_line_id: r.fromLineId, to_line_id: r.toLineId,
        from_label: r.fromLineId ? names.get(r.fromLineId) ?? null : null, to_label: r.toLineId ? names.get(r.toLineId) ?? null : null,
        requested_by_name: r.requestedByName, decided_by_name: r.decidedByName, decided_at: r.decidedAt, decision_note: r.decisionNote, created_at: r.createdAt,
        needs_admin: n(r.amount) > s.approvalThreshold,
      })),
    };
  }

  async requestChange(b: any, user: Actor) {
    const kind = String(b.kind || '').toUpperCase();
    if (!['TRANSFER', 'REVISION', 'DRAWDOWN', 'RELEASE'].includes(kind)) throw bad('Choose the kind of change.');
    const amount = Number(b.amount);
    if (!(amount > 0)) throw bad('Enter an amount above zero.');
    if (!String(b.reason ?? '').trim()) throw bad('Give a reason.');
    const from = b.from_line_id ? Number(b.from_line_id) : null;
    const to = b.to_line_id ? Number(b.to_line_id) : null;
    if (kind !== 'REVISION' && !from) throw bad('Choose the line the money comes from.');
    if (kind !== 'RELEASE' && !to) throw bad('Choose the line that receives it.');
    if (from && to && from === to) throw bad('Choose two different lines.');
    for (const id of [from, to]) if (id && !(await this.prisma.budgetLine.findFirst({ where: { id, isActive: true } }))) throw bad('Budget line not found.', HttpStatus.NOT_FOUND);
    const row = await this.prisma.budgetChange.create({ data: { kind, fromLineId: from, toLineId: to, amount, reason: String(b.reason).trim(), requestedById: user.id, requestedByName: user.username ?? null } });
    this.log('budget_changes', row.id, 'INSERT', user.id, b);
    return { id: row.id };
  }

  // Moves the money in the current month of each line (or the plan's last month when the year is over)
  async decideChange(id: number, b: { decision: string; note?: string }, user: Actor) {
    const ch = await this.prisma.budgetChange.findUnique({ where: { id } });
    if (!ch) throw bad('Change not found.', HttpStatus.NOT_FOUND);
    if (ch.status !== 'PENDING') throw bad('This change has already been decided.', HttpStatus.CONFLICT);
    // Whoever asked for the change does not approve it, unless nobody else can
    if (b.decision === 'approve' && ch.requestedById != null && ch.requestedById === user.id && !financeSelfApprovalAllowed()) {
      const other = await this.prisma.user.findFirst({ where: { isActive: true, id: { not: user.id }, userRoles: { some: { role: { name: { in: [ROLES.FINANCE, ROLES.ADMIN] } } } } } });
      if (other) throw bad('You raised this change. Another Finance or Admin user needs to approve it.', HttpStatus.FORBIDDEN);
    }
    if (b.decision === 'reject') {
      if (!b.note?.trim()) throw bad('Say why it is rejected.');
      await this.prisma.budgetChange.update({ where: { id }, data: { status: 'REJECTED', decidedByName: user.username ?? null, decidedAt: new Date(), decisionNote: b.note.trim() } });
      return { status: 'REJECTED' };
    }
    if (b.decision !== 'approve') throw bad('Decision must be approve or reject.');
    const s = await this.budgets.getSettings();
    if (n(ch.amount) > s.approvalThreshold && (user.role_name || '').toUpperCase() !== 'ADMIN') throw bad('Changes above the approval threshold need an Admin.', HttpStatus.FORBIDDEN);
    const adjust = async (lineId: number, delta: number) => {
      const line = await this.prisma.budgetLine.findUnique({ where: { id: lineId }, include: { periods: true, plan: true } });
      if (!line) throw bad('Budget line not found.', HttpStatus.NOT_FOUND);
      const months = this.budgets.fyMonths(line.plan.fy, s.fyStartMonth);
      const now = new Date();
      const m = months.find((x) => x.year === now.getFullYear() && x.month === now.getMonth() + 1) ?? months[11];
      const cur = line.periods.find((p) => p.year === m.year && p.month === m.month);
      const next = r2(n(cur?.amount) + delta);
      if (next < 0) throw bad('The line does not have that much budget left in the current month.');
      await this.prisma.budgetLinePeriod.upsert({ where: { lineId_year_month: { lineId, year: m.year, month: m.month } }, update: { amount: next }, create: { lineId, year: m.year, month: m.month, amount: next } });
    };
    await this.prisma.$transaction(async () => {
      if (ch.fromLineId) await adjust(ch.fromLineId, -n(ch.amount));
      if (ch.toLineId) await adjust(ch.toLineId, n(ch.amount));
    });
    await this.prisma.budgetChange.update({ where: { id }, data: { status: 'APPROVED', decidedByName: user.username ?? null, decidedAt: new Date(), decisionNote: b.note?.trim() || null } });
    this.log('budget_changes', id, 'APPROVE', user.id, {});
    return { status: 'APPROVED' };
  }

  async cancelChange(id: number, user: Actor) {
    const ch = await this.prisma.budgetChange.findUnique({ where: { id } });
    if (!ch || ch.status !== 'PENDING') throw bad('Only a pending change can be withdrawn.', HttpStatus.CONFLICT);
    if (ch.requestedById !== user.id && !['ADMIN', 'FINANCE'].includes((user.role_name || '').toUpperCase())) throw bad('Only the requester can withdraw it.', HttpStatus.FORBIDDEN);
    await this.prisma.budgetChange.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Monthly close ────────────────────────────────────────────────────────

  async close(year: number, month: number) {
    const s = await this.budgets.getSettings();
    const fyKey = s.fyStartMonth === 1 ? year : month >= s.fyStartMonth ? year : year - 1;
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy: fyKey } });
    const lock = await this.prisma.periodLock.findUnique({ where: { year_month: { year, month } } });
    const locks = await this.prisma.periodLock.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 12 });
    if (!plan) return { year, month, fy: fyKey, plan: null, locked: !!lock, lock, locks, lines: [] };
    const m = await this.budgets.monitor(fyKey);
    const lines = (m.lines as any[]).filter((l) => !l.is_contingency && l.cost_object !== 'RESERVE');
    const notes = await this.prisma.varianceNote.findMany({ where: { year, month } });
    const detail = await Promise.all(lines.map(async (l) => {
      const d = await this.budgets.lineDetail(l.id);
      const cell = d.months.find((x) => x.year === year && x.month === month);
      const budget = cell?.budget ?? 0; const actual = (cell?.actual ?? 0) + (cell?.committed ?? 0);
      const variance = r2(budget - actual);
      const note = (notes as any[]).find((x) => x.lineId === l.id);
      const pct = budget > 0 ? (actual - budget) / budget * 100 : actual > 0 ? 100 : 0;
      return {
        line_id: l.id, label: l.label, owner_name: l.owner_name, budget, actual: r2(actual), variance, variance_pct: r2(pct),
        needs_note: variance < -10000 && pct > 10, note: note ? { reason_code: note.reasonCode, comment: note.comment, author_name: note.authorName } : null,
      };
    }));
    return {
      year, month, fy: fyKey, plan: { label: m.label, status: plan.status }, locked: !!lock, lock: lock ? { locked_by_name: lock.lockedByName, locked_at: lock.lockedAt } : null, locks: locks.map((x) => ({ year: x.year, month: x.month, locked_by_name: x.lockedByName, locked_at: x.lockedAt })),
      lines: detail,
      totals: { budget: r2(detail.reduce((a, l) => a + l.budget, 0)), actual: r2(detail.reduce((a, l) => a + l.actual, 0)) },
    };
  }

  async saveVariance(b: { line_id: number; year: number; month: number; reason_code: string; comment?: string }, user: Actor) {
    if (!b.reason_code) throw bad('Choose a reason.');
    if (await this.prisma.periodLock.findUnique({ where: { year_month: { year: Number(b.year), month: Number(b.month) } } })) throw bad('This month is closed.', HttpStatus.CONFLICT);
    await this.prisma.varianceNote.upsert({
      where: { lineId_year_month: { lineId: Number(b.line_id), year: Number(b.year), month: Number(b.month) } },
      update: { reasonCode: b.reason_code, comment: b.comment?.trim() || null, authorName: user.username ?? null },
      create: { lineId: Number(b.line_id), year: Number(b.year), month: Number(b.month), reasonCode: b.reason_code, comment: b.comment?.trim() || null, authorName: user.username ?? null },
    });
    return { ok: true };
  }

  async lockMonth(year: number, month: number, user: Actor) {
    const view: any = await this.close(year, month);
    if (view.locked) throw bad('This month is already closed.', HttpStatus.CONFLICT);
    const missing = view.lines.filter((l: any) => l.needs_note && !l.note);
    if (missing.length) throw bad(`Give a reason for the large variances first: ${missing.slice(0, 3).map((l: any) => l.label).join(', ')}${missing.length > 3 ? '…' : ''}.`);
    await this.prisma.periodLock.create({ data: { year, month, lockedByName: user.username ?? null } });
    this.log('period_locks', year * 100 + month, 'LOCK', user.id, {});
    return { locked: true };
  }

  async unlockMonth(year: number, month: number, user: Actor) {
    await this.prisma.periodLock.delete({ where: { year_month: { year, month } } }).catch(() => undefined);
    this.log('period_locks', year * 100 + month, 'UNLOCK', user.id, {});
    return { locked: false };
  }
}
