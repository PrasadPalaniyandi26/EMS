import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Departments people are filed under, and the overhead cost objects budgets are planned for. Users store
// the department by name, so renaming one also renames it on them; one that is in use is archived rather than deleted.
@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  private map(d: any, owners?: Map<number, string>) {
    return { id: d.id, name: d.name, is_active: d.isActive, owner_id: d.ownerId ?? null, owner_name: d.ownerId != null ? owners?.get(d.ownerId) ?? null : null };
  }

  private async ownerNames(rows: { ownerId: number | null }[]) {
    const ids = [...new Set(rows.map((r) => r.ownerId).filter((x): x is number => x != null))];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } }) : [];
    return new Map(users.map((u) => [u.id, u.username]));
  }

  async findAll() {
    const rows = await this.prisma.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, take: 1000 });
    const owners = await this.ownerNames(rows);
    return rows.map((d) => this.map(d, owners));
  }

  private async usedBy(id: number, name: string) {
    const [users, lines, txns] = await Promise.all([
      this.prisma.user.count({ where: { department: name } }),
      this.prisma.budgetLine.count({ where: { departmentId: id } }),
      this.prisma.transaction.count({ where: { departmentId: id } }),
    ]);
    return users + lines + txns;
  }

  // How many users, budget lines and expenses use each department: { departments: { [id]: n } }
  async usage() {
    const [rows, users, lines, txns] = await Promise.all([
      this.prisma.department.findMany({ where: { isActive: true } }),
      this.prisma.user.groupBy({ by: ['department'], _count: { _all: true } }),
      this.prisma.budgetLine.groupBy({ by: ['departmentId'], _count: { _all: true } }),
      this.prisma.transaction.groupBy({ by: ['departmentId'], _count: { _all: true } }),
    ]);
    const byName = new Map<string | null, number>(users.map((g) => [g.department, g._count._all]));
    const byId = new Map<number | null, number>();
    for (const g of [...lines, ...txns]) byId.set(g.departmentId, (byId.get(g.departmentId) ?? 0) + g._count._all);
    const departments: Record<number, number> = {};
    for (const d of rows) departments[d.id] = (byName.get(d.name) ?? 0) + (byId.get(d.id) ?? 0);
    return { departments };
  }

  async create(rawName: string, createdBy?: number) {
    const name = String(rawName ?? '').trim();
    if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
    const clash = await this.prisma.department.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (clash?.isActive) throw new HttpException('A department with this name already exists.', HttpStatus.CONFLICT);
    if (clash) return this.map(await this.prisma.department.update({ where: { id: clash.id }, data: { isActive: true } }));
    return this.map(await this.prisma.department.create({ data: { name, createdBy: createdBy ?? null } }));
  }

  async rename(id: number, rawName: string) {
    const name = String(rawName ?? '').trim();
    if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
    const current = await this.prisma.department.findUnique({ where: { id } });
    if (!current) throw new HttpException('Department not found.', HttpStatus.NOT_FOUND);
    if (current.name === name) return this.map(current);
    const clash = await this.prisma.department.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } } });
    if (clash) throw new HttpException('A department with this name already exists.', HttpStatus.CONFLICT);
    const [row] = await this.prisma.$transaction([
      this.prisma.department.update({ where: { id }, data: { name } }),
      this.prisma.user.updateMany({ where: { department: current.name }, data: { department: name } }),
    ]);
    return this.map(row);
  }

  async remove(id: number) {
    const current = await this.prisma.department.findUnique({ where: { id } });
    if (!current) return { archived: false };
    if ((await this.usedBy(id, current.name)) === 0) {
      await this.prisma.department.delete({ where: { id } });
      return { archived: false };
    }
    await this.prisma.department.update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }

  async setOwner(id: number, ownerId: number | null) {
    const current = await this.prisma.department.findUnique({ where: { id } });
    if (!current) throw new HttpException('Department not found.', HttpStatus.NOT_FOUND);
    const row = await this.prisma.department.update({ where: { id }, data: { ownerId: ownerId ? Number(ownerId) : null } });
    return this.map(row, await this.ownerNames([row]));
  }
}
