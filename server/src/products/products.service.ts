import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertDateRange, cleanDate, cleanId, cleanStatus, cleanText, PRODUCT_STATUSES } from '../common/helpers/master-data';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  constructor(private prisma: PrismaService) {}

  private mapType(pt: any) {
    return ({
      id: pt.id, name: pt.name, code: pt.code ?? null,
      is_active: pt.isActive ? 1 : 0, created_by: pt.createdBy, created_at: pt.createdAt,
    });
  }

  private mapProductFull(p: any) {
    return ({
      id: p.id, code: p.code, client_id: p.clientId, client_name: p.client?.name,
      type_id: p.typeId, type_name: p.type?.name,
      name: p.name, description: p.description, is_active: p.isActive ? 1 : 0, is_system: p.isSystem ? 1 : 0,
      status: p.status || 'R&D', lead_id: p.lead_id,
      lead: p.users_products_lead_idTousers?.username || null,
      standard_cost: p.standardCost == null ? null : Number(p.standardCost),
      start_date: p.start_date || null, end_date: p.end_date || null,
      category: p.category || null,
      created_by: p.createdBy, created_at: p.createdAt,
    });
  }

  async findAll(filters: { clientId?: number; typeId?: number; includeInactive?: boolean } = {}) {
    const rows = await this.prisma.product.findMany({
      where: {
        ...(!filters.includeInactive && { isActive: true }),
        ...(filters.clientId && { clientId: filters.clientId }),
        ...(filters.typeId && { typeId: filters.typeId }),
      },
      include: { client: true, type: true, users_products_lead_idTousers: true },
      orderBy: [{ isSystem: 'desc' }, { client: { name: 'asc' } }, { name: 'asc' }],
      take: 1000,
    });
    return rows.map((p) => this.mapProductFull(p));
  }

  async findById(id: number) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { client: true, type: true, users_products_lead_idTousers: true },
    });
    if (!p) throw new HttpException('Product not found.', HttpStatus.NOT_FOUND);
    return this.mapProductFull(p);
  }

  // The checks a product goes through on create and on change. On a change only the fields that were sent are touched,
  // so a partial request never blanks what it left out.
  private async fields(data: any, current?: any) {
    const out: any = {};
    const sent = (a: string, b?: string) => data[a] !== undefined || (b != null && data[b] !== undefined);
    if (!current || sent('name')) out.name = cleanText(data.name, 'Product name', 100, true);
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
        const typeId = cleanId(raw, 'product type');
        if (!(await this.prisma.productType.findUnique({ where: { id: typeId } }))) throw new HttpException('Product type not found.', HttpStatus.NOT_FOUND);
        out.typeId = typeId;
      }
    }
    if (sent('lead_id')) {
      if (data.lead_id === null || data.lead_id === '' || data.lead_id === 0) out.lead_id = null;
      else {
        const leadId = cleanId(data.lead_id, 'product lead');
        if (!(await this.prisma.user.findUnique({ where: { id: leadId }, select: { id: true } }))) throw new HttpException('Product lead not found.', HttpStatus.NOT_FOUND);
        out.lead_id = leadId;
      }
    }
    if (sent('description')) out.description = cleanText(data.description, 'Description', 500);
    if (sent('category')) out.category = cleanText(data.category, 'Category', 100);
    if (!current || sent('status')) out.status = data.status === undefined ? 'R&D' : cleanStatus(data.status, PRODUCT_STATUSES, current?.status);
    if (sent('start_date')) out.start_date = cleanDate(data.start_date, 'start date');
    if (sent('end_date')) out.end_date = cleanDate(data.end_date, 'end date');
    assertDateRange(out.start_date !== undefined ? out.start_date : current?.start_date ?? null, out.end_date !== undefined ? out.end_date : current?.end_date ?? null);
    const isActive = data.isActive !== undefined ? data.isActive : data.is_active;
    if (isActive !== undefined) out.isActive = Boolean(isActive);
    // One product name per client, ignoring case (the database also keeps deleted ones)
    const name = out.name ?? current?.name; const clientId = out.clientId ?? current?.clientId;
    if (name && (out.name !== undefined || out.clientId !== undefined)) {
      const clash = await this.prisma.product.findFirst({ where: { clientId, name: { equals: name, mode: 'insensitive' }, ...(current && { NOT: { id: current.id } }) } });
      if (clash) throw new HttpException(clash.isActive ? 'This client already has a product with that name.' : 'This client had a product with that name that was deleted. Use another name.', HttpStatus.CONFLICT);
    }
    return out;
  }

  async create(data: any) {
    const fields = await this.fields(data);
    const p = await this.prisma.product.create({
      data: { ...fields, createdBy: data.createdBy ? Number(data.createdBy) : (data.created_by ? Number(data.created_by) : null) },
    });
    const code = `PRD-${String(10000 + p.id).padStart(5, '0')}`;
    await this.prisma.product.update({ where: { id: p.id }, data: { code } });
    return this.findById(p.id);
  }

  async update(id: number, data: any) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) throw new HttpException('Product not found.', HttpStatus.NOT_FOUND);
    if (current.isSystem) throw new HttpException('A system product cannot be changed.', HttpStatus.FORBIDDEN);
    await this.prisma.product.update({ where: { id }, data: await this.fields(data, current) });
    return this.findById(id);
  }

  // A product with orders in flight, or lines in a budget plan that is still in use, is not deleted from under them
  async delete(id: number) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) return false;
    if (current.isSystem) throw new HttpException('A system product cannot be deleted.', HttpStatus.FORBIDDEN);
    const open = await this.prisma.buildOrder.count({ where: { productId: id, status: { in: ['COMMITTED', 'RELEASED', 'IN_BUILD'] } } });
    if (open) throw new HttpException(`This product has ${open} open order${open === 1 ? '' : 's'}. Deliver or cancel ${open === 1 ? 'it' : 'them'} first.`, HttpStatus.CONFLICT);
    const lines = await this.prisma.budgetLine.findMany({ where: { productId: id, isActive: true, plan: { status: { not: 'CLOSED' } } }, select: { plan: { select: { fy: true } } } });
    if (lines.length) {
      const years = [...new Set(lines.map((l) => l.plan.fy))].sort().join(', ');
      throw new HttpException(`This product has budget lines in the plan for ${years}. Take them out of the plan first.`, HttpStatus.CONFLICT);
    }
    await this.prisma.product.update({ where: { id }, data: { isActive: false } });
    return true;
  }

  // --- Product Types (global: a product is "client X, product Y, of type Z") ---
  async findAllTypes(filters: { includeInactive?: boolean } = {}) {
    const types = await this.prisma.productType.findMany({
      where: filters.includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' }, take: 1000,
    });
    return types.map((pt) => this.mapType(pt));
  }

  async findTypeById(id: number) {
    const pt = await this.prisma.productType.findUnique({ where: { id } });
    if (!pt) throw new HttpException('Product type not found.', HttpStatus.NOT_FOUND);
    return this.mapType(pt);
  }

  // Type names are unique, ignoring case. Returns the clashing type, if any.
  private findTypeClash(name: string, exceptId?: number) {
    return this.prisma.productType.findFirst({
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
      if (code && (await this.prisma.productType.findFirst({ where: { code } }))) throw new HttpException('Another type already uses that code.', HttpStatus.CONFLICT);
      const clash = await this.findTypeClash(name);
      if (clash?.isActive) throw new HttpException('A type with this name already exists.', HttpStatus.CONFLICT);
      if (clash) {
        await this.prisma.productType.update({ where: { id: clash.id }, data: { isActive: true, ...(code ? { code } : {}) } });
        return this.findTypeById(clash.id);
      }
      const pt = await this.prisma.productType.create({
        data: {
          name, code,
          createdBy: data.createdBy ? Number(data.createdBy) : (data.created_by ? Number(data.created_by) : null),
        },
      });
      return this.findTypeById(pt.id);
    } catch (error) {
      this.logger.error('Error creating product type', error?.stack ?? error);
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
      if (code && (await this.prisma.productType.findFirst({ where: { code, NOT: { id } } }))) throw new HttpException('Another type already uses that code.', HttpStatus.CONFLICT);
      await this.prisma.productType.update({
        where: { id },
        data: {
          name, code,
          isActive: data.isActive !== undefined ? Boolean(data.isActive) : (data.is_active !== undefined ? Boolean(data.is_active) : undefined),
        },
      });
      return this.findTypeById(id);
    } catch (error) {
      this.logger.error(`Error updating product type ${id}`, error?.stack ?? error);
      throw error;
    }
  }

  // A type nothing ever used is deleted (its categories go with it); one that products reference is archived
  async deleteType(id: number) {
    const used = await this.prisma.product.count({ where: { typeId: id } });
    if (used === 0) {
      await this.prisma.productType.delete({ where: { id } });
      return { archived: false };
    }
    await this.prisma.productType.update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }
}
