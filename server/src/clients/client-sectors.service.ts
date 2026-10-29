import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Industry sectors a client can be filed under. A client stores its sector by name,
// so renaming a sector also renames it on the clients that use it.
@Injectable()
export class ClientSectorsService {
  constructor(private prisma: PrismaService) {}

  private map(s: any) {
    return { id: s.id, name: s.name, is_active: s.isActive };
  }

  async findAll() {
    const rows = await this.prisma.clientSector.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, take: 1000 });
    return rows.map((s) => this.map(s));
  }

  // How many clients use each sector: { [sectorId]: n }
  async usage() {
    const [sectors, grouped] = await Promise.all([
      this.prisma.clientSector.findMany({ where: { isActive: true } }),
      this.prisma.client.groupBy({ by: ['businessType'], _count: { _all: true } }),
    ]);
    const byName = new Map(grouped.map((g) => [g.businessType, g._count._all]));
    const sectorsUsage: Record<number, number> = {};
    for (const s of sectors) sectorsUsage[s.id] = byName.get(s.name) ?? 0;
    return { sectors: sectorsUsage };
  }

  async create(rawName: string, createdBy?: number) {
    const name = String(rawName ?? '').trim();
    if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
    const clash = await this.prisma.clientSector.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (clash?.isActive) throw new HttpException('A sector with this name already exists.', HttpStatus.CONFLICT);
    if (clash) return this.map(await this.prisma.clientSector.update({ where: { id: clash.id }, data: { isActive: true } }));
    return this.map(await this.prisma.clientSector.create({ data: { name, createdBy: createdBy ?? null } }));
  }

  async rename(id: number, rawName: string) {
    const name = String(rawName ?? '').trim();
    if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
    const current = await this.prisma.clientSector.findUnique({ where: { id } });
    if (!current) throw new HttpException('Sector not found.', HttpStatus.NOT_FOUND);
    if (current.name === name) return this.map(current);
    const clash = await this.prisma.clientSector.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } } });
    if (clash) throw new HttpException('A sector with this name already exists.', HttpStatus.CONFLICT);
    const [row] = await this.prisma.$transaction([
      this.prisma.clientSector.update({ where: { id }, data: { name } }),
      this.prisma.client.updateMany({ where: { businessType: current.name }, data: { businessType: name } }),
    ]);
    return this.map(row);
  }

  // Unused: deleted. Used by clients: archived, so they keep it but it leaves the dropdown.
  async remove(id: number) {
    const current = await this.prisma.clientSector.findUnique({ where: { id } });
    if (!current) return { archived: false };
    const used = await this.prisma.client.count({ where: { businessType: current.name } });
    if (used === 0) {
      await this.prisma.clientSector.delete({ where: { id } });
      return { archived: false };
    }
    await this.prisma.clientSector.update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }
}
