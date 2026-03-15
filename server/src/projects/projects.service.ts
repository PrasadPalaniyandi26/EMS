import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  constructor(private prisma: PrismaService) {}

  private mapProject(p: any) {
    return ({
      id: p.id, code: p.code, client_id: p.clientId, client_name: p.client?.name, type_id: p.typeId, type_name: p.type?.name,
      name: p.name, description: p.description, is_active: p.isActive ? 1 : 0, is_system: p.isSystem ? 1 : 0,
      status: (p as any).status || 'Active', lead_id: (p as any).leadId,
      created_by: p.createdBy, created_at: p.createdAt,
    });
  }

  private mapType(pt: any) {
    return ({
      id: pt.id, client_id: pt.clientId, client_name: pt.client?.name, name: pt.name,
      is_active: pt.isActive ? 1 : 0, created_by: pt.createdBy, created_at: pt.createdAt,
    });
  }

  private async fetchProjects(extraWhere = '', params: any[] = []) {
    const sql = `
      SELECT p.*, p.status, c.name AS client_name, pt.name AS type_name,
             u.username AS lead_name
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN project_types pt ON pt.id = p.type_id
      LEFT JOIN users u ON u.id = p.lead_id
      ${extraWhere}
      ORDER BY p.is_system DESC, c.name ASC, p.name ASC
      LIMIT 1000
    `;
    const rows = await (params.length > 0
      ? this.prisma.$queryRawUnsafe(sql, ...params)
      : this.prisma.$queryRawUnsafe(sql)) as any[];
    return rows.map((p: any) => ({
      id: p.id, code: p.code, client_id: p.client_id, client_name: p.client_name,
      type_id: p.type_id, type_name: p.type_name,
      name: p.name, description: p.description, is_active: p.is_active ? 1 : 0, is_system: p.is_system ? 1 : 0,
      status: p.status || 'Active', lead_id: p.lead_id, lead: p.lead_name || null,
      budget: p.budget ? Number(p.budget) : null,
      start_date: p.start_date || null, end_date: p.end_date || null,
      category: p.category || null,
      created_by: p.created_by, created_at: p.created_at,
    }));
  }

  async findAll(filters: { clientId?: number; typeId?: number; includeInactive?: boolean } = {}) {
    const conditions: string[] = [];
    const params: any[] = [];
    if (!filters.includeInactive) { conditions.push(`p.is_active = true`); }
    if (filters.clientId) { params.push(filters.clientId); conditions.push(`p.client_id = $${params.length}`); }
    if (filters.typeId) { params.push(filters.typeId); conditions.push(`p.type_id = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.fetchProjects(where, params);
  }

  async findById(id: number) {
    const rows = await this.fetchProjects(`WHERE p.id = $1`, [id]);
    if (!rows.length) throw new HttpException('Project not found.', HttpStatus.NOT_FOUND);
    return rows[0];
  }

  async create(data: any) {
    try {
      const p = await this.prisma.project.create({
        data: {
          clientId: data.clientId ? Number(data.clientId) : (data.client_id ? Number(data.client_id) : 0),
          typeId: data.typeId ? Number(data.typeId) : (data.type_id ? Number(data.type_id) : null),
          name: data.name,
          description: data.description || null,
          createdBy: data.createdBy ? Number(data.createdBy) : (data.created_by ? Number(data.created_by) : null),
        },
      });
      const code = `PRJ-${String(10000 + p.id).padStart(5, '0')}`;
      const status = data.status || 'Active';
      const leadId = data.lead_id ? Number(data.lead_id) : null;
      const budget = data.budget ? Number(data.budget) : null;
      const startDate = data.start_date || null;
      const endDate = data.end_date || null;
      const category = data.category || null;
      await this.prisma.$executeRawUnsafe(
        `UPDATE projects SET code=$1, status=$2, lead_id=$3, budget=$4, start_date=$5::date, end_date=$6::date, category=$7 WHERE id=$8`,
        code, status, leadId, budget, startDate, endDate, category, p.id,
      );
      return this.findById(p.id);
    } catch (error) {
      this.logger.error('Error creating project', error?.stack ?? error);
      throw error;
    }
  }

  async update(id: number, data: any) {
    try {
      await this.prisma.project.updateMany({
        where: { id, isSystem: false },
        data: {
          clientId: data.clientId ? Number(data.clientId) : (data.client_id ? Number(data.client_id) : undefined),
          typeId: data.typeId ? Number(data.typeId) : (data.type_id ? Number(data.type_id) : undefined),
          name: data.name,
          description: data.description || null,
          isActive: data.isActive !== undefined ? Boolean(data.isActive) : (data.is_active !== undefined ? Boolean(data.is_active) : undefined),
        },
      });
      const updates: string[] = [];
      const vals: any[] = [];
      if (data.status !== undefined) { vals.push(data.status); updates.push(`status=$${vals.length}`); }
      if (data.lead_id !== undefined) { vals.push(data.lead_id ? Number(data.lead_id) : null); updates.push(`lead_id=$${vals.length}`); }
      if (data.budget !== undefined) { vals.push(data.budget ? Number(data.budget) : null); updates.push(`budget=$${vals.length}`); }
      if (data.start_date !== undefined) { vals.push(data.start_date || null); updates.push(`start_date=$${vals.length}::date`); }
      if (data.end_date !== undefined) { vals.push(data.end_date || null); updates.push(`end_date=$${vals.length}::date`); }
      if (data.category !== undefined) { vals.push(data.category || null); updates.push(`category=$${vals.length}`); }
      if (updates.length > 0) {
        vals.push(id);
        await this.prisma.$executeRawUnsafe(`UPDATE projects SET ${updates.join(', ')} WHERE id=$${vals.length}`, ...vals);
      }
      return this.findById(id);
    } catch (error) {
      this.logger.error(`Error updating project ${id}`, error?.stack ?? error);
      throw error;
    }
  }

  async delete(id: number) {
    const result = await this.prisma.project.updateMany({ where: { id, isSystem: false }, data: { isActive: false } });
    return result.count > 0;
  }

  // --- Project Types ---
  async findAllTypes(filters: { clientId?: number; includeInactive?: boolean } = {}) {
    const where: any = {};
    if (!filters.includeInactive) where.isActive = true;
    if (filters.clientId) where.clientId = filters.clientId;
    const types = await this.prisma.projectType.findMany({
      where, include: { client: true }, orderBy: [{ client: { name: 'asc' } }, { name: 'asc' }],
      take: 1000,
    });
    return types.map((pt) => this.mapType(pt));
  }

  async findTypeById(id: number) {
    const pt = await this.prisma.projectType.findUnique({ where: { id }, include: { client: true } });
    if (!pt) throw new HttpException('Project type not found.', HttpStatus.NOT_FOUND);
    return this.mapType(pt);
  }

  async createType(data: any) {
    try {
      const pt = await this.prisma.projectType.create({
        data: {
          clientId: data.clientId ? Number(data.clientId) : (data.client_id ? Number(data.client_id) : 0),
          name: data.name,
          createdBy: data.createdBy ? Number(data.createdBy) : (data.created_by ? Number(data.created_by) : null),
        },
      });
      return this.findTypeById(pt.id);
    } catch (error) {
      this.logger.error('Error creating project type', error?.stack ?? error);
      throw error;
    }
  }

  async updateType(id: number, data: any) {
    try {
      await this.prisma.projectType.update({
        where: { id },
        data: {
          clientId: data.clientId ? Number(data.clientId) : (data.client_id ? Number(data.client_id) : undefined),
          name: data.name,
          isActive: data.isActive !== undefined ? Boolean(data.isActive) : (data.is_active !== undefined ? Boolean(data.is_active) : undefined),
        },
      });
      return this.findTypeById(id);
    } catch (error) {
      this.logger.error(`Error updating project type ${id}`, error?.stack ?? error);
      throw error;
    }
  }

  async deleteType(id: number) {
    await this.prisma.projectType.update({ where: { id }, data: { isActive: false } });
    return true;
  }
}
