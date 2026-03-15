import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(private prisma: PrismaService) {}

  private normalizeStatus(raw?: string): string {
    if (!raw) return 'ACTIVE';
    const s = raw.trim().toLowerCase();
    if (s === 'on hold' || s === 'on_hold') return 'ON_HOLD';
    if (s === 'inactive' || s === 'in active' || s === 'in_active') return 'INACTIVE';
    return 'ACTIVE';
  }

  private mapUser(user: any) {
    return ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      role_id: user.roleId,
      role_name: user.roleRelation?.name,
      manager_id: user.managerId,
      manager_name: user.manager?.username,
      department: user.department,
      clearance_level: user.clearanceLevel,
      joining_date: user.joiningDate,
      is_active: user.isActive ? 1 : 0,
      currency: user.currency,
      created_at: user.createdAt,
      roles: (user.userRoles || []).map((ur: any) => ({
        role_id: ur.roleId,
        role_name: ur.role?.name,
        is_default: ur.isDefault,
      })),
      contact_no: user.contact_no ?? null,
      house_apt: user.house_apt ?? null,
      address: user.address ?? null,
      city: user.city ?? null,
      country: user.country ?? null,
      postal_code: user.postal_code ?? null,
      user_status: user.user_status || (user.isActive ? 'ACTIVE' : 'INACTIVE'),
      user_status_label: user.user_status === 'ON_HOLD' ? 'On Hold' : user.user_status === 'INACTIVE' ? 'Inactive' : 'Active',
    });
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: { roleRelation: true, manager: true, userRoles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const ids = users.map((u) => u.id);
    const extras = ids.length > 0
      ? await this.prisma.$queryRawUnsafe(
          `SELECT id, contact_no, house_apt, address, city, country, postal_code, user_status FROM users WHERE id = ANY($1::int[])`,
          ids,
        ) as any[]
      : [];
    const extraMap = Object.fromEntries(extras.map((e) => [e.id, e]));
    return users.map((u) => this.mapUser({ ...u, ...extraMap[u.id] }));
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roleRelation: true, manager: true, userRoles: { include: { role: true } } },
    });
    if (!user) throw new HttpException('User not found.', HttpStatus.NOT_FOUND);
    const extras = await this.prisma.$queryRaw<any[]>`SELECT contact_no, house_apt, address, city, country, postal_code, user_status FROM users WHERE id = ${id}`;
    const extra = extras[0] || {};
    return this.mapUser({ ...user, ...extra });
  }

  async create(dto: any) {
    const password = dto.password || 'Temporary123!';
    const hash = await bcrypt.hash(password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          passwordHash: hash,
          role: dto.role || 'user',
          roleId: dto.role_id ? Number(dto.role_id) : (dto.roleId ? Number(dto.roleId) : null),
          managerId: dto.reporting_manager_id ? Number(dto.reporting_manager_id) : (dto.manager_id ? Number(dto.manager_id) : (dto.managerId ? Number(dto.managerId) : null)),
          department: dto.department || null,
          clearanceLevel: dto.clearance_level || dto.clearanceLevel || 'Level 1',
          joiningDate: dto.joining_date ? new Date(dto.joining_date) : (dto.joiningDate ? new Date(dto.joiningDate) : null),
        },
      });

      // Assign roles from dto.roles[] or default to Employee role
      if (dto.roles && Array.isArray(dto.roles) && dto.roles.length > 0) {
        await this.setUserRoles(user.id, dto.roles);
      } else if (user.roleId) {
        // Create a default UserRole entry from the assigned roleId
        await this.prisma.userRole.create({
          data: { userId: user.id, roleId: user.roleId, isDefault: true },
        });
      }

      await this.prisma.$executeRaw`
        UPDATE users SET
          contact_no = ${dto.contact_no || null},
          house_apt = ${dto.house_apt || null},
          address = ${dto.address || null},
          city = ${dto.city || null},
          country = ${dto.country || null},
          postal_code = ${dto.postal_code || null},
          user_status = ${this.normalizeStatus(dto.status)}
        WHERE id = ${user.id}
      `;

      return this.findById(user.id);
    } catch (err: any) {
      if (err.code === 'P2002') {
        const field = err.meta?.target?.includes('email') ? 'email' : 'username';
        throw new HttpException(`A user with this ${field} already exists.`, HttpStatus.CONFLICT);
      }
      this.logger.error('Error creating user', err?.stack ?? err);
      throw err;
    }
  }

  async update(id: number, dto: any) {
    const data: any = {};
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;

    if (dto.role_id !== undefined) data.roleId = dto.role_id ? Number(dto.role_id) : null;
    else if (dto.roleId !== undefined) data.roleId = dto.roleId ? Number(dto.roleId) : null;

    if (dto.reporting_manager_id !== undefined) data.managerId = dto.reporting_manager_id ? Number(dto.reporting_manager_id) : null;
    else if (dto.manager_id !== undefined) data.managerId = dto.manager_id ? Number(dto.manager_id) : null;
    else if (dto.managerId !== undefined) data.managerId = dto.managerId ? Number(dto.managerId) : null;

    if (dto.department !== undefined) data.department = dto.department;
    if (dto.clearance_level !== undefined) data.clearanceLevel = dto.clearance_level;
    else if (dto.clearanceLevel !== undefined) data.clearanceLevel = dto.clearanceLevel;

    if (dto.joining_date !== undefined) data.joiningDate = dto.joining_date ? new Date(dto.joining_date) : null;
    else if (dto.joiningDate !== undefined) data.joiningDate = dto.joiningDate ? new Date(dto.joiningDate) : null;

    if (dto.isActive !== undefined) data.isActive = Boolean(dto.isActive);
    else if (dto.is_active !== undefined) data.isActive = Boolean(dto.is_active);

    if (dto.password) {
      const hash = await bcrypt.hash(dto.password, 10);
      data.passwordHash = hash;
    }

    try {
      await this.prisma.user.update({ where: { id }, data });

      // Sync roles if provided
      if (dto.roles && Array.isArray(dto.roles) && dto.roles.length > 0) {
        await this.setUserRoles(id, dto.roles);
      }

      await this.prisma.$executeRaw`
        UPDATE users SET
          contact_no = ${dto.contact_no || null},
          house_apt = ${dto.house_apt || null},
          address = ${dto.address || null},
          city = ${dto.city || null},
          country = ${dto.country || null},
          postal_code = ${dto.postal_code || null},
          user_status = ${this.normalizeStatus(dto.status || dto.user_status)}
        WHERE id = ${id}
      `;

      return this.findById(id);
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new HttpException('Username or email already in use.', HttpStatus.CONFLICT);
      }
      this.logger.error(`Error updating user ${id}`, err?.stack ?? err);
      throw err;
    }
  }

  async setUserRoles(userId: number, roles: { roleId: number; isDefault: boolean }[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roles.map((r) => ({ userId, roleId: r.roleId, isDefault: r.isDefault })),
      });
      const defaultRole = roles.find((r) => r.isDefault) || roles[0];
      if (defaultRole) {
        await tx.user.update({ where: { id: userId }, data: { roleId: defaultRole.roleId } });
      }
    });
    return this.findById(userId);
  }

  async switchRole(userId: number, roleId: number) {
    const userRole = await this.prisma.userRole.findFirst({ where: { userId, roleId } });
    if (!userRole) throw new HttpException('Role not assigned to user.', HttpStatus.BAD_REQUEST);
    await this.prisma.user.update({ where: { id: userId }, data: { roleId } });
    return this.findById(userId);
  }

  async updateCurrency(id: number, currency: string) {
    await this.prisma.user.update({ where: { id }, data: { currency } });
    return this.findById(id);
  }

  async updateEmail(id: number, email: string) {
    try {
      await this.prisma.user.update({ where: { id }, data: { email } });
      return this.findById(id);
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new HttpException('Email already in use.', HttpStatus.CONFLICT);
      }
      throw err;
    }
  }

  async delete(id: number) {
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { message: 'User deactivated.' };
  }

  async findUsersByRole(roleName: string) {
    const users = await this.prisma.user.findMany({
      where: { roleRelation: { name: roleName }, isActive: true },
      include: { roleRelation: true },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      role_name: u.roleRelation?.name,
    }));
  }

  async getPermissions(userId: number) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT permissions, single_limit, monthly_limit, data_scope FROM user_permissions WHERE user_id = ${userId}
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      permissions: r.permissions,
      single_limit: Number(r.single_limit),
      monthly_limit: Number(r.monthly_limit),
      data_scope: r.data_scope,
    };
  }

  async setPermissions(userId: number, data: any) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO user_permissions (user_id, permissions, single_limit, monthly_limit, data_scope)
       VALUES ($1, $2::jsonb, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         permissions = EXCLUDED.permissions,
         single_limit = EXCLUDED.single_limit,
         monthly_limit = EXCLUDED.monthly_limit,
         data_scope = EXCLUDED.data_scope,
         updated_at = NOW()`,
      userId,
      JSON.stringify(data.permissions || {}),
      Number(data.single_limit) || 10000,
      Number(data.monthly_limit) || 50000,
      data.data_scope || 'Department',
    );
    return this.getPermissions(userId);
  }

  // --- User Allocations ---
  async findAllAllocations(userId: number) {
    const allocations = await this.prisma.userAllocation.findMany({
      where: { userId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
    return allocations.map(a => ({
      id: a.id,
      user_id: a.userId,
      client_id: a.clientId,
      client_name: a.client.name,
      category: a.category,
      type: a.type,
      code: a.code,
      created_at: a.createdAt,
    }));
  }

  async createAllocation(userId: number, data: any) {
    const clientId = Number(data.client_id || data.clientId);
    const code = data.code || '';
    const category = data.category || 'Project';

    const existing = await this.prisma.userAllocation.findFirst({
      where: { userId, clientId, code, category },
    });
    if (existing) {
      throw new HttpException('This allocation already exists for the user.', HttpStatus.CONFLICT);
    }

    try {
      const a = await this.prisma.userAllocation.create({
        data: { userId, clientId, category, type: data.type || category, code },
      });
      return a;
    } catch (error) {
      this.logger.error('Error creating allocation', error?.stack ?? error);
      throw new HttpException(error?.message || 'Failed to create allocation', HttpStatus.BAD_REQUEST);
    }
  }

  async deleteAllocation(id: number) {
    await this.prisma.userAllocation.delete({ where: { id } });
    return true;
  }
}
