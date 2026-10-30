import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
      budget: p.budget ? Number(p.budget) : null,
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

  async create(data: any) {
    try {
      const p = await this.prisma.product.create({
        data: {
          clientId: data.clientId ? Number(data.clientId) : (data.client_id ? Number(data.client_id) : 0),
          typeId: data.typeId ? Number(data.typeId) : (data.type_id ? Number(data.type_id) : null),
          name: data.name,
          description: data.description || null,
          createdBy: data.createdBy ? Number(data.createdBy) : (data.created_by ? Number(data.created_by) : null),
          status: data.status || 'R&D',
          lead_id: data.lead_id ? Number(data.lead_id) : null,
          budget: data.budget ? Number(data.budget) : null,
          start_date: data.start_date ? new Date(data.start_date) : null,
          end_date: data.end_date ? new Date(data.end_date) : null,
          category: data.category || null,
        },
      });
      const code = `PRD-${String(10000 + p.id).padStart(5, '0')}`;
      await this.prisma.product.update({ where: { id: p.id }, data: { code } });
      return this.findById(p.id);
    } catch (error) {
      this.logger.error('Error creating product', error?.stack ?? error);
      throw error;
    }
  }

  async update(id: number, data: any) {
    try {
      await this.prisma.product.updateMany({
        where: { id, isSystem: false },
        data: {
          clientId: data.clientId ? Number(data.clientId) : (data.client_id ? Number(data.client_id) : undefined),
          typeId: data.typeId ? Number(data.typeId) : (data.type_id ? Number(data.type_id) : undefined),
          name: data.name,
          description: data.description || null,
          isActive: data.isActive !== undefined ? Boolean(data.isActive) : (data.is_active !== undefined ? Boolean(data.is_active) : undefined),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.lead_id !== undefined && { lead_id: data.lead_id ? Number(data.lead_id) : null }),
          ...(data.budget !== undefined && { budget: data.budget ? Number(data.budget) : null }),
          ...(data.start_date !== undefined && { start_date: data.start_date ? new Date(data.start_date) : null }),
          ...(data.end_date !== undefined && { end_date: data.end_date ? new Date(data.end_date) : null }),
          ...(data.category !== undefined && { category: data.category || null }),
        },
      });
      return this.findById(id);
    } catch (error) {
      this.logger.error(`Error updating product ${id}`, error?.stack ?? error);
      throw error;
    }
  }

  async delete(id: number) {
    const result = await this.prisma.product.updateMany({ where: { id, isSystem: false }, data: { isActive: false } });
    return result.count > 0;
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
