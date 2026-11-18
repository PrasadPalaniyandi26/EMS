import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardOverviewService } from './dashboard-overview.service';
import { AnalyticsService } from './analytics.service';
import { BudgetsModule } from '../budgets/budgets.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { InvoicingModule } from '../invoicing/invoicing.module';
@Module({ imports: [BudgetsModule, ApprovalsModule, InvoicingModule], controllers: [DashboardController], providers: [DashboardService, DashboardOverviewService, AnalyticsService], exports: [DashboardService] })
export class DashboardModule {}
