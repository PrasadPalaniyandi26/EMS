import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClientsService } from './clients.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('clients')
@Controller('v1/clients')
@UseGuards(AuthGuard('jwt'))
export class ClientsController {
  constructor(private service: ClientsService) {}

  @Get()
  findAll() { return this.service.findAll(true); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  create(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.create({ ...body, createdBy: userId });
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  delete(@Param('id', ParseIntPipe) id: number) { return this.service.delete(id); }
}
