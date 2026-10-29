import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CategoryKind = 'project' | 'product';

// Categories belong to a project type or a product type; the dialogs list the ones of the chosen type.
// A record stores its category by name, so renaming a category also renames it on the records that use it.
@Injectable()
export class TypeCategoriesService {
  constructor(private prisma: PrismaService) {}

  private model(kind: CategoryKind): any {
    return kind === 'project' ? this.prisma.projectCategory : this.prisma.productCategory;
  }

  private records(kind: CategoryKind): any {
    return kind === 'project' ? this.prisma.project : this.prisma.product;
  }

  private map(c: any) {
    return { id: c.id, type_id: c.typeId, name: c.name, is_active: c.isActive };
  }

  async findAll(kind: CategoryKind, typeId?: number) {
    const rows = await this.model(kind).findMany({
      where: { isActive: true, ...(typeId && { typeId: Number(typeId) }) },
      orderBy: [{ typeId: 'asc' }, { name: 'asc' }],
      take: 2000,
    });
    return rows.map((c: any) => this.map(c));
  }

  // How many records use each type and each category: { types: { [typeId]: n }, categories: { [categoryId]: n } }
  async usage(kind: CategoryKind) {
    const grouped: { typeId: number | null; category: string | null; _count: { _all: number } }[] =
      await this.records(kind).groupBy({ by: ['typeId', 'category'], _count: { _all: true } });
    const types: Record<number, number> = {};
    const byTypeAndName = new Map<string, number>();
    for (const g of grouped) {
      if (g.typeId == null) continue;
      types[g.typeId] = (types[g.typeId] ?? 0) + g._count._all;
      if (g.category) byTypeAndName.set(`${g.typeId}|${g.category}`, g._count._all);
    }
    const cats = await this.model(kind).findMany({ where: { isActive: true } });
    const categories: Record<number, number> = {};
    for (const c of cats) categories[c.id] = byTypeAndName.get(`${c.typeId}|${c.name}`) ?? 0;
    return { types, categories };
  }

  async create(kind: CategoryKind, data: any) {
    const typeId = Number(data.typeId ?? data.type_id);
    const name = String(data.name ?? '').trim();
    if (!typeId || !name) throw new HttpException('Type and name are required.', HttpStatus.BAD_REQUEST);
    const createdBy = data.createdBy ? Number(data.createdBy) : null;
    // One name per type, ignoring case; the same name under another type is fine.
    // Re-adding a name that was archived brings it back.
    const clash = await this.model(kind).findFirst({ where: { typeId, name: { equals: name, mode: 'insensitive' } } });
    if (clash?.isActive) throw new HttpException('This type already has a category with that name.', HttpStatus.CONFLICT);
    if (clash) return this.map(await this.model(kind).update({ where: { id: clash.id }, data: { isActive: true } }));
    return this.map(await this.model(kind).create({ data: { typeId, name, createdBy } }));
  }

  async rename(kind: CategoryKind, id: number, rawName: string) {
    const name = String(rawName ?? '').trim();
    if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
    const current = await this.model(kind).findUnique({ where: { id } });
    if (!current) throw new HttpException('Category not found.', HttpStatus.NOT_FOUND);
    if (current.name === name) return this.map(current);
    const clash = await this.model(kind).findFirst({ where: { typeId: current.typeId, name: { equals: name, mode: 'insensitive' }, NOT: { id } } });
    if (clash) throw new HttpException('This type already has a category with that name.', HttpStatus.CONFLICT);
    const [row] = await this.prisma.$transaction([
      this.model(kind).update({ where: { id }, data: { name } }),
      this.records(kind).updateMany({ where: { typeId: current.typeId, category: current.name }, data: { category: name } }),
    ]);
    return this.map(row);
  }

  // Unused: deleted. Used by records: archived, so the records keep their value but it leaves the pickers.
  async remove(kind: CategoryKind, id: number) {
    const current = await this.model(kind).findUnique({ where: { id } });
    if (!current) return { archived: false };
    const used = await this.records(kind).count({ where: { typeId: current.typeId, category: current.name } });
    if (used === 0) {
      await this.model(kind).delete({ where: { id } });
      return { archived: false };
    }
    await this.model(kind).update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }
}
