import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TXN_STATUS } from '../common/constants/transaction-status';
import { addWorkingDays } from '../common/helpers/working-days';
import { financeSelfApprovalAllowed } from '../common/config/approval-policy';
import { STORE_DEPARTMENT, departmentNamed } from '../common/helpers/stock-departments';
import { today } from '../common/helpers/dates';

const PENDING = [TXN_STATUS.PENDING_MANAGER, TXN_STATUS.PENDING_FINANCE] as string[];
const COUNTED = [TXN_STATUS.APPROVED, ...PENDING];
const CONTROLLING = ['APPROVED', 'ACTIVE'];
const KIND: Record<string, string> = { PROJECT: 'PROJECT', PRODUCT: 'PRODUCT', ORDER: 'PRODUCT', DEPARTMENT: 'OVERHEAD' };
const LEVEL_RANK: Record<string, number> = { INFO: 1, CAUTION: 2, WARNING: 3, CRITICAL: 4 };

type Settings = { fyStartMonth: number; overBudgetMode: string; controlLevel: string; netOfClaimableGst: boolean; approvalThreshold: number; contingencyPct: number };
export type Part = {
  txnId: number; ref: string | null; status: string; year: number; month: number; amount: number;
  costObject: string; projectId: number | null; productId: number | null; departmentId: number | null; buildOrderId?: number | null;
  typeId: number | null; categoryId: number | null; submitterName?: string | null; submittedAt?: Date | null;
  // From the stock ledger rather than an expense
  stock?: boolean;
};
type Cell = { budget: number; actual: number; committed: number; stock: number };

