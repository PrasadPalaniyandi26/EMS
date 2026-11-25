import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { StockModule } from '../stock/stock.module';
@Module({
  imports: [AuditModule, NotificationsModule, BudgetsModule, StockModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
