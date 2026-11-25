import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { BudgetsModule } from '../budgets/budgets.module';
import { InvoicingModule } from '../invoicing/invoicing.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { StockModule } from '../stock/stock.module';

@Module({ imports: [BudgetsModule, InvoicingModule, DashboardModule, StockModule], controllers: [ReportingController], providers: [ReportingService] })
export class ReportingModule {}
