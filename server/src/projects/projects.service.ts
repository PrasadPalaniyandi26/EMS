import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertDateRange, cleanDate, cleanId, cleanStatus, cleanText, PROJECT_STATUSES } from '../common/helpers/master-data';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  constructor(private prisma: PrismaService) {}

  private mapType(pt: any) {
    return ({
      id: pt.id, name: pt.name, code: pt.code ?? null,
      is_active: pt.isActive ? 1 : 0, created_by: pt.createdBy, created_at: pt.createdAt,
    });
  }

  private mapProjectFull(p: any) {
    return ({
      id: p.id, code: p.code, client_id: p.clientId, client_name: p.client?.name,
      type_id: p.typeId, type_name: p.type?.name,
      name: p.name, description: p.description, is_active: p.isActive ? 1 : 0, is_system: p.isSystem ? 1 : 0,
      status: p.status || 'Active', lead_id: p.lead_id,
      lead: p.users_projects_lead_idTousers?.username || null,
      start_date: p.start_date || null, end_date: p.end_date || null,
      category: p.category || null,
      created_by: p.createdBy, created_at: p.createdAt,
    });
  }

  async findAll(filters: { clientId?: number; typeId?: number; includeInactive?: boolean } = {}) {
    const rows = await this.prisma.project.findMany({
      where: {
        ...(!filters.includeInactive && { isActive: true }),
        ...(filters.clientId && { clientId: filters.clientId }),
        ...(filters.typeId && { typeId: filters.typeId }),
      },
      include: { client: true, type: true, users_projects_lead_idTousers: true },
      orderBy: [{ isSystem: 'desc' }, { client: { name: 'asc' } }, { name: 'asc' }],
      take: 1000,
    });
    return rows.map((p) => this.mapProjectFull(p));
  }

  async findById(id: number) {
    const p = await this.prisma.project.findUnique({
      where: { id },
      include: { client: true, type: true, users_projects_lead_idTousers: true },
    });
    if (!p) throw new HttpException('Project not found.', HttpStatus.NOT_FOUND);
    return this.mapProjectFull(p);
  }

  // The checks a project goes through on create and on change. On a change only the fields that were sent are touched,
  // so a partial request never blanks what it left out.
  private async fields(data: any, current?: any) {
    const out: any = {};
    const sent = (a: string, b?: string) => data[a] !== undefined || (b != null && data[b] !== undefined);
    if (!current || sent('name')) out.name = cleanText(data.name, 'Project name', 100, true);
    if (!current || sent('clientId', 'client_id')) {
      const clientId = cleanId(data.clientId ?? data.client_id, 'client');
      const client = await this.prisma.client.findUnique({ where: { id: clientId } });
      if (!client) throw new HttpException('Client not found.', HttpStatus.NOT_FOUND);
      if (!client.isActive && clientId !== current?.clientId) throw new HttpException('That client is inactive. Choose an active client.', HttpStatus.BAD_REQUEST);
      out.clientId = clientId;
    }
    if (sent('typeId', 'type_id')) {
      const raw = data.typeId ?? data.type_id;
      if (raw === null || raw === '' || raw === 0) out.typeId = null;
      else {
        const typeId = cleanId(raw, 'project type');
        if (!(await this.prisma.projectType.findUnique({ where: { id: typeId } }))) throw new HttpException('Project type not found.', HttpStatus.NOT_FOUND);
        out.typeId = typeId;
      }
    }
    if (sent('lead_id')) {
      if (data.lead_id === null || data.lead_id === '' || data.lead_id === 0) out.lead_id = null;
      else {
        const leadId = cleanId(data.lead_id, 'project lead');
        if (!(await this.prisma.user.findUnique({ where: { id: leadId }, select: { id: true } }))) throw new HttpException('Project lead not found.', HttpStatus.NOT_FOUND);
        out.lead_id = leadId;
      }
    }
    if (sent('description')) out.description = cleanText(data.description, 'Description', 500);
    if (sent('category')) out.category = cleanText(data.category, 'Category', 100);
    if (!current || sent('status')) out.status = data.status === undefined ? 'Active' : cleanStatus(data.status, PROJECT_STATUSES, current?.status);
    if (sent('start_date')) out.start_date = cleanDate(data.start_date, 'start date');
    if (sent('end_date')) out.end_date = cleanDate(data.end_date, 'end date');
    assertDateRange(out.start_date !== undefined ? out.start_date : current?.start_date ?? null, out.end_date !== undefined ? out.end_date : current?.end_date ?? null);
    const isActive = data.isActive !== undefined ? data.isActive : data.is_active;
    if (isActive !== undefined) out.isActive = Boolean(isActive);
    // One project name per client, ignoring case (the database also keeps deleted ones)
    const name = out.name ?? current?.name; const clientId = out.clientId ?? current?.clientId;
    if (name && (out.name !== undefined || out.clientId !== undefined)) {
      const clash = await this.prisma.project.findFirst({ where: { clientId, name: { equals: name, mode: 'insensitive' }, ...(current && { NOT: { id: current.id } }) } });
      if (clash) throw new HttpException(clash.isActive ? 'This client already has a project with that name.' : 'This client had a project with that name that was deleted. Use another name.', HttpStatus.CONFLICT);
    }
    return out;
  }

  async create(data: any) {
    const fields = await this.fields(data);
    const p = await this.prisma.project.create({
      data: { ...fields, createdBy: data.createdBy ? Number(data.createdBy) : (data.created_by ? Number(data.created_by) : null) },
    });
    const code = `PRJ-${String(10000 + p.id).padStart(5, '0')}`;
    await this.prisma.project.update({ where: { id: p.id }, data: { code } });
    return this.findById(p.id);
  }

  async update(id: number, data: any) {
    const current = await this.prisma.project.findUnique({ where: { id } });
    if (!current) throw new HttpException('Project not found.', HttpStatus.NOT_FOUND);
    if (current.isSystem) throw new HttpException('A system project cannot be changed.', HttpStatus.FORBIDDEN);
    await this.prisma.project.update({ where: { id }, data: await this.fields(data, current) });
    return this.findById(id);
  }

  // A project in a budget plan that is still in use is not deleted from under it; finish or cancel it instead
  async delete(id: number) {
    const current = await this.prisma.project.findUnique({ where: { id } });
    if (!current) return false;
    if (current.isSystem) throw new HttpException('A system project cannot be deleted.', HttpStatus.FORBIDDEN);
    const lines = await this.prisma.budgetLine.findMany({ where: { projectId: id, isActive: true, plan: { status: { not: 'CLOSED' } } }, select: { plan: { select: { fy: true } } } });
    if (lines.length) {
      const years = [...new Set(lines.map((l) => l.plan.fy))].sort().join(', ');
      throw new HttpException(`This project has budget lines in the plan for ${years}. Take them out of the plan first, or set the project to Completed or Canceled instead of deleting it.`, HttpStatus.CONFLICT);
    }
    await this.prisma.project.update({ where: { id }, data: { isActive: false } });
    return true;
  }

  // --- Project Types (global: a project is "client X, project Y, of type Z") ---
  async findAllTypes(filters: { includeInactive?: boolean } = {}) {
    const types = await this.prisma.projectType.findMany({
      where: filters.includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' }, take: 1000,
    });
    return types.map((pt) => this.mapType(pt));
  }

  async findTypeById(id: number) {
    const pt = await this.prisma.projectType.findUnique({ where: { id } });
    if (!pt) throw new HttpException('Project type not found.', HttpStatus.NOT_FOUND);
    return this.mapType(pt);
  }

  // Type names are unique, ignoring case. Returns the clashing type, if any.
  private findTypeClash(name: string, exceptId?: number) {
    return this.prisma.projectType.findFirst({
      where: { name: { equals: String(name).trim(), mode: 'insensitive' }, ...(exceptId && { NOT: { id: exceptId } }) },
    });
  }

  // Codes such as J110 or P101: up to 10 letters or digits, stored upper case
  private cleanCode(raw: any): string | null {
    const code = String(raw ?? '').trim().toUpperCase();
    if (!code) return null;
    if (!/^[A-Z0-9.-]{1,10}$/.test(code)) throw new HttpException('A code is up to 10 letters or digits.', HttpStatus.BAD_REQUEST);
    return code;
  }

  async createType(data: any) {
    try {
      const name = String(data.name ?? '').trim();
      if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
      const code = this.cleanCode(data.code);
      if (code && (await this.prisma.projectType.findFirst({ where: { code } }))) throw new HttpException('Another type already uses that code.', HttpStatus.CONFLICT);
      const clash = await this.findTypeClash(name);
      if (clash?.isActive) throw new HttpException('A type with this name already exists.', HttpStatus.CONFLICT);
      if (clash) {
        await this.prisma.projectType.update({ where: { id: clash.id }, data: { isActive: true, ...(code ? { code } : {}) } });
        return this.findTypeById(clash.id);
      }
      const pt = await this.prisma.projectType.create({
        data: {
          name, code,
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
      const name = data.name !== undefined ? String(data.name).trim() : undefined;
      if (name !== undefined) {
        if (!name) throw new HttpException('Name is required.', HttpStatus.BAD_REQUEST);
        if (await this.findTypeClash(name, id)) throw new HttpException('A type with this name already exists.', HttpStatus.CONFLICT);
      }
      const code = data.code === undefined ? undefined : this.cleanCode(data.code);
      if (code && (await this.prisma.projectType.findFirst({ where: { code, NOT: { id } } }))) throw new HttpException('Another type already uses that code.', HttpStatus.CONFLICT);
      await this.prisma.projectType.update({
        where: { id },
        data: {
          name, code,
          isActive: data.isActive !== undefined ? Boolean(data.isActive) : (data.is_active !== undefined ? Boolean(data.is_active) : undefined),
        },
      });
      return this.findTypeById(id);
    } catch (error) {
      this.logger.error(`Error updating project type ${id}`, error?.stack ?? error);
      throw error;
    }
  }

  // A type nothing ever used is deleted (its categories go with it); one that projects reference is archived
  async deleteType(id: number) {
    const used = await this.prisma.project.count({ where: { typeId: id } });
    if (used === 0) {
      await this.prisma.projectType.delete({ where: { id } });
      return { archived: false };
    }
    await this.prisma.projectType.update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }
}
