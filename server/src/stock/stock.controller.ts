import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

type Actor = { id: number; username?: string };

const VIEW = ['admin', 'finance', 'manager', 'operations', 'configurator'];
const RECORD = ['admin', 'finance', 'operations', 'configurator'];   // stock used, count quantities, stock settings
const APPROVE = ['admin', 'finance'];                               // opening stock and count approval

@ApiTags('stock')
@Controller('v1/stock')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class StockController {
  constructor(private s: StockService) {}

  // Open to every signed-in user: the parts a stock purchase can name (no money)
  @Get('parts') parts() { return this.s.parts(); }

  @Get('on-hand') @Roles(...VIEW) onHand(@Query('asOf') asOf?: string) { return this.s.onHand(asOf); }
  @Get('moves') @Roles(...VIEW)
  moves(@Query('itemId') itemId?: string, @Query('projectId') projectId?: string, @Query('buildOrderId') buildOrderId?: string, @Query('kind') kind?: string) {
    return this.s.moves({ itemId, projectId, buildOrderId, kind });
  }
  @Get('job') @Roles(...VIEW) job(@Query('projectId') projectId?: string, @Query('buildOrderId') buildOrderId?: string) { return this.s.job({ projectId, buildOrderId }); }

  @Put('items/:id/settings') @Roles(...RECORD) settings(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveSettings(id, b, u); }
  @Post('items/:id/use-average') @Roles('admin', 'finance', 'configurator') useAverage(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.useAverage(id, u); }
  @Post('opening') @Roles(...APPROVE) opening(@Body() b: any, @CurrentUser() u: Actor) { return this.s.opening(b, u); }

  @Post('used') @Roles(...RECORD) addUsed(@Body() b: any, @CurrentUser() u: Actor) { return this.s.addUsed(b, u); }
  @Put('used/:id') @Roles(...RECORD) editUsed(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.editUsed(id, b, u); }
  @Post('used/:id/correction') @Roles(...RECORD) correct(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.correct(id, b, u); }

  @Get('counts') @Roles(...VIEW) counts() { return this.s.counts(); }
  @Get('counts/:id') @Roles(...VIEW) count(@Param('id', ParseIntPipe) id: number) { return this.s.count(id); }
  @Post('counts') @Roles(...RECORD) createCount(@Body() b: any, @CurrentUser() u: Actor) { return this.s.createCount(b, u); }
  @Put('counts/:id') @Roles(...RECORD) saveCount(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveCount(id, b, u); }
  @Post('counts/:id/submit') @Roles(...RECORD) submitCount(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.submitCount(id, u); }
  @Post('counts/:id/decision') @Roles(...APPROVE) decide(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.decideCount(id, b, u); }
  @Delete('counts/:id') @Roles(...RECORD) deleteCount(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.deleteCount(id, u); }
}
