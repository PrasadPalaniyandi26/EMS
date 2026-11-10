import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { BuildOrdersService } from './build-orders.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

type Actor = { id: number; username?: string; role_name?: string };

// Build orders: a customer's commitment to have units of a standard product built and delivered
@ApiTags('build-orders')
@Controller('v1/build-orders')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'finance', 'manager', 'operations', 'configurator')
export class BuildOrdersController {
  constructor(private s: BuildOrdersService) {}

  @Get() list() { return this.s.list(); }
  @Get('options') options() { return this.s.options(); }
  @Get('cash') cash() { return this.s.cash(); }
  @Get('product-defaults') defaults(@Query('product_id') productId: string, @Query('quantity') quantity?: string, @Query('start_date') startDate?: string) { return this.s.defaults(Number(productId), Number(quantity), startDate || undefined); }
  // Anyone who can record an expense can choose the order it belongs to
  @Get('for-expense') @Roles('admin', 'finance', 'manager', 'employee', 'operations', 'configurator') forExpense(@Query('product_id') productId: string) { return this.s.forExpense(Number(productId)); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.s.get(id); }
  @Post() @Roles('admin', 'finance', 'operations') create(@Body() b: any, @CurrentUser() u: Actor) { return this.s.create(b, u); }
  @Put(':id') @Roles('admin', 'finance', 'operations') update(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.update(id, b, u); }
  @Delete(':id') @Roles('admin', 'finance', 'operations') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.remove(id, u); }
  @Post(':id/import-bom') @Roles('admin', 'finance', 'operations') importBom(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.importBom(id, b ?? {}, u); }
  @Post(':id/recost') @Roles('admin', 'finance', 'operations') recost(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.refreshCost(id, u); }
  @Post(':id/lines/:lid/swap') @Roles('admin', 'finance', 'operations') swap(@Param('id', ParseIntPipe) id: number, @Param('lid', ParseIntPipe) lid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.swap(id, lid, b, u); }
  @Post(':id/release') @Roles('admin', 'finance', 'operations') release(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.move(id, 'release', b ?? {}, u); }
  @Post(':id/reopen') @Roles('admin', 'finance', 'operations') reopen(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.move(id, 'reopen', b ?? {}, u); }
  @Post(':id/start') @Roles('admin', 'finance', 'operations') start(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.move(id, 'start', b ?? {}, u); }
  @Post(':id/deliver') @Roles('admin', 'finance') deliver(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.move(id, 'deliver', b ?? {}, u); }
  @Post(':id/cancel') @Roles('admin', 'finance') cancel(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.move(id, 'cancel', b ?? {}, u); }
}
