import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type Kind = 'expense' | 'income';

// Expense and income categories, grouped under types (Type > Category). Transactions, budgets and
// recurring schedules point at the category by id, so renaming is safe; one that is in use is archived, not deleted.
@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private mapCategory(row: any) {
    return ({
      id: row.id, name: row.name, code: row.code ?? null, type: row.type, type_id: row.typeId ?? null, icon: row.icon,
      is_custom: row.isCustom ? 1 : 0, created_by: row.createdBy, is_active: row.isActive ? 1 : 0,
    });
  }

  private mapType(row: any) {
    return { id: row.id, name: row.name, code: row.code ?? null, kind: row.kind, applies_to: row.appliesTo ? String(row.appliesTo).split(',') : null, is_active: row.isActive ? 1 : 0 };
  }

  // Codes such as E200 or E201: short, no spaces, unique among the same kind
  private cleanCode(raw: any): string | null {
    const code = String(raw ?? '').trim().toUpperCase();
    if (!code) return null;
    if (!/^[A-Z0-9.-]{1,10}$/.test(code)) throw new HttpException('A code is up to 10 letters or digits, for example E200.', HttpStatus.BAD_REQUEST);
    return code;
  }

  private cleanAppliesTo(raw: any): string | null {
    if (raw == null) return null;
    const list = (Array.isArray(raw) ? raw : String(raw).split(',')).map((x) => String(x).trim().toUpperCase()).filter(Boolean);
    const ok = ['PROJECT', 'PRODUCT', 'OVERHEAD'];
    if (list.some((x) => !ok.includes(x))) throw new HttpException('Applies to must be project, product or overhead.', HttpStatus.BAD_REQUEST);
    return list.length && list.length < ok.length ? [...new Set(list)].join(',') : null;
  }

  private cleanKind(kind: any): Kind {
    const k = String(kind ?? '').toLowerCase();
    if (k !== 'expense' && k !== 'income') throw new HttpException('Kind must be expense or income.', HttpStatus.BAD_REQUEST);
    return k;
  }

  private dedupe(rows: any[]) {
    // The same name under different types is allowed; only true repeats within a type are hidden
    const unique: any[] = []; const seen = new Set();
    for (const row of rows) {
      const key = (row.name || '').toLowerCase() + '|' + row.type + '|' + (row.typeId ?? '');
      if (!seen.has(key)) { seen.add(key); unique.push(this.mapCategory(row)); }
    }
    return unique;
  }

  async findAll(includeInactive = false) {
    const categories = await this.prisma.category.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ type: 'asc' }, { isCustom: 'asc' }, { name: 'asc' }],
      take: 1000,
    });
    return this.dedupe(categories);
  }

  async findByType(type: string, includeInactive = false) {
    const categories = await this.prisma.category.findMany({
      where: { type, isActive: includeInactive ? undefined : true },
      orderBy: [{ isCustom: 'asc' }, { name: 'asc' }],
      take: 1000,
    });
    return this.dedupe(categories);
  }

  async findById(id: number) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new HttpException('Category not found.', HttpStatus.NOT_FOUND);
    return this.mapCategory(row);
  }

  async create(data: { name: string; type: string; type_id?: number; typeId?: number; icon?: string; createdBy?: number; code?: string }) {
    const kind = this.cleanKind(data.type);
    const code = this.cleanCode(data.code);
    const name = String(data.name ?? '').trim();
    const typeId = Number(data.type_id ?? data.typeId) || null;
    if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
    if (typeId) {
      const t = await this.prisma.categoryType.findUnique({ where: { id: typeId } });
      if (!t || t.kind !== kind) throw new HttpException('Type not found.', HttpStatus.BAD_REQUEST);
    }
    // One name per type, ignoring case; the same name under another type is fine. An archived one comes back.
    const clash = await this.prisma.category.findFirst({ where: { type: kind, typeId, name: { equals: name, mode: 'insensitive' } } });
    if (clash?.isActive) throw new HttpException('This type already has a category with that name.', HttpStatus.CONFLICT);
    if (code && (await this.prisma.category.findFirst({ where: { type: kind, code, NOT: clash ? { id: clash.id } : undefined } }))) throw new HttpException('Another category already uses that code.', HttpStatus.CONFLICT);
    if (clash) {
      await this.prisma.category.update({ where: { id: clash.id }, data: { isActive: true, ...(code ? { code } : {}) } });
      return this.findById(clash.id);
    }
    const cat = await this.prisma.category.create({
      data: { name, code, type: kind, typeId, icon: data.icon || 'tag', isCustom: true, createdBy: data.createdBy || null, isActive: true },
    });
    return this.findById(cat.id);
  }

  async update(id: number, data: { name: string; code?: string | null }) {
    const name = String(data.name ?? '').trim();
    const code = data.code === undefined ? undefined : this.cleanCode(data.code);
    if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
    const current = await this.prisma.category.findUnique({ where: { id } });
    if (!current) throw new HttpException('Category not found.', HttpStatus.NOT_FOUND);
    const clash = await this.prisma.category.findFirst({
      where: { type: current.type, typeId: current.typeId, name: { equals: name, mode: 'insensitive' }, NOT: { id } },
    });
    if (clash) throw new HttpException('This type already has a category with that name.', HttpStatus.CONFLICT);
    if (code && (await this.prisma.category.findFirst({ where: { type: current.type, code, NOT: { id } } }))) throw new HttpException('Another category already uses that code.', HttpStatus.CONFLICT);
    await this.prisma.category.update({ where: { id }, data: { name, ...(code !== undefined ? { code } : {}) } });
    return this.findById(id);
  }

  private async usageByCategory(): Promise<Map<number, number>> {
    const sources = await Promise.all([
      this.prisma.transaction.groupBy({ by: ['categoryId'], _count: { _all: true } }),
      this.prisma.recurringTransaction.groupBy({ by: ['categoryId'], _count: { _all: true } }),
      this.prisma.budgetLine.groupBy({ by: ['categoryId'], _count: { _all: true } }),
      this.prisma.transactionSplit.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    ]);
    const counts = new Map<number, number>();
    for (const rows of sources) for (const r of rows as any[]) if (r.categoryId != null) counts.set(r.categoryId, (counts.get(r.categoryId) ?? 0) + r._count._all);
    return counts;
  }

  // How much each type and category is used: { types: { [typeId]: n }, categories: { [categoryId]: n } }
  async usage(kind: string) {
    const k = this.cleanKind(kind);
    const [counts, cats] = await Promise.all([
      this.usageByCategory(),
      this.prisma.category.findMany({ where: { type: k, isActive: true } }),
    ]);
    const categories: Record<number, number> = {}; const types: Record<number, number> = {};
    for (const c of cats) {
      const n = counts.get(c.id) ?? 0;
      categories[c.id] = n;
      if (c.typeId != null) types[c.typeId] = (types[c.typeId] ?? 0) + n;
    }
    return { types, categories };
  }

  // Unused: deleted. In use: archived, so the records keep it but it leaves the pickers.
  async delete(id: number) {
    const used = (await this.usageByCategory()).get(id) ?? 0;
    if (used === 0) {
      await this.prisma.category.delete({ where: { id } }).catch(() => undefined);
      return { archived: false };
    }
    await this.prisma.category.update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }

  // --- Types ---
  async findTypes(kind?: string) {
    const rows = await this.prisma.categoryType.findMany({
      where: { isActive: true, ...(kind ? { kind: this.cleanKind(kind) } : {}) },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      take: 500,
    });
    return rows.map((t) => this.mapType(t));
  }

  async createType(data: { name: string; kind: string; createdBy?: number; code?: string; applies_to?: any }) {
    const kind = this.cleanKind(data.kind);
    const code = this.cleanCode(data.code);
    const appliesTo = this.cleanAppliesTo(data.applies_to);
    const name = String(data.name ?? '').trim();
    if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
    const clash = await this.prisma.categoryType.findFirst({ where: { kind, name: { equals: name, mode: 'insensitive' } } });
    if (clash?.isActive) throw new HttpException('A type with this name already exists.', HttpStatus.CONFLICT);
    if (code && (await this.prisma.categoryType.findFirst({ where: { kind, code, NOT: clash ? { id: clash.id } : undefined } }))) throw new HttpException('Another type already uses that code.', HttpStatus.CONFLICT);
    if (clash) return this.mapType(await this.prisma.categoryType.update({ where: { id: clash.id }, data: { isActive: true, ...(code ? { code } : {}), appliesTo } }));
    return this.mapType(await this.prisma.categoryType.create({ data: { name, code, appliesTo, kind, createdBy: data.createdBy ?? null } }));
  }

  async renameType(id: number, rawName: string, extra: { code?: string | null; applies_to?: any } = {}) {
    const name = String(rawName ?? '').trim();
    const code = extra.code === undefined ? undefined : this.cleanCode(extra.code);
    const appliesTo = extra.applies_to === undefined ? undefined : this.cleanAppliesTo(extra.applies_to);
    if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
    const current = await this.prisma.categoryType.findUnique({ where: { id } });
    if (!current) throw new HttpException('Type not found.', HttpStatus.NOT_FOUND);
    const clash = await this.prisma.categoryType.findFirst({ where: { kind: current.kind, name: { equals: name, mode: 'insensitive' }, NOT: { id } } });
    if (clash) throw new HttpException('A type with this name already exists.', HttpStatus.CONFLICT);
    if (code && (await this.prisma.categoryType.findFirst({ where: { kind: current.kind, code, NOT: { id } } }))) throw new HttpException('Another type already uses that code.', HttpStatus.CONFLICT);
    return this.mapType(await this.prisma.categoryType.update({ where: { id }, data: { name, ...(code !== undefined ? { code } : {}), ...(appliesTo !== undefined ? { appliesTo } : {}) } }));
  }

  // Unused (none of its categories is): deleted with its categories. Otherwise archived.
  async deleteType(id: number) {
    const [counts, cats] = await Promise.all([this.usageByCategory(), this.prisma.category.findMany({ where: { typeId: id } })]);
    const lineUse = await this.prisma.budgetLine.count({ where: { typeId: id } });
    if (lineUse === 0 && cats.every((c) => (counts.get(c.id) ?? 0) === 0)) {
      await this.prisma.$transaction([
        this.prisma.category.deleteMany({ where: { typeId: id } }),
        this.prisma.categoryType.delete({ where: { id } }),
      ]);
      return { archived: false };
    }
    await this.prisma.categoryType.update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }
}
