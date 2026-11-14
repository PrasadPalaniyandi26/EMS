import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { BudgetsModule } from '../budgets/budgets.module';
import { ApprovalsModule } from '../approvals/approvals.module';
@Module({ imports: [BudgetsModule, ApprovalsModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
