import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
}
