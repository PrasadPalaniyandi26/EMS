import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { BudgetsService } from './budgets.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

type Actor = { id: number; username?: string; role_name?: string };
const isFinance = (u: Actor) => ['ADMIN', 'FINANCE'].includes((u.role_name || '').toUpperCase());
// Managers see the lines they own; Admin and Finance see everything
const scopeOf = (u: Actor) => ((u.role_name || '').toUpperCase() === 'MANAGER' ? { ownerId: u.id } : {});

@ApiTags('budgets')
@Controller('v1/budgets')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class BudgetsController {
  constructor(private service: BudgetsService) {}

  // Open to every signed-in user: the headroom shown while booking an expense
  @Get('headroom')
  headroom(
    @Query('date') date?: string, @Query('contextType') contextType?: string, @Query('projectId') projectId?: string,
    @Query('productId') productId?: string, @Query('departmentId') departmentId?: string, @Query('categoryId') categoryId?: string,
    @Query('amount') amount?: string, @Query('excludeId') excludeId?: string, @Query('gstClaimable') gstClaimable?: string, @Query('netAmount') netAmount?: string,
  ) {
    return this.service.headroom({
      date, contextType, projectId: projectId ? Number(projectId) : undefined, productId: productId ? Number(productId) : undefined,
      departmentId: departmentId ? Number(departmentId) : undefined, categoryId: categoryId ? Number(categoryId) : undefined,
      amount: amount ? Number(amount) : undefined, excludeId: excludeId ? Number(excludeId) : undefined,
      gstClaimable: gstClaimable === 'true', netAmount: netAmount ? Number(netAmount) : undefined,
    });
  }

  @Get('impact')
  @Roles('admin', 'finance', 'manager')
  impact(@Query('ids') ids?: string) {
    return this.service.impactFor((ids ?? '').split(',').map(Number).filter((x) => x > 0));
  }

  @Get('settings')
  @Roles('admin', 'finance', 'manager')
  settings() { return this.service.readSettings(); }

  @Put('settings')
  @Roles('admin', 'finance')
  saveSettings(@Body() body: any, @CurrentUser('id') userId: number) { return this.service.saveSettings(body, userId); }

  @Get('plans')
  @Roles('admin', 'finance', 'manager')
  plans() { return this.service.listPlans(); }

  @Post('plans')
  @Roles('admin', 'finance')
  createPlan(@Body() body: any, @CurrentUser('id') userId: number) { return this.service.createPlan(body, userId); }

  @Get('plans/:fy')
  @Roles('admin', 'finance', 'manager')
  plan(@Param('fy', ParseIntPipe) fy: number, @CurrentUser() u: Actor) { return this.service.getPlan(fy, scopeOf(u)); }

  @Put('plans/:fy')
  @Roles('admin', 'finance')
  updatePlan(@Param('fy', ParseIntPipe) fy: number, @Body() body: any, @CurrentUser('id') userId: number) { return this.service.updatePlan(fy, body, userId); }

  @Delete('plans/:fy')
  @Roles('admin', 'finance')
  deletePlan(@Param('fy', ParseIntPipe) fy: number, @CurrentUser('id') userId: number) { return this.service.deletePlan(fy, userId); }

  @Post('plans/:fy/submit')
  @Roles('admin', 'finance', 'manager')
  submit(@Param('fy', ParseIntPipe) fy: number, @CurrentUser() u: Actor) { return this.service.submitPlan(fy, u); }

  @Post('plans/:fy/decision')
  @Roles('admin', 'finance')
  decide(@Param('fy', ParseIntPipe) fy: number, @Body() body: any, @CurrentUser() u: Actor) { return this.service.decidePlan(fy, body, u); }

  @Post('lines')
  @Roles('admin', 'finance', 'manager')
  createLine(@Body() body: any, @CurrentUser() u: Actor) { return this.service.createLine(body, u, isFinance(u)); }

  @Put('lines/:id')
  @Roles('admin', 'finance', 'manager')
  updateLine(@Param('id', ParseIntPipe) id: number, @Body() body: any, @CurrentUser() u: Actor) { return this.service.updateLine(id, body, u, isFinance(u)); }

  @Put('lines/:id/period')
  @Roles('admin', 'finance', 'manager')
  setPeriod(@Param('id', ParseIntPipe) id: number, @Body() body: any, @CurrentUser() u: Actor) { return this.service.setPeriod(id, body, u, isFinance(u)); }

  @Delete('lines/:id')
  @Roles('admin', 'finance', 'manager')
  deleteLine(@Param('id', ParseIntPipe) id: number, @Query('reason') reason: string | undefined, @CurrentUser() u: Actor) { return this.service.deleteLine(id, reason, u, isFinance(u)); }

  @Get('lines/:id')
  @Roles('admin', 'finance', 'manager')
  lineDetail(@Param('id', ParseIntPipe) id: number) { return this.service.lineDetail(id); }

  @Get('monitor')
  @Roles('admin', 'finance', 'manager')
  monitor(@Query('fy') fy: string | undefined, @CurrentUser() u: Actor) { return this.service.monitor(fy ? Number(fy) : undefined, scopeOf(u)); }

  @Get('alerts')
  @Roles('admin', 'finance', 'manager')
  alerts(@Query('status') status: string | undefined, @CurrentUser() u: Actor) { return this.service.listAlerts({ status, scope: scopeOf(u) }); }

  @Get('alerts/count')
  @Roles('admin', 'finance', 'manager')
  alertCount(@CurrentUser() u: Actor) { return this.service.openAlertCount(scopeOf(u)); }

  @Get('dashboard')
  @Roles('admin', 'finance', 'manager')
  dashboard() { return this.service.dashboardLines(); }
}
