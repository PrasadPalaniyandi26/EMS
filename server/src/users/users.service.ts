import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { ROLES } from '../common/constants/roles';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private normalizeStatus(raw?: string): string {
    if (!raw) return 'ACTIVE';
    const s = raw.trim().toLowerCase();
    if (s === 'on hold' || s === 'on_hold') return 'ON_HOLD';
    if (s === 'inactive' || s === 'in active' || s === 'in_active') return 'INACTIVE';
    return 'ACTIVE';
  }

  private mapUser(user: any) {
    return {
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
      contact_no: user.contactNo ?? null,
      house_apt: user.houseApt ?? null,
      address: user.address ?? null,
      city: user.city ?? null,
      country: user.country ?? null,
      postal_code: user.postalCode ?? null,
      state: user.state ?? null,
      user_status: !user.isActive ? 'INACTIVE' : (user.userStatus ? this.normalizeStatus(user.userStatus) : 'ACTIVE'),
      user_status_label: !user.isActive ? 'Inactive' : (this.normalizeStatus(user.userStatus) === 'ON_HOLD' ? 'On Hold' : 'Active'),
      date_of_birth: user.dateOfBirth ?? null,
      login_name: user.loginName ?? null,
    };
  }

  private readonly userInclude = {
    roleRelation: true,
    manager: true,
    userRoles: { include: { role: true } },
  } as const;

  // Personal details are visible only to the user themself, Admin, and a Manager for their direct reports.
  // Everyone else gets the directory fields needed for pickers and the team list.
  private redactFor(mapped: ReturnType<UsersService['mapUser']>, viewer?: { id: number; role_name?: string }) {
    if (!viewer) return mapped;
    const role = (viewer.role_name || '').toUpperCase();
    if (mapped.id === viewer.id || role === ROLES.ADMIN) return mapped;
    if (role === ROLES.MANAGER && mapped.manager_id === viewer.id) return mapped;
    const {
      email, contact_no, house_apt, address, city, state, country, postal_code,
      date_of_birth, joining_date, clearance_level, login_name, created_at,
      ...directory
    } = mapped;
    return directory;
  }

  async findAll(viewer?: { id: number; role_name?: string }) {
    const users = await this.prisma.user.findMany({
      include: this.userInclude,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.redactFor(this.mapUser(u), viewer));
  }

  async findById(id: number, viewer?: { id: number; role_name?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: this.userInclude,
    });
    if (!user) throw new HttpException('User not found.', HttpStatus.NOT_FOUND);
    return this.redactFor(this.mapUser(user), viewer);
  }

  async create(dto: any) {
    const password = dto.password || crypto.randomBytes(12).toString('base64url');
    const hash = await bcrypt.hash(password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          passwordHash: hash,
          role: dto.role || 'user',
          roleId: dto.role_id ? Number(dto.role_id) : (dto.roleId ? Number(dto.roleId) : null),
          managerId: dto.reporting_manager_id ? Number(dto.reporting_manager_id) : (dto.manager_id ? Number(dto.manager_id) : null),
          department: dto.department || null,
          clearanceLevel: dto.clearance_level || dto.clearanceLevel || 'Level 1',
          joiningDate: dto.joining_date ? new Date(dto.joining_date) : null,
          contactNo: dto.contact_no || null,
          houseApt: dto.house_apt || null,
          address: dto.address || null,
          city: dto.city || null,
          country: dto.country || null,
          postalCode: dto.postal_code || null,
          state: dto.state || null,
          userStatus: this.normalizeStatus(dto.status),
          dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
          loginName: dto.login_name ? dto.login_name.toLowerCase().trim() : null,
        },
      });

      if (dto.roles && Array.isArray(dto.roles) && dto.roles.length > 0) {
        await this.setUserRoles(user.id, dto.roles);
      } else if (user.roleId) {
        await this.prisma.userRole.create({
          data: { userId: user.id, roleId: user.roleId, isDefault: true },
        });
      }

      const created: any = await this.findById(user.id); // no viewer: full record, not redacted
      this.audit.log({
        tableName: 'users', recordId: user.id,
        action: 'CREATE', changedBy: user.id,
        newValues: { username: created.username, email: created.email, role_name: created.role_name },
      }).catch((e: any) => this.logger.warn('Audit log failed on user create', e?.message));
      return created;
    } catch (err: any) {
      if (err.code === 'P2002') {
        const target = err.meta?.target || '';
        const field = target.includes('email') ? 'email' : target.includes('login_name') ? 'username (login name)' : 'username';
        throw new HttpException(`A user with this ${field} already exists.`, HttpStatus.CONFLICT);
      }
      this.logger.error('Error creating user', err?.stack ?? err);
      throw err;
    }
  }

  async update(id: number, dto: any, changedBy?: number) {
    const oldSnapshot = await this.findById(id).catch(() => null);
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

    if (dto.contact_no !== undefined) data.contactNo = dto.contact_no || null;
    if (dto.house_apt !== undefined) data.houseApt = dto.house_apt || null;
    if (dto.address !== undefined) data.address = dto.address || null;
    if (dto.city !== undefined) data.city = dto.city || null;
    if (dto.country !== undefined) data.country = dto.country || null;
    if (dto.postal_code !== undefined) data.postalCode = dto.postal_code || null;
    if (dto.state !== undefined) data.state = dto.state || null;
    if (dto.status !== undefined || dto.user_status !== undefined)
      data.userStatus = this.normalizeStatus(dto.status || dto.user_status);
    if (dto.date_of_birth !== undefined)
      data.dateOfBirth = dto.date_of_birth ? new Date(dto.date_of_birth) : null;

    if (dto.login_name !== undefined)
      data.loginName = dto.login_name ? dto.login_name.toLowerCase().trim() : null;

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    try {
      await this.prisma.user.update({ where: { id }, data });

      if (dto.roles && Array.isArray(dto.roles) && dto.roles.length > 0) {
        await this.setUserRoles(id, dto.roles);
      }

      const updated = await this.findById(id);
      this.audit.log({
        tableName: 'users', recordId: id,
        action: 'UPDATE', changedBy: changedBy ?? id,
        oldValues: oldSnapshot, newValues: updated,
      }).catch((e: any) => this.logger.warn('Audit log failed on user update', e?.message));
      return updated;
    } catch (err: any) {
      if (err.code === 'P2002') {
        const target = err.meta?.target || '';
        const field = target.includes('email') ? 'email' : target.includes('login_name') ? 'username (login name)' : 'username';
        throw new HttpException(`A user with this ${field} already exists.`, HttpStatus.CONFLICT);
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

  async delete(id: number, changedBy?: number) {
    const existing = await this.prisma.user.findUnique({ where: { id }, select: { username: true, email: true } });
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    this.audit.log({
      tableName: 'users', recordId: id,
      action: 'DELETE', changedBy: changedBy ?? id,
      oldValues: { username: existing?.username, is_active: true },
      newValues: { is_active: false, status: 'DEACTIVATED' },
    }).catch((e: any) => this.logger.warn('Audit log failed on user deactivate', e?.message));
    return { message: 'User deactivated.' };
  }

  async findManagersAndAdmins(viewer?: { id: number; role_name?: string }) {
    const showEmail = (viewer?.role_name || '').toUpperCase() === ROLES.ADMIN;
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT DISTINCT u.id, u.username, u.email, u.role, def_r.role_name
      FROM users u
      LEFT JOIN roles def_r ON u.role_id = def_r.role_id
      WHERE u.user_status != 'INACTIVE'
        AND (
          def_r.role_name IN ('MANAGER', 'ADMIN')
          OR EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.role_id
            WHERE ur.user_id = u.id AND r.role_name IN ('MANAGER', 'ADMIN')
          )
        )
      ORDER BY u.username
    `;
    return rows.map((u) => ({
      id: u.id,
      username: u.username,
      email: showEmail || !viewer ? u.email : undefined,
      role: u.role,
      role_name: u.role_name,
    }));
  }

  async updateOwnProfile(userId: number, dto: any) {
    if (dto.password) {
      if (!dto.currentPassword) {
        throw new HttpException('Current password is required to set a new password.', HttpStatus.BAD_REQUEST);
      }
      const existing = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      const matches = existing?.passwordHash
        ? await bcrypt.compare(dto.currentPassword, existing.passwordHash)
        : false;
      if (!matches) {
        throw new HttpException('Current password is incorrect.', HttpStatus.UNAUTHORIZED);
      }
    }
    return this.update(userId, dto, userId);
  }

  async getPermissions(userId: number) {
    const perm = await this.prisma.userPermission.findUnique({ where: { userId } });
    if (!perm) return null;
    return {
      permissions: perm.permissions,
      single_limit: Number(perm.singleLimit),
      monthly_limit: Number(perm.monthlyLimit),
      data_scope: perm.dataScope,
    };
  }

  async setPermissions(userId: number, data: any) {
    // Raw SQL needed: Prisma doesn't support ON CONFLICT upsert with ::jsonb cast cleanly
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

  async findAllAllocations(userId: number) {
    const allocations = await this.prisma.userAllocation.findMany({
      where: { userId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
    return allocations.map((a) => ({
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
      return await this.prisma.userAllocation.create({
        data: { userId, clientId, category, type: data.type || category, code },
      });
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
