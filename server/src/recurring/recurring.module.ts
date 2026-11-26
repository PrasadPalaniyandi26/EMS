import { Module } from '@nestjs/common';
import { RecurringController } from './recurring.controller';
import { RecurringService } from './recurring.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [AuditModule, NotificationsModule, ApprovalsModule],
  controllers: [RecurringController],
  providers: [RecurringService],
})
export class RecurringModule {}
