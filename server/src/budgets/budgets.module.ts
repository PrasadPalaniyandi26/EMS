import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { BudgetPlanningController } from './budget-planning.controller';
import { BudgetPlanningService } from './budget-planning.service';
import { BuildOrdersController } from './build-orders.controller';
import { BuildOrdersService } from './build-orders.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [AuditModule, NotificationsModule], controllers: [BudgetsController, BudgetPlanningController, BuildOrdersController], providers: [BudgetsService, BudgetPlanningService, BuildOrdersService], exports: [BudgetsService] })
export class BudgetsModule {}
