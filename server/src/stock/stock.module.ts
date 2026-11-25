import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { AuditModule } from '../audit/audit.module';
import { BudgetsModule } from '../budgets/budgets.module';

@Module({ imports: [AuditModule, BudgetsModule], controllers: [StockController], providers: [StockService], exports: [StockService] })
export class StockModule {}
