import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { cleanText } from '../common/helpers/master-data';

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

  // Pickers want only the clients that can be chosen; the Clients page asks for all of them to show the deactivated ones too
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

  // The checks a client goes through on create and on change. On a change only the fields that were sent are touched,
  // so a partial request never blanks what it left out.
  private async fields(data: any, current?: any) {
    const out: any = {};
    const pick = (...keys: string[]) => keys.find((k) => data[k] !== undefined);
    const text = (prop: string, label: string, max: number, ...keys: string[]) => {
      const k = pick(...keys);
      if (k) out[prop] = cleanText(data[k], label, max);
    };
    if (!current || data.name !== undefined) out.name = cleanText(data.name, 'Client name', 100, true);
    text('description', 'Description', 500, 'description');
    text('address', 'Address', 500, 'address');
    text('country', 'Country', 100, 'country');
    text('street', 'Street', 200, 'street');
    text('addressLine2', 'Address line 2', 200, 'address_line2', 'addressLine2');
    text('city', 'City', 100, 'city');
    text('state', 'State', 100, 'state');
    text('postalCode', 'Postal code', 20, 'postal_code', 'postalCode');
    text('contactName', 'Contact name', 100, 'contactName', 'contact_name');
    text('contactEmail', 'Contact email', 200, 'contactEmail', 'contact_email');
    text('contactPhone', 'Contact phone', 30, 'contactPhone', 'contact_phone');
    text('businessType', 'Business type', 100, 'businessType', 'business_type');
    if (out.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.contactEmail)) throw new HttpException('Enter a valid contact email.', HttpStatus.BAD_REQUEST);
    if (out.contactPhone && !/^\+?[0-9\s\-().]{7,20}$/.test(out.contactPhone)) throw new HttpException('Enter a valid contact phone, such as +91 98765 43210.', HttpStatus.BAD_REQUEST);
    const isActive = data.isActive !== undefined ? data.isActive : data.is_active;
    if (isActive !== undefined) out.isActive = Boolean(isActive);
    if (out.name !== undefined) {
      const clash = await this.prisma.client.findFirst({ where: { name: { equals: out.name, mode: 'insensitive' }, ...(current && { NOT: { id: current.id } }) } });
      if (clash) throw new HttpException(clash.isActive ? 'A client with that name already exists.' : 'A client with that name was deleted. Use another name.', HttpStatus.CONFLICT);
    }
    return out;
  }

  async create(data: any) {
    const fields = await this.fields(data);
    const c = await this.prisma.client.create({
      data: { ...fields, createdBy: data.createdBy ? Number(data.createdBy) : (data.created_by ? Number(data.created_by) : null) },
    });
    // Generate client code: CL-{COUNTRY_CODE}-{4-digit from 1001}
    const code = `CL-${this.countryCode(fields.country)}-${1000 + c.id}`;
    await this.prisma.client.update({ where: { id: c.id }, data: { code } });
    return this.findById(c.id);
  }

  async update(id: number, data: any) {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new HttpException('Client not found.', HttpStatus.NOT_FOUND);
    if (existing.isSystem) throw new HttpException('Cannot modify system client.', HttpStatus.FORBIDDEN);
    await this.prisma.client.update({ where: { id }, data: await this.fields(data, existing) });
    return this.findById(id);
  }

  // A client is deactivated, not erased. While it has live projects, products or orders it stays, so nothing is left without a customer.
  async delete(id: number) {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new HttpException('Client not found.', HttpStatus.NOT_FOUND);
    if (existing.isSystem) throw new HttpException('Cannot delete system client.', HttpStatus.FORBIDDEN);
    const [projects, products, orders] = await Promise.all([
      this.prisma.project.count({ where: { clientId: id, isActive: true } }),
      this.prisma.product.count({ where: { clientId: id, isActive: true } }),
      this.prisma.buildOrder.count({ where: { clientId: id, status: { in: ['COMMITTED', 'RELEASED', 'IN_BUILD'] } } }),
    ]);
    const parts = [projects && `${projects} project${projects === 1 ? '' : 's'}`, products && `${products} product${products === 1 ? '' : 's'}`, orders && `${orders} open order${orders === 1 ? '' : 's'}`].filter(Boolean);
    if (parts.length) throw new HttpException(`This client still has ${parts.join(', ')}. Delete or move ${parts.length === 1 && projects + products + orders === 1 ? 'it' : 'them'} first.`, HttpStatus.CONFLICT);
    await this.prisma.client.update({ where: { id }, data: { isActive: false } });
    return { message: 'Client deactivated.' };
  }
}
