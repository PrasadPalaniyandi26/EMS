import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({ orderBy: { id: 'asc' } });
    return roles.map((r) => ({
      role_id: r.id,
      role_name: r.name,
      description: r.description,
      access_level: r.accessLevel,
    }));
  }
}
