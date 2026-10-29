import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);
  constructor(private prisma: PrismaService) {}

  // ISO 3166-1 alpha-2 country code lookup (common countries)
  private countryCode(country?: string | null): string {
    if (!country) return 'XX';
    const map: Record<string, string> = {
      'india': 'IN', 'united kingdom': 'GB', 'uk': 'GB', 'united states': 'US',
      'usa': 'US', 'us': 'US', 'australia': 'AU', 'canada': 'CA', 'germany': 'DE',
      'france': 'FR', 'singapore': 'SG', 'uae': 'AE', 'united arab emirates': 'AE',
      'china': 'CN', 'japan': 'JP', 'brazil': 'BR', 'south africa': 'ZA',
      'netherlands': 'NL', 'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK',
    };
    return map[country.toLowerCase().trim()] || country.substring(0, 2).toUpperCase();
  }

  private mapClient(c: any) {
    return ({
      id: c.id, code: c.code, name: c.name, description: c.description, address: c.address,
      country: c.country, street: c.street, address_line2: c.addressLine2, city: c.city, state: c.state, postal_code: c.postalCode,
      contact_name: c.contactName, contact_email: c.contactEmail, contact_phone: c.contactPhone,
      business_type: c.businessType, is_active: c.isActive ? 1 : 0, is_system: c.isSystem ? 1 : 0,
      created_by: c.createdBy, created_at: c.createdAt,
    });
  }

  async findAll(includeInactive = false) {
    const clients = await this.prisma.client.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      take: 1000,
    });
    return clients.map((c) => this.mapClient(c));
  }

  async findById(id: number) {
    const c = await this.prisma.client.findUnique({ where: { id } });
    if (!c) throw new HttpException('Client not found.', HttpStatus.NOT_FOUND);
    return this.mapClient(c);
  }

  async create(data: any) {
    try {
      const country = data.country || null;
      const c = await this.prisma.client.create({
        data: {
          name: data.name,
          description: data.description || null,
          address: data.address || null,
          country,
          street: data.street || null,
          addressLine2: data.address_line2 || data.addressLine2 || null,
          city: data.city || null,
          state: data.state || null,
          postalCode: data.postal_code || data.postalCode || null,
          contactName: data.contactName || data.contact_name || null,
          contactEmail: data.contactEmail || data.contact_email || null,
          contactPhone: data.contactPhone || data.contact_phone || null,
          businessType: data.businessType || data.business_type || null,
          createdBy: data.createdBy ? Number(data.createdBy) : (data.created_by ? Number(data.created_by) : null),
        },
      });
      // Generate client code: CL-{COUNTRY_CODE}-{4-digit from 1001}
      const cc = this.countryCode(country);
      const seq = 1000 + c.id;
      const code = `CL-${cc}-${seq}`;
      await this.prisma.client.update({ where: { id: c.id }, data: { code } });
      return this.findById(c.id);
    } catch (error) {
      this.logger.error('Error creating client', error?.stack ?? error);
      throw error;
    }
  }

  async update(id: number, data: any) {
    try {
      const existing = await this.prisma.client.findUnique({ where: { id } });
      if (!existing) throw new HttpException('Client not found.', HttpStatus.NOT_FOUND);
      if (existing.isSystem) throw new HttpException('Cannot modify system client.', HttpStatus.FORBIDDEN);

      await this.prisma.client.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description || null,
          address: data.address || null,
          country: data.country || null,
          street: data.street || null,
          addressLine2: data.address_line2 || data.addressLine2 || null,
          city: data.city || null,
          state: data.state || null,
          postalCode: data.postal_code || data.postalCode || null,
          contactName: data.contactName || data.contact_name || null,
          contactEmail: data.contactEmail || data.contact_email || null,
          contactPhone: data.contactPhone || data.contact_phone || null,
          businessType: data.businessType || data.business_type || null,
          isActive: data.isActive !== undefined ? Boolean(data.isActive) : (data.is_active !== undefined ? Boolean(data.is_active) : true),
        },
      });
      return this.findById(id);
    } catch (error) {
      this.logger.error(`Error updating client ${id}`, error?.stack ?? error);
      throw error;
    }
  }

  async delete(id: number) {
    const result = await this.prisma.client.updateMany({ where: { id, isSystem: false }, data: { isActive: false } });
    if (result.count === 0) throw new HttpException('Cannot delete system client.', HttpStatus.FORBIDDEN);
    return { message: 'Client deactivated.' };
  }
}
