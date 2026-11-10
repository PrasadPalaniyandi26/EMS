import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { BudgetPlanningService } from './budget-planning.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

type Actor = { id: number; username?: string; role_name?: string };

// Who may change what. Approving money stays with Finance and Admin on every route that has an approval step.
const CONFIGURE = ['admin', 'finance', 'configurator'];                          // parts, categories, operation types, product BOMs and operations
const BOM = ['admin', 'finance', 'manager', 'operations', 'configurator'];      // job BOMs and removing BOM lines and operations
const PLAN = ['admin', 'finance', 'manager', 'operations'];                      // estimates, milestones, build plans, change requests, variances
const PROPOSE = ['admin', 'finance', 'operations'];                              // proposals that Finance then approves

// Rates, items, project estimates, product costing, budget changes and the monthly close
@ApiTags('budget-planning')
@Controller('v1/budgets')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'finance', 'manager', 'operations', 'configurator')
export class BudgetPlanningController {
  constructor(private s: BudgetPlanningService) {}

  // Rate cards and overhead rates: everyone here reads them, Finance and Admin change them
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
  @Get('items') items(@Query('all') all?: string) { return this.s.items(all === '1' || all === 'true'); }
  @Get('item-categories') itemCategories() { return this.s.itemCategories(); }
  @Post('item-categories') @Roles(...CONFIGURE) addItemCategory(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveItemCategory(null, b, u); }
  @Put('item-categories/:id') @Roles(...CONFIGURE) editItemCategory(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveItemCategory(id, b, u); }
  @Delete('item-categories/:id') @Roles(...CONFIGURE) delItemCategory(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.removeItemCategory(id, u); }
  @Post('items/import') @Roles(...CONFIGURE) importItems(@Body() b: any, @CurrentUser() u: Actor) { return this.s.importItems(b, u); }
  @Post('items') @Roles(...CONFIGURE) addItem(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveItem(null, b, u); }
  @Put('items/:id') @Roles(...CONFIGURE) editItem(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveItem(id, b, u); }
  @Delete('items/:id') @Roles(...CONFIGURE) delItem(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.removeItem(id, u); }
  @Get('items/:id/prices') itemPrices(@Param('id', ParseIntPipe) id: number) { return this.s.itemPrices(id); }
  @Post('items/:id/purchase') @Roles('admin', 'finance') purchase(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.recordPurchase(id, b, u); }
  @Post('items/:id/replace') @Roles(...CONFIGURE) replacePart(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.replacePart(id, b, u); }
  @Delete('part-replacements/:rid') @Roles(...CONFIGURE) cancelReplacement(@Param('rid', ParseIntPipe) rid: number, @CurrentUser() u: Actor) { return this.s.cancelReplacement(rid, u); }
  @Get('items/:id/history') partHistory(@Param('id', ParseIntPipe) id: number) { return this.s.partHistory(id); }
  @Post('items/:id/alternates') @Roles(...CONFIGURE) addAlternate(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.addAlternate(id, b, u); }
  @Put('items/:id/default-alternate') @Roles(...CONFIGURE) defaultAlternate(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.setDefaultAlternate(id, u); }
  @Delete('items/:id/alternates') @Roles(...CONFIGURE) removeAlternate(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.removeAlternate(id, u); }
  @Get('items/:id/usage') itemUsage(@Param('id', ParseIntPipe) id: number) { return this.s.itemUsage(id); }

  // Projects
  @Get('projects') projects() { return this.s.projects(); }
  @Get('projects/:id') project(@Param('id', ParseIntPipe) id: number) { return this.s.project(id); }
  @Put('projects/:id/settings') @Roles(...PLAN) projectSettings(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveProjectSettings(id, b, u); }
  @Post('projects/:id/estimate-lines') @Roles(...PLAN) addEst(@Param('id', ParseIntPipe) id: number, @Body() b: any) { return this.s.saveEstimateLine(id, null, b); }
  @Put('projects/:id/estimate-lines/:lineId') @Roles(...PLAN) editEst(@Param('id', ParseIntPipe) id: number, @Param('lineId', ParseIntPipe) lineId: number, @Body() b: any) { return this.s.saveEstimateLine(id, lineId, b); }
  @Get('estimate-phases') estimatePhases() { return this.s.estimatePhases(); }
  @Post('estimate-phases') @Roles(...PROPOSE) addPhase(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveEstimatePhase(null, b, u); }
  @Put('estimate-phases/:id') @Roles(...PROPOSE) editPhase(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveEstimatePhase(id, b, u); }
  @Delete('estimate-phases/:id') @Roles(...PROPOSE) delPhase(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.removeEstimatePhase(id, u); }
  @Delete('estimate-lines/:lineId') @Roles(...PLAN) delEst(@Param('lineId', ParseIntPipe) lineId: number) { return this.s.removeEstimateLine(lineId); }
  @Post('projects/:id/baseline') @Roles(...PROPOSE) proposeBaseline(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.proposeBaseline(id, u); }
  @Post('baselines/:id/approve') @Roles('admin', 'finance') approveBaseline(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.approveBaseline(id, u); }
  @Post('baselines/:id/reject') @Roles('admin', 'finance') rejectBaseline(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.rejectBaseline(id, b, u); }
  @Post('projects/:id/milestones') @Roles(...PLAN) addMs(@Param('id', ParseIntPipe) id: number, @Body() b: any) { return this.s.saveMilestone(id, null, b); }
  @Put('projects/:id/milestones/:mid') @Roles(...PLAN) editMs(@Param('id', ParseIntPipe) id: number, @Param('mid', ParseIntPipe) mid: number, @Body() b: any) { return this.s.saveMilestone(id, mid, b); }
  @Delete('milestones/:mid') @Roles(...PLAN) delMs(@Param('mid', ParseIntPipe) mid: number) { return this.s.removeMilestone(mid); }

