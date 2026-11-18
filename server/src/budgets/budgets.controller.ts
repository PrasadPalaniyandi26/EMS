import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { BudgetsService } from './budgets.service';
import { LineSuggestionService } from './line-suggestion.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

type Actor = { id: number; username?: string; role_name?: string };
const isFinance = (u: Actor) => ['ADMIN', 'FINANCE'].includes((u.role_name || '').toUpperCase());
// Managers see the lines they own; Admin, Finance, Operations and Configurator see everything
const scopeOf = (u: Actor) => ((u.role_name || '').toUpperCase() === 'MANAGER' ? { ownerId: u.id } : {});

// Who reads the budget, and who prepares it (plans, lines, requests). Approving stays with Finance and Admin.
const READ = ['admin', 'finance', 'manager', 'operations', 'configurator'];
const PREPARE = ['admin', 'finance', 'manager', 'operations'];

@ApiTags('budgets')
@Controller('v1/budgets')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class BudgetsController {
  constructor(private service: BudgetsService, private suggestions: LineSuggestionService) {}

  // Open to every signed-in user: the headroom shown while booking an expense
  @Get('headroom')
  headroom(
    @Query('date') date?: string, @Query('contextType') contextType?: string, @Query('projectId') projectId?: string,
    @Query('productId') productId?: string, @Query('departmentId') departmentId?: string, @Query('buildOrderId') buildOrderId?: string, @Query('categoryId') categoryId?: string,
    @Query('amount') amount?: string, @Query('excludeId') excludeId?: string, @Query('gstClaimable') gstClaimable?: string, @Query('netAmount') netAmount?: string,
  ) {
    return this.service.headroom({
      date, contextType, projectId: projectId ? Number(projectId) : undefined, productId: productId ? Number(productId) : undefined,
      departmentId: departmentId ? Number(departmentId) : undefined, buildOrderId: buildOrderId ? Number(buildOrderId) : undefined, categoryId: categoryId ? Number(categoryId) : undefined,
      amount: amount ? Number(amount) : undefined, excludeId: excludeId ? Number(excludeId) : undefined,
      gstClaimable: gstClaimable === 'true', netAmount: netAmount ? Number(netAmount) : undefined,
    });
  }

  // A starting amount for a new budget line: from the order, the product's build plan, the project's estimate, or last year's overhead spend
  @Get('line-suggestion')
  @Roles(...PREPARE)
  lineSuggestion(@Query('cost_object') costObject?: string, @Query('object_id') objectId?: string, @Query('type_id') typeId?: string, @Query('fy') fy?: string) {
    return this.suggestions.suggest({ cost_object: costObject, object_id: objectId, type_id: typeId, fy });
  }

  // Open to every signed-in user: where the financial year starts, so date presets follow it
  @Get('fiscal-year')
  fiscalYear() { return this.service.fiscalYear(); }

  @Get('impact')
  @Roles('admin', 'finance', 'manager')
  impact(@Query('ids') ids?: string) {
    return this.service.impactFor((ids ?? '').split(',').map(Number).filter((x) => x > 0));
  }

  @Get('settings')
  @Roles(...READ)
  settings() { return this.service.readSettings(); }

  @Put('settings')
  @Roles('admin', 'finance')
  saveSettings(@Body() body: any, @CurrentUser('id') userId: number) { return this.service.saveSettings(body, userId); }

  @Get('plans')
  @Roles(...READ)
  plans() { return this.service.listPlans(); }

  @Post('plans')
  @Roles('admin', 'finance', 'operations')
  createPlan(@Body() body: any, @CurrentUser('id') userId: number) { return this.service.createPlan(body, userId); }

  @Get('plans/:fy')
  @Roles(...READ)
  plan(@Param('fy', ParseIntPipe) fy: number, @CurrentUser() u: Actor) { return this.service.getPlan(fy, scopeOf(u)); }

  @Put('plans/:fy')
  @Roles('admin', 'finance', 'operations')
  updatePlan(@Param('fy', ParseIntPipe) fy: number, @Body() body: any, @CurrentUser('id') userId: number) { return this.service.updatePlan(fy, body, userId); }

  @Delete('plans/:fy')
  @Roles('admin', 'finance')
  deletePlan(@Param('fy', ParseIntPipe) fy: number, @CurrentUser('id') userId: number) { return this.service.deletePlan(fy, userId); }

  @Post('plans/:fy/submit')
  @Roles(...PREPARE)
  submit(@Param('fy', ParseIntPipe) fy: number, @CurrentUser() u: Actor) { return this.service.submitPlan(fy, u); }

  @Post('plans/:fy/decision')
  @Roles('admin', 'finance')
  decide(@Param('fy', ParseIntPipe) fy: number, @Body() body: any, @CurrentUser() u: Actor) { return this.service.decidePlan(fy, body, u); }

  @Post('lines')
  @Roles(...PREPARE)
  createLine(@Body() body: any, @CurrentUser() u: Actor) { return this.service.createLine(body, u, isFinance(u)); }

  @Put('lines/:id')
  @Roles(...PREPARE)
  updateLine(@Param('id', ParseIntPipe) id: number, @Body() body: any, @CurrentUser() u: Actor) { return this.service.updateLine(id, body, u, isFinance(u)); }

  @Put('lines/:id/period')
  @Roles(...PREPARE)
  setPeriod(@Param('id', ParseIntPipe) id: number, @Body() body: any, @CurrentUser() u: Actor) { return this.service.setPeriod(id, body, u, isFinance(u)); }

  @Delete('lines/:id')
  @Roles(...PREPARE)
  deleteLine(@Param('id', ParseIntPipe) id: number, @Query('reason') reason: string | undefined, @CurrentUser() u: Actor) { return this.service.deleteLine(id, reason, u, isFinance(u)); }

  @Get('lines/:id')
  @Roles(...READ)
  lineDetail(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.service.lineDetail(id, scopeOf(u)); }

  @Get('monitor')
  @Roles(...READ)
  monitor(@Query('fy') fy: string | undefined, @CurrentUser() u: Actor) { return this.service.monitor(fy ? Number(fy) : undefined, scopeOf(u)); }

  @Get('alerts')
  @Roles(...READ)
  alerts(@Query('status') status: string | undefined, @CurrentUser() u: Actor) { return this.service.listAlerts({ status, scope: scopeOf(u) }); }

  @Get('alerts/count')
  @Roles(...READ)
  alertCount(@CurrentUser() u: Actor) { return this.service.openAlertCount(scopeOf(u)); }

  @Get('dashboard')
  @Roles(...READ)
  dashboard() { return this.service.dashboardLines(); }
}
