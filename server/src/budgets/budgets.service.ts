import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TXN_STATUS } from '../common/constants/transaction-status';

const PENDING = [TXN_STATUS.PENDING_MANAGER, TXN_STATUS.PENDING_FINANCE] as string[];
const COUNTED = [TXN_STATUS.APPROVED, ...PENDING];
const CONTROLLING = ['APPROVED', 'ACTIVE'];
const KIND: Record<string, string> = { PROJECT: 'PROJECT', PRODUCT: 'PRODUCT', DEPARTMENT: 'OVERHEAD' };
const LEVEL_RANK: Record<string, number> = { INFO: 1, CAUTION: 2, WARNING: 3, CRITICAL: 4 };

type Settings = { fyStartMonth: number; overBudgetMode: string; controlLevel: string; netOfClaimableGst: boolean; approvalThreshold: number; contingencyPct: number };
type Part = {
  txnId: number; ref: string | null; status: string; year: number; month: number; amount: number;
  costObject: string; projectId: number | null; productId: number | null; departmentId: number | null;
  typeId: number | null; categoryId: number | null; submitterName?: string | null; submittedAt?: Date | null;
};

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
    await this.prisma.budgetSetting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
    if (Array.isArray(body.rules)) {
      for (const r of body.rules) {
        await this.prisma.budgetAlertRule.update({
          where: { code: String(r.code) },
          data: { enabled: !!r.enabled, threshold: r.threshold == null || r.threshold === '' ? null : Number(r.threshold) },
        });
      }
    }
    this.audit.log({ tableName: 'budget_settings', recordId: 1, action: 'UPDATE', changedBy: userId, newValues: body }).catch(() => undefined);
    return this.readSettings();
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
    return { from: new Date(first.year, first.month - 1, 1), to: new Date(last.year, last.month, 0, 23, 59, 59, 999) };
  }

  // ── Names for cost objects, types and owners ─────────────────────────────

  private async lookups() {
    const [projects, products, departments, types, categories, users] = await Promise.all([
      this.prisma.project.findMany({ select: { id: true, name: true, code: true } }),
      this.prisma.product.findMany({ select: { id: true, name: true, code: true } }),
      this.prisma.department.findMany({ select: { id: true, name: true, ownerId: true } }),
      this.prisma.categoryType.findMany({ select: { id: true, name: true, code: true, appliesTo: true } }),
      this.prisma.category.findMany({ select: { id: true, name: true, code: true, typeId: true } }),
      this.prisma.user.findMany({ select: { id: true, username: true } }),
    ]);
    return {
      projects: new Map(projects.map((p) => [p.id, p])),
      products: new Map(products.map((p) => [p.id, p])),
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
    return parts;
  }

  private partsOf(t: any, s: Settings): Part[] {
    const total = n(t.totalAmount ?? t.amount);
    const cost = s.netOfClaimableGst && t.isClaimable ? n(t.netAmount ?? t.amount) : total;
    const ratio = total > 0 ? cost / total : 1;
    const d = new Date(t.dateRecorded);
    const base = { txnId: t.id, ref: t.referenceId, status: t.status, year: d.getFullYear(), month: d.getMonth() + 1, submitterName: t.submittedByName, submittedAt: t.submittedAt };
    const kind = (t.contextType || 'project') === 'product' ? 'PRODUCT' : t.contextType === 'overhead' ? 'DEPARTMENT' : 'PROJECT';
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

  private objectIdOf(x: { costObject: string; projectId: number | null; productId: number | null; departmentId: number | null }) {
    return x.costObject === 'PROJECT' ? x.projectId : x.costObject === 'PRODUCT' ? x.productId : x.costObject === 'DEPARTMENT' ? x.departmentId : null;
  }

  // The line an expense part is charged to: a category-level line first, then the type-level line
  private matchLine(part: Pick<Part, 'costObject' | 'projectId' | 'productId' | 'departmentId' | 'typeId' | 'categoryId'>, lines: any[]) {
    const oid = this.objectIdOf(part);
    const cands = lines.filter((l) => l.isActive && !l.isContingency && l.costObject === part.costObject && this.objectIdOf(l) === oid && l.typeId === part.typeId);
    return cands.find((l) => l.controlLevel === 'CATEGORY' && l.categoryId === part.categoryId) ?? cands.find((l) => l.controlLevel === 'TYPE') ?? null;
  }

  private lineTotals(line: any) {
    const byMonth = new Map<string, { budget: number; actual: number; committed: number }>();
    for (const p of line.periods) byMonth.set(`${p.year}-${p.month}`, { budget: n(p.amount), actual: 0, committed: 0 });
    return byMonth;
  }

  private computeUsage(lines: any[], parts: Part[]) {
    const usage = new Map<number, Map<string, { budget: number; actual: number; committed: number }>>();
    for (const l of lines) usage.set(l.id, this.lineTotals(l));
    const unmatched: Part[] = [];
    for (const p of parts) {
      const line = this.matchLine(p, lines);
      if (!line) { unmatched.push(p); continue; }
      const m = usage.get(line.id)!;
      const key = `${p.year}-${p.month}`;
      const cell = m.get(key) ?? { budget: 0, actual: 0, committed: 0 };
      if (p.status === TXN_STATUS.APPROVED) cell.actual += p.amount; else cell.committed += p.amount;
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
          if (l.costObject === 'PROJECT' || l.costObject === 'PRODUCT') {
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
    let row;
    if (body.decision === 'approve') {
      const started = new Date() >= this.fyRange(fy, s.fyStartMonth).from;
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

  private mapLine(l: any, lk: Awaited<ReturnType<BudgetsService['lookups']>>, usage: Map<string, { budget: number; actual: number; committed: number }>, months: { year: number; month: number }[]) {
    const names = this.lineNames(l, lk);
    const periods = months.map((m) => n(l.periods.find((p: any) => p.year === m.year && p.month === m.month)?.amount));
    let actual = 0; let committed = 0;
    for (const v of usage.values()) { actual += v.actual; committed += v.committed; }
    return {
      id: l.id, plan_id: l.planId, cost_object: l.costObject, project_id: l.projectId, product_id: l.productId, department_id: l.departmentId,
      type_id: l.typeId, category_id: l.categoryId, control_level: l.controlLevel, strict: l.strict, is_contingency: l.isContingency,
      owner_id: l.ownerId, owner_name: names.ownerName, note: l.note,
      object_name: names.object, object_code: names.objectCode, type_label: names.typeLabel, category_label: names.catLabel, label: names.label,
      periods, total: r2(periods.reduce((a, b) => a + b, 0)), actual: r2(actual), committed: r2(committed),
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
    if (!['PROJECT', 'PRODUCT', 'DEPARTMENT', 'RESERVE'].includes(costObject)) throw new HttpException('Choose what the budget is for.', HttpStatus.BAD_REQUEST);
    const data: any = {
      costObject, projectId: null, productId: null, departmentId: null, typeId: null, categoryId: null,
      controlLevel: body.control_level === 'CATEGORY' ? 'CATEGORY' : 'TYPE', strict: !!body.strict, isContingency: !!body.is_contingency,
      ownerId: body.owner_id ? Number(body.owner_id) : null, note: body.note?.trim() || null,
    };
    if (costObject === 'PROJECT') data.projectId = Number(body.project_id) || null;
    if (costObject === 'PRODUCT') data.productId = Number(body.product_id) || null;
    if (costObject === 'DEPARTMENT') data.departmentId = Number(body.department_id) || null;
    if (costObject !== 'RESERVE' && !this.objectIdOf(data)) throw new HttpException('Choose the project, product or department.', HttpStatus.BAD_REQUEST);
    if (costObject === 'RESERVE') { data.isContingency = false; data.strict = false; }
    const needsType = costObject !== 'RESERVE' && !data.isContingency;
    if (needsType) {
      data.typeId = Number(body.type_id) || null;
      if (!data.typeId) throw new HttpException('Choose an expense type.', HttpStatus.BAD_REQUEST);
      const type = await this.prisma.categoryType.findUnique({ where: { id: data.typeId } });
      if (!type) throw new HttpException('Expense type not found.', HttpStatus.NOT_FOUND);
      if (type.appliesTo && !type.appliesTo.split(',').includes(KIND[costObject])) {
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
        planId, isActive: true, costObject, projectId: data.projectId, productId: data.productId, departmentId: data.departmentId,
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

  async createLine(body: any, user: { id: number }, isFinance: boolean) {
    const s = await this.getSettings();
    const plan = await this.editablePlan(Number(body.plan_id), body.reason, user.id, isFinance);
    const data = await this.validateLine(body, plan.id);
    const periods = this.buildPeriods(plan.fy, s, body);
    const line = await this.prisma.budgetLine.create({ data: { planId: plan.id, ...data, periods: { create: periods } }, include: { periods: true } });
    this.audit.log({ tableName: 'budget_lines', recordId: line.id, action: 'INSERT', changedBy: user.id, newValues: { ...line, reason: body.reason ?? null } }).catch(() => undefined);
    this.lastEvaluated = 0;
    return { id: line.id };
  }

  async updateLine(id: number, body: any, user: { id: number }, isFinance: boolean) {
    const s = await this.getSettings();
    const line = await this.prisma.budgetLine.findUnique({ where: { id }, include: { periods: true } });
    if (!line || !line.isActive) throw new HttpException('Budget line not found.', HttpStatus.NOT_FOUND);
    const plan = await this.editablePlan(line.planId, body.reason, user.id, isFinance);
    const data = await this.validateLine(body, plan.id, id);
    const hasAmounts = Array.isArray(body.periods) || body.total != null;
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
  async setPeriod(id: number, body: { year: number; month: number; amount: number; reason?: string }, user: { id: number }, isFinance: boolean) {
    const line = await this.prisma.budgetLine.findUnique({ where: { id } });
    if (!line || !line.isActive) throw new HttpException('Budget line not found.', HttpStatus.NOT_FOUND);
    await this.editablePlan(line.planId, body.reason, user.id, isFinance);
    const amount = r2(Math.max(0, Number(body.amount) || 0));
    await this.prisma.budgetLinePeriod.upsert({
      where: { lineId_year_month: { lineId: id, year: Number(body.year), month: Number(body.month) } },
      update: { amount }, create: { lineId: id, year: Number(body.year), month: Number(body.month), amount },
    });
    this.audit.log({ tableName: 'budget_line_periods', recordId: id, action: 'UPDATE', changedBy: user.id, newValues: { ...body, amount } }).catch(() => undefined);
    this.lastEvaluated = 0;
    return { id };
  }

  async deleteLine(id: number, reason: string | undefined, user: { id: number }, isFinance: boolean) {
    const line = await this.prisma.budgetLine.findUnique({ where: { id } });
    if (!line || !line.isActive) throw new HttpException('Budget line not found.', HttpStatus.NOT_FOUND);
    await this.editablePlan(line.planId, reason, user.id, isFinance);
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
        approved: sum((r) => r.total), actual: sum((r) => r.actual), committed: sum((r) => r.committed),
        forecast: sum((r) => r.forecast ?? r.total), open_alerts: alerts.length,
        unbudgeted: r2(unmatched.reduce((a, p) => a + p.amount, 0)), unbudgeted_count: new Set(unmatched.map((p) => p.txnId)).size,
      },
      lines: rows,
    };
  }

  // Month-by-month budget, actual and committed for one line (monitor detail panel)
  async lineDetail(id: number) {
    const s = await this.getSettings();
    const line = await this.prisma.budgetLine.findUnique({ where: { id }, include: { periods: true, plan: true } });
    if (!line) throw new HttpException('Budget line not found.', HttpStatus.NOT_FOUND);
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
    };
  }

  // ── Headroom and the check at submit ─────────────────────────────────────

  // What a single expense (or one split part) would do to its budget line
  async headroom(q: { date?: string; contextType?: string; projectId?: number; productId?: number; departmentId?: number; categoryId?: number; amount?: number; excludeId?: number; gstClaimable?: boolean; netAmount?: number }) {
    const s = await this.getSettings();
    const date = q.date ? new Date(q.date) : new Date();
    const out = (state: string, extra: any = {}) => ({ state, message: null as string | null, ...extra });
    if (!q.categoryId) return out('NONE');
    const category = await this.prisma.category.findUnique({ where: { id: q.categoryId }, include: { categoryType: true } });
    if (!category?.categoryType) return out('NONE');
    const type = category.categoryType;
    const ct = (q.contextType || 'project') === 'product' ? 'PRODUCT' : q.contextType === 'overhead' ? 'DEPARTMENT' : 'PROJECT';
    const kind = KIND[ct];
    if (type.appliesTo && !type.appliesTo.split(',').includes(kind)) {
      return out('NOT_ALLOWED', { message: `${[type.code, type.name].filter(Boolean).join(' ')} cannot be charged to ${ct === 'DEPARTMENT' ? 'overheads' : ct.toLowerCase() + 's'}. Choose another category or charge it elsewhere.` });
    }
    const fy = this.fyOf(date, s.fyStartMonth);
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy } });
    if (!plan || !CONTROLLING.includes(plan.status)) return out('NO_PLAN');
    const lines = await this.prisma.budgetLine.findMany({ where: { planId: plan.id, isActive: true }, include: { periods: true } });
    const part = {
      costObject: ct, projectId: ct === 'PROJECT' ? q.projectId ?? null : null, productId: ct === 'PRODUCT' ? q.productId ?? null : null,
      departmentId: ct === 'DEPARTMENT' ? q.departmentId ?? null : null, typeId: type.id, categoryId: category.id,
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
    if (txn.type !== 'expense' || !txn.categoryId) return;
    const s = await this.getSettings();
    const full = await this.prisma.transaction.findUnique({
      where: { id: txn.id },
      include: { category: { include: { categoryType: true } }, splits: { include: { category: { include: { categoryType: true } } } } },
    });
    if (!full) return;
    const parts = this.partsOf(full, s);
    const typeOf = (p: Part) => (full.isSplit ? (full.splits as any[]).find((x) => x.categoryId === p.categoryId)?.category?.categoryType : (full as any).category?.categoryType);
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
      if (type?.appliesTo && !type.appliesTo.split(',').includes(kind)) {
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
    const today = new Date();
    const fy = this.fyOf(today, s.fyStartMonth);
    const range = this.fyRange(fy, s.fyStartMonth);
    const plan = await this.prisma.budgetPlan.findUnique({ where: { fy } });
    const key = (code: string, lineId: number | null) => `${code}:${lineId ?? 0}`;

    if (rule('PLAN_READINESS')?.enabled) {
      if (today >= range.from && (!plan || !CONTROLLING.includes(plan.status))) {
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
      const elapsedShare = Math.min(1, (today.getTime() - range.from.getTime()) / (range.to.getTime() - range.from.getTime()));
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
      if (rule('NO_LINE')?.enabled && unmatched.length) {
        const ids = new Set(unmatched.map((p) => p.txnId));
        wanted.set(key('NO_LINE', null), {
          ruleCode: 'NO_LINE', lineId: null, level: 'WARNING', ownerId: null, action: 'view_expenses',
          message: `${ids.size} expense${ids.size === 1 ? '' : 's'} (${inr(unmatched.reduce((a, p) => a + p.amount, 0))}) match no budget line`,
        });
      }
    }

    if (rule('APPROVAL_WAIT')?.enabled) {
      const days = n(rule('APPROVAL_WAIT')?.threshold) || 5;
      const cutoff = new Date(today.getTime() - days * 1.4 * 86400000);
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

  async budgetVsActual(fy?: number) {
    const m = await this.monitor(fy);
    const rows = (m.lines as any[]).filter((l) => !l.is_contingency && l.cost_object !== 'RESERVE').map((l) => ({
      'Cost object': l.object_name, Type: l.category_label ? `${l.type_label} / ${l.category_label}` : l.type_label,
      Budget: l.total, Actual: l.actual, Committed: l.committed, Remaining: l.available, '% Used': l.pct,
    }));
    return { title: `Budget vs Actual ${m.label}`, columns: ['Cost object', 'Type', 'Budget', 'Actual', 'Committed', 'Remaining', '% Used'], rows, totals: m.kpis ? { Budget: m.kpis.approved, Actual: m.kpis.actual, Committed: m.kpis.committed } : {} };
  }

  // Top lines by utilisation for the dashboard card
  async dashboardLines(limit = 6) {
    const m = await this.monitor(undefined);
    return (m.lines as any[])
      .filter((l) => !l.is_contingency && l.cost_object !== 'RESERVE' && l.total > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, limit)
      .map((l) => ({ id: l.id, label: l.label, budget: l.total, spent: l.used, remaining: l.available, pct: l.pct, status: l.status }));
  }
}
