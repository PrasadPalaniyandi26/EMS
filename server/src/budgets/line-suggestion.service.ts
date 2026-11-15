import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from './budgets.service';
import { BuildOrdersService } from './build-orders.service';

const n = (v: unknown) => (v == null ? 0 : Number(v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const bad = (message: string) => new HttpException(message, HttpStatus.BAD_REQUEST);

export interface LineSuggestion {
  // even: one total over the months from..to. month: an amount for each of the plan's twelve months.
  shape: 'even' | 'month';
  amount: number | null; from: number; to: number; months: number[] | null;
  // The expense type the amount belongs to, when it is certain (materials and production for orders and products)
  type_id: number | null;
  // Where the number comes from, to keep with the line, and why there is none when there is none
  note: string | null; reason: string | null;
}

// A starting number for a new budget line, worked out from what the system already knows: the order's expected cost, the product's build plan and
// standard cost, the project's estimate, or last year's spend for an overhead. It is only a starting point; the person planning decides the amount.
@Injectable()
export class LineSuggestionService {
  constructor(private prisma: PrismaService, private budgets: BudgetsService, private orders: BuildOrdersService) {}

  private none(reason: string, type_id: number | null = null): LineSuggestion {
    return { shape: 'even', amount: null, from: 0, to: 0, months: null, type_id, note: null, reason };
  }

  private async materialsType() {
    return (await this.prisma.categoryType.findFirst({ where: { code: 'E200' }, select: { id: true } }))?.id ?? null;
  }

  async suggest(q: { cost_object?: string; object_id?: string; type_id?: string; fy?: string }): Promise<LineSuggestion> {
    const s = await this.budgets.getSettings();
    const fy = q.fy ? Number(q.fy) : this.budgets.fyOf(new Date(), s.fyStartMonth);
    if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) throw bad('Choose a valid financial year.');
    const months = this.budgets.fyMonths(fy, s.fyStartMonth);
    const id = q.object_id ? Number(q.object_id) : 0;
    const typeId = q.type_id ? Number(q.type_id) : null;
    if (!id || !Number.isInteger(id)) throw bad('Choose what the budget is for.');
    switch (q.cost_object) {
      case 'ORDER': return this.forOrder(id, months);
      case 'PRODUCT': return this.forProduct(id, months);
      case 'PROJECT': return this.forProject(id, typeId, months);
      case 'DEPARTMENT': return this.forDepartment(id, typeId, months);
      default: throw bad('A starting amount is worked out for an order, product, project or overhead.');
    }
  }

  // The index of a date's month within the plan year, kept inside the year
  private indexIn(months: { year: number; month: number }[], d: Date) {
    const key = (y: number, m: number) => y * 12 + m;
    const i = key(d.getUTCFullYear(), d.getUTCMonth() + 1) - key(months[0].year, months[0].month);
    return Math.min(months.length - 1, Math.max(0, i));
  }

  // What the order is expected to cost to buy: parts, scrap, freight and outsourced work for its quantity, from its start to its delivery
  private async forOrder(id: number, months: { year: number; month: number }[]): Promise<LineSuggestion> {
    const type = await this.materialsType();
    const o: any = await this.orders.get(id);
    const amount = o.actuals?.expected_bought;
    if (amount == null || amount <= 0) return this.none(`${o.code} has no BOM yet, so there is no starting amount. Import its BOM on the order first.`, type);
    const from = this.indexIn(months, new Date(o.start_date)); const to = Math.max(from, this.indexIn(months, new Date(o.delivery_date)));
    return {
      shape: 'even', amount: r2(amount), from, to, months: null, type_id: type, reason: null,
      note: `Expected material cost of ${o.code}: ${o.quantity} unit${o.quantity === 1 ? '' : 's'}, parts, scrap, freight and outsourced work`,
    };
  }

  // The product's planned units for each month, at the approved standard cost of what is bought for one unit
  private async forProduct(id: number, months: { year: number; month: number }[]): Promise<LineSuggestion> {
    const type = await this.materialsType();
    const product = await this.prisma.product.findUnique({ where: { id }, select: { name: true, code: true } });
    if (!product) throw new HttpException('Product not found.', HttpStatus.NOT_FOUND);
    const std = await this.prisma.standardCost.findFirst({ where: { productId: id, status: 'APPROVED' }, orderBy: { id: 'desc' } });
    if (!std) return this.none(`${product.code ?? product.name} has no approved standard cost, so there is no starting amount.`, type);
    const perUnit = n(std.material) + n(std.scrap) + n(std.freight) + n(std.outsourced);
    const plan = await this.prisma.productionPlan.findMany({ where: { productId: id, OR: months.map((m) => ({ year: m.year, month: m.month })) } });
    const units = months.map((m) => n(plan.find((p) => p.year === m.year && p.month === m.month)?.plannedUnits));
    const total = units.reduce((a, u) => a + u, 0);
    if (perUnit <= 0 || total <= 0) return this.none(`${product.code ?? product.name} has no planned units in this year. Set its build plan first.`, type);
    return {
      shape: 'month', amount: r2(units.reduce((a, u) => a + u * perUnit, 0)), from: 0, to: months.length - 1, months: units.map((u) => r2(u * perUnit)), type_id: type, reason: null,
      note: `Planned units (${total}) at the approved standard cost of what is bought, ${r2(perUnit)} per unit`,
    };
  }

  // The part of the project's estimate that is for this expense type, spread over the months the project runs in this year
  private async forProject(id: number, typeId: number | null, months: { year: number; month: number }[]): Promise<LineSuggestion> {
    const project = await this.prisma.project.findUnique({ where: { id }, select: { name: true, code: true, start_date: true, end_date: true } });
    if (!project) throw new HttpException('Project not found.', HttpStatus.NOT_FOUND);
    if (typeId == null) return this.none('Choose the expense type to get a starting amount from the estimate.');
    const baseline = await this.prisma.estimateBaseline.findFirst({ where: { projectId: id, status: 'APPROVED' }, orderBy: { id: 'desc' } });
    let lines: { typeId: number | null; amount: number }[] = [];
    let source = '';
    if (baseline && Array.isArray(baseline.lines)) {
      lines = (baseline.lines as any[]).map((l) => ({ typeId: l.type_id ?? null, amount: n(l.quantity) * n(l.rate) }));
      source = 'the approved baseline';
    } else {
      const est = await this.prisma.costEstimate.findFirst({ where: { projectId: id }, orderBy: { version: 'desc' }, include: { lines: true } });
      lines = (est?.lines ?? []).map((l) => ({ typeId: l.typeId, amount: n(l.quantity) * n(l.rate) }));
      source = 'the estimate (no baseline is approved yet)';
    }
    if (!lines.length) return this.none(`${project.code ?? project.name} has no estimate yet, so there is no starting amount.`);
    const total = r2(lines.filter((l) => l.typeId === typeId).reduce((a, l) => a + l.amount, 0));
    if (total <= 0) return this.none('The project estimate has no lines for this expense type.');
    // The months the project runs, and how many of them fall in this plan year
    const key = (y: number, m: number) => y * 12 + m;
    const planFirst = key(months[0].year, months[0].month); const planLast = planFirst + months.length - 1;
    const startKey = project.start_date ? key(project.start_date.getUTCFullYear(), project.start_date.getUTCMonth() + 1) : planFirst;
    const endKey = project.end_date ? key(project.end_date.getUTCFullYear(), project.end_date.getUTCMonth() + 1) : planLast;
    const runs = Math.max(1, endKey - startKey + 1);
    const inYear = Math.max(0, Math.min(endKey, planLast) - Math.max(startKey, planFirst) + 1);
    if (inYear === 0) return this.none('The project does not run in this plan year, so there is no starting amount.');
    const from = Math.max(startKey, planFirst) - planFirst; const to = Math.min(endKey, planLast) - planFirst;
    return {
      shape: 'even', amount: r2(total * (inYear / runs)), from, to, months: null, type_id: typeId, reason: null,
      note: `From ${source}: ${total} for this expense type${runs > inYear ? `, ${inYear} of the project's ${runs} months fall in this year` : ''}`,
    };
  }

  // What the department spent in the same months last year, for the same expense type when one is chosen
  private async forDepartment(id: number, typeId: number | null, months: { year: number; month: number }[]): Promise<LineSuggestion> {
    const dept = await this.prisma.department.findUnique({ where: { id }, select: { name: true } });
    if (!dept) throw new HttpException('Department not found.', HttpStatus.NOT_FOUND);
    const prevFirst = new Date(Date.UTC(months[0].year - 1, months[0].month - 1, 1));
    const prevLast = new Date(Date.UTC(months[11].year - 1, months[11].month, 0, 23, 59, 59));
    const parts = await this.budgets.partsWhere({ status: 'APPROVED', contextType: 'overhead', departmentId: id, dateRecorded: { gte: prevFirst, lte: prevLast } });
    const used = parts.filter((p) => typeId == null || p.typeId === typeId);
    const byMonth = months.map((m) => r2(used.filter((p) => p.year === m.year - 1 && p.month === m.month).reduce((a, p) => a + p.amount, 0)));
    const total = r2(byMonth.reduce((a, v) => a + v, 0));
    if (total <= 0) return this.none(`${dept.name} has no approved spend ${typeId == null ? '' : 'for this expense type '}in the same months last year, so there is no starting amount.`);
    return {
      shape: 'month', amount: total, from: 0, to: months.length - 1, months: byMonth, type_id: null, reason: null,
      note: `Last year's approved spend for ${dept.name}${typeId == null ? '' : ' for this expense type'}, month by month`,
    };
  }
}
