import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { CategoriesModule } from './categories/categories.module';
import { ClientsModule } from './clients/clients.module';
import { ProjectsModule } from './projects/projects.module';
import { ProductsModule } from './products/products.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BudgetsModule } from './budgets/budgets.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { RecurringModule } from './recurring/recurring.module';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    CategoriesModule,
    ClientsModule,
    ProjectsModule,
    ProductsModule,
    TransactionsModule,
    BudgetsModule,
    ApprovalsModule,
    RecurringModule,
    AuditModule,
    DashboardModule,
    ReceiptsModule,
    HealthModule,
  ],
})
export class AppModule {}
