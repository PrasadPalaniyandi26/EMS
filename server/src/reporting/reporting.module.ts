import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { BudgetsModule } from '../budgets/budgets.module';

@Module({ imports: [BudgetsModule], controllers: [ReportingController], providers: [ReportingService] })
export class ReportingModule {}
