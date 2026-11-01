import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { BudgetPlanningService } from './budget-planning.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

type Actor = { id: number; username?: string; role_name?: string };

// Rates, items, project estimates, product costing, budget changes and the monthly close
@ApiTags('budget-planning')
@Controller('v1/budgets')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'finance', 'manager')
export class BudgetPlanningController {
  constructor(private s: BudgetPlanningService) {}

  // Rate cards and overhead rates
  @Get('rates') rates() { return this.s.rates(); }
  @Post('rate-cards/import') @Roles('admin', 'finance') importCards(@Body() b: any, @CurrentUser() u: Actor) { return this.s.importRates(b, u); }
  @Post('rate-cards') @Roles('admin', 'finance') addCard(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveRateCard(null, b, u); }
  @Put('rate-cards/:id') @Roles('admin', 'finance') editCard(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveRateCard(id, b, u); }
  @Delete('rate-cards/:id') @Roles('admin', 'finance') delCard(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.removeRateCard(id, u); }
  @Post('overhead-rates') @Roles('admin', 'finance') addOh(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOverhead(null, b, u); }
  @Put('overhead-rates/:id') @Roles('admin', 'finance') editOh(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOverhead(id, b, u); }
  @Put('overhead-base/:fy') @Roles('admin', 'finance') setOverheadBase(@Param('fy', ParseIntPipe) fy: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOverheadBase(fy, b, u); }
  @Delete('overhead-rates/:id') @Roles('admin', 'finance') delOh(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.removeOverhead(id, u); }

  // Item master
  @Get('items') items() { return this.s.items(); }
  @Get('item-categories') itemCategories() { return this.s.itemCategories(); }
  @Post('item-categories') @Roles('admin', 'finance') addItemCategory(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveItemCategory(null, b, u); }
  @Put('item-categories/:id') @Roles('admin', 'finance') editItemCategory(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveItemCategory(id, b, u); }
  @Delete('item-categories/:id') @Roles('admin', 'finance') delItemCategory(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.removeItemCategory(id, u); }
  @Post('items/import') @Roles('admin', 'finance') importItems(@Body() b: any, @CurrentUser() u: Actor) { return this.s.importItems(b, u); }
  @Post('items') @Roles('admin', 'finance') addItem(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveItem(null, b, u); }
  @Put('items/:id') @Roles('admin', 'finance') editItem(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveItem(id, b, u); }
  @Delete('items/:id') @Roles('admin', 'finance') delItem(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.removeItem(id, u); }
  @Get('items/:id/prices') itemPrices(@Param('id', ParseIntPipe) id: number) { return this.s.itemPrices(id); }
  @Post('items/:id/purchase') @Roles('admin', 'finance') purchase(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.recordPurchase(id, b, u); }
  @Get('items/:id/usage') itemUsage(@Param('id', ParseIntPipe) id: number) { return this.s.itemUsage(id); }

  // Projects
  @Get('projects') projects() { return this.s.projects(); }
  @Get('projects/:id') project(@Param('id', ParseIntPipe) id: number) { return this.s.project(id); }
  @Put('projects/:id/settings') projectSettings(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveProjectSettings(id, b, u); }
  @Post('projects/:id/estimate-lines') addEst(@Param('id', ParseIntPipe) id: number, @Body() b: any) { return this.s.saveEstimateLine(id, null, b); }
  @Put('projects/:id/estimate-lines/:lineId') editEst(@Param('id', ParseIntPipe) id: number, @Param('lineId', ParseIntPipe) lineId: number, @Body() b: any) { return this.s.saveEstimateLine(id, lineId, b); }
  @Get('estimate-phases') estimatePhases() { return this.s.estimatePhases(); }
  @Post('estimate-phases') @Roles('admin', 'finance') addPhase(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveEstimatePhase(null, b, u); }
  @Put('estimate-phases/:id') @Roles('admin', 'finance') editPhase(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveEstimatePhase(id, b, u); }
  @Delete('estimate-phases/:id') @Roles('admin', 'finance') delPhase(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.removeEstimatePhase(id, u); }
  @Delete('estimate-lines/:lineId') delEst(@Param('lineId', ParseIntPipe) lineId: number) { return this.s.removeEstimateLine(lineId); }
  @Post('projects/:id/baseline') @Roles('admin', 'finance') proposeBaseline(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.proposeBaseline(id, u); }
  @Post('baselines/:id/approve') @Roles('admin', 'finance') approveBaseline(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.approveBaseline(id, u); }
  @Post('baselines/:id/reject') @Roles('admin', 'finance') rejectBaseline(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.rejectBaseline(id, b, u); }
  @Post('projects/:id/milestones') addMs(@Param('id', ParseIntPipe) id: number, @Body() b: any) { return this.s.saveMilestone(id, null, b); }
  @Put('projects/:id/milestones/:mid') editMs(@Param('id', ParseIntPipe) id: number, @Param('mid', ParseIntPipe) mid: number, @Body() b: any) { return this.s.saveMilestone(id, mid, b); }
  @Delete('milestones/:mid') delMs(@Param('mid', ParseIntPipe) mid: number) { return this.s.removeMilestone(mid); }