const n = (v: any) => (v == null ? 0 : Number(v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Budget plans, lines and live usage. Actual and committed money is read straight from the
// transactions on every call, so available money always equals a full recalculation.
@Injectable()
export class BudgetsService {
  private readonly logger = new Logger('BudgetsService');
  private lastEvaluated = 0;

  constructor(private prisma: PrismaService, private audit: AuditService, private notifications: NotificationsService) {}

  // ── Settings ─────────────────────────────────────────────────────────────

  async getSettings(): Promise<Settings> {
    const s = await this.prisma.budgetSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    return {
      fyStartMonth: s.fyStartMonth, overBudgetMode: s.overBudgetMode, controlLevel: s.controlLevel,
      netOfClaimableGst: s.netOfClaimableGst, approvalThreshold: n(s.approvalThreshold), contingencyPct: n(s.contingencyPct),
    };
  }

  private mapSettings(s: Settings) {
    return {
      fy_start_month: s.fyStartMonth, over_budget_mode: s.overBudgetMode, control_level: s.controlLevel,
      net_of_claimable_gst: s.netOfClaimableGst, approval_threshold: s.approvalThreshold, contingency_pct: s.contingencyPct,
    };
  }

  async readSettings() {
    const [s, rules, plans] = await Promise.all([
      this.getSettings(),
      this.prisma.budgetAlertRule.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.budgetPlan.count(),
    ]);
    return {
      ...this.mapSettings(s),
      has_plans: plans > 0,
      rules: rules.map((r) => ({ code: r.code, name: r.name, detail: r.detail, enabled: r.enabled, threshold: r.threshold == null ? null : n(r.threshold) })),
    };
  }

  async saveSettings(body: any, userId: number) {
    const data: any = {};
    if (body.fy_start_month != null) {
      const m = Number(body.fy_start_month);
      if (!Number.isInteger(m) || m < 1 || m > 12) throw new HttpException('Financial year must start in a month from 1 to 12.', HttpStatus.BAD_REQUEST);
      if (await this.prisma.budgetPlan.count()) {
        const cur = await this.getSettings();
        if (cur.fyStartMonth !== m) throw new HttpException('The financial year start cannot change once a budget plan exists.', HttpStatus.CONFLICT);
      }
      data.fyStartMonth = m;
    }
    if (body.over_budget_mode != null) {
      if (!['WARN', 'BLOCK'].includes(body.over_budget_mode)) throw new HttpException('Over-budget mode must be WARN or BLOCK.', HttpStatus.BAD_REQUEST);
      data.overBudgetMode = body.over_budget_mode;
    }
    if (body.control_level != null) {
      if (!['TYPE', 'CATEGORY'].includes(body.control_level)) throw new HttpException('Control level must be TYPE or CATEGORY.', HttpStatus.BAD_REQUEST);
      data.controlLevel = body.control_level;
    }
    if (body.net_of_claimable_gst != null) data.netOfClaimableGst = !!body.net_of_claimable_gst;
    if (body.approval_threshold != null) {
      const v = Number(body.approval_threshold);
      if (isNaN(v) || v < 0) throw new HttpException('Approval threshold must be zero or more.', HttpStatus.BAD_REQUEST);
      data.approvalThreshold = v;
    }
    if (body.contingency_pct != null) {
      const v = Number(body.contingency_pct);
      if (isNaN(v) || v < 0 || v > 100) throw new HttpException('Contingency must be between 0 and 100.', HttpStatus.BAD_REQUEST);
      data.contingencyPct = v;
    }
    // Check every alert rule before anything is written, so a bad one saves nothing
    const rules: { code: string; enabled: boolean; threshold: number | null }[] = [];
    if (body.rules !== undefined) {
      if (!Array.isArray(body.rules)) throw new HttpException('Alert rules must be a list.', HttpStatus.BAD_REQUEST);
      const known = new Set((await this.prisma.budgetAlertRule.findMany({ select: { code: true } })).map((r) => r.code));
      for (const r of body.rules) {
        const code = String(r?.code ?? '');
        if (!known.has(code)) throw new HttpException(`Unknown alert rule ${code || '(none)'}.`, HttpStatus.BAD_REQUEST);
        const blank = r.threshold == null || r.threshold === '';
        const t = blank ? null : Number(r.threshold);
        if (t !== null && (!Number.isFinite(t) || t <= 0)) throw new HttpException('An alert threshold must be more than zero.', HttpStatus.BAD_REQUEST);
        rules.push({ code, enabled: !!r.enabled, threshold: t });
      }
    }
    const before = await this.readSettings();
    await this.prisma.$transaction(async (tx) => {
      await tx.budgetSetting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
      for (const r of rules) await tx.budgetAlertRule.update({ where: { code: r.code }, data: { enabled: r.enabled, threshold: r.threshold } });
    });
    const after = await this.readSettings();
    this.audit.log({ tableName: 'budget_settings', recordId: 1, action: 'UPDATE', changedBy: userId, oldValues: before, newValues: after }).catch(() => undefined);
    return after;
  }

  // ── Financial-year helpers ───────────────────────────────────────────────

  fyOf(date: Date, startMonth: number) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    return startMonth === 1 ? y : m >= startMonth ? y : y - 1;
  }

  fyLabel(fy: number, startMonth: number) {
    return startMonth === 1 ? `FY ${fy}` : `FY ${fy}-${String(fy + 1).slice(2)}`;
  }

  fyMonths(fy: number, startMonth: number) {
    return Array.from({ length: 12 }, (_, i) => {
      const m0 = startMonth - 1 + i;
      return { year: fy + Math.floor(m0 / 12), month: (m0 % 12) + 1 };
    });
  }

  private fyRange(fy: number, startMonth: number) {
    const months = this.fyMonths(fy, startMonth);
    const first = months[0];
    const last = months[11];
    return { from: new Date(Date.UTC(first.year, first.month - 1, 1)), to: new Date(Date.UTC(last.year, last.month, 0, 23, 59, 59, 999)) };
  }

  // ── Names for cost objects, types and owners ─────────────────────────────

  private async lookups() {
    const [projects, products, orders, departments, types, categories, users] = await Promise.all([
      this.prisma.project.findMany({ select: { id: true, name: true, code: true } }),
      this.prisma.product.findMany({ select: { id: true, name: true, code: true } }),
      this.prisma.buildOrder.findMany({ select: { id: true, code: true, quantity: true, product: { select: { name: true } } } }),
      this.prisma.department.findMany({ select: { id: true, name: true, ownerId: true } }),
      this.prisma.categoryType.findMany({ select: { id: true, name: true, code: true, appliesTo: true } }),
      this.prisma.category.findMany({ select: { id: true, name: true, code: true, typeId: true } }),
      this.prisma.user.findMany({ select: { id: true, username: true } }),
    ]);
    return {
      projects: new Map(projects.map((p) => [p.id, p])),
      products: new Map(products.map((p) => [p.id, p])),
      orders: new Map(orders.map((o) => [o.id, o])),
      departments: new Map(departments.map((d) => [d.id, d])),
      types: new Map(types.map((t) => [t.id, t])),
      categories: new Map(categories.map((c) => [c.id, c])),
      users: new Map((users as any[]).map((u) => [u.id, u])),
    };
  }

  private lineNames(l: any, lk: Awaited<ReturnType<BudgetsService['lookups']>>) {
    let object = 'Company reserve';
    let objectCode = 'Reserve';
    if (l.costObject === 'PROJECT') {
      const p = lk.projects.get(l.projectId);
      object = p?.name ?? 'Project'; objectCode = p?.code || p?.name || 'Project';
    } else if (l.costObject === 'PRODUCT') {
      const p = lk.products.get(l.productId);
      object = p?.name ?? 'Product'; objectCode = p?.code || p?.name || 'Product';
    } else if (l.costObject === 'ORDER') {
      const o = lk.orders.get(l.buildOrderId);
      object = o ? `${o.product?.name ?? 'Order'} × ${o.quantity}` : 'Order'; objectCode = o?.code ?? 'Order';
    } else if (l.costObject === 'DEPARTMENT') {
      const d = lk.departments.get(l.departmentId);
      object = d?.name ?? 'Department'; objectCode = d?.name ?? 'Department';
    }
    const t = l.typeId != null ? lk.types.get(l.typeId) : null;
    const c = l.categoryId != null ? lk.categories.get(l.categoryId) : null;
    const typeLabel = t ? [t.code, t.name].filter(Boolean).join(' ') : l.isContingency ? 'Contingency' : 'Reserve';
    const catLabel = c ? [c.code, c.name].filter(Boolean).join(' ') : null;
    const owner = l.ownerId != null ? lk.users.get(l.ownerId) : null;
    return {
      object, objectCode, typeLabel, catLabel,
      typeCode: t?.code ?? null,
      label: `${objectCode} · ${l.isContingency ? 'Contingency (held)' : (catLabel ?? typeLabel)}`,
      ownerName: owner ? owner.username : null,
    };
  }

  // ── Usage: actual and committed money per cost object, type and month ────

  private async loadParts(fy: number, s: Settings, excludeTxnId?: number): Promise<Part[]> {
    const { from, to } = this.fyRange(fy, s.fyStartMonth);
    const txns = await this.prisma.transaction.findMany({
      where: { type: 'expense', status: { in: COUNTED }, dateRecorded: { gte: from, lte: to }, ...(excludeTxnId ? { NOT: { id: excludeTxnId } } : {}) },
      include: { category: { select: { typeId: true } }, splits: { include: { category: { select: { typeId: true } } } } },
    });
    const parts: Part[] = [];
    for (const t of txns as any[]) parts.push(...this.partsOf(t, s));
    // Stock used on a job, and stock count differences (charged to Workshop)
    parts.push(...(await this.stockParts({ kind: { in: ['USED', 'ADJUST'] }, movedOn: { gte: from, lte: to } })));
    return parts;
  }

  // Ledger entries shaped like expense parts. Their ids are negative, so they never match an expense.
  async stockParts(where: any): Promise<Part[]> {
    const moves = await this.prisma.stockMove.findMany({ where, include: { category: { select: { typeId: true } }, buildOrder: { select: { productId: true } } } });
    return moves.map((m: any) => {
      const costObject = m.buildOrderId != null ? 'PRODUCT' : m.projectId != null ? 'PROJECT' : 'DEPARTMENT';
      return {
        txnId: -m.id, ref: `STK-${m.id}`, status: TXN_STATUS.APPROVED, year: m.movedOn.getUTCFullYear(), month: m.movedOn.getUTCMonth() + 1,
        amount: -n(m.value), costObject, projectId: costObject === 'PROJECT' ? m.projectId : null, productId: m.buildOrder?.productId ?? null,
        departmentId: costObject === 'DEPARTMENT' ? m.departmentId : null, buildOrderId: m.buildOrderId, typeId: m.category?.typeId ?? null, categoryId: m.categoryId,
        submitterName: m.createdByName, submittedAt: m.createdAt, stock: true,
      };
    });
  }

  partsOf(t: any, s: Settings): Part[] {
    const total = n(t.totalAmount ?? t.amount);
    const cost = s.netOfClaimableGst && t.isClaimable ? n(t.netAmount ?? t.amount) : total;
    const ratio = total > 0 ? cost / total : 1;
    const d = new Date(t.dateRecorded);
    const base = { txnId: t.id, ref: t.referenceId, status: t.status, year: d.getFullYear(), month: d.getMonth() + 1, submitterName: t.submittedByName, submittedAt: t.submittedAt, buildOrderId: (t.buildOrderId ?? null) as number | null };
    // A stock purchase counts on the Store department's line, never on a job
    const kind = (t.contextType || 'project') === 'product' ? 'PRODUCT' : t.contextType === 'overhead' || t.contextType === 'stock' ? 'DEPARTMENT' : 'PROJECT';
    const mk = (amount: number, projectId: any, productId: any, categoryId: any, typeId: any): Part => ({
      ...base, amount: amount * ratio, costObject: kind,
      projectId: kind === 'PROJECT' ? projectId ?? t.projectId ?? null : null,
      productId: kind === 'PRODUCT' ? productId ?? t.productId ?? null : null,
      departmentId: kind === 'DEPARTMENT' ? t.departmentId ?? null : null,
      categoryId: categoryId ?? null, typeId: typeId ?? null,
    });
    if (t.isSplit && t.splits?.length) {
      return t.splits.map((sp: any) => mk(n(sp.amount), sp.projectId, sp.productId, sp.categoryId, sp.category?.typeId));
    }
    return [mk(total, t.projectId, t.productId, t.categoryId, t.category?.typeId)];
  }

  // Expense parts matching any transaction filter, for project and product roll-ups
  async partsWhere(where: any): Promise<Part[]> {
    const s = await this.getSettings();
    const txns = await this.prisma.transaction.findMany({
      where: { type: 'expense', ...where },
      include: { category: { select: { typeId: true } }, splits: { include: { category: { select: { typeId: true } } } } },
    });
    const parts: Part[] = [];
    for (const t of txns as any[]) parts.push(...this.partsOf(t, s));
    return parts;
  }

  private objectIdOf(x: { costObject: string; projectId: number | null; productId: number | null; departmentId: number | null; buildOrderId?: number | null }) {
    return x.costObject === 'PROJECT' ? x.projectId : x.costObject === 'PRODUCT' ? x.productId : x.costObject === 'ORDER' ? x.buildOrderId ?? null : x.costObject === 'DEPARTMENT' ? x.departmentId : null;
  }

  // The line an expense part is charged to: a category-level line first, then the type-level line.
  // An expense charged to a build order goes to that order's own line when it has one for the type, otherwise to the product's line.
  private matchLine(part: Pick<Part, 'costObject' | 'projectId' | 'productId' | 'departmentId' | 'typeId' | 'categoryId'> & { buildOrderId?: number | null }, lines: any[]) {
    const pick = (costObject: string, oid: number | null) => {
      const cands = lines.filter((l) => l.isActive && !l.isContingency && l.costObject === costObject && this.objectIdOf(l) === oid && l.typeId === part.typeId);
      return cands.find((l) => l.controlLevel === 'CATEGORY' && l.categoryId === part.categoryId) ?? cands.find((l) => l.controlLevel === 'TYPE') ?? null;
    };
    return (part.buildOrderId != null ? pick('ORDER', part.buildOrderId) : null) ?? pick(part.costObject, this.objectIdOf(part));
  }

  private lineTotals(line: any) {
    const byMonth = new Map<string, Cell>();
    for (const p of line.periods) byMonth.set(`${p.year}-${p.month}`, { budget: n(p.amount), actual: 0, committed: 0, stock: 0 });
    return byMonth;
  }

  private computeUsage(lines: any[], parts: Part[]) {
    const usage = new Map<number, Map<string, Cell>>();
    for (const l of lines) usage.set(l.id, this.lineTotals(l));
    const unmatched: Part[] = [];
    for (const p of parts) {
      const line = this.matchLine(p, lines);
      if (!line) { unmatched.push(p); continue; }
      const m = usage.get(line.id)!;
      const key = `${p.year}-${p.month}`;
      const cell = m.get(key) ?? { budget: 0, actual: 0, committed: 0, stock: 0 };
      if (p.status === TXN_STATUS.APPROVED) cell.actual += p.amount; else cell.committed += p.amount;
      if (p.stock) cell.stock += p.amount;
      m.set(key, cell);
    }
    return { usage, unmatched };
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  private mapPlan(p: any, s: Settings) {
    return {
      id: p.id, fy: p.fy, label: this.fyLabel(p.fy, s.fyStartMonth), name: p.name, status: p.status, envelope: p.envelope == null ? null : n(p.envelope),
      version: p.version, submitted_at: p.submittedAt, submitted_by_name: p.submittedByName,
      approved_at: p.approvedAt, approved_by_name: p.approvedByName, decision_note: p.decisionNote,
    };
  }

  async listPlans() {
    const s = await this.getSettings();
    const plans = await this.prisma.budgetPlan.findMany({ orderBy: { fy: 'desc' }, include: { _count: { select: { lines: true } } } });
    return { current_fy: this.fyOf(new Date(), s.fyStartMonth), plans: plans.map((p) => ({ ...this.mapPlan(p, s), line_count: (p as any)._count.lines })) };
  }

  async createPlan(body: { fy: number; name?: string; copy_from_fy?: number; envelope?: number }, userId: number) {
    const s = await this.getSettings();
    const fy = Number(body.fy);
    if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) throw new HttpException('Choose a valid financial year.', HttpStatus.BAD_REQUEST);
    if (await this.prisma.budgetPlan.findUnique({ where: { fy } })) throw new HttpException(`A plan for ${this.fyLabel(fy, s.fyStartMonth)} already exists.`, HttpStatus.CONFLICT);
    const plan = await this.prisma.budgetPlan.create({
      data: { fy, name: body.name?.trim() || `Budget ${this.fyLabel(fy, s.fyStartMonth)}`, envelope: body.envelope != null && body.envelope !== ('' as any) ? Number(body.envelope) : null, createdBy: userId },
    });
    if (body.copy_from_fy != null) {
      const src = await this.prisma.budgetPlan.findUnique({ where: { fy: Number(body.copy_from_fy) }, include: { lines: { include: { periods: true } } } });
      if (src) {
        const shift = fy - src.fy;
        for (const l of src.lines) {
          if (l.costObject === 'PROJECT' || l.costObject === 'PRODUCT' || l.costObject === 'ORDER') {
            // only recurring cost objects carry over: overhead and reserve lines
            continue;
          }
          await this.prisma.budgetLine.create({
            data: {
              planId: plan.id, costObject: l.costObject, projectId: l.projectId, productId: l.productId, departmentId: l.departmentId,
              typeId: l.typeId, categoryId: l.categoryId, controlLevel: l.controlLevel, strict: l.strict, isContingency: l.isContingency,
              ownerId: l.ownerId, note: l.note,
              periods: { create: l.periods.map((p) => ({ year: p.year + shift, month: p.month, amount: p.amount })) },
            },
          });
        }
      }
    }
    this.audit.log({ tableName: 'budget_plans', recordId: plan.id, action: 'INSERT', changedBy: userId, newValues: plan }).catch(() => undefined);
    return this.mapPlan(plan, s);
  }

  private async planOrThrow(fy: number) {
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy } });
    if (!plan) throw new HttpException('There is no budget plan for this financial year.', HttpStatus.NOT_FOUND);
    return plan;
  }

  async updatePlan(fy: number, body: { name?: string; envelope?: number | null }, userId: number) {
    const s = await this.getSettings();
    const plan = await this.planOrThrow(fy);
    const data: any = {};
    if (body.name != null) {
      if (!body.name.trim()) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
      data.name = body.name.trim();
    }
    if (body.envelope !== undefined) data.envelope = body.envelope === null || (body.envelope as any) === '' ? null : Number(body.envelope);
    const row = await this.prisma.budgetPlan.update({ where: { id: plan.id }, data });
    this.audit.log({ tableName: 'budget_plans', recordId: plan.id, action: 'UPDATE', changedBy: userId, oldValues: plan, newValues: row }).catch(() => undefined);
    return this.mapPlan(row, s);
  }

  async deletePlan(fy: number, userId: number) {
    const plan = await this.planOrThrow(fy);
    if (plan.status !== 'DRAFT') throw new HttpException('Only a draft plan can be deleted.', HttpStatus.CONFLICT);
    // The plan for this year and earlier years stay; only a plan for a future year can go, which is what makes room for a new one
    const s = await this.getSettings();
    if (fy <= this.fyOf(new Date(), s.fyStartMonth)) throw new HttpException('Only a plan for a future year can be deleted.', HttpStatus.CONFLICT);
    await this.prisma.budgetPlan.delete({ where: { id: plan.id } });
    this.audit.log({ tableName: 'budget_plans', recordId: plan.id, action: 'DELETE', changedBy: userId, oldValues: plan }).catch(() => undefined);
    return { deleted: true };
  }

  async submitPlan(fy: number, user: { id: number; username?: string }) {
    const s = await this.getSettings();
    const plan = await this.planOrThrow(fy);
    if (plan.status !== 'DRAFT') throw new HttpException('Only a draft plan can be submitted.', HttpStatus.CONFLICT);
    const count = await this.prisma.budgetLine.count({ where: { planId: plan.id, isActive: true } });
    if (!count) throw new HttpException('Add at least one budget line before submitting.', HttpStatus.BAD_REQUEST);
    const row = await this.prisma.budgetPlan.update({ where: { id: plan.id }, data: { status: 'SUBMITTED', submittedAt: new Date(), submittedByName: user.username ?? null, decisionNote: null } });
    this.audit.log({ tableName: 'budget_plans', recordId: plan.id, action: 'SUBMIT', changedBy: user.id, newValues: row }).catch(() => undefined);
    const approvers = await this.prisma.user.findMany({ where: { userRoles: { some: { role: { name: { in: ['ADMIN', 'FINANCE'] } } } } } as any, select: { id: true } });
    for (const a of approvers) {
      this.notifications.create(a.id, { type: 'BUDGET', title: 'Budget plan submitted', message: `${this.fyLabel(fy, s.fyStartMonth)} is waiting for your approval.`, entityType: 'budget_plan', entityId: plan.id }).catch(() => undefined);
    }
    return this.mapPlan(row, s);
  }

  async decidePlan(fy: number, body: { decision: string; note?: string }, user: { id: number; username?: string }) {
    const s = await this.getSettings();
    const plan = await this.planOrThrow(fy);
    if (plan.status !== 'SUBMITTED') throw new HttpException('Only a submitted plan can be approved or sent back.', HttpStatus.CONFLICT);
    // Whoever submitted the plan does not approve it, unless nobody else can
    if (body.decision === 'approve' && plan.submittedByName && plan.submittedByName === user.username && !financeSelfApprovalAllowed()) {
      const other = await this.prisma.user.findFirst({ where: { isActive: true, id: { not: user.id }, userRoles: { some: { role: { name: { in: ['FINANCE', 'ADMIN'] } } } } } });
      if (other) throw new HttpException('You submitted this plan. Another Finance or Admin user needs to approve it.', HttpStatus.FORBIDDEN);
    }
    let row;
    if (body.decision === 'approve') {
      const started = today() >= this.fyRange(fy, s.fyStartMonth).from;
      row = await this.prisma.budgetPlan.update({
        where: { id: plan.id },
        data: { status: started ? 'ACTIVE' : 'APPROVED', approvedAt: new Date(), approvedById: user.id, approvedByName: user.username ?? null, decisionNote: body.note?.trim() || null },
      });
    } else if (body.decision === 'send_back') {
      if (!body.note?.trim()) throw new HttpException('Say what needs to change.', HttpStatus.BAD_REQUEST);
      row = await this.prisma.budgetPlan.update({ where: { id: plan.id }, data: { status: 'DRAFT', decisionNote: body.note.trim() } });
    } else {
      throw new HttpException('Decision must be approve or send_back.', HttpStatus.BAD_REQUEST);
    }
    this.audit.log({ tableName: 'budget_plans', recordId: plan.id, action: body.decision === 'approve' ? 'APPROVE' : 'SEND_BACK', changedBy: user.id, newValues: row }).catch(() => undefined);
    this.lastEvaluated = 0;
    return this.mapPlan(row, s);
  }

  // The whole plan: its lines, month grid and live usage
  async getPlan(fy: number, scope: { ownerId?: number } = {}) {
    const s = await this.getSettings();
    const plan = await this.planOrThrow(fy);
    const lines = await this.prisma.budgetLine.findMany({ where: { planId: plan.id, isActive: true }, include: { periods: true }, orderBy: { id: 'asc' } });
    const lk = await this.lookups();
    const months = this.fyMonths(fy, s.fyStartMonth);
    const parts = await this.loadParts(fy, s);
    const { usage } = this.computeUsage(lines, parts);
    const visible = scope.ownerId != null ? lines.filter((l) => l.ownerId === scope.ownerId) : lines;
    const rows = visible.map((l) => this.mapLine(l, lk, usage.get(l.id)!, months));
    const planned = rows.reduce((a, r) => a + r.total, 0);
    const reserve = rows.filter((r) => r.cost_object === 'RESERVE' || r.is_contingency).reduce((a, r) => a + r.total, 0);
    return {
      plan: this.mapPlan(plan, s),
      months: months.map((m) => ({ year: m.year, month: m.month, label: `${MON[m.month - 1]}${m.month === 1 || m === months[0] ? ` ${String(m.year).slice(2)}` : ''}` })),
      lines: rows,
      totals: { planned: r2(planned), reserve: r2(reserve), envelope: plan.envelope == null ? null : n(plan.envelope), unallocated: plan.envelope == null ? null : r2(n(plan.envelope) - planned) },
    };
  }

  private mapLine(l: any, lk: Awaited<ReturnType<BudgetsService['lookups']>>, usage: Map<string, Cell>, months: { year: number; month: number }[]) {
    const names = this.lineNames(l, lk);
    const periods = months.map((m) => n(l.periods.find((p: any) => p.year === m.year && p.month === m.month)?.amount));
    let actual = 0; let committed = 0; let stock = 0;
    for (const v of usage.values()) { actual += v.actual; committed += v.committed; stock += v.stock; }
    return {
      id: l.id, plan_id: l.planId, cost_object: l.costObject, project_id: l.projectId, product_id: l.productId, build_order_id: l.buildOrderId ?? null, department_id: l.departmentId,
      type_id: l.typeId, category_id: l.categoryId, control_level: l.controlLevel, strict: l.strict, is_contingency: l.isContingency,
      owner_id: l.ownerId, owner_name: names.ownerName, note: l.note,
      object_name: names.object, object_code: names.objectCode, type_label: names.typeLabel, category_label: names.catLabel, label: names.label,
      periods, total: r2(periods.reduce((a, b) => a + b, 0)), actual: r2(actual), committed: r2(committed), stock_used: r2(stock),
    };
  }

  // ── Lines ────────────────────────────────────────────────────────────────

  private async editablePlan(planId: number, reason: string | undefined, userId: number, isFinance: boolean) {
    const plan = await this.prisma.budgetPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new HttpException('Budget plan not found.', HttpStatus.NOT_FOUND);
    if (plan.status === 'DRAFT') return plan;
    if (plan.status === 'SUBMITTED') throw new HttpException('The plan is waiting for approval and cannot be edited.', HttpStatus.CONFLICT);
    if (plan.status === 'CLOSED') throw new HttpException('The plan is closed.', HttpStatus.CONFLICT);
    if (!isFinance) throw new HttpException('An approved plan can only be changed by Finance or Admin.', HttpStatus.FORBIDDEN);
    if (!reason?.trim()) throw new HttpException('Give a reason to change an approved plan.', HttpStatus.BAD_REQUEST);
    return plan;
  }

  private async validateLine(body: any, planId: number, excludeId?: number) {
    const costObject = String(body.cost_object || '');
    if (!['PROJECT', 'PRODUCT', 'ORDER', 'DEPARTMENT', 'RESERVE'].includes(costObject)) throw new HttpException('Choose what the budget is for.', HttpStatus.BAD_REQUEST);
    const data: any = {
      costObject, projectId: null, productId: null, buildOrderId: null, departmentId: null, typeId: null, categoryId: null,
      controlLevel: body.control_level === 'CATEGORY' ? 'CATEGORY' : 'TYPE', strict: !!body.strict, isContingency: !!body.is_contingency,
      ownerId: body.owner_id ? Number(body.owner_id) : null, note: body.note?.trim() || null,
    };
    if (costObject === 'PROJECT') data.projectId = Number(body.project_id) || null;
    if (costObject === 'PRODUCT') data.productId = Number(body.product_id) || null;
    if (costObject === 'ORDER') data.buildOrderId = Number(body.build_order_id) || null;
    if (costObject === 'DEPARTMENT') data.departmentId = Number(body.department_id) || null;
    if (costObject !== 'RESERVE' && !this.objectIdOf(data)) throw new HttpException('Choose the project, product, order or department.', HttpStatus.BAD_REQUEST);
    if (costObject === 'ORDER' && !(await this.prisma.buildOrder.findUnique({ where: { id: data.buildOrderId }, select: { id: true } }))) throw new HttpException('Order not found.', HttpStatus.NOT_FOUND);
    if (costObject === 'RESERVE') { data.isContingency = false; data.strict = false; }
    const needsType = costObject !== 'RESERVE' && !data.isContingency;
    if (needsType) {
      data.typeId = Number(body.type_id) || null;
      if (!data.typeId) throw new HttpException('Choose an expense type.', HttpStatus.BAD_REQUEST);
      const type = await this.prisma.categoryType.findUnique({ where: { id: data.typeId } });
      if (!type) throw new HttpException('Expense type not found.', HttpStatus.NOT_FOUND);
      const isStore = costObject === 'DEPARTMENT' && (await this.prisma.department.findUnique({ where: { id: data.departmentId }, select: { name: true } }))?.name === STORE_DEPARTMENT;
      if (!isStore && type.appliesTo && !type.appliesTo.split(',').includes(KIND[costObject])) {
        throw new HttpException(`${[type.code, type.name].filter(Boolean).join(' ')} cannot be charged to ${costObject === 'DEPARTMENT' ? 'overheads' : costObject.toLowerCase() + 's'}.`, HttpStatus.BAD_REQUEST);
      }
      if (data.controlLevel === 'CATEGORY') {
        data.categoryId = Number(body.category_id) || null;
        if (!data.categoryId) throw new HttpException('Choose the category this line controls.', HttpStatus.BAD_REQUEST);
        const cat = await this.prisma.category.findUnique({ where: { id: data.categoryId } });
        if (!cat || cat.typeId !== data.typeId) throw new HttpException('That category does not belong to the chosen type.', HttpStatus.BAD_REQUEST);
      }
    } else { data.controlLevel = 'TYPE'; }
    const dup = await this.prisma.budgetLine.findFirst({
      where: {
        planId, isActive: true, costObject, projectId: data.projectId, productId: data.productId, buildOrderId: data.buildOrderId, departmentId: data.departmentId,
        typeId: data.typeId, categoryId: data.categoryId, isContingency: data.isContingency, ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (dup) throw new HttpException('This plan already has a line for that combination.', HttpStatus.CONFLICT);
    return data;
  }

  // Annual total spread evenly over the chosen months, or an explicit list of 12 monthly amounts
  private buildPeriods(fy: number, s: Settings, body: any) {
    const months = this.fyMonths(fy, s.fyStartMonth);
    if (Array.isArray(body.periods)) {
      return months.map((m, i) => ({ year: m.year, month: m.month, amount: r2(Math.max(0, Number(body.periods[i]) || 0)) }));
    }
    const total = Math.max(0, Number(body.total) || 0);
    const from = Math.min(11, Math.max(0, Number(body.from_index ?? 0)));
    const to = Math.min(11, Math.max(from, Number(body.to_index ?? 11)));
    const span = to - from + 1;
    const each = Math.floor((total / span) * 100) / 100;
    let left = r2(total - each * span);
    return months.map((m, i) => {
      if (i < from || i > to) return { year: m.year, month: m.month, amount: 0 };
      const extra = i === to ? left : 0;
      return { year: m.year, month: m.month, amount: r2(each + extra) };
    });
  }

  // A manager only changes lines they own; Finance and Admin change any line
  // Operations prepares the plan, so it changes any draft line like Finance does (an approved plan still needs Finance)
  private changesAnyLine(user: { role_name?: string }, isFinance: boolean) {
    return isFinance || (user.role_name || '').toUpperCase() === 'OPERATIONS';
  }

  private assertCanChange(line: { ownerId: number | null }, user: { id: number; role_name?: string }, isFinance: boolean) {
    if (!this.changesAnyLine(user, isFinance) && line.ownerId !== user.id) throw new HttpException('Only the line owner, Finance or Admin can change this line.', HttpStatus.FORBIDDEN);
  }

  // Money in a closed month cannot move: any change to a locked month is refused
  private async assertOpenMonths(changes: { year: number; month: number; before: number; after: number }[]) {
    const moved = changes.filter((c) => r2(c.before) !== r2(c.after));
    if (!moved.length) return;
    const locks = await this.prisma.periodLock.findMany({ select: { year: true, month: true } });
    const closed = moved.find((c) => locks.some((l) => l.year === c.year && l.month === c.month));
    if (closed) throw new HttpException(`${MON[closed.month - 1]} ${closed.year} is closed. Ask Finance to reopen it before changing its budget.`, HttpStatus.BAD_REQUEST);
  }

  async createLine(body: any, user: { id: number; role_name?: string }, isFinance: boolean) {
    const s = await this.getSettings();
    const plan = await this.editablePlan(Number(body.plan_id), body.reason, user.id, isFinance);
    if (!this.changesAnyLine(user, isFinance)) body = { ...body, owner_id: user.id };
    const data = await this.validateLine(body, plan.id);
    const periods = this.buildPeriods(plan.fy, s, body);
    await this.assertOpenMonths(periods.map((p) => ({ year: p.year, month: p.month, before: 0, after: p.amount })));
    const line = await this.prisma.budgetLine.create({ data: { planId: plan.id, ...data, periods: { create: periods } }, include: { periods: true } });
    this.audit.log({ tableName: 'budget_lines', recordId: line.id, action: 'INSERT', changedBy: user.id, newValues: { ...line, reason: body.reason ?? null } }).catch(() => undefined);
    this.lastEvaluated = 0;
    return { id: line.id };
  }

  async updateLine(id: number, body: any, user: { id: number; role_name?: string }, isFinance: boolean) {
    const s = await this.getSettings();
    const line = await this.prisma.budgetLine.findUnique({ where: { id }, include: { periods: true } });
    if (!line || !line.isActive) throw new HttpException('Budget line not found.', HttpStatus.NOT_FOUND);
    this.assertCanChange(line, user, isFinance);
    const plan = await this.editablePlan(line.planId, body.reason, user.id, isFinance);
    if (!this.changesAnyLine(user, isFinance)) body = { ...body, owner_id: user.id };
    const data = await this.validateLine(body, plan.id, id);
    const hasAmounts = Array.isArray(body.periods) || body.total != null;
    if (hasAmounts) {
      const next = this.buildPeriods(plan.fy, s, body);
      const before = (y: number, m: number) => n(line.periods.find((o) => o.year === y && o.month === m)?.amount);
      await this.assertOpenMonths(next.map((p) => ({ year: p.year, month: p.month, before: before(p.year, p.month), after: p.amount })));
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.budgetLine.update({ where: { id }, data });
      if (hasAmounts) {
        await tx.budgetLinePeriod.deleteMany({ where: { lineId: id } });
        await tx.budgetLinePeriod.createMany({ data: this.buildPeriods(plan.fy, s, body).map((p) => ({ ...p, lineId: id })) });
      }
    });
    this.audit.log({ tableName: 'budget_lines', recordId: id, action: 'UPDATE', changedBy: user.id, oldValues: line, newValues: { ...body } }).catch(() => undefined);
    this.lastEvaluated = 0;
    return { id };
  }

  // Edit a single month of a line (planner grid cell)
  async setPeriod(id: number, body: { year: number; month: number; amount: number; reason?: string }, user: { id: number; role_name?: string }, isFinance: boolean) {
    const line = await this.prisma.budgetLine.findUnique({ where: { id } });
    if (!line || !line.isActive) throw new HttpException('Budget line not found.', HttpStatus.NOT_FOUND);
    this.assertCanChange(line, user, isFinance);
    await this.editablePlan(line.planId, body.reason, user.id, isFinance);
    const amount = r2(Math.max(0, Number(body.amount) || 0));
    const existing = await this.prisma.budgetLinePeriod.findUnique({ where: { lineId_year_month: { lineId: id, year: Number(body.year), month: Number(body.month) } } });
    await this.assertOpenMonths([{ year: Number(body.year), month: Number(body.month), before: n(existing?.amount), after: amount }]);
    await this.prisma.budgetLinePeriod.upsert({
      where: { lineId_year_month: { lineId: id, year: Number(body.year), month: Number(body.month) } },
      update: { amount }, create: { lineId: id, year: Number(body.year), month: Number(body.month), amount },
    });
    this.audit.log({ tableName: 'budget_line_periods', recordId: id, action: 'UPDATE', changedBy: user.id, newValues: { ...body, amount } }).catch(() => undefined);
    this.lastEvaluated = 0;
    return { id };
  }

  async deleteLine(id: number, reason: string | undefined, user: { id: number; role_name?: string }, isFinance: boolean) {
    const line = await this.prisma.budgetLine.findUnique({ where: { id }, include: { periods: true } });
    if (!line || !line.isActive) throw new HttpException('Budget line not found.', HttpStatus.NOT_FOUND);
    this.assertCanChange(line, user, isFinance);
    await this.editablePlan(line.planId, reason, user.id, isFinance);
    await this.assertOpenMonths(line.periods.map((p) => ({ year: p.year, month: p.month, before: n(p.amount), after: 0 })));
    await this.prisma.$transaction([
      this.prisma.transaction.updateMany({ where: { budgetLineId: id }, data: { budgetLineId: null } }),
      this.prisma.budgetLine.delete({ where: { id } }),
    ]);
    this.audit.log({ tableName: 'budget_lines', recordId: id, action: 'DELETE', changedBy: user.id, oldValues: { ...line, reason: reason ?? null } }).catch(() => undefined);
    this.lastEvaluated = 0;
    return { deleted: true };
  }

  // ── Monitor ──────────────────────────────────────────────────────────────

  private statusOf(pct: number, strict: boolean, s: { caution: number; warning: number }) {
    if (pct >= 100) return strict ? 'Critical' : 'Critical';
    if (pct >= s.warning) return 'Warning';
    if (pct >= s.caution) return 'Caution';
    return 'On track';
  }

  private thresholds(rules: { code: string; threshold: any }[]) {
    const caution = n(rules.find((r) => r.code === 'UTILISATION')?.threshold) || 75;
    return { caution, warning: Math.min(99, caution + 15) };
  }

  async monitor(fy: number | undefined, scope: { ownerId?: number } = {}) {
    const s = await this.getSettings();
    const useFy = fy ?? this.fyOf(new Date(), s.fyStartMonth);
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy: useFy } });
    const base = { fy: useFy, label: this.fyLabel(useFy, s.fyStartMonth) };
    if (!plan) return { ...base, plan: null, kpis: null, lines: [] };
    const [lines, lk, parts, rules, alerts] = await Promise.all([
      this.prisma.budgetLine.findMany({ where: { planId: plan.id, isActive: true }, include: { periods: true }, orderBy: { id: 'asc' } }),
      this.lookups(),
      this.loadParts(useFy, s),
      this.prisma.budgetAlertRule.findMany(),
      this.prisma.budgetAlert.findMany({ where: { status: 'OPEN' } }),
    ]);
    const th = this.thresholds(rules);
    const months = this.fyMonths(useFy, s.fyStartMonth);
    const { usage, unmatched } = this.computeUsage(lines, parts);
    const today = new Date();
    const range = this.fyRange(useFy, s.fyStartMonth);
    const elapsedMonths = Math.min(12, Math.max(0, (today.getFullYear() - range.from.getFullYear()) * 12 + today.getMonth() - range.from.getMonth() + 1));
    const openByLine = new Map<number, number>();
    for (const a of alerts) if (a.lineId != null) openByLine.set(a.lineId, (openByLine.get(a.lineId) ?? 0) + 1);

    const visible = scope.ownerId != null ? lines.filter((l) => l.ownerId === scope.ownerId) : lines;
    const rows = visible.map((l) => {
      const row = this.mapLine(l, lk, usage.get(l.id)!, months);
      const used = row.actual + row.committed;
      const pct = row.total > 0 ? (used / row.total) * 100 : used > 0 ? 999 : 0;
      // run-rate forecast: what has been used so far, projected over the rest of the year
      const forecast = elapsedMonths >= 1 && used > 0 ? r2((used / elapsedMonths) * 12) : null;
      let runsOut: string | null = null;
      if (elapsedMonths >= 1 && used > 0 && row.total > 0) {
        if (used >= row.total) runsOut = 'Ran out';
        else {
          const days = ((row.total - used) / (used / elapsedMonths)) * 30.4;
          const d = new Date(today.getTime() + days * 86400000);
          if (d <= range.to) runsOut = `${d.getDate()} ${MON[d.getMonth()]}`;
        }
      }
      const status = row.is_contingency || row.cost_object === 'RESERVE' ? 'Held' : this.statusOf(pct, row.strict, th);
      return {
        ...row, used: r2(used), available: r2(row.total - used), pct: Math.round(pct * 10) / 10, forecast, runs_out: runsOut, status,
        forecast_over: forecast != null && forecast > row.total * 1.0 && status === 'On track',
        open_alerts: openByLine.get(l.id) ?? 0,
      };
    });
    const sum = (f: (r: (typeof rows)[number]) => number) => r2(rows.reduce((a, r) => a + f(r), 0));
    return {
      ...base,
      plan: this.mapPlan(plan, s),
      as_of: today.toISOString(),
      kpis: {
        // Totals are money spent: stock used is left out, because its purchase is already counted
        approved: sum((r) => r.total), actual: sum((r) => r.actual - r.stock_used), committed: sum((r) => r.committed),
        stock_used: sum((r) => r.stock_used),
        forecast: sum((r) => (r.forecast == null ? r.total : r.used !== 0 ? r.forecast * ((r.used - r.stock_used) / r.used) : r.forecast)), open_alerts: alerts.length,
        unbudgeted: r2(unmatched.filter((p) => !p.stock).reduce((a, p) => a + p.amount, 0)), unbudgeted_count: new Set(unmatched.filter((p) => !p.stock).map((p) => p.txnId)).size,
      },
      lines: rows,
    };
  }

  // Month-by-month budget, actual and committed for one line (monitor detail panel)
  async lineDetail(id: number, scope: { ownerId?: number } = {}) {
    const s = await this.getSettings();
    const line = await this.prisma.budgetLine.findUnique({ where: { id }, include: { periods: true, plan: true } });
    if (!line || (scope.ownerId != null && line.ownerId !== scope.ownerId)) throw new HttpException('Budget line not found.', HttpStatus.NOT_FOUND);
    const [lk, parts, alerts] = await Promise.all([this.lookups(), this.loadParts(line.plan.fy, s), this.prisma.budgetAlert.findMany({ where: { lineId: id, status: 'OPEN' }, orderBy: { openedAt: 'desc' } })]);
    const months = this.fyMonths(line.plan.fy, s.fyStartMonth);
    const { usage } = this.computeUsage([line], parts);
    const mine = parts.filter((p) => this.matchLine(p, [line])?.id === id);
    const u = usage.get(id)!;
    const txnIds = [...new Set(mine.map((p) => p.txnId))];
    const txns = txnIds.length ? await this.prisma.transaction.findMany({ where: { id: { in: txnIds } }, orderBy: { dateRecorded: 'desc' }, take: 25, select: { id: true, referenceId: true, description: true, dateRecorded: true, status: true, amount: true, totalAmount: true } }) : [];
    return {
      line: this.mapLine(line, lk, u, months),
      months: months.map((m) => {
        const c = u.get(`${m.year}-${m.month}`) ?? { budget: 0, actual: 0, committed: 0 };
        return { year: m.year, month: m.month, label: MON[m.month - 1], budget: r2(c.budget), actual: r2(c.actual), committed: r2(c.committed) };
      }),
      alerts: alerts.map((a) => ({ id: a.id, level: a.level, message: a.message, opened_at: a.openedAt })),
      expenses: txns.map((t) => ({ id: t.id, reference_id: t.referenceId, description: t.description, date_recorded: t.dateRecorded, status: t.status, amount: n(t.totalAmount ?? t.amount) })),
      stock_entries: await this.stockEntries(mine.filter((p) => p.stock).map((p) => -p.txnId)),
    };
  }

  private async stockEntries(ids: number[]) {
    if (!ids.length) return [];
    const moves = await this.prisma.stockMove.findMany({ where: { id: { in: ids } }, include: { item: { select: { partNo: true, uom: true } } }, orderBy: [{ movedOn: 'desc' }, { id: 'desc' }], take: 25 });
    return moves.map((m) => ({ id: m.id, kind: m.kind, part_no: m.item.partNo, uom: m.item.uom, quantity: -n(m.quantity), amount: -n(m.value), moved_on: m.movedOn }));
  }

  // ── Headroom and the check at submit ─────────────────────────────────────

  // What a single expense (or one split part) would do to its budget line
  async headroom(q: { date?: string; contextType?: string; projectId?: number; productId?: number; departmentId?: number; buildOrderId?: number; categoryId?: number; amount?: number; excludeId?: number; gstClaimable?: boolean; netAmount?: number }) {
    const s = await this.getSettings();
    const date = q.date ? new Date(q.date) : today();
    const out = (state: string, extra: any = {}) => ({ state, message: null as string | null, ...extra });
    if (!q.categoryId) return out('NONE');
    const category = await this.prisma.category.findUnique({ where: { id: q.categoryId }, include: { categoryType: true } });
    if (!category?.categoryType) return out('NONE');
    const type = category.categoryType;
    const isStock = q.contextType === 'stock';
    if (isStock) q = { ...q, departmentId: await departmentNamed(this.prisma, STORE_DEPARTMENT) };
    const ct = (q.contextType || 'project') === 'product' ? 'PRODUCT' : q.contextType === 'overhead' || isStock ? 'DEPARTMENT' : 'PROJECT';
    const kind = KIND[ct];
    if (!isStock && type.appliesTo && !type.appliesTo.split(',').includes(kind)) {
      return out('NOT_ALLOWED', { message: `${[type.code, type.name].filter(Boolean).join(' ')} cannot be charged to ${ct === 'DEPARTMENT' ? 'overheads' : ct.toLowerCase() + 's'}. Choose another category or charge it elsewhere.` });
    }
    const fy = this.fyOf(date, s.fyStartMonth);
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy } });
    if (!plan || !CONTROLLING.includes(plan.status)) return out('NO_PLAN');
    const lines = await this.prisma.budgetLine.findMany({ where: { planId: plan.id, isActive: true }, include: { periods: true } });
    const part = {
      costObject: ct, projectId: ct === 'PROJECT' ? q.projectId ?? null : null, productId: ct === 'PRODUCT' ? q.productId ?? null : null,
      departmentId: ct === 'DEPARTMENT' ? q.departmentId ?? null : null, buildOrderId: q.buildOrderId ?? null, typeId: type.id, categoryId: category.id,
    };
    if (!this.objectIdOf(part)) return out('NONE');
    const line = this.matchLine(part, lines);
    const amount = Number(q.amount) || 0;
    if (!line) return out('NO_LINE', { message: 'There is no budget line for this. The expense can be submitted with a reason and Finance will review it.' });
    const lk = await this.lookups();
    const names = this.lineNames(line, lk);
    const parts = (await this.loadParts(fy, s, q.excludeId)).filter((p) => this.matchLine(p, [line])?.id === line.id);
    const upTo = date.getFullYear() * 12 + date.getMonth();
    let budget = 0; let used = 0;
    for (const p of line.periods) if (p.year * 12 + p.month - 1 <= upTo) budget += n(p.amount);
    for (const p of parts) if (p.year * 12 + p.month - 1 <= upTo) used += p.amount;
    const cost = s.netOfClaimableGst && q.gstClaimable && q.netAmount != null ? Number(q.netAmount) : amount;
    const left = r2(budget - used);
    const over = Math.max(0, r2(cost - left));
    const blocked = over > 0 && (line.strict || s.overBudgetMode === 'BLOCK');
    const state = over <= 0 ? 'OK' : blocked ? 'BLOCKED' : 'OVER';
    return out(state, {
      line_id: line.id, line_label: names.label, strict: line.strict, budget: r2(budget), used: r2(used), left, over_by: over,
      to_month: `${MON[date.getMonth()]} ${date.getFullYear()}`, needs_reason: state === 'OVER',
      message: state === 'OVER' ? `This expense takes the line ${inr(over)} over budget. Budget owner and Finance will see your reason.` : state === 'BLOCKED' ? `This line is strict: ${inr(over)} more than is left. Ask Finance for a transfer.` : null,
    });
  }

  // Run when an expense is submitted: blocks, or demands a reason, and records the line it was charged to
  async checkExpense(txn: any, reason?: string | null) {
    if (txn.type !== 'expense') return;
    const s = await this.getSettings();
    const full = await this.prisma.transaction.findUnique({
      where: { id: txn.id },
      include: { category: { include: { categoryType: true } }, splits: { include: { category: { include: { categoryType: true } } } } },
    });
    if (!full) return;
    if (!full.categoryId && !full.isSplit) throw new HttpException('Choose a category before submitting. Budgets are checked by category.', HttpStatus.BAD_REQUEST);
    const parts = this.partsOf(full, s);
    const typeOf = (p: Part) => (full.isSplit ? (full.splits as any[]).find((x) => x.categoryId === p.categoryId)?.category?.categoryType : (full as any).category?.categoryType);
    const d0 = new Date(full.dateRecorded);
    if (await this.prisma.periodLock.findUnique({ where: { year_month: { year: d0.getFullYear(), month: d0.getMonth() + 1 } } })) {
      throw new HttpException(`${MON[d0.getMonth()]} ${d0.getFullYear()} is closed. Ask Finance to reopen it, or date the expense in an open month.`, HttpStatus.BAD_REQUEST);
    }
    const fy = this.fyOf(new Date(full.dateRecorded), s.fyStartMonth);
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy } });
    const controlled = !!plan && CONTROLLING.includes(plan.status);
    const lines = controlled ? await this.prisma.budgetLine.findMany({ where: { planId: plan!.id, isActive: true }, include: { periods: true } }) : [];
    const existing = controlled ? (await this.loadParts(fy, s, full.id)) : [];
    const needReason: string[] = [];
    let firstLine: number | null = null;
    const used = new Map<number, number>();
    for (const p of parts) {
      const type = typeOf(p);
      const kind = KIND[p.costObject];
      // Every expense says where it is charged: that is how it finds its budget line and its costing
      if (!this.objectIdOf(p)) {
        throw new HttpException(`Choose the ${p.costObject === 'PRODUCT' ? 'product' : p.costObject === 'DEPARTMENT' ? 'department' : 'project'} this expense is charged to before submitting.`, HttpStatus.BAD_REQUEST);
      }
      if (full.contextType !== 'stock' && type?.appliesTo && !type.appliesTo.split(',').includes(kind)) {
        throw new HttpException(`${[type.code, type.name].filter(Boolean).join(' ')} cannot be charged to ${p.costObject === 'DEPARTMENT' ? 'overheads' : p.costObject.toLowerCase() + 's'}.`, HttpStatus.BAD_REQUEST);
      }
      if (!controlled) continue;
      const line = this.matchLine(p, lines);
      if (!line) { needReason.push('There is no budget line for this expense.'); continue; }
      firstLine ??= line.id;
      const upTo = p.year * 12 + p.month - 1;
      let budget = 0;
      for (const pr of line.periods) if (pr.year * 12 + pr.month - 1 <= upTo) budget += n(pr.amount);
      let spent = existing.filter((x) => this.matchLine(x, [line])?.id === line.id && x.year * 12 + x.month - 1 <= upTo).reduce((a, x) => a + x.amount, 0);
      spent += used.get(line.id) ?? 0;
      used.set(line.id, (used.get(line.id) ?? 0) + p.amount);
      const over = r2(spent + p.amount - budget);
      if (over > 0) {
        if (line.strict || s.overBudgetMode === 'BLOCK') {
          throw new HttpException(`This expense is ${inr(over)} more than is left on a ${line.strict ? 'strict ' : ''}budget line. Ask Finance for a transfer or revision.`, HttpStatus.BAD_REQUEST);
        }
        needReason.push(`This expense takes a budget line ${inr(over)} over budget.`);
      }
    }
    if (needReason.length && !(reason ?? full.overBudgetReason)?.trim()) {
      throw new HttpException(`${needReason[0]} Add a reason before submitting.`, HttpStatus.BAD_REQUEST);
    }
    await this.prisma.transaction.update({ where: { id: full.id }, data: { budgetLineId: firstLine, overBudgetReason: needReason.length ? (reason ?? full.overBudgetReason) : null } });
  }

  // Budget impact of the expenses in the approval queue
  async impactFor(ids: number[]) {
    if (!ids.length) return {};
    const s = await this.getSettings();
    const txns = await this.prisma.transaction.findMany({
      where: { id: { in: ids } },
      include: { category: { select: { typeId: true } }, splits: { include: { category: { select: { typeId: true } } } } },
    });
    const out: Record<number, any> = {};
    const fys = [...new Set(txns.map((t) => this.fyOf(new Date(t.dateRecorded), s.fyStartMonth)))];
    const plans = await this.prisma.budgetPlan.findMany({ where: { fy: { in: fys }, status: { in: CONTROLLING } }, include: { lines: { where: { isActive: true }, include: { periods: true } } } });
    const lk = await this.lookups();
    const partsByFy = new Map<number, Part[]>();
    for (const t of txns as any[]) {
      if (t.type !== 'expense') continue;
      const fy = this.fyOf(new Date(t.dateRecorded), s.fyStartMonth);
      const plan = plans.find((p) => p.fy === fy);
      if (!plan) { out[t.id] = { state: 'NO_PLAN' }; continue; }
      if (!partsByFy.has(fy)) partsByFy.set(fy, await this.loadParts(fy, s));
      const all = partsByFy.get(fy)!;
      const mine = this.partsOf(t, s);
      const lineHits = mine.map((p) => this.matchLine(p, plan.lines));
      if (lineHits.some((l) => !l)) { out[t.id] = { state: 'NO_LINE', reason: t.overBudgetReason }; continue; }
      const line = lineHits[0]!;
      const names = this.lineNames(line, lk);
      const upTo = new Date(t.dateRecorded).getFullYear() * 12 + new Date(t.dateRecorded).getMonth();
      let budget = 0;
      for (const p of line.periods) if (p.year * 12 + p.month - 1 <= upTo) budget += n(p.amount);
      const others = all.filter((x) => x.txnId !== t.id && this.matchLine(x, [line])?.id === line.id && x.year * 12 + x.month - 1 <= upTo).reduce((a, x) => a + x.amount, 0);
      const thisAmt = mine.filter((p) => this.matchLine(p, [line])?.id === line.id).reduce((a, p) => a + p.amount, 0);
      const after = others + thisAmt;
      const over = r2(after - budget);
      out[t.id] = {
        state: over > 0 ? 'OVER' : 'WITHIN', line_id: line.id, line_label: names.label, budget: r2(budget), before: r2(others), after: r2(after),
        before_pct: budget > 0 ? Math.round((others / budget) * 100) : 0, after_pct: budget > 0 ? Math.round((after / budget) * 100) : 0,
        over_by: Math.max(0, over), reason: t.overBudgetReason, to_month: `${MON[new Date(t.dateRecorded).getMonth()]} ${new Date(t.dateRecorded).getFullYear()}`,
      };
    }
    return out;
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  async listAlerts(opts: { status?: string; scope?: { ownerId?: number } } = {}) {
    await this.evaluateAlerts(false);
    const where: any = { status: opts.status === 'RESOLVED' ? 'RESOLVED' : opts.status === 'ALL' ? undefined : 'OPEN' };
    if (!where.status) delete where.status;
    const alerts = await this.prisma.budgetAlert.findMany({ where, orderBy: [{ status: 'asc' }, { openedAt: 'desc' }], take: 300 });
    const lineIds = [...new Set(alerts.map((a) => a.lineId).filter((x): x is number => x != null))];
    const lines = lineIds.length ? await this.prisma.budgetLine.findMany({ where: { id: { in: lineIds } } }) : [];
    const lk = await this.lookups();
    const rules = await this.prisma.budgetAlertRule.findMany();
    let rows = alerts.map((a) => {
      const line = lines.find((l) => l.id === a.lineId);
      const names = line ? this.lineNames(line, lk) : null;
      return {
        id: a.id, rule_code: a.ruleCode, rule_name: rules.find((r) => r.code === a.ruleCode)?.name ?? a.ruleCode, level: a.level, message: a.message,
        action: a.action, line_id: a.lineId, line_label: names?.label ?? null, strict: line?.strict ?? false, owner_id: a.ownerId ?? line?.ownerId ?? null,
        status: a.status, opened_at: a.openedAt, resolved_at: a.resolvedAt,
      };
    });
    if (opts.scope?.ownerId != null) rows = rows.filter((r) => r.owner_id === opts.scope!.ownerId);
    return rows;
  }

  async openAlertCount(scope: { ownerId?: number } = {}) {
    const rows = await this.prisma.budgetAlert.findMany({ where: { status: 'OPEN' }, select: { lineId: true, level: true, ownerId: true } });
    if (scope.ownerId == null) return { open: rows.length, critical: rows.filter((r) => r.level === 'CRITICAL').length };
    const lines = await this.prisma.budgetLine.findMany({ where: { ownerId: scope.ownerId }, select: { id: true } });
    const ids = new Set(lines.map((l) => l.id));
    const mine = rows.filter((r) => (r.lineId != null && ids.has(r.lineId)) || r.ownerId === scope.ownerId);
    return { open: mine.length, critical: mine.filter((r) => r.level === 'CRITICAL').length };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async hourly() { await this.evaluateAlerts(true).catch((e) => this.logger.error('alert evaluation failed', e)); }

  // Open, escalate or close one alert per rule and line
  async evaluateAlerts(force: boolean) {
    if (!force && Date.now() - this.lastEvaluated < 60_000) return;
    this.lastEvaluated = Date.now();
    const s = await this.getSettings();
    const rules = await this.prisma.budgetAlertRule.findMany();
    const rule = (code: string) => rules.find((r) => r.code === code);
    const wanted = new Map<string, { ruleCode: string; lineId: number | null; level: string; message: string; action: string; ownerId: number | null }>();
    const day = today();
    const fy = this.fyOf(day, s.fyStartMonth);
    const range = this.fyRange(fy, s.fyStartMonth);
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy } });
    const key = (code: string, lineId: number | null) => `${code}:${lineId ?? 0}`;

    if (rule('PLAN_READINESS')?.enabled) {
      if (day >= range.from && (!plan || !CONTROLLING.includes(plan.status))) {
        wanted.set(key('PLAN_READINESS', null), {
          ruleCode: 'PLAN_READINESS', lineId: null, level: 'WARNING', action: 'open_plan', ownerId: null,
          message: plan ? `${this.fyLabel(fy, s.fyStartMonth)} plan is ${plan.status.toLowerCase()} and the year has started` : `${this.fyLabel(fy, s.fyStartMonth)} has no budget plan and the year has started`,
        });
      }
    }

    if (plan && CONTROLLING.includes(plan.status)) {
      const lines = await this.prisma.budgetLine.findMany({ where: { planId: plan.id, isActive: true }, include: { periods: true } });
      const lk = await this.lookups();
      const parts = await this.loadParts(fy, s);
      const { usage, unmatched } = this.computeUsage(lines, parts);
      const th = this.thresholds(rules);
      const elapsedShare = Math.min(1, (day.getTime() - range.from.getTime()) / (range.to.getTime() - range.from.getTime()));
      for (const l of lines) {
        if (l.isContingency || l.costObject === 'RESERVE') continue;
        let budget = 0; let used = 0;
        for (const [, v] of usage.get(l.id)!) { budget += v.budget; used += v.actual + v.committed; }
        if (budget <= 0 && used <= 0) continue;
        const pct = budget > 0 ? (used / budget) * 100 : 999;
        const names = this.lineNames(l, lk);
        if (rule('UTILISATION')?.enabled && pct >= th.caution) {
          const level = pct >= 100 ? 'CRITICAL' : pct >= th.warning ? 'WARNING' : 'CAUTION';
          wanted.set(key('UTILISATION', l.id), {
            ruleCode: 'UTILISATION', lineId: l.id, level, ownerId: l.ownerId, action: pct >= 100 ? 'open_line' : 'view_expenses',
            message: pct >= 100 ? `${Math.round(pct)}% used${l.strict ? '; new entries are blocked' : ''} (${inr(used)} of ${inr(budget)})` : `${Math.round(pct)}% used (${inr(used)} of ${inr(budget)})`,
          });
        }
        const underAt = n(rule('UNDER_USE')?.threshold) || 50;
        if (rule('UNDER_USE')?.enabled && budget > 0 && pct < underAt && elapsedShare >= 0.75) {
          wanted.set(key('UNDER_USE', l.id), {
            ruleCode: 'UNDER_USE', lineId: l.id, level: 'INFO', ownerId: l.ownerId, action: 'open_line',
            message: `${Math.round(pct)}% used with ${Math.round(elapsedShare * 100)}% of the year gone`,
          });
        }
      }
      const loose = unmatched.filter((p) => !p.stock);
      if (rule('NO_LINE')?.enabled && loose.length) {
        const ids = new Set(loose.map((p) => p.txnId));
        wanted.set(key('NO_LINE', null), {
          ruleCode: 'NO_LINE', lineId: null, level: 'WARNING', ownerId: null, action: 'view_expenses',
          message: `${ids.size} expense${ids.size === 1 ? '' : 's'} (${inr(loose.reduce((a, p) => a + p.amount, 0))}) match no budget line`,
        });
      }
    }

    if (rule('REORDER')?.enabled) {
      const items = await this.prisma.item.findMany({ where: { supplyMode: 'STOCK', isActive: true, reorderLevel: { not: null } }, include: { stockBalance: true }, orderBy: { partNo: 'asc' } });
      const low = items.filter((i) => n(i.stockBalance?.quantity) <= n(i.reorderLevel));
      if (low.length) {
        wanted.set(key('REORDER', null), {
          ruleCode: 'REORDER', lineId: null, level: 'CAUTION', ownerId: null, action: 'open_stock',
          message: `${low.length} stock part${low.length === 1 ? ' is' : 's are'} at or below the reorder level: ${low.slice(0, 5).map((i) => i.partNo).join(', ')}${low.length > 5 ? '…' : ''}`,
        });
      }
    }

    if (rule('APPROVAL_WAIT')?.enabled) {
      const days = n(rule('APPROVAL_WAIT')?.threshold) || 5;
      const cutoff = addWorkingDays(day, -days);
      const waiting = await this.prisma.transaction.findMany({ where: { type: 'expense', status: { in: PENDING }, submittedAt: { lt: cutoff } }, select: { id: true, amount: true, totalAmount: true } });
      if (waiting.length) {
        wanted.set(key('APPROVAL_WAIT', null), {
          ruleCode: 'APPROVAL_WAIT', lineId: null, level: 'CAUTION', ownerId: null, action: 'open_approvals',
          message: `${waiting.length} submitted expense${waiting.length === 1 ? '' : 's'} (${inr(waiting.reduce((a, t) => a + n(t.totalAmount ?? t.amount), 0))}) waiting more than ${days} working days`,
        });
      }
    }

    const open = await this.prisma.budgetAlert.findMany({ where: { status: 'OPEN' } });
    for (const a of open) {
      const k = key(a.ruleCode, a.lineId);
      const w = wanted.get(k);
      if (!w) {
        await this.prisma.budgetAlert.update({ where: { id: a.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
        continue;
      }
      wanted.delete(k);
      if (a.message !== w.message || a.level !== w.level) {
        await this.prisma.budgetAlert.update({ where: { id: a.id }, data: { level: w.level, message: w.message, action: w.action, ownerId: w.ownerId } });
        if (LEVEL_RANK[w.level] > LEVEL_RANK[a.level]) await this.notifyAlert(w);
      }
    }
    for (const w of wanted.values()) {
      await this.prisma.budgetAlert.create({ data: w });
      await this.notifyAlert(w);
    }
  }

  private async notifyAlert(a: { ruleCode: string; level: string; message: string; ownerId: number | null; lineId: number | null }) {
    if (LEVEL_RANK[a.level] < LEVEL_RANK.WARNING) return;
    const ids = new Set<number>();
    if (a.ownerId) ids.add(a.ownerId);
    const finance = await this.prisma.user.findMany({ where: { userRoles: { some: { role: { name: { in: ['ADMIN', 'FINANCE'] } } } } } as any, select: { id: true } });
    finance.forEach((u) => ids.add(u.id));
    for (const id of ids) {
      await this.notifications.create(id, { type: 'BUDGET', title: `Budget ${a.level.toLowerCase()}`, message: a.message, entityType: 'budget_line', entityId: a.lineId ?? undefined }).catch(() => undefined);
    }
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  // Budget, actual and committed money month by month, with the running totals, for lines the caller may see
  async budgetByMonth(fy: number | undefined, scope: { ownerId?: number } = {}) {
    const s = await this.getSettings();
    const useFy = fy ?? this.fyOf(new Date(), s.fyStartMonth);
    const title = `Budget by Month ${this.fyLabel(useFy, s.fyStartMonth)}`;
    const columns = ['Month', 'Budget', 'Actual', 'Committed', 'Remaining', 'Cumulative Budget', 'Cumulative Used'];
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy: useFy } });
    if (!plan) return { title, columns, rows: [], totals: {} };
    const [lines, parts] = await Promise.all([
      this.prisma.budgetLine.findMany({ where: { planId: plan.id, isActive: true }, include: { periods: true } }),
      this.loadParts(useFy, s),
    ]);
    const { usage } = this.computeUsage(lines, parts);
    const counted = lines.filter((l) => !l.isContingency && l.costObject !== 'RESERVE' && (scope.ownerId == null || l.ownerId === scope.ownerId));
    let cumBudget = 0; let cumUsed = 0;
    const rows = this.fyMonths(useFy, s.fyStartMonth).map((m) => {
      let budget = 0; let actual = 0; let committed = 0;
      for (const l of counted) {
        const c = usage.get(l.id)?.get(`${m.year}-${m.month}`);
        if (c) { budget += c.budget; actual += c.actual - c.stock; committed += c.committed; }
      }
      cumBudget += budget; cumUsed += actual + committed;
      return { Month: `${MON[m.month - 1]} ${m.year}`, Budget: r2(budget), Actual: r2(actual), Committed: r2(committed), Remaining: r2(budget - actual - committed), 'Cumulative Budget': r2(cumBudget), 'Cumulative Used': r2(cumUsed) };
    });
    const sum = (k: 'Budget' | 'Actual' | 'Committed' | 'Remaining') => r2(rows.reduce((a, r) => a + r[k], 0));
    return { title, columns, rows, totals: { Budget: sum('Budget'), Actual: sum('Actual'), Committed: sum('Committed'), Remaining: sum('Remaining') } };
  }

  // Expenses that no budget line covers: nothing was planned for them, so they count against no budget
  async unbudgetedSpend(fy?: number) {
    const s = await this.getSettings();
    const useFy = fy ?? this.fyOf(new Date(), s.fyStartMonth);
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy: useFy } });
    const [lines, parts, lk] = await Promise.all([
      plan ? this.prisma.budgetLine.findMany({ where: { planId: plan.id, isActive: true }, include: { periods: true } }) : Promise.resolve([] as any[]),
      this.loadParts(useFy, s),
      this.lookups(),
    ]);
    const unmatched = this.computeUsage(lines, parts).unmatched.filter((p) => !p.stock);
    // An expense charged to an order is listed with the order's code
    const orderIds = [...new Set(unmatched.map((p) => p.buildOrderId).filter((x): x is number => x != null))];
    const orderCode = new Map((orderIds.length ? await this.prisma.buildOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, code: true } }) : []).map((o) => [o.id, o.code]));
    const kindName: Record<string, string> = { PROJECT: 'Project', PRODUCT: 'Product', DEPARTMENT: 'Overhead' };
    const words = (x: string) => x.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    const rows = unmatched.map((p) => {
      const obj = p.costObject === 'PROJECT' ? lk.projects.get(p.projectId as number)?.name : p.costObject === 'PRODUCT' ? lk.products.get(p.productId as number)?.name : lk.departments.get(p.departmentId as number)?.name;
      const t = p.typeId != null ? lk.types.get(p.typeId) : null;
      const c = p.categoryId != null ? lk.categories.get(p.categoryId) : null;
      return {
        Reference: p.ref || `#${p.txnId}`, Month: `${MON[p.month - 1]} ${p.year}`, 'Charged To': kindName[p.costObject] ?? p.costObject, 'Cost Object': obj ?? '', Order: p.buildOrderId != null ? orderCode.get(p.buildOrderId) ?? '' : '',
        Type: t ? [t.code, t.name].filter(Boolean).join(' ') : '', Category: c?.name ?? '', Status: words(p.status ?? ''), 'Submitted By': p.submitterName ?? '', Amount: r2(p.amount),
      };
    }).sort((a, b) => b.Amount - a.Amount);
    return {
      title: `Unbudgeted Spend ${this.fyLabel(useFy, s.fyStartMonth)}`,
      columns: ['Reference', 'Month', 'Charged To', 'Cost Object', 'Order', 'Type', 'Category', 'Status', 'Submitted By', 'Amount'],
      rows, totals: { Amount: r2(rows.reduce((a, r) => a + r.Amount, 0)) },
    };
  }

  async budgetVsActual(fy?: number, scope: { ownerId?: number } = {}) {
    const m = await this.monitor(fy, scope);
    const rows = (m.lines as any[]).filter((l) => !l.is_contingency && l.cost_object !== 'RESERVE').map((l) => ({
      'Cost Object': l.object_name, Type: l.category_label ? `${l.type_label} / ${l.category_label}` : l.type_label,
      Budget: l.total, Actual: l.actual, Committed: l.committed, Remaining: l.available, '% Used': l.pct,
    }));
    // The same material is on the Store line when bought and on a job line when used: the totals count it once
    const stockUsed = r2((m.lines as any[]).filter((l) => !l.is_contingency && l.cost_object !== 'RESERVE').reduce((a, l) => a + l.stock_used, 0));
    // The totals add up the rows shown. The plan's own approved total also holds the reserve and held contingency, which have no row here.
    const sum = (k: 'Budget' | 'Actual' | 'Committed' | 'Remaining') => r2(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0));
    const actualMoney = r2(sum('Actual') - stockUsed);
    const used = actualMoney + sum('Committed');
    return {
      title: `Budget vs Actual ${m.label}`, columns: ['Cost Object', 'Type', 'Budget', 'Actual', 'Committed', 'Remaining', '% Used'], rows,
      totals: { Budget: sum('Budget'), Actual: actualMoney, Committed: sum('Committed'), Remaining: r2(sum('Remaining') + stockUsed), '% Used': sum('Budget') > 0 ? r2((used / sum('Budget')) * 100) : null },
      note: `One row for each budget line. Reserve and held contingency are not listed, so the totals match Budget by Month rather than the plan total.${stockUsed ? ` Job rows include ${inr(stockUsed)} of stock used; the totals leave it out because its purchase is already counted.` : ''}`,
    };
  }

  // The month the financial year starts, for the date presets on every page; open to every signed-in user
  async fiscalYear() {
    const s = await this.getSettings();
    return { start_month: s.fyStartMonth, current_fy: this.fyOf(new Date(), s.fyStartMonth) };
  }

  // Top lines by utilisation for the dashboard card
  async dashboardLines(limit = 6, scope: { ownerId?: number } = {}) {
    const m = await this.monitor(undefined, scope);
    return (m.lines as any[])
      .filter((l) => !l.is_contingency && l.cost_object !== 'RESERVE' && l.total > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, limit)
      .map((l) => ({ id: l.id, label: l.label, budget: l.total, spent: l.used, remaining: l.available, pct: l.pct, status: l.status }));
  }
}
