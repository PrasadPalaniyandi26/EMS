import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, ParseIntPipe, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UpdateCurrencyDto, UpdateEmailDto } from './dto/user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller('v1/users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  async findAll(@CurrentUser() viewer: any) {
    return this.usersService.findAll(viewer);
  }

  // Must be before :id route to avoid ParseIntPipe matching 'managers' as an ID
  @Get('by-role/managers')
  async findManagers(@CurrentUser() viewer: any) {
    return this.usersService.findManagersAndAdmins(viewer);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() viewer: any) {
    return this.usersService.findById(id, viewer);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Put('me/profile')
  async updateOwnProfile(@CurrentUser('id') userId: number, @Body() dto: any) {
    // Only allow self-editable fields — block role/permission changes
    const allowed = ['username', 'login_name', 'contact_no', 'password'];
    const safe: any = {};
    for (const key of allowed) {
      if (dto[key] !== undefined) safe[key] = dto[key];
    }
    if (dto.currentPassword !== undefined) safe.currentPassword = dto.currentPassword;
    return this.usersService.updateOwnProfile(userId, safe);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async update(@CurrentUser('id') adminId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto, adminId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async delete(@CurrentUser('id') adminId: number, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.delete(id, adminId);
  }

  @Put(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async setRoles(@Param('id', ParseIntPipe) id: number, @Body('roles') roles: { roleId: number; isDefault: boolean }[]) {
    return this.usersService.setUserRoles(id, roles);
  }

  @Put(':id/switch-role')
  async switchRole(@Param('id', ParseIntPipe) id: number, @Body('roleId') roleId: number, @CurrentUser('id') currentUserId: number) {
    if (id !== currentUserId) {
      throw new ForbiddenException('Cannot switch roles for another user.');
    }
    return this.usersService.switchRole(id, roleId);
  }

  @Put(':id/currency')
  async updateCurrency(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCurrencyDto,
    @CurrentUser('id') currentUserId: number,
  ) {
    if (id !== currentUserId) throw new ForbiddenException('Cannot update another user\'s currency.');
    return this.usersService.updateCurrency(id, dto.currency);
  }

  @Put(':id/email')
  async updateEmail(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmailDto,
    @CurrentUser('id') currentUserId: number,
  ) {
    if (id !== currentUserId) throw new ForbiddenException('Cannot update another user\'s email.');
    return this.usersService.updateEmail(id, dto.email);
  }

  @Get(':id/permissions')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async getPermissions(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getPermissions(id);
  }

  @Put(':id/permissions')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async setPermissions(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
    return this.usersService.setPermissions(id, data);
  }

  // --- User Allocations ---
  @Get(':id/allocations')
  async findAllAllocations(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') currentUserId: number,
    @CurrentUser('role_name') roleName: string,
  ) {
    const role = (roleName || '').toUpperCase();
    if (id !== currentUserId && role === ROLES.EMPLOYEE) {
      throw new ForbiddenException('Cannot view another user\'s allocations.');
    }
    return this.usersService.findAllAllocations(id);
  }

  @Post(':id/allocations')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async createAllocation(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
    return this.usersService.createAllocation(id, data);
  }

  @Delete('allocations/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteAllocation(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.deleteAllocation(id);
  }
}