  // Job BOM: the build behind a bespoke project
  @Get('projects/:id/job-bom') jobBom(@Param('id', ParseIntPipe) id: number) { return this.s.jobBom(id); }
  @Put('projects/:id/job-bom') @Roles('admin', 'finance') jobBomSettings(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveJobBomSettings(id, b, u); }
  @Post('projects/:id/job-bom/lines') addJobLine(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBomLine({ projectId: id }, null, b, u); }
  @Put('projects/:id/job-bom/lines/:lid') editJobLine(@Param('id', ParseIntPipe) id: number, @Param('lid', ParseIntPipe) lid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBomLine({ projectId: id }, lid, b, u); }
  @Post('job-bom/lines/:lid/refresh') refreshJobLine(@Param('lid', ParseIntPipe) lid: number) { return this.s.refreshJobSub(lid); }
  @Post('projects/:id/job-bom/operations') addJobOp(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperation({ projectId: id }, null, b, u); }
  @Put('projects/:id/job-bom/operations/:oid') editJobOp(@Param('id', ParseIntPipe) id: number, @Param('oid', ParseIntPipe) oid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperation({ projectId: id }, oid, b, u); }

  // Products
  @Get('products') products() { return this.s.products(); }
  @Get('products/:id') product(@Param('id', ParseIntPipe) id: number) { return this.s.product(id); }
  @Put('products/:id/bom') @Roles('admin', 'finance') bomSettings(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBomSettings(id, b, u); }
  @Post('products/:id/bom-lines') @Roles('admin', 'finance') addBl(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBomLine(id, null, b, u); }
  @Put('products/:id/bom-lines/:lid') @Roles('admin', 'finance') editBl(@Param('id', ParseIntPipe) id: number, @Param('lid', ParseIntPipe) lid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBomLine(id, lid, b, u); }
  @Delete('bom-lines/:lid') delBl(@Param('lid', ParseIntPipe) lid: number, @CurrentUser() u: Actor) { return this.s.removeBomLine(lid, u); }
  @Post('products/:id/operations') @Roles('admin', 'finance') addOp(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperation(id, null, b, u); }
  @Put('products/:id/operations/:oid') @Roles('admin', 'finance') editOp(@Param('id', ParseIntPipe) id: number, @Param('oid', ParseIntPipe) oid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperation(id, oid, b, u); }
  @Delete('operations/:oid') delOp(@Param('oid', ParseIntPipe) oid: number, @CurrentUser() u: Actor) { return this.s.removeOperation(oid, u); }
  @Post('operation-types') @Roles('admin', 'finance') addOpType(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperationType(null, b, u); }
  @Put('operation-types/:tid') @Roles('admin', 'finance') editOpType(@Param('tid', ParseIntPipe) tid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperationType(tid, b, u); }
  @Delete('operation-types/:tid') @Roles('admin', 'finance') delOpType(@Param('tid', ParseIntPipe) tid: number, @CurrentUser() u: Actor) { return this.s.removeOperationType(tid, u); }
  @Put('products/:id/build-plan') buildPlan(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBuildPlan(id, b, u); }
  @Put('products/:id/price') @Roles('admin', 'finance') price(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveProductPrice(id, b, u); }
  @Post('products/:id/standard-cost') @Roles('admin', 'finance') propose(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.proposeStandard(id, u); }
  @Post('standard-costs/:sid/approve') @Roles('admin', 'finance') approveStd(@Param('sid', ParseIntPipe) sid: number, @CurrentUser() u: Actor) { return this.s.approveStandard(sid, u); }
  @Post('standard-costs/:sid/reject') @Roles('admin', 'finance') rejectStd(@Param('sid', ParseIntPipe) sid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.rejectStandard(sid, b, u); }
  @Post('products/:id/to-plan') @Roles('admin', 'finance') toPlan(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.buildToPlan(id, u); }

  // Changes
  @Get('changes') changes(@Query('status') status?: string) { return this.s.changes(status); }
  @Post('changes') requestChange(@Body() b: any, @CurrentUser() u: Actor) { return this.s.requestChange(b, u); }
  @Post('changes/:id/decision') @Roles('admin', 'finance') decide(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.decideChange(id, b, u); }
  @Delete('changes/:id') cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.cancelChange(id, u); }

  // Monthly close
  @Get('close') close(@Query('year') year: string, @Query('month') month: string) { return this.s.close(Number(year), Number(month)); }
  @Post('close/variance') variance(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveVariance(b, u); }
  @Post('close/lock') @Roles('admin', 'finance') lock(@Body() b: any, @CurrentUser() u: Actor) { return this.s.lockMonth(Number(b.year), Number(b.month), u); }
  @Post('close/unlock') @Roles('admin') unlock(@Body() b: any, @CurrentUser() u: Actor) { return this.s.unlockMonth(Number(b.year), Number(b.month), u); }
}
