import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Departments people and budgets are filed under. Users and budgets store the department by name,
// so renaming one also renames it on them, and one that is in use is archived rather than deleted.
@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  private map(d: any) {
    return { id: d.id, name: d.name, is_active: d.isActive };
  }

  async findAll() {
    const rows = await this.prisma.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, take: 1000 });
    return rows.map((d) => this.map(d));
  }

  private async usedBy(name: string) {
    const [users, budgets] = await Promise.all([
      this.prisma.user.count({ where: { department: name } }),
      this.prisma.budget.count({ where: { department: name } }),
    ]);
    return users + budgets;
  }

  // How many users and budgets use each department: { departments: { [id]: n } }
  async usage() {
    const [rows, users, budgets] = await Promise.all([
      this.prisma.department.findMany({ where: { isActive: true } }),
      this.prisma.user.groupBy({ by: ['department'], _count: { _all: true } }),
      this.prisma.budget.groupBy({ by: ['department'], _count: { _all: true } }),
    ]);
    const counts = new Map<string | null, number>();
    for (const g of [...users, ...budgets]) counts.set(g.department, (counts.get(g.department) ?? 0) + g._count._all);
    const departments: Record<number, number> = {};
    for (const d of rows) departments[d.id] = counts.get(d.name) ?? 0;
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
      this.prisma.budget.updateMany({ where: { department: current.name }, data: { department: name } }),
    ]);
    return this.map(row);
  }

  async remove(id: number) {
    const current = await this.prisma.department.findUnique({ where: { id } });
    if (!current) return { archived: false };
    if ((await this.usedBy(current.name)) === 0) {
      await this.prisma.department.delete({ where: { id } });
      return { archived: false };
    }
    await this.prisma.department.update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }
}
