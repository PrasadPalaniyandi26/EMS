import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private mapCategory(row: any) {
    return ({
      id: row.id, name: row.name, type: row.type, icon: row.icon,
      is_custom: row.isCustom ? 1 : 0, created_by: row.createdBy, is_active: row.isActive ? 1 : 0,
    });
  }

  async findAll(includeInactive = false) {
    const categories = await this.prisma.category.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ type: 'asc' }, { isCustom: 'asc' }, { name: 'asc' }],
      take: 1000,
    });
    // Deduplicate
    const unique: any[] = []; const seen = new Set();
    for (const row of categories) {
      const key = (row.name || '').toLowerCase() + '|' + row.type;
      if (!seen.has(key)) { seen.add(key); unique.push(this.mapCategory(row)); }
    }
    return unique;
  }

  async findByType(type: string, includeInactive = false) {
    const categories = await this.prisma.category.findMany({
      where: { type, isActive: includeInactive ? undefined : true },
      orderBy: [{ isCustom: 'asc' }, { name: 'asc' }],
      take: 1000,
    });
    const unique: any[] = []; const seen = new Set();
    for (const row of categories) {
      const key = (row.name || '').toLowerCase() + '|' + row.type;
      if (!seen.has(key)) { seen.add(key); unique.push(this.mapCategory(row)); }
    }
    return unique;
  }

  async findById(id: number) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new HttpException('Category not found.', HttpStatus.NOT_FOUND);
    return this.mapCategory(row);
  }

  async create(data: { name: string; type: string; icon?: string; createdBy?: number }) {
    const cat = await this.prisma.category.create({
      data: { name: data.name, type: data.type, icon: data.icon || 'tag', isCustom: true, createdBy: data.createdBy || null, isActive: true },
    });
    return this.findById(cat.id);
  }

  async update(id: number, data: { name: string; type: string; icon?: string; isActive?: boolean }) {
    await this.prisma.category.updateMany({
      where: { id, isCustom: true },
      data: { name: data.name, type: data.type, icon: data.icon || 'tag', isActive: data.isActive !== undefined ? Boolean(data.isActive) : true },
    });
    return this.findById(id);
  }

  async delete(id: number) {
    const result = await this.prisma.category.updateMany({ where: { id, isCustom: true }, data: { isActive: false } });
    return result.count > 0;
  }
}