  // Job BOM: the build behind a bespoke project
  @Get('projects/:id/job-bom') jobBom(@Param('id', ParseIntPipe) id: number) { return this.s.jobBom(id); }
  @Put('projects/:id/job-bom') @Roles('admin', 'finance') jobBomSettings(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveJobBomSettings(id, b, u); }
  @Post('projects/:id/job-bom/lines') @Roles(...BOM) addJobLine(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBomLine({ projectId: id }, null, b, u); }
  @Put('projects/:id/job-bom/lines/:lid') @Roles(...BOM) editJobLine(@Param('id', ParseIntPipe) id: number, @Param('lid', ParseIntPipe) lid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBomLine({ projectId: id }, lid, b, u); }
  @Post('projects/:id/job-bom/import') @Roles(...BOM) importJobBom(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.importJobBom(id, b, u); }
  @Post('projects/:id/job-bom/parts') @Roles(...BOM) addProjectPart(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.addProjectPart(id, b, u); }
  @Post('projects/:id/job-bom/operations') @Roles(...BOM) addJobOp(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperation({ projectId: id }, null, b, u); }
  @Put('projects/:id/job-bom/operations/:oid') @Roles(...BOM) editJobOp(@Param('id', ParseIntPipe) id: number, @Param('oid', ParseIntPipe) oid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperation({ projectId: id }, oid, b, u); }

  // Products
  @Get('products') products() { return this.s.products(); }
  @Get('products/:id') product(@Param('id', ParseIntPipe) id: number) { return this.s.product(id); }
  @Put('products/:id/bom') @Roles('admin', 'finance') bomSettings(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBomSettings(id, b, u); }
  @Post('products/:id/bom-lines') @Roles(...CONFIGURE) addBl(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBomLine(id, null, b, u); }
  @Put('products/:id/bom-lines/:lid') @Roles(...CONFIGURE) editBl(@Param('id', ParseIntPipe) id: number, @Param('lid', ParseIntPipe) lid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBomLine(id, lid, b, u); }
  @Delete('bom-lines/:lid') @Roles(...BOM) delBl(@Param('lid', ParseIntPipe) lid: number, @CurrentUser() u: Actor) { return this.s.removeBomLine(lid, u); }
  @Post('products/:id/operations') @Roles(...CONFIGURE) addOp(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperation(id, null, b, u); }
  @Put('products/:id/operations/:oid') @Roles(...CONFIGURE) editOp(@Param('id', ParseIntPipe) id: number, @Param('oid', ParseIntPipe) oid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperation(id, oid, b, u); }
  @Delete('operations/:oid') @Roles(...BOM) delOp(@Param('oid', ParseIntPipe) oid: number, @CurrentUser() u: Actor) { return this.s.removeOperation(oid, u); }
  @Post('operation-types') @Roles(...CONFIGURE) addOpType(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperationType(null, b, u); }
  @Put('operation-types/:tid') @Roles(...CONFIGURE) editOpType(@Param('tid', ParseIntPipe) tid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveOperationType(tid, b, u); }
  @Delete('operation-types/:tid') @Roles(...CONFIGURE) delOpType(@Param('tid', ParseIntPipe) tid: number, @CurrentUser() u: Actor) { return this.s.removeOperationType(tid, u); }
  @Put('products/:id/build-plan') @Roles(...PLAN) buildPlan(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveBuildPlan(id, b, u); }
  @Put('products/:id/price') @Roles('admin', 'finance') price(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.saveProductPrice(id, b, u); }
  @Post('products/:id/standard-cost') @Roles(...PROPOSE) propose(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.proposeStandard(id, u); }
  @Post('standard-costs/:sid/approve') @Roles('admin', 'finance') approveStd(@Param('sid', ParseIntPipe) sid: number, @CurrentUser() u: Actor) { return this.s.approveStandard(sid, u); }
  @Post('standard-costs/:sid/reject') @Roles('admin', 'finance') rejectStd(@Param('sid', ParseIntPipe) sid: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.rejectStandard(sid, b, u); }
  @Post('products/:id/to-plan') @Roles(...PROPOSE) toPlan(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.buildToPlan(id, u); }

  // Changes
  @Get('changes') changes(@Query('status') status?: string) { return this.s.changes(status); }
  @Post('changes') @Roles(...PLAN) requestChange(@Body() b: any, @CurrentUser() u: Actor) { return this.s.requestChange(b, u); }
  @Post('changes/:id/decision') @Roles('admin', 'finance') decide(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: Actor) { return this.s.decideChange(id, b, u); }
  @Delete('changes/:id') @Roles(...PLAN) cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: Actor) { return this.s.cancelChange(id, u); }

  // Monthly close
  @Get('close') close(@Query('year') year: string, @Query('month') month: string) { return this.s.close(Number(year), Number(month)); }
  @Post('close/variance') @Roles(...PLAN) variance(@Body() b: any, @CurrentUser() u: Actor) { return this.s.saveVariance(b, u); }
  @Post('close/lock') @Roles('admin', 'finance') lock(@Body() b: any, @CurrentUser() u: Actor) { return this.s.lockMonth(Number(b.year), Number(b.month), u); }
  @Post('close/unlock') @Roles('admin') unlock(@Body() b: any, @CurrentUser() u: Actor) { return this.s.unlockMonth(Number(b.year), Number(b.month), u); }
}
