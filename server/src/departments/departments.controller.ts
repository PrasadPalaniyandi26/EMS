import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('departments')
@Controller('v1/departments')
@UseGuards(AuthGuard('jwt'))
export class DepartmentsController {
  constructor(private service: DepartmentsService) {}

  @Get() findAll() { return this.service.findAll(); }
  @Get('usage') usage() { return this.service.usage(); }
  @Post() @UseGuards(RolesGuard) @Roles('admin')
  create(@Body('name') name: string, @CurrentUser('id') userId: number) { return this.service.create(name, userId); }
  @Put(':id') @UseGuards(RolesGuard) @Roles('admin')
  rename(@Param('id', ParseIntPipe) id: number, @Body('name') name: string) { return this.service.rename(id, name); }
  @Delete(':id') @UseGuards(RolesGuard) @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
