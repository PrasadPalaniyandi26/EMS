import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('dashboard')
@Controller('v1/dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private service: DashboardService) {}

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
  getBudgetUtilization(@CurrentUser('id') userId: number) {
    return this.service.getBudgetUtilization(userId);
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
}
