import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InvoicingService } from './invoicing.service';
import { ClientPosController, CompanyProfileController, InvoicesController } from './invoicing.controller';

@Module({
  imports: [AuditModule],
  controllers: [CompanyProfileController, ClientPosController, InvoicesController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
