import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesService } from './roles.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('roles')
@Controller('v1/roles')
@UseGuards(AuthGuard('jwt'))
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }
}
