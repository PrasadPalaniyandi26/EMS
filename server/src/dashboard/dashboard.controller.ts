import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';
import { DashboardOverviewService } from './dashboard-overview.service';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('dashboard')
@Controller('v1/dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private service: DashboardService, private overviewService: DashboardOverviewService, private analytics: AnalyticsService) {}

  // Everything the Home page shows, in one call
  @Get('overview')
  getOverview(@CurrentUser() user: any, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.overviewService.overview(user, dateFrom, dateTo);
  }

  @Get('summary')
  getSummary(@CurrentUser('id') userId: number, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.service.getSummary(userId, dateFrom, dateTo);
  }

  @Get('by-category')
  getByCategory(@CurrentUser('id') userId: number, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.service.getByCategory(userId, dateFrom, dateTo);
  }

  @Get('monthly-trend')
  getMonthlyTrend(@CurrentUser('id') userId: number) {
    return this.service.getMonthlyTrend(userId);
  }

  @Get('recent')
  getRecent(@CurrentUser('id') userId: number) {
    return this.service.getRecent(userId);
  }

  @Get('budget-utilization')
  getBudgetUtilization(@CurrentUser('id') userId: number, @CurrentUser('role_name') roleName: string) {
    return this.service.getBudgetUtilization(userId, roleName);
  }

  @Get('approval-counts')
  getApprovalCounts(@CurrentUser('id') userId: number, @CurrentUser('role_name') roleName: string) {
    return this.service.getApprovalCounts(userId, roleName);
  }

  @Get('project-spend')
  getProjectSpend(@CurrentUser('id') userId: number, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.service.getProjectSpend(userId, dateFrom, dateTo);
  }

  @Get('analytics/top-spenders')
  getTopSpenders(@CurrentUser('id') userId: number, @CurrentUser('role_name') roleName: string, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.service.getTopSpenders(userId, roleName, dateFrom, dateTo);
  }

  @Get('analytics/category-heatmap')
  getCategoryHeatmap(@CurrentUser('id') userId: number, @CurrentUser('role_name') roleName: string, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.service.getCategoryHeatmap(userId, roleName, dateFrom, dateTo);
  }

  @Get('analytics/project-burn')
  getProjectBurn(@CurrentUser('id') userId: number, @CurrentUser('role_name') roleName: string, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.service.getProjectBurn(userId, roleName, dateFrom, dateTo);
  }

  @Get('analytics/product-burn')
  getProductBurn(@CurrentUser('id') userId: number, @CurrentUser('role_name') roleName: string, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.service.getProductBurn(userId, roleName, dateFrom, dateTo);
  }

  // The other Analytics tabs: money and margins, so Admin, Finance and Manager only
  @Get('analytics/project-profitability') @UseGuards(RolesGuard) @Roles('admin', 'finance', 'manager')
  getProjectProfitability() { return this.analytics.projectProfitability(); }

  @Get('analytics/order-delivery') @UseGuards(RolesGuard) @Roles('admin', 'finance', 'manager')
  getOrderDelivery() { return this.analytics.orderDelivery(); }

  @Get('analytics/spending-by-person') @UseGuards(RolesGuard) @Roles('admin', 'finance', 'manager')
  getSpendingByPerson(@CurrentUser('id') userId: number, @CurrentUser('role_name') roleName: string, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.analytics.spendingByPerson(userId, roleName, dateFrom, dateTo);
  }

  @Get('analytics/receivables') @UseGuards(RolesGuard) @Roles('admin', 'finance', 'manager')
  getReceivables() { return this.analytics.receivables(); }

  @Get('analytics/part-prices') @UseGuards(RolesGuard) @Roles('admin', 'finance', 'manager')
  getPartPrices(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) { return this.analytics.partPrices(dateFrom, dateTo); }
}
