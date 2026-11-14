import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { BudgetsModule } from '../budgets/budgets.module';
import { InvoicingModule } from '../invoicing/invoicing.module';

@Module({ imports: [BudgetsModule, InvoicingModule], controllers: [ReportingController], providers: [ReportingService] })
export class ReportingModule {}
